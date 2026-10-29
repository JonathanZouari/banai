// The landing page's wardrobe: the real basic wardrobe, built by the viewer's own builders,
// centred on the origin, with hinged doors that can swing open for the "Inside" tour.
import * as THREE from 'three';
import { applyOps } from '../../domain/apply.js';
import { basicWardrobe } from '../../domain/presets.js';
import { buildWardrobe, disposeWardrobe } from '../../viewer/buildWardrobe.js';
import { snapshotMaterials } from '../../viewer/snapshot.js';
import { toM } from '../../viewer/units.js';

// ASSUMPTION: the landing page's showcase look (a Scandinavian white wardrobe); a configurable default.
export const SHOWCASE_STYLE = Object.freeze({
  material: 'lacquered_mdf', color: 'white', finish: 'matte', handle: 'long_bar', handleFinish: 'black',
});

/** The ops that give the whole wardrobe one look: carcass, doors and handles. */
export function styleOps(style) {
  const appearance = {
    material: { catalogId: style.material }, color: { catalogId: style.color }, finish: { catalogId: style.finish },
  };
  return [
    { op: 'set_material', target: 'carcass', ...appearance },
    { op: 'set_material', target: 'doors', ...appearance },
    { op: 'set_handles', style: style.handle, finish: style.handleFinish },
  ];
}

/** The basic wardrobe in a given look, through the same op protocol as every other change. */
export const showcaseDesign = (catalog, style = SHOWCASE_STYLE) => applyOps(basicWardrobe(catalog), styleOps(style), catalog);

const DOOR_SWING = 1.95; // radians when fully open: folded back, clear of the interior

/**
 * Build the design for a landing scene. Door panels and the hardware drawn after them (outline,
 * mirror, handle) move into a pivot on the hinge edge, so `setDoors` can swing them open.
 */
export function createShowcaseWardrobe(design, catalog) {
  const materials = snapshotMaterials(catalog);
  const built = buildWardrobe(design, materials, { doorsVisible: true });
  built.position.set(-toM(design.dimensions.width) / 2, 0, toM(design.dimensions.depth) / 2);
  const root = new THREE.Group();
  root.add(built);

  const pivots = [];
  let pivot = null;
  [...built.children].forEach((object) => {
    const { kind, part, hingeSide } = object.userData;
    if (kind === 'door' && hingeSide) {
      const { width } = object.geometry.parameters;
      const sign = hingeSide === 'right' ? -1 : 1;
      pivot = new THREE.Group();
      pivot.position.set(object.position.x - (sign * width) / 2, 0, 0);
      pivot.userData = { sign, componentId: object.userData.componentId };
      built.add(pivot);
      pivots.push(pivot);
    } else if (!(pivot && (kind === 'mirror' || (kind === 'hardware' && (part === 'edge' || part === 'handle'))))) {
      return;
    }
    object.position.sub(pivot.position);
    pivot.add(object);
  });
  root.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  const byId = (componentId) => {
    let found = null;
    built.traverse((object) => {
      if (!found && object.isMesh && object.userData.componentId === componentId) found = object;
    });
    return found;
  };

  return {
    root,
    pivots,
    setDoors(open) {
      pivots.forEach((p) => { p.rotation.y = -p.userData.sign * open * DOOR_SWING; });
    },
    /** Meshes of one kind (shelf, drawer, rail, partition) or the door handles ('handle'). */
    meshesOf(kind) {
      const found = [];
      built.traverse((object) => {
        if (!object.isMesh) return;
        const u = object.userData;
        if (kind === 'handle' ? u.kind === 'hardware' && u.part === 'handle' : u.kind === kind) found.push(object);
      });
      return found;
    },
    /** World-space point on the front face of a component (for callouts). */
    frontOf(meshes) {
      const box = new THREE.Box3();
      meshes.forEach((mesh) => box.expandByObject(mesh));
      const center = box.getCenter(new THREE.Vector3());
      return new THREE.Vector3(center.x, center.y, box.max.z);
    },
    byId,
    /** Every material the wardrobe uses for panels (not hardware), for colour transitions. */
    panelMaterials() {
      const set = new Set();
      built.traverse((object) => {
        if (object.isMesh && ['carcass', 'door', 'partition', 'shelf', 'drawer'].includes(object.userData.kind)) set.add(object.material);
      });
      return [...set];
    },
    dispose() {
      root.removeFromParent();
      disposeWardrobe(root);
      materials.dispose();
    },
  };
}
