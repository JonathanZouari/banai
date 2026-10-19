# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

BanAI started as an MVP AI wardrobe designer for standard straight wardrobes. Three parts stay synchronized through **one canonical design state**: a chat agent (OpenAI, signed proposals), a manual properties editor, and a Three.js 3D viewer.

**Branch `bobHabanai`** (fork `ariel-korenn/banai`) grows it into a **custom wardrobe** designer for homeowners, with a carpenter hand-off. It is a **proposal** to the repo owner (ADR-007): the scope changes below are made on this branch so he can judge them, and nothing reaches `dev`/`main` except through a PR he reviews. What the branch adds:

- **Hebrew RTL workspace** (Apple-style): inspector on the right, 3D in the centre, advice and chat on the left. `<html lang="he" dir="rtl">`, Assistant font.
- **Schema v2:** site (ceiling, niche), plinth, presets, inserts (pull-down rail, shoe shelves, trouser rack, LED), split doors, and **zones** (2–4 per column, each with its own door or none and its own preset; ADR-027).
- **Advisories** R1–R26 (`/api/advisories`): research-backed, non-blocking, each with an evidence grade, a source and, where possible, a one-click fix dry-run through the engine. The customer decides; advice never restricts a choice ("capabilities, not taste").
- **Carpenter dossier PDF** (`/api/dossier`): drawings, cut list, sheet nesting, hardware, estimate and advisories, rendered by headless Chromium.
- **Render and video:** a WebGL path tracer for a near-photoreal still (the dossier cover), and an MP4 demo of the doors, drawers and pull-down opening, live or path-traced.
- **Undo/redo** and hold-to-compare against a saved version.
- **Design-aware chat** (ADR-020/025): the agent sees the design and proposes ops; the server signs them, and nothing changes until the customer confirms. Conversational: no chips or multiple choice. Jerusalem weather is the one deliberate off-topic answer (ADR-015).
- **Push-to-talk voice** (ADR-021): record, transcribe on the server, send as a chat message. A change still needs a tap.
- **Bob the Builder (בוב הבנאי):** the agent's name and character in every language (the app itself stays בנאי). The character is a fictional master carpenter (in the workshop since 1995, over a thousand wardrobes), the same story as the P3 About page; the agent admits it is an AI when asked. A registered character: fine for this study project, a real product needs its own name.
- **Languages** (ADR-029): Hebrew, English, Russian and Arabic.
  - The **carpenter's dossier** comes in the language the carpenter picks from the dossier menu; the page direction follows it.
  - The **conversation** has a session language, picked on the start screen or in the chat header and kept in the browser: the chat column's texts and direction, the agent's replies, the transcription hint and the spoken voice follow it.
  - The rest of the workspace stays Hebrew, and so do the proposal card's change lines (they come from the Hebrew diff).
- **Wall obstacles and a scale figure** (2026-10-19, ADR-031): up to 8 obstacles on the wall behind (socket, switch, AC, pipes, window, skirting) in the site. Advisory R23 covers them, the viewer builds each one at its real size on the wall (`viewer/obstacles3d.js`: a wall plate, an AC unit, a pipe, a window with a sill, skirting), shows one hidden behind the carcass as a tinted patch over the doors, labels each with its name and size in cm, and the dossier lists them. A "דמות" switch shows a 170 cm scale figure beside the wardrobe (`viewer/figure.js`, hidden in renders and video).
- **Top bar and workspace** (2026-10-19): "פתיחה" (Ctrl+O) opens the saved projects. The workspace is warm paper with a faint drafting grid (`--color-bg #f3eee6`), and the 3D studio matches (`#efe8dc`). The video menu is bound by `details[data-testid="video-menu"]`: the dossier menu shares the `.video-menu` class.
- **Household and child safety** (2026-10-19):
  - **Household:** `household.people`, up to 6, each with an optional name and a height, set through `set_household`. They appear as scale figures at their heights beside the wardrobe, with labels, and the views frame them.
  - **R26:** anyone under 140 cm is a child, which raises:
    - anchoring the wardrobe [100][103][119]
    - child locks on the doors and drawers (`fittings.childLock`)
    - one release button at `releaseHeight`. Its default is the tallest child's estimated standing reach × 1.3, rounded up to 50 mm and at least 1500. It is an estimate, and a climbing child can still reach it.
  - **Bob:** brings up safety himself when children are mentioned.
