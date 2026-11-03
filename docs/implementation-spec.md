# Weather-Aware Truck Routing — Implementation Spec

## Problem Statement

A truck driver needs to compare routes by the weather they will encounter **when they arrive**, accounting for load weight and travel time. A shortest-route display or a weather overlay at the current time does not answer that question.

This is a Spotter.ai full-stack hiring assessment. The submission must demonstrate understandable, correct React + Django code and an excellent map-based interface. The assessment allocates 40% to routing/weather/recommendation logic, 40% to UI/map/heatmap performance, 15% to code quality, and 5% to documentation/walkthrough. Prioritize those outcomes over additional features or production infrastructure.

## Solution

Build a single-page weather-routing dashboard in the style of the supplied locked design: dark navy map and panels, bright teal primary route/actions, lavender alternatives, readable route cards, checkpoint details, and a bottom forecast strip.

The user selects origin, destination, departure, load weight, and checkpoint interval. Django obtains up to three genuine road-route alternatives, samples hourly weather at road-distance checkpoints using their estimated arrival times, applies the assessment's risk/load rules, and recommends the best eligible route. The map explains the result through colored route segments and checkpoint details. A separate 0–48-hour weather layer lets the user explore the corridor at a chosen absolute time without changing the trip's departure or recommendation.

The goal is an impressive, interview-ready assessment app: polished visual execution, transparent calculations, graceful failure states, and a small codebase the applicant can explain. The owner subsequently authorized full Vercel deployment as part of implementation. Loom recording remains follow-up work for the owner.

## User Stories

1. As a driver, I want to select unambiguous origin and destination locations, so that the app compares the trip I intend to take.
2. As a driver, I want to enter departure date/time with its timezone clearly shown, so that arrival forecasts are not silently shifted.
3. As a driver, I want to enter load weight in pounds, so that load-dependent wind restrictions affect the result.
4. As a driver, I want to choose 10-, 25-, or 50-mile checkpoint spacing, so that I can control sampling detail.
5. As a driver, I want up to three distinct routes from a routing provider, so that I can compare real alternatives.
6. As a driver, I want to understand when fewer alternatives are available, so that I do not mistake duplicates for meaningful choices.
7. As a driver, I want checkpoints to follow the actual road route and estimated travel time, so that their forecasts represent my journey.
8. As a driver, I want wind, rain, and snow considered together, so that a dangerous hazard is not averaged away.
9. As a driver, I want the load-specific wind rules applied precisely, so that the recommendation reflects the assessment's restrictions.
10. As a driver, I want each route's distance, duration, risk miles, and arrival time summarized, so that I can compare the trade-offs quickly.
11. As a driver, I want a clear recommended route and a short reason, so that I understand why it wins.
12. As a driver, I want routes with No Travel conditions excluded from recommendations, so that a blocked route is never labeled safest.
13. As a driver, I want a clear explanation if all routes are blocked, so that the app does not force a misleading recommendation.
14. As a driver, I want missing forecasts identified as unknown, so that missing data is not interpreted as good weather.
15. As a driver, I want all alternatives and their checkpoints on a readable map, so that I can relate risk to geography.
16. As a driver, I want selecting a route card to highlight its route, so that the cards and map feel like one interface.
17. As a driver, I want checkpoint details with ETA, weather values, and the risk reason, so that I can inspect a concerning segment.
18. As a driver, I want a corridor weather layer with a 0–48-hour slider, so that I can explore how conditions develop.
19. As a driver, I want the map's forecast time distinguished from arrival-time risk, so that I do not confuse a weather snapshot with my travel exposure.
20. As a driver, I want smooth map and slider interactions, so that exploring weather does not repeatedly reload the app.
21. As a driver, I want useful loading, validation, and retry states, so that I know what is happening and how to recover.
22. As a keyboard or touch user, I want accessible forms, route selection, checkpoint details, and forecast controls, so that the interface is usable without hover alone.
23. As a reviewer on a smaller screen, I want usable form, map, and results panels, so that I can evaluate the complete workflow.
24. As an evaluator, I want focused tests and concise setup/assumption documentation, so that I can verify correctness and understand the implementation.

## Implementation Decisions

### Scope and architecture

