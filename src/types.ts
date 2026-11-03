export type Risk = "low" | "moderate" | "high" | "severe" | "no_travel";
export type Coordinate = [number, number];
export interface Place {
  label: string;
  coordinate: Coordinate;
}
export interface Weather {
  wind_mph: number | null;
  rain_in_hr: number | null;
  snow_in_hr: number | null;
  risk: Risk | null;
  reason: string;
}
export interface Checkpoint {
  coordinate: Coordinate;
  distance_miles: number;
  elapsed_seconds: number;
  eta: number;
  sample_id: number;
  weather: Weather;
}
export interface Route {
  id: string;
  name: string;
  geometry: GeoJSON.LineString;
  distance_miles: number;
  duration_seconds: number;
  arrival: number;
  checkpoints: Checkpoint[];
  segments: {
    coordinates: Coordinate[];
    distance_miles: number;
    risk: Risk | null;
  }[];
  miles_by_risk: Record<Risk, number>;
  unknown_miles: number;
  blocked: boolean;
  incomplete: boolean;
  eligible: boolean;
  average_risk: number | null;
}
export interface Comparison {
  trip: {
    origin: Place;
    destination: Place;
    departure: number;
    load_lb: number;
    interval_miles: number;
  };
  assessed_at: number;
  weather_fetched_at: number | null;
  route_count: number;
  routes: Route[];
  recommended_id: string | null;
  explanation: string;
  warnings: string[];
  timeline: number[];
  samples: {
    id: number;
    coordinate: Coordinate;
    forecasts: Omit<Weather, "reason">[];
  }[];
  coverage: number[];
}
export const riskLabels: Record<Risk, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  severe: "Severe",
  no_travel: "No Travel",
};
export const riskColors: Record<Risk, string> = {
  low: "#36cb91",
  moderate: "#ffe168",
  high: "#ff963f",
  severe: "#ff7a7d",
  no_travel: "#ee355d",
};
export const routeColors = ["#00d5c7", "#9790ff", "#b7c9d6"];
export function routeColor(
  id: string,
  routes: Route[],
  recommendedId: string | null,
) {
  const primary = recommendedId || routes[0]?.id;
  if (id === primary) return routeColors[0];
  const index = routes
    .filter((route) => route.id !== primary)
    .findIndex((route) => route.id === id);
  return routeColors[index + 1] || routeColors[2];
}
