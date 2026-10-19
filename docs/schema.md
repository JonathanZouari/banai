# Canonical Wardrobe Schema & Operation Protocol (v1)

This is the single source of truth for a wardrobe design. The 3D viewer renders from it, the properties editor edits it through ops, the AI agent proposes ops against it, and Supabase stores it as JSONB.

| Engine | Location | Role |
|---|---|---|
| Python (authoritative) | `backend/app/domain/` | Validates AI proposals, applies approved ops, gates saves |
| JavaScript | `frontend/src/domain/` | Instant manual edits in the browser |

Both engines must behave identically. `shared/fixtures/ops/*.json` is run by both `pytest` (`tests/domain/test_parity_fixtures.py`) and `vitest` (`tests/unit/domain/parity.test.js`). **When you change a rule, change both engines and add a fixture.**

## Units and coordinates
- All lengths are **integer millimetres**. Floats are schema errors.
- **Interior width** = `width − 2·panelThickness`. **Interior height** = `height − 2·panelThickness`.
- **x** runs from the inner face of the left side panel. Compartment x-ranges are *derived* (`geometry.compartment_x_ranges`) and never stored.
- **y** runs from the top face of the bottom panel:
  - a shelf occupies `[y, y+thickness]`
  - a drawer occupies `[y, y+height]`
  - a rail is a point at `y`
- `revision` and `designId` are persistence metadata. They live **outside** the design object.

## Shape
```jsonc
{
  "schemaVersion": 1, "units": "mm",
  "dimensions": { "width": 2000, "height": 2400, "depth": 600 },
  "carcass": { "panelThickness": 18, "appearance": Appearance },
  "compartments": [            // ordered left → right, at least 1
    { "id": "cmp_…", "width": 643,
      "shelves": [{ "id": "shf_…", "y": 400, "thickness": 18, "appearance": Appearance|null }],
      "drawers": [{ "id": "drw_…", "y": 0, "height": 200, "appearance": Appearance|null, "handle": Handle|null }],
      "rails":   [{ "id": "rail_…", "y": 1900 }] }
  ],
  "partitions": [{ "id": "prt_…", "thickness": 18 }],   // partitions[i] sits between compartments i and i+1
  "doors": { "type": "hinged|sliding|none", "appearance": Appearance,
             "items": [{ "id": "dr_…", "compartmentIds": ["cmp_…"], "hingeSide": "left|right|null", "appearance": Appearance|null,
                         "handle": Handle|null, "mirror": false }] },
  "handles": { "style": "bar", "finish": "steel" }       // Handle; the design-wide default
}
```
**Appearance** is `{ material: Ref, color: Ref, finish: Ref }`, where each Ref is one of:
- `{ "catalogId": "white" }`: a predefined value from `backend/app/domain/catalog.json`
- `{ "custom": true, "name": "Sage green", "hex": "#9caf88" | null }`: a customer-defined value, always distinguishable from catalog values

An item override of `null` means the item inherits:
- shelves and drawers inherit from `carcass.appearance`
- doors inherit from `doors.appearance`
- rails and partitions have no appearance of their own

**Handle** is `{ style, finish }`, and both keys are always present:
- `style` is one of `bar`, `knob`, `edge`, `cup`, `groove`, `none`
- `finish` is one of `steel`, `black`, `brass`

The root `handles` is required in canonical output, with the default `{ "style": "bar", "finish": "steel" }`. A design that omits it is accepted and gets the default, like every other defaulted field. `door.handle` and `drawer.handle` are a Handle override or `null`, and `null` (the default) means the item inherits the root `handles`. Overrides are always complete: a partial update starts from the inherited root value. Changing the root `handles` never touches existing overrides.

`door.mirror` is a boolean (default `false`) and is a strict boolean, so `"yes"` and `1` are `SCHEMA_INVALID`. It is a pure presentation flag with no validation rule, so it is allowed on hinged and sliding doors alike.

**IDs** are stable and typed (`cmp_`, `prt_`, `shf_`, `drw_`, `rail_`, `dr_` + 1–40 `[A-Za-z0-9_-]`), and unique within a design. Generated ids are `<prefix>_<8 hex>`.

## Validation rules
Issues are reported in this fixed order. The order is part of the parity contract.

