// Appearance -> three.js material, with a cache per distinct appearance.
// Catalog data stays outside the renderer: colours come from the injected catalog.
import * as THREE from 'three';
import { WOOD_GRAINS, createWoodTexture } from './woodTexture.js';

// ASSUMPTION: prototype visual mapping, not a material specification.
export const FINISH_ROUGHNESS = Object.freeze({ matte: 0.85, satin: 0.5, gloss: 0.15 });
const DEFAULT_ROUGHNESS = 0.6;
const FALLBACK_COLOR = '#b8b8b8';
const DEFAULT_GRAIN = 'oak'; // veneer without a named grain

const colorEntry = (ref, catalog) => (ref.custom ? null : catalog.colors.find((c) => c.id === ref.catalogId) ?? null);

function resolveColor(ref, catalog) {
  if (ref.custom) return ref.hex ?? FALLBACK_COLOR;
  return colorEntry(ref, catalog)?.hex ?? FALLBACK_COLOR;
}

function resolveGrain(appearance, catalog) {
  const grain = colorEntry(appearance.color, catalog)?.grain;
  if (WOOD_GRAINS.includes(grain)) return grain;
  return appearance.material?.catalogId === 'oak_veneer' ? DEFAULT_GRAIN : null;
}

const resolveRoughness = (ref) => (ref.custom ? DEFAULT_ROUGHNESS : FINISH_ROUGHNESS[ref.catalogId] ?? DEFAULT_ROUGHNESS);

export function createMaterials(catalog, { anisotropy = 1 } = {}) {
  const cache = new Map();
  const grains = new Map(); // one shared greyscale texture per wood grain
  const rail = new THREE.MeshStandardMaterial({ color: '#9ea3a8', metalness: 0.8, roughness: 0.3 });
  // Insert hardware (P1 values): polished tubes, brushed aluminium profiles, and the LED strip,
  // whose emissive intensity the viewer drives with the door sensor (0 = off).
  const chrome = new THREE.MeshStandardMaterial({ color: '#e6e8ea', metalness: 1, roughness: 0.12 });
  const metal = new THREE.MeshStandardMaterial({ color: '#b9bcc0', metalness: 1, roughness: 0.38 });
  // A sample flat screen: a matte black body and a dark glass face with a faint blue sheen.
  const screenBody = new THREE.MeshStandardMaterial({ color: '#141416', metalness: 0.2, roughness: 0.6 });
  const screenGlass = new THREE.MeshStandardMaterial({ color: '#0b0d12', metalness: 0.6, roughness: 0.08, emissive: '#0a1630', emissiveIntensity: 0.35 });
  const led = new THREE.MeshStandardMaterial({ color: '#fff7ec', emissive: '#ffd8a8', emissiveIntensity: 0, roughness: 0.4 });
  const release = new THREE.MeshStandardMaterial({ color: '#d93025', roughness: 0.4, metalness: 0.1 }); // the child lock's button
  const fixed = [rail, chrome, metal, led, screenBody, screenGlass, release];

  const grainTexture = (grain) => {
    if (!grains.has(grain)) grains.set(grain, createWoodTexture(grain, { anisotropy }));
    return grains.get(grain);
  };

  return {
    forAppearance(appearance) {
      const key = JSON.stringify(appearance);
      if (!cache.has(key)) {
        const grain = resolveGrain(appearance, catalog);
        const material = new THREE.MeshStandardMaterial({
          color: resolveColor(appearance.color, catalog),
          roughness: resolveRoughness(appearance.finish),
          metalness: 0,
        });
        if (grain) material.map = grainTexture(grain); // multiplies the colour, never replaces it
        cache.set(key, material);
      }
      return cache.get(key);
    },
    rail,
    chrome,
    metal,
    screenBody,
    screenGlass,
    release,
    led,
    /** Dispose cached materials the current scene no longer uses (keeps memory bounded). Grain textures stay shared until dispose(). */
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
      grains.forEach((texture) => texture.dispose());
      grains.clear();
      fixed.forEach((material) => material.dispose());
    },
  };
}
