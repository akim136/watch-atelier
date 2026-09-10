import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createHandSet, HAND_RECIPE_VERSION, handRecipes, type HandSetInput } from '../../src/render/assets/hands';
import { createFinish, FINISH_VERSION, finishRecipes, type FinishId } from '../../src/render/assets/materials';
import { handInput, type HandAsset } from './parts-fixture';

const handIds = ['pencil', 'sword', 'dauphine', 'spade'] as const;
const finishIds = ['titanium-look', 'champagne-gold-look', 'bronze-look', 'ink-ceramic-look', 'woven-textile-look'] as const;
const checksum = (values: ArrayLike<number>) => createHash('sha256').update(JSON.stringify(Array.from(values))).digest('hex');
function digest(asset: HandAsset) {
  return asset.pickables.map(mesh => ({ name: mesh.name,
    positions: checksum(mesh.geometry.getAttribute('position').array),
    normals: checksum(mesh.geometry.getAttribute('normal').array),
    indices: mesh.geometry.index ? checksum(mesh.geometry.index.array) : null,
  }));
}
function checkAsset(asset: HandAsset, semanticId: string) {
  expect(asset.pickables.length).toBeGreaterThanOrEqual(5);
  const names: string[] = [];
  asset.root.updateMatrixWorld(true);
  asset.root.traverse(node => {
    expect(node.userData.semanticId).toBe(semanticId);
    names.push(node.name);
  });
  expect(new Set(names).size).toBe(names.length);
  for (const mesh of asset.pickables) {
    const pos = mesh.geometry.getAttribute('position'), normals = mesh.geometry.getAttribute('normal');
    expect(pos.count).toBeGreaterThan(2); expect(normals.count).toBe(pos.count);
    let forward = 0, backward = 0;
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const n = new THREE.Vector3().fromBufferAttribute(normals, i);
      expect([p.x, p.y, p.z, n.x, n.y, n.z].every(Number.isFinite)).toBe(true);
      expect(n.length()).toBeCloseTo(1, 4);
      expect(Math.hypot(p.x, p.y)).toBeLessThan(13.3);
      expect(p.z).toBeGreaterThan(3.82); expect(p.z).toBeLessThan(4.75);
      if (n.z > .5) forward++; if (n.z < -.5) backward++;
    }
    expect(forward).toBeGreaterThan(0);
    if (!mesh.name.includes('facet')) expect(backward).toBeGreaterThan(0);
  }
}

