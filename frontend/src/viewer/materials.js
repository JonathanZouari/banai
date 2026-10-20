// Appearance -> three.js material, with a cache per distinct appearance.
// Catalog data stays outside the renderer: colours come from the injected catalog.
import * as THREE from 'three';
import { isWoodAppearance } from '../domain/catalog.js';
import { createWoodTexture } from './woodTexture.js';

// ASSUMPTION: prototype visual mapping, not a material specification.
export const FINISH_ROUGHNESS = Object.freeze({ matte: 0.85, satin: 0.5, gloss: 0.15 });
const DEFAULT_ROUGHNESS = 0.6;
const FALLBACK_COLOR = '#b8b8b8';

function resolveColor(ref, catalog) {
  if (ref.custom) return ref.hex ?? FALLBACK_COLOR;
  return catalog.colors.find((c) => c.id === ref.catalogId)?.hex ?? FALLBACK_COLOR;
}

const resolveRoughness = (ref) => (ref.custom ? DEFAULT_ROUGHNESS : FINISH_ROUGHNESS[ref.catalogId] ?? DEFAULT_ROUGHNESS);

export function createMaterials(catalog) {
  const cache = new Map();
  let grain = null; // one wood-grain texture, created on first use and shared by all wood materials
  const woodGrain = () => {
    grain ??= createWoodTexture();
    return grain;
  };
  const rail = new THREE.MeshStandardMaterial({ color: '#9ea3a8', metalness: 0.8, roughness: 0.3 });
  // Door handles and sliding rails: neutral dark metal, independent of the design's appearance.
  const hardware = new THREE.MeshStandardMaterial({ color: '#4a4e53', metalness: 0.6, roughness: 0.4 });
  // Thin outline on door panels so adjacent white panels stay readable.
  const doorEdge = new THREE.LineBasicMaterial({ color: '#3b3530', transparent: true, opacity: 0.38 });

  return {
    forAppearance(appearance) {
      const key = JSON.stringify(appearance);
      if (!cache.has(key)) {
        // Wood tones and veneers get the shared grain texture, tinted by the chosen colour.
        cache.set(key, new THREE.MeshStandardMaterial({
          color: resolveColor(appearance.color, catalog),
          map: isWoodAppearance(appearance) ? woodGrain() : null,
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
          material.dispose(); // the shared grain texture stays for the next wood material
          cache.delete(key);
        }
      }
    },
    dispose() {
      cache.forEach((material) => material.dispose());
      grain?.dispose();
      grain = null;
      cache.clear();
      rail.dispose();
      hardware.dispose();
      doorEdge.dispose();
    },
  };
}
