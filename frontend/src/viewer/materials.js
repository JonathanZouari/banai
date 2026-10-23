// Appearance -> three.js material, with a cache per distinct appearance.
// Catalog data stays outside the renderer: colours come from the injected catalog.
import * as THREE from 'three';
import { woodTexture } from './woodGrain.js';

// ASSUMPTION: prototype visual mapping, not a material specification.
export const FINISH_ROUGHNESS = Object.freeze({ matte: 0.85, satin: 0.5, gloss: 0.15 });
const DEFAULT_ROUGHNESS = 0.6;
const FALLBACK_COLOR = '#b8b8b8';
// ASSUMPTION: catalog materials that show a wood grain in the live view (visual only).
export const GRAIN_MATERIALS = new Set(['solid_oak']);

export function resolveColor(ref, catalog) {
  if (ref.custom) return ref.hex ?? FALLBACK_COLOR;
  return catalog.colors.find((c) => c.id === ref.catalogId)?.hex ?? FALLBACK_COLOR;
}

const resolveRoughness = (ref) => (ref.custom ? DEFAULT_ROUGHNESS : FINISH_ROUGHNESS[ref.catalogId] ?? DEFAULT_ROUGHNESS);
// The grain is drawn on a canvas, so it is skipped where there is no DOM (unit tests).
const hasGrain = (ref) => !ref.custom && GRAIN_MATERIALS.has(ref.catalogId) && typeof document !== 'undefined';

export function createMaterials(catalog) {
  const cache = new Map();
  const rail = new THREE.MeshStandardMaterial({ color: '#9ea3a8', metalness: 0.8, roughness: 0.3 });
  // Door handles and sliding rails: neutral dark metal, independent of the design's appearance.
  const hardware = new THREE.MeshStandardMaterial({ color: '#4a4e53', metalness: 0.6, roughness: 0.4 });
  // Thin outline on door panels so adjacent white panels stay readable.
  const doorEdge = new THREE.LineBasicMaterial({ color: '#3b3530', transparent: true, opacity: 0.38 });

  return {
    forAppearance(appearance) {
      const key = JSON.stringify(appearance);
      if (!cache.has(key)) {
        const color = resolveColor(appearance.color, catalog);
        const grain = hasGrain(appearance.material);
        cache.set(key, new THREE.MeshStandardMaterial({
          color: grain ? '#ffffff' : color, // the grain texture carries the colour
          map: grain ? woodTexture(color) : null,
          roughness: resolveRoughness(appearance.finish),
          metalness: 0,
        }));
      }
      return cache.get(key);
    },
    rail,
    hardware,
    doorEdge,
    /** Dispose cached materials the current scene no longer uses (keeps memory bounded). */
    retainOnly(inUse) {
      for (const [key, material] of cache) {
        if (!inUse.has(material)) {
          material.map?.dispose();
          material.dispose();
          cache.delete(key);
        }
      }
    },
    dispose() {
      cache.forEach((material) => {
        material.map?.dispose();
        material.dispose();
      });
      cache.clear();
      rail.dispose();
      hardware.dispose();
      doorEdge.dispose();
    },
  };
}
