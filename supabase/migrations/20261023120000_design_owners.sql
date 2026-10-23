-- BanAI accounts PROTOTYPE (branch feature/auth): a saved design may belong to a signed-in user.
-- Accounts are excluded from the MVP scope (CLAUDE.md); this migration is for the prototype only and
-- must not be pushed to a shared project without team approval.
-- owner_id is optional: designs saved without an account keep working through their secret link.
-- Deleting a user deletes their designs (no orphaned personal data).
alter table public.designs
  add column owner_id uuid references auth.users (id) on delete cascade;

create index designs_owner_updated_idx on public.designs (owner_id, updated_at desc) where owner_id is not null;