- **The user's list** (2026-10-19):
  - **A warning pop-up:** a change that brings a new warning or critical advisory pops it up over the 3D view, with its quick fix, "שאלו את בוב" (the question is written into the chat, not sent), "הצג" and "השאר כך". It is not modal, and it can be switched off (`frontend/src/advice/alertSheet.js`).
  - **Projects in the browser:** save, open, delete, and export or import a file (`frontend/src/share/projects*.js`). "חדש" (Alt+N, "ניקוי מסך") starts over and asks first about unsaved changes. There is no server and no account.
  - **Soft close and legs:** `fittings.softClose` (on by default) and `carcass.base` plinth or legs, via the `set_fittings` op, with R24.
  - **A screen:** insert type `tv`, a sample 16:9 flat screen. Its `height` is the screen height in mm, and the panel picks it in inches. R25 covers width, ventilation [118] and power.
- **Room elements** (2026-10-18): the site takes the ceiling at three points, the niche at three heights (the smallest governs) and the free floor in front of the wardrobe. Advisories R21 (room to open doors and drawers) and R22 (out of square) follow, and the viewer draws the room in pencil: door swings, drawer pull-outs, the room's line, the niche through the readings. See `docs/schema.md` "Site".
- **Atelier start screen and About** (2026-10-17): "a carpenter's studio, drawn in pencil". A 3D wardrobe assembles with pencil dimension lines, Bob greets, and the three entry cards lead into the editor. Below it, and from the top bar, is the About page with the fictional master carpenter. See `.stitch/DESIGN.md`, "Atelier".
- **Spoken replies** (ADR-028): a reply to a spoken message is also read aloud by an AI voice (OpenAI `gpt-4o-mini-tts`; persona: a seasoned master carpenter, calm, warm and confident, never salesy). Typed messages get silent replies. A speaker toggle mutes it; the voice is picked by ear in AI settings; the UI discloses that the voice is AI-generated (an OpenAI usage-policy requirement).

Docs:
- Product brief: Obsidian `BanAI/06 - Product Specification.md`. bobHabanai: `BanAI/11 - bobHabanai Characterization` and `BanAI/12 - bobHabanai Technical Plan` (also in `docs/bobhabanai/`).
- Decisions: Obsidian `BanAI/04 - Decisions & Assumptions` (ADR-001…027). Progress: `BanAI/01 - Process Log (Phases)`.
- The original architecture and phase plan: `docs/architecture.md`. Schema: `docs/schema.md` (v1 and "Schema v2").

## Working rules for this repo

- **Always plan before executing.** Before writing code or changing infrastructure, produce a plan (use plan mode for any non-trivial task). The plan should cover:
  - what will change
  - which files and services are affected
  - risks
  - how the result will be verified

  Get the user's approval before implementing. This applies to every phase and to any change outside a phase.
- **Test gate between phases.** Before reporting a phase as complete and moving on, run the **full test suite**:
  - **Regression:** every existing backend and frontend test, not just the new ones: `uv run pytest` and `npm test`.
  - **End-to-end:** the E2E tests for the user flows that exist so far, run with **two tools**:
    - **Playwright:** the automated, repeatable suite in `frontend/tests/e2e/`. It is committed and runs headless. Phase 3 adds the first suite, and it grows each phase toward the full acceptance scenario (spec §21).
    - **Claude in Chrome** (`mcp__claude-in-chrome__*`, after loading the `claude-in-chrome` skill): a live, visual walkthrough of the same flows in a real Chrome tab. Check rendering, 3D interaction, layout, and the browser console, and record a GIF of the key flow with `gif_creator`. Use it to catch what headless assertions miss, not as a replacement for Playwright.
  - **Do not move to the next phase unless every test passes.** Report the actual test output in the phase report. If anything fails, fix it, or report the failure and stop. Never skip or disable a test to get green.
