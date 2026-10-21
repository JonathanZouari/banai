# Supabase Projects

| Environment | Project | Ref | Region |
|---|---|---|---|
| dev | banai-dev | `lrulgstsqnxllknfvdpr` | eu-central-1 |
| production | banai-prod | `lkslzvgypmbjltrtcrec` | eu-central-1 |

- Organization: Kindra (`mqmgjlbatfmoxunyepzc`).
- The CLI is linked to **banai-dev** by default. To target prod, run `supabase link --project-ref lkslzvgypmbjltrtcrec` explicitly, and only for an approved release.
- DB passwords are kept in the gitignored `.env.supabase` at the repo root, never committed.
- **`designs` (2026-10-20, ADR-042):** the migration `supabase/migrations/20261020120000_designs.sql` is applied to **banai-dev** (`supabase db push --db-url "$SUPABASE_DEV_DB_URL"`, with the URL from `.env.supabase`) and, with the user's approval on 2026-10-21, to **banai-prod** (the same command with `SUPABASE_PROD_DB_URL`; `migration list` shows it on both). The production backend still needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in Railway before it uses it.
- **Expiry:** rows not saved for 180 days are treated as gone and purged by the backend on the next create (`backend/app/store.py`, `RETENTION`). No cron job or extension is needed. No Docker is installed on this machine, so `supabase db dump` and a local stack do not work; `db push` and `migration list` do.
- The schema and security model (RLS deny-all, backend-only access, hashed access tokens) are implemented in Phase 7. See `docs/architecture.md` §7.
