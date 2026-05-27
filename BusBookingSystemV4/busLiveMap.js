(function (global) {
  const MAP_CONTAINER_ID = "live-bus-map";
  const STATUS_ID = "live-map-status";
  const DB_SYNC_MS = 120000;
  const BOARDING_LEAD_MIN = 45;

  let map = null;
  let routeLine = null;
  let routeGlowLine = null;
  let routeLatLngs = [];
  let routeLengthKm = 1;
  let endpointLayer = null;
  let busLayer = null;
  let realtimeChannel = null;
  let refreshTimer = null;
  let driveAnimFrame = null;
  let activeTrips = [];
  let travelDateStr = "";
  let selectedDepartureId = null;

  const busMarkers = new Map();
  const busSimState = new Map();
  const busNamesFromDb = new Map();

  const BUS_SVG = `<svg class="bus-marker-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path fill="currentColor" d="M4 16c0 1.1.9 2 2 2h1v2h2v-2h6v2h2v-2h1c1.1 0 2-.9 2-2V8l-2.5-5H6.5L4 8v8zm3.5-6h9l1.2 3H6.3l1.2-3zM7 15.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm10 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>
  </svg>`;

  function getSupabase() {
    return global.supabaseClient || null;
  }

  function setStatus(text, isError) {
    const el = document.getElementById(STATUS_ID);
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("live-map-status--error", Boolean(isError));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function updateRouteLength() {
    if (routeLatLngs.length < 2) {
      routeLengthKm = 1;
      return;
    }
    const a = routeLatLngs[0];
    const b = routeLatLngs[routeLatLngs.length - 1];
    routeLengthKm = Math.max(0.5, haversineKm(a.lat, a.lng, b.lat, b.lng));
  }

  function interpolateRoute(t) {
    if (routeLatLngs.length < 2) return null;
    const a = routeLatLngs[0];
    const b = routeLatLngs[routeLatLngs.length - 1];
    return {
      lat: lerp(a.lat, b.lat, t),
      lng: lerp(a.lng, b.lng, t),
    };
  }

  function parseClockToMinutes(timeStr) {
    const raw = String(timeStr || "").trim();
    const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampm) {
      let h = parseInt(ampm[1], 10);
      const m = parseInt(ampm[2], 10);
      const pm = ampm[3].toUpperCase() === "PM";
      if (pm && h !== 12) h += 12;
      if (!pm && h === 12) h = 0;
      return h * 60 + m;
    }
    const match = raw.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }

  function parseDurationToMinutes(durationStr) {
    const s = String(durationStr || "");
    let mins = 0;
    const h = s.match(/(\d+)\s*h/i);
    const m = s.match(/(\d+)\s*m/i);
    if (h) mins += Number(h[1]) * 60;
    if (m) mins += Number(m[1]);
    return mins > 0 ? mins : null;
  }

  function startOfLocalDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function parseTravelDate(dateStr) {
    if (!dateStr || dateStr === "N/A") return null;
    const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    }
    const slash = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
      return new Date(
        Number(slash[3]),
        Number(slash[1]) - 1,
        Number(slash[2])
      );
    }
    const parsed = new Date(dateStr);
    return Number.isNaN(parsed.getTime()) ? null : startOfLocalDay(parsed);
  }

  function getNowMinutesHighRes() {
    const now = new Date();
    return (
      now.getHours() * 60 +
      now.getMinutes() +
      now.getSeconds() / 60 +
      now.getMilliseconds() / 60000
    );
  }

  function formatMinutesAsClock(totalMinutes) {
    const m = Math.max(0, Math.floor(totalMinutes));
    const h24 = Math.floor(m / 60) % 24;
    const min = m % 60;
    const h12 = h24 % 12 || 12;
    const ampm = h24 < 12 ? "AM" : "PM";
    return `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
  }

  function getScheduleClock() {
    const travelDay = parseTravelDate(travelDateStr);
    const today = startOfLocalDay(new Date());
    const nowMinutes = getNowMinutesHighRes();

    if (!travelDay) {
      return { dayMode: "today", nowMinutes };
    }

    const travelStart = travelDay.getTime();
    const todayStart = today.getTime();

    if (travelStart < todayStart) {
      return { dayMode: "past", nowMinutes: 24 * 60 };
    }

    if (travelStart > todayStart) {
      return {
        dayMode: "upcoming",
        nowMinutes,
      };
    }

    return { dayMode: "today", nowMinutes };
  }

  function getTripSchedule(trip) {
    const departMin = parseClockToMinutes(trip.departTime);
    if (departMin == null) return null;

    let arriveMin = parseClockToMinutes(trip.arriveTime);
    const durationMin = parseDurationToMinutes(trip.duration);

    if (arriveMin == null && durationMin) {
      arriveMin = departMin + durationMin;
    }
    if (arriveMin == null) {
      arriveMin = departMin + 60;
    }
    if (arriveMin <= departMin) {
      arriveMin += 24 * 60;
    }

    return {
      departMin,
      arriveMin,
      durationMin: arriveMin - departMin,
    };
  }

  function computeTripState(trip) {
    const schedule = getTripSchedule(trip);
    const id = Number(trip.id);
    const slot = ((id % 9) - 4) * 0.003;

    if (!schedule) {
      return {
        phase: "waiting",
        progress: 0.02 + slot,
        moving: false,
        statusLine: "Scheduled · time unknown",
      };
    }

    const { departMin, arriveMin } = schedule;
    const { dayMode, nowMinutes } = getScheduleClock();

    if (dayMode === "past" || nowMinutes >= arriveMin) {
      return {
        phase: "arrived",
        progress: 0.97 - Math.abs(slot) * 0.4,
        moving: false,
        statusLine: `Arrived · ${trip.arriveTime}`,
      };
    }

    if (nowMinutes < departMin - BOARDING_LEAD_MIN) {
      return {
        phase: "waiting",
        progress: 0.02 + Math.abs(slot),
        moving: false,
        statusLine: `At origin · departs ${trip.departTime}`,
      };
    }

    if (nowMinutes < departMin) {
      return {
        phase: "boarding",
        progress: 0.04 + Math.abs(slot) * 0.6,
        moving: false,
        statusLine: `Boarding passengers · ${trip.departTime}`,
      };
    }

    const span = Math.max(1, arriveMin - departMin);
    const enRouteT = (nowMinutes - departMin) / span;
    const progress = 0.06 + enRouteT * 0.88;

    return {
      phase: "in_transit",
      progress: Math.min(0.94, Math.max(0.06, progress)),
      moving: true,
      statusLine: `En route · arrives ${trip.arriveTime}`,
    };
  }

  function applyMarkerOffset(pos, tripId) {
    if (!pos || routeLatLngs.length < 2) return pos;
    const a = routeLatLngs[0];
    const b = routeLatLngs[routeLatLngs.length - 1];
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const slot = ((tripId % 9) - 4) * 0.00014;
    return { lat: pos.lat + py * slot, lng: pos.lng + px * slot };
  }

  function bearingAlongRoute(direction) {
    if (routeLatLngs.length < 2) return 0;
    const a = routeLatLngs[0];
    const b = routeLatLngs[routeLatLngs.length - 1];
    const dy = b.lat - a.lat;
    const dx = b.lng - a.lng;
    let deg = (Math.atan2(dx, dy) * 180) / Math.PI;
    if (direction < 0) deg += 180;
    return ((deg % 360) + 360) % 360;
  }

  function stopDriveLoop() {
    if (driveAnimFrame) {
      cancelAnimationFrame(driveAnimFrame);
      driveAnimFrame = null;
    }
  }

  function startDriveLoop() {
    stopDriveLoop();
    if (!busLayer || routeLatLngs.length < 2 || busSimState.size === 0) return;

    function frame() {
      busSimState.forEach((sim, id) => {
        const trip = sim.trip;
        if (!trip) return;

        const state = computeTripState(trip);
        sim.phase = state.phase;
        sim.progress = state.progress;
        sim.moving = state.moving;
        sim.statusLine = state.statusLine;

        const raw = interpolateRoute(sim.progress);
        const pos = applyMarkerOffset(raw, id);
        const marker = busMarkers.get(id);
        if (!marker || !pos) return;

        marker.setLatLng([pos.lat, pos.lng]);
        const selected = selectedDepartureId === id;
        marker.setIcon(
          busIcon(selected, bearingAlongRoute(1), state.phase, id)
        );

        if (selected && marker.isPopupOpen()) {
          marker.setPopupContent(busPopupHtml(trip, sim));
        }
      });

      driveAnimFrame = requestAnimationFrame(frame);
    }

    driveAnimFrame = requestAnimationFrame(frame);
  }

  function ensureMap() {
    const container = document.getElementById(MAP_CONTAINER_ID);
    if (!container || map) return container;

    if (!global.L) {
      setStatus("Map library did not load.", true);
      return null;
    }

    map = global.L.map(container, {
      scrollWheelZoom: true,
      zoomControl: true,
      zoomAnimation: true,
      fadeAnimation: true,
    }).setView([14.5995, 121.0369], 11);

    global.L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      {
        attribution:
          "&copy; OpenStreetMap &copy; <a href='https://carto.com/attributions'>CARTO</a>",
        subdomains: "abcd",
        maxZoom: 19,
      }
    ).addTo(map);

    endpointLayer = global.L.layerGroup().addTo(map);
    busLayer = global.L.layerGroup().addTo(map);

    return container;
  }

  function getTripColor(tripId) {
    return (
      global.busTripColors?.getBusColor(tripId) || {
        hex: "#1565c0",
        label: "Bus",
      }
    );
  }

  function busIcon(selected, heading, phase, tripId) {
    const deg =
      heading != null && !Number.isNaN(Number(heading)) ? Number(heading) : 0;
    const color = getTripColor(tripId);
    const phaseClass =
      phase === "waiting" || phase === "boarding"
        ? " bus-marker--idle"
        : phase === "arrived"
          ? " bus-marker--arrived"
          : "";
    const cls = selected
      ? `bus-marker bus-marker--selected${phaseClass}`
      : `bus-marker${phaseClass}`;
    return global.L.divIcon({
      className: cls,
      html: `<span class="bus-marker-wrap" style="--bus-heading:${deg}deg; --bus-color:${color.hex}">
        <span class="bus-marker-color-chip"></span>
        <span class="bus-marker-ring"></span>
        <span class="bus-marker-ring bus-marker-ring--delay"></span>
        ${BUS_SVG}
      </span>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  }

  function endpointIcon(kind) {
    const label = kind === "dest" ? "B" : "A";
    const cls =
      kind === "dest"
        ? "map-endpoint map-endpoint--dest"
        : "map-endpoint map-endpoint--origin";
    return global.L.divIcon({
      className: cls,
      html: `<span class="map-endpoint-inner"><span class="map-endpoint-pulse"></span><span class="map-endpoint-label">${label}</span></span>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }

  function busDisplayName(trip) {
    return busNamesFromDb.get(Number(trip.id)) || trip.busName || "Bus";
  }

  function busPopupHtml(trip, sim) {
    const busName = busDisplayName(trip);
    if (global.busTripColors?.buildTripDescriptionHtml) {
      return global.busTripColors.buildTripDescriptionHtml(
        { ...trip, busName },
        { statusLine: sim?.statusLine || "", busName }
      );
    }
    return `<div class="map-popup"><strong>${busName}</strong></div>`;
  }

  function initBusSim(trip) {
    const id = Number(trip.id);
    const state = computeTripState(trip);
    busSimState.set(id, {
      trip,
      phase: state.phase,
      progress: state.progress,
      moving: state.moving,
      statusLine: state.statusLine,
    });
  }

  function clearBusMarkers() {
    stopDriveLoop();
    busSimState.clear();
    busMarkers.forEach((marker) => busLayer.removeLayer(marker));
    busMarkers.clear();
  }

  function upsertBusMarker(trip) {
    if (!busLayer || !trip?.id) return;

    const id = Number(trip.id);
    if (!busSimState.has(id)) initBusSim(trip);
    else busSimState.get(id).trip = trip;

    const sim = busSimState.get(id);
    const state = computeTripState(trip);
    sim.phase = state.phase;
    sim.progress = state.progress;
    sim.moving = state.moving;
    sim.statusLine = state.statusLine;

    const raw = interpolateRoute(state.progress);
    const pos = applyMarkerOffset(raw, id);
    if (!pos) return;

    const selected = selectedDepartureId === id;
    const heading = bearingAlongRoute(1);

    let marker = busMarkers.get(id);
    if (marker) {
      marker.setPopupContent(busPopupHtml(trip, sim));
      marker.setIcon(busIcon(selected, heading, state.phase, id));
      marker.setLatLng([pos.lat, pos.lng]);
    } else {
      marker = global.L.marker([pos.lat, pos.lng], {
        icon: busIcon(selected, heading, state.phase, id),
        zIndexOffset: selected ? 1000 : state.moving ? 400 : 200,
      }).bindPopup(busPopupHtml(trip, sim), {
        className: "map-popup-leaflet",
        maxWidth: 320,
      });
      marker.on("click", () => {
        highlightDepartureCard(id);
        marker.openPopup();
      });
      busLayer.addLayer(marker);
      busMarkers.set(id, marker);
    }
  }

  function summarizeFleetStatus() {
    const counts = { waiting: 0, boarding: 0, in_transit: 0, arrived: 0 };
    busSimState.forEach((sim) => {
      const p = sim.phase || "waiting";
      if (counts[p] != null) counts[p] += 1;
    });
    const parts = [];
    if (counts.in_transit) parts.push(`${counts.in_transit} en route (moving)`);
    if (counts.boarding) parts.push(`${counts.boarding} boarding`);
    if (counts.waiting) parts.push(`${counts.waiting} at origin`);
    if (counts.arrived) parts.push(`${counts.arrived} arrived`);
    const clock = getScheduleClock();
    const timeBit = formatMinutesAsClock(clock.nowMinutes);
    const dayBit =
      clock.dayMode === "past"
        ? " · trip day finished"
        : clock.dayMode === "upcoming"
          ? " · preview for travel date"
          : " · live by schedule";
    return `${parts.length ? parts.join(" · ") : "On map"} · ${timeBit}${dayBit}`;
  }

  function highlightDepartureCard(departureId) {
    selectedDepartureId = departureId;
    document.querySelectorAll(".departure-card").forEach((card) => {
      card.classList.toggle(
        "departure-card--map-selected",
        Number(card.dataset.id) === departureId
      );
    });
    busMarkers.forEach((marker, id) => {
      const sim = busSimState.get(id);
      marker.setIcon(
        busIcon(
          id === departureId,
          bearingAlongRoute(1),
          sim?.phase,
          id
        )
      );
      marker.setZIndexOffset(id === departureId ? 1000 : sim?.moving ? 400 : 200);
    });
  }

  function clearRouteLines() {
    routeLatLngs = [];
    routeLengthKm = 1;
    if (routeGlowLine) {
      map.removeLayer(routeGlowLine);
      routeGlowLine = null;
    }
    if (routeLine) {
      map.removeLayer(routeLine);
      routeLine = null;
    }
  }

  function drawRouteEndpoints(originLabel, destLabel, placeRows) {
    if (!endpointLayer) return;

    endpointLayer.clearLayers();
    clearRouteLines();

    const byLabel = new Map((placeRows || []).map((p) => [p.label, p]));
    const o = byLabel.get(originLabel);
    const d = byLabel.get(destLabel);

    if (o) {
      const lat = Number(o.latitude);
      const lng = Number(o.longitude);
      routeLatLngs.push({ lat, lng });
      global.L.marker([lat, lng], { icon: endpointIcon("origin") })
        .bindPopup(`<strong>Origin</strong><br>${originLabel}`)
        .addTo(endpointLayer);
    }

    if (d) {
      const lat = Number(d.latitude);
      const lng = Number(d.longitude);
      routeLatLngs.push({ lat, lng });
      global.L.marker([lat, lng], { icon: endpointIcon("dest") })
        .bindPopup(`<strong>Destination</strong><br>${destLabel}`)
        .addTo(endpointLayer);
    }

    updateRouteLength();

    if (routeLatLngs.length === 2) {
      const latlngs = routeLatLngs.map((p) => [p.lat, p.lng]);

      routeGlowLine = global.L.polyline(latlngs, {
        className: "live-route-glow",
        color: "#42a5f5",
        weight: 10,
        opacity: 0.25,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);

      routeLine = global.L.polyline(latlngs, {
        className: "live-route-line",
        color: "#1565c0",
        weight: 4,
        opacity: 0.9,
        dashArray: "12 14",
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);
    }
  }

  function fitMapToTrips() {
    if (!map) return;
    const bounds = [];
    routeLatLngs.forEach((p) => bounds.push([p.lat, p.lng]));
    busMarkers.forEach((marker) => {
      const ll = marker.getLatLng();
      bounds.push([ll.lat, ll.lng]);
    });
    if (bounds.length) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13, animate: true });
    }
  }

  async function fetchPlaceCoords(labels) {
    const supabase = getSupabase();
    if (!supabase || !labels.length) return [];

    const { data, error } = await supabase
      .from("transit_place_coords")
      .select("label, latitude, longitude")
      .in("label", labels);

    if (error) {
      console.warn("[busLiveMap] place coords:", error.message);
      return [];
    }
    return data || [];
  }

  async function fetchBusNames(departureIds) {
    const supabase = getSupabase();
    if (!supabase || !departureIds.length) return;

    const { data, error } = await supabase
      .from("bus_locations")
      .select("departure_id, bus_name")
      .in("departure_id", departureIds);

    if (error) return;
    busNamesFromDb.clear();
    (data || []).forEach((row) => {
      if (row.bus_name) busNamesFromDb.set(Number(row.departure_id), row.bus_name);
    });
  }

  function subscribeRealtime() {
    const supabase = getSupabase();
    if (!supabase) return;
    teardownRealtime();

    realtimeChannel = supabase
      .channel("bus-locations-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bus_locations" },
        (payload) => {
          const row = payload.new || payload.old;
          if (!row?.departure_id) return;
          const id = Number(row.departure_id);
          if (!activeTrips.some((t) => Number(t.id) === id)) return;

          if (payload.eventType === "DELETE") {
            busNamesFromDb.delete(id);
          } else if (row.bus_name) {
            busNamesFromDb.set(id, row.bus_name);
            const marker = busMarkers.get(id);
            const trip = activeTrips.find((t) => Number(t.id) === id);
            const sim = busSimState.get(id);
            if (marker && trip) marker.setPopupContent(busPopupHtml(trip, sim));
          }
        }
      )
      .subscribe();
  }

  function startDbSyncLoop() {
    stopDbSyncLoop();
    refreshTimer = global.setInterval(() => {
      const ids = activeTrips.map((t) => Number(t.id)).filter(Boolean);
      fetchBusNames(ids).catch(() => {});
    }, DB_SYNC_MS);
  }

  function stopDbSyncLoop() {
    if (refreshTimer) {
      global.clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function teardownRealtime() {
    const supabase = getSupabase();
    if (realtimeChannel && supabase) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  async function update(context) {
    stopDbSyncLoop();
    teardownRealtime();
    stopDriveLoop();

    activeTrips = context.trips || [];
    travelDateStr = context.travelDate || "";
    selectedDepartureId = null;
    busNamesFromDb.clear();

    const origin = context.origin || "";
    const destination = context.destination || "";
    const departureIds = activeTrips.map((t) => Number(t.id)).filter(Boolean);

    const panel = document.getElementById("live-map-panel");
    if (panel) {
      panel.classList.remove("hidden");
      panel.classList.add("live-map-panel--enter");
      global.setTimeout(() => panel.classList.remove("live-map-panel--enter"), 600);
    }

    if (!ensureMap()) return;

    if (!activeTrips.length) {
      clearBusMarkers();
      setStatus("No departures to show on the map.");
      return;
    }

    setStatus("Loading route…");

    const placeRows = await fetchPlaceCoords(
      [...new Set([origin, destination].filter(Boolean))]
    );
    drawRouteEndpoints(origin, destination, placeRows);

    await fetchBusNames(departureIds);

    clearBusMarkers();
    activeTrips.forEach((trip) => upsertBusMarker(trip));

    if (routeLatLngs.length < 2) {
      setStatus("Route coordinates missing for this search.", true);
    } else {
      startDriveLoop();
      subscribeRealtime();
      startDbSyncLoop();
      setStatus(summarizeFleetStatus());
    }

    fitMapToTrips();
    requestAnimationFrame(() => map?.invalidateSize());
  }

  function hide() {
    const panel = document.getElementById("live-map-panel");
    if (panel) panel.classList.add("hidden");
    stopDbSyncLoop();
    stopDriveLoop();
    teardownRealtime();
    clearBusMarkers();
    clearRouteLines();
    activeTrips = [];
    travelDateStr = "";
  }

  function highlightTrip(departureId) {
    highlightDepartureCard(departureId);
    const marker = busMarkers.get(departureId);
    if (marker && map) {
      map.panTo(marker.getLatLng(), { animate: true, duration: 0.6 });
      marker.openPopup();
    }
  }

  global.busLiveMap = {
    update,
    hide,
    highlightTrip,
    invalidateSize() {
      map?.invalidateSize();
    },
  };
})(window);
