import { useEffect, useRef, useState } from "react";
import type { Map as MapboxMap, GeoJSONSource } from "mapbox-gl";
import type { FeatureCollection } from "geojson";
import { MapPinned } from "lucide-react";
import { riskColors, routeColor, type Comparison } from "../types";

const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
interface Props {
  result: Comparison | null;
  selected: string | null;
  checkpoint: number | null;
  hour: number;
  weather: boolean;
  onRoute: (id: string) => void;
  onCheckpoint: (routeId: string, index: number) => void;
}

export function RouteMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState("");
  const lastResult = useRef<Comparison | null>(null);
  const token = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN;

  useEffect(() => {
    let disposed = false;
    if (!token) {
      setProblem(
        "Add VITE_MAPBOX_PUBLIC_TOKEN to .env and restart the frontend to load the map.",
      );
      return;
    }
    void import("mapbox-gl")
      .then(({ default: mapboxgl }) => {
        if (disposed || !container.current) return;
        if (!mapboxgl.supported()) {
          setProblem(
            "This browser cannot display the interactive map. Route summaries and checkpoint details are still available.",
          );
          return;
        }
        const instance = new mapboxgl.Map({
          container: container.current,
          accessToken: token,
          style: "mapbox://styles/mapbox/dark-v11",
          center: [-96, 38],
          zoom: 3.6,
          attributionControl: false,
          logoPosition: "bottom-left",
        });
        map.current = instance;
        instance.addControl(
          new mapboxgl.NavigationControl({ showCompass: false }),
          "top-right",
        );
        instance.addControl(
          new mapboxgl.AttributionControl({
            compact: true,
            customAttribution:
              '<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather: Open-Meteo</a>',
          }),
          "bottom-right",
        );
        instance.on("error", (event) => {
          if (
            "status" in event.error &&
            [401, 403].includes(Number(event.error.status))
          )
            setProblem(
              "Mapbox could not load the map. Check the public token and its allowed URLs.",
            );
        });
        instance.on("load", () => {
          if (disposed) return;
          for (const id of [
            "routes",
            "segments",
            "points",
            "weather",
            "endpoints",
            "focus",
          ])
            instance.addSource(id, { type: "geojson", data: empty });
          // Muted land/water keep the road network legible under route and weather layers.
          for (const layer of instance.getStyle().layers || []) {
            if (layer.type === "background")
              instance.setPaintProperty(
                layer.id,
                "background-color",
                "#041b29",
              );
            if (layer.id === "water" && layer.type === "fill")
              instance.setPaintProperty(layer.id, "fill-color", "#03121e");
            if (layer.type === "symbol" && layer.layout?.["text-field"]) {
              instance.setPaintProperty(layer.id, "text-color", "#acc4d4");
              instance.setPaintProperty(layer.id, "text-halo-color", "#041b29");
            }
            if (
              layer.type === "line" &&
              (layer.id.startsWith("road") || layer.id.startsWith("admin"))
            )
              instance.setPaintProperty(layer.id, "line-color", "#2c526a");
            if (layer.id === "land" && layer.type === "background")
              instance.setPaintProperty(
                layer.id,
                "background-color",
                "#062434",
              );
          }
          instance.addLayer({
            id: "weather-low",
            type: "circle",
            source: "weather",
            paint: {
              "circle-color": "#36cb91",
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                3,
                12,
                8,
                34,
              ],
              "circle-blur": 1,
              "circle-opacity": 0.13,
            },
          });
          instance.addLayer({
            id: "weather-heat",
            type: "heatmap",
            source: "weather",
            filter: [">", ["get", "level"], 0],
            paint: {
              "heatmap-weight": [
                "interpolate",
                ["linear"],
                ["get", "level"],
                1,
                0.3,
                4,
                1,
              ],
              "heatmap-intensity": 0.65,
              "heatmap-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                3,
                22,
                8,
                55,
              ],
              "heatmap-opacity": 0.65,
              "heatmap-color": [
                "interpolate",
                ["linear"],
                ["heatmap-density"],
                0,
                "rgba(255,225,104,0)",
                0.15,
                "#ffe168",
                0.4,
                "#ff963f",
                0.7,
                "#ff7a7d",
                1,
                "#ee355d",
              ],
            },
          });
          instance.addLayer({
            id: "route-casing",
            type: "line",
            source: "routes",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": "#031521",
              "line-width": 9,
              "line-opacity": 0.85,
            },
          });
          instance.addLayer({
            id: "route-lines",
            type: "line",
            source: "routes",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": ["get", "color"],
              "line-width": ["case", ["get", "selected"], 5, 3],
              "line-opacity": ["case", ["get", "selected"], 1, 0.7],
            },
          });
          instance.addLayer({
            id: "route-risks",
            type: "line",
            source: "segments",
            filter: ["!=", ["get", "risk"], "low"],
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": ["get", "color"],
              "line-width": 3,
              "line-dasharray": [2, 1],
            },
          });
          instance.addLayer({
            id: "checkpoint-points",
            type: "circle",
            source: "points",
            paint: {
              "circle-radius": ["case", ["get", "selected"], 4, 3],
              "circle-color": ["get", "color"],
              "circle-stroke-color": ["get", "outline"],
              "circle-stroke-width": 1.6,
              "circle-opacity": ["case", ["get", "selected"], 1, 0.7],
            },
          });
          instance.addLayer({
            id: "endpoint-circles",
            type: "circle",
            source: "endpoints",
            paint: {
              "circle-radius": 8,
              "circle-color": "#042939",
              "circle-stroke-color": "#e6fbfb",
              "circle-stroke-width": 3,
            },
          });
          instance.addLayer({
            id: "endpoint-labels",
            type: "symbol",
            source: "endpoints",
            layout: {
              "text-field": ["get", "name"],
              "text-size": 17,
              "text-offset": [0, 1.4],
              "text-anchor": "top",
            },
            paint: {
              "text-color": "#f1f7ff",
              "text-halo-color": "#031521",
              "text-halo-width": 2,
            },
          });
          instance.addLayer({
            id: "focus-point",
            type: "circle",
            source: "focus",
            paint: {
              "circle-radius": 8,
              "circle-color": "#00d5c7",
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 3,
            },
          });
          instance.on("click", (event) => {
            const features = instance.queryRenderedFeatures(event.point, {
              layers: ["checkpoint-points", "route-lines"],
            });
            const checkpoint = features.find(
              (feature) => feature.layer?.id === "checkpoint-points",
            )?.properties;
            if (checkpoint)
              latest.current.onCheckpoint(
                checkpoint.route,
                Number(checkpoint.index),
              );
            else {
              const route = features.find(
                (feature) => feature.layer?.id === "route-lines",
              )?.properties;
              if (route) latest.current.onRoute(route.id);
            }
          });
          for (const id of ["route-lines", "checkpoint-points"]) {
            instance.on("mouseenter", id, () => {
              instance.getCanvas().style.cursor = "pointer";
            });
            instance.on("mouseleave", id, () => {
              instance.getCanvas().style.cursor = "";
            });
          }
          setReady(true);
        });
      })
      .catch(() =>
        setProblem("The map library could not load. Please refresh the page."),
      );
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
  }, [token]);

  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    const { result, selected } = props;
    const set = (id: string, features: FeatureCollection["features"]) =>
      (instance.getSource(id) as GeoJSONSource).setData({
        type: "FeatureCollection",
        features,
      });
    if (!result) return;
    const ordered = [...result.routes].sort(
      (a, b) => Number(a.id === selected) - Number(b.id === selected),
    );
    const color = (id: string) =>
      routeColor(id, result.routes, result.recommended_id);
    set(
      "routes",
      ordered.map((route) => ({
        type: "Feature",
        geometry: route.geometry,
        properties: {
          id: route.id,
          color: color(route.id),
          selected: route.id === selected,
        },
      })),
    );
    set(
      "segments",
      ordered.flatMap((route) =>
        route.segments.map((segment) => ({
          type: "Feature",
          geometry: { type: "LineString", coordinates: segment.coordinates },
          properties: {
            risk: segment.risk || "unknown",
            color: segment.risk ? riskColors[segment.risk] : "#8897a9",
          },
        })),
      ),
    );
    set(
      "points",
      ordered.flatMap((route) =>
        route.checkpoints.map((point, index) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: point.coordinate },
          properties: {
            route: route.id,
            index,
            color: color(route.id),
            outline: !point.weather.risk
              ? "#8c9bab"
              : point.weather.risk === "low"
                ? "#e3f7ff"
                : riskColors[point.weather.risk],
            selected: route.id === selected,
          },
        })),
      ),
    );
    const first = result.routes[0].checkpoints;
    set("endpoints", [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: first[0].coordinate },
        properties: { name: result.trip.origin.label.split(",")[0] },
      },
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: first[first.length - 1].coordinate,
        },
        properties: { name: result.trip.destination.label.split(",")[0] },
      },
    ]);
    if (lastResult.current !== result) {
      let west = 180,
        east = -180,
        south = 90,
        north = -90;
      for (const route of result.routes)
        for (const [lng, lat] of route.geometry.coordinates) {
          west = Math.min(west, lng);
          east = Math.max(east, lng);
          south = Math.min(south, lat);
          north = Math.max(north, lat);
        }
      instance.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        {
          padding: { top: 90, right: 65, bottom: 190, left: 65 },
          duration: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? 0
            : 900,
          maxZoom: 11,
        },
      );
      lastResult.current = result;
    }
  }, [props.result, props.selected, ready]);

  useEffect(() => {
    if (!ready || !map.current || !props.result) return;
    const { result, hour, weather } = props;
    const levels = { low: 0, moderate: 1, high: 2, severe: 3, no_travel: 4 };
    const features = weather
      ? result.samples.flatMap((sample) => {
          const risk = sample.forecasts[hour]?.risk;
          return risk
            ? [
                {
                  type: "Feature" as const,
                  geometry: {
                    type: "Point" as const,
                    coordinates: sample.coordinate,
                  },
                  properties: { level: levels[risk] },
                },
              ]
            : [];
        })
      : [];
    (map.current.getSource("weather") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features,
    });
  }, [props.result, props.hour, props.weather, ready]);

  useEffect(() => {
    if (!ready || !map.current) return;
    const point =
      props.checkpoint !== null
        ? props.result?.routes.find((route) => route.id === props.selected)
            ?.checkpoints[props.checkpoint]
        : null;
    const features = point
      ? [
          {
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: point.coordinate },
            properties: {},
          },
        ]
      : [];
    (map.current.getSource("focus") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features,
    });
  }, [props.result, props.selected, props.checkpoint, ready]);

  return (
    <>
      <div
        ref={container}
        className="map-canvas"
        role="region"
        aria-label="Interactive route map"
      />
      {problem && (
        <div className="map-problem" role="status">
          <MapPinned size={22} />
          <div>
            <strong>Map unavailable</strong>
            <p>{problem}</p>
          </div>
        </div>
      )}
    </>
  );
}
