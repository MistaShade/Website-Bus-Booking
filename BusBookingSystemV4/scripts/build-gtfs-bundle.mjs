import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const DEFAULT_CANDIDATES = [
  path.join(projectRoot, "data", "gtfs", "manila"),
  path.join(projectRoot, "..", "..", "..", "Downloads", "Dataset", "manila"),
  "C:/Users/Joshua/Downloads/Dataset/manila",
];

function resolveGtfsDir(cliPath) {
  if (cliPath) {
    const p = path.resolve(cliPath);
    if (!fs.existsSync(path.join(p, "routes.txt"))) {
      throw new Error(`GTFS folder not found or missing routes.txt: ${p}`);
    }
    return p;
  }
  for (const c of DEFAULT_CANDIDATES) {
    if (fs.existsSync(path.join(c, "routes.txt"))) return path.resolve(c);
  }
  throw new Error(
    "Manila GTFS folder not found. Copy feed files to data/gtfs/manila/ or pass the folder path as an argument."
  );
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function readGtfsTable(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  let headerLine = lines[0];
  if (headerLine.startsWith("fagency_id")) {
    headerLine = headerLine.replace(/^f/, "");
  }
  const headers = parseCsvLine(headerLine);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}
function readStopTimesForTrips(filePath, tripIdSet) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const comma = line.indexOf(",");
    if (comma < 0) continue;
    const tripId = line.slice(0, comma);
    if (!tripIdSet.has(tripId)) continue;
    const vals = parseCsvLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function parseRouteEndpoints(routeLongName) {
  const name = (routeLongName || "").trim();
  const viaIdx = name.toLowerCase().indexOf(" via ");
  const base = viaIdx >= 0 ? name.slice(0, viaIdx).trim() : name;

  const dashParts = base.split(/\s*-\s+/);
  if (dashParts.length === 2) {
    return {
      originLabel: dashParts[0].trim(),
      destLabel: dashParts[1].trim(),
    };
  }

  const parts = base.split(/\s+/);
  if (parts.length >= 2) {
    return {
      originLabel: parts[0],
      destLabel: parts.slice(1).join(" "),
    };
  }
  return { originLabel: base, destLabel: base };
}

function displayLabel(key, aliases) {
  if (!key) return key;
  return aliases[key] || key;
}

function buildPlaceIndex(sortedPlaces, searchAliases, placeAliases) {
  const index = {};
  const add = (place, key) => {
    if (!place || !key) return;
    if (!index[place]) index[place] = new Set();
    index[place].add(key);
  };

  for (const place of sortedPlaces) add(place, place);

  for (const [canonical, display] of Object.entries(placeAliases)) {
    if (sortedPlaces.includes(display)) add(display, canonical);
  }

  for (const [place, keys] of Object.entries(searchAliases)) {
    if (!index[place]) index[place] = new Set([place]);
    for (const k of keys) {
      index[place].add(k);
      const disp = placeAliases[k];
      if (disp && index[disp]) index[disp].add(k);
    }
  }

  return Object.fromEntries(
    Object.entries(index).map(([k, set]) => [k, [...set]])
  );
}

function parseTimeToSeconds(t) {
  const [h, m, s] = (t || "0:0:0").split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

function formatClock(seconds) {
  const h = Math.floor(seconds / 3600) % 24;
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDuration(seconds) {
  const mins = Math.max(1, Math.round(seconds / 60));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function estimateFare(durationSeconds, stopCount) {
  const minutes = durationSeconds / 60;
  const base = 28;
  const perMin = 0.35;
  const perStop = 0.4;
  return Math.round(base + minutes * perMin + stopCount * perStop);
}

function hashOccupiedSeats(seed, count = 7) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const seats = [];
  for (let n = 0; seats.length < count && n < 80; n++) {
    h = (h * 1103515245 + 12345 + n) | 0;
    const seat = (Math.abs(h) % 40) + 1;
    if (!seats.includes(seat)) seats.push(seat);
  }
  for (let s = 1; seats.length < count && s <= 40; s++) {
    if (!seats.includes(s)) seats.push(s);
  }
  return seats.sort((a, b) => a - b);
}

function main() {
  const gtfsDir = resolveGtfsDir(process.argv[2]);
  const allowlistPath = path.join(projectRoot, "data", "gtfs-allowlist.json");
  const allowlist = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
  const allowedIds = new Set(allowlist.route_ids);
  const maxPerRoute = allowlist.max_departures_per_route ?? 4;
  const sampleHours = allowlist.sample_departure_hours ?? [6, 9, 12, 16, 19];
  const placeAliases = allowlist.place_aliases || {};
  const extraPlaces = allowlist.extra_places || [];
  const searchAliases = allowlist.place_search_aliases || {};

  const routes = readGtfsTable(path.join(gtfsDir, "routes.txt"));
  const trips = readGtfsTable(path.join(gtfsDir, "trips.txt"));
  const agency = readGtfsTable(path.join(gtfsDir, "agency.txt"));
  const feedInfo = readGtfsTable(path.join(gtfsDir, "feed_info.txt"));

  const agencyById = Object.fromEntries(agency.map((a) => [a.agency_id, a.agency_name || a.agency_id]));

  const routeById = {};
  for (const r of routes) {
    if (!allowedIds.has(r.route_id)) continue;
    const { originLabel, destLabel } = parseRouteEndpoints(r.route_long_name);
    const isRail = r.route_type === "2";
    routeById[r.route_id] = {
      routeId: r.route_id,
      name: r.route_long_name,
      shortName: r.route_short_name || "",
      originLabel,
      destLabel,
      originDisplay: displayLabel(originLabel, placeAliases),
      destDisplay: displayLabel(destLabel, placeAliases),
      agency: agencyById[r.agency_id] || r.agency_id || "LTFRB",
      routeType: r.route_type,
      isRail,
    };
  }

  const tripsByRoute = {};
  const neededTripIds = new Set();
  for (const t of trips) {
    if (!routeById[t.route_id]) continue;
    if (!tripsByRoute[t.route_id]) {
      tripsByRoute[t.route_id] = t.trip_id;
      neededTripIds.add(t.trip_id);
    }
  }

  const frequencies = readGtfsTable(path.join(gtfsDir, "frequencies.txt"));
  const freqByTrip = {};
  for (const f of frequencies) {
    if (!neededTripIds.has(f.trip_id)) continue;
    if (!freqByTrip[f.trip_id]) freqByTrip[f.trip_id] = [];
    freqByTrip[f.trip_id].push(f);
  }

  const stopTimes = readStopTimesForTrips(
    path.join(gtfsDir, "stop_times.txt"),
    neededTripIds
  );
  const stopTimesByTrip = {};
  for (const st of stopTimes) {
    if (!stopTimesByTrip[st.trip_id]) stopTimesByTrip[st.trip_id] = [];
    stopTimesByTrip[st.trip_id].push(st);
  }
  for (const tid of Object.keys(stopTimesByTrip)) {
    stopTimesByTrip[tid].sort(
      (a, b) => Number(a.stop_sequence) - Number(b.stop_sequence)
    );
  }

  const places = new Set(extraPlaces);
  const departures = [];
  let nextId = 1;

  for (const routeId of allowlist.route_ids) {
    const route = routeById[routeId];
    if (!route) continue;
    places.add(route.originDisplay);
    places.add(route.destDisplay);

    const tripId = tripsByRoute[routeId];
    if (!tripId) continue;

    const sts = stopTimesByTrip[tripId];
    if (!sts?.length) continue;

    const first = sts[0];
    const last = sts[sts.length - 1];
    const durationSec =
      parseTimeToSeconds(last.arrival_time || last.departure_time) -
      parseTimeToSeconds(first.departure_time || first.arrival_time);
    const stopCount = sts.length;

    const freqs = freqByTrip[tripId] || [];
    const departSeconds = new Set();

    for (const hour of sampleHours) {
      const target = hour * 3600;
      for (const f of freqs) {
        const start = parseTimeToSeconds(f.start_time);
        const end = parseTimeToSeconds(f.end_time);
        if (target >= start && target <= end) {
          departSeconds.add(target);
          break;
        }
      }
    }

    if (!departSeconds.size && freqs.length) {
      const f = freqs[0];
      departSeconds.add(parseTimeToSeconds(f.start_time));
      const mid =
        (parseTimeToSeconds(f.start_time) + parseTimeToSeconds(f.end_time)) / 2;
      departSeconds.add(Math.floor(mid));
    }

    if (!departSeconds.size) {
      departSeconds.add(8 * 3600);
      departSeconds.add(14 * 3600);
    }

    const picked = [...departSeconds].sort((a, b) => a - b).slice(0, maxPerRoute);
    const adultFare = estimateFare(durationSec, stopCount);
    const childFare = Math.round(adultFare * 0.65);

    for (const depSec of picked) {
      const arrSec = depSec + durationSec;
      const id = nextId++;
      const routeLabel = `${route.originDisplay} → ${route.destDisplay}`;
      const serviceName = route.isRail
        ? `${route.shortName || route.agency} · ${route.name}`
        : `${route.agency} · ${route.name}`;
      departures.push({
        id,
        routeId: route.routeId,
        tripId,
        route: routeLabel,
        busName: serviceName,
        originLabel: route.originLabel,
        destLabel: route.destLabel,
        originDisplay: route.originDisplay,
        destDisplay: route.destDisplay,
        seatsAvailable: 20 + (id % 18),
        departTime: formatClock(depSec),
        arriveTime: formatClock(arrSec),
        duration: formatDuration(durationSec),
        adultFare,
        childFare,
        occupiedSeats: hashOccupiedSeats(`${routeId}-${tripId}-${depSec}`),
      });
    }
  }

  const sortedPlaces = [...places].sort((a, b) => a.localeCompare(b));
  const placeIndex = buildPlaceIndex(sortedPlaces, searchAliases, placeAliases);

  const output = {
    meta: {
      source: feedInfo[0]?.feed_publisher_name || "GTFS",
      publisherUrl: feedInfo[0]?.feed_publisher_url || "",
      builtAt: new Date().toISOString(),
      gtfsPath: gtfsDir,
      routeCount: Object.keys(routeById).length,
      departureCount: departures.length,
      placeCount: sortedPlaces.length,
    },
    places: sortedPlaces,
    placeIndex,
    routes: Object.values(routeById),
    departures,
  };

  const outPath = path.join(projectRoot, "data", "manila-transit.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(
    `  ${output.meta.routeCount} routes, ${output.meta.departureCount} departures, ${output.places.length} places`
  );
  console.log(`  GTFS source: ${gtfsDir}`);
  console.log(
    "  Next: node scripts/generate-transit-seed-sql.mjs → run supabase/seed-transit.sql in Supabase"
  );
}

main();
