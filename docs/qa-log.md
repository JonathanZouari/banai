# QA log: UX/UI MVP (`uxui_nurit`)

Per-stage QA reports (stages 0–5) for the Hebrew-first UX/UI MVP. Each stage passed its gate before it was reported:
pytest, vitest, the full Playwright suite (including visual regression and axe WCAG 2.2 AA),
Claude in Chrome with a recorded GIF, and security checks (secrets, unsafe HTML sinks, invisible
characters, `npm audit`). The plan and the decisions are in the Obsidian vault note `07 - UX-UI Plan`
(ADR-008 for room fit).

| Stage | Content | Commit |
|---|---|---|
| 0 | Logo, visual regression setup, Obsidian work-log fix | `8b15218` |
| 1 | Hebrew-first RTL interface with an English switch | `7473696` |
| 2 | Homepage with a central AI field + router | `b4c6275` |
| 3 | Step-by-step designer, live summaries, notes | `c3e7fae` |
| 4 | Room fit: measurements, fit check, local-only photo, approximate layer | `24151cd` |
| 5 | Review and send: summary, save, PDF with customer requirements, share | (this commit) |

Known open items: no `OPENAI_API_KEY` locally (real AI integration tests are BLOCKED; agent flows are
tested with deterministic mocks only); one moderate `npm audit` finding (`fast-uri` via `serve`, kept by
decision); the Phase 9 CSP needs `img-src blob:` for the room photo preview.


### 2026-10-24 · Baseline (Stage 0 of the QA document), branch `uxui_nurit`, including the logo change
| Check | Result |
|---|---|
| pytest (backend) | ✅ 242 passed, 0 failed, 0 skipped |
| vitest (frontend) | ✅ 207 passed, 0 failed, 0 skipped |
| Playwright E2E (Chromium, the whole suite) | ✅ 54 passed, 0 failed, 0 skipped (6.5 min, 1 worker) |
| axe WCAG 2.0/2.1 A+AA (inside the E2E suite) | ✅ 0 violations on the screens it covers |
| Production build | ✅ |
| Secret scan (git + `dist`) | ✅ nothing found. The `.env` files and `settings.local.json` are in `.gitignore` |
| npm audit | 🟡 1 moderate: `fast-uri@3.1.8` (via `serve`→`ajv`). Existed before these changes. Proposed fix: an override `>=3.1.9` |
| Lint / type checking | ⚪ not configured in the project (no ESLint/ruff/mypy) |
| Visual regression | ⚪ none in the project (no baselines) |
| Firefox / WebKit | ⚪ not configured (Chromium only) |
| Real AI tests | ⛔ BLOCKED: no `OPENAI_API_KEY` |
| Claude in Chrome | 🟡 screenshot + console with no errors. No GIF of a full flow |
| Security review (agent) | ⚪ not run on the logo change |