- Use React + TypeScript with Vite for the frontend, and Django for the backend. Use **Bun and Bunx** for JavaScript package management, scripts, and tools; commit the Bun lockfile. Python remains a normal virtualenv-based Django application with pinned dependencies and documented commands. Do not substitute a JavaScript backend for Django.
- Use current mutually compatible stable releases when implementation starts. Avoid framework migrations or adopting an unfamiliar framework solely for novelty.
- Build one dashboard. Keep transient trip and selection state in React; no global state framework is needed.
- Django owns provider calls, unit/time normalization, checkpoint construction, risk classification, segment aggregation, and route ranking. The frontend renders the returned domain results; it must not implement a second risk or ranking engine.
- Prefer a few ordinary modules: provider HTTP integration, route-comparison/domain logic, and thin HTTP views. Keep functions concrete; do not create provider plugin interfaces, service containers, repository layers, or an abstract routing engine.
- Use Django JSON views and its built-in test tooling. A REST framework, database, authentication, Redis, task queue, WebSockets, or container orchestration is not required.
- Proxy frontend API requests to Django during development. Keep the eventual public API same-origin; deployment configuration belongs to follow-up work.
- Geographic scope: contiguous United States. Use miles, pounds, mph, and inches per hour in the UI. Use provider-native meters and seconds internally where appropriate, with explicit conversion at boundaries. Support US addresses and cities; exclude Alaska, Hawaii, and territories from location suggestions.
- This is weather-aware comparison using automotive road routing, **not certified commercial-truck navigation**. Do not claim vehicle-clearance legality, hours-of-service compliance, live traffic prediction, or weather-adjusted driving speeds.

### Provider choices and configuration

- Use **Mapbox GL JS** with its dark basemap for rendering, **Mapbox Geocoding v6** for location search, and **Mapbox Directions v5, driving profile** for routes. This also satisfies the geocoding provider's requirement that results accompany a Mapbox map.
- Request alternatives, full GeoJSON geometry, and distance/duration annotations. Request three total routes where available; the provider may supply fewer. Retain all distinct valid alternatives up to three, rather than discarding a valid route merely because another fails weather evaluation.
- Use **Open-Meteo Forecast** hourly wind speed at 10 m, rain, and snowfall. Request UTC epoch timestamps, mph, inches, and seven forecast days. Inspect returned units instead of assuming snowfall is always centimeters. Provider notes document exact request parameters and official sources.
- Only the browser map's public/read-scoped token may appear in frontend configuration. Keep Django's provider configuration server-side. Never expose secret-scoped tokens, commit credentials, or return upstream URLs containing tokens in errors.
- Provide an environment-variable example and clear missing-configuration errors. Mapbox credentials/account setup remain a human prerequisite. Do not activate billing, promise ongoing free service, or silently substitute synthetic data if credentials are absent.
- Respect visible map/weather attribution and provider usage restrictions. Keep temporary geocoding results in active request/UI memory only; do not persist or cache them, including in localStorage or fixtures copied from provider responses. Do not log tokens or full provider URLs. Any captured example data must be permitted for that use; prefer independently authored synthetic test fixtures.
- Batch weather coordinates, remove identical coordinate requests, and use small bounded concurrency. A batch size of 25 and at most four concurrent requests are adequate starting choices, not provider guarantees. Reuse a coordinate's downloaded hourly data for ETA evaluation and all map snapshots.
- A small in-process weather-response cache with a ten-minute TTL is sufficient if needed. Cache by coordinate/request parameters, including forecast dates; never cache failed/missing values as valid weather. Do not cache geocoding responses. No distributed cache or background refresh system.
- Give outbound requests finite timeouts and an overall comparison deadline (target no more than 45 seconds). Handle timeouts, rate limits, malformed responses, and partial batches explicitly. Do not create an unbounded retry loop; offer a user-triggered retry.

### Inputs and time semantics

