import json
from datetime import datetime, timezone

from django.http import JsonResponse
from django.core.exceptions import RequestDataTooBig
from django.utils.dateparse import parse_datetime
from django.views.decorators.csrf import csrf_exempt

from .comparison import compare_trip
from .domain import finite_number
from .providers import ProviderError, search_places


def error(message, code="invalid_request", status=400, fields=None):
    response = JsonResponse(
        {"error": {"code": code, "message": message, "fields": fields or {}}},
        status=status,
    )
    response["Cache-Control"] = "no-store"
    return response


def validate_trip(data):
    if not isinstance(data, dict):
        return None, {"form": "Expected a JSON object."}
    fields, trip = {}, {}
    for name in ("origin", "destination"):
        place = data.get(name)
        coordinate = place.get("coordinate") if isinstance(place, dict) else None
        label = place.get("label") if isinstance(place, dict) else None
        if (
            not isinstance(label, str)
            or not 1 <= len(label.strip()) <= 250
            or not isinstance(coordinate, list)
            or len(coordinate) != 2
            or not all(finite_number(v) for v in coordinate)
            or not (-125 <= coordinate[0] <= -66 and 24 <= coordinate[1] <= 50)
        ):
            fields[name] = "Select a location in the contiguous United States."
        else:
            trip[name] = {"label": label.strip(), "coordinate": coordinate}
    if (
        "origin" in trip
        and "destination" in trip
        and trip["origin"]["coordinate"] == trip["destination"]["coordinate"]
    ):
        fields["destination"] = "Origin and destination must be different."
    raw_date = data.get("departure")
    try:
        departure = (
            parse_datetime(raw_date)
            if isinstance(raw_date, str) and len(raw_date) < 80
            else None
        )
    except ValueError:
        departure = None
    now = datetime.now(timezone.utc).timestamp()
    if departure is None or departure.utcoffset() is None:
        fields["departure"] = "Enter a valid departure with its timezone offset."
    elif not now <= departure.timestamp() <= now + 48 * 3600:
        fields["departure"] = "Choose a departure between now and 48 hours from now."
    else:
        trip["departure"] = departure.timestamp()
    load = data.get("load_lb")
    if not finite_number(load) or not 0 <= load <= 1_000_000:
        fields["load_lb"] = "Enter a load between 0 and 1,000,000 pounds."
    else:
        trip["load_lb"] = load
    interval = data.get("interval_miles")
    if not finite_number(interval) or interval not in (10, 25, 50):
        fields["interval_miles"] = "Choose 10, 25, or 50 miles."
    else:
        trip["interval_miles"] = interval
    return trip, fields


async def places(request):
    if request.method != "GET":
        return error("Use GET for location search.", "method_not_allowed", 405)
    query = request.GET.get("query", "").strip()
    if not 3 <= len(query) <= 200:
        return error("Search using 3–200 characters.")
    try:
        response = JsonResponse({"places": await search_places(query)})
        response["Cache-Control"] = "no-store"
        return response
    except ProviderError as problem:
        return error(problem.message, problem.code, problem.status)


# This stateless JSON endpoint only reads provider data; there are no cookies,
# sessions or writes. JSON-only requests and no CORS prevent cross-origin forms.
@csrf_exempt
async def compare(request):
    if request.method != "POST":
        return error("Use POST to compare routes.", "method_not_allowed", 405)
    if request.content_type != "application/json":
        return error("Send application/json.", "unsupported_media_type", 415)
    try:
        if len(request.body) > 16_384:
            return error("The request is too large.", "invalid_request", 413)
        data = json.loads(request.body)
    except RequestDataTooBig:
        return error("The request is too large.", "invalid_request", 413)
    except (ValueError, UnicodeDecodeError):
        return error("The request body must be valid JSON.")
    trip, fields = validate_trip(data)
    if fields:
        return error("Check your trip details.", fields=fields)
    try:
        response = JsonResponse(
            await compare_trip(trip), json_dumps_params={"separators": (",", ":")}
        )
        if len(response.content) > 4_250_000:
            return error(
                "This trip produces too much map data. Choose a larger checkpoint interval or shorter trip.",
                "trip_too_large",
                422,
            )
        response["Cache-Control"] = "no-store"
        return response
    except ProviderError as problem:
        return error(problem.message, problem.code, problem.status)
