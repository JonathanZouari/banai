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
| `viewer.js` | Renderer (`preserveDrawingBuffer` for the Phase 8 capture), camera, OrbitControls, store subscription, the camera-view API (below), and `screenPointOf` / `meshOf` helpers. A hit on the back panel selects the compartment under the cursor. |
| `camera.js` | Pure camera maths (no DOM or WebGL, unit-tested): `fitDistance`, the named view directions `VIEWS`, `poseFor` / `poseAlong`, `blendPose` and `easeInOut`. |
| `picking.js` | Click → raycast → `store.select`. Only the primary button picks, so right/middle-drag pans without selecting. A drag (>5 px) is an orbit, not a click. Hover is one raycast per animation frame, skipped while a button is held. |
| `highlight.js` | Selection: an always-on-top accent outline plus a translucent accent fill. Hover: a lighter accent outline, no fill. A compartment uses its interior volume. Overlays live in their own layers and are never raycast targets. |
| `shadow.js` | Pure fitting of the key light's orthographic shadow camera to the wardrobe and the floor patch it shadows, so the shadow map is only spent where something is drawn. |
| `edges.js` | Thin panel edge lines: one `LineSegments` child per component mesh, all sharing one material owned by the viewer. They are never raycast and are removed before the wardrobe is disposed. |
| `dimensions.js`, `format.js` | CSS2D labels for W/H/D and the selected component. Text is written with `textContent` only. Units are shown in cm with 1 decimal. |

Coordinates: x = 0 at the outer left face, y = 0 at the floor, front face at z = 0, back at z = −depth. Doors sit in front (z > 0). Sliding doors use two depth tracks.

### Viewer API (camera views)
`createViewer(container, store)` returns, besides `camera`, `controls`, `canvas`, `meshOf`, `screenPointOf` and `dispose`:

| Member | Behaviour |
|---|---|
| `setView(name, { animate = true })` | Moves to a named view: `'threeQuarter'` (the default), `'front'` or `'side'`. An unknown name is ignored. |
| `fitView({ animate = true })` | Re-frames the whole wardrobe from the **current viewing direction**. |
| `viewName` (getter) | The current named view, or `null` after a manual orbit, pan or zoom. |
| `subscribeView(fn)` | Calls `fn(viewName)` on every change, including to `null`. Returns an unsubscribe function. |

How it behaves:
- A view is a pose from `camera.js`: the camera looks at the wardrobe centre from a fixed direction, at the distance where the bounding sphere fits **both** FOV axes (5 % margin). That is why the wardrobe fits at any aspect ratio, tall or wide.
- Moves are animated in the render loop for 300 ms (`blendPose` with `easeInOut`: the target moves linearly and the camera orbits it at a blended distance). With `animate: false`, or when the user prefers reduced motion, the camera jumps instead. Reduced motion also turns off OrbitControls damping, and it is re-read when the media query changes.
- Starting a manual orbit, pan or zoom cancels a running animation and sets `viewName` to `null`.
- When the design is rebuilt, the camera is reset to `'threeQuarter'` (without animation) only if the overall width, height or depth changed. Any other edit keeps the camera where it is.
- **Refit on resize:** a `ResizeObserver` on the container resizes the renderer and label layer, updates the camera aspect and calls `fitView({ animate: false })`. The viewing direction and the named view are kept, but any manual zoom or pan is reset.
- **Soft shadows and edge lines:** the key light casts a shadow onto an invisible floor (`ShadowMaterial`). The shadow map is redrawn only after the wardrobe is rebuilt, since it is static in between. Edge lines are attached after each rebuild, and a 30° angle threshold keeps the rail cylinder from showing every facet.

## Page wiring (`src/main.js` and `index.html`)
Everything outside the canvas and the properties panel is wired in `main.js`:

- **View toolbar** (`bindViewToolbar`). The `[data-view]` buttons and `#view-fit` are rendered `disabled` in `index.html` and are enabled only when the viewer provides `setView` / `fitView`, so the app still boots with an older viewer. A click calls `viewer.setView(button.dataset.view)` or `viewer.fitView()`. Each button's `aria-pressed` follows `viewer.subscribeView` (initialised from `viewer.viewName`), so no button is pressed after a manual orbit.
- **Show interior** (`bindInteriorToggle`). `#toggle-interior` is the inverse of `ui.doorsVisible`: changing it calls `store.setDoorsVisible`, and a store subscription keeps it in sync when selecting an interior part hides the doors.
- **AI column** (`bindChatPanel`, runs at load). The `workspace--chat-collapsed` class turns the column into a 48 px rail. It is collapsed when the stored choice says so, or, with no stored choice, when the window is narrower than 1280 px (re-evaluated when the media query changes). Both the top-bar toggle `#chat-toggle` and the rail button `#chat-rail-toggle` flip it, store the choice and update `aria-expanded`. Expanding from the rail moves focus to the "AI Designer" heading.
- **Esc** (`bindEscape`, runs at load). A document-level `keydown`:
  - It is ignored while an IME is composing and when the event target is an `input`, `select`, `textarea` or editable element, so Esc inside a field never clears the selection.
  - If the "Controls" popover is open and the event target is inside it, Esc closes it and returns focus to its button.
  - Otherwise, if something is selected, it calls `store.select(null)`.
  - A `pointerdown` outside the popover also closes it.
  - The store is looked up lazily, so Esc before the app has booted does nothing.
