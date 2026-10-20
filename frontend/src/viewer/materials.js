// Appearance -> three.js material, with a cache per distinct appearance.
// Catalog data stays outside the renderer: colours come from the injected catalog.
import * as THREE from 'three';

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
  const rail = new THREE.MeshStandardMaterial({ color: '#9ea3a8', metalness: 0.8, roughness: 0.3 });
  // Door handles and sliding rails: neutral dark metal, independent of the design's appearance.
  const hardware = new THREE.MeshStandardMaterial({ color: '#4a4e53', metalness: 0.6, roughness: 0.4 });
  // Thin outline on door panels so adjacent white panels stay readable.
  const doorEdge = new THREE.LineBasicMaterial({ color: '#3b3530', transparent: true, opacity: 0.38 });
  // Mirror fronts: a polished metal look. Reflections come from an environment map the viewer
  // provides (setEnvironment); without one (e.g. in tests) it renders as plain bright metal.
  const mirror = new THREE.MeshStandardMaterial({ color: '#e9eef1', metalness: 1, roughness: 0.04 });
  // Door handles, one material per catalog finish.
  const handles = new Map();

  return {
    forAppearance(appearance) {
      const key = JSON.stringify(appearance);
      if (!cache.has(key)) {
        cache.set(key, new THREE.MeshStandardMaterial({
          color: resolveColor(appearance.color, catalog),
          roughness: resolveRoughness(appearance.finish),
          metalness: 0,
        }));
      }
      return cache.get(key);
    },
    rail,
    hardware,
    doorEdge,
    mirror,
    /** Handle material for a catalog finish id (unknown ids fall back to the neutral hardware). */
    handle(finishId) {
      if (!handles.has(finishId)) {
        const finish = catalog.handleFinishes?.find((f) => f.id === finishId);
        handles.set(finishId, finish
          ? new THREE.MeshStandardMaterial({ color: finish.hex, metalness: finish.metalness, roughness: 0.35 })
          : hardware);
      }
      return handles.get(finishId);
    },
    setEnvironment(texture) {
      mirror.envMap = texture;
      mirror.needsUpdate = true;
    },
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
      rail.dispose();
      hardware.dispose();
      doorEdge.dispose();
      mirror.dispose();
      handles.forEach((material) => material.dispose());
      handles.clear();
    },
  };
}
