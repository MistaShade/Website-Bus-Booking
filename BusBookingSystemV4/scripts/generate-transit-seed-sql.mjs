import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const jsonPath = path.join(projectRoot, "data", "manila-transit.json");
const outPath = path.join(projectRoot, "supabase", "seed-transit.sql");

function sqlStr(s) {
  if (s == null) return "null";
  return `'${String(s).replace(/'/g, "''")}'`;
}

function sqlArray(arr) {
  if (!arr?.length) return "ARRAY[]::text[]";
  return `ARRAY[${arr.map((x) => sqlStr(x)).join(", ")}]::text[]`;
}

function sqlIntArray(arr) {
  if (!arr?.length) return "ARRAY[]::int[]";
  return `ARRAY[${arr.map(Number).join(", ")}]::int[]`;
}

function main() {
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const lines = [
    "-- GoBus transit seed (auto-generated from data/manila-transit.json)",
    "-- Run in Supabase → SQL Editor AFTER transit-catalog.sql",
    "",
    "truncate table public.transit_departures cascade;",
    "truncate table public.transit_places cascade;",
    "truncate table public.transit_routes cascade;",
    "truncate table public.transit_meta cascade;",
    "",
  ];

  const m = data.meta || {};
  lines.push(
    `insert into public.transit_meta (id, source, publisher_url, built_at, route_count, departure_count, place_count)`,
    `values (1, ${sqlStr(m.source)}, ${sqlStr(m.publisherUrl)}, ${m.builtAt ? sqlStr(m.builtAt) : "now()"}, ${m.routeCount || 0}, ${m.departureCount || 0}, ${m.placeCount || 0});`,
    ""
  );

  const places = data.places || [];
  const placeIndex = data.placeIndex || {};
  if (places.length) {
    lines.push("insert into public.transit_places (label, search_keys, sort_order) values");
    lines.push(
      places
        .map((label, i) => {
          const keys = placeIndex[label] || [label];
          return `  (${sqlStr(label)}, ${sqlArray(keys)}, ${i + 1})`;
        })
        .join(",\n") + ";",
      ""
    );
  }

  const routes = data.routes || [];
  if (routes.length) {
    lines.push(
      "insert into public.transit_routes (route_id, name, short_name, origin_label, dest_label, origin_display, dest_display, agency, route_type, is_rail) values"
    );
    lines.push(
      routes
        .map(
          (r) =>
            `  (${sqlStr(r.routeId)}, ${sqlStr(r.name)}, ${sqlStr(r.shortName || "")}, ${sqlStr(r.originLabel)}, ${sqlStr(r.destLabel)}, ${sqlStr(r.originDisplay)}, ${sqlStr(r.destDisplay)}, ${sqlStr(r.agency)}, ${sqlStr(r.routeType)}, ${r.isRail ? "true" : "false"})`
        )
        .join(",\n") + ";",
      ""
    );
  }

  const deps = data.departures || [];
  if (deps.length) {
    lines.push(
      "insert into public.transit_departures (id, route_id, trip_id, route_line, bus_name, origin_label, dest_label, origin_display, dest_display, seats_available, depart_time, arrive_time, duration, adult_fare, child_fare, occupied_seats) values"
    );
    lines.push(
      deps
        .map(
          (d) =>
            `  (${d.id}, ${sqlStr(d.routeId)}, ${sqlStr(d.tripId)}, ${sqlStr(d.route)}, ${sqlStr(d.busName)}, ${sqlStr(d.originLabel)}, ${sqlStr(d.destLabel)}, ${sqlStr(d.originDisplay)}, ${sqlStr(d.destDisplay)}, ${d.seatsAvailable}, ${sqlStr(d.departTime)}, ${sqlStr(d.arriveTime)}, ${sqlStr(d.duration)}, ${d.adultFare}, ${d.childFare}, ${sqlIntArray(d.occupiedSeats)})`
        )
        .join(",\n") + ";",
      ""
    );
  }

  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(
    `  ${places.length} places, ${routes.length} routes, ${deps.length} departures`
  );
}

main();