- Origin and destination use labeled, keyboard-accessible search fields with candidate selection. Debounce search by about 400 ms, require at least three characters, show at most five candidates, and ignore stale responses. Editing a selected label clears its stored selection.
- The form may start with empty location inputs and Dallas/Chicago example placeholders. The initial map shows the continental US; it must not show invented route/weather results before comparison. The reference's trip and numbers are visual examples, not fixed application data.
- Require selected coordinates, a valid departure, finite nonnegative load weight, and interval exactly 10, 25, or 50 miles. Reject negative, NaN, infinite, or malformed numbers and out-of-scope coordinates server-side. Reject identical endpoints. Use reasonable request/string-size bounds.
- Default checkpoint interval: **25 miles**. Default load weight: **38,000 lb**. Default departure: roughly one hour ahead, rounded up to the next quarter-hour. Accept departures from now through the next 48 hours; explain this assessment forecast window in the form.
- Enter and display dates in the user's browser timezone, **explicitly labeled**. Do not silently interpret the entry as the origin's timezone. Convert once to an offset-aware timestamp for the backend; keep calculations in UTC. Display checkpoint and destination times in the same labeled timezone, including calendar date when the journey crosses midnight.
- Handle daylight-saving transitions using the platform timezone rules. Reject nonexistent local input times; for duplicated local times, use the earlier occurrence and show the resolved offset before submission. Do not treat every day as a fixed local 24-hour period when parsing input.
- Provider driving duration is the travel model. Do not add invented truck speeds, rest breaks, traffic predictions, or weather delays. Explain this assumption once in the interface's help/assumptions text and in the documentation.

### Checkpoints, weather, and risk miles

- A **checkpoint** is a position along the returned road polyline, with cumulative route distance, elapsed driving duration, ETA, sampled weather, and risk.
- Place checkpoints at the origin, each chosen interval, and destination. Include the destination exactly once, including when the route length is an exact interval multiple. Include both endpoints for short routes. Do not sample by straight-line distance between cities or by taking every Nth geometry coordinate.
- Walk the provider's full geometry and aligned per-segment distance/duration arrays. Interpolate the coordinate and elapsed time within the containing segment at each checkpoint distance. ETA = selected departure + cumulative annotated duration. Validate geometry/annotation alignment and finite, nonnegative distances/durations; malformed route data is an explicit provider failure.
- Use one canonical accumulated route distance for checkpoint positions, covered miles, and weighting. Account for zero-length geometry segments without division by zero. Keep full precision for calculation and round only display values.
- A **segment** spans two neighboring checkpoints. Its risk is the higher of the two endpoint ETA risks. If either endpoint is unknown, its segment is unknown. This deliberately conservative attribution is an assessment assumption; use the same segment definition for map colors, risk miles, and ranking.
- Segment distances must sum to route distance. Risk-category miles plus unknown miles must partition that distance exactly before display rounding. Never add an entire interval for a short final segment.
- Weather is hourly forecast data, not a real-time observation. Select the nearest timestamp for wind (ties use the later hour). For hourly rain/snow, use the interval ending at the ceiling hour of the requested time; an exact hour uses that timestamp. These precipitation values are preceding-hour totals and therefore one-hour average rates. Do not interpolate them as instantaneous readings.
- Normalize units based on returned unit metadata. Support expected inches/mph plus documented cm/mm conversions; unexpected units or null/nonfinite/negative weather values are unavailable, not zero.
- Do not extrapolate, clamp to the last forecast hour, or silently substitute current weather for unavailable ETA weather. A missing required wind or precipitation sample makes that checkpoint unknown. A forecast missing at an unrelated hour must not erase a valid ETA result.
- Evaluate load rules at the same checkpoint's ETA wind sample. All weather hazards and applicable load overrides combine using the **maximum risk**.

### Exact classification and recommendation

Use these non-overlapping ranges. The user approved higher-risk interpretation of shared rain/snow boundaries, continuous wind thresholds, and the PDF's strict greater-than load conditions.

| Risk | Wind (mph) | Rain (in/hr) | Snow (in/hr) |
| --- | --- | --- | --- |
| Low | 0 ≤ wind < 25 | 0 ≤ rain < 0.10 | 0 ≤ snow < 0.5 |
| Moderate | 25 ≤ wind < 35 | 0.10 ≤ rain < 0.25 | 0.5 ≤ snow < 1.0 |
| High | 35 ≤ wind < 45 | 0.25 ≤ rain < 0.50 | 1.0 ≤ snow < 2.0 |
| Severe | 45 ≤ wind < 55 | 0.50 ≤ rain ≤ 1.00 | 2.0 ≤ snow ≤ 3.0 |
| No Travel | wind ≥ 55 | rain > 1.00 | snow > 3.0 |

Apply these overrides without weakening another hazard:

- Wind ≥55 mph: No Travel for any load.
- 45 ≤ wind <55 mph and load **>30,000 lb**: No Travel.
- 35 ≤ wind <45 mph and load **>40,000 lb**: at least Severe.
- Exactly 30,000 lb and 40,000 lb do not satisfy their respective greater-than conditions.

