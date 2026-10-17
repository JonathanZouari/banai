# BanAI — AI Wardrobe Designer

An MVP for designing standard straight wardrobes with three synchronized parts: a conversational AI agent, a manual properties editor, and a dimensionally accurate Three.js viewer.

> Status: **Phase 1 (Foundations & Infrastructure)**. See `docs/architecture.md` for the full plan and phase breakdown.

## Repository layout

| Path | Contents |
|---|---|
| `backend/` | FastAPI + Pydantic API (Python 3.13, managed by `uv`) |
| `frontend/` | Vanilla JS + Three.js, bundled with Vite |
| `shared/fixtures/` | Golden fixtures used by both test suites |
| `supabase/` | Supabase CLI config and SQL migrations |
| `docs/` | Architecture, schema, protocols, and infra docs |
| `.claude/` | Claude Code project settings and the Obsidian work-log Stop hook |

## Local development

Prerequisites: Python 3.13, [uv](https://docs.astral.sh/uv/), Node 22+.

```bash
# Backend (http://localhost:8000)
cd backend
cp .env.example .env
uv sync
uv run uvicorn app.main:app --reload --port 8000
uv run pytest

# Frontend (http://localhost:5173)
cd frontend
cp .env.example .env
npm ci
npm run dev
npm test
```

### Optional keys (`backend/.env`)

- `OPENAI_API_KEY`: turns on the AI designer chat.
- `ELEVENLABS_API_KEY`: gives the designer a Hebrew/English voice and a microphone (ElevenLabs free plan works, non-commercial). Without it, replies can still be read aloud by the browser's own voice.

Restart the backend after changing `.env`.

## Environments

| Railway environment | Git branch | Services (root dir) |
|---|---|---|
| `production` | `main` | `frontend` (`/frontend`), `backend` (`/backend`) |
| `dev` | `dev` | `frontend` (`/frontend`), `backend` (`/backend`) |

All work lands on `dev`. Merging to `main` (a production deploy) happens only with explicit approval. See `docs/railway.md`.
