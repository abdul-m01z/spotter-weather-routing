# API contract

Both endpoints are same-origin JSON APIs. Coordinates are **[longitude, latitude]**. Responses use `Cache-Control: no-store`. Temporary geocoding results must remain in active UI/request memory. No login, cookies, database, or user state is involved.

## GET /api/places?query=Dallas

Requires 3–200 characters. Returns at most five candidates in the contiguous US:

```json
{"places":[{"label":"Dallas, Texas, United States","coordinate":[-96.8,32.8]}]}
```

Choose a candidate rather than submitting unselected text. Browser requests are debounced and stale responses aborted.

## POST /api/compare

Requires `Content-Type: application/json` and a body smaller than 16 KiB. Example request (choose a departure in the next 48 hours):

```json
{
  "origin":{"label":"Dallas, TX","coordinate":[-96.797,32.7767]},
  "destination":{"label":"Chicago, IL","coordinate":[-87.6298,41.8781]},
  "departure":"2026-11-03T18:00:00Z",
  "load_lb":38000,
  "interval_miles":25
}
```

The offset-aware input timestamp is normalized to UTC epoch seconds. Loads must be finite numbers from 0 through 1,000,000 lb; spacing must be 10, 25, or 50. Endpoints must differ.

Successful response fields:

| Field | Meaning |
| --- | --- |
| `trip` | Validated settings; departure is epoch seconds. |
| `assessed_at`, `weather_fetched_at` | Assessment/fetch epoch seconds; fetch time is null if no forecasts were retrieved. |
| `route_count`, `routes` | Actual distinct usable alternatives, at most three. |
| `recommended_id`, `explanation` | Eligible winner, or null with a reason. |
| `warnings` | Fewer routes, omitted malformed alternatives, or missing coverage. |
| `timeline` | 49 epoch timestamps: departure +0 through +48 hours. |
| `samples` | Deduplicated coordinate samples with `id`, `coordinate`, and 49 aligned `forecasts`. |
| `coverage` | Known sample count at each timeline index. |

Each route has `id`, `name`, full GeoJSON `geometry`, `distance_miles`, `duration_seconds`, destination `arrival`, `checkpoints`, `segments`, `miles_by_risk`, `unknown_miles`, `blocked`, `incomplete`, `eligible`, and `average_risk` (null if ineligible).

Each checkpoint has `coordinate`, cumulative `distance_miles`, `elapsed_seconds`, `eta`, `sample_id`, and ETA `weather`. Weather contains `wind_mph`, `rain_in_hr`, `snow_in_hr`, `risk`, and a human-readable `reason`. Missing numerical values remain null. A missing required field makes risk null. Map snapshot forecasts contain the same values/risk without the repeated explanation.

Each segment contains its road `coordinates`, actual `distance_miles`, and conservative endpoint-derived ETA `risk`. Risk values are `low`, `moderate`, `high`, `severe`, `no_travel`; **null means unknown**, not Low. `miles_by_risk` contains all five categories. Its sum plus `unknown_miles` equals route distance, apart from floating-point tolerance.

The same sample's map forecast at index N represents departure +N hours at that location. It is independent of checkpoint ETA assessment. Sliding through snapshots cannot change `recommended_id`.

## Errors and partial results

```json
{"error":{"code":"invalid_request","message":"Check your trip details.","fields":{"destination":"Select a location in the contiguous United States."}}}
```

Validation returns 400; unsupported methods/content types return 405/415; oversized input returns 413. No route or an excessive trip payload returns 422 with an actionable message. Provider failures return sanitized 429/502/503/504 responses. No upstream URL or token is returned. Provider calls have finite timeouts; weather requests are batched in groups of 25, with at most four active batches per comparison and a bounded overall deadline.

Weather failures can produce **200 with partial results**: geometry and known samples remain visible, incomplete routes are ineligible, and no recommendation is forced. All-blocked routes are also a successful comparison with a null recommendation. Missing map-only hours do not invalidate complete ETA forecasts. If serialized map data exceeds 4.25 MB, request a coarser interval/shorter journey; the API does not emit a response that exceeds Vercel's payload limit.
