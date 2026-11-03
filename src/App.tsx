import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  CloudSun,
  Layers,
  LoaderCircle,
  MapPin,
  Route as RouteIcon,
  ShieldCheck,
  TriangleAlert,
  Truck,
} from "lucide-react";
import { ApiError, request } from "./api";
import {
  dateTime,
  initialDeparture,
  localInput,
  miles,
  parseDeparture,
} from "./format";
import { routeColor, type Comparison, type Place } from "./types";
import { PlaceField } from "./components/PlaceField";
import { RouteCard } from "./components/RouteCard";
import { RouteMap } from "./components/RouteMap";
import { ForecastBar } from "./components/ForecastBar";
import { CheckpointDetails } from "./components/CheckpointDetails";

export default function App() {
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [departure, setDeparture] = useState(initialDeparture);
  const [load, setLoad] = useState("38000");
  const [interval, setInterval] = useState(25);
  const [result, setResult] = useState<Comparison | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [checkpoint, setCheckpoint] = useState<number | null>(null);
  const [hour, setHour] = useState(0);
  const [weather, setWeather] = useState(true);
  const [forecastOpen, setForecastOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [problem, setProblem] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const controller = useRef<AbortController | null>(null);
  const frame = useRef(0);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const route = result?.routes.find((route) => route.id === selected);
  const point = checkpoint !== null ? route?.checkpoints[checkpoint] : null;
  const parsedDeparture = parseDeparture(departure);
  useEffect(
    () => () => {
      controller.current?.abort();
      cancelAnimationFrame(frame.current);
    },
    [],
  );
  function edited() {
    setDirty(true);
    setFields({});
    setProblem("");
    controller.current?.abort();
    setBusy(false);
  }
  function chooseRoute(id: string) {
    setSelected(id);
    setCheckpoint(null);
  }
  function chooseCheckpoint(id: string, index: number) {
    setSelected(id);
    setCheckpoint(index);
  }
  function changeHour(value: number) {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setHour(value));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const errors: Record<string, string> = {};
    if (!origin) errors.origin = "Select an origin from the suggestions.";
    if (!destination)
      errors.destination = "Select a destination from the suggestions.";
    if (!parsedDeparture)
      errors.departure = "Choose a valid local date and time.";
    if (
      load.trim() === "" ||
      !Number.isFinite(Number(load)) ||
      Number(load) < 0
    )
      errors.load_lb = "Enter a nonnegative load weight.";
    setFields(errors);
    setProblem("");
    if (Object.keys(errors).length) return;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    try {
      const data = await request<Comparison>("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: active.signal,
        body: JSON.stringify({
          origin,
          destination,
          departure: parsedDeparture!.toISOString(),
          load_lb: Number(load),
          interval_miles: interval,
        }),
      });
      if (active.signal.aborted) return;
      setResult(data);
      setSelected(data.recommended_id || data.routes[0].id);
      setCheckpoint(null);
      setHour(0);
      setDirty(false);
    } catch (error) {
      if (!active.signal.aborted) {
        setProblem(
          error instanceof Error
            ? error.message
            : "Unable to compare routes. Please retry.",
        );
        if (error instanceof ApiError) setFields(error.fields);
      }
    } finally {
      if (!active.signal.aborted) setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="Spotter home">
          spotter<span>.ai</span>
        </a>
        <span className="header-divider" />
        <h1>Weather Routing</h1>
        <div className="header-status">
          <CloudSun size={19} />
          <span>
            {result?.weather_fetched_at
              ? `Forecast fetched ${new Date(result.weather_fetched_at * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
              : "Hourly forecasts. Smarter routes."}
          </span>
        </div>
        <span className="assessment-label">ROUTE INTELLIGENCE</span>
      </header>
      <main className="dashboard">
        <aside className="sidebar" aria-label="Trip planner">
          <div className="planner-heading">
            <h2>Plan your trip</h2>
            <p>Find the route with the lowest weather risk.</p>
          </div>
          <form onSubmit={submit} noValidate>
            <PlaceField
              label="Origin"
              placeholder="City or address, e.g. Dallas, TX"
              value={origin}
              onChange={(place) => {
                edited();
                setOrigin(place);
              }}
              error={fields.origin}
            />
            <PlaceField
              label="Destination"
              placeholder="City or address, e.g. Chicago, IL"
              value={destination}
              onChange={(place) => {
                edited();
                setDestination(place);
              }}
              error={fields.destination}
            />
            <div className="field">
              <label htmlFor="departure">
                Departure <span className="label-hint">Next 48 hours</span>
              </label>
              <div
                className={`input-shell ${fields.departure ? "invalid" : ""}`}
              >
                <CalendarDays size={18} />
                <input
                  id="departure"
                  type="datetime-local"
                  value={departure}
                  min={localInput(new Date())}
                  max={localInput(new Date(Date.now() + 48 * 3600_000))}
                  onChange={(event) => {
                    edited();
                    setDeparture(event.target.value);
                  }}
                  aria-invalid={!!fields.departure}
                  aria-describedby="departure-zone"
                />
              </div>
              <span className="timezone-note" id="departure-zone">
                {timezone}{" "}
                {parsedDeparture &&
                  `· UTC${parsedDeparture.getTimezoneOffset() <= 0 ? "+" : "−"}${Math.abs(parsedDeparture.getTimezoneOffset() / 60)}`}
              </span>
              {fields.departure && (
                <span className="field-error">{fields.departure}</span>
              )}
            </div>
            <div className="field">
              <label htmlFor="load">Load weight</label>
              <div className={`input-shell ${fields.load_lb ? "invalid" : ""}`}>
                <Truck size={19} />
                <input
                  id="load"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="1000000"
                  value={load}
                  onChange={(event) => {
                    edited();
                    setLoad(event.target.value);
                  }}
                  aria-invalid={!!fields.load_lb}
                />
                <span className="input-unit">lb</span>
              </div>
              {fields.load_lb && (
                <span className="field-error">{fields.load_lb}</span>
              )}
            </div>
            <fieldset className="field interval-field">
              <legend>Checkpoint interval</legend>
              <div className="segmented-control">
                {[10, 25, 50].map((value) => (
                  <label
                    key={value}
                    className={interval === value ? "active" : ""}
                  >
                    <input
                      type="radio"
                      name="interval"
                      value={value}
                      checked={interval === value}
                      onChange={() => {
                        edited();
                        setInterval(value);
                      }}
                    />
                    <span>{value} mi</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button type="submit" className="compare-button" disabled={busy}>
              {busy ? (
                <LoaderCircle size={19} className="spin" />
              ) : (
                <RouteIcon size={19} />
              )}
              <span>{busy ? "Comparing routes…" : "Compare routes"}</span>
              {!busy && <ArrowRight size={18} />}
            </button>
            {busy && (
              <p className="loading-note" role="status">
                Checking routes and arrival-time weather…
              </p>
            )}
            {problem && (
              <div className="form-alert" role="alert">
                <TriangleAlert size={17} />
                <p>
                  {problem}{" "}
                  {!Object.keys(fields).length &&
                    "You can retry the comparison."}
                </p>
              </div>
            )}
          </form>
          <section
            className="route-results"
            aria-label="Route comparison"
            aria-busy={busy}
          >
            <div className="results-heading">
              <h2>
                {result
                  ? `${result.route_count} route option${result.route_count === 1 ? "" : "s"}`
                  : "Your route options"}
              </h2>
              {result && (
                <span className="results-count">{result.route_count}</span>
              )}
            </div>
            {result ? (
              <>
                {dirty && (
                  <p className="stale-note" role="status">
                    Showing your last compared trip. Compare again to apply
                    changes.
                  </p>
                )}
                {!result.recommended_id && (
                  <div className="no-recommendation" role="alert">
                    <TriangleAlert size={18} />
                    <span>{result.explanation}</span>
                  </div>
                )}
                <div className="route-list">
                  {result.routes.map((route) => (
                    <RouteCard
                      key={route.id}
                      route={route}
                      color={routeColor(
                        route.id,
                        result.routes,
                        result.recommended_id,
                      )}
                      selected={route.id === selected}
                      recommended={route.id === result.recommended_id}
                      explanation={result.explanation}
                      onSelect={() => chooseRoute(route.id)}
                    />
                  ))}
                </div>
                {route && (
                  <div className="checkpoint-picker">
                    <label htmlFor="checkpoint">
                      <MapPin size={14} />
                      Inspect a checkpoint
                    </label>
                    <div className="select-shell">
                      <select
                        id="checkpoint"
                        value={checkpoint ?? ""}
                        onChange={(event) =>
                          setCheckpoint(
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                          )
                        }
                      >
                        <option value="">
                          {route.checkpoints.length} checkpoints · route{" "}
                          {route.id}
                        </option>
                        {route.checkpoints.map((point, index) => (
                          <option key={index} value={index}>
                            {index + 1} ·{" "}
                            {index === 0
                              ? "Origin"
                              : index === route.checkpoints.length - 1
                                ? "Destination"
                                : `${miles(point.distance_miles)} mi`}{" "}
                            · {dateTime(point.eta)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} />
                    </div>
                  </div>
                )}
                {result.warnings.length > 0 && (
                  <details className="data-notes">
                    <summary>
                      <CircleHelp size={14} />
                      Data notes ({result.warnings.length})
                    </summary>
                    <ul>
                      {result.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <div className="empty-results">
                <div className="empty-route-icon">
                  <ShieldCheck size={24} />
                </div>
                <strong>Better decisions, mile by mile.</strong>
                <p>
                  Compare travel time and weather exposure in one clear view.
                </p>
              </div>
            )}
          </section>
          <details className="assumptions">
            <summary>
              <CircleHelp size={15} />
              How routes are assessed
              <ChevronDown size={14} />
            </summary>
            <p>
              Routes are ranked by Severe miles, High miles, average exposure,
              then travel time. No Travel or incomplete arrival forecasts
              exclude a route.
            </p>
            <p>
              Hourly forecasts and road driving estimates; no truck-clearance
              certification, rest breaks, traffic predictions, or weather
              delays. All times use {timezone}.
            </p>
            <p>
              Forecast colors are a qualitative corridor view, not weather
              radar.
            </p>
          </details>
        </aside>
        <section className="map-area" aria-label="Routes and weather map">
          <RouteMap
            result={result}
            selected={selected}
            checkpoint={checkpoint}
            hour={hour}
            weather={weather}
            onRoute={chooseRoute}
            onCheckpoint={chooseCheckpoint}
          />
          <div className="map-toolbar">
            <button
              type="button"
              className="weather-toggle forecast-toggle"
              aria-label="Weather forecast panel"
              aria-expanded={forecastOpen}
              aria-controls="weather-forecast-panel"
              title={forecastOpen ? "Hide weather forecast" : "Show weather forecast"}
              onClick={() => setForecastOpen((value) => !value)}
            >
              <CloudSun size={17} />
              <span>Forecast</span>
              <ChevronDown
                size={14}
                style={{ transform: forecastOpen ? "rotate(180deg)" : undefined }}
              />
            </button>
            <button
              type="button"
              className="weather-toggle"
              role="switch"
              aria-checked={weather}
              onClick={() => setWeather((value) => !value)}
            >
              <Layers size={17} />
              <span>Weather layer</span>
              <i className={weather ? "switch on" : "switch"} />
            </button>
          </div>
          {result ? (
            <div className="trip-map-label">
              <span className="live-dot" />
              <span>{result.trip.origin.label.split(",")[0]}</span>
              <ArrowRight size={14} />
              <span>{result.trip.destination.label.split(",")[0]}</span>
              <small>ETA-based route risk</small>
            </div>
          ) : null}
          {busy && (
            <div className="map-loading" role="status">
              <LoaderCircle size={25} className="spin" />
              <div>
                <strong>Finding your clearer route</strong>
                <span>Routes, checkpoints, and hourly forecasts</span>
              </div>
            </div>
          )}
          {point && route && (
            <CheckpointDetails
              point={point}
              index={checkpoint!}
              routeId={route.id}
              onClose={() => setCheckpoint(null)}
            />
          )}
          <div id="weather-forecast-panel" hidden={!forecastOpen}>
            <ForecastBar result={result} hour={hour} onChange={changeHour} />
          </div>
        </section>
      </main>
    </div>
  );
}