| # | Rule | Code / path |
|---|---|---|
| 1 | Structural shape (types, unknown fields, id prefixes, at least 1 compartment) | `SCHEMA_INVALID` |
| 2 | Ids are unique | `DUPLICATE_ID` at the second occurrence |
| 3 | `len(partitions) == len(compartments) − 1` | `WIDTH_MISMATCH` at `partitions` |
| 4 | Values fall within the rendering-safety ranges in `defaults.LIMITS`, including compartment count (path `compartments`) and sliding-door count (path `doors.items`) | `OUT_OF_RANGE` |
| 5 | Σ compartment widths + Σ partition thicknesses = interior width | `WIDTH_MISMATCH` at `compartments` |
| 6 | Items lie within `[0, interiorHeight]` | `OUT_OF_BOUNDS` |
| 6 | Shelf and drawer spans don't overlap (touching is allowed); a rail is not strictly inside a span | `OVERLAP` |
| 7 | Doors (see below) | `DOOR_INVALID` |
| 8 | Every `catalogId` exists in the catalog. Skipped when no catalog is given. | `UNKNOWN_CATALOG_ID` |

Door rules:
- **hinged:** at least one door. Each door has a hinge side and covers ≥1 existing compartment. Those compartments are adjacent and ordered left → right, and no compartment is covered twice. Uncovered compartments are allowed.
- **sliding:** 1–6 panels (`LIMITS.slidingDoorCount`), with no `compartmentIds` and no hinge side.
- **none:** no items.

These are data and rendering-safety checks. **They are not manufacturing or feasibility rules.** The app never claims a design is manufacturable.

## Operations
`apply_ops(design | None, ops, catalog) → new design` (Python) and `applyOps(…)` (JS).

- **Pure.** The input is never mutated. Each op works on a private deep copy.
- **Fully re-validated** after every op. The caller never receives an invalid design.
- **Atomic.** The whole batch is schema-checked first (`ops` must be an array of ≤ 100 ops). Then the first failing op raises `DomainError {code, path, message}`, and nothing is returned.
- **Explicit ids.** Add ops accept an optional `id`. When omitted, a random id is generated. AI proposals will fill ids in before signing (Phase 5), so replaying an approved proposal is deterministic.
- **Integer arithmetic** on both sides, using floor division.

| Op | Fields | Semantics |
|---|---|---|
| `create_wardrobe` | width, height, depth, compartmentCount, panelThickness?, partitionThickness?, compartmentIds?, partitionIds? | Range-checks the dimensions first (`ops[i].width`, …). Replaces the design. Compartments get equal widths, and the integer remainder goes to the leftmost ones. Doors start as `none`, with the default appearance. |
| `update_dimensions` | width?, height?, depth? | Each given value is range-checked at op level first. A width change rescales compartments proportionally (floor, remainder to the last). If a height change would leave an item out of bounds, the op is **rejected**. Nothing is deleted silently. |
| `configure_doors` | type, doors? (hinged), count? (sliding, default 2), ids? | Hinged without a list creates one door per compartment, with hinges alternating left/right. A hinged `doors: []` → `INVALID_OP` (use `none`). Sliding without `count` uses `len(ids)`, or 2. Fields that don't apply to the type → `INVALID_OP`. |
| `add_compartment` | position (0..n), width, id?, partitionId?, partitionThickness? | Takes `width + partition` from the compartment currently at `position` (the last one when appending). A hinged door spanning the insertion point extends to cover the new compartment. |
| `modify_compartment` | compartmentId, width | The right neighbour absorbs the difference (the left one for the last compartment). Not allowed with a single compartment. |
| `add_partition` | compartmentId, offset, id?, newCompartmentId?, thickness? | Splits the compartment at `offset`. Items stay on the left, and the new right part is empty. Hinged doors covering it extend to the new part. |
| `modify_partition` | partitionId, position?, thickness? | Thickness is taken from the right neighbour, then the partition moves to the interior x `position`. Only the two neighbours change. |
| `add_shelf` / `modify_shelf` | compartmentId, y, thickness? (default 18), id? / id, y?, thickness? | |
| `add_drawer` / `modify_drawer` | compartmentId, y, height, id? / id, y?, height? | |
| `add_rail` / `modify_rail` | compartmentId, y, id? / id, y | |
| `set_material` | target (`carcass`, `doors`, or a door/shelf/drawer id), material?, color?, finish?, clear? | Partial appearance update. An item override starts from the inherited appearance. `clear` removes an override. Covers both "change material" and "change color". |
| `modify_door` | id, hingeSide? (`left`/`right`), mirror? | Changes only the given fields and keeps every other door field (covered compartments, appearance and handle overrides). It needs at least one of the two fields, otherwise `INVALID_OP` at `ops[i]`. An unknown door → `NOT_FOUND` at `ops[i].id`. A `hingeSide` that does not fit the door type is rejected by the normal door validation (`DOOR_INVALID` at `doors.items[j].hingeSide`, because sliding doors have no hinge side). `mirror` is allowed on hinged and sliding doors. `configure_doors` is unchanged: the doors it builds start with `handle: null` and `mirror: false`. |
| `set_handles` | target (`all`, or a door/drawer id), style?, finish?, clear? | Partial handle update, modelled on `set_material`. `all` edits the root `handles`. A door or drawer override starts from the inherited root value, so setting only `style` keeps the current `finish`. `clear: true` resets an item override to `null`. Errors: nothing given and not clearing → `INVALID_OP` at `ops[i]`; `clear` with new values → `INVALID_OP` at `ops[i]`; `clear` with `all` → `INVALID_OP` at `ops[i].clear`; an unknown door or drawer → `NOT_FOUND` at `ops[i].target`; any other typed id (shelf, rail, compartment, partition) → `INVALID_OP` at `ops[i].target`; `carcass` and `doors` are not targets (`SCHEMA_INVALID`). |
| `remove_component` | id | See the removal rules below. |

