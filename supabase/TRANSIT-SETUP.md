# Transit catalog in Supabase

GoBus loads **places** and **departures** from your Supabase project first, then falls back to `data/manila-transit.json` if the tables are empty or unreachable.

## One-time setup (SQL Editor)

1. Open [Supabase](https://supabase.com/dashboard)→ your project → **SQL Editor**.
2. Run `**transit-catalog.sql`** (creates tables + public read policies).
3. Run `**seed-transit.sql**` (loads 40 areas, 51 routes, 195 departures).

If you already ran `schema.sql` for bookings/profiles, order does not matter for transit tables.

## After updating GTFS data

```bash
node scripts/build-gtfs-bundle.mjs "C:/Users/Joshua/Downloads/Dataset/manila"
node scripts/generate-transit-seed-sql.mjs
```

Then run the new `**seed-transit.sql**` in the SQL Editor again (it truncates and re-inserts catalog rows).

## Tables


| Table                | Purpose                          |
| -------------------- | -------------------------------- |
| `transit_meta`       | Feed info (Sakay.ph, counts)     |
| `transit_places`     | Dropdown labels + search aliases |
| `transit_routes`     | Route definitions                |
| `transit_departures` | Schedules shown on search        |


Anonymous and signed-in users can **read** these tables; only you (SQL Editor / service role) can change them.

## Client config

`supabaseClient.js` already points at your project URL and publishable key. No extra secrets are required in the browser.