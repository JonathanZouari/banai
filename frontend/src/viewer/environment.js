// Backdrops: "studio" (flat #eceeec, RoomEnvironment light, grid + shadow floor) and "room"
// (a self-hosted CC0 HDR for light/reflections plus a grounded-skybox photo as the visible
// backdrop). The room is loaded lazily on first use and cached. Failures never throw or log:
// the viewer stays in the studio and `lastError` says why.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';

export const STUDIO_BACKGROUND = '#eceeec';
const STUDIO_INTENSITY = 0.8;
const ROOM_INTENSITY = 1;
const ROOM_FLOOR_OPACITY = 0.3;
const SKY_HEIGHT = 1.6; // m: eye height of the photo, so the photo's floor lies on y = 0
const SKY_RADIUS = 15; // m: larger than the orbit camera's reach
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
  const studioFloorOpacity = floor?.material?.opacity ?? 0.16;

  let current = 'studio';
  let token = 0;
  let room = null;
  let roomPromise = null;
  let lastError = null;
  let disposed = false;

  const applyStudio = () => {
    current = 'studio';
    scene.background = studioBackground;
    scene.environment = studioTarget.texture;
    scene.environmentIntensity = STUDIO_INTENSITY;
    if (room) room.skybox.visible = false;
    if (grid) grid.visible = true;
    if (floor) floor.material.opacity = studioFloorOpacity;
  };

  const applyRoom = () => {
    current = 'room';
    scene.background = studioBackground; // covered by the skybox
    scene.environment = room.envTarget.texture;
    scene.environmentIntensity = ROOM_INTENSITY;
    room.skybox.visible = true;
    if (grid) grid.visible = false;
    if (floor) floor.material.opacity = ROOM_FLOOR_OPACITY;
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

  applyStudio();

  return {
    /** Switch backdrop. Resolves to the backdrop in effect afterwards; never rejects. */
    async setBackdrop(name) {
      if (disposed) return current;
      const mine = ++token;
      if (name !== 'room') {
        applyStudio();
        return current;
      }
      try {
        await loadRoom();
      } catch (error) {
        lastError = error;
        if (mine === token && !disposed) applyStudio();
        return current;
      }
      if (mine === token && !disposed) {
        lastError = null;
        applyRoom();
      }
      return current;
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
      studioTarget.dispose();
      pmrem.dispose();
      if (scene.environment) scene.environment = null;
    },
  };
}
