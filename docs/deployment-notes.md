# Vercel deployment notes

Checked 2026-11-03 against Vercel and Django primary sources. Keep the existing Vite frontend and Django API in one Vercel project with the repository root as its Root Directory.

## Recommended minimal integration

Use the Vite preset, build `bun run build`, output `dist`, and add an explicit Python function. This avoids changing Django into the frontend server or introducing Vercel Services. Vercel supports Python WSGI applications exporting `application`, and installs Python dependencies from a root `requirements.txt` ([Python runtime](https://vercel.com/docs/functions/runtimes/python)).

Keep the pinned dependencies directly in root `requirements.txt`. The actual Vercel deployment rejected a nested requirements include, so the root file is the single canonical dependency list. Add `.python-version` containing `3.12` for a known supported interpreter. Do not add Gunicorn: Vercel hosts the WSGI callable.

Suggested `api/index.py`:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from config.wsgi import application
```

Suggested `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "bun run build",
  "outputDirectory": "dist",
  "functions": {
    "api/index.py": {
      "maxDuration": 60,
      "excludeFiles": "{.venv/**,venv/**,node_modules/**,dist/**,docs/**,test-results/**,playwright-report/**,.git/**,.env,.env.*,backend/routing/tests/**,**/__pycache__/**}"
    }
  },
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/index.py" }
  ]
}
```

The function bundle includes project Python sources by default; `excludeFiles` removes unrelated material, not `backend/**`. Keep backend imports and its pinned requirements available ([bundling](https://vercel.com/docs/functions/runtimes/python#controlling-what-gets-bundled)). Django routes include `/api/places` and `/api/compare`; rewrites must preserve those original paths in the WSGI request. The suggested conventional internal rewrite needs a deployed request to each endpoint to establish that contract: the public docs describe rewrite routing but do not explicitly guarantee original WSGI `PATH_INFO` ([rewrites](https://vercel.com/docs/rewrites), [Python builder source](https://github.com/vercel/vercel/blob/main/packages/python/src/index.ts)). If the adapter instead exposes `/api/index.py`, pass the original path as an internal query parameter and restore `PATH_INFO` in a small WSGI wrapper, removing that parameter before Django dispatch. Do not silently strip `/api` from Django's routes.

## Runtime and environment

- Fluid compute supports Python with a Hobby default and maximum duration of 300 seconds. Explicit `maxDuration: 60` accommodates the app's 42-second provider deadline. Without Fluid, limits differ; confirm the deployed project's setting ([limits](https://vercel.com/docs/functions/limitations), [Django function configuration](https://vercel.com/docs/frameworks/backend/django#vercel-functions)).
- Vercel limits both function request and response payloads to **4.5 MB**. Python bundles can be **500 MB uncompressed**. Validate a realistic maximum route response, including weather samples, rather than only a tiny smoke test. Django's existing GZip middleware can compress responses when clients negotiate gzip; measure actual transferred responses and do not assume compression alone establishes compliance ([limits](https://vercel.com/docs/functions/limitations)).
- Django explicitly supports async views under WSGI in a one-off event loop, including concurrent async HTTP requests. Existing per-request `httpx.AsyncClient` work remains viable. It does not provide a fully async request stack, but no ASGI migration is necessary for these JSON endpoints ([Django async support](https://docs.djangoproject.com/en/5.2/topics/async/)).
- Configure server runtime variables `MAPBOX_ACCESS_TOKEN`, `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=false`, and `DJANGO_ALLOWED_HOSTS`. The existing settings split allowed hosts on commas. Use exact deployment/custom domains, or `.vercel.app` when accepting Vercel preview domains; avoid `*`. No database provisioning or migrations are required for this app. Configure frontend `VITE_*` variables needed by the existing application at build time, since Vite inlines them into public assets ([Vite environment variables](https://vite.dev/guide/env-and-mode), [Django allowed hosts](https://docs.djangoproject.com/en/5.2/ref/settings/#allowed-hosts)). Never place server secrets in a `VITE_*` variable.

## New native Django support

Current Vercel Django support detects `manage.py`, including an immediate subdirectory such as `backend`, and resolves its configured WSGI or ASGI application. When both are present, it chooses ASGI. Its function configuration key would be `backend/config/asgi.py` for this repository, rather than `api/index.py`. Deploying that backend alongside Vite through the new native workflow uses Vercel Services, with each service built independently and routed to a shared domain. That is a valid alternative, but adds configuration and is unnecessary for this small existing root Vite application ([Django](https://vercel.com/docs/frameworks/backend/django), [Python entrypoints](https://vercel.com/docs/functions/runtimes/python#python-entrypoints), [Services](https://vercel.com/docs/services)).

## Verified deployment

The full app is live at https://spotter-weather-routing-beta.vercel.app. The public page, geocoding endpoint, and comparison endpoint return HTTP 200. The WSGI rewrite preserves the original Django API path in the actual deployment. The complete native-map browser workflow was also verified on this public URL, including the preloaded slider and mobile layout; see [verification](verification.md).

The actual configuration uses `includeFiles: backend/**` together with the deployment ignore file to package the Python application. Root requirements contain direct pins rather than the rejected nested include. Production environment variables are configured in Vercel; the server token and Django secret are excluded from Git and the frontend's public variables. Only the intentionally public Mapbox map token is included in frontend assets.
