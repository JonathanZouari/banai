import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { buildWardrobe, disposeWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { attachEdges, detachEdges } from '../../../src/viewer/edges.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const build = () => buildWardrobe(loadDesign('basic'), createMaterials(loadCatalog()), { doorsVisible: true });
const edgesOf = (mesh) => mesh.children.filter((child) => child.userData.edge);
const newMaterial = () => new THREE.LineBasicMaterial({ color: '#8a857c', transparent: true, opacity: 0.35 });

describe('panel edge lines', () => {
  it('adds exactly one non-pickable edge child per mesh without changing group.children', () => {
    const group = build();
    const meshes = [...group.children];
    const material = newMaterial();
    attachEdges(group, material);

    expect(group.children).toEqual(meshes);
    meshes.forEach((mesh) => {
      const edges = edgesOf(mesh);
      expect(edges).toHaveLength(1);
      expect(edges[0].isLineSegments).toBe(true);
      expect(edges[0].material).toBe(material);
      expect(edges[0].geometry.getAttribute('position').count).toBeGreaterThan(0);
    });
  });

  it('never lets edge lines take part in raycasting', () => {
    const group = build();
    attachEdges(group, newMaterial());
    group.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(1, 1, 5), new THREE.Vector3(0, 0, -1));
    const hits = raycaster.intersectObjects(group.children, true);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => !hit.object.userData.edge)).toBe(true);
  });

  it('detaches the edge lines and disposes their geometry, but not the shared material', () => {
    const group = build();
    const material = newMaterial();
    const materialDispose = vi.spyOn(material, 'dispose');
    attachEdges(group, material);
    const edgeGeometries = group.children.flatMap((mesh) => edgesOf(mesh)).map((edges) => edges.geometry);
    const geometryDispose = edgeGeometries.map((geometry) => vi.spyOn(geometry, 'dispose'));

    detachEdges(group);

    group.children.forEach((mesh) => expect(edgesOf(mesh)).toHaveLength(0));
    expect(edgeGeometries).toHaveLength(group.children.length);
    geometryDispose.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    expect(materialDispose).not.toHaveBeenCalled();
  });

  it('leaves the wardrobe meshes and their geometry intact on detach', () => {
    const group = build();
    const meshes = [...group.children];
    const meshDispose = meshes.map((mesh) => vi.spyOn(mesh.geometry, 'dispose'));
    attachEdges(group, newMaterial());
    detachEdges(group);
    expect(group.children).toEqual(meshes);
    meshDispose.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('is safe to detach twice and to dispose the wardrobe afterwards', () => {
    const group = build();
    attachEdges(group, newMaterial());
    detachEdges(group);
    expect(() => detachEdges(group)).not.toThrow();
    expect(() => disposeWardrobe(group)).not.toThrow();
  });
});
