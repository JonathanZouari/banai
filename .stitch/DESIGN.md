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
- **Inputs:** 36px high, numbers right-aligned, unit suffix drawn inside the field in faint text. Focus shows an accent border plus a soft 3px accent ring.
- **Buttons:**
  - Primary: solid accent.
  - Secondary: white with a hairline border; the hover fills with the background colour.
  - Ghost: transparent.
  - Focus: 2px offset accent outline.
- **Segmented controls:** options sit in a tinted track; the active option is a solid accent pill with white text.
- **Swatches:** 32px circles in two labelled rows, "Colours" and "Wood" (catalog colours with `"texture": "wood"`; these show a grain pattern and render with a procedural wood-grain map in 3D). The selected swatch has a 2px white gap and a 2px accent ring.
- **List rows:** hover fills with the background colour. The selected row gets an 8% accent tint and a 2px left bar.
- **Selection in 3D:** accent outline plus an accent label tag.

## uxui pass (branch `uxui`)
- **Layout:** property sections are cards; the top bar has a brand mark and an interior switch; the viewer has a studio backdrop, soft ground shadow, panel edge lines, a reset-view button and a usage hint.
- **Motion** (all disabled under `prefers-reduced-motion`):
  - the camera swoops in on load and flies (on an orbit arc) when re-framing;
  - "Show interior" swings hinged doors open about their hinges (sliding panels slide aside), and swings them shut again;
  - edited parts glide to their new position; new parts pop in (drawers slide in from the front);
  - the selection outline pulses gently, and hovered parts get a faint outline;
  - the panels and cards cascade in once on load.

## Deliberately not implemented
These parts of the Stitch output are outside the agreed MVP scope:
- **"Cutlist & cost estimation" bottom shelf:** pricing and manufacturing exports are excluded.
- **Project breadcrumb and "Save":** persistence arrives in Phase 7.
- **"Clearance verification" status:** feasibility checks are excluded.
- **"Export JSON" suggestion:** not requested.

The left chat panel shows an empty state only until the agent is built in Phase 5.