`remove_component` removal rules:
- **Shelf, drawer, rail:** removed.
- **Compartment:** a neighbour absorbs its width plus one partition (the right neighbour, or the left one for the last compartment). Its door references are dropped, along with any hinged door left empty.
- **Partition:** the right compartment merges into the left one and the item lists are unioned. If the items overlap, the op is rejected with `OVERLAP`. Doors covering the merged compartment merge into the first such door.
- **Door:** removed. When no doors remain, the type becomes `none`.
- **The last compartment:** cannot be removed (`INVALID_OP`).

Op-level error paths use `ops[i]` or `ops[i].<field>`. Issues found while validating the resulting design use design paths, for example `compartments[0].shelves[1].y`.

## Input hardening (inputs may come from an LLM)
- Every int is bounded to ±1,000,000, outside that range → `SCHEMA_INVALID`. Whole-number floats such as `1000.0` are accepted as ints, because JS cannot tell them apart.
- Keys are camelCase only. Unknown keys → `SCHEMA_INVALID`, reported at the key itself.
- `custom` must be the boolean `true`, and `schemaVersion` the integer `1`, so `1 == true` confusion is rejected.
- A Ref is tagged by the presence of `custom` on both sides, so errors come from the same branch.
- Every id in an op is pattern-checked for its type. An empty or mismatched id is a schema error and is never silently replaced. `target` is `carcass`, `doors` or a typed id (`set_handles`: `all` or a typed id).
- Optional op fields accept explicit `null`, meaning absent.
- `catalogId` must match `^[a-z0-9_]{1,40}$`.
- Custom `name` must be visible text: no control characters, zero-width characters, line or paragraph separators, bidi overrides, BOM, Unicode tag characters, or lone surrogates, and it can't be whitespace-only. Hebrew and other scripts are accepted.
- Structural caps bound the worst-case CPU of one request (about 0.25 s in Python):
  - ≤ 20 compartments
  - ≤ 20 doors
  - ≤ 100 items of one kind per compartment
  - ≤ 300 interior items per design
  - ≤ 100 ops per batch
- Error messages are engine-owned constants and never echo input. An unknown key appears in an error path only if it is a plain identifier (`^[A-Za-z][A-Za-z0-9_]{0,39}$`); otherwise the error is reported at the parent path.

## Defaults (configurable prototype values, not business rules)
These live in `defaults.py` / `defaults.js` and are mirrored on both sides:
- the `LIMITS` ranges
- panel and shelf thickness of 18 mm
- 2 sliding doors by default
- the default appearance (melamine, white, matte)
- the default handles (`bar`, `steel`)
- the basic wardrobe (`shared/fixtures/designs/basic.json`): 2000×2400×600 with 3 compartments and hinged doors

