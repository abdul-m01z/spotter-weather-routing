import type { Comparison, Coordinate, Risk, Weather } from "../../src/types";

// Independently authored UI fixtures. These do not ship in the application.
export function comparisonFixture(): Comparison {
  const departure = Math.ceil((Date.now() + 3600_000) / 3600_000) * 3600;
  const weather = (risk: Risk): Weather => ({
    wind_mph: risk === "no_travel" ? 48 : risk === "high" ? 38 : 12,
    rain_in_hr: 0,
    snow_in_hr: 0,
    risk,
    reason:
      risk === "no_travel"
        ? "Wind 48 mph · load above 30,000 lb"
        : risk === "high"
          ? "Wind 38 mph"
          : "All sampled hazards are below Moderate thresholds.",
  });
  const coordinates: Coordinate[][] = [
    [
      [-96.797, 32.7767],
      [-96.2, 34.2],
      [-95.3, 36.2],
      [-93.2, 37.8],
      [-91.2, 39.6],
      [-87.6298, 41.8781],
    ],
    [
      [-96.797, 32.7767],
      [-95.1, 33.8],
      [-93.4, 35.2],
      [-91.3, 37.2],
      [-89.2, 40],
      [-87.6298, 41.8781],
    ],
    [
      [-96.797, 32.7767],
      [-94.2, 33.5],
      [-92.4, 35],
      [-90.2, 37.1],
      [-88.2, 39.8],
      [-87.6298, 41.8781],
    ],
  ];
  const samples: Comparison["samples"] = [];
  const routes = coordinates.map((points, index) => {
    const id = "ABC"[index],
      risk: Risk = index === 0 ? "low" : index === 1 ? "high" : "no_travel";
    const checkpoints = points.map((coordinate, checkpoint) => {
      const sample_id = samples.length;
      samples.push({
        id: sample_id,
        coordinate,
        forecasts: Array.from({ length: 49 }, (_, hour) =>
          weather(hour > 24 && index === 0 ? "moderate" : risk),
        ),
      });
      return {
        coordinate,
        distance_miles: checkpoint * 196.8,
        elapsed_seconds: checkpoint * 11640,
        eta: departure + checkpoint * 11640,
        sample_id,
        weather: weather(risk),
      };
    });
    return {
      id,
      name: ["I-44", "I-55", "I-57"][index],
      geometry: { type: "LineString" as const, coordinates: points },
      distance_miles: 984,
      duration_seconds: 58200 - index * 3000,
      arrival: departure + 58200 - index * 3000,
      checkpoints,
      segments: points.slice(1).map((point, i) => ({
        coordinates: [points[i], point],
        distance_miles: 196.8,
        risk,
      })),
      miles_by_risk: {
        low: index === 0 ? 984 : 0,
        moderate: 0,
        high: index === 1 ? 984 : 0,
        severe: 0,
        no_travel: index === 2 ? 984 : 0,
      },
      unknown_miles: 0,
      blocked: index === 2,
      incomplete: false,
      eligible: index !== 2,
      average_risk: index === 2 ? null : index,
    };
  });
  return {
    trip: {
      origin: { label: "Dallas, TX", coordinate: [-96.797, 32.7767] },
      destination: { label: "Chicago, IL", coordinate: [-87.6298, 41.8781] },
      departure,
      load_lb: 38000,
      interval_miles: 25,
    },
    assessed_at: Date.now() / 1000,
    weather_fetched_at: Date.now() / 1000,
    route_count: 3,
    routes,
    recommended_id: "A",
    explanation: "Fewest High miles (0.0 vs 984.0).",
    warnings: [],
    timeline: Array.from({ length: 49 }, (_, hour) => departure + hour * 3600),
    samples,
    coverage: Array(49).fill(samples.length),
  };
}
