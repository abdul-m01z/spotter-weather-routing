# Spotter Weather Routing

A React + Django dashboard for comparing road routes by the weather a driver will encounter **at each checkpoint's arrival time**. Built for the Spotter.ai full-stack assessment, following the supplied dark navy/teal visual reference.

**[Open the live app](https://spotter-weather-routing-beta.vercel.app)** — React and Django are hosted together on Vercel.

Enter two US locations, departure, load weight, and a 10/25/50-mile sampling interval. Compare genuine alternatives, inspect ETA weather and restrictions, and explore a preloaded 48-hour corridor forecast. Recommendations are deterministic and explainable; no AI scoring or invented route/weather data.

## Run locally

Requires **Python 3.12+** and **Bun**. No database, migrations, or additional infrastructure.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
bun install --frozen-lockfile
cp .env.example .env
```

Fill in the two Mapbox variables in `.env`. Both use public/read-scoped `pk` tokens; the server token must not have browser URL restrictions. One unrestricted public token can serve both roles locally. Never use a secret-scoped token in a `VITE_` variable. Open-Meteo requires no key.

Start these in separate terminals:

```bash
bun run dev:api
bun run dev
```

Open **http://localhost:5173**. Start with **Dallas, TX → Chicago, IL**, selecting each search suggestion, then compare. Live conditions may legitimately leave every route blocked; try a different journey/departure to explore other results.

## Verify

```bash
bun run test               # Django API/domain behavior with synthetic HTTP fixtures
bun run typecheck
bun run build
bunx playwright install chromium
bun run test:e2e           # builds, then runs Playwright against the production preview
```

The browser tests use deterministic application API fixtures and a lightweight Mapbox style to avoid external tile availability affecting UI assertions. They exercise location selection, loading/retry, blocked routes, checkpoint details, keyboard controls, stale results, slider behavior, and a 390 px layout. Native map rendering also needs a working public Mapbox token. Backend tests do not use real credentials or spend provider quota. See [verification notes](docs/verification.md) for actual live checks and observations.

For an already-built frontend, `bun run preview` also proxies `/api` to the local Django server. After modifying app source, rebuild before using preview or running `bunx playwright test` directly.

## How it works

- **Django** requests routes from Mapbox, walks their annotated road distance and duration to place checkpoints, batches weather requests, normalizes units, and owns every risk/ranking decision.
- **React** owns the form, route/checkpoint selection, and forecast controls. Mapbox GL JS renders road geometries, colored risk segments, vector checkpoints, and the qualitative weather corridor. One map instance survives selection and timeline changes.
- **Open-Meteo** hourly data is downloaded once per coordinate for both ETA assessment and the 49 departure-anchored map snapshots. Moving the slider does not refetch weather, change departure, or recalculate the recommendation.

The primary test boundary is the public Django API with controlled outbound provider responses. There is no second risk engine in the browser, authentication, persistence, task queue, or provider abstraction framework.

## Assessment rules and assumptions

Eligible routes have complete arrival-time forecasts and no No Travel conditions. Compare them in order: **fewest Severe miles → fewest High miles → lowest distance-weighted risk → shortest travel time**. Exact ties preserve provider order. Inspecting another route does not change which route is recommended.

At a checkpoint, the highest wind/rain/snow risk wins, including the PDF's strict `>30,000 lb` and `>40,000 lb` wind overrides. Printed shared rain/snow boundaries enter the higher category; exactly 1 in/hr rain and 3 in/hr snow remain Severe. Fractional wind values use continuous 25/35/45/55 mph thresholds. Unknown forecasts are never treated as zero or Low risk.

Each segment inherits the worse of its neighboring checkpoint risks; either endpoint missing makes that segment unknown. All risk miles plus unknown miles partition the journey. Average risk uses distance weights, not checkpoint counts.

**Worked example:** a 25-mile road leg taking 50 minutes has checkpoints at 0/10/20/25 miles and ETAs at +0/+20/+40/+50 minutes. If the checkpoint risks are Low/High/Low/Low, segment risks are High/High/Low: 20 High miles and 5 Low miles, with average risk `(20×2 + 5×0)/25 = 1.6`. An alternative with zero Severe/High miles and average risk 1 wins even if slower. Separately, wind of 48 mph with a 38,000 lb load is No Travel; exactly 30,000 lb keeps that wind band Severe. Tests cover these interpretations and boundaries.

Times are entered/displayed in the explicitly labeled browser timezone and calculated in UTC. Wind uses the nearest hourly instant (ties later); rain/snow use the preceding-hour total ending at the ceiling hour of ETA. Hourly totals represent one-hour average rates. No extrapolation beyond available forecasts.

This is an assessment of weather exposure using automotive road routes. It does not certify commercial-truck clearance/legality or model rest breaks, traffic predictions, or weather-induced delays. Origins/destinations are limited to the contiguous US; departure is within the next 48 hours. Providers may return fewer than three distinct alternatives. Very large requests ask for a coarser interval rather than exceeding hosting payload limits. Forecast colors interpolate sampled corridor data; they are not weather radar.

## Deploy on Vercel

The project uses the Vite preset for `dist` and a Python function exposing the same Django WSGI app under `/api`. No separate backend host is required. The function has a 60-second allowance; upstream work has a shorter deadline. In-process weather caching is best-effort across warm invocations.

Configure production variables in Vercel: `MAPBOX_ACCESS_TOKEN`, `VITE_MAPBOX_PUBLIC_TOKEN`, `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=false`, and `DJANGO_ALLOWED_HOSTS=.vercel.app` (or exact hosting domains). The frontend token is inlined at build time; server variables stay in the Python runtime. See [deployment notes](docs/deployment-notes.md).

```bash
vercel link
vercel --prod
```

Credentials, local agent tooling, test artifacts, and virtual environments are excluded from Git and deployment uploads. Hosting/billing activation requires the account owner's own approval; this repository makes no pricing guarantee. Loom recording remains a follow-up.

## References

- [Implementation spec](docs/implementation-spec.md) · [API contract](docs/api.md)
- [Provider feasibility and sources](docs/provider-notes.md)
- [Assessment PDF](docs/fs-assessment-spotter.pdf)
- [Locked visual reference](docs/visual_design_locked.png)
