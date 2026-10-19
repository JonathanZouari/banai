# Frontend Architecture (vanilla JS + Three.js)

```
main.js (boot) ── api/client.js ──► GET /api/catalog, /api/designs/default
   │
   └─ state/store.js  ← the single committed state { design, revision, catalog, selection, ui }
        ├─ dispatch(ops) → domain/applyOps (pure, validated) → new frozen snapshot → notify
        ├─ select(id)    → { id, kind } (interior selection auto-hides doors)
        └─ subscribe(fn)
             ├─ viewer/viewer.js   renders from state (never mutates it)
             ├─ editor/*           (Phase 4) builds ops from form input → dispatch
             └─ chat/*             (Phase 5) sends design + revision to the agent
```

## State rules
- The design changes **only** via `store.dispatch(ops)`. A `DomainError` returns `{ ok: false, error }`, and the state and subscribers are left untouched.
- Snapshots are deep-frozen and compared by reference. The viewer rebuilds geometry only when `design` or `ui.doorsVisible` changes. A selection change only updates the highlight and labels.
- When a component is removed, the selection is re-resolved and cleared if needed.

## Viewer (`src/viewer/`)

| Module | Role |
|---|---|
| `buildWardrobe.js` + `builders/*` | Pure `design → THREE.Group`, with no DOM or WebGL, so it is unit-tested in Node. Every mesh has `userData { componentId, kind }`. |
| `units.js` | mm → m (×0.001), plus **visual-only** prototype constants (back panel 6 mm, door thickness 18 mm, gaps, rail radius). These are not part of the design model. |
| `materials.js` | Appearance → `MeshStandardMaterial` (catalog hex, or custom hex; finish → roughness), cached per distinct appearance. |
| `viewer.js` | Renderer (`preserveDrawingBuffer` for the Phase 8 capture), camera, OrbitControls, store subscription, and `screenPointOf` / `meshOf` helpers. |
| `picking.js` | Click → raycast → `store.select`. A drag (>5 px) is an orbit, not a click. A hit on the back panel selects the compartment under the cursor. |
| `highlight.js` | Always-on-top accent outline. A compartment outlines its interior volume. |
| `dimensions.js`, `format.js` | CSS2D labels for W/H/D and the selected component. Text is written with `textContent` only. Units are shown in cm with 1 decimal. |

Coordinates: x = 0 at the outer left face, y = 0 at the floor, front face at z = 0, back at z = −depth. Doors sit in front (z > 0). Sliding doors use two depth tracks.

## Properties editor (`src/editor/`)

| Module | Role |
|---|---|
| `opsFromForm.js` | **Pure** form-to-ops mapping (unit-tested): cm text → integer mm (`parseCm`), door, material, hinge, add-item and add-compartment ops, and `friendlyError` (fixed messages that never echo input). |
| `fields.js` | DOM builders (`el`, `cmField`, `segmented`, `selectField`, `button`). Text goes only through `textContent` / `.value`. |
| `panel.js` | Re-renders from store state (only when the design or selection changed). The selected-component section comes first, then Wardrobe, Materials and Compartments. |
| `*Section.js`, `appearanceControls.js` | Section content per component kind. Catalog swatches and custom colours are visibly distinct ("Custom: name"). |

Editing rules:
- Inputs commit on **change or Enter**, never on every keystroke.
- An invalid number shows an inline message and nothing is dispatched.
- A rejected op (`DomainError`) shows a friendly inline message, and the state is unchanged.
- Buttons and selects report errors under their section.
- No LLM is involved in manual editing.

The visual design follows the Stitch design system documented in `/.stitch/DESIGN.md`.

## Chat, entry and dialogs (UX/UI pass)

| Module | Role |
|---|---|
| `chat/chatModel.js` | **Pure** chat view-model: messages, a pending proposal kept apart from the committed design, `proposalStatus` (pending or stale by revision), Cancel. Until Phase 5 a sent message gets a "not connected" reply and nothing is applied. |
| `chat/chatPanel.js`, `chat/proposalCard.js` | DOM render of the model. The card lists structured changes with Confirm and Cancel, and turns stale (Confirm disabled) when the revision moves on. |
| `entry/entryPoints.js`, `entry/startScreen.js` | The three entry points (guided, free text, basic wardrobe) in a modal start screen. All lead to the same editor. |
| `share/saveDialog.js`, `render/renderDialog.js` | Save/share and render dialogs on the native `<dialog>`. Actions are disabled and say so until Phases 7 and 8. Render is labelled as illustrative. |
| `ui/icons.js`, `ui/dialog.js`, `ui/logo.js`, `ui/ripple.js` | Inline SVG icons and logo (no icon font, image or CDN), a Material 3 dialog helper, and a delegated press ripple. |

Styles follow Material Design 3 (`styles/tokens.css` holds the `--md-sys-*` tokens, with the older names kept as aliases). The design record is `/.stitch/DESIGN.md`.
Door hardware (handles, sliding rails, outlines) is built in `viewer/builders/doors.js` as non-selectable `kind: 'hardware'` objects. Picking refreshes world matrices before raycasting, so a click is correct even if it lands before the next rendered frame.
In dev builds `window.__banai.chat` exposes the chat model, so a proposal can be shown for visual checks (`chat.setProposal({...})`).

## Carpenter PDF (`src/export/`): proposal, not in the approved scope
This branch adds a proposal for Jonathan to review. Spec §22 excludes manufacturing export, so this stays off `dev` until it is approved.

The "Carpenter PDF" button in the top bar downloads `banai-carpenter-instructions.pdf` for the committed design. The document follows the chat's language (he/en).

It is generated entirely in the browser. It makes no network calls and never changes state.

| Module | Role |
|---|---|
| `export/carpenterPlan.js` | **Pure** `(design, catalog, language) → plan`. The plan holds the overview, per-compartment lines, a cut list (identical parts merged), assembly steps and the front-elevation measurements. The assumed construction method is in `ASSUMED_CONSTRUCTION`: configurable prototype values, separate from the render-only `VISUAL`. |
| `export/pageRenderer.js` | Draws A4 pages at 150 dpi on Canvas 2D: cover with a 3D snapshot, elevation drawing with dimension lines, cut list, then steps. The browser lays out Hebrew RTL, so no fonts are embedded. Text is drawn with `fillText`, never as markup. |
| `export/pdfWriter.js` | **Pure** minimal PDF 1.4 writer: one JPEG (DCTDecode) per page, 1–60 pages. A design at the domain caps measured 37 pages (6.8 MB, about 1.3 s). |
| `export/carpenterExport.js` | Orchestrates the steps above and triggers the Blob download. Uses `viewer.snapshot()` for the illustration. |

Every page carries a disclaimer: the document is a helper only, is not checked for manufacturing or engineering feasibility, and the carpenter must verify everything before cutting. Hardware (drawer boxes and runners, hinges, fixings) is listed as "to be specified by the carpenter", never invented.

**Known limitation:** the pages are images, so the PDF text is not selectable.

## Testing
- **Unit:** `npm test` (vitest). This covers the domain engine and parity fixtures, the store, the API client, and the builders.
- **E2E:** `npm run test:e2e` (Playwright, Chromium with SwiftShader WebGL). It starts uvicorn on :8010 and Vite on :5183. `window.__banai` exists only in dev builds (`import.meta.env.DEV`) and is stripped from production bundles.
- **Visual walkthrough:** Claude in Chrome on `localhost:5173`, with a GIF per phase.