describe('new authoring hand subparts', () => {
  it('[ASSET-PARTS] requires the explicit four distinct recipes with stable mappings and deterministic finite bounded geometry', () => {
    expect(Object.keys(handRecipes)).toEqual([...handIds]);
    expect(HAND_RECIPE_VERSION).toBe('atelier-hand-studies-1.0.0');
    const shapes: string[] = [];
    for (const id of handIds) {
      const input = handInput(id), before = structuredClone(input);
      const a = createHandSet(input), b = createHandSet(input);
      try {
        checkAsset(a, input.component.id); checkAsset(b, input.component.id);
        expect(digest(a)).toEqual(digest(b)); expect(input).toEqual(before);
        shapes.push(digest(a).find(mesh => mesh.name === 'hands.hour.body')!.positions);
        expect(a.root.position.toArray()).toEqual([0, 0, 0]); expect(a.root.scale.toArray()).toEqual([1, 1, 1]);
        expect(a.root.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
      } finally { a.dispose(); b.dispose(); }
    }
    expect(new Set(shapes).size).toBe(4);
  });

  it('[ASSET-PARTS] keeps all three XY pivots at center and points geometry toward three o’clock, with fractional regression time', () => {
    for (const id of handIds) {
      const a = createHandSet(handInput(id));
      try {
        for (const [role, degrees] of [['hour', -305.25], ['minute', -63], ['second', -180]] as const) {
          const p = a.root.getObjectByName(`hands.${role}.pivot`)!;
          expect(p.position.x).toBe(0); expect(p.position.y).toBe(0);
          expect(p.rotation.z).toBeCloseTo(degrees * Math.PI / 180, 12);
        }
        for (const [role, time, tip] of [
          ['hour', { hour: 3, minute: 0, second: 0 }, 9.6],
          ['minute', { hour: 0, minute: 15, second: 0 }, 12.35],
          ['second', { hour: 0, minute: 0, second: 15 }, 13.1],
        ] as const) {
          a.setPresentation(time); a.root.updateMatrixWorld(true);
          const body = a.root.getObjectByName(`hands.${role}.body`) as THREE.Mesh;
          const pos = body.geometry.getAttribute('position');
          const front = Array.from({ length: pos.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, i))
            .sort((p, q) => q.y - p.y)[0].applyMatrix4(body.matrixWorld);
          expect(front.x).toBeCloseTo(tip, 1); expect(Math.abs(front.y)).toBeLessThan(.08);
          body.geometry.computeBoundingBox();
          expect(body.geometry.boundingBox!.min.y).toBeGreaterThan(-3.2);
        }
      } finally { a.dispose(); }
    }
  });

  it('[ASSET-PARTS] does not alias variants, retain mutable inputs or release another view’s resources', () => {
    const input = handInput('dauphine'), a = createHandSet(input), b = createHandSet(input);
    const resources = (asset: HandAsset) => {
      const set = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
      asset.pickables.forEach(mesh => {
        set.add(mesh.geometry);
        const m = mesh.material as THREE.MeshStandardMaterial; set.add(m);
        if (m.roughnessMap) set.add(m.roughnessMap);
      }); return set;
    };
    const ownedA = resources(a), ownedB = resources(b), disposed = new Map<object, number>();
    [...ownedA, ...ownedB].forEach(resource => resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1)));
    expect([...ownedA].some(resource => ownedB.has(resource))).toBe(false);
    const aMesh = a.pickables[0], bMesh = b.pickables[0];
    const bGeometry = checksum(bMesh.geometry.getAttribute('position').array);
    (aMesh.material as THREE.MeshStandardMaterial).color.set('#ff0000');
    aMesh.geometry.getAttribute('position').setX(0, 100);
    expect(checksum(bMesh.geometry.getAttribute('position').array)).toBe(bGeometry);
    expect((bMesh.material as THREE.MeshStandardMaterial).color.getHexString()).not.toBe('ff0000');
    (input.component as { id: string }).id = 'changed-after-construction';
    expect(b.root.userData.semanticId).not.toBe(input.component.id);
    const scene = new THREE.Scene(); scene.add(a.root, b.root);
    a.dispose(); a.dispose();
    expect(a.root.parent).toBeNull(); expect(a.pickables).toHaveLength(0); expect(a.root.children).toHaveLength(0);
    ownedA.forEach(resource => expect(disposed.get(resource)).toBe(1));
    ownedB.forEach(resource => expect(disposed.has(resource)).toBe(false));
    expect(b.root.parent).toBe(scene);
    b.dispose(); ownedB.forEach(resource => expect(disposed.get(resource)).toBe(1));
    expect(() => a.setPresentation({ hour: 0, minute: 0, second: 0 })).toThrow('disposed');
  });

  it('[ASSET-PARTS] rejects unsupported IDs, units, versions and component descriptors instead of substituting', () => {
    const input = handInput();
    for (const patch of [
      { units: 'm' }, { recipeId: 'baton' }, { recipeId: 'toString' }, { recipeVersion: 'next' },
      { finishId: 'missing' }, { finishId: 'toString' }, { finishId: 'woven-textile-look' }, { finishVersion: 'next' },
      { component: { role: 'dial', id: input.component.id } }, { component: { role: 'hands', id: 'not-a-uuid' } },
    ]) expect(() => createHandSet({ ...input, ...patch } as HandSetInput)).toThrow();
    const valid = createHandSet(input); checkAsset(valid, input.component.id); valid.dispose();
  });

  it('[ASSET-PARTS] rejects bad presentation atomically and leaves the previous poses/geometry unchanged', () => {
    const a = createHandSet(handInput()), before = digest(a);
    const pose = () => ['hour', 'minute', 'second'].map(role => a.root.getObjectByName(`hands.${role}.pivot`)!.rotation.z);
    const previous = pose();
    for (const time of [{ hour: 24, minute: 0, second: 0 }, { hour: 0, minute: -1, second: 0 },
      { hour: 0, minute: 0, second: 60 }, { hour: 1.5, minute: 0, second: 0 },
      { hour: 0, minute: 0, second: NaN }, { hour: 0, minute: 0, second: Infinity }]) {
      expect(() => a.setPresentation(time)).toThrow('Invalid'); expect(pose()).toEqual(previous);
    }
    a.setPresentation({ hour: 12, minute: 0, second: 0 }); expect(pose()).not.toEqual(previous);
    expect(digest(a)).toEqual(before); a.dispose();
  });

  it('[ASSET-PARTS] releases partially constructed materials/maps and the first hand when a later contour fails', () => {
    const geometryDisposal = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const materialDisposal = vi.spyOn(THREE.Material.prototype, 'dispose');
    const textureDisposal = vi.spyOn(THREE.Texture.prototype, 'dispose');
    const bezier = THREE.Shape.prototype.bezierCurveTo;
    let calls = 0;
    const failure = vi.spyOn(THREE.Shape.prototype, 'bezierCurveTo').mockImplementation(function (this: THREE.Shape, ...args) {
      if (++calls === 3) throw new Error('seeded second-hand contour failure');
      return bezier.apply(this, args);
    });
    try {
      expect(() => createHandSet(handInput('spade'))).toThrow('seeded second-hand contour failure');
      expect(geometryDisposal).toHaveBeenCalledTimes(1);
      expect(materialDisposal).toHaveBeenCalledTimes(3);
      expect(textureDisposal).toHaveBeenCalledTimes(1);
    } finally { failure.mockRestore(); geometryDisposal.mockRestore(); materialDisposal.mockRestore(); textureDisposal.mockRestore(); }
    const valid = createHandSet(handInput('spade')); checkAsset(valid, handInput().component.id); valid.dispose();
  });

  it('[ASSET-PARTS] proves geometry and mapping checkers reject seeded faults with the valid control still passing', () => {
    const a = createHandSet(handInput()); checkAsset(a, handInput().component.id);
    a.pickables[0].userData.semanticId = 'wrong';
    expect(() => checkAsset(a, handInput().component.id)).toThrow();
    a.pickables[0].userData.semanticId = handInput().component.id;
    a.pickables[0].geometry.getAttribute('position').setX(0, NaN);
    expect(() => checkAsset(a, handInput().component.id)).toThrow(); a.dispose();
  });
});

