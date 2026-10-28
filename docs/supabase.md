# Supabase Projects

| Environment | Project | Ref | Region |
|---|---|---|---|
| dev | banai-dev | `lrulgstsqnxllknfvdpr` | eu-central-1 |
| production | banai-prod | `lkslzvgypmbjltrtcrec` | eu-central-1 |

- Organization: Kindra (`mqmgjlbatfmoxunyepzc`).
- The CLI is linked to **banai-dev** by default. To target prod, run `supabase link --project-ref lkslzvgypmbjltrtcrec` explicitly, and only for an approved release.
- DB passwords are kept in the gitignored `.env.supabase` at the repo root, never committed.
- Schema: `supabase/migrations/20261020120000_designs.sql`, table `public.designs`. RLS is on with no policies, and anon/authenticated have no grants: only the backend reaches it.
- The backend (`app/persistence/repository.py`) calls PostgREST with `SUPABASE_URL` and `SUPABASE_SECRET_KEY`, set per Railway environment: dev uses banai-dev and production uses banai-prod. `/api/health` reports `storage: true` when they are set.
- API: `POST /api/designs`, then `GET` / `PUT /api/designs/{id}` with `Authorization: Bearer <token>`. `PUT` also needs `If-Match: <revision>` and returns 409 `STALE` when someone saved in between. A wrong token and a missing design both return the same 404.
- **Recently saved designs (browser only).** After each successful save, the frontend keeps the link in `localStorage` (`banai.recentDesigns`). It stores at most 5 entries, each with its date and dimensions, and lists them on the start screen with an Open button and a "Remove from list" button. Opening a link that returns 404 removes it from the list and shows a friendly message. There are no accounts: the list exists only on this device. The entries hold the link token, which is the same secret the browser history already keeps. They are validated on read and rendered with `textContent` only, and the token is never displayed. Code: `frontend/src/share/link.js` and `frontend/src/entry/startScreen.js`.