An **eligible route** has complete ETA weather coverage and zero No Travel miles. Display blocked and incomplete alternatives, but exclude them from recommendations. Show both warnings if a route contains known No Travel conditions and unknown segments. Unknown is a separate data state, never a sixth risk rank.

Rank eligible routes lexicographically, in this order:

1. Fewest Severe miles.
2. Fewest High miles.
3. Lowest distance-weighted average segment risk, encoding Low=0, Moderate=1, High=2, Severe=3.
4. Shortest provider travel duration.
5. Original provider order solely to make exact ties deterministic.

Do not replace this rule with a weighted score, AI judgment, a shortest-route preference, or rounded card values. A slower route may correctly win. When none are eligible, return no recommendation and explain whether the causes are blocked routes, incomplete weather, or both.

Provide a short deterministic explanation from the first meaningful ranking difference, such as fewer Severe miles, fewer High miles, lower average exposure, or shorter travel time. Do not claim a route is absolutely safe; call it the lowest assessed weather risk among eligible alternatives.

### API boundary

Use two small JSON endpoints with a documented request/response contract:

- **GET `/api/places?query=…`**: returns up to five selectable locations with display label and longitude/latitude. Enforce geographic scope and query bounds. Return actionable errors without exposing provider credentials.
- **POST `/api/compare`**: accepts origin and destination labels/coordinates, an offset-aware departure timestamp, load in pounds, and checkpoint interval in miles. Coordinates are explicitly longitude/latitude; do not rely on unnamed array ordering across providers.

The comparison response contains:

- Echoed normalized trip settings, assessment timestamp, fetched-at metadata, actual returned route count, and structured warnings.
- Up to three stable route IDs within that response, full map geometry, distance, duration, destination ETA, and eligibility/warning reasons.
- For each route, checkpoints with cumulative distance, ETA, sampled wind/rain/snow, risk and its explanation; segment distances and ETA-risk categories; miles per risk category, unknown miles, and weighted average for eligible routes (otherwise null).
- One recommended route ID or null, plus its deterministic explanation.
- A shared timeline of **49 timestamps**: departure +0 through +48 hours, hourly. For each unique corridor sample location, provide normalized weather/risk (or unknown) aligned to that timeline. Include references from route checkpoints to shared sample locations so overlapping routes do not duplicate weather series.
- Per-snapshot availability information sufficient to identify partial or unavailable weather layers. Preserve a valid recommendation if only later map snapshots are missing.

Field names may follow the project's normal JSON convention, but document the actual chosen contract and keep frontend types aligned. Use stable machine-readable error codes and field-specific validation messages. A successful partial comparison is still a valid response with warnings; invalid inputs or a total upstream routing failure are errors. Handle malformed JSON and wrong HTTP methods. Do not let arbitrary client-supplied URLs determine upstream requests.

### Map, forecast layer, and interaction

- Keep one map instance alive. Render routes, risk segments, and checkpoints using GeoJSON sources and native layers rather than one HTML element per point. Update existing sources/layers on selection and slider changes; clean up listeners on unmount.
- Fit all alternatives after successful comparison. Route-card selection highlights and raises that route without resetting the user's map on every render. Give alternatives distinct identifiers, colors, and line styles. Avoid hover-only interactions.
- The map's routes and checkpoint risk markings represent **ETA-based trip risk**. Checkpoint details show arrival time, wind/rain/snow, risk label, and the hazard/load rule responsible. Include every checkpoint, including origin/destination; make the selected checkpoint visibly distinct.
- Show a native heatmap along the sampled trip corridor, driven by forecast hazard risk at each slider time. This is a qualitative interpolation between actual sampled locations, **not a regional weather radar or a precise meteorological boundary**. Do not generate random storms, use hard-coded heat blobs, or infer weather for the entire visible country.
- Avoid inflating the heatmap just because multiple routes share a checkpoint: use deduplicated sample locations. Include Low-risk samples so an all-clear corridor remains visible. Unknown samples must never become green/safe areas. Exact risk labels belong to point/segment details; heatmap density is not used for ranking or calculating miles.
- The slider's +0 is the selected departure, **not now**. Label it “Departure” or show the actual departure timestamp; do not copy the reference's “Now” label with different semantics. Display +12/+24/+36/+48 ticks, with hourly keyboard/touch steps and a clear selected timestamp.
- At snapshot time T, evaluate every corridor point at **the same T**. These are weather snapshots, not departure alternatives. Scrubbing must not change the trip departure, checkpoint ETA results, route cards, or recommended route. Resubmit the form to evaluate a different departure.
- Load all timeline data with the comparison. Scrubbing or toggling the weather layer must issue **no new network requests**. Coalesce rapid slider events to the next animation frame. Keep the map interactive while updating layers and avoid refitting the camera.
- Provide an explicit weather-layer toggle and visible five-level legend using the reference colors: Low green, Moderate yellow, High orange, Severe coral, No Travel red. Show unknown coverage distinctly in status/detail text. A disabled weather layer does not hide the route's ETA risk markings.
- Show assessment/fetch time honestly, not the static reference's update time. Missing map tiles/token/WebGL support gets a useful message while form and route summaries remain usable.

