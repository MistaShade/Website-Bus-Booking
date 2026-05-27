(function (global) {
  const JSON_FALLBACK_URL = "data/manila-transit.json";

  let state = {
    ready: false,
    loading: null,
    error: null,
    source: null,
    places: [],
    placeIndex: {},
    routes: [],
    departures: [],
    meta: null,
  };

  function normalizePlace(s) {
    return (s || "").trim().toLowerCase();
  }

  function keysForPlace(selected) {
    const fromIndex = state.placeIndex[selected];
    if (fromIndex?.length) return fromIndex;
    return [selected];
  }

  function placeMatchesTripEnd(trip, selected, end) {
    const keys = keysForPlace(selected).map(normalizePlace);
    const labels =
      end === "origin"
        ? [trip.originLabel, trip.originDisplay]
        : [trip.destLabel, trip.destDisplay];
    const normalized = labels.map(normalizePlace).filter(Boolean);

    return keys.some((k) =>
      normalized.some(
        (n) => n === k || n.startsWith(k) || k.startsWith(n) || n.includes(k)
      )
    );
  }

  function applyBundle(data, sourceLabel) {
    state.places = data.places || [];
    state.placeIndex = data.placeIndex || {};
    state.routes = data.routes || [];
    state.departures = data.departures || [];
    state.meta = data.meta || null;
    state.source = sourceLabel;
    state.ready = true;
    state.error = null;
  }

  function buildPlaceIndexFromRows(placeRows) {
    const index = {};
    for (const row of placeRows) {
      index[row.label] = row.search_keys?.length ? row.search_keys : [row.label];
    }
    return index;
  }

  function mapDepartureRow(row) {
    return {
      id: row.id,
      routeId: row.route_id,
      tripId: row.trip_id,
      route: row.route_line,
      busName: row.bus_name,
      originLabel: row.origin_label,
      destLabel: row.dest_label,
      originDisplay: row.origin_display,
      destDisplay: row.dest_display,
      seatsAvailable: row.seats_available,
      departTime: row.depart_time,
      arriveTime: row.arrive_time,
      duration: row.duration,
      adultFare: Number(row.adult_fare),
      childFare: Number(row.child_fare),
      occupiedSeats: row.occupied_seats || [],
    };
  }

  async function loadFromSupabase() {
    const supabase = global.supabaseClient;
    if (!supabase) return false;

    const [metaRes, placesRes, depsRes] = await Promise.all([
      supabase.from("transit_meta").select("*").eq("id", 1).maybeSingle(),
      supabase
        .from("transit_places")
        .select("label, search_keys")
        .order("sort_order", { ascending: true }),
      supabase.from("transit_departures").select("*").order("id", { ascending: true }),
    ]);

    const err =
      metaRes.error?.message ||
      placesRes.error?.message ||
      depsRes.error?.message;
    if (err) throw new Error(err);

    const places = placesRes.data || [];
    const departures = (depsRes.data || []).map(mapDepartureRow);
    if (!places.length || !departures.length) {
      return false;
    }

    const metaRow = metaRes.data;
    state.places = places.map((p) => p.label);
    state.placeIndex = buildPlaceIndexFromRows(places);
    state.departures = departures;
    state.routes = [];
    state.meta = metaRow
      ? {
          source: metaRow.source,
          publisherUrl: metaRow.publisher_url,
          builtAt: metaRow.built_at,
          routeCount: metaRow.route_count,
          departureCount: metaRow.departure_count,
          placeCount: metaRow.place_count,
        }
      : {
          source: "Supabase",
          departureCount: departures.length,
          placeCount: places.length,
        };
    state.source = "supabase";
    state.ready = true;
    state.error = null;
    return true;
  }

  async function loadFromJson() {
    const res = await fetch(JSON_FALLBACK_URL, { cache: "no-cache" });
    if (!res.ok) {
      throw new Error(
        `Could not load ${JSON_FALLBACK_URL} (${res.status}). Run: node scripts/build-gtfs-bundle.mjs`
      );
    }
    const data = await res.json();
    applyBundle(data, "json");
    return true;
  }

  async function loadGtfsData() {
    if (state.ready) return state;
    if (state.loading) return state.loading;

    state.loading = (async () => {
      try {
        if (global.supabaseClient) {
          try {
            const ok = await loadFromSupabase();
            if (ok) return state;
          } catch (supaErr) {
            console.warn("[gtfsData] Supabase load failed, trying JSON:", supaErr);
          }
        }
        await loadFromJson();
      } catch (err) {
        state.error = err.message || String(err);
        state.ready = false;
        console.error("[gtfsData]", state.error);
      }
      return state;
    })();

    await state.loading;
    state.loading = null;
    return state;
  }

  function getPlaces() {
    return [...state.places];
  }

  function getDeparturesForSearch(origin, destination) {
    if (!state.ready) return [];
    const o = (origin || "").trim();
    const d = (destination || "").trim();
    if (!o || !d) return [];

    return state.departures.filter((trip) => {
      const forward =
        placeMatchesTripEnd(trip, o, "origin") &&
        placeMatchesTripEnd(trip, d, "dest");
      const reverse =
        placeMatchesTripEnd(trip, d, "origin") &&
        placeMatchesTripEnd(trip, o, "dest");
      return forward || reverse;
    });
  }

  function getOccupiedSeatsForTrip(tripId) {
    const trip = state.departures.find((t) => t.id === tripId);
    return trip?.occupiedSeats || [1, 5, 9, 14, 22, 30, 38];
  }

  function populatePlaceSelects(originSelect, destinationSelect) {
    if (!originSelect || !destinationSelect) return;

    const places = getPlaces();
    const originValue = originSelect.value;
    const destValue = destinationSelect.value;

    const escapeHtml = (s) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/"/g, "&quot;");

    const optionHtml = (label, selected) =>
      `<option value="${escapeHtml(label)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;

    originSelect.innerHTML =
      '<option value="">Select area</option>' +
      places.map((p) => optionHtml(p, p === originValue)).join("");

    destinationSelect.innerHTML =
      '<option value="">Select area</option>' +
      places.map((p) => optionHtml(p, p === destValue)).join("");
  }

  function getMeta() {
    return state.meta;
  }

  function getDataSource() {
    return state.source;
  }

  function isReady() {
    return state.ready;
  }

  function getLoadError() {
    return state.error;
  }

  function formatSearchHelpMessage(meta) {
    if (!meta) {
      return "Choose your departure date, then select origin and destination to view available routes.";
    }
    const areas = meta.placeCount ?? meta.routeCount ?? 0;
    const departures = meta.departureCount ?? 0;
    const areaLabel = areas === 1 ? "area" : "areas";
    const departureLabel = departures === 1 ? "departure" : "departures";
    return `${areas} ${areaLabel} and ${departures} ${departureLabel} available. Select origin and destination.`;
  }

  global.gtfsData = {
    loadGtfsData,
    getPlaces,
    getDeparturesForSearch,
    getOccupiedSeatsForTrip,
    populatePlaceSelects,
    getMeta,
    getDataSource,
    isReady,
    getLoadError,
    formatSearchHelpMessage,
  };
})(window);