- **Loading and errors.** The `.viewer-loading` overlay is removed once the store, viewer and panel exist (or when boot fails). A failed boot shows the error banner, and its **Retry** button reloads the page.
- `window.__banai = { store, viewer }` exists only in dev builds.

## Properties editor (`src/editor/`)

| Module | Role |
|---|---|
| `opsFromForm.js` | **Pure** form-to-ops mapping (unit-tested): cm text → integer mm (`parseCm`), door, material, hinge, add-item and add-compartment ops, and `friendlyError` (fixed messages that never echo input). |
| `fields.js` | DOM builders (`el`, `section`, `collapsibleSection`, `cmField`, `countField`, `segmented`, `selectField`, `button`, `actionResult`). Text goes only through `textContent` / `.value`. |
| `panel.js` | Re-renders from store state (only when the design or selection changed). The selected-component section comes first, then Wardrobe, Materials and Compartments. See "Panel rendering". |
| `*Section.js`, `appearanceControls.js` | Section content per component kind. Catalog swatches and custom colours are visibly distinct ("Custom: name"). |
| `selectionContext.js` | **Pure** `describeSelection(design, selection)`: where the selected part is, in words (below). |
| `uiPrefs.js` | The two remembered UI preferences in `localStorage` (below). |

Editing rules:
- Inputs commit on **change or Enter**, never on every keystroke.
- An invalid number shows an inline message and nothing is dispatched.
- A rejected op (`DomainError`) shows a friendly inline message, and the state is unchanged.
- Buttons and selects report errors under their section.
- No LLM is involved in manual editing.

### Panel rendering
`mountPanel(root, store)` renders once and then on store changes. It returns a cleanup function.

- **Skip.** A render is skipped unless `state.design` or `state.selection` changed by reference. Other changes, such as door visibility, do not touch the DOM.
- **Deferred.** The store subscription schedules at most one `setTimeout(0)`, which renders the latest state. This lets a Tab key's focus move finish before the DOM is replaced.
- **Focus.** Before the DOM is replaced, `captureFocus` records which control has focus as a key:
  - `t:<data-testid>` when the control has a test id, otherwise
  - `k:<section>/<group>/<data-key>`, built from the nearest `[data-section]` (collapsible sections) and `[data-group]` (appearance groups).

  For text-like inputs it also records the value and the selection range. After the new DOM is in place, `restoreFocus` finds the control with the same key and focuses it (`preventScroll`). It puts the selection back, or the caret at the end if the re-rendered value differs. This is why every focusable control needs a `data-testid` or a `data-key`; the `fields.js` builders set `data-key` to the label.
- **Scroll.** When the selected component changes (a different `kind:id`), the panel scrolls to the top so the "Selected" section is visible (`smooth`, or `auto` when the user prefers reduced motion). Otherwise its previous `scrollTop` is restored.
- The hint under "Properties" switches between "Click a component…" and "Press Esc or click empty space to deselect."