### 2026-10-24 · Stage 1: Hebrew/RTL foundation: **PASSED**
**What was done:**
- `ui/i18n.js` + `ui/strings.js`: one app-wide UI language, Hebrew by default (`banai.ui.language`). `t()` plus Hebrew names for the catalog.
- Every editor string, the 3D labels, the dialogs, the start screen and the error messages are now in Hebrew, with English through the "עב | EN" switch in the top bar and on the start screen.
- `<html lang dir>` is updated live. The chat follows the interface language.
- The Rubik font replaces DM Sans/Bricolage/Inter (3 packages removed, 1 added).
- Neutral white surfaces, with the terracotta accent kept (user's decision).
- CSS logical properties (borders, switch, chevron, skip link), and arrows that mirror in RTL.
- Desktop only (user's decision).
- **Bug found and fixed during the check:** in RTL, the 3D labels left the screen. The CSS2D layer is now LTR, while the label text stays RTL.
- The accessibility statement was updated: the interface is no longer "English only".

| Check | Result |
|---|---|
| vitest | ✅ 218 passed, 0 failed, 0 skipped (11 new: key parity he/en, language, persistence, catalogName, applyDocumentLanguage) |
| pytest | ✅ 242 passed (no backend changes) |
| Playwright (full) | ✅ 62 passed, 0 failed, 0 skipped. New `i18n.spec.js` (5) |
| axe | ✅ WCAG **2.2** AA (upgraded from 2.1) on every screen, in Hebrew and English |
| Visual regression | ✅ 2 baselines updated after review (intentional design change), stable ×3 |
| Build | ✅ |
| npm audit | 🟡 the same moderate finding (`fast-uri`, existed before). Not fixed, per the user's decision |
| Secrets | ✅ none in git or in `dist` |
| Security | ✅ no `innerHTML` or other HTML sink added. The XSS test (custom colour name `<b>Sage</b>`) passes in Hebrew |
| Claude in Chrome | ✅ Hebrew → selecting a shelf → English → Hebrew. GIF `banai_stage1_hebrew_rtl.gif`, 0 console errors |

**Test changes (none disabled):**
- Text assertions moved to Hebrew.
- 3 tests became direction-aware (dropdown chevron, PDF button position, label positions).
- The axe test for the editor was split into two tests, one scan each. Investigation: two scans took 23–26 s out of a 30 s limit and failed once under load. Now 12–21 s each.

**Still open:** OpenAI key (real AI tests), Stitch review screen, `fast-uri`.

### 2026-10-24 · Stage 2: Homepage: **PASSED**
**What was done:**
- `entry/homeScreen.js`: a homepage based on Stitch, replacing the start-screen modal.
  - A central AI field with "עצב לי ארון" (design me a wardrobe) and "הזנת מידות ידנית" (enter dimensions manually), a link to the basic wardrobe ("continue your current design" once a design is in progress), 3 suggestions and the disclaimer.
  - The microphone appears only when the AI is connected. Otherwise an honest note is shown.
- `app/router.js`: home ↔ designer inside the app, through `history.state` (the URL doesn't change, so `#d=` stays safe). Browser Back/Forward work, and the logo returns home.
- Text in the field becomes the first chat message through the existing path (`chat.send`), and every change still needs Confirm. An empty field starts the guided conversation.
- "Manual entry" focuses and selects the width field. The workspace is `inert` while the homepage is shown.
- Removed: `startScreen.js`, `entryPoints.js` and its unit test (that code no longer exists; replaced by router and homeIntent tests).

**Bugs found and fixed during the check:**
1. **(From stage 1)** A shadowed variable `t` in `boot()`: with no connection to the server, the code crashed instead of showing "no connection". New E2E test.
2. "Manual entry": typing was appended to the existing value ("200.0230"). The field now selects its content.
3. Coming back home kept the text that was already sent, so it could be sent twice. The field is now cleared after sending.
4. On a short window the homepage opened scrolled (the top bar hidden). It now always opens at the top.

| Check | Result |
|---|---|
| vitest | ✅ 222 passed, 0 failed, 0 skipped (new: router ×4, promptIntent ×3) |
| pytest | ✅ 242 passed |
| Playwright (full) | ✅ 68 passed, 0 failed, 0 skipped. New `home.spec.js` (8, stable ×2) |
| axe WCAG 2.2 AA | ✅ homepage + editor + dialogs |
| Visual regression | ✅ new baseline `homepage.png` after review. Designer unchanged. Stable ×3 |
| Build / secrets / sinks | ✅ / ✅ none / ✅ no `innerHTML` added |
| npm audit | 🟡 the same moderate finding (`fast-uri`) |
| Claude in Chrome | ✅ home → description → designer + honest reply → Back → manual → 230 cm → logo → "continue". GIF `banai_stage2_homepage.gif`, 0 console errors |

### 2026-10-24 · Stage 3: Step-by-step designer: **PASSED**
**What was done:**
- The properties panel has 5 numbered steps (`<details>`):
  - מידות → דלתות → חלוקה פנימית → חומרים וצבעים → הערות מיוחדות (dimensions, doors, interior layout, materials and colours, special requests).
  - Each step shows a live one-line summary, so the panel is also a summary of the design.
  - Only step 1 is open by default, and the open/closed state is kept when the panel redraws.
  - "All parts" stays open, since it's the keyboard path to everything.
- Validation:
  - The allowed range (from `LIMITS`, a configurable default) is shown under the dimensions.
  - An out-of-range value gets a message naming the field ("רוחב צריך להיות בין 30 ל-600 ס״מ.", width must be between 30 and 600 cm).
  - A dimension that would leave shelves outside the wardrobe explains why.
- The notes step: `state/request.js` + `store.setNotes`. The notes sit outside the design (no new revision, no redraw while typing).
  - They are cleaned of control, zero-width and bidi-override characters, capped at 1000, and have a counter.
  - They are not sent anywhere yet (that's stage 5).
- Number expressions ("200 × 240 × 60", "30–600", "28 / 1000") are isolated as LTR (`ui/bidi.js`), as in the carpenter PDF.

**Bugs found and fixed during the check:**
1. The dimension values were clipped inside the step card. The padding was adjusted.
2. The step arrow flipped confusingly in RTL. It now points down/up in both languages.
3. A height that conflicts with existing shelves showed "the position is outside the wardrobe". It now gets a clear message.
4. **The editing tool turned unicode escapes (backslash-u) into invisible characters**: a line separator broke a regex, and isolates got into a test. These characters are now built from code points, and a check for invisible characters runs at every gate.

**Checked in Chrome's accessibility tree (CDP):** each step header is exposed as `DisclosureTriangle`, focusable, with an `expanded` state that updates.

| Check | Result |
|---|---|
| vitest | ✅ 235 passed, 0 failed, 0 skipped (new: request ×5, steps ×6, store notes ×2) |
| pytest | ✅ 242 passed |
| Playwright (full) | ✅ 77 passed, 0 failed, 0 skipped. Re-run in full after the last fix (the counter): 77 again. New `steps.spec.js` (10, stable ×2) |
| axe WCAG 2.2 AA | ✅ |
| Visual regression | ✅ designer baseline updated after review (steps). Homepage unchanged. Stable ×3 |
| Build / secrets / sinks / invisible characters | ✅ / ✅ / ✅ / ✅ |
| npm audit | 🟡 the same moderate finding (`fast-uri`) |
| Claude in Chrome | ✅ steps, live summaries, notes with a counter. GIF `banai_stage3_steps.gif`, 0 console errors |

**UX note:** the "הפקת פרופיל סגנון" button (generate style profile) now sits inside step 3 next to "+ הוספת תא" (add compartment), as CLAUDE.md requires. The chat still offers it after a confirmed proposal, and stage 5 will put it on the review screen.

### 2026-10-24 · GitHub
- `uxui_nurit` pushed to `nuritfiliba79-spec/banai` (`8fc092d..c3e7fae`): stages 0–3. No PR, no merge to `main`.

### 2026-10-24 · Stage 4: Room fit: **PASSED**
**What was done (ADR-008):**
- A "מעצב | התאמה לחדר" (designer | room fit) switch in the top bar. The room view is a router view (`room`), so browser Back works.
- The room panel (`room/roomPanel.js`):
  - wall measurements (width, free height, usable depth; optional; 1–2000 cm as an input-safety default)
  - a live fit check (`room/roomModel.js`: wardrobe ≤ space per dimension only, saying by how much it's too big)
  - obstacles (window/door/socket/beam/radiator) + free text
  - the room photo
  - a room description, and a "בקשו המלצת צבעים מה-AI" button (ask the AI for colour suggestions, text only)
- Honest notes: "זו בדיקה בסיסית של מידות בלבד…" (this only compares measurements), hinged doors need opening space (for the carpenter to confirm, no number), and a note when obstacles are marked.
- The photo (`room/photo.js`):
  - JPG/PNG/WebP only (SVG rejected), up to 10MB and 40MP, decoded before display (a broken file is rejected).
  - A local object URL that's released on replace/remove. **Never uploaded, saved or sent to the AI.**
- The wardrobe layer (`room/roomStage.js`): a front-on transparent cut-out (`renderSnapshot({ transparent })`) over the photo.
  - Moved by mouse, by keyboard (arrows, +/−) and with buttons (an alternative to dragging, WCAG 2.5.7).
  - Labelled "הדמיה משוערת בלבד, לא מדידה ולא התחייבות להתקנה" (approximate preview only, not a measurement or an installation promise).
- The room data sits in `store.request.room` (`cleanRoom`), outside the design.

**Bugs found and fixed during the check:**
1. **The live tab froze after a photo upload:** the layer was rendered with the PDF's full settings (2048 shadows, PMREM). The cut-out mode has no shadows or environment and is smaller: 5.6 s → 2.2 s in software WebGL (much faster on a GPU), with no freeze in Chrome.
2. The 3D labels leaked over the room view (CSS2D z-index). The viewer is now `isolation: isolate` and hidden in room mode.
3. **The page itself scrolled** (seen since stage 1): an absolute element escaped the panel. The panels are now `position: relative`, and the app page is `overflow: hidden` (the accessibility statement page still scrolls).
4. The cut-out looked grey without the environment light. Soft light was added in that mode only.

**A weak test found and tightened:** visual regression at a 1% ratio (and 0.2%) let a new top-bar button pass unnoticed (~1,200 pixels). Measurement showed repeated renders are pixel-identical, so it moved to `maxDiffPixels: 100`. That revealed a stage 3 change that had slipped through (the "200 × 240 × 60" order on the homepage, an intended fix). The baselines were updated after review.

**Process lesson:** a domain CPU-budget test (305 ms of a 2 s budget) failed once because I ran vitest in parallel with Playwright. The test was not changed; the gate suites now run one after another.

| Check | Result |
|---|---|
| vitest | ✅ 255 passed, 0 failed, 0 skipped (new: roomModel ×5, photo ×7, overlay ×3, cleanRoom ×4, store room ×1) |
| pytest | ✅ 242 passed (no backend changes) |
| Playwright (full) | ✅ 89 passed, 0 failed, 0 skipped. New `room.spec.js` (11, stable ×2) |
| axe WCAG 2.2 AA | ✅ room view, empty and with a photo |
| Visual regression | ✅ new `room-fit.png`, homepage/designer updated after review, strict threshold, stable ×3 |
| Privacy | ✅ an E2E test checks that no request carries image bytes or leaves our servers (blob: = local reads only) |
| Build / secrets / sinks / invisible characters | ✅ |
| npm audit | 🟡 the same moderate finding (`fast-uri`) |
| Claude in Chrome | ✅ room view → upload → layer → wall 180 → "גדול ב-20 ס״מ" (20 cm too large) → move/resize. GIF `banai_stage4_room_fit.gif`, 0 console errors |

**Phase 9 reminder:** the CSP needs `img-src 'self' data: blob:` for the photo preview (already in Obsidian `05 - Open Items`).

### 2026-10-24 · Stage 5: Review and send: **PASSED**
**What was done:**
- A review screen (`review/reviewScreen.js`, router view `review`, a "לסיכום ושליחה" (review and send) button in the top bar):
  - a picture of the wardrobe
  - a card per part (dimensions, doors, interior layout, materials, notes, room fit), each with "עריכה" (edit), which goes back to that step or to the room view
  - save and get a private link, the PDF for the carpenter, and sending by copy, email or WhatsApp (links the customer opens; the app sends nothing)
  - a warning that anyone with the link can edit, and "אין כאן מחיר או אישור ייצור" (no price and no manufacturing approval here)
- The backend (additive, optional, per the approved plan): `request {notes, room}` in `POST/PUT /api/designs` (the existing `customer` column) and in `POST /api/export/pdf` (a "דרישות הלקוח" (customer requirements) page).
  - Strict validation in `app/api/customer_request.py`. The value is re-validated on read and never contains the photo.
  - A save without `request` keeps the stored one, so older clients keep working.
- Opening a private link restores the notes and the measured wall into the store.

**Bugs found and fixed during the check:**
1. `request` was sent with the PDF even when empty. An existing test that checks exactly which fields are sent caught it. The app was fixed (`isEmptyRequest`, data minimization); the test was not changed.
2. The local backend was running without auto-reload, so it was restarted for the live test.

**Real integration (not mocked):** in Chrome against the real Supabase `banai-dev`: save with notes and a wall → reopen the link → the notes and the room came back exactly. It's the first live test of the `customer` column.

**Timeout:** each test in `review.spec.js` walks the whole journey across several screens, so the file was given 60 s instead of 30 (no assertion was changed).

| Check | Result |
|---|---|
| vitest | ✅ 261 passed, 0 failed, 0 skipped (new: share ×3, request with saves/PDF ×2, isEmptyRequest ×1) |
| pytest | ✅ 268 passed, 0 failed, 0 skipped (26 new in `test_customer_request.py`: save/reopen, the same token, 14 hostile-input cases, Supabase, the PDF page) |
| Playwright (full) | ✅ 96 passed, 0 failed, 0 skipped (re-run in full after the fix). New `review.spec.js` (6, stable ×2) |
| axe WCAG 2.2 AA | ✅ the review screen, before and after saving |
| Visual regression | ✅ new `review.png`, designer/room updated after review (the new top-bar button), stable ×3 |
| Build / secrets / sinks / invisible characters | ✅ |
| npm audit | 🟡 the same moderate finding (`fast-uri`) |
| Claude in Chrome | ✅ review → save (Supabase dev) → link → share buttons → reopen restores the notes and the room. GIF `banai_stage5_review_send.gif`, 0 console errors |

**Security:** strict validation of `request` (types, ranges, a fixed list, caps, hidden characters rejected), the same token protection (a wrong token returns 404 without data), plain text in the PDF, share links encoded and limited to the app's own links, `noopener noreferrer` for WhatsApp, no personal details collected, and an empty request is not sent.

**Open:** sending through WhatsApp puts the private link in the WhatsApp URL (customer-initiated, with a warning). No OpenAI key: AI flows are tested with mocks only. `fast-uri`.

### 2026-10-28/29 · Merging dev into `uxui_nurit` (PR #54 kept up to date)
Run on Nurit's request with **approval at every important step**. Rules: protect `main`, `dev` and the existing work; no force-push; no automatic ours/theirs; no push without approval.

**Round 1 (`dev` = `a8599e1`, new catalog entries + docs pages):**
- Backup branch `backup/uxui_nurit-before-rebase` (`f666c72`). Remote `upstream` added for `JonathanZouari/banai`, read-only (push URL disabled).
- **Merge instead of rebase** (Nurit's decision): `origin/dev` doesn't exist in the fork, and a rebase would need a force-push to update the PR.
- No conflicts. One test from `dev` (`editor.spec.js`, new catalog) expected the English UI. It was adapted to Hebrew and the materials step, with the same checks.
- Commits `a4861b8` (merge) and `18eac5d` (test), pushed.
- Gate: pytest 270, vitest 264, Playwright 97/97 after reducing load on the machine (Chrome closed, OneDrive paused). The room axe test runs out of time under load; it also does on the pre-merge backup.
- **Lesson:** `dev` moved while the tests ran (8 more PRs), so PR #54 became CONFLICTING right after the push. **Always re-fetch `dev` right before a push.**

**Round 2 (`dev` = `076547d`: Spanish, display units, intro tour, share button, save picture, camera focus, `mirror_layout`, more catalog):**
- Backup branch `backup/uxui_nurit-before-merge-2` (`18eac5d`). 16 conflicting files, resolved in 4 groups, each approved before it was applied.
- **Nurit's decisions:**
  - Spanish in the chat and PDF only; the UI stays Hebrew/English.
  - The unit selector replaces the fixed "ס״מ" label, with Hebrew unit names.
  - The tour starts only the first time the designer opens (not over the homepage or the room view).
  - The room view stays in cm (option A, open item).
- **Combined, never one side over the other:**
  - The steps, notes, room and review stay. `dev`'s units drive the fields, the range and errors in step 1, the summary and the 3D labels.
  - The share button and "שמירת תמונה" are in Hebrew. The snapshot supports both the transparent room cut-out and the PNG picture.
- **Gaps between `dev`'s PRs and this branch, fixed:**
  1. **A Spanish PDF with notes or a room crashed:** the customer page had no Spanish texts. 18 texts added, plus a pytest test.
  2. Spanish tour texts were missing (a `dev` test failed on `dev` itself).
  3. Spanish PDF names for solid oak, olive green and terracotta were missing (same).
  4. Hebrew UI names for those three were added.
  5. A bug introduced in the merge itself: the tour started before focus moved, so closing it lost focus. Fixed in `main.js`.
- **Tests adapted (none disabled):**
  - `dev`'s `units`, `tour`, `catalog`, `spanish`, `export`, `ux` and `displayUnits` tests: Hebrew labels, opening the right step, the homepage instead of the old start screen, and a direction-aware bubble position.
  - `i18n.spec` now checks the unit selector.
  - 4 visual baselines updated after review, stable 3/3.

| Check | Result |
|---|---|
| pytest | ✅ 309 passed |
| vitest | ✅ 325 passed |
| Playwright (full) | ✅ 122/123; the room axe test with a photo timed out under load, then passed alone 2/2 (0 violations) |
| Visual regression | ✅ 4 baselines updated after review, stable ×3 |
| Build / secrets / invisible characters | ✅ (the one hit is a deliberate security test from 2026-10-16) |
| npm audit | 🟡 only `fast-uri` (existing, not fixed by decision) |
| Security review | ✅ no new HTML sinks or network calls. `mirror_layout` is a strict model with no parameters. Language limited to `he/en/es`. `request` still strictly validated |

- **Commit `8325022`** (merge, parents `18eac5d` + `076547d`), normal push. `dev` was re-fetched right before the push (unchanged).
- **PR #54: MERGEABLE again**, waiting for the owner's review and merge.

**Claude in Chrome walkthrough after the merge (2026-10-29):** ✅
- The homepage has no tour. The tour appears on the first entry to the designer, in Hebrew and RTL, and Esc returns focus to "?".
- cm ↔ mm updates the fields, the range, the summary and the 3D labels.
- Room view: wall 180 shows "גדול ב-20.0 ס״מ". The photo, the approximate layer and the local-only note are all there.
- A Spanish PDF with the measured wall returned 200, with 9 pages and the "Requisitos del cliente" page.
- "שמירת תמונה" saved `banai-200x240x60.png`.
- 0 console errors.
- GIFs: `banai_merge_dev_tour_units.gif`, `banai_merge_dev_room_pdf_es_picture.gif`.
- Noted as open items: the crowded top bar at 1280 px, and one stall after moving the room layer.
- The leftover temp worktrees were cleaned up (the git "Permission denied" warning is gone).
  - **Crowded top bar at 1280 px:** "לסיכום ושליחה", "התאמה לחדר" and "הצגת פנים הארון" wrap to two lines since the unit selector and "?" were added. Options: shorter labels, an icon for the tour, or a unit dropdown.
  - **One stall in the room view:** one screenshot timed out (30 s) right after moving the layer, then the page recovered. Moving doesn't re-render 3D, so the likely cause is machine load. Watch for it.

### 2026-10-29 · Carpenter PDF: standards and drawing conventions (`feature/carpenter-pdf-standards`) — **PASSED**
Option A (Nurit's decision): a better **design drawing**, never a manufacturing spec, and no orders.
- **Title block (ISO 7200 fields):**
  - Drawing number `BA-XXXXXXXX`: SHA-256 of the canonical design, so the same design always gets the same number. It never uses the share link, id or token.
  - A "שרטוט עיצוב, לא לייצור" (design drawing, not for production) status on every sheet.
- **"תקנים ואחריות" (standards and responsibility)**, added after the notes for the carpenter:
  - SI 5555 applies to a finished domestic storage unit.
  - The drawing does not certify compliance and is not a production approval. Materials, joints, hardware and compliance are the carpenter's responsibility.
  - Stability and wall fixing are decided by the carpenter. Wall fixing is outside the standard.
  - The drawing number is explained.
- **"פנים הארון לפי תא" (interior by compartment) sheet:** shelves, drawers with their fronts, and rails with heights. It paginates; the worst case (20 compartments, 300 items) is tested.
- **Build steps:** a heading moves to the next column instead of ending one.
- **Visual check** (rendered pages in he/en/es):
  - Hebrew table: "ב-400" broke the word order, so it now uses "בגובה 400" and "מ-0 עד 200", as in the build steps.
  - en/es headers capitalized.
  - Title block widths retuned for Spanish.

| Check | Result |
|---|---|
| pytest | ✅ 315 passed (6 new in `tests/export/test_standards.py`) |
| vitest | ✅ 325 passed |
| Playwright (full) | ✅ 123/123 |
| Build / secrets / hidden characters | ✅ |
| npm audit | 🟡 only `fast-uri` |
| Security review | ✅ no new inputs or API change; the hash covers only the validated design |

- Commit `45677c1`, pushed as a new branch, no PR yet. Open items: confirm SI 5555 is current, and the PR to `dev` after #54.
