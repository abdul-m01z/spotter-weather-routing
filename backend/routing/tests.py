"""Behavioral proof at the comparison API, with synthetic outbound HTTP data."""

import json
from datetime import datetime, timezone
from unittest.mock import patch

import httpx
from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from .domain import MILE, classify

NOW = datetime(2026, 11, 3, 12, tzinfo=timezone.utc)
DEPARTURE = NOW.timestamp() + 3600


def route(distances=(10, 10, 5), durations=(600, 1200, 300), shift=0):
    points = [
        [-97 + shift + index * 0.1, 33 + shift] for index in range(len(distances) + 1)
    ]
    return {
        "geometry": {"type": "LineString", "coordinates": points},
        "legs": [
            {
                "summary": "Synthetic road",
                "annotation": {
                    "distance": [distance * MILE for distance in distances],
                    "duration": list(durations),
                },
            }
        ],
    }


def forecast(wind=10, rain=0, snow=0, units=None, hours=168):
    start = int(NOW.timestamp() // 86400 * 86400)
    return {
        "hourly_units": units
        or {"wind_speed_10m": "mp/h", "rain": "inch", "snowfall": "inch"},
        "hourly": {
            "time": [start + index * 3600 for index in range(hours)],
            "wind_speed_10m": [wind] * hours,
            "rain": [rain] * hours,
            "snowfall": [snow] * hours,
        },
    }


@override_settings(MAPBOX_ACCESS_TOKEN="test-token-not-real")
class ComparisonAPITests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.routes = [route()]
        self.weather = lambda lon, lat: forecast()
        self.weather_failure = False
        self.routing_status = 200
        self.clock = patch("routing.views.datetime")
        clock = self.clock.start()
        clock.now.return_value = NOW
        self.addCleanup(self.clock.stop)
        self.http = patch("httpx.AsyncClient.get", new=self.provider_get)
        self.http.start()
        self.addCleanup(self.http.stop)

    async def provider_get(self, url, params=None):
        request = httpx.Request("GET", url)
        if "directions" in url:
            return httpx.Response(
                self.routing_status, json={"routes": self.routes}, request=request
            )
        if "geocode" in url:
            return httpx.Response(
                200,
                json={
                    "features": [
                        {
                            "properties": {
                                "full_address": "Dallas, Texas, United States",
                                "context": {"region": {"region_code": "TX"}},
                            },
                            "geometry": {"coordinates": [-96.8, 32.8]},
                        },
                        {
                            "properties": {
                                "full_address": "Honolulu",
                                "context": {"region": {"region_code": "HI"}},
                            },
                            "geometry": {"coordinates": [-157, 21]},
                        },
                    ]
                },
                request=request,
            )
        if self.weather_failure:
            raise httpx.ReadTimeout("Timeout", request=request)
        longitudes = [float(value) for value in params["longitude"].split(",")]
        latitudes = [float(value) for value in params["latitude"].split(",")]
        data = [self.weather(lon, lat) for lon, lat in zip(longitudes, latitudes)]
        return httpx.Response(
            200, json=data if len(data) > 1 else data[0], request=request
        )

    def compare(self, **overrides):
        data = {
            "origin": {"label": "Origin", "coordinate": [-97, 33]},
            "destination": {"label": "Destination", "coordinate": [-96, 34]},
            "departure": datetime.fromtimestamp(DEPARTURE, timezone.utc).isoformat(),
            "load_lb": 38000,
            "interval_miles": 10,
        }
        data.update(overrides)
        return self.client.post(
            "/api/compare", data=json.dumps(data), content_type="application/json"
        )

    def test_checkpoints_follow_road_distance_and_segment_speed(self):
        response = self.compare()
        self.assertEqual(response.status_code, 200)
        data = response.json()
        result = data["routes"][0]
        self.assertEqual(
            [point["distance_miles"] for point in result["checkpoints"]],
            [0, 10, 20, 25],
        )
        self.assertEqual(
            [point["elapsed_seconds"] for point in result["checkpoints"]],
            [0, 600, 1800, 2100],
        )
        self.assertEqual(result["arrival"], DEPARTURE + 2100)
        self.assertEqual(result["checkpoints"][1]["coordinate"], [-96.9, 33])
        self.assertEqual(result["miles_by_risk"]["low"], 25)
        self.assertEqual(
            sum(result["miles_by_risk"].values()) + result["unknown_miles"],
            result["distance_miles"],
        )
        self.assertEqual(len(data["timeline"]), 49)
        self.assertEqual(data["timeline"][-1] - data["timeline"][0], 48 * 3600)
        self.assertEqual(data["recommended_id"], "A")
        self.assertIn("1 distinct", data["warnings"][0])

    def test_checkpoint_interpolation_and_exact_or_short_final_interval(self):
        for distances, expected in [
            ((25,), [0, 10, 20, 25]),
            ((20,), [0, 10, 20]),
            ((3,), [0, 3]),
        ]:
            with self.subTest(distances=distances):
                self.routes = [route(distances, (1500,))]
                data = self.compare().json()["routes"][0]
                self.assertEqual(
                    [p["distance_miles"] for p in data["checkpoints"]], expected
                )
                if distances == (25,):
                    self.assertAlmostEqual(
                        data["checkpoints"][1]["coordinate"][0], -96.96
                    )
                    self.assertEqual(data["checkpoints"][1]["elapsed_seconds"], 600)

    def test_zero_distance_segment_preserves_elapsed_time(self):
        self.routes = [route((0, 20), (60, 1200))]
        data = self.compare().json()["routes"][0]
        self.assertEqual(len(data["checkpoints"]), 3)
        self.assertEqual(data["checkpoints"][0]["eta"], DEPARTURE)
        self.assertEqual(data["arrival"], DEPARTURE + 1260)

    def test_weather_uses_eta_and_containing_precipitation_hour(self):
        self.routes = [route((20,), (3600,))]

        def changing_weather(lon, lat):
            result = forecast()
            start = result["hourly"]["time"][0]
            index = int((DEPARTURE + 3600 - start) // 3600)
            result["hourly"]["rain"][index] = 0.6
            result["hourly"]["wind_speed_10m"][index] = 40
            return result

        self.weather = changing_weather
        data = self.compare(
            departure=datetime.fromtimestamp(
                DEPARTURE + 20 * 60, timezone.utc
            ).isoformat()
        ).json()
        points = data["routes"][0]["checkpoints"]
        self.assertEqual(points[0]["weather"]["rain_in_hr"], 0.6)
        self.assertEqual(points[0]["weather"]["wind_mph"], 10)
        self.assertEqual(
            points[1]["weather"]["wind_mph"], 40
        )  # 13:50 rounds forward to 14:00
        self.assertEqual(points[1]["weather"]["rain_in_hr"], 0.6)
        self.assertEqual(points[-1]["weather"]["rain_in_hr"], 0)
        self.assertEqual(data["samples"][0]["forecasts"][0]["risk"], "severe")

    def test_risk_thresholds_through_api_match_map_snapshots(self):
        cases = [
            (24.99, 0, 0, "low"),
            (25, 0, 0, "moderate"),
            (34.9, 0, 0, "moderate"),
            (35, 0, 0, "high"),
            (44.99, 0, 0, "high"),
            (45, 0, 0, "severe"),
            (54.99, 0, 0, "severe"),
            (55, 0, 0, "no_travel"),
            (0, 0.099, 0, "low"),
            (0, 0.10, 0, "moderate"),
            (0, 0.249, 0, "moderate"),
            (0, 0.25, 0, "high"),
            (0, 0.499, 0, "high"),
            (0, 0.5, 0, "severe"),
            (0, 1, 0, "severe"),
            (0, 1.001, 0, "no_travel"),
            (0, 0, 0.499, "low"),
            (0, 0, 0.5, "moderate"),
            (0, 0, 0.999, "moderate"),
            (0, 0, 1, "high"),
            (0, 0, 1.999, "high"),
            (0, 0, 2, "severe"),
            (0, 0, 3, "severe"),
            (0, 0, 3.001, "no_travel"),
        ]
        for wind, rain, snow, expected in cases:
            with self.subTest(wind=wind, rain=rain, snow=snow):
                cache.clear()
                self.weather = lambda lon, lat: forecast(wind, rain, snow)
                data = self.compare(load_lb=0).json()
                self.assertEqual(
                    data["routes"][0]["checkpoints"][0]["weather"]["risk"], expected
                )
                self.assertEqual(data["samples"][0]["forecasts"][0]["risk"], expected)

    def test_load_boundaries_and_simultaneous_hazards(self):
        for wind, load, expected in [
            (45, 30000, "severe"),
            (45, 30000.1, "no_travel"),
            (35, 40000, "high"),
            (35, 40000.1, "severe"),
            (55, 0, "no_travel"),
        ]:
            with self.subTest(wind=wind, load=load):
                cache.clear()
                self.weather = lambda lon, lat: forecast(wind)
                data = self.compare(load_lb=load).json()
                self.assertEqual(
                    data["routes"][0]["checkpoints"][0]["weather"]["risk"], expected
                )
        self.assertEqual(classify(35, 2, 0, 41000)[0], "no_travel")

    def test_no_travel_and_unknown_routes_are_not_recommended(self):
        for data in (forecast(55), forecast(None), forecast(10, None, 0)):
            with self.subTest(data=data["hourly"]["wind_speed_10m"][0]):
                cache.clear()
                self.weather = lambda lon, lat: data
                result = self.compare().json()
                self.assertIsNone(result["recommended_id"])
                self.assertFalse(result["routes"][0]["eligible"])

    def test_blocked_and_unknown_are_both_retained(self):
        self.routes = [route((20,), (1200,))]
        self.weather = lambda lon, lat: forecast(55 if lon == -97 else None)
        result = self.compare().json()["routes"][0]
        self.assertTrue(result["blocked"])
        self.assertTrue(result["incomplete"])
        self.assertEqual(
            sum(result["miles_by_risk"].values()) + result["unknown_miles"],
            result["distance_miles"],
        )

    def test_unit_metadata_drives_conversion(self):
        self.weather = lambda lon, lat: forecast(
            40, 2.54, 2.54, {"wind_speed_10m": "km/h", "rain": "mm", "snowfall": "cm"}
        )
        weather = self.compare(load_lb=0).json()["routes"][0]["checkpoints"][0][
            "weather"
        ]
        self.assertAlmostEqual(weather["wind_mph"], 24.854847689)
        self.assertAlmostEqual(weather["rain_in_hr"], 0.1)
        self.assertEqual(weather["snow_in_hr"], 1)
        self.assertEqual(weather["risk"], "high")

    def test_unknown_unit_and_negative_values_are_unknown(self):
        for data in (
            forecast(-1),
            forecast(
                units={"wind_speed_10m": "unknown", "rain": "inch", "snowfall": "inch"}
            ),
        ):
            cache.clear()
            self.weather = lambda lon, lat: data
            self.assertIsNone(self.compare().json()["recommended_id"])

    def test_later_snapshot_gap_does_not_remove_eta_recommendation(self):
        self.weather = lambda lon, lat: forecast(hours=24)
        data = self.compare().json()
        self.assertEqual(data["recommended_id"], "A")
        self.assertEqual(data["coverage"][-1], 0)
        self.assertIsNone(data["samples"][0]["forecasts"][-1]["risk"])

    def test_ranking_prefers_safest_over_fastest(self):
        self.routes = [
            route(shift=0),
            route(durations=(1200, 2400, 600), shift=1),
            route(shift=2),
        ]
        self.weather = lambda lon, lat: forecast({33: 40, 34: 10, 35: 55}[lat])
        data = self.compare().json()
        self.assertEqual(data["recommended_id"], "B")
        self.assertTrue(data["routes"][2]["blocked"])

    def test_lexicographic_tiebreakers(self):
        # Latitude isolates the synthetic routes; wind gives each a chosen category.
        cases = [
            (45, 35, 100, 200, "B"),
            (35, 25, 100, 200, "B"),
            (25, 10, 100, 200, "B"),
            (10, 10, 200, 100, "B"),
            (10, 10, 100, 100, "A"),
        ]
        for first, second, time_a, time_b, winner in cases:
            with self.subTest(first=first, second=second, time_a=time_a, time_b=time_b):
                cache.clear()
                self.routes = [route((20,), (time_a,), 0), route((20,), (time_b,), 1)]
                self.weather = lambda lon, lat: forecast(first if lat == 33 else second)
                self.assertEqual(
                    self.compare(load_lb=0).json()["recommended_id"], winner
                )

    def test_distances_are_weighted_and_conservatively_attributed(self):
        self.routes = [route((10, 10, 5), (100, 100, 50))]
        self.weather = lambda lon, lat: forecast(25 if lon > -96.8 else 10)
        result = self.compare(load_lb=0).json()["routes"][0]
        self.assertEqual(result["miles_by_risk"]["moderate"], 5)
        self.assertAlmostEqual(result["average_risk"], 0.2)

    def test_duplicate_and_malformed_routes_are_omitted(self):
        malformed = route(shift=1)
        malformed["legs"][0]["annotation"]["duration"] = []
        self.routes = [route(), route(), malformed]
        result = self.compare().json()
        self.assertEqual(result["route_count"], 1)
        self.assertTrue(any("malformed" in text for text in result["warnings"]))

    def test_partial_weather_failure_is_an_honest_comparison(self):
        self.weather_failure = True
        response = self.compare()
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["recommended_id"])
        self.assertEqual(response.json()["routes"][0]["unknown_miles"], 25)

    def test_routing_errors_do_not_leak_credentials(self):
        for status in (401, 403, 429, 500):
            self.routing_status = status
            response = self.compare()
            self.assertIn(response.status_code, (429, 502, 503))
            self.assertNotIn("test-token-not-real", response.content.decode())
        self.routes = []
        self.routing_status = 200
        self.assertEqual(self.compare().status_code, 422)

    @override_settings(MAPBOX_ACCESS_TOKEN="")
    def test_missing_token_is_actionable(self):
        response = self.compare()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"]["code"], "configuration_required")

    def test_validation_rejects_invalid_input(self):
        for patch_data in [
            {"interval_miles": 20},
            {"load_lb": -1},
            {"load_lb": True},
            {"load_lb": float("nan")},
            {"load_lb": "38000"},
            {"origin": {"label": "Outside scope", "coordinate": [0, 0]}},
            {"departure": "2026-11-03T14:00:00"},
            {"departure": "2026-11-03T14:00:00Zjunk"},
            {"departure": "2026-12-01T14:00:00Z"},
        ]:
            with self.subTest(patch_data=patch_data):
                self.assertEqual(self.compare(**patch_data).status_code, 400)
        self.assertEqual(
            self.client.post(
                "/api/compare", data="{bad", content_type="application/json"
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(
                "/api/compare", data="[]", content_type="application/json"
            ).status_code,
            400,
        )
        self.assertEqual(self.client.get("/api/compare").status_code, 405)
        self.assertEqual(
            self.client.post(
                "/api/compare", data="{}", content_type="text/plain"
            ).status_code,
            415,
        )

    def test_geocoding_scope_and_no_store(self):
        response = self.client.get("/api/places", {"query": "Dallas"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["places"]), 1)
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertEqual(
            self.client.get("/api/places", {"query": "a"}).status_code, 400
        )

    def test_oversized_request_has_a_json_error(self):
        response = self.client.post(
            "/api/compare", data=" " * 17000, content_type="application/json"
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json()["error"]["code"], "invalid_request")

    def test_documented_worked_example(self):
        self.routes = [route((25,), (3000,))]
        self.weather = lambda lon, lat: forecast(
            38 if abs(lon + 96.96) < 0.000001 else 10
        )
        result = self.compare().json()["routes"][0]
        self.assertEqual(
            [p["elapsed_seconds"] for p in result["checkpoints"]], [0, 1200, 2400, 3000]
        )
        self.assertEqual(result["miles_by_risk"]["high"], 20)
        self.assertEqual(result["miles_by_risk"]["low"], 5)
        self.assertEqual(result["average_risk"], 1.6)

    def test_extreme_json_integers_are_validation_errors(self):
        self.assertEqual(self.compare(load_lb=10**400).status_code, 400)
        self.assertEqual(
            self.compare(
                origin={"label": "Invalid", "coordinate": [10**400, 33]}
            ).status_code,
            400,
        )
