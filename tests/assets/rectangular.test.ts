import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import * as finishes from '../../src/render/assets/materials';
import { createRectangularAsset, insideRectangle } from '../../src/render/assets/rectangular-watch';
import { rectangularArtwork, rectangularArtworkKey, rectangularRecipes, rectanglePoint, requireProjection } from '../../src/render/assets/rectangular-recipes';
import { rectangleFixture, rectangleInput } from './rectangular-fixture';

const bounds = (m: THREE.Object3D) => { m.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(m); };
function check(a: ReturnType<typeof createRectangularAsset>, p: ReturnType<typeof rectangleFixture>) {
  const r = rectangularRecipes[p.assetId], ids = [...p.components.map(c => c.id), ...p.texts.map(t => t.id), p.indices.id, p.track.id];
  expect(a.pickables.every(m => ids.includes(m.userData.semanticId))).toBe(true);
  for (const m of a.pickables) {
    const role = m.name.startsWith('crown.') ? 'case' : m.name.startsWith('attachment.') ? 'strap' : m.name.split('.')[0];
    const expected = role === 'text' ? p.texts[Number(m.name.split('.')[1])].id : role === 'indices' ? p.indices.id :
      role === 'track' ? p.track.id : p.components.find(c => c.role === role)!.id;
    expect(m.userData.semanticId, m.name).toBe(expected);
  }
  expect(a.regions.get('text.0')!.userData.semanticId).toBe(p.texts[0].id);
  expect(a.regions.get('indices.3')!.userData.semanticId).toBe(p.indices.id);
  expect(a.regions.get('hands.hour.pivot')!.position.x).toBe(0);
  expect(a.regions.has('hands.seconds.pivot')).toBe(false);
  for (const mesh of a.pickables) expect(Array.from(mesh.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
  const head = bounds(a.regions.get('bezel.frame')!); expect(head.max.x - head.min.x).toBeCloseTo(r.width, 5); expect(head.max.y - head.min.y).toBeCloseTo(r.height, 5);
  expect(bounds(a.regions.get('case.back')!).min.z).toBeCloseTo(4.25 - r.thickness, 5);
  for (const sy of [-1, 1]) {
    const anchor = bounds(a.regions.get(`attachment.${sy}`)!), strap = bounds(a.regions.get(r.strap === 'leather' ? `strap.${sy}` : `strap.${sy}.0.center`)!);
    for (const axis of ['x', 'y', 'z'] as const) expect(Math.min(anchor.max[axis], strap.max[axis]) - Math.max(anchor.min[axis], strap.min[axis])).toBeGreaterThan(.1);
    if (r.strap === 'bracelet') for (let row = 0; row < 9; row++) {
      const crossbar = bounds(a.regions.get(`strap.${sy}.${row}.crossbar`)!);
      for (const part of ['left', 'center', 'right']) {
        const link = bounds(a.regions.get(`strap.${sy}.${row}.${part}`)!);
        for (const axis of ['x', 'y', 'z'] as const) expect(Math.min(crossbar.max[axis], link.max[axis]) - Math.max(crossbar.min[axis], link.min[axis])).toBeGreaterThan(.1);
        if (row) {
          const prior = bounds(a.regions.get(`strap.${sy}.${row - 1}.${part}`)!);
          for (const axis of ['x', 'y', 'z'] as const)
            expect(Math.min(prior.max[axis], link.max[axis]) - Math.max(prior.min[axis], link.min[axis])).toBeGreaterThan(.1);
        }
      }
    }
  }
}

describe('rectangular first family', () => {
  it('[M1-17] exact original/reference recipes and deterministic dimensions, attachments and pivots', () => {
    expect(Object.keys(rectangularRecipes)).toEqual(['atelier-rectangle-01', 'cartier-tank-wsta0106']);
    for (const assetId of Object.keys(rectangularRecipes) as (keyof typeof rectangularRecipes)[]) {
      const p = rectangleFixture(assetId), input = rectangleInput(p), before = JSON.stringify(p), a = createRectangularAsset(input), b = createRectangularAsset(input);
      check(a, p); check(b, p); expect(JSON.stringify(p)).toBe(before);
      expect(a.pickables.map(m => Array.from(m.geometry.getAttribute('position').array))).toEqual(b.pickables.map(m => Array.from(m.geometry.getAttribute('position').array)));
      for (const turn of [0, .25, .5, .75]) {
        const [x, y] = rectanglePoint(turn, 9, 12); expect(insideRectangle(x, y, 20, 26)).toBe(true);
      }
      expect(rectanglePoint(.25, 9, 12)[0]).toBeCloseTo(9, 10);
      for (let i = 0; i < 60; i++) {
        a.update({ ...input, projection: { ...p, presentation: { hour: i % 12, minute: i, second: 0 } } });
        for (const hand of ['hour', 'minute']) {
          const blade = a.regions.get(`hands.${hand}.blade`) as THREE.Mesh; blade.updateWorldMatrix(true, false);
          const positions = blade.geometry.getAttribute('position');
          for (let j = 0; j < positions.count; j++) {
            const v = new THREE.Vector3().fromBufferAttribute(positions, j).applyMatrix4(blade.matrixWorld);
            expect(insideRectangle(v.x, v.y, rectangularRecipes[assetId].dialWidth, rectangularRecipes[assetId].dialHeight)).toBe(true);
          }
        }
      }
      a.update({ ...input, projection: { ...p, presentation: { hour: 3, minute: 0, second: 0 } } });
      const hour = a.regions.get('hands.hour.pivot')!; hour.updateWorldMatrix(true, false);
      expect(new THREE.Vector3(0, 6.8, 0).applyMatrix4(hour.matrixWorld).x).toBeCloseTo(6.8, 5);
      a.dispose(); b.dispose(); input.artwork.texture.dispose();
    }
  });
  it('[M1-02][M1-16] semantic edits update the intended projection without rebuilding case or mutating another view', () => {
    const p = rectangleFixture(), input = rectangleInput(p), a = createRectangularAsset(input), b = createRectangularAsset(input);
    const body = a.regions.get('case.body'), bBefore = JSON.stringify(b.root.userData);
    const changed = structuredClone(p); changed.texts[0].text = 'CUSTOM'; changed.dialColor = '#aecdc9'; changed.indices.length = 2.4; changed.track.visible = false;
    const next = rectangleInput(changed); a.update(next);
    expect(a.regions.get('case.body')).toBe(body); expect(a.root.userData.artworkKey).toBe(rectangularArtworkKey(changed));
    expect(a.regions.has('track.tick.1')).toBe(false); expect(JSON.stringify(b.root.userData)).toBe(bBefore);
    expect(a.regions.get('text.0')!.userData.semanticId).toBe(p.texts[0].id);
    expect(rectangularArtwork(p).texts[0].text).not.toBe(rectangularArtwork(changed).texts[0].text);
    a.update(input); expect(a.regions.has('track.tick.1')).toBe(true); a.dispose(); b.dispose(); input.artwork.texture.dispose(); next.artwork.texture.dispose();
  });
  it('[M1-09][M1-16] missing, stale and wrongly mapped artwork reject; a valid retry works', () => {
    const p = rectangleFixture(), input = rectangleInput(p), a = createRectangularAsset(input), before = JSON.stringify(a.root.userData);
    for (const patch of [{ ready: false }, { key: 'stale' }, { texture: undefined }, { bounds: input.artwork.bounds.slice(1) },
      { bounds: input.artwork.bounds.map((b, i) => i ? b : { ...b, semanticId: p.indices.id }) },
      { bounds: input.artwork.bounds.map((b, i) => i ? b : { ...b, x: b.x + 1 }) }]) {
      expect(() => a.update({ ...input, artwork: { ...input.artwork, ...patch } } as typeof input)).toThrow(); expect(JSON.stringify(a.root.userData)).toBe(before);
    }
    expect(() => requireProjection({ ...p, units: 'm' })).toThrow(); expect(() => requireProjection({ ...p, version: 'wrong' })).toThrow();
    expect(() => requireProjection({ ...p, indices: { ...p.indices, style: 'dot' } })).toThrow();
    expect(() => requireProjection({ ...p, appearance: { ...p.appearance, bezel: { ...p.appearance.bezel, style: 'solid' } } })).toThrow();
    a.update(input); a.dispose(); input.artwork.texture.dispose();
  });
  it('[M1-16] partial constructor failure releases prepared materials and geometry, then a valid retry works', () => {
    const p = rectangleFixture(); p.appearance.caseMaterial = 'bronze-look'; const input = rectangleInput(p);
    let borrowed = 0, materialDisposed = 0, geometryDisposed = 0, calls = 0;
    input.artwork.texture.addEventListener('dispose', () => borrowed++);
    const realFinish = finishes.createFinish, realAdd = THREE.Object3D.prototype.add, realDispose = THREE.BufferGeometry.prototype.dispose;
    const materialSpy = vi.spyOn(finishes, 'createFinish').mockImplementation((id, v) => {
      const f = realFinish(id, v); f.material.addEventListener('dispose', () => materialDisposed++); return f;
    });
    const geometrySpy = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(function (this: THREE.BufferGeometry) {
      geometryDisposed++; realDispose.call(this);
    });
    const assemblySpy = vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function (this: THREE.Object3D, ...objects: THREE.Object3D[]) {
      if (++calls === 3) throw new Error('seeded scene assembly failure'); return realAdd.apply(this, objects);
    });
    try {
      expect(() => createRectangularAsset(input)).toThrow('seeded scene assembly');
      expect(materialDisposed).toBe(1); expect(geometryDisposed).toBe(3); expect(borrowed).toBe(0);
    } finally { materialSpy.mockRestore(); geometrySpy.mockRestore(); assemblySpy.mockRestore(); }
    const retry = createRectangularAsset(input); check(retry, p); retry.dispose(); expect(borrowed).toBe(0); input.artwork.texture.dispose();
  });
  it('[M1-02] retained Roman sequence and orientation remain explicit editable pattern data', () => {
    const p = rectangleFixture('cartier-tank-wsta0106'), records = rectangularArtwork(p).texts.filter(t => t.regionId.startsWith('indices.'));
    expect(records.map(t => t.text)).toEqual(['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']);
    records.forEach((t, i) => { expect(t.rotation).toBeCloseTo(-i * Math.PI / 6, 10); expect(t.semanticId).toBe(p.indices.id); });
    expect(records[3].x).toBeGreaterThan(0); expect(records[3].y).toBeCloseTo(0, 10);
    expect(records[6].y).toBeLessThan(0); expect(records[9].x).toBeLessThan(0);
  });
  it('[M1-16] staged finish failure is atomic and disposal preserves borrowed maps and other instances', () => {
    const p = rectangleFixture('cartier-tank-wsta0106'), input = rectangleInput(p), a = createRectangularAsset(input), b = createRectangularAsset(input);
    const before = a.regions.get('case.body') as THREE.Mesh, material = before.material, manifest = JSON.stringify(a.root.userData);
    let disposed = 0, borrowed = 0; input.artwork.texture.addEventListener('dispose', () => borrowed++);
    const changed = structuredClone(p); changed.appearance.caseMaterial = 'bronze-look'; changed.appearance.braceletMaterial = 'titanium-look';
    const real = finishes.createFinish; let calls = 0;
    const spy = vi.spyOn(finishes, 'createFinish').mockImplementation((id, v) => {
      if (++calls === 2) throw new Error('seeded finish failure'); const f = real(id, v); f.material.addEventListener('dispose', () => disposed++); return f;
    });
    expect(() => a.update({ ...input, projection: changed })).toThrow('seeded'); expect(before.material).toBe(material); expect(JSON.stringify(a.root.userData)).toBe(manifest); expect(disposed).toBe(1); expect(borrowed).toBe(0); spy.mockRestore();
    a.update({ ...input, projection: changed }); expect(before.material).not.toBe(material); expect((b.regions.get('case.body') as THREE.Mesh).material).not.toBe(before.material);
    a.update(input); a.dispose(); a.dispose(); expect(borrowed).toBe(0); check(b, p); b.dispose(); input.artwork.texture.dispose(); expect(borrowed).toBe(1);
  });
  it('[M1-16] case and bracelet finishes are independent; all editable visual differences are labeled custom', () => {
    const p = rectangleFixture('cartier-tank-wsta0106'), input = rectangleInput(p), a = createRectangularAsset(input);
    const colorOf = (name: string) => ((a.regions.get(name) as THREE.Mesh).material as THREE.MeshPhysicalMaterial).color.getHex();
    const baseline = [colorOf('case.body'), colorOf('strap.1.0.center'), colorOf('hands.pin')];
    const caseOnly = structuredClone(p); caseOnly.appearance.caseMaterial = 'champagne-gold-look'; a.update({ ...input, projection: caseOnly });
    expect(colorOf('case.body')).not.toBe(baseline[0]); expect(colorOf('strap.1.0.center')).toBe(baseline[1]); expect(colorOf('hands.pin')).toBe(baseline[2]);
    const strapOnly = structuredClone(p); strapOnly.appearance.braceletMaterial = 'bronze-look'; a.update({ ...input, projection: strapOnly });
    expect(colorOf('case.body')).toBe(baseline[0]); expect(colorOf('strap.1.0.center')).not.toBe(baseline[1]);
    a.update(input); expect(a.root.userData.customized).toBe(false);
    for (const field of ['position', 'size', 'trackColor']) {
      const next = structuredClone(p); if (field === 'position') next.texts[0].x = .5;
      if (field === 'size') next.texts[0].size = 1.4; if (field === 'trackColor') next.track.color = '#124321';
      const changed = rectangleInput(next); a.update(changed); expect(a.root.userData.customized).toBe(true); a.update(input); changed.artwork.texture.dispose();
    }
    a.dispose(); input.artwork.texture.dispose();
  });
  it('[M1-20] seeded wrong identity and disconnected attachment fail actual checks', () => {
    const p = rectangleFixture(), input = rectangleInput(p), a = createRectangularAsset(input); check(a, p);
    a.pickables[0].userData.semanticId = p.indices.id; expect(() => check(a, p)).toThrow(); a.pickables[0].userData.semanticId = p.components.find(c => c.role === 'case')!.id;
    a.regions.get('strap.1')!.position.x = 50; expect(() => check(a, p)).toThrow(); a.dispose(); input.artwork.texture.dispose();
  });
  it('[ASSET-PROVENANCE] rectangular registry binds actual sources and dependencies and rejects a missing dependency', () => {
    const registry = JSON.parse(readFileSync('docs/assets/rectangular-registry.json', 'utf8'));
    const records = [...registry.geometrySources, ...registry.dependencies] as { path: string; sha256: string }[];
    const check = (files: typeof records) => files.forEach(f => expect(createHash('sha256').update(readFileSync(f.path)).digest('hex'), f.path).toBe(f.sha256));
    expect(registry.assets.map((a: { assetId: string }) => a.assetId)).toEqual(Object.keys(rectangularRecipes));
    expect(records).toHaveLength(9); check(records);
    expect(() => check([...records, { path: 'public/fonts/missing-family-dependency.woff2', sha256: 'missing' }])).toThrow();
    expect(() => check(records.map((r, i) => i ? r : { ...r, sha256: 'wrong' }))).toThrow();
  });
});