The catalog contents (`catalog.json`) are placeholder prototype data. A color entry may carry an optional `grain` (`oak`, `ash`, `cherry`, `teak`, `wenge` or `walnut`) that names the wood-texture family a renderer can use for it. Plain colors have no `grain`. The JS `parseCatalog` keeps `grain` when it is one of those values and rejects anything else. The engines do not use it for validation. Catalog ids are append-only: existing ids keep their position, and new colors are added after them.

## Schema v2 (bobHabanai)

v2 is additive. A v1 design parses unchanged and comes out with `schemaVersion: 2`, and its new fields take their defaults. Golden cases: `shared/fixtures/ops/v2.json`.

| Field | Default | Meaning |
|---|---|---|
| `site: { ceiling, niche, heights, widths, clearance, obstacles } \|| `obstacles: [{ type, name, x, y, width, height }] | null` | `null` | Customer's estimated site measurements in mm (each may be `null`). The carpenter verifies them on site. See "Site" below. |
| `carcass.plinthHeight` | `0` | Plinth under the bottom panel. **Interior height** = `height − 2·panelThickness − plinthHeight`. |
| `compartments[].inserts[]` | `[]` | Interior inserts, at most one of each type (`pulldown`, `shoes`, `trousers`, `led`, `tv`). `tv` is a sample flat screen on the compartment's back: `y` is its bottom edge and `height` the screen's height in mm (16:9, from the diagonal: inches × 25.4 × 9 / √337). It defaults to the largest size up to 43" that leaves 100 mm of air each side, at least 24", centred at 1100 mm above the floor. |
| `carcass.base` | `"plinth"` | `"plinth"`, or `"legs"`: the body stands on adjustable legs `plinthHeight` tall (the sides start above them, no plinth board). |
| `fittings: { softClose }` | `{ softClose: true }` | Soft-close hinges and drawer runners. Off gives plain ones in the dossier. |

**Insert** = `{ id: "ins_…", type, y, tiers, height }`. Which fields apply depends on the type, and the rest must be `null`:

| `type` | Fields | Occupies |
|---|---|---|
| `shoes` | `y`, `tiers` (1–6) | the zone `[y, y + tiers·240]`, sloped shoe shelves (tier 220–260 mm, research [35]) |
| `trousers` | `y`, `height` (200–1500) | the zone `[y, y + height]`, a pull-out rack |
| `pulldown` | `y` | a point (like a rail): a pull-down hanging rail |
| `led` | none | no zone: LED strip with a door sensor |

**New validation:**
- Insert fields must match the type, and a type may appear only once per compartment (`INSERT_INVALID`).
- Zones lie within the interior (`OUT_OF_BOUNDS`) and don't overlap shelves, drawers or each other. A rail or pull-down may not sit strictly inside a zone (`OVERLAP`).
- Ranges: `plinthHeight` 0–300, `site.ceiling` and each `site.heights[i]` 1500–5000, `site.niche` and each `site.widths[i]` 300–10000, `site.clearance` 100–10000, obstacle `x` −5000–10000, `y` 0–5000, `width`/`height` 10–5000, at most 8 obstacles.
- `site.niche` must equal the smallest known `site.widths` reading, and `site.ceiling` the smallest known `site.heights` reading (`SCHEMA_INVALID` at `site.niche` / `site.ceiling`). A readings list with no known value must be `null`.
- **Split doors:** a compartment may carry two hinged leaves when both doors cover only that compartment. A third leaf, or a split leaf that spans more, is still `DOOR_INVALID`.

**New ops:**

| Op | Fields | Semantics |
|---|---|---|
| `create_wardrobe`, `update_dimensions` | + `plinthHeight?` | Range-checked. A plinth that pushes items out of the interior is rejected. |
| `set_site` | `ceiling?`, `niche?`, `heights?`, `widths?`, `clearance?`, `obstacles?`, `unset?`, `clear?` | Partial update, merged into the existing site. Readings set `ceiling`/`niche` to the smallest one, so readings and the single value are not given together. A single value drops the readings. `unset` clears fields (`niche`/`ceiling` take their readings with them). An empty site becomes `null`; `clear` removes it. |
| `apply_preset` | `compartmentId`, `preset` (`long`/`double`/`shelves`/`drawers`) | Replaces the compartment's shelves, rails and drawers with the preset. Ids are deterministic (`shf_<tag>_1`…, where `<tag>` is the compartment id without `cmp_`). Shelves take the panel thickness. Zone inserts are dropped and the LED stays. Rounding is half-up in integers in both engines (`_half_up` / `halfUp`), never Python's banker's `round()`. |
| `add_insert` | `compartmentId`, `type`, `y?`, `tiers?`, `height?`, `id?` | Defaults: shoes `y 0, tiers 3`; trousers `y 0, height 700`; pull-down `y = interior − 400`. A field the type doesn't take → `INVALID_OP` at that field. |
| `modify_insert` | `id`, `y?`, `tiers?`, `height?` | Same field rules. |
| `split_door` | `id`, `newId?` | Hinged only, and only a door over one compartment that isn't split yet. Result: left leaf hinged left, new right leaf hinged right (it copies the appearance and handle, `mirror: false`). |
| `remove_component` | `ins_…` ids | Removes an insert. Merging at a partition keeps both compartments' inserts. |

Op-level schema errors keep reporting at `ops[i]`, as in v1.

`set_fittings {softClose?, base?, childLock?, releaseHeight?}` sets any of them (one is required). Turning `childLock` on with no `releaseHeight` sets it from the household: the tallest child's estimated standing reach (× 1.3, rounded up to 50 mm), at least 1500. Validation requires a release height whenever `childLock` is on.

| `household: { people }` | `{ people: [] }` | Up to 6 people `{ name?, height }`. `name` is optional safe text of at most 30 characters, and `height` is 450–2300 mm. They appear as scale figures. Anyone under 1400 mm is a child for advisory R26. Set through `set_household { people }`, which replaces the list. |

Advisory R26 (a child in the household):
- anchor the wardrobe [100][103][119]
- child locks with a release button above the children's estimated standing reach [120], with a fix
- a release that is too low, with a fix
- a release above the wardrobe (fit it on the wall) Advisory R24 covers leg height (90–170 mm, Häfele AXILO [117]) and soft close switched off.

## Site (bobHabanai, 2026-10-18)

The room around the wardrobe, as the customer measured it. A carpenter takes the width at three heights and the ceiling at three points, and the smallest reading governs [research 96][11].

| Field | Meaning |
|---|---|
| `heights: [left, middle, right] \|| `obstacles: [{ type, name, x, y, width, height }] | null` | Ceiling height at three points along the wall, each `null` when not measured. |
| `widths: [top, middle, bottom] \|| `obstacles: [{ type, name, x, y, width, height }] | null` | Niche width at three heights, each `null` when not measured. |
| `ceiling`, `niche` | The governing values: the smallest known reading, or a single measurement when no readings were given (older designs). |
| `clearance` | Free floor in front of the wardrobe, from its front to the wall or furniture opposite. |
| `obstacles: [{ type, name, x, y, width, height }] | null` |\| null` | What is on the wall behind (2026-10-19, ADR-031): `socket`, `switch`, `ac`, `pipe`, `window`, `panel` (skirting) or `other` (anything else, ADR-036). `name` is the customer's word for it: required for `other`, optional otherwise, safe text of at most 30 code points, `null` when absent. `x` from the wardrobe's left outer face (negative = left of it), `y` from the floor, mm. `set_site` replaces the whole list; an empty list clears it, and a stored empty list is invalid (it is `null`). |

