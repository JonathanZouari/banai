# Design System: "BanAI Material 3" (Google Stitch, Material Design 3)

- **Source:** Stitch project "BanAI Wardrobe Designer – M3" (`projects/3661595013505240058`), design system `assets/18261424006515661769`, generated 2026-10-16. This replaces the earlier "Nordic Atelier" system (`projects/3881887321601714246`).
- **Implementation:** vanilla CSS in `frontend/src/styles/{tokens,layout,controls,components}.css`. No UI framework and no `@material/web`: the Material 3 tokens are mapped to CSS variables.

## Stitch screens used as reference
| Screen | Used for |
|---|---|
| "BanAI — Design your wardrobe" (2 variants) | Start screen with the three entry points |
| "BanAI — Configurator Workspace" / "Wardrobe Configurator Workspace" | 3-column workspace, top app bar, properties panel, selection styling |
| "AI Designer — Material 3 Side Panel" | Chat bubbles, proposal card, stale banner, composer |

## Known gaps with the Stitch tooling
- `update_design_system` returned "invalid argument" for every payload, so the Stitch design system has the M3 seed colour (`#B4532A`, tonal spot, light), 12px roundness and our guideline notes, but its **fonts could not be set**. Roboto is applied in code.
- Screen generation exceeds the tool timeout, but the screens do finish. Poll `list_screens` instead of retrying.

## Tokens (as implemented in `tokens.css`)
- **Colour:** seed `#B4532A` (primary). M3 roles: primary, on-primary, primary-container `#FFDBCE`, secondary-container, tertiary-container, surface `#FFF8F6`, surface-container lowest to highest, on-surface, on-surface-variant, outline, outline-variant, error. Light scheme only.
- **Type:** Bricolage Grotesque (headings, wordmark) with DM Sans (UI and body), both self-hosted via `@fontsource`. M3 scale as `--md-sys-typescale-*`; the display face is used for headline and title roles, DM Sans for body and label roles. Numbers use `tabular-nums`.
- **Shape:** extra-small 4 (chips, labels), small 8 (text fields, tags), medium 12 (cards, list rows), large 16 (chat bubbles, entry cards), extra-large 28 (dialogs), full (buttons, switch, segmented control).
- **Elevation:** tonal surface containers. Shadows only on dialogs (`--md-sys-elevation-3`).
- **Aliases:** the older `--color-*`, `--radius-*` and `--text-*` names still resolve (to M3 values), so existing component CSS and JS-created elements keep working.

## Component rules
- **Top app bar:** 64px, surface-container-low, wordmark in primary. "Show interior" is a switch, Render is tonal, Save is filled.
- **Outlined text field:** 40px, 8px radius, numbers right-aligned with a `cm` suffix, 2px primary focus ring, error uses the error colour.
- **Buttons:** filled (primary), outlined (default), text (ghost), tonal (secondary container). Full radius. Disabled uses the standard M3 38% content opacity.
- **Segmented button:** full-radius outline. The selected option uses secondary-container and a check mark.
- **Swatches:** 40px circles, selected has a primary ring.
- **List rows (compartments):** hover tint, selected uses secondary-container and a 3px primary bar.
- **Selected component card:** primary-container surface with a primary outline.
- **Chat:** user bubbles in primary, assistant bubbles in surface-container-high, system notes in surface-container.
- **Proposal card:** structured change list, "Not applied yet" note, Confirm (filled) and Cancel (outlined). When stale it turns amber, shows "Design changed. Ask the agent to re-propose." and Confirm is disabled.
- **Dialogs:** native `<dialog>`, 28px radius, scrim, focus trap and Esc from the platform.

## Deliberately not implemented (outside the product scope)
Stitch added these; they are not in the spec or have no domain support:
- "Studio" badge, model name, "Engine WebGL" status bar and tolerance readout.
- 3D Orbit / Front Elevation / Wireframe tabs, lighting and scale controls (the viewer only rotates, zooms and selects).
- Suggested-adjustment chips, Duplicate button, Terms/Privacy links, "Autonomous interior synthesis" chip.
- Cutlist and cost estimation, pricing, accounts.

## Logo
Inline SVG (`ui/logo.js`): a rounded gradient mark with two doors, pulls and an AI sparkle, plus a bold Bricolage Grotesque wordmark where "AI" carries the terracotta gradient. Used in the top app bar (with a "Wardrobe Designer" tagline) and on the start screen.

## Door rendering
- **Hinged:** one panel per door spanning its compartments, a vertical handle on the free edge (opposite the hinge), and a thin outline.
- **Sliding:** panels overlap their neighbours (60 mm) and alternate between a back and a front track, inside a top and bottom rail, each with a pull handle on the side that is not covered. One panel has no overlap.
- **None:** no doors and no hardware. "Show interior" hides doors together with their hardware.
- Handles, rails and outlines are visual hardware only (`kind: 'hardware'`): not selectable, not part of the design, and clicks pass through to the door.

## Interaction
Press ripples on buttons, chips, segmented options and swatches; hover lift on cards and starter prompts; message and proposal entrance animations; dialog scale-in; a pointer cursor over selectable components in the 3D view. All motion is disabled under `prefers-reduced-motion`.

## Honesty rules in the UI
- The AI agent is not connected until Phase 5: sending a message gets a clear "not connected" reply, and the design is never changed.
- Save and Render open dialogs that say they are unavailable and show no fake link or image. Render is always labelled "Illustrative image, not the accurate 3D model".
- The UI never claims a design is ready for manufacturing.

## UX/UI MVP pass (2026-10-24, branch `uxui_nurit`)
- **Stitch project:** "BanAI – UX/UI MVP (Hebrew RTL)" (`projects/12799220943582949685`), on Nurit's Stitch account. The earlier projects belong to another account.
- **Design system:** "BanAI Atelier" (`assets/fb2b88817aaf4ee2b5b2448268c0f07c`). It's Hebrew RTL: Rubik, `#9C4520` as the accent, white and `#F7F7F8` surfaces, pill inputs and buttons, 20px cards.
- **Screens:**
  - "BanAI - דף הבית" (homepage, `2bc24c86553f42f9b8f5a0cd3c300acd`). This matches the plan: a central AI field, "עצב לי ארון" (design me a wardrobe) / "הזנת מידות ידנית" (enter dimensions manually), suggestion chips, and the disclaimer.
  - "אשף הזנת מידות" (dimensions wizard, `2e7888a0146d4b15b7485c2d9401d916`). Stitch made a wizard, not the requested 3-column designer. Used **only** for its step bar.
- **Not adopted from the wizard (outside the scope or invented):**
  - a corner/L wardrobe, since the scope is straight wardrobes only
  - a "leave 2–3 cm" clearance tip
  - "standard" height and depth values
  - AI extracting measurements from a photo
- **The review screen was not generated.** The generation timed out and hadn't appeared after about 10 minutes of polling. Retry before Stage 5.
- **Logo:** the brand artwork "BanAI logo.png" (Obsidian vault) replaces the inline SVG mark.
  - The web sizes are `frontend/src/assets/banai-logo.png` (393×160) and `banai-mark.png` (128×128, also the favicon).
  - They are cropped, with the outer background made transparent.
  - The logo is navy and teal, while the UI accent is still terracotta. This needs a decision in Stage 1.
