// Backdrops: "studio" (flat warm #efe8dc, RoomEnvironment light, grid + shadow floor) and "room"
// (a self-hosted CC0 HDR for light/reflections plus a grounded-skybox photo as the visible
// backdrop). The room is loaded lazily on first use and cached. Failures never throw or log:
// the viewer stays in the studio and `lastError` says why.
//
// While the path tracer renders, a "render set" overrides both: the studio background, an
// equirect environment the tracer can sample (it cannot read PMREM textures), no grid or skybox,
// and a large diffuse floor that catches real shadows (a ShadowMaterial would trace as a dark
// veil). The chosen backdrop comes back when the render set is cleared.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';

export const STUDIO_BACKGROUND = '#efe8dc'; // a warm studio, like the paper around it
// Render set: a warm, slightly darker studio than the live view, so a white carcass separates from
// the backdrop and its shadows read (measured: the old near-white set put 99% of pixels above 224).
export const RENDER_BACKGROUND = '#d9d6d0';
export const RENDER_FLOOR_COLOR = '#c9c4bb';
const STUDIO_INTENSITY = 0.8;
const ROOM_INTENSITY = 1;
const ROOM_FLOOR_OPACITY = 0.3;
const SKY_HEIGHT = 1.6; // m: eye height of the photo, so the photo's floor lies on y = 0
const SKY_RADIUS = 15; // m: larger than the orbit camera's reach
const RENDER_FLOOR_SCALE = 10; // the 12 m floor becomes 120 m, so its edge sits near the horizon
const noRaycast = () => {};

const defaultLoadHdr = (url) => new HDRLoader().loadAsync(url);
const defaultLoadImage = (url) => new THREE.TextureLoader().loadAsync(url);

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {{ grid?: THREE.Object3D, floor?: THREE.Mesh, baseUrl?: string }} [options] grid is hidden in the room; floor (shadow catcher) stays.
 */
