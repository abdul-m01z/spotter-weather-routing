import { Clock3, CloudRain, MapPin, Snowflake, Wind, X } from "lucide-react";
import { dateTime, miles } from "../format";
import { riskColors, riskLabels, type Checkpoint } from "../types";

export function CheckpointDetails({
  point,
  index,
  routeId,
  onClose,
}: {
  point: Checkpoint;
  index: number;
  routeId: string;
  onClose: () => void;
}) {
  const weather = point.weather;
  const value = (n: number | null, digits = 1) =>
    n === null ? "Unavailable" : n.toFixed(digits);
  return (
    <section className="checkpoint-details" aria-label="Checkpoint details">
      <div className="checkpoint-heading">
        <span className="eyebrow">
          ROUTE {routeId} · CHECKPOINT {index + 1}
        </span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close checkpoint details"
        >
          <X size={16} />
        </button>
      </div>
      <h3>
        <MapPin size={17} />
        {miles(point.distance_miles)} miles into your trip
      </h3>
      <p className="checkpoint-arrival">
        <Clock3 size={15} />
        {dateTime(point.eta)}
      </p>
      <div className="weather-readings">
        <div>
          <Wind size={18} />
          <span>Wind</span>
          <strong>
            {value(weather.wind_mph)}{" "}
            <small>{weather.wind_mph !== null && "mph"}</small>
          </strong>
        </div>
        <div>
          <CloudRain size={18} />
          <span>Rain</span>
          <strong>
            {value(weather.rain_in_hr, 2)}{" "}
            <small>{weather.rain_in_hr !== null && "in/hr"}</small>
          </strong>
        </div>
        <div>
          <Snowflake size={18} />
          <span>Snow</span>
          <strong>
            {value(weather.snow_in_hr, 2)}{" "}
            <small>{weather.snow_in_hr !== null && "in/hr"}</small>
          </strong>
        </div>
      </div>
      <div className="checkpoint-risk">
        <span
          className="risk-badge"
          style={{ color: weather.risk ? riskColors[weather.risk] : "#adbbcb" }}
        >
          {weather.risk
            ? `${riskLabels[weather.risk]} risk`
            : "Unknown weather"}
        </span>
        <p>{weather.reason}</p>
      </div>
      <small className="muted">
        Hourly forecast sampled at this checkpoint’s arrival.
      </small>
    </section>
  );
}
