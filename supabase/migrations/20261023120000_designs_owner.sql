-- BanAI: customer accounts (approved exception, 2026-10-23). Saving a design now needs a logged-in customer;
-- the account that first saved it is recorded here. The link token still opens and edits the design.
-- Designs saved before accounts keep owner_id null. Deleting an account keeps its designs (reachable by link).
-- RLS stays on with no policies and no grants for anon/authenticated: only the backend reaches this table.
alter table public.designs
  add column owner_id uuid references auth.users (id) on delete set null;

create index designs_owner_id_idx on public.designs (owner_id);
