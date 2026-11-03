import { CloudSun, Info } from "lucide-react";
import { dateTime } from "../format";
import { riskColors, riskLabels, type Comparison, type Risk } from "../types";

const descriptions: Record<Risk, string> = {
  low: "Below risk thresholds",
  moderate: "Minor impacts possible",
  high: "Slower travel expected",
  severe: "Hazardous conditions",
  no_travel: "Travel not advised",
};
interface Props {
  result: Comparison | null;
  hour: number;
  onChange: (hour: number) => void;
}
export function ForecastBar({ result, hour, onChange }: Props) {
  const known = result?.coverage[hour] || 0;
  return (
    <section
      className={`forecast-bar ${!result ? "inactive" : ""}`}
      aria-label="Weather forecast controls"
    >
      <div className="forecast-heading">
        <div className="forecast-title">
          <CloudSun size={20} />
          <h2>Weather forecast</h2>
        </div>
        <p>
          {result
            ? dateTime(result.timeline[hour])
            : "Your next 48 hours, along the way"}
        </p>
        <span className="forecast-note">
          Map snapshot · trip risk uses arrival times
        </span>
      </div>
      <div className="forecast-slider">
        <label htmlFor="forecast-hour" className="sr-only">
          Forecast hours after departure
        </label>
        <output htmlFor="forecast-hour" className="forecast-output">
          {hour === 0 ? "At departure" : `+${hour} hours`}
        </output>
        <input
          id="forecast-hour"
          type="range"
          min="0"
          max="48"
          step="1"
          value={hour}
          disabled={!result}
          aria-valuetext={
            result
              ? `${hour} hours after departure, ${dateTime(result.timeline[hour])}`
              : "Compare a trip first"
          }
          onChange={(event) => onChange(Number(event.target.value))}
          style={
            { "--progress": `${(hour / 48) * 100}%` } as React.CSSProperties
          }
        />
        <div className="slider-ticks">
          <span>Departure</span>
          <span>+12h</span>
          <span>+24h</span>
          <span>+36h</span>
          <span>+48h</span>
        </div>
        {result && known < result.samples.length && (
          <span className="coverage-warning">
            <Info size={12} />
            {known}/{result.samples.length} locations available
          </span>
        )}
      </div>
      <div className="risk-legend" aria-label="Weather risk legend">
        {(Object.keys(riskLabels) as Risk[]).map((risk) => (
          <div key={risk} className="legend-item">
            <div>
              <i style={{ background: riskColors[risk] }} />
              <strong>{riskLabels[risk]}</strong>
            </div>
            <span>{descriptions[risk]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
