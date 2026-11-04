# Spotter Weather Routing
<img width="1920" height="1016" alt="image" src="https://github.com/user-attachments/assets/786622e7-3d02-4079-9263-570fb66d8993" />


A React + Django dashboard for comparing road routes by the weather a driver will encounter **at each checkpoint's arrival time**. Built for the Spotter.ai full-stack assessment

**[Open the live app](https://spotter-weather-routing-beta.vercel.app)** — React and Django are hosted together on Vercel.

Enter two US locations, departure, load weight, and a 10/25/50-mile sampling interval. Compare genuine alternatives, inspect ETA weather and restrictions, and explore a preloaded 48-hour corridor forecast. Recommendations are deterministic and explainable; no AI scoring or invented route/weather data.

## Run locally

Requires **Python 3.12+** and **Bun**. No database, migrations, or additional infrastructure.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
bun install
cp .env.example .env
```

Fill in the two Mapbox variables in `.env`. Both use public `pk` tokens. Open-Meteo requires no key.

Start these in separate terminals:

```bash
bun run dev:api
bun run dev
```

Open **http://localhost:5173**. Start with **Dallas, TX → Chicago, IL**, selecting each search suggestion, then compare. Live conditions may legitimately leave every route blocked; try a different journey/departure to explore other results.


## How it works

- **Django** requests routes from Mapbox, walks their annotated road distance and duration to place checkpoints, batches weather requests, normalizes units, and owns every risk/ranking decision.
- **React** owns the form, route/checkpoint selection, and forecast controls. Mapbox GL JS renders road geometries, colored risk segments, vector checkpoints, and the qualitative weather corridor. One map instance survives selection and timeline changes.
- **Open-Meteo** hourly data is downloaded once per coordinate for both ETA assessment and the 49 departure-anchored map snapshots. Moving the slider does not refetch weather, change departure, or recalculate the recommendation.

## Assessment rules and assumptions

Eligible routes have complete arrival-time forecasts and no No Travel conditions. Compare them in order: **fewest Severe miles → fewest High miles → lowest distance-weighted risk → shortest travel time**. Exact ties preserve provider order. Inspecting another route does not change which route is recommended.

At a checkpoint, the highest wind/rain/snow risk wins, including the PDF's strict `>30,000 lb` and `>40,000 lb` wind overrides. Printed shared rain/snow boundaries enter the higher category; exactly 1 in/hr rain and 3 in/hr snow remain Severe. Fractional wind values use continuous 25/35/45/55 mph thresholds. Unknown forecasts are never treated as zero or Low risk.

Each segment inherits the worse of its neighboring checkpoint risks; either endpoint missing makes that segment unknown. All risk miles plus unknown miles partition the journey. Average risk uses distance weights, not checkpoint counts.

**Worked example:** a 25-mile road leg taking 50 minutes has checkpoints at 0/10/20/25 miles and ETAs at +0/+20/+40/+50 minutes. If the checkpoint risks are Low/High/Low/Low, segment risks are High/High/Low: 20 High miles and 5 Low miles, with average risk `(20×2 + 5×0)/25 = 1.6`. An alternative with zero Severe/High miles and average risk 1 wins even if slower. Separately, wind of 48 mph with a 38,000 lb load is No Travel; exactly 30,000 lb keeps that wind band Severe. Tests cover these interpretations and boundaries.

Times are displayed in the explicitly labeled browser timezone and calculated in UTC. Wind uses the nearest hourly instant (ties later); rain/snow use the preceding-hour total ending at the ceiling hour of ETA. Hourly totals represent one-hour average rates.