Adding the readings changed no existing field, so older designs stay valid without a migration. An obstacle the carcass covers switches on advisory R23: an opening in the back for a socket or switch, no anchoring over pipes, and lowering the wardrobe under a window or an AC unit (a quick fix when it stays at least 120 cm tall) [research section 5.1][11]. The readings switch on advisories R21 (room to open hinged doors and drawers, and to pass; retail guides [99]) and R22 (an out-of-square niche or ceiling, and a sliding track that needs a levelling frame [11][13][93][96]). The viewer draws them in pencil (`frontend/src/viewer/room.js`), and the dossier's site page lists them.

## Zones (bobHabanai, 2026-10-17)

A compartment (column) can be divided vertically into 2–4 **zones**. Each zone can have its own door, a pair of doors, or no door, and its own contents. The addition is backwards-compatible: a design without dividers or anchors behaves exactly as before. Golden cases: `shared/fixtures/ops/zones.json`.

| Field | Default | Meaning |
|---|---|---|
| `compartments[].shelves[].fixed` | `false` | A **divider**: a structural shelf that bounds zones. The dossier fixes it with confirmat screws, not shelf pins. |
| `doors.items[].bottomShelfId` | `null` | A hinged door over one compartment can be **anchored** to a divider. It covers from the centre line of `bottomShelfId` (`null`: the carcass bottom)… |
| `doors.items[].topShelfId` | `null` | …to the centre line of `topShelfId` (`null`: the carcass top). Both `null` means a full-height door, as before. |