### Sliders, handles and mirror
- **Sliders.** `cmField({ range: { min, max, step = 10 } })` (mm) adds an `input[type=range]` (`data-testid` `<field>-slider`, `aria-label` "<label> slider", `aria-valuetext` "200.0 cm"). Dragging fills the text field at once and dispatches the latest value at most once per animation frame (`liveSlider.js` `createLiveCommit`), so the 3D view follows 1:1; `change` commits the final value. A rejected value is not applied: the text keeps the last accepted value, the inline error shows, and the thumb snaps back on release. Arrows move 1 cm; PageUp/PageDown move 10 cm. Ranges come from `sliderRanges.js` (W/H/D from `LIMITS`; shelf/drawer/rail `y` up to the interior height minus the item; compartment width up to where its neighbour hits the minimum). W/H/D sliders sit in a stack under the three numbers so Tab order stays Width, Height, Depth.
- **No fight with re-renders.** `panel.js` holds a drag gate (`createDragGate`): while a pointer is down on a slider the render is skipped (the values of the other inputs are patched in place), and the full render runs once the pointer is released.
- **Handles.** The Wardrobe section has a Handles group (`handles-style` select, `handles-finish` segmented) dispatching `set_handles { target: 'all' }`. A selected door or drawer has the same block (`door-handle-*` / `drawer-handle-*`, showing the inherited value while it has no override) and a "Use wardrobe handles" button (`*-handle-reset`, `set_handles { target, clear: true }`) shown only with an override.
- **Door.** Hinge side is `modify_door { id, hingeSide }` (other doors and overrides are kept); "Mirror front" (`door-mirror`) is `modify_door { id, mirror }`.
- **Grain.** Wood swatches (catalog colours with `grain`) get `data-grain`; CSS paints streaks over the colour.
- **Viewer stepper CSS.** `.dim-label-group`, `.dim-step`, `.dim-step--minus/--plus` and the `.viewer-toolbar--quick` bar are styled in `layout.css`.

### Selection context (`selectionContext.js`)
`describeSelection(design, selection)` returns `{ compartmentId, text }` and never throws or mutates the design. `text` is empty (and `compartmentId` is `null`) for no selection, an unknown id, or an id that does not match its kind.

Compartments are numbered from 1, left to right (array order). Shelves and drawers are numbered from 1 **bottom-up by `y`**, ties in array order.

| Selection | `text` | `compartmentId` |
|---|---|---|
| shelf | `Compartment 1 · Shelf 2 of 4` | its compartment |
| drawer | `Compartment 3 · Drawer 1 of 2` | its compartment |
| rail | `Compartment 2 · Rail` (`… · Rail 1 of 2` when the compartment has several) | its compartment |
| compartment | `Compartment 2 of 3` | itself |
| partition | `Between compartments 1 and 2` (`partitions[i]` sits between compartments `i` and `i+1`) | `null` |
| hinged door | `Covers compartment 1`, `Covers compartments 1–2` (`1, 3` if not adjacent) | the first covered compartment |
| sliding door | `Door 1 of 3` (sliding doors have no `compartmentIds`, so they are described by position) | `null` |
| carcass | `Wardrobe body` | `null` |

It is used in two places:
- `componentSection.js` shows `text` as `p.prop-section__context`, directly under the "Selected · …" title.
- `compartmentsSection.js` gives the row whose compartment id equals `compartmentId` `aria-current="true"` and the class `compartment-row--context` (a quieter echo of the selected-row style). A selected compartment also keeps `is-selected`.

### UI preferences (`uiPrefs.js`)
Two preferences are kept in `localStorage`:

| Key | Value | Used by |
|---|---|---|
| `banai.ui.chatCollapsed` | `'1'` (collapsed) or `'0'` (expanded) | AI column, in `main.js` |
| `banai.ui.sections` | JSON object `{ "<sectionKey>": <open: boolean> }` | `collapsibleSection` in `fields.js`; keys are `wardrobe`, `materials`, `compartments` |

Parsing is defensive, since the stored data is not trusted:
- Every storage access is wrapped in `try/catch`, so blocked or full storage, or private mode, never breaks the app. A failed write is simply not remembered.
- `readChatCollapsed()` returns `true`, `false` or `null`. Anything other than `'1'` or `'0'` gives `null`, which means "use the width-based default".
- `readSectionStates()` accepts only a plain JSON object. It keeps an entry only when the key matches `/^[a-z][a-z0-9-]{0,31}$/` and the value is a boolean. The result is a prototype-less map, and malformed data gives an empty map (every section open).
- `writeSectionState()` merges into that sanitised map, so invalid stored entries are dropped on the next write.
- A section is open unless its stored value is exactly `false`. `collapsibleSection` writes only when the new state differs from the stored one.
- Each function takes an optional `storage` argument (default `localStorage`) so it can be tested with a fake.

The visual design follows the Stitch design system documented in `/.stitch/DESIGN.md`, including its "Extensions" section for this usability pass.

## Testing
- **Unit:** `npm test` (vitest). This covers the domain engine and parity fixtures, the store, the API client, the builders, the camera maths (`tests/unit/viewer/camera.test.js`) and the pure editor helpers (`opsFromForm`, `selectionContext`).
- **E2E:** `npm run test:e2e` (Playwright, Chromium with SwiftShader WebGL). It starts uvicorn on :8010 and Vite on :5183. `window.__banai` exists only in dev builds (`import.meta.env.DEV`) and is stripped from production bundles.
- **Visual walkthrough:** Claude in Chrome on `localhost:5173`, with a GIF per phase.
