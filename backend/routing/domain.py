"""Road-distance sampling and the assessment's explicit weather/ranking rules.

No HTTP, Django, or presentation state belongs here. All times are UTC epochs.
"""

from bisect import bisect_right
import math

MILE = 1609.344
RISKS = ("low", "moderate", "high", "severe", "no_travel")
RANK = {risk: index for index, risk in enumerate(RISKS)}
RISK_LABELS = {
    "low": "Low",
    "moderate": "Moderate",
    "high": "High",
    "severe": "Severe",
    "no_travel": "No Travel",
}


def finite_number(value):
    if not isinstance(value, (float, int)) or isinstance(value, bool):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def classify(wind, rain, snow, load):
    if any(not finite_number(value) or value < 0 for value in (wind, rain, snow)):
        return None, "Required forecast data is unavailable."
    wind_level = sum(wind >= threshold for threshold in (25, 35, 45, 55))
    rain_level = (
        4 if rain > 1 else sum(rain >= threshold for threshold in (0.10, 0.25, 0.50))
    )
    snow_level = 4 if snow > 3 else sum(snow >= threshold for threshold in (0.5, 1, 2))
    reasons = [f"Wind {wind:g} mph", f"Rain {rain:g} in/hr", f"Snow {snow:g} in/hr"]
    if 45 <= wind < 55 and load > 30_000:
        wind_level = 4
        reasons[0] += " · load above 30,000 lb"
    elif 35 <= wind < 45 and load > 40_000:
        wind_level = max(wind_level, 3)
        reasons[0] += " · load above 40,000 lb"
    levels = (wind_level, rain_level, snow_level)
    level = max(levels)
    if level == 0:
        return "low", "All sampled hazards are below Moderate thresholds."
    return RISKS[level], "; ".join(
        reason for reason, value in zip(reasons, levels) if value == level
    )


def weather_at(series, timestamp, load):
    """Wind: nearest instant. Precipitation: preceding-hour interval ending at ceil(T)."""
    wind = rain = snow = None
    if series and min(series) <= timestamp <= max(series):
        wind_hour = math.floor(timestamp / 3600 + 0.5) * 3600
        precip_hour = math.ceil(timestamp / 3600) * 3600
        wind = series.get(wind_hour, {}).get("wind_mph")
        rain = series.get(precip_hour, {}).get("rain_in_hr")
        snow = series.get(precip_hour, {}).get("snow_in_hr")
    risk, reason = classify(wind, rain, snow, load)
    return {
        "wind_mph": wind,
        "rain_in_hr": rain,
        "snow_in_hr": snow,
        "risk": risk,
        "reason": reason,
    }


