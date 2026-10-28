# Railway Configuration

The fork (`shirashef-jpg/banai`) deploys to its own project. Upstream (`JonathanZouari/banai`) has a separate project, listed at the end.

## Fork project

Project: **banai** (`bb1ccbe6-5103-4c83-b0e4-b1c217703aee`), workspace "shirashef-jpg's Projects". Created 2026-10-28.

| Environment | Branch | Service | Root dir | Start command | Healthcheck | Domain |
|---|---|---|---|---|---|---|
| `dev` | `dev` | backend | `/backend` | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` | `/api/health` | https://backend-dev-7be1.up.railway.app |
| `dev` | `dev` | frontend | `/frontend` | `npm start` (`serve dist`) | `/` | https://frontend-dev-4874.up.railway.app |
| `production` | not connected | backend | `/backend` | same | `/api/health` | https://backend-production-f1c7.up.railway.app |
| `production` | not connected | frontend | `/frontend` | same | `/` | https://frontend-production-676f.up.railway.app |

- IDs:
  - services: backend `7e5db148-0a3d-4b24-b30b-4eba43451ff1`, frontend `08d3ee20-0ca8-474d-b242-adea93ef3021`
  - environments: production `6b8d030c-ae21-48df-8399-83ae7c641a40`, dev `a4ec5529-c069-4f43-9431-24b2b6d40150`
- **Production is held.** Its services have no repo source, so nothing deploys there. A release means connecting `main` in the production environment, after explicit approval.
- Variables are set per environment and never shared:
  - backend: `APP_ENV` (`dev` / `production`), `CORS_ORIGINS=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}`, its own `PROPOSAL_SIGNING_KEY`, `VOICE_ENABLED=false`, `FORWARDED_HOPS=0`
  - frontend: `VITE_API_BASE_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}`
  - `dev` backend also has the banai-dev `SUPABASE_URL` and `SUPABASE_SECRET_KEY`
  - not set yet: `OPENAI_API_KEY` (both environments) and the banai-prod Supabase variables (production)
- The builder is Railpack. Settings are mirrored in each service's `railway.json`.
- A push to `dev` on the fork auto-deploys the dev environment.

## Upstream project

Project **banai** (`59872a1e-192c-47f4-8b29-bb0bded6eb7e`), workspace "Jonathan Zouari's Projects". It deploys from `JonathanZouari/banai` (`main` to production, `dev` to dev). Service IDs: backend `3f49516a-fa45-4f5c-af6d-eb64f1ccb401`, frontend `e65604d5-8070-4479-864b-dab563dc9386`.

## Inspect

```bash
railway link --project bb1ccbe6-5103-4c83-b0e4-b1c217703aee
railway deployment list --service backend --environment dev --json
railway variable list --service backend --environment dev --json
```

- Changes made in the dashboard stay **staged** until you click Deploy. Check them with the `environmentStagedChanges` GraphQL query.
- `railway environment edit --service-config` silently did nothing for `source.rootDirectory` on services with no source. Use the `serviceInstanceUpdate` mutation instead.
- `railway environment new` without `--duplicate` created an environment with no service instances. Use `--duplicate production`.
