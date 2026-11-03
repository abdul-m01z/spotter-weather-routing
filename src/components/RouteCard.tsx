import {
  ArrowUpRight,
  Ban,
  CheckCircle2,
  Clock3,
  CloudSun,
  Route as RouteIcon,
  TriangleAlert,
} from "lucide-react";
import { dateTime, duration, miles } from "../format";
import type { Route } from "../types";

interface Props {
  route: Route;
  color: string;
  selected: boolean;
  recommended: boolean;
  explanation: string;
  onSelect: () => void;
}
export function RouteCard({
  route,
  color,
  selected,
  recommended,
  explanation,
  onSelect,
}: Props) {
  return (
    <button
      type="button"
      className={`route-card ${selected ? "selected" : ""} ${recommended ? "recommended" : ""}`}
      style={{ "--route-color": color } as React.CSSProperties}
      aria-pressed={selected}
      aria-label={`Select route ${route.id}: ${route.name}`}
      onClick={onSelect}
    >
      <div className="route-card-heading">
        <strong>
          <span className="route-letter">{route.id}</span>
          <span className="route-name">
            {route.name === `Route ${route.id}` ? "Road route" : route.name}
          </span>
        </strong>
        {recommended ? (
          <span className="recommended-badge">Recommended</span>
        ) : (
          <ArrowUpRight size={17} className="route-arrow" />
        )}
      </div>
      <div className="route-line">
        <RouteIcon size={15} />
        <span>
          {miles(route.distance_miles)} mi<span className="dot">·</span>
          {duration(route.duration_seconds)}
        </span>
      </div>
      <div className="route-line">
        <Clock3 size={15} />
        <span>Arrives {dateTime(route.arrival)}</span>
      </div>
      {route.blocked && (
        <div className="route-line risk-no_travel">
          <Ban size={15} />
          <span>
            No Travel
            {route.miles_by_risk.no_travel > 0
              ? ` · ${miles(route.miles_by_risk.no_travel)} mi`
              : " conditions"}
          </span>
        </div>
      )}
      {route.incomplete && (
        <div className="route-line unknown">
          <TriangleAlert size={15} />
          <span>{miles(route.unknown_miles)} mi with unknown weather</span>
        </div>
      )}
      {!route.blocked && (
        <div
          className={`route-line ${route.miles_by_risk.severe > 0 ? "risk-severe" : route.miles_by_risk.high > 0 ? "risk-high" : ""}`}
        >
          <CloudSun size={15} />
          <span>
            {miles(route.miles_by_risk.severe)} Severe mi
            <span className="dot">·</span>
            {miles(route.miles_by_risk.high)} High mi
          </span>
        </div>
      )}
      {recommended && (
        <div className="route-reason">
          <CheckCircle2 size={15} />
          <span>{explanation}</span>
        </div>
      )}
    </button>
  );
}
