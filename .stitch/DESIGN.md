# Design System: "Nordic Atelier" (Google Stitch)

- **Source:** Stitch project "BanAI Wardrobe Designer" (`projects/3881887321601714246`), generated 2026-10-14.
- **Implementation:** vanilla CSS in `frontend/src/styles/{tokens,layout,controls}.css`.

## Intent
This is a Scandinavian cabinetmaker's atelier turned into a precision desktop tool. It aims for calm, precise and uncluttered surfaces, with hairline structure instead of heavy shadows and one warm accent.

## Tokens (as implemented)

| Token | Value | Role |
|---|---|---|
| `--color-bg` | `#F4F2EE` | Warm paper chrome |
| `--color-surface` | `#FFFFFF` | Panels, inputs, cards |
| `--color-ink` | `#1F2328` | Primary text |
| `--color-muted` | `#5B6470` | Labels, units, secondary text |
| `--color-border` | `#E3E0DA` | 1px hairlines |
| `--color-accent` | `#B4532A` (hover `#9C4420`) | Burnt Oak: selection, primary actions, focus |
| `--color-success` | `#4F7A5A` | Sage |
| `--color-danger` | `#A33A2B` | Brick: validation and destructive actions |

- **Type:** Inter. Numbers use `tabular-nums`. Section labels are 11px uppercase with letter spacing.
- **Shape:** 8px radius on inputs and cards, 6px on buttons, segmented controls, chips and swatches.
- **Spacing:** 8px grid with a 4px sub-grid.

## Component rules (from Stitch)
- **Inputs:** 32px high, numbers right-aligned, unit suffix in muted text. Focus shows an accent border plus a 1px inner ring.
- **Buttons:**
  - Primary: solid accent.
  - Secondary: white with a hairline border; the hover fills with the background colour.
  - Ghost: transparent.
  - Focus: 2px offset accent outline.
- **Segmented controls:** the active option is a solid accent fill with white text.
- **Swatches:** 40px squares, 6px radius. The selected swatch has a 2px accent border and a 2px white inner margin.
- **List rows:** hover fills with the background colour. The selected row gets an 8% accent tint and a 2px left bar.
- **Selection in 3D:** accent outline plus an accent label tag.

## Deliberately not implemented
These parts of the Stitch output are outside the agreed MVP scope:
- **"Cutlist & cost estimation" bottom shelf:** pricing and manufacturing exports are excluded.
- **Project breadcrumb and "Save":** persistence arrives in Phase 7.
- **"Clearance verification" status:** feasibility checks are excluded.
- **"Export JSON" suggestion:** not requested.

The left chat panel shows an empty state and getting-started tips only until the agent is built in Phase 5.

## Extensions (2026-10-16 UX pass — extends Nordic Atelier; not a new Stitch run)
These additions come from a usability pass on the running app. They reuse the Nordic Atelier tokens, radii and spacing and were not generated in Stitch. Nothing above was changed.

### New tokens (`frontend/src/styles/tokens.css`)

| Token | Value | Role |
|---|---|---|
| `--color-border-control` | `#8D877D` | Edges of interactive controls (inputs, buttons, segmented options, swatches, switch track). 3.56:1 on white, which meets WCAG 1.4.11 (3:1 for UI components). `--color-border` stays for decorative hairlines. |
| `--z-loading` | `10` | Loading overlay in the viewer |
| `--z-toolbar` | `20` | Viewer toolbar |
| `--z-popover` | `30` | "Controls" help popover |
| `--shadow-toolbar` | `0 1px 2px rgba(31,35,40,.08), 0 4px 12px rgba(31,35,40,.08)` | Floating viewer toolbar |
| `--shadow-popover` | `0 2px 4px rgba(31,35,40,.08), 0 8px 24px rgba(31,35,40,.14)` | Help popover |

Shadows are the only exception to "hairlines instead of heavy shadows", and only for surfaces that float above other content.

### Viewer toolbar
- A floating group in the **top-right** of the 3D viewer: white at 94% opacity, hairline border, 8px radius, `--shadow-toolbar`.
- Contents, left to right:
  - A small segmented control for the camera view: **3/4** (default), **Front**, **Side**.
  - A **Fit** button that re-frames the wardrobe from the current direction.
  - The **Show interior** switch (moved here from the top bar).
- The active view uses the standard segmented style (solid accent, white text). After a manual orbit, pan or zoom no view is pressed.
- The toolbar wraps on a narrow viewer and never exceeds the viewer width.

### AI column rail
- The left AI column is 320px wide. **Below 1280px it starts collapsed** to a 48px rail with a vertical "AI Designer" label.
- The user's choice (expand or collapse, from the "AI designer" toggle in the top bar or the rail) is **remembered** and overrides the width-based default.
- The expanded column also shows short "Getting started" tips in muted text.

### "Controls" help popover
- A top-bar button (28px, hairline border) opens a 240px popover with the mouse and keyboard controls: drag, right-drag, scroll, click a part, Esc.
- It uses `--shadow-popover` and `--z-popover`. It closes on Esc (when focus is inside it), on an outside click, and when its button is pressed again.
- The top bar shows plain "Units: cm".

### Collapsible property sections
- **Wardrobe**, **Materials** and **Compartments** are collapsible. The summary is the usual 11px uppercase section label with a small chevron that rotates when open.
- The open or closed state of each section is **remembered**.
- The **Selected · …** section is never collapsible, and its title stays accent-coloured.

### Selection context line and compartment row highlight
- Under the "Selected · …" title, a small muted line says where the part is, for example `Compartment 1 · Shelf 2 of 4`, `Compartment 3 · Drawer 1 of 2`, `Between compartments 1 and 2` or `Covers compartments 1–2`.
- The row of the related compartment in the Compartments list is marked with `aria-current="true"` and a quieter version of the selected-row style: a left bar at 45% accent and a 4% accent tint (the selected row keeps its 2px full-accent bar and 8% tint). If the selection is the compartment itself, the full selected style applies.

### Selection and hover in 3D
- **Hover:** a lighter accent outline (45% opacity) and a pointer cursor. The selected part does not get the hover outline.
- **Selection:** the accent outline plus a translucent accent fill (12% opacity). This updates the earlier "accent outline plus label tag" rule; the label tag is unchanged.
- Right-click does not select, so it stays free for panning.

### Soft shadows and panel edge lines in the viewer
- The wardrobe casts a **soft shadow** onto an otherwise invisible floor, which separates the object from the grid. It is low-contrast and blurred, not a hard drop shadow.
- Every panel has **subtle edge lines** in a warm grey at low opacity, so adjacent white panels (shelf against side, door against door) stay distinguishable. They are never picked.

### Focus
- **Text fields and selects** keep the Stitch focus style, an accent border plus a 1px **inner** ring, so the ring is never clipped by a neighbouring control.
- **Everything else** (buttons, summaries, checkboxes, colour inputs, the AI column heading) shows a `:focus-visible` ring: `--focus-outline` (2px accent) with a 2px offset. Segmented options draw the ring inside (offset −2px) because the group clips its overflow. Mouse clicks do not show these rings.
