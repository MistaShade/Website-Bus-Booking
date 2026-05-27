# Manila GTFS feed

Place the Sakay.ph Manila GTFS text files here (same names as the standard feed):

- `agency.txt`
- `calendar.txt`
- `feed_info.txt`
- `frequencies.txt`
- `routes.txt`
- `shapes.txt`
- `stop_times.txt`
- `stops.txt`
- `trips.txt`

Then rebuild the booking dataset:

```bash
node scripts/build-gtfs-bundle.mjs
```

The site loads `data/manila-transit.json` (a curated subset). Edit `data/gtfs-allowlist.json` to choose which `route_id` values are included — the full feed has 1,700+ bus routes; only the allowlisted routes are used.

If this folder is empty, the build script also checks `Downloads/Dataset/manila` on your machine.
