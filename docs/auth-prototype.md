# Accounts prototype (branch `feature/auth`)

> **Status: prototype.** `CLAUDE.md` lists "accounts or registration" as excluded from the MVP. This branch
> exists so the team can decide whether to adopt accounts; `CLAUDE.md` and `architecture.md` are unchanged.
> Do not merge or push the migration to a shared Supabase project without that decision.

## What it adds

- **Sign up / sign in with email + password**, through our backend. The browser never talks to Supabase.
- **My designs**: a design saved while signed in belongs to the user and appears in a plain list
  (newest first) from which it can be reopened. It still gets a normal private link, so sharing works as before.
- Designs saved without an account keep working exactly as before.

## API

| Route | Auth | Notes |
|---|---|---|
| `POST /api/auth/signup` | – | `{email, password, language}` → session, or `{confirmationRequired: true}` when Supabase requires email confirmation |
| `POST /api/auth/login` | – | → session. Wrong password and unknown email both answer 401 `INVALID_CREDENTIALS` |
| `POST /api/auth/refresh` | – | `{refreshToken}` → new session; refresh tokens rotate (single use) |
| `POST /api/auth/logout` | Bearer access token | |
| `GET /api/auth/me` | Bearer | → `{user}` |
| `GET /api/me/designs` | Bearer | the user's designs, newest first (max 100) |
| `POST /api/me/designs` | Bearer | save a new design to the account; also returns the link token |
| `GET` / `PUT /api/me/designs/{id}` | Bearer | owner only; `PUT` needs `If-Match: <revision>`, 409 `STALE`. Not the owner = the same 404 as missing |

A session is `{user: {id, email}, accessToken, refreshToken, expiresIn}`. `/api/health` reports `accounts`.

## Configuration

| Variable | Meaning |
|---|---|
| `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` | Supabase Auth (GoTrue), called by the backend with the publishable key |
| none, with `APP_ENV=local`/`e2e` and no Supabase storage | in-memory accounts (lost on restart, no emails) |

In-memory accounts are only used next to the in-memory design store: their ids are not Supabase users.

Database: `supabase/migrations/20261023120000_design_owners.sql` adds `designs.owner_id`
(→ `auth.users`, `on delete cascade`) and an index. RLS stays on with no policies.

## Browser

- The access token stays in memory. The refresh token and the email are stored in `localStorage`
  (`banai.account`) so a reload stays signed in. Trade-off: an XSS bug could read the refresh token. The
  app sets all user data with `textContent`, never `innerHTML`. An httpOnly cookie was not used because
  the frontend and backend run on separate Railway domains.
- `/#my=<uuid>` reopens an account design. It holds no secret: the server answers only the owner.

## Security notes

- Rate limits per worker (configurable defaults): login 10 / 15 min per email and 50 / 15 min per client;
  sign-up 10 / hour per client; refresh 120 / 15 min per client. Behind Railway's proxy the "client" may be
  the proxy, so the per-email limit does the real work. Supabase Auth adds its own limits.
- Passwords: 8 to 72 UTF-8 bytes (bcrypt's limit in Supabase). The in-memory provider uses scrypt.
- A verified access token is cached for 60 s per worker, so a sign-out can take up to 60 s to reach
  other workers.
- Sign-up with a taken email answers a generic `SIGNUP_FAILED`. With email confirmation on, Supabase hides
  this entirely; with it off, a taken email is still distinguishable from success.

## Before a live test against Supabase

1. Team approval (accounts are out of the MVP scope; this stores personal data: emails).
2. Org access to the Supabase project, then `supabase db push` of the migration to **dev** only.
3. Auth settings: email confirmation, Site URL and redirect URLs, and an SMTP provider (the built-in
   mailer allows only a few emails per hour).
4. `SUPABASE_PUBLISHABLE_KEY` in `backend/.env` (and in the Railway dev environment).