- **Security review gate between phases.** Before moving to the next phase, run a security review of everything the phase changed. Use the **security-reviewer** agent and/or `/security-review`, covering:
  - input validation (including LLM-generated input)
  - secrets
  - authorization
  - injection
  - DoS limits
  - dependency vulnerabilities (`npm audit`)

  **Do not move to the next phase until the security review passes:** every CRITICAL and HIGH finding fixed and re-verified. Summarize the review result in the phase report.
- **Phased delivery.** Work proceeds Phase 1 → 10 (`docs/architecture.md` §10a). After each phase, stop, report (what was implemented, files changed, real test output, known issues, next step), and wait for the user's approval. Never roll into the next phase on your own.
- **Branches.** On the upstream repo all work lands on `dev`, which Railway auto-deploys to the `dev` environment. Pushing or merging to `main` deploys **production** and needs explicit user approval.
  - **bobHabanai:** commit on `bobHabanai` only. Push only to `fork` (`ariel-korenn/banai`), only with the user's OK and after a secret scan of the diff. Never push or merge to `origin` (JonathanZouari); the owner gets a PR from the fork.
- **Excluded features (do not build):** quotes, orders, accounts or registration, dashboards, CNC export, room design, image uploads, mobile-first layout, drag-and-drop geometry, and any AI change applied without approval. The app must never claim a design is manufacturable.
  - **Changed on `bobHabanai` (ADR-007, ADR-016, proposed to the owner):** advisories (feasibility rules, but non-blocking and sourced), the carpenter dossier with cut list and nesting (labelled a draft brief, not CNC output), a material **estimate** range in the dossier (not a quote), and push-to-talk **voice**. Scope is wardrobes only: no kitchens or other furniture (ADR-012).
  - **User decisions (2026-10-16) that extend the brief:** handles (5 styles + none, global with per-door/drawer overrides) and mirror door fronts are part of the design model. The viewer may show a decorative **room backdrop** (a self-hosted CC0 photo in `frontend/public/env/`), decorative clothes, and animated door opening. These are visual only: no room editing, no uploads. On-canvas `−`/`+` steppers are allowed; they are click-based, not drag-and-drop geometry.
- **Mandatory stack.**
  - Frontend: vanilla JS ES modules + Three.js, bundled with Vite. **No React, Vue, or R3F.**
  - Backend: FastAPI + Pydantic.
  - UI design: the original "Nordic Atelier" system came from Google Stitch MCP. Since 2026-10-16 (user decision) the UI is **Apple-inspired** (Apple blue `#0071e3`, translucent materials, system font), documented in `.stitch/DESIGN.md`. Keep new UI consistent with that file.
- **Defaults are not business rules.** Units, default dimensions, catalog contents, and model names are configurable defaults documented in Obsidian `04 - Decisions & Assumptions`. Label them that way.

## Commands

The backend uses uv (Python 3.13). The frontend needs Node 22+.

```bash
# Backend (from backend/)
uv sync
uv run uvicorn app.main:app --reload --port 8000
uv run pytest                                  # all tests
uv run pytest tests/test_health.py::test_health_returns_ok   # single test
uv run pytest --cov=app                        # coverage

# Frontend (from frontend/)
npm ci
npm run dev                                    # http://localhost:5173
npm test                                       # vitest run (tests/unit/**/*.test.js)
npx vitest run tests/unit/client.test.js -t "throws"   # single file / test name
npm run build                                  # vite build -> dist/
npx playwright test                            # E2E (starts its own servers on 8010/5183)
npx playwright test tests/e2e/voice.spec.js    # one spec

# Once per clone
uv run playwright install chromium            # (backend/) the dossier PDF renders in headless Chromium
python .claude/hooks/install_git_hooks.py      # (repo root) the Obsidian post-commit hook
```

