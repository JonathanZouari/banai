# Design System: Apple-inspired (2026-10-16, user decision; replaces Nordic Atelier; not a Stitch run)

- **Implementation:** vanilla CSS in `frontend/src/styles/{tokens,layout,controls}.css`. Every colour, radius, shadow, material and easing is a token in `tokens.css`.
- **Intent:** a calm, precise desktop tool in the style of Apple's interfaces: grouped inset cards on a light grey background, translucent chrome, one blue accent, restrained motion.

## Tokens

| Token | Value | Role |
|---|---|---|
| `--color-bg` | `#f5f5f7` | Page and side-column background (grouped background) |
| `--color-surface` | `#ffffff` | Cards, inputs, selected segment |
| `--color-ink` | `#1d1d1f` | Primary text |
| `--color-muted` | `#6e6e73` | Secondary text. 5.07:1 on white, 4.66:1 on `--color-bg`. Not used on the viewer colour (4.35:1) or on grey fills; ink is used there |
| `--color-border` | `rgba(0,0,0,.10)` | Separators between regions |
| `--color-hairline` | `rgba(0,0,0,.05)` | Card rims |
| `--color-border-control` | `#86868b` | Edges of text fields, selects, colour input, switch track. 3.62:1 on white, 3.33:1 on `--color-bg` (WCAG 1.4.11) |
| `--color-fill` / `-hover` / `-subtle` | `rgba(118,118,128,.12 / .20 / .08)` | Segmented track, secondary button, row hover |
| `--color-accent` | `#0071e3` (4.70:1 on white) | Apple blue: fills, rings, white-on-accent text |
| `--color-accent-hover` / `-pressed` | `#0066cc` / `#005bb5` | Hover darkens: white text stays at 5.57:1 (Apple's lighter `#0077ed` hover would be 4.32:1) |
| `--color-accent-text` | `#0066cc` | Accent-coloured text: 5.57:1 on white, 4.99:1 on the soft tint |
| `--color-accent-soft` / `-hover` | `rgba(0,113,227,.08 / .12)` | Tinted buttons, selected rows, chips |
| `--color-danger` | `#d70015` | 5.38:1 on white, 4.72:1 on `--color-danger-soft` (`#fdecee`) |
| `--color-success` | `#1f7d36` | Reserved |
| `--color-viewer` | `#eceeec` | 3D viewer background. Also the Three.js clear colour |

- **Typography:** `--font-ui` is `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`. Self-hosted Inter (imported in `main.js`) is the fallback on non-Apple platforms. Sizes in rem: 12 / 13 / 14 / 17px. Tracking is size-specific: titles -0.014em, 14px body -0.006em, 13px controls 0, 12px captions +0.01em, uppercase section labels +0.05em. Leading 1.2 on titles, 1.35 on labels, 1.45 on running text. Hierarchy comes from weight and size. Numbers use `tabular-nums`.
- **Shape:** 8px on controls, 6px on segments inside a segmented track, 12px on cards, panels and the floating toolbar, pills for chips and dimension labels, circles for swatches.
- **Spacing:** rem-based 4px grid (`--space-1..5`). Controls are 2rem (1.75rem small).
- **Layout (unchanged):** AI column 320px expanded / 48px rail, properties column `clamp(300px, 26vw, 360px)`, toolbar top-right inside the viewer.

## Materials and depth
- **Top bar** and **viewer toolbar** are translucent: `rgba(255,255,255,.72)` with `backdrop-filter: blur(20px) saturate(180%)` and a 1px light top highlight. The top bar has no divider, only a faint hairline and soft shadow. Its blur sits on a `::before` so the help popover (its child) can blur the page behind it.
- **Toolbar** has a soft layered shadow (`--shadow-toolbar`). The **help popover** is a thicker material (82%, blur 24px) with a deeper shadow.
- **Dimension labels** are white translucent pills with no backdrop blur (they move every frame). The selected label is solid accent.
- `@media (prefers-reduced-transparency: reduce)`: solid backgrounds, no blur. `@media (prefers-contrast: more)`: solid backgrounds, darker borders and muted text, defined edges on fills. `@supports not (backdrop-filter)`: 94% white. A `forced-colors` block keeps the switch, segments and swatches visible.

## Controls
- **Property sections:** white 12px cards on the grey panel; small uppercase secondary titles; the Selected card has an accent ring.
- **Text fields and selects:** white, 8px, `--color-border-control` edge. Focus: accent border, 1px inner ring and a 3px soft halo. Invalid: danger border. Selects use a custom chevron.
- **Segmented control:** grey track, white raised selected segment with a small shadow and semibold label. Full width in the panel, inline in the toolbar.
- **Buttons:** primary = filled accent; secondary = grey fill; ghost = tinted accent; danger = tinted red; link = text with underline on hover.
- **Switch:** real `<input type="checkbox">` drawn with `appearance: none`; 36x22 track, 18px white knob with shadow, accent when checked, knob stretches slightly while pressed.
- **Swatches:** 28px circles with an inset hairline; the selected one gets a white gap and a 2px accent ring.
- **Keyboard focus** (everything except text fields): solid 2px accent outline, 2px offset.

## Motion
- Only `transform` and `opacity` move; colour and shadow changes are short crossfades. 100-200ms, `cubic-bezier(0.23, 1, 0.32, 1)`. No `transition: all`.
- Press feedback: `:active { transform: scale(0.97) }`. Hover styles only inside `@media (hover: hover) and (pointer: fine)`.
- The help popover scales 0.96 to 1 and fades in (180ms) from its trigger.
- `prefers-reduced-motion`: no transforms; the popover fades only.

## Atelier: the start screen and About (2026-10-17, user decision)
"A carpenter's studio, drawn in pencil": an artistic layer for the first screen and the About page only. The workspace keeps the system above. Code: `src/entry/startScreen.js`, `src/entry/about.js`, `src/entry/atelier/`, `src/styles/atelier.css`. The P3 prototype in `prototypes/p3-atelier/` was the approved design.
- **Palette** (scoped to `.start` and `.about-dialog`):
  - paper `#f7f3ec`
  - graphite `#8a7f73` for lines (decoration only, 3.6:1)
  - graphite ink `#5c544b` for pencil labels (6.9:1 on white)
  - wood `#c9a27e`
  - the system's ink and Apple-blue accent for text and actions
- **The signature: a pencil dimension line.** A thin line with end ticks and a label in a pill, drawn with `stroke-dashoffset` over `pathLength=1`. Use it sparingly: the heading ("עד המילימטר"), the hero wardrobe's real size, and the About figures. Never use it as decoration on everything.
- **Hero:** a 3D wardrobe assembles from a pencil sketch.
  - Each part rides a critically damped spring and is staggered in assembly order. Its outline fades as the wood fills in.
  - The middle door then opens partway, and the 240 and 250 cm dimensions draw themselves.
  - Light and shadow: RoomEnvironment light and a radial contact shadow, not a cast shadow on a floor.
  - Placement: on a wide screen the wardrobe sits left of the copy (`setViewOffset`). On a narrow one it gets its own row, centred.
  - The entry cards are glass over the scene.
- **Bob** is our own flat drawing of a fictional master carpenter in his fifties: greying hair, a short beard, thin glasses, a pencil behind the ear.
  - States: idle, thinking, speaking and happy.
  - The greeting is text at speaking pace, with the mouth moving; it has no audio.
  - Every instance gets its own SVG ids. The drawing is decorative (`aria-hidden`).
- **About:**
  - the fictional story: in the workshop since 1995, 31 years, 1,284 wardrobes, 20 advisory rules, 1 mm tolerance
  - a quote
  - figures that count up over a dimension line
  - a line saying that Bob and the figures are fictional and that an AI answers in the chat

  It sits under the start screen ("הכירו את בוב") and opens as a dialog from the top bar ("אודות בוב").
- **Performance:**
  - One extra WebGL context lives only while the start screen is open. Choosing a card disposes it and forces a context loss.
  - On a software renderer (SwiftShader, llvmpipe) the wardrobe is drawn once, not animated.
  - Bob's animation loop runs only while he speaks.
- **Comfort:**
  - Reduced motion shows everything finished and still: the greeting at once, no count-ups.
  - Reduced transparency makes the glass solid; more contrast darkens the graphite.
  - The heading takes the first focus.
  - Esc does not dismiss the start screen, because a choice is required.
  - On a phone the page is held to the screen width while the start screen is up, because the workspace behind it is wider.

## Deliberately not implemented
- Cutlist and cost estimation, project breadcrumb and Save, clearance verification, JSON export: outside the agreed MVP scope. The AI column shows an empty state and tips until the agent is built (Phase 5).

## History
- **Nordic Atelier (2026-10-14):** the first system, generated in Google Stitch (project "BanAI Wardrobe Designer", `projects/3881887321601714246`): warm paper `#F4F2EE`, ink `#1F2328`, Burnt Oak accent `#B4532A`, Inter, hairline structure instead of shadows, 6-8px radii.
- **UX pass (2026-10-16, extended Nordic Atelier):** floating viewer toolbar (3/4, Front, Side, Fit, Show interior switch), collapsible AI column rail that remembers its state, "Controls" help popover, collapsible property sections that remember their state, selection context line with a highlighted compartment row, hover/selection outlines in 3D, soft floor shadow and panel edge lines, `--color-border-control` for 3:1 control edges, `:focus-visible` rings. Behaviour is unchanged by the Apple restyle; only the visuals were replaced.
