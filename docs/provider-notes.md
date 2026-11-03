# Provider feasibility

Checked against official documentation and a live Open-Meteo request on 2026-11-03. This is an implementation decision for an assessment prototype; no accounts, tokens, or paid commitments were created.

## Chosen stack

Use React with **Mapbox GL JS**, `mapbox://styles/mapbox/dark-v11`, Django calling Mapbox Geocoding v6 and Directions v5, and Open-Meteo Forecast. GL JS supports GeoJSON sources and native heatmap layers, so route lines, checkpoints, and a weather intensity overlay need no additional mapping provider. Keep Mapbox logo and attribution controls visible. [Dark style example](https://docs.mapbox.com/mapbox-gl-js/example/setstyle/), [React heatmap example](https://docs.mapbox.com/mapbox-gl-js/example/heatmap-layer/), [attribution requirements](https://docs.mapbox.com/help/dive-deeper/attribution/).

**Do not combine Mapbox Geocoding results with a CARTO-only map:** Mapbox's geocoding documentation requires its responses to be used with a Mapbox map. CARTO's current basemap offer also requires a key; legacy keyless examples are not a reliable new integration contract. [Geocoding restrictions](https://docs.mapbox.com/api/search/geocoding/#geocoding-api-pricing), [current CARTO basemaps](https://carto.com/basemaps/).

## Mapbox requests and limits

Geocode using a debounced search (at least three characters, 400 ms idle), not every keystroke. The request below shows a complete query; use `autocomplete=true` for interactive partial queries:

```text
GET https://api.mapbox.com/search/geocode/v6/forward
  ?q=Dallas%2C%20TX&country=us&autocomplete=true&limit=5&permanent=false
  &access_token=SERVER_TOKEN
```

Accept US cities/addresses and require candidate selection when ambiguous. Coordinates are longitude, latitude. Temporary results cannot be cached or stored; hold them only for the active request/UI, with no database, localStorage, or response cache. Permanent mode needs explicit licensing/account setup. Default geocoding rate limit is 1,000 requests/minute. [Geocoding API](https://docs.mapbox.com/api/search/geocoding/).

```text
GET https://api.mapbox.com/directions/v5/mapbox/driving/{originLng},{originLat};{destLng},{destLat}
  ?alternatives=true&annotations=distance,duration&geometries=geojson
  &overview=full&steps=false&access_token=SERVER_TOKEN
```

This yields the fastest route and **up to two** sufficiently different alternatives; one or two total routes is valid. Never invent alternatives to reach three. Full geometry aligns with leg annotation arrays: distances in meters and durations in seconds between successive coordinates. Defaults permit 25 waypoints, 300 requests/minute, and 10,000 km total waypoint distance; Dallas–Chicago is within that distance ceiling. The profile is automotive, not a dedicated commercial truck profile. Optional height/width/weight restrictions have variable regional coverage; they do not establish complete truck legality. [Directions API](https://docs.mapbox.com/api/navigation/directions/).

Implementation choice: use two endpoint coordinates, therefore one leg. Validate `len(distance) == len(duration) == len(coordinates)-1`. Walk cumulative annotated distance; interpolate the checkpoint coordinate and elapsed segment duration at each 10/25/50-mile boundary (`1 mile = 1609.344 m`), plus origin and destination. ETA is departure plus cumulative duration. This follows the road polyline and segment speeds. For the prototype, keep this baseline travel model fixed across departure comparisons; it does not predict weather delays, breaks, or changing traffic. If departure-dependent traffic is later required, request documented `depart_at` predictions and reconsider route comparability.

## Open-Meteo request, units, and time

```text
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat1},{lat2}&longitude={lng1},{lng2}
  &hourly=wind_speed_10m,rain,snowfall
  &timezone=GMT&timeformat=unixtime&wind_speed_unit=mph
  &precipitation_unit=inch&forecast_days=7
```

Matched comma-separated coordinate lists return an array of forecasts. Seven days is the default; `forecast_days` allows up to 16. Wind is instantaneous at each timestamp; rain and snowfall are **sums for the preceding hour**. Snowfall defaults to cm, but the current API supports inches. [Forecast API](https://open-meteo.com/en/docs).

Live smoke check with Dallas/Chicago coordinates returned 24 hourly values per location for `forecast_days=1`, with:

```json
{"time":"unixtime","wind_speed_10m":"mp/h","rain":"inch","snowfall":"inch"}
```

Read `hourly_units`; do not always divide snowfall by 2.54. Normalize only when a response explicitly says `cm` (snow) or `mm` (rain). Preserve null/missing values as unavailable.

Implementation choice: use UTC epoch seconds internally. For ETA 10:20, precipitation at 11:00 represents the containing 10:00–11:00 interval; select the ceiling-hour sample (exact hours use that timestamp). Use the nearest hour for wind (ties choose the later hour) and disclose hourly resolution. Do not interpolate precipitation totals as instantaneous intensities.

Generate map snapshots at departure +0 through +48 hours inclusive: **49 snapshots**. Each snapshot samples every corridor checkpoint at the same absolute map time. Separately, evaluate each route checkpoint at its actual arrival ETA once for route recommendations. Scrubbing the map does not change departure, checkpoint ETAs, or the recommendation. Fetch each coordinate's forecast once for both uses; chunk coordinate batches conservatively (e.g. 25) for URL length and bounded concurrency. This chunk size is an application choice, not a documented provider maximum. Check coverage through the later of departure +48 hours and actual destination ETA, rounded up to the next hour. Missing map snapshots remain visibly unknown; missing ETA forecasts make a route ineligible for recommendation. Never clamp to the final forecast hour. Seven days should cover the intended continental-US examples but is not an unconditional coverage guarantee.

The free endpoint needs no key or signup, and is limited to noncommercial use: fewer than 10,000 calls/day, 5,000/hour, 600/minute, with CC BY 4.0 attribution. Evaluation/prototyping is supported; commercial deployment requires a suitable plan/customer endpoint and key. Show linked Open-Meteo attribution. [Features](https://open-meteo.com/en/features), [terms](https://open-meteo.com/en/terms), [pricing](https://open-meteo.com/en/pricing).

## Credentials and remaining verification

Use `VITE_MAPBOX_PUBLIC_TOKEN` for the browser map and `MAPBOX_ACCESS_TOKEN` in Django. A browser token must have only public/read scopes; it is intentionally visible. Prefer a separate URL-restricted browser token allowing localhost and the deployment origin. Server requests need a token without browser URL restrictions; an `sk` token is unnecessary for these read APIs. Never expose a token with secret scopes. [Token management](https://docs.mapbox.com/accounts/guides/tokens/), [public/secret token guidance](https://docs.mapbox.com/help/getting-started/access-tokens/).

Mapbox currently offers no-card trial access with limits. Standard access requires adding a payment method and moves the account to pay-as-you-go; trial token management is restricted. The published standard free tiers currently include 100,000 monthly Directions requests, 100,000 temporary geocoding requests, and 50,000 GL JS map loads, but these are not trial entitlements or a cost guarantee. The account owner must inspect current terms and approve any billing activation independently. [Signup/trial](https://docs.mapbox.com/accounts/guides/signup/), [demo versus standard access](https://docs.mapbox.com/accounts/guides/demo-access/), [pricing](https://www.mapbox.com/pricing).

No Mapbox credentials were available, so authenticated Dallas–Chicago routing, actual alternative count, and map loading remain unverified. Missing tokens must produce actionable configuration errors, not synthetic route/weather data. Open-Meteo multi-coordinate access and returned units were verified live.