export function createEnvironment(renderer, scene, options = {}) {
  const {
    grid = null, floor = null, baseUrl = '/env/',
    loadHdr = defaultLoadHdr, loadImage = defaultLoadImage,
    createPmrem = (r) => new THREE.PMREMGenerator(r),
  } = options;
  const pmrem = createPmrem(renderer);
  const studioScene = new RoomEnvironment();
  const studioTarget = pmrem.fromScene(studioScene, 0.04);
  studioScene.dispose();
  const studioBackground = new THREE.Color(STUDIO_BACKGROUND);
  const renderBackground = new THREE.Color(RENDER_BACKGROUND);
  const floorMaterial = floor?.material ?? null;
  const studioFloorOpacity = floorMaterial?.opacity ?? 0.16;
  let renderFloor = null; // diffuse floor of the render set, created on first use

  let current = 'studio';
  let token = 0;
  let room = null;
  let roomPromise = null;
  let lastError = null;
  let disposed = false;
  let renderSet = null; // { environment, intensity } while the path tracer renders

  const setFloor = (material, scale) => {
    if (!floor) return;
    floor.material = material;
    floor.scale.setScalar(scale);
  };

  const applyStudio = () => {
    scene.background = studioBackground;
    scene.environment = studioTarget.texture;
    scene.environmentIntensity = STUDIO_INTENSITY;
    if (room) room.skybox.visible = false;
    if (grid) grid.visible = true;
    setFloor(floorMaterial, 1);
    if (floorMaterial) floorMaterial.opacity = studioFloorOpacity;
  };

  const applyRoom = () => {
    scene.background = studioBackground; // covered by the skybox
    scene.environment = room.envTarget.texture;
    scene.environmentIntensity = ROOM_INTENSITY;
    room.skybox.visible = true;
    if (grid) grid.visible = false;
    setFloor(floorMaterial, 1);
    if (floorMaterial) floorMaterial.opacity = ROOM_FLOOR_OPACITY;
  };

  const applyRenderSet = () => {
    scene.background = renderBackground;
    scene.environment = renderSet.environment;
    scene.environmentIntensity = renderSet.intensity;
    if (room) room.skybox.visible = false;
    if (grid) grid.visible = false;
    renderFloor ??= new THREE.MeshStandardMaterial({ color: RENDER_FLOOR_COLOR, roughness: 1, metalness: 0 });
    setFloor(renderFloor, RENDER_FLOOR_SCALE);
  };

  /** Draw what is in effect: the render set, else the chosen backdrop. */
  const apply = () => {
    if (renderSet) applyRenderSet();
    else if (current === 'room' && room) applyRoom();
    else applyStudio();
  };

  const freeRoom = (assets) => {
    assets.envTarget?.dispose();
    assets.image?.dispose();
    if (assets.skybox) {
      scene.remove(assets.skybox);
      assets.skybox.geometry.dispose();
      assets.skybox.material.dispose();
    }
  };

  const loadRoom = () => {
    if (!roomPromise) {
      roomPromise = (async () => {
        const assets = {};
        try {
          const hdr = await loadHdr(`${baseUrl}small_empty_room_3_1k.hdr`);
          hdr.mapping = THREE.EquirectangularReflectionMapping;
          assets.envTarget = pmrem.fromEquirectangular(hdr);
          hdr.dispose();
          const image = await loadImage(`${baseUrl}small_empty_room_3_4k.jpg`);
          assets.image = image;
          image.colorSpace = THREE.SRGBColorSpace;
          image.mapping = THREE.EquirectangularReflectionMapping;
          image.anisotropy = Math.min(8, renderer.capabilities?.getMaxAnisotropy?.() ?? 1);
          const skybox = new GroundedSkybox(image, SKY_HEIGHT, SKY_RADIUS);
          skybox.position.y = SKY_HEIGHT;
          skybox.material.toneMapped = false; // the photo is already a display-referred image
          skybox.renderOrder = -1000;
          skybox.frustumCulled = false;
          skybox.raycast = noRaycast;
          skybox.visible = false;
          assets.skybox = skybox;
          if (disposed) throw new Error('environment disposed');
          scene.add(skybox);
          room = assets;
        } catch (error) {
          freeRoom(assets);
          roomPromise = null;
          throw error;
        }
      })();
    }
    return roomPromise;
  };

  apply();

  return {
    /** Switch backdrop. Resolves to the backdrop in effect afterwards; never rejects. */
    async setBackdrop(name) {
      if (disposed) return current;
      const mine = ++token;
      if (name !== 'room') {
        current = 'studio';
        apply();
        return current;
      }
      try {
        await loadRoom();
      } catch (error) {
        lastError = error;
        if (mine === token && !disposed) {
          current = 'studio';
          apply();
        }
        return current;
      }
      if (mine === token && !disposed) {
        lastError = null;
        current = 'room';
        apply();
      }
      return current;
    },
    /**
     * Path-tracing render set: { environment, intensity } (an equirect texture) turns it on, null
     * restores the chosen backdrop. A backdrop switch during the render applies afterwards.
     */
    setRenderSet(set) {
      if (disposed) return;
      renderSet = set ? { environment: set.environment ?? null, intensity: set.intensity ?? 1 } : null;
      apply();
    },
    /** Centre the room on a point (metres) so the wardrobe stands in the middle of it. */
    focus(x, z) {
      if (room) room.skybox.position.set(x, SKY_HEIGHT, z);
    },
    get backdrop() { return current; },
    get lastError() { return lastError; },
    dispose() {
      disposed = true;
      token += 1;
      if (room) freeRoom(room);
      room = null;
      renderSet = null;
      setFloor(floorMaterial, 1);
      renderFloor?.dispose();
      studioTarget.dispose();
      pmrem.dispose();
      if (scene.environment) scene.environment = null;
    },
  };
}
