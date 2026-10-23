// The household as scale figures, the household ops, and the child lock's release button in 3D.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { releaseHeightFor } from '../../../src/domain/defaults.js';
import { householdOps } from '../../../src/editor/householdSection.js';
import { buildWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { FIGURE_SPACING, createFigure, figurePeople } from '../../../src/viewer/figure.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const family = applyOps(basic, [{ op: 'set_household', people: [{ name: 'אבא', height: 1820 }, { height: 1050 }] }], catalog);

describe('the household', () => {
  it('stands as figures at their own heights, in a row beside the wardrobe', () => {
    expect(figurePeople(basic)).toEqual([{ height: 1700, label: null, child: false }]);
    expect(figurePeople(family)).toEqual([
      { height: 1820, label: 'אבא · 182.0 ס״מ', child: false },
      { height: 1050, label: '105.0 ס״מ', child: true },
    ]);
    const scene = new THREE.Scene();
    const figure = createFigure(scene);
    figure.update(family);
    expect(figure.count).toBe(2);
    const [dad, child] = figure.group.children.filter((c) => c.name === 'person');
    const top = (g) => Math.round(new THREE.Box3().setFromObject(g).max.y * 1000);
    expect(top(dad)).toBe(1820);
    expect(top(child)).toBe(1050);
    expect(Math.round((child.position.x - dad.position.x) * 1000)).toBe(FIGURE_SPACING);
    figure.update(basic);
    expect(figure.count).toBe(1); // back to the default person
    figure.dispose();
  });

  it('edits one person, removes one, and keeps the others', () => {
    const { people } = family.household;
    expect(householdOps(people, 1, { height: 1120 })).toEqual([{ op: 'set_household', people: [{ name: 'אבא', height: 1820, at: null }, { name: null, height: 1120, at: null }] }]);
    expect(householdOps(people, 0, null)).toEqual([{ op: 'set_household', people: [{ name: null, height: 1050, at: null }] }]);
    // Where a person was dragged to (ADR-041) stays through an edit of anyone.
    const placed = [{ name: 'אבא', height: 1820, at: [2600, 900] }, { name: null, height: 1050, at: null }];
    expect(householdOps(placed, 1, { height: 1100 })[0].people[0].at).toEqual([2600, 900]);
  });

  it('puts the release above the tallest child\'s reach, at 150 cm at least (as the server)', () => {
    expect(releaseHeightFor([])).toBe(1500);
    expect(releaseHeightFor([{ height: 1050 }, { height: 1820 }])).toBe(1500);
    expect(releaseHeightFor([{ height: 1250 }])).toBe(1650);
    expect(releaseHeightFor([{ height: 1399 }])).toBe(1850);
  });

  it('draws the release button on the side at its height when child locks are on', () => {
    const locked = applyOps(family, [{ op: 'set_fittings', childLock: true, releaseHeight: 1600 }], catalog);
    const button = buildWardrobe(locked, createMaterials(catalog)).children.find((m) => m.userData.part === 'release');
    expect(Math.round(button.position.y * 1000)).toBe(1600);
    expect(buildWardrobe(family, createMaterials(catalog)).children.some((m) => m.userData.part === 'release')).toBe(false);
  });
});
