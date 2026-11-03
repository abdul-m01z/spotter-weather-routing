import hashlib
import json
import time

from . import providers
from .domain import checkpoint_route, recommend, summarize, weather_at


async def compare_trip(trip):
    started = time.monotonic()
    raw_routes = await providers.directions(
        trip["origin"]["coordinate"], trip["destination"]["coordinate"]
    )
    routes, warnings, seen = [], [], set()
    departure = trip["departure"]
    for raw in raw_routes:
        try:
            signature = hashlib.sha256(
                json.dumps(raw["geometry"]["coordinates"]).encode()
            ).hexdigest()
            if signature in seen:
                continue
            route = checkpoint_route(
                raw, trip["interval_miles"], departure, chr(65 + len(routes))
            )
            seen.add(signature)
            routes.append(route)
        except (KeyError, TypeError, ValueError, IndexError):
            warnings.append(
                "A malformed route was omitted. Try a larger interval or different endpoints if routes are missing."
            )
    if not routes:
        raise providers.ProviderError(
            "No usable routes were returned. Try different endpoints or a larger checkpoint interval.",
            "invalid_routes",
        )
    coordinates, sample_ids = [], {}
    for route in routes:
        for checkpoint in route["checkpoints"]:
            key = tuple(round(value, 5) for value in checkpoint["coordinate"])
            if key not in sample_ids:
                sample_ids[key] = len(coordinates)
                coordinates.append(list(key))
            checkpoint["sample_id"] = sample_ids[key]
    if len(coordinates) > 1500:
        raise providers.ProviderError(
            "This trip has too many checkpoints. Choose a larger interval.",
            "too_many_checkpoints",
            422,
        )
    weather, fetched_at, partial = await providers.forecasts(
        coordinates, 42 - (time.monotonic() - started)
    )
    load = trip["load_lb"]
    for route in routes:
        for checkpoint in route["checkpoints"]:
            checkpoint["weather"] = weather_at(
                weather.get(checkpoint["sample_id"], {}), checkpoint["eta"], load
            )
        summarize(route)
    recommended_id, explanation = recommend(routes)
    timeline = [departure + offset * 3600 for offset in range(49)]
    samples = []
    for index, coordinate in enumerate(coordinates):
        snapshots = []
        for timestamp in timeline:
            snapshot = weather_at(weather.get(index, {}), timestamp, load)
            # Explanations belong to inspected ETA checkpoints, not 49 repeated
            # map samples. Keep the preloaded timeline comfortably transferable.
            del snapshot["reason"]
            snapshots.append(snapshot)
        samples.append({"id": index, "coordinate": coordinate, "forecasts": snapshots})
    coverage = [
        sum(sample["forecasts"][index]["risk"] is not None for sample in samples)
        for index in range(49)
    ]
    if len(routes) < 3:
        warnings.append(
            f"The routing provider returned {len(routes)} distinct usable route{'s' if len(routes) != 1 else ''}; three alternatives are not always available."
        )
    if partial or any(route["incomplete"] for route in routes):
        warnings.append(
            "Some arrival forecasts are unavailable. Routes with incomplete coverage cannot be recommended."
        )
    if any(count < len(samples) for count in coverage):
        warnings.append(
            "Some forecast-layer samples are unavailable; unknown areas are not assessed as Low risk."
        )
    return {
        "trip": trip,
        "assessed_at": time.time(),
        "weather_fetched_at": fetched_at,
        "route_count": len(routes),
        "routes": routes,
        "recommended_id": recommended_id,
        "explanation": explanation,
        "warnings": warnings,
        "timeline": timeline,
        "samples": samples,
        "coverage": coverage,
    }