describe('five original part appearances', () => {
  it('[ASSET-PARTS] requires the exact inventory and deterministically owns bounded non-color maps per instance', () => {
    expect(Object.keys(finishRecipes)).toEqual([...finishIds]);
    expect(FINISH_VERSION).toBe('atelier-part-finishes-1.0.0');
    const colors = new Set<number>();
    for (const id of finishIds) {
      const a = createFinish(id, FINISH_VERSION), b = createFinish(id, FINISH_VERSION);
      expect(a.material).not.toBe(b.material); colors.add(a.material.color.getHex());
      const map = a.material.roughnessMap as THREE.DataTexture | null;
      if (map) {
        const other = b.material.roughnessMap as THREE.DataTexture;
        expect(map).not.toBe(other); expect(map.image.data).not.toBe(other.image.data);
        expect(map.image.data).not.toBeNull(); expect(other.image.data).not.toBeNull();
        expect(checksum(map.image.data!)).toEqual(checksum(other.image.data!));
        expect([map.image.width, map.image.height]).toEqual([128, 128]);
        expect(map.colorSpace).toBe(THREE.NoColorSpace);
        expect(map.generateMipmaps).toBe(true);
      }
      let count = 0, materialCount = 0;
      map?.addEventListener('dispose', () => count++);
      a.material.addEventListener('dispose', () => materialCount++);
      a.dispose(); a.dispose(); expect(count).toBe(map ? 1 : 0); expect(materialCount).toBe(1);
      expect(a.material.roughnessMap).toBeNull(); b.dispose();
    }
    expect(colors.size).toBe(5);
    expect(() => createFinish('missing' as FinishId, FINISH_VERSION)).toThrow('Unsupported');
    expect(() => createFinish('toString' as FinishId, FINISH_VERSION)).toThrow('Unsupported');
    expect(() => createFinish('titanium-look', 'wrong' as typeof FINISH_VERSION)).toThrow('version');
  });
});
