// Backdrops and the path tracer's render set, with a fake PMREM generator (no WebGL in Node).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RENDER_BACKGROUND, RENDER_FLOOR_COLOR, STUDIO_BACKGROUND, createEnvironment } from '../../../src/viewer/environment.js';

function setup({ failRoom = false } = {}) {
  const scene = new THREE.Scene();
  const grid = new THREE.GridHelper(12, 24);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.16 }));
  scene.add(grid, floor);
  const studioTexture = new THREE.Texture();
  const roomTexture = new THREE.Texture();
  const environment = createEnvironment({}, scene, {
    grid, floor,
    createPmrem: () => ({
      fromScene: () => ({ texture: studioTexture, dispose() {} }),
      fromEquirectangular: () => ({ texture: roomTexture, dispose() {} }),
      dispose() {},
    }),
    loadHdr: async () => {
      if (failRoom) throw new Error('offline');
      return new THREE.DataTexture(new Float32Array(4), 1, 1);
    },
    loadImage: async () => new THREE.Texture(),
  });
  const skybox = () => scene.children.find((child) => child.geometry?.type === 'SphereGeometry') ?? null;
  return { scene, grid, floor, environment, studioTexture, roomTexture, skybox, shadow: floor.material };
}

const renderSet = { environment: new THREE.DataTexture(new Float32Array(4), 1, 1), intensity: 0.95 };

describe('render set', () => {
  it('replaces the studio with a traceable set and gives the studio back', () => {
    const { scene, grid, floor, environment, studioTexture, shadow } = setup();
    environment.setRenderSet(renderSet);
    expect(scene.environment).toBe(renderSet.environment);
    expect(scene.environmentIntensity).toBe(0.95);
    // A warmer, darker set than the live studio, so a white carcass separates from it.
    expect(scene.background.getHexString()).toBe(RENDER_BACKGROUND.slice(1));
    expect(RENDER_BACKGROUND).not.toBe(STUDIO_BACKGROUND);
    expect(grid.visible).toBe(false);
    expect(floor.material.isMeshStandardMaterial).toBe(true); // a real floor catches traced shadows
    expect(floor.material.color.getHexString()).toBe(RENDER_FLOOR_COLOR.slice(1));
    expect(floor.scale.x).toBe(10);
    environment.setRenderSet(null);
    expect(scene.environment).toBe(studioTexture);
    expect(grid.visible).toBe(true);
    expect(floor.material).toBe(shadow);
    expect(floor.scale.x).toBe(1);
    expect(environment.backdrop).toBe('studio');
  });

  it('hides the room photo while rendering and restores the room afterwards', async () => {
    const { scene, floor, environment, roomTexture, skybox, shadow } = setup();
    await expect(environment.setBackdrop('room')).resolves.toBe('room');
    expect(skybox().visible).toBe(true);
    environment.setRenderSet(renderSet);
    expect(skybox().visible).toBe(false);
    expect(scene.environment).toBe(renderSet.environment);
    environment.setRenderSet(null);
    expect(skybox().visible).toBe(true);
    expect(scene.environment).toBe(roomTexture);
    expect(floor.material).toBe(shadow);
    expect(shadow.opacity).toBe(0.3);
  });

  it('applies a backdrop switch made during the render only after it', async () => {
    const { scene, environment, roomTexture, skybox } = setup();
    environment.setRenderSet(renderSet);
    await environment.setBackdrop('room');
    expect(environment.backdrop).toBe('room');
    expect(skybox().visible).toBe(false);
    expect(scene.environment).toBe(renderSet.environment);
    environment.setRenderSet(null);
    expect(skybox().visible).toBe(true);
    expect(scene.environment).toBe(roomTexture);
  });

  it('stays in the studio when the room fails to load, and restores the floor on dispose', async () => {
    const { floor, environment, shadow } = setup({ failRoom: true });
    await expect(environment.setBackdrop('room')).resolves.toBe('studio');
    expect(environment.lastError.message).toBe('offline');
    environment.setRenderSet(renderSet);
    environment.dispose();
    expect(floor.material).toBe(shadow);
  });
});