### Visual polish and usability

- Desktop is the primary composition: compact branded header, roughly 340–360 px form/results sidebar, dominant dark map, and forecast strip near the map bottom. Use the supplied image as the visual authority, including spacing, panel contrast, borders, typography hierarchy, teal buttons, and card emphasis.
- Build the UI in HTML/CSS and map layers. Do not place the reference screenshot behind the controls or bake functional text into images. Use a consistent existing icon set or simple vector icons; AI image generation is unnecessary.
- Cards show route identifier, distance/duration, arrival time, Severe/High exposure and any No Travel/unknown warning. The winning card explains the recommendation. Selected route and recommended route are separate states: inspecting a blocked route must not relabel it recommended.
- At smaller widths, reflow the form/results and map into usable stacked panels, preserving a meaningful map height and a usable slider/legend. At 390 px there should be no horizontal page overflow or inaccessible controls. Do not attempt to squeeze the desktop sidebar unchanged onto a phone.
- Use real labels, visible focus states, keyboard-operable suggestions/cards/slider, adequate contrast, and meaningful button names. Use text/icons as well as color to convey risk. Provide checkpoint details through keyboard-accessible UI for the selected route, for example a compact checkpoint selector feeding the same details panel as map clicks.
- Include deliberate empty, loading, success, fewer-routes, blocked, unknown, validation, provider-failure, and retry states. Show a simple “Comparing routes and weather…” progress state; do not invent percentages. Prevent duplicate submissions and ignore stale responses if inputs change or a newer request finishes first. Do not present stale cards as results for edited inputs; mark them as belonging to the last submitted trip until the next successful comparison.
- Keep motion restrained and honor reduced-motion preferences. Optimize visual clarity and map responsiveness before adding animation.

## Testing Decisions

- **Primary seam: the public Django comparison API.** Use deterministic, independently authored routing/weather fixtures at the outbound HTTP boundary. Assert externally visible checkpoints, ETAs, risk miles, eligibility, recommendation, and errors. Do not mock the domain functions being verified or assert internal call order, helper names, private state, or CSS class names.
- There is no application or test suite yet, so there is no existing test prior art. Use Django's built-in test client/test runner and standard mocking; add focused direct numerical tests only if they make a boundary or invariant clearer than an API test. Avoid building a custom testing framework.
- Cover each risk boundary on both sides and exactly at the boundary, fractional wind values, load exactly at and just above 30,000/40,000 lb, and simultaneous hazards. Include rain=1.00 and snow=3.0 remaining Severe. Verify the same classification in ETA results and map snapshots.
- Verify checkpoints on a multi-segment route with different speeds, non-hour departure, a short final interval, exact-interval destination, a route shorter than one interval, and zero-length geometry segments. Assert endpoint inclusion, road-distance interpolation, accumulated time, and full distance partitioning.
- Verify each ranking tie-breaker independently, including a longer-duration route correctly winning on lower weather exposure. Include all-blocked, all-unknown, blocked-plus-unknown, and mixed eligible/ineligible routes. Confirm no recommendation when none are eligible.
- Verify unit conversion from response metadata, null values, unexpected units, hourly precipitation interval alignment, nearest wind/tie behavior, UTC/date rollover, and out-of-horizon weather. A missing later map snapshot must not invalidate otherwise complete ETA weather.
- Verify fewer than three routes, duplicates, malformed annotations, no route, timeout/rate-limit responses, partial weather failures, missing configuration, malformed inputs, and strict interval validation. API errors must not contain tokens. Use fixed clocks rather than date-dependent tests.
- Add a small Playwright browser suite run with **Bunx**. At the application API boundary, use deterministic response fixtures to verify form submission, loading/error recovery, card-to-map selection, checkpoint details, weather toggle, and slider behavior. Assert that slider changes update the displayed forecast time without another API call or recommendation change. Exercise keyboard interactions and one narrow viewport.
- Keep browser fixtures visibly confined to tests. Do not add an undocumented demo switch or allow tests to quietly become the live application's data source.
- Manually verify the real configured app with a representative long-distance US journey, preferably Dallas to Chicago, plus a shorter route. Check actual route alternatives, map rendering, attribution, responsive layout, and provider-derived weather. Test fixtures cannot substitute for this live integration check. If credentials are unavailable, report that limit explicitly rather than claiming live verification passed.
- For a representative three-route trip at 25-mile spacing, verify that slider dragging stays responsive, creates no network calls, and does not recreate the map. Report the observed initial comparison duration and request behavior; no synthetic production-scale benchmark is required.
- Compare a desktop screenshot against the locked design and inspect a 390 px layout. Screenshot checks support human visual review, not brittle pixel-perfect assertions against a reference containing different live data.
- Required local gates: backend tests, frontend typecheck, frontend production build, and the focused browser suite. Document exact commands and any honest limitations. Do not introduce test suites for unrelated framework defaults.