- Copy `.env.example` to `.env` in each service directory.
- The frontend reads the backend URL from `VITE_API_BASE_URL` at build time; it defaults to `http://localhost:8000`.
- The backend's CORS origins come from `CORS_ORIGINS`.
- Other backend variables (all optional): `OPENAI_CHAT_MODEL`, `OPENAI_TRANSCRIBE_MODEL` and `OPENAI_TTS_MODEL` (otherwise a current model is picked from the customer key's model list), `OPENAI_TTS_VOICE` (the default reply voice when the browser sends none), and `PROPOSAL_SECRET` (the HMAC key for chat proposals; empty means a random key per process, so pending proposals expire on restart). The OpenAI key itself is never configured on the server: it lives in the customer's browser and comes with each request.

## Architecture (target design; implemented incrementally by phase)

- **Single operation protocol.** Every change is a list of typed, pure ops (`(design) -> newDesign`, no mutation). That covers manual edits and AI edits alike: `update_dimensions`, `configure_doors`, `modify_door`, `add_*` / `modify_*` for compartments, partitions, shelves, drawers, and rails, `set_material`, `set_handles`, and `remove_component`. The ops engine exists twice:
  - `backend/app/domain/`: the authoritative version, used for AI validation and saves.
  - `frontend/src/domain/`: used for instant manual editing (the store in `frontend/src/state/` wraps it).
  - Parity between them is enforced by golden fixtures in `shared/fixtures/ops/*.json`, which both pytest and vitest run. If you change an op on one side, change the other side and the fixtures too.
- **Canonical schema.**
  - All lengths are integer **millimetres**.
  - `compartments[]` is ordered left to right. `partitions[i]` sits between compartments `i` and `i+1`.
  - Width invariant: Σ compartment widths + Σ partition thicknesses + 2 × `panelThickness` = overall width.
  - IDs are stable and carry a type prefix (`cmp_`, `prt_`, `shf_`, `drw_`, `rail_`, `dr_`).
  - `revision` and `designId` live **outside** the design object.
- **Three.js renders from state only.** The viewer never owns data. The AI never touches Three.js objects. Viewer code is split into geometry builders, rendering, and picking.
- **AI proposals are stateless and signed.**
  - `/api/chat` receives `{messages, design, revision}`. The agent is called only on user messages, never on manual edits.
  - OpenAI tool calls are parsed with Pydantic, dry-run on a copy of the design, and returned as an HMAC-signed proposal `{ops, baseRevision, baseHash}`.
  - `/api/proposals/apply` verifies the signature and returns **409** if the revision or hash is stale.
  - Pending proposals are never part of the committed state. Cancel is client-only.
- **Persistence.**
  - Only the backend talks to Supabase. The `designs` table has RLS enabled with no policies, and anon/authenticated grants are revoked.
  - Share link: `/#d=<uuid>.<token>`. The token is 256-bit, stored only as a SHA-256 hash, and compared in constant time.
  - Saves use optimistic concurrency (`UPDATE ... WHERE revision = n`).
- **API responses** use the envelope `{success, data, error}`. Error messages are English and never echo input; the UI shows Hebrew text by `error.code`.
- **bobHabanai modules.**
  - `backend/app/domain/layout.py`: manufacturing geometry (full-overlay and split doors, sliding panels, hinges by height and weight). The viewer, the advisories and the dossier all follow it, so the 3D, the advice and the PDF describe the same wardrobe.
  - `backend/app/advice/rules.py`: R1–R26. A quick fix is an op list that must apply through `apply_ops` and clear its own advisory (a test checks every one).
  - `backend/app/production/` (parts, boards, nesting, estimate, drawings) and `backend/app/dossier/` (Jinja2 templates, Chromium with JavaScript off and every non-`data:` request aborted).
  - `backend/app/agent/`: the chat turn, the prompt, signed proposals, transcription and speech. `backend/app/api/voice.py` takes multipart audio up to 1 MiB (declared type checked against the magic bytes, two transcriptions at a time) and, on `/api/voice/speak`, returns MP3 for a reply (text cleaned and cut at a sentence end, two at a time, `Cache-Control: no-store`). A chat request with `spoken: true` asks the agent to answer for the ear.
  - `frontend/src/viewer/`: builders, motion (one spring per moving part), `pathtrace.js`. `frontend/src/render/`: the render HUD and the video recorder (Mediabunny, explicit timestamps).
  - `frontend/src/entry/`: the start screen (`startScreen.js`), the About page (`about.js`), and `atelier/` (the Three.js hero, the pencil `measure()` line, Bob's SVG and pure motion helpers). The hero holds a second WebGL context only while the start screen is open; choosing a card disposes it.
  - `frontend/src/chat/`: the chat model, panel, proposal card, `voice.js` (a pure gesture state machine plus the MediaRecorder wiring) and `speech.js` (reply playback: a newer answer or a press on the mic cancels an older one).
- **Translation (ADR-029).** Hebrew is the source language on both sides; nothing is keyed by an English id.
  - Backend: `app/i18n.py` holds a per-request language (`with language("ru"): ...`, a ContextVar). `tr("תא {n}", n=2)` translates through `app/i18n_catalog.py`; templates use `t(...)`, which escapes the text and keeps Markup params. Outside a `language()` block everything stays Hebrew (the workspace advisories). Write new dossier text as `tr("...", name=value)`, never an f-string. Part names and groups stay Hebrew in the data (the code compares them) and are translated on display.
  - A new dossier string needs an entry in the catalog: `tests/dossier/test_i18n.py` builds foreign dossiers for ~24 designs and fails on any untranslated string or any Hebrew letter left. One Hebrew word with two meanings (מוט: a rail or a bar handle) needs two distinct sources.
  - Frontend: `src/chat/chatI18n.js`, `ct(hebrew, params)` for the chat column; `tests/unit/chat/chatI18n.test.js` checks every `ct('…')` literal has all three translations.
  - The Russian and Arabic texts were written by AI and reviewed for placeholders and meaning only: carpentry terms need a native-speaking carpenter.
- **DoS guards on the unauthenticated API:** a body cap per route (`backend/app/body_limit.py`: 1 MiB, 4 MiB for the dossier, 1 MiB + 8 KiB for voice), a JSON node count before Pydantic (`api/limits.py`), and non-blocking concurrency slots on every endpoint that calls OpenAI or Chromium (a busy server answers 429 BUSY at once instead of holding a worker thread).

## Infrastructure

- **Railway project `banai`.**
  - Environments: `production` deploys from `main`, `dev` deploys from `dev`.
  - Services: `backend` (root `/backend`) and `frontend` (root `/frontend`).
  - Builder is Railpack. Watch patterns limit rebuilds to the changed service.
  - Settings live in the Railway environment config, mirrored in each service's `railway.json`.
  - Variables are set per environment and never shared between them.
  - Details and IDs: `docs/railway.md`.
- **Supabase.** `banai-dev` (`lrulgstsqnxllknfvdpr`) and `banai-prod` (`lkslzvgypmbjltrtcrec`).
  - The CLI is linked to **dev**. Link prod only for an approved release.
  - DB passwords are in the gitignored root file `.env.supabase`.
  - Create migrations with `supabase migration new <name>` and push with `supabase db push`.
- **Obsidian docs** live in the vault folder `BanAI/`, written through the Obsidian Local REST API (`https://127.0.0.1:27124`; the key comes from `OBSIDIAN_API_KEY` or the `obsidian` MCP entry in `~/.claude.json`, never from the repo). Two hooks append to `BanAI/10 - Work Log.md` (ADR-024):
  - **git post-commit** (`.claude/hooks/obsidian_commit_log.py`, installed into this clone's `.git/hooks` by `install_git_hooks.py`): each commit's subject, body, `Decision:` trailers and file stats. Add a `Decision: ADR-0xx …` trailer to commits that implement a decision. `--dry-run` prints the entry.
  - **Claude Code Stop hook** (`.claude/hooks/obsidian_worklog.py`): only turns that changed files (an editing tool ran, or HEAD / `git status` changed since the last Stop). Read-only turns are not logged.
  - Neither hook ever blocks a commit or a turn. Update the curated notes (`01 - Process Log`, `04 - Decisions & Assumptions`, `05 - Open Items`) when a task or phase completes.

## Gotchas

- **Patch scripts and reruns:**
  - A patch whose new text still contains its anchor is applied again on a rerun. This once tripled a block in `defaults.py` and `defaults.js`.
  - The opposite check, skipping a patch when its new text is already present, misfires when the new text is part of the old (a removal). That once left a panel section rendered twice.
  - Make each patch say what it means. After a rerun, run `ruff` (F811/F601) and grep for duplicated markers.
  - The Write tool can also turn `\u00ad`-style escapes into literal characters. Scan for them.

- **Panel handlers outlive their render:** the properties panel morphs fresh DOM into the existing fields, so an `onCommit` closure keeps the design it was built with. A handler that computes ops from the current state reads `context.current()` (three quick site readings once lost one this way).

- **Windows + Python:** read files with `encoding="utf-8"`. The default codepage is cp1255, which breaks on Hebrew or other non-ASCII text.
- **Git Bash `/tmp` paths** aren't visible to Windows Python. Use the scratchpad or a Windows path instead.
- **`frontend/package.json` overrides `compression` to 1.8.2.** `serve@14` pulls a vulnerable version. Keep the override.
- **Supabase `projects create`** can time out on the client and still create the project. List projects before retrying. It also auto-links the new project, so re-link to dev afterwards.
- **`railway logs`** needs `--service` even when you pass a deployment ID.
- **Git on this drive:** the checkout is on a drive that records no file ownership, so git stops with "dubious ownership". Run it as `git -c safe.directory=<repo path> …` (the hooks do this for their own repo only), or have the user add the exception. Don't change the global config yourself.
- **The Write tool fails on the Hebrew path** (`E:\לימודים מסודר\…`) with an auto-mode "no verdict". Write the file in the scratchpad and copy it with Bash, or edit with a short script.
- **Dev servers run from their own folder** (`backend/`, `frontend/`): Vite resolves CSS `@import` from its cwd. The uvicorn dev server has no `--reload`, so restart it after backend changes. Other sessions may hold 8020/5298; the Playwright suite uses 8010/5183.
- **SwiftShader in E2E:** the path tracer is not compiled or run under Playwright (the software renderer stalls on it), and the background prewarm is skipped on a software renderer. Render and video are checked on a GPU with the deterministic hooks (`stepRender`, `setMotion`, `captureFrame`).
- **GPU timing:** time render work with a `readPixels` sync. JavaScript timing alone misses the GPU queue (it once read 10 ms for a 38 ms sample).
- **A hidden Browser pane pauses** `requestAnimationFrame` and CSS transitions. Drive motion and samples through the test hooks, and turn transitions off for screenshots.
- **Voice in E2E** uses Chromium's fake microphone (`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`, set per spec with `test.use`). Hold the button for about 2 s: a recording under 0.6 s, or one whose level meter never rises, is not uploaded.
- **E2E console errors fail the test** (`tests/e2e/fixtures.js`). A test that expects a refused request (409, 400) declares it with `allowConsoleErrors(/pattern/)`.
- **Hebrew in shell heredocs:** Python reads a script from stdin in the Windows codepage, so Hebrew in a `python - <<EOF` script arrives garbled and string matches silently fail. Put Hebrew in a UTF-8 script file and run that.
- **No literal invisible characters in source:** write bidi controls and zero-width characters as `\u` escapes (a review found literal U+202E in source; that is a Trojan-Source risk).
- **Signed proposals in E2E:** `playwright.config.js` gives the API `PROPOSAL_SECRET=e2e-proposal-secret`, and `chatProposals.spec.js` signs proposals with the backend's own code, so the real `/api/proposals/apply` is exercised.
