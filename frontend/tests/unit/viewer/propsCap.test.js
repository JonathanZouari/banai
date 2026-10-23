import { describe, expect, it } from 'vitest';
import { MAX_PROP_MESHES, buildProps, disposeProps } from '../../../src/viewer/props.js';
import { loadDesign } from '../domain/helpers.js';

describe('decorative clothes', () => {
  it('never build more than MAX_PROP_MESHES meshes, however many rails a design has', () => {
    const design = structuredClone(loadDesign('basic'));
    design.compartments.forEach((compartment, c) => {
      compartment.shelves = [];
      compartment.drawers = [];
      compartment.rails = Array.from({ length: 60 }, (_, i) => ({ id: `rail_cap${c}x${i}`, y: 1900 }));
    });
    const props = buildProps(design);
    expect(props.children.length).toBeGreaterThan(0);
    expect(props.children.length).toBeLessThanOrEqual(MAX_PROP_MESHES);
    disposeProps(props);
  });
});
