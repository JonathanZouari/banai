import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  frameCamera, SNAPSHOT_SETTINGS, SNAPSHOT_SIZE, snapshotSettings, THUMBNAIL_SETTINGS,
} from '../../../src/viewer/snapshot.js';
import { loadDesign } from '../domain/helpers.js';

const camera = (width = SNAPSHOT_SIZE.width, height = SNAPSHOT_SIZE.height) => new THREE.PerspectiveCamera(22, width / height, 0.05, 80);

describe('renderSnapshot settings', () => {
  it('the default picture (carpenter PDF) keeps exactly its previous settings', () => {
    expect(snapshotSettings()).toBe(SNAPSHOT_SETTINGS);
    expect(snapshotSettings({ thumbnail: false })).toBe(SNAPSHOT_SETTINGS);
    expect(SNAPSHOT_SETTINGS).toEqual({ shadowMapSize: 2048, environment: true, quality: 0.9, framing: 'fit' });
    expect(SNAPSHOT_SIZE).toEqual({ width: 1200, height: 1300 });
  });

  it('the lighter thumbnail mode is opt-in only (thumbnail: true, nothing truthy-ish)', () => {
    expect(snapshotSettings({ thumbnail: true })).toBe(THUMBNAIL_SETTINGS);
    expect(snapshotSettings({ thumbnail: 'yes' })).toBe(SNAPSHOT_SETTINGS);
    expect(THUMBNAIL_SETTINGS.shadowMapSize).toBeLessThan(SNAPSHOT_SETTINGS.shadowMapSize);
  });

  it('default framing is unchanged: the same camera as before this mode existed', () => {
    const cam = camera();
    frameCamera(cam, loadDesign('basic'));
    // Pinned from the previous frameCamera (fill the picture with the wardrobe).
    const position = [3.5286511899297266, 1.7531424477971278, 7.902034968530396];
    const quaternion = [-0.031814193056098186, 0.14889130131334158, 0.004792788254661508, 0.9883300393563657];
    cam.position.toArray().forEach((value, i) => expect(value).toBeCloseTo(position[i], 12));
    cam.quaternion.toArray().forEach((value, i) => expect(value).toBeCloseTo(quaternion[i], 12));
  });

  it('thumbnail framing shares one scale, so a smaller wardrobe looks smaller', () => {
    const distance = (name) => {
      const cam = camera(400, 434);
      frameCamera(cam, loadDesign(name), 'reference');
      return cam.position.z;
    };
    expect(distance('template_kids')).toBeCloseTo(distance('template_minimal'), 6);
    expect(distance('template_kids')).toBeCloseTo(distance('basic'), 6);
    const fit = camera(400, 434);
    frameCamera(fit, loadDesign('template_kids'));
    expect(fit.position.z).toBeLessThan(distance('template_kids')); // 'fit' would zoom in on it
  });
});