**Derived geometry:**
- **Zones:** the fixed shelves of a compartment, sorted by `y`, split it into zones numbered 1…n from the bottom.
- **Usable range of zone k** (interior y):
  - from: `0` for zone 1, otherwise the top face of the divider below (`y + thickness`)
  - to: the interior height for the top zone, otherwise the bottom face of the divider above (`y`)
- **Door extent:** an anchor's centre line is `y + thickness / 2`; comparisons use `2·y + thickness` to stay in integers.

**Validation** (structural only, `DOOR_INVALID`):
- **Sliding doors** have no anchors. The path is `doors.items[i].bottomShelfId` or `.topShelfId`, with the message "sliding doors have no …".
- **An anchored hinged door:**
  - covers exactly one compartment (`.compartmentIds`, "an anchored door covers one compartment")
  - each anchor is a fixed shelf of that compartment (`.bottomShelfId` / `.topShelfId`, "must be a divider (fixed shelf) of its compartment")
  - the top anchor lies above the bottom one (`.topShelfId`, "must be above the bottom anchor")
- **Coverage:** within a compartment, the vertical extents of the doors covering it must not overlap. The only exception is a **split pair**: exactly two single-compartment doors with the same anchors. The first in item order is the left leaf. A clash is reported at the later door's `.compartmentIds` with "a compartment is already covered by another door".
- A compartment or a zone **may** have no door (an open niche).

**New and changed ops:**

| Op | Fields | Semantics |
|---|---|---|
| `set_zones` | `compartmentId`, `count` (1–4) | **Dividers:** every divider of the compartment becomes a regular shelf. For `count ≥ 2`, the divider k (k = 1…count−1) has its centre line at `round_half_up(k · interior / count)`. The nearest regular shelf whose centre lies within 60 mm becomes that divider (ties go to the lower `y`, then the earlier shelf). Otherwise a new shelf is added, with id `shf_<tag>_z<k>` (`_z<k>_2`, `_3`… if taken), thickness = `panelThickness`, and `y` = centre − ⌊panel / 2⌋. **Doors (hinged):** if a door covers this compartment and others, the op fails (`INVALID_OP` at `.compartmentId`, "a door spans this compartment and its neighbours"). If the compartment has its own doors, they are replaced by one door per zone, bottom-up, with id `dr_<tag>_z<k>`, anchored to the dividers below and above it. Each copies the first old door's hinge side, appearance and handle (`mirror: false`). For `count = 1` there is one full-height door, which keeps the first old door's id. An open compartment stays open. |
| `set_zone_door` | `compartmentId`, `zone` (1-based), `leaves` (0, 1 or 2), `hingeSide?` | Hinged only. Removes this compartment's doors with the zone's anchors, then adds `leaves` doors with those anchors: `dr_<tag>_z<zone>`, and for a pair also `dr_<tag>_z<zone>r` (left + right). One leaf takes `hingeSide`, else the removed door's, else `left`. A pair refuses `hingeSide` (`INVALID_OP`). New doors go where the removed ones were, else right after the compartment's last door, else at the end, and they copy the removed door's appearance and handle. Zone out of range: `INVALID_OP` at `.zone`. A spanning door: same error as `set_zones`. |
| `apply_preset` | + `zone?` | With `zone`, only that zone's usable range is rebuilt. Its regular shelves, rails, drawers and zone inserts (shoes, trousers, pull-down) whose `y` lies in the range are replaced by the preset for the zone's height, clipped to fit, with ids `shf_<tag>_z<zone>_<n>` / `rail_…` / `drw_…`. Dividers and LED stay. Without `zone`, a compartment that has dividers is refused (`INVALID_OP` at `.zone`, "this compartment has zones: give a zone"). |
| `split_door` | | The "already split" check counts doors with the same compartment **and** the same anchors, so a zone door can be split. |
| `remove_component` | a divider | Refused while a door is anchored to it (`INVALID_OP` at `.id`, "a door is anchored to this shelf: change the zones first"). |
| `add_partition` | | Anchored doors stay on the original (left) compartment; the new compartment opens without them. |
