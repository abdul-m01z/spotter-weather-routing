"""Concrete integrations. Provider failures are sanitized before reaching the API."""

import asyncio
import time

import httpx
from django.conf import settings
from django.core.cache import cache

from .domain import finite_number


class ProviderError(Exception):
    def __init__(self, message, code="provider_error", status=502):
        self.message, self.code, self.status = message, code, status
        super().__init__(message)


def mapbox_token():
    if not settings.MAPBOX_ACCESS_TOKEN:
        raise ProviderError(
            "Add MAPBOX_ACCESS_TOKEN to the root .env file, then restart Django.",
            "configuration_required",
            503,
        )
    return settings.MAPBOX_ACCESS_TOKEN


async def get_json(client, url, params):
    try:
        response = await client.get(url, params=params)
        response.raise_for_status()
        return response.json()
    except httpx.TimeoutException:
        raise ProviderError(
            "The data provider timed out. Please try again.", "provider_timeout", 504
        ) from None
    except httpx.HTTPStatusError as error:
        code = error.response.status_code
        if code == 429:
            raise ProviderError(
                "The provider's request limit was reached. Wait a moment and retry.",
                "rate_limited",
                429,
            ) from None
        if code in (401, 403):
            raise ProviderError(
                "The provider rejected the access token. Check its permissions and account access.",
                "configuration_required",
                503,
            ) from None
        raise ProviderError(
            "The data provider could not complete this request. Please try again."
        ) from None
    except (httpx.HTTPError, ValueError):
        raise ProviderError(
            "The data provider returned an unreadable response. Please retry."
        ) from None


async def search_places(query):
    async with httpx.AsyncClient(timeout=httpx.Timeout(10, connect=5)) as client:
        data = await get_json(
            client,
            "https://api.mapbox.com/search/geocode/v6/forward",
            {
                "q": query,
                "country": "us",
                "bbox": "-125,24,-66,50",
                "limit": 5,
                "autocomplete": "true",
                "permanent": "false",
                "access_token": mapbox_token(),
            },
        )
    if not isinstance(data, dict) or not isinstance(data.get("features"), list):
        raise ProviderError(
            "The location provider returned malformed results. Please retry."
        )
    places = []
    for feature in data["features"]:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties", {})
        context = properties.get("context", {})
        region = context.get("region", {}).get("region_code", "")
        point = feature.get("geometry", {}).get("coordinates", [])
        if (
            region in {"AK", "HI", "PR", "VI", "GU", "AS", "MP"}
            or not isinstance(point, list)
            or len(point) < 2
            or not all(finite_number(value) for value in point[:2])
            or not (-125 <= point[0] <= -66 and 24 <= point[1] <= 50)
        ):
            continue
        label = properties.get("full_address") or ", ".join(
            filter(None, [properties.get("name"), properties.get("place_formatted")])
        )
        places.append({"label": label[:250], "coordinate": point[:2]})
    return places


async def directions(origin, destination):
    coordinates = f"{origin[0]},{origin[1]};{destination[0]},{destination[1]}"
    async with httpx.AsyncClient(timeout=httpx.Timeout(10, connect=5)) as client:
        data = await get_json(
            client,
            f"https://api.mapbox.com/directions/v5/mapbox/driving/{coordinates}",
            {
                "alternatives": "true",
                "annotations": "distance,duration",
                "geometries": "geojson",
                "overview": "full",
                "steps": "false",
                "access_token": mapbox_token(),
            },
        )
    if not isinstance(data, dict) or not isinstance(data.get("routes", []), list):
        raise ProviderError(
            "The routing provider returned malformed results. Please retry."
        )
    routes = data.get("routes", [])
    if not routes:
        raise ProviderError(
            "No road route was found between these locations. Try different endpoints.",
            "no_route",
            422,
        )
    return routes[:3]


def normalize_forecast(data):
    units, hourly = data.get("hourly_units", {}), data.get("hourly", {})
    # Divide by the source-unit scale, rather than multiply by a rounded inverse:
    # 2.54 cm / 2.54 is exactly the 1-inch classification boundary.
    fields = {
        "wind_mph": (
            "wind_speed_10m",
            {"mp/h": 1, "mph": 1, "km/h": 1.609344, "m/s": 0.44704},
        ),
        "rain_in_hr": ("rain", {"inch": 1, "mm": 25.4}),
        "snow_in_hr": ("snowfall", {"inch": 1, "cm": 2.54}),
    }
    series = {}
    for index, timestamp in enumerate(hourly.get("time", [])):
        if not finite_number(timestamp):
            continue
        values = {}
        for name, (provider_name, scales) in fields.items():
            raw = hourly.get(provider_name, [])
            value = raw[index] if index < len(raw) else None
            scale = scales.get(units.get(provider_name))
            values[name] = (
                value / scale
                if finite_number(value) and value >= 0 and scale is not None
                else None
            )
        series[int(timestamp)] = values
    return series


async def forecasts(coordinates, deadline):
    """Return available batches even if one batch fails or the deadline expires."""
    results, fetched, missing, pending = {}, [], [], []
    date = time.strftime("%Y-%m-%d", time.gmtime())
    for sample_id, coordinate in enumerate(coordinates):
        key = f"weather:{date}:{coordinate[0]:.5f},{coordinate[1]:.5f}"
        cached = cache.get(key)
        if cached is not None:
            results[sample_id] = cached["series"]
            fetched.append(cached["fetched_at"])
        else:
            pending.append((sample_id, coordinate, key))
    semaphore = asyncio.Semaphore(4)
    async with httpx.AsyncClient(timeout=httpx.Timeout(12, connect=5)) as client:

        async def batch(items):
            async with semaphore:
                try:
                    data = await get_json(
                        client,
                        "https://api.open-meteo.com/v1/forecast",
                        {
                            "longitude": ",".join(str(item[1][0]) for item in items),
                            "latitude": ",".join(str(item[1][1]) for item in items),
                            "hourly": "wind_speed_10m,rain,snowfall",
                            "timezone": "GMT",
                            "timeformat": "unixtime",
                            "wind_speed_unit": "mph",
                            "precipitation_unit": "inch",
                            "forecast_days": 7,
                        },
                    )
                    data = data if isinstance(data, list) else [data]
                    if len(data) != len(items):
                        raise ProviderError(
                            "Weather provider returned incomplete coordinate results."
                        )
                    for (sample_id, _, key), forecast in zip(items, data):
                        series = normalize_forecast(forecast)
                        results[sample_id] = series
                        stamp = time.time()
                        if series:
                            fetched.append(stamp)
                        if series and all(
                            all(value is not None for value in row.values())
                            for row in series.values()
                        ):
                            cache.set(key, {"series": series, "fetched_at": stamp}, 600)
                except (ProviderError, TypeError, KeyError, AttributeError):
                    missing.extend(item[0] for item in items)

        tasks = [
            batch(pending[start : start + 25]) for start in range(0, len(pending), 25)
        ]
        if tasks:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*tasks), timeout=max(0.01, deadline)
                )
            except TimeoutError:
                missing.extend(
                    index for index in range(len(coordinates)) if index not in results
                )
    return results, min(fetched) if fetched else None, bool(missing)
