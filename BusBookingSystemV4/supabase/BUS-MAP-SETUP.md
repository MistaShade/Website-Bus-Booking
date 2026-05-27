# Live bus map (Supabase GPS)

Supabase project: **[https://ilnchdtewkdukehcvczx.supabase.co](https://ilnchdtewkdukehcvczx.supabase.co)**

## One-time setup (SQL Editor)

Run in this order:

1. `transit-catalog.sql` + `seed-transit.sql` (if not done)
2. `**bus-locations.sql`**
3. `**seed-bus-locations.sql**`

## Realtime

If markers do not move live:

1. Supabase Dashboard → **Database** → **Replication**
2. Enable `**bus_locations`** for Realtime

## How it works in the app

- Map appears **after Find Departures** (Option A), next to the results list.
- Positions load from `bus_locations` and refresh via Supabase Realtime.
- Every 15 seconds the app calls `refresh_bus_locations_demo()` so buses move along the route (demo GPS).

## If you already created a different table name

Rename it to match, or tell your developer to point `busLiveMap.js` at your table. This repo expects `**bus_locations`** with columns: `departure_id`, `route_id`, `bus_name`, `latitude`, `longitude`, `speed_kph`, `updated_at`.