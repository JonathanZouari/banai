// Design-sheet data (pure, no DOM): everything the PDF shows, derived from the canonical design.
// It describes the DESIGN (sizes, components, finishes) for a carpenter to verify. It is not a
// cut list or a manufacturing instruction, and it never claims the design is buildable as is.
import { cm } from '../viewer/format.js';

const byY = (a, b) => a.y - b.y;

function refName(ref, entries) {
  if (ref.custom) return { custom: true, name: ref.name };
  return { custom: false, name: entries.find((e) => e.id === ref.catalogId)?.name ?? ref.catalogId };
}

function appearanceRows(appearance, catalog) {
  return {
    material: refName(appearance.material, catalog.materials),
    colour: refName(appearance.color, catalog.colors),
    finish: refName(appearance.finish, catalog.finishes),
  };
}

/** Plain data for the sheet: all lengths as centimetre strings with one decimal. */
export function sheetModel({ design, catalog, revision }) {
  const { width, height, depth } = design.dimensions;
  return {
    revision,
    overall: { width: cm(width), height: cm(height), depth: cm(depth), panel: cm(design.carcass.panelThickness) },
    compartments: design.compartments.map((compartment, index) => ({
      n: index + 1,
      width: cm(compartment.width),
      shelves: [...compartment.shelves].sort(byY).map((s) => cm(s.y)),
      drawers: [...compartment.drawers].sort(byY).map((d) => ({ y: cm(d.y), height: cm(d.height) })),
      rails: [...compartment.rails].sort(byY).map((r) => cm(r.y)),
    })),
    partitions: { count: design.partitions.length, thickness: design.partitions.length ? cm(design.partitions[0].thickness) : null },
    doors: {
      type: design.doors.type,
      count: design.doors.items.length,
      hingeSides: design.doors.items.map((door) => door.hingeSide ?? null),
    },
    finishes: {
      carcass: appearanceRows(design.carcass.appearance, catalog),
      doors: design.doors.type === 'none' ? null : appearanceRows(design.doors.appearance, catalog),
    },
  };
}

/** Safe file name for the download, e.g. banai-design-2026-10-20.pdf */
export const sheetFileName = (date = new Date()) => `banai-design-${date.toISOString().slice(0, 10)}.pdf`;
