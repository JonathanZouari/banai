import { describe, expect, it } from 'vitest';
import { PRESETS, buildPreset } from '../../../src/domain/presets.js';
import { BACKDROPS, buildBackdrop, disposeBackdrop } from '../../../src/viewer/backdrop.js';
import { loadCatalog } from '../domain/helpers.js';

const catalog = loadCatalog();

describe('room backdrop', () => {
  it.each(PRESETS.map((p) => [p.id, p.backdrop]))('template %s has a known room (%s) that builds', (id, kind) => {
    expect(BACKDROPS).toContain(kind);
    const room = buildBackdrop(kind, buildPreset(id, catalog));
    const meshes = [];
    room.traverse((object) => { if (object.isMesh) meshes.push(object); });
    expect(meshes.length).toBeGreaterThan(3);
    // Nothing in the room is selectable: no mesh carries a component id.
    expect(meshes.every((mesh) => mesh.userData.componentId === undefined)).toBe(true);
    disposeBackdrop(room);
  });

  it('builds nothing for a missing or unknown kind', () => {
    const design = buildPreset('basic', catalog);
    expect(buildBackdrop(null, design)).toBeNull();
    expect(buildBackdrop('nope', design)).toBeNull();
    expect(buildBackdrop('toString', design)).toBeNull();
  });
});
