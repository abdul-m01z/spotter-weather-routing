# Verification

Verified on 2026-11-03 using Python 3.12, Bun 1.4.4, Django 5.2, and Chromium through Playwright.

## Local gates

- **23 Django tests pass**, including table-driven weather thresholds, strict load boundaries, simultaneous hazards, road-distance/ETA interpolation, short/exact/zero-length segments, distance-weighted exposure, every ranking tie-breaker, blocked/unknown states, unit metadata, forecast horizon gaps, provider errors, oversized requests, and extreme JSON integers.
- Frontend **TypeScript check and production build pass**. Mapbox GL JS is lazy-loaded separately; its native mapping SDK is the only large-chunk build advisory.
- **Four Playwright tests pass** against the production preview: complete comparison and checkpoint exploration; loading/failure/retry and edited-trip state; no eligible route; keyboard use and a 390 px layout. Application responses are synthetic test fixtures; a lightweight Mapbox style removes tile-server variability.
- A focused independent diff review found an extreme-integer validation issue, which was fixed with regression coverage. No remaining confirmed review findings.

## Live providers and browser

- Mapbox credentials verified for real location search, driving alternatives, and the dark basemap. Open-Meteo hourly multi-coordinate forecasts verified live, including returned unit metadata.
- An initial Dallas–Chicago API comparison returned **two genuine routes**, **66 unique weather samples**, and complete ETA coverage in **6.33 seconds**. The provider did not supply three alternatives. Current weather initially blocked both; a later departure produced a blocked route and an eligible recommended alternative. Results follow live conditions rather than the reference's fixed numbers.
- The complete live browser workflow succeeded: selected geocoded Dallas/Chicago locations, submitted the trip, rendered real route cards/road geometry/weather, inspected a checkpoint, explored +24 hours, and resized to mobile. **No uncaught JavaScript errors** were reported, and **no horizontal overflow** occurred at 390 px.
- Desktop and mobile screenshots were visually inspected against the locked reference. The layout uses the intended navy/teal map dashboard, form/sidebar, distinct alternatives, checkpoint panel, and forecast strip. Live route shapes and values differ honestly from the reference.
- Slider/toggle checks preserve the recommendation and produce no additional comparison API request. The server returns all 49 map snapshots upfront.

## Hosting

Vercel deployment and hosted endpoint checks are recorded here after publication. The repository includes the Vite frontend and Django Python function, same-origin API rewrite, bounded provider requests, production environment configuration, and a 4.25 MB response guard below the platform's 4.5 MB limit. No database is required.
