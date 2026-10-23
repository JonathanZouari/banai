# Railway Configuration

Project: **banai** (`59872a1e-192c-47f4-8b29-bb0bded6eb7e`), workspace "Jonathan Zouari's Projects".

| Environment | Branch | Service | Root dir | Start command | Healthcheck |
|---|---|---|---|---|---|
| `production` | `main` | backend | `/backend` | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` | `/api/health` |
| `production` | `main` | frontend | `/frontend` | `npm start` (`serve dist`) | `/` |
| `dev` | `dev` | backend | `/backend` | same | `/api/health` |
| `dev` | `dev` | frontend | `/frontend` | same | `/` |

Service IDs: backend `3f49516a-fa45-4f5c-af6d-eb64f1ccb401`, frontend `e65604d5-8070-4479-864b-dab563dc9386`.

- The backend builds from `backend/Dockerfile` (`railway.json`: `DOCKERFILE`): Python 3.13 with `uv sync --frozen --no-dev`, Playwright's Chromium with its system libraries, and `fonts-noto-core` so the dossier's Hebrew renders; it runs as a non-root user, and `.dockerignore` keeps `.env`, `.venv` and the tests out of the image. Not built locally (no Docker here): the first deploy is its test, so check the build log and `POST /api/dossier` there. The frontend's builder is Railpack. Watch patterns (`/backend/**`, `/frontend/**`) limit redeploys to the service that changed.
- Settings live in the Railway environment config, mirrored in each service's `railway.json`. The backend has no `startCommand`: the Dockerfile's shell-form `CMD` expands `$PORT` (an exec-form start command would not).
- Variables are set per environment and never shared between `dev` and `production`. See `docs/environment.md` (added in Phase 9).
- A push to `dev` auto-deploys the dev environment. A push or merge to `main` deploys production, and requires explicit approval.

## Inspect

```bash
railway environment dev && railway environment config --json
railway deployment list --service backend --json
```
