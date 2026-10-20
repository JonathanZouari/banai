# Supabase Projects

| Environment | Project | Ref | Region |
|---|---|---|---|
| dev | banai-dev | `lrulgstsqnxllknfvdpr` | eu-central-1 |
| production | banai-prod | `lkslzvgypmbjltrtcrec` | eu-central-1 |

- Organization: Kindra (`mqmgjlbatfmoxunyepzc`).
- The CLI is linked to **banai-dev** by default. To target prod, run `supabase link --project-ref lkslzvgypmbjltrtcrec` explicitly, and only for an approved release.
- DB passwords are kept in the gitignored `.env.supabase` at the repo root, never committed.
- **`designs` (2026-10-20, ADR-042):** the migration `supabase/migrations/20261020120000_designs.sql` is applied to **banai-dev** (`supabase db push --db-url "$SUPABASE_DEV_DB_URL"`, with the URL from `.env.supabase`). banai-prod has none yet: apply it only for an approved release. No Docker is installed on this machine, so `supabase db dump` and a local stack do not work; `db push` and `migration list` do.
- The schema and security model (RLS deny-all, backend-only access, hashed access tokens) are implemented in Phase 7. See `docs/architecture.md` §7.
