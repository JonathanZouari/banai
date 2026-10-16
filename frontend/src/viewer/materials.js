// Appearance -> three.js material, with a cache per distinct appearance.
// Catalog data stays outside the renderer: colours come from the injected catalog.
import * as THREE from 'three';
import { createWoodTexture } from './woodGrain.js';

// ASSUMPTION: prototype visual mapping, not a material specification.
export const FINISH_ROUGHNESS = Object.freeze({ matte: 0.85, satin: 0.5, gloss: 0.15 });
const DEFAULT_ROUGHNESS = 0.6;
const FALLBACK_COLOR = '#b8b8b8';

function resolveColor(ref, catalog) {
  if (ref.custom) return ref.hex ?? FALLBACK_COLOR;
  return catalog.colors.find((c) => c.id === ref.catalogId)?.hex ?? FALLBACK_COLOR;
}

/** Wood species id for a catalog colour flagged with a wood texture, else null. */
function woodOf(ref, catalog) {
  if (ref.custom) return null;
  const entry = catalog.colors.find((c) => c.id === ref.catalogId);
  return entry?.texture === 'wood' ? entry.id : null;
}

const resolveRoughness = (ref) => (ref.custom ? DEFAULT_ROUGHNESS : FINISH_ROUGHNESS[ref.catalogId] ?? DEFAULT_ROUGHNESS);

export function createMaterials(catalog) {
  const cache = new Map();
  const grains = new Map(); // species id -> texture, shared by every material of that wood
  const grainOf = (id) => {
    if (!grains.has(id)) grains.set(id, createWoodTexture(id));
    return grains.get(id);
  };
  const rail = new THREE.MeshStandardMaterial({ color: '#9ea3a8', metalness: 0.8, roughness: 0.3 });

  return {
    forAppearance(appearance) {
      const key = JSON.stringify(appearance);
      if (!cache.has(key)) {
        const wood = woodOf(appearance.color, catalog);
        cache.set(key, new THREE.MeshStandardMaterial({
          color: resolveColor(appearance.color, catalog),
          map: wood ? grainOf(wood) : null,
          roughness: resolveRoughness(appearance.finish),
          metalness: 0,
        }));
      }
      return cache.get(key);
    },
    rail,
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
      grains.forEach((texture) => texture?.dispose());
      grains.clear();
      rail.dispose();
    },
  };
}