def checkpoint_route(raw, interval_miles, departure, route_id):
    coordinates = raw["geometry"]["coordinates"]
    annotation = raw["legs"][0]["annotation"]
    distances, durations = annotation["distance"], annotation["duration"]
    if (
        len(coordinates) < 2
        or len(distances) != len(coordinates) - 1
        or len(durations) != len(distances)
    ):
        raise ValueError("Route geometry and timing annotations do not align.")
    if any(
        len(point) < 2
        or any(not finite_number(v) for v in point[:2])
        or not (-180 <= point[0] <= 180 and -90 <= point[1] <= 90)
        for point in coordinates
    ):
        raise ValueError("Invalid route coordinates.")
    if any(not finite_number(value) or value < 0 for value in distances + durations):
        raise ValueError("Invalid route distance or duration.")
    cumulative_distance, cumulative_time = [0.0], [0.0]
    for distance, duration in zip(distances, durations):
        cumulative_distance.append(cumulative_distance[-1] + distance)
        cumulative_time.append(cumulative_time[-1] + duration)
    total = cumulative_distance[-1]
    if total <= 0 or cumulative_time[-1] <= 0:
        raise ValueError("The routing provider returned an empty journey.")
    step = interval_miles * MILE
    targets = [i * step for i in range(math.ceil(total / step))] + [total]
    if len(targets) > 650:
        raise ValueError(
            "Too many checkpoints. Choose a larger interval or shorter trip."
        )
    checkpoints, indices = [], []
    for target in targets:
        index = min(bisect_right(cumulative_distance, target) - 1, len(distances) - 1)
        fraction = (
            (target - cumulative_distance[index]) / distances[index]
            if distances[index]
            else 0
        )
        point = [
            coordinates[index][axis]
            + fraction * (coordinates[index + 1][axis] - coordinates[index][axis])
            for axis in (0, 1)
        ]
        if target == 0:
            point, elapsed, index = coordinates[0][:2], 0.0, 0
        elif target == total:
            point, elapsed = coordinates[-1][:2], cumulative_time[-1]
        else:
            elapsed = cumulative_time[index] + fraction * durations[index]
        checkpoints.append(
            {
                "coordinate": point,
                "distance_miles": target / MILE,
                "elapsed_seconds": elapsed,
                "eta": departure + elapsed,
            }
        )
        indices.append(index)
    segments = []
    for index in range(len(checkpoints) - 1):
        start, end = checkpoints[index : index + 2]
        geometry = [
            start["coordinate"],
            *coordinates[indices[index] + 1 : indices[index + 1] + 1],
            end["coordinate"],
        ]
        segments.append(
            {
                "coordinates": geometry,
                "distance_miles": end["distance_miles"] - start["distance_miles"],
            }
        )
    summary = raw["legs"][0].get("summary", "")
    return {
        "id": route_id,
        "name": str(summary)[:100] or f"Route {route_id}",
        "geometry": {"type": "LineString", "coordinates": coordinates},
        "distance_miles": total / MILE,
        "duration_seconds": cumulative_time[-1],
        "arrival": departure + cumulative_time[-1],
        "checkpoints": checkpoints,
        "segments": segments,
    }


def summarize(route):
    miles = dict.fromkeys(RISKS, 0.0)
    unknown = 0.0
    for index, segment in enumerate(route["segments"]):
        risks = [
            point["weather"]["risk"]
            for point in route["checkpoints"][index : index + 2]
        ]
        risk = max(risks, key=RANK.get) if None not in risks else None
        segment["risk"] = risk
        if risk is None:
            unknown += segment["distance_miles"]
        else:
            miles[risk] += segment["distance_miles"]
    blocked = any(
        point["weather"]["risk"] == "no_travel" for point in route["checkpoints"]
    )
    incomplete = any(point["weather"]["risk"] is None for point in route["checkpoints"])
    eligible = not blocked and not incomplete
    route.update(
        miles_by_risk=miles,
        unknown_miles=unknown,
        blocked=blocked,
        incomplete=incomplete,
        eligible=eligible,
        average_risk=sum(RANK[risk] * distance for risk, distance in miles.items())
        / route["distance_miles"]
        if eligible
        else None,
    )


def recommend(routes):
    keys = lambda route: (
        route["miles_by_risk"]["severe"],
        route["miles_by_risk"]["high"],
        route["average_risk"],
        route["duration_seconds"],
    )
    eligible = sorted((route for route in routes if route["eligible"]), key=keys)
    if not eligible:
        return (
            None,
            "No recommendation: routes contain No Travel conditions, incomplete forecasts, or both.",
        )
    winner = eligible[0]
    if len(eligible) == 1:
        reason = "Only route with complete forecasts and no No Travel conditions."
    else:
        first, second = keys(winner), keys(eligible[1])
        messages = [
            f"Fewest Severe miles ({first[0]:.1f} vs {second[0]:.1f}).",
            f"Fewest High miles ({first[1]:.1f} vs {second[1]:.1f}).",
            "Lowest distance-weighted weather exposure.",
            "Equal weather exposure; shortest travel time.",
        ]
        reason = next(
            (messages[index] for index in range(4) if first[index] != second[index]),
            "Equal assessed exposure and travel time; provider order breaks the tie.",
        )
    return winner["id"], reason
