# Finish design & carpenter instructions PDF

**Scope change (user decision, 2026-10-20).** Spec §22 excludes orders, manufacturing exports and a carpenter dashboard. The user approved a narrow exception: when the customer's design is final, they can **finish** it and download **carpenter instructions as a PDF**.

Still excluded:
- orders, prices, payments and accounts
- CNC or machine files
- feasibility checks

The PDF never claims the design is manufacturable or structurally sound.

## Flow
1. **Finish design** (top bar) opens a dialog. It shows the final design and warns that finishing locks it.
2. **Finish design** in the dialog calls `store.finalize()`, which records the final revision.
   - From then on, `dispatch` returns `LOCKED` and `replaceDesign` throws `LOCKED`.
   - The properties and chat panels become `inert` and show a note.
   - Viewing still works (orbit, zoom, selection, show interior).
   - The lock lives in memory: there is no persistence before Phase 7, so a page reload starts a new design.
3. **Download carpenter PDF**: the browser takes two PNG snapshots of the 3D view, one with the doors shown and one of the interior, scaled to ≤ 1200 px. It posts them with the design to `POST /api/carpentry/pdf` and saves the returned file.

## API
`POST /api/carpentry/pdf`

Request body: `{design, revision, language: "he"|"en", images: {closed?, open?}}`, where each image is a `data:image/png;base64,…` URL.

The response is `application/pdf` with the header `Content-Disposition: attachment; filename="banai-carpenter-r<revision>.pdf"`. Nothing is stored.

| Check | Failure |
|---|---|
| Design is valid (domain engine) | 422 with the domain error |
| Image is a PNG data URL, decodes as base64, ≤ 1.5 MB, starts with the PNG signature, Pillow reads it as PNG, ≤ 2048 px per side | 422 `BAD_IMAGE` |
| Unknown fields | 422 |

## What the PDF contains
`app/domain/carpentry.py` builds the plan and `app/services/carpentry_pdf.py` renders it (fpdf2, A4). Hebrew is laid out right to left using HarfBuzz text shaping, with bundled Noto fonts under the SIL OFL licence (`app/assets/fonts`).

1. **Cover:** a verification notice, the design summary, and the 3D view with the doors closed.
2. **Front elevation:** drawn to scale as vector graphics. It shows overall and compartment dimensions, and the heights of shelves, drawers and rails. The interior 3D view follows.
3. **Cut list:** every part with quantity, length × width × thickness in mm, material, and notes on position and hinges.
4. **Hardware**, **edge banding** (metres) and the **assembly order**.
5. **Assumptions:** every default value used.

## Construction assumptions
`app/domain/carpentry_defaults.py`. These are configurable prototype defaults, **not verified rules**.

| Assumption | Default |
|---|---|
| Sides | Full height × depth |
| Top and bottom | Fit between the sides (interior width × depth) |
| Back panel | 3 mm HDF, nailed over the full back (W × H) |
| Partitions | Interior height × depth |
| Shelves | Compartment width × (depth − 3 back − 20 setback) |
| Drawer fronts | Compartment width − 2 × 3 gap, by drawer height − 3 |
| Drawer box | 15 mm boards, 13 mm runner clearance per side, height = drawer height − 40, 3 mm HDF bottom |
| Runners | Longest standard length (250–550 in steps of 50) ≤ depth − 50 |
| Hinged doors | Full overlay. Span from the outer edge or the middle of a partition, minus 2 mm per edge. Height H − 4 |
| Hinges | ≤ 900 mm → 2, ≤ 1600 → 3, ≤ 2000 → 4, otherwise 5. First and last hinge 100 mm from the edge |
| Sliding doors | n panels of (W + (n − 1) × 30) / n, height H − 50. Track = W |
| Hanging rod | Compartment width − 2, with 2 supports |
| Shelf pins | 4 per shelf |
| Confirmat screws | 3 per joint. Joints = 4 + 2 per partition |
| Edge banding | Visible front edges + 10 % waste |

## Tests
- `backend/tests/test_carpentry.py`: plan arithmetic (width reconciliation, doors, sliding panels, hinges, runners, materials, no mutation) and the endpoint (download, both languages, invalid images and designs).
- `frontend/tests/unit/finish/finish.test.js`: the store lock, the summary and the client.
- `frontend/tests/e2e/finish.spec.js`: finish → locked UI → real PDF download.