## Out of Scope

- Loom recording and custom-domain setup. The owner subsequently authorized hosting the full frontend and Django API on Vercel, which is included in implementation.
- Accounts, authentication, authorization systems, saved trips, history, databases, admin dashboards, payments, notifications, background jobs, or multi-user features.
- Production infrastructure, distributed caches, observability platforms, Kubernetes, elaborate CI/CD, or load-testing programs.
- Fuel pricing, profitability tools, fleet management, truck animations, and other products shown in the reference assets.
- A custom routing engine, guaranteed commercial-truck clearance/legal routing, hours-of-service scheduling, live traffic, weather-adjusted travel speeds, road closures, or dispatch optimization.
- AI recommendations, chat, arbitrary weighting controls, user-defined risk thresholds, extra checkpoint intervals, international routing, exports, and forecast horizons beyond the specified controls.
- A second production provider, automatic provider failover, fake alternatives, fabricated live weather, and a separate demo product.

## Further Notes

- **Source of truth:** the supplied `docs/fs-assessment-spotter.pdf` defines the assessment; `docs/visual_design_locked.png` defines the visual direction. The other images/video provide supporting branding/context, not additional product requirements. The locked reference's fixed date, route names, weather values, and route metrics are illustrative.
- **Provider feasibility:** consult `docs/provider-notes.md` for official API references, terms/configuration caveats, and verified Open-Meteo units. Mapbox token-dependent route alternatives and map loading remain unverified until credentials are supplied. Road names for route cards may use provider summaries when available; otherwise use honest A/B/C labels, not invented interstate names.
- **Resolved decisions:** user approved desktop design fidelity, live-provider accounts/keys without paid commitments, exclusion of No Travel routes, conservative threshold interpretations, departure-anchored snapshot exploration, and honest handling of fewer than three alternatives. The user delegated remaining routine choices and requested clarity over extra features.
- **Repository/deliverable scope:** keep the assessment and reference assets, this spec, provider notes, app source, environment examples, lockfiles, tests, and concise setup/assumptions documentation in the owner's GitHub repository. Vercel deployment was subsequently authorized and is included; Loom recording remains follow-up work. Never commit credentials or locally installed agent-skill bundles.
- **Interview handoff:** include one short worked example explaining checkpoint ETA, risk miles, a load override, and the ranking result. Derive it from a deterministic test scenario and label it as an example. This gives the applicant evidence they can explain without adding another product feature.
- **Suggested implementation order:** establish the route/weather domain behavior and API tests; connect live providers; build the locked visual composition; connect map selection, checkpoint details, and preloaded forecast exploration; verify errors/accessibility/responsiveness; finish setup documentation and acceptance evidence. This is one assessment implementation, not a set of speculative platform projects.
- **Completion:** the real configured workflow works, risk/ranking invariants pass, the desktop UI convincingly follows the locked design, mobile controls remain usable, the map/slider behave smoothly, failures are honest, and all stated local gates pass. Include a concise handoff with commands run, actual live checks, and remaining credential/setup limits. Stop there.
