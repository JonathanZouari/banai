// Appearance -> three.js material, with a cache per distinct appearance.
// Catalog data stays outside the renderer: colours come from the injected catalog.
import * as THREE from 'three';
import { createTextures } from './textures.js';

// ASSUMPTION: prototype visual mapping, not a material specification.
export const FINISH_ROUGHNESS = Object.freeze({ matte: 0.85, satin: 0.5, gloss: 0.15 });
const DEFAULT_ROUGHNESS = 0.6;
const FALLBACK_COLOR = '#b8b8b8';
// Catalog ids that are drawn with wood grain: the veneer material, and the wood-tone colours.
const WOOD_MATERIALS = new Set(['oak_veneer']);
const WOOD_COLORS = new Set(['natural_oak', 'walnut']);
const LACQUER_MATERIALS = new Set(['lacquered_mdf']);

function resolveColor(ref, catalog) {
  if (ref.custom) return ref.hex ?? FALLBACK_COLOR;
  return catalog.colors.find((c) => c.id === ref.catalogId)?.hex ?? FALLBACK_COLOR;
}

const resolveRoughness = (ref) => (ref.custom ? DEFAULT_ROUGHNESS : FINISH_ROUGHNESS[ref.catalogId] ?? DEFAULT_ROUGHNESS);

/** Which surface an appearance is drawn with: 'wood', 'lacquer' or 'board' (melamine and others). */
export function surfaceOf(appearance) {
  const material = appearance.material?.catalogId;
  if (LACQUER_MATERIALS.has(material)) return 'lacquer';
  if (WOOD_MATERIALS.has(material) || (!appearance.color.custom && WOOD_COLORS.has(appearance.color.catalogId))) return 'wood';
  return 'board';
}

function buildMaterial(appearance, catalog, textures) {
  const color = resolveColor(appearance.color, catalog);
  const roughness = resolveRoughness(appearance.finish);
  // The floor fades into fog; the wardrobe itself never does.
  const common = { color, roughness, metalness: 0, fog: false };
  const surface = surfaceOf(appearance);
  if (surface === 'lacquer') {
    // A clear coat over the base colour: sharp reflections even on a matte base.
    return new THREE.MeshPhysicalMaterial({ ...common, clearcoat: 1, clearcoatRoughness: Math.min(roughness, 0.35) });
  }
  if (surface === 'wood') {
    return new THREE.MeshStandardMaterial({ ...common, map: textures.wood() });
  }
  return new THREE.MeshStandardMaterial({ ...common, roughnessMap: textures.speckle() });
}

export function createMaterials(catalog, { anisotropy = 1 } = {}) {
  const cache = new Map();
  const textures = createTextures({ anisotropy });
  const rail = new THREE.MeshStandardMaterial({ color: '#b4b8bc', metalness: 1, roughness: 0.25, fog: false });
  // Door handles, drawer pulls and sliding rails: neutral dark metal, independent of the design's appearance.
  const hardware = new THREE.MeshStandardMaterial({ color: '#4a4e53', metalness: 0.8, roughness: 0.35, fog: false });
  // Thin outline on door panels so adjacent white panels stay readable.
  const doorEdge = new THREE.LineBasicMaterial({ color: '#3b3530', transparent: true, opacity: 0.2, fog: false });

  return {
    forAppearance(appearance) {
      const key = JSON.stringify(appearance);
      if (!cache.has(key)) cache.set(key, buildMaterial(appearance, catalog, textures));
      return cache.get(key);
    },
    rail,
    hardware,
    doorEdge,
    /** Dispose cached materials the current scene no longer uses (keeps memory bounded). */
    retainOnly(inUse) {
      for (const [key, material] of cache) {
        if (!inUse.has(material)) {
          material.dispose();
          cache.delete(key);
        }
      }
    },
    dispose() {
      cache.forEach((material) => material.dispose());
      cache.clear();
      textures.dispose();
      rail.dispose();
      hardware.dispose();
      doorEdge.dispose();
    },
  };
}
