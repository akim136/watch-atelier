import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createModelStudy, type ModelStudyInput } from '../../src/render/assets/model-studies';
import { modelStudyRecipes, STUDY_PRESENTATION, studyText, studyArtworkKey } from '../../src/render/assets/model-recipes';
import { studyInput } from './brand-fixture';

const ids = ['gmt-master-ii', 'submariner', 'day-date', 'daytona', 'royal-oak', 'nautilus'] as const;
const hash = (values: ArrayLike<number>) => createHash('sha256').update(JSON.stringify(Array.from(values))).digest('hex');
const retireInput = (i: ModelStudyInput) => { i.artwork.dial.dispose(); i.artwork.bezel.dispose(); };
function bounds(mesh: THREE.Object3D) { mesh.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(mesh); }
function checkStudy(asset: ReturnType<typeof createModelStudy>, input: ModelStudyInput) {
  expect(asset.root.userData.studyId).toBe(input.studyId);
  expect(asset.regions.size).toBeGreaterThan(150);
  expect(new Set(asset.pickables.map(m => m.name)).size).toBe(asset.pickables.length);
  const componentIds = input.components.map(c => c.id);
  for (const mesh of asset.pickables) {
    expect(componentIds).toContain(mesh.userData.semanticId); expect(mesh.userData.regionId).toBe(mesh.name);
    const pos = mesh.geometry.getAttribute('position'); expect(pos.count).toBeGreaterThan(2);
    expect(Array.from(pos.array).every(Number.isFinite)).toBe(true);
    const normals = mesh.geometry.getAttribute('normal'); expect(normals.count).toBe(pos.count);
    expect(Array.from(normals.array).every(Number.isFinite)).toBe(true);
  }
  const all = bounds(asset.root);
  expect(all.min.x).toBeGreaterThan(-25); expect(all.max.x).toBeLessThan(26);
  expect(all.min.y).toBeGreaterThan(-45); expect(all.max.y).toBeLessThan(45);
  expect(all.min.z).toBeGreaterThan(-6); expect(all.max.z).toBeLessThan(6);
  const body = asset.regions.get('case.body') as THREE.Mesh, normals = body.geometry.getAttribute('normal');
  expect(Array.from({ length: normals.count }, (_, i) => normals.getZ(i)).some(z => z > .9)).toBe(true);
  expect(Array.from({ length: normals.count }, (_, i) => normals.getZ(i)).some(z => z < -.9)).toBe(true);
  // Real geometric overlap at fixed attachment stations, not a mere node-name count.
  for (const sy of [-1, 1]) {
    const anchor = asset.regions.get(modelStudyRecipes[input.studyId].family === 'round'
      ? `case.lug.1.${sy}` : `case.integrated-attachment.${sy}`)!;
    const bracelet = asset.regions.get(`bracelet.${sy > 0 ? 'upper' : 'lower'}`)!;
    const head = bounds(anchor), strap = bounds(bracelet);
    expect(Math.min(head.max.y, strap.max.y) - Math.max(head.min.y, strap.min.y)).toBeGreaterThan(.5);
    expect(Math.min(head.max.z, strap.max.z) - Math.max(head.min.z, strap.min.z)).toBeGreaterThan(.5);
  }
}

describe('six named exterior model studies', () => {
  it('[ASSET-MODELS] requires all six actual distinct recipes with finite geometry, component mappings and connected attachments', () => {
    expect(Object.keys(modelStudyRecipes)).toEqual([...ids]);
    const fingerprints = new Set<string>();
    for (const id of ids) {
      const input = studyInput(id), before = JSON.stringify({ ...input, artwork: undefined });
      const a = createModelStudy(input), b = createModelStudy(input);
      try {
        checkStudy(a, input); checkStudy(b, input);
        const geometry = (asset: typeof a) => asset.pickables.map(m => [m.name, hash(m.geometry.getAttribute('position').array)]);
        expect(geometry(a)).toEqual(geometry(b)); fingerprints.add(JSON.stringify(geometry(a)));
        expect(JSON.stringify({ ...input, artwork: undefined })).toBe(before);
      } finally { a.dispose(); b.dispose(); retireInput(input); }
    }
    expect(fingerprints.size).toBe(6);
  });

  it('[ASSET-MODELS] renders the declared complication roles and their actual hand angles; no-date and no-chronograph controls', () => {
    for (const id of ids) {
      const input = studyInput(id), a = createModelStudy(input), names = [...a.regions.keys()];
      try {
        expect(names.includes('calendar.date-paper')).toBe(['gmt-master-ii', 'day-date', 'royal-oak', 'nautilus'].includes(id));
        expect(names.includes('calendar.day-paper')).toBe(id === 'day-date');
        expect(names.includes('hands.gmt.pivot')).toBe(id === 'gmt-master-ii');
        expect(names.includes('hands.running-seconds.pivot')).toBe(id !== 'daytona');
        expect(names.includes('hands.chronograph-seconds.pivot')).toBe(id === 'daytona');
        expect(names.filter(n => /^chronograph.pusher/.test(n))).toHaveLength(id === 'daytona' ? 2 : 0);
        expect(names.filter(n => /^counter\..+\.ring$/.test(n))).toHaveLength(id === 'daytona' ? 3 : 0);
        if (id === 'gmt-master-ii') expect(a.regions.get('hands.gmt.pivot')!.rotation.z).toBeCloseTo(-(16 + 10 / 60) / 24 * 2 * Math.PI, 12);
        if (id === 'daytona') {
          expect(a.regions.get('hands.chronograph-seconds.pivot')!.rotation.z).toBeCloseTo(-37 / 60 * 2 * Math.PI, 12);
          expect(a.regions.get('counter.running-seconds.hand.pivot')!.rotation.z).toBeCloseTo(-Math.PI, 12);
          expect(a.regions.get('counter.minutes.hand.pivot')!.rotation.z).toBeCloseTo(-(17 + 37 / 60) / 30 * 2 * Math.PI, 12);
          expect(a.regions.get('counter.hours.hand.pivot')!.rotation.z).toBeCloseTo(-(2 + 17 / 60 + 37 / 3600) / 12 * 2 * Math.PI, 12);
        }
      } finally { a.dispose(); retireInput(input); }
    }
  });

  it('[ASSET-MODELS] keeps retained branding/calendar text separate from derived textures and rejects invalid study/presentation keys', () => {
    for (const id of ids) {
      const before = JSON.stringify(STUDY_PRESENTATION), texts = studyText(id, STUDY_PRESENTATION);
      expect(texts.some(t => t.regionId === 'brand.wordmark')).toBe(true);
      expect(new Set(texts.map(t => t.regionId)).size).toBe(texts.length);
      expect(texts.some(t => t.regionId === 'calendar.date')).toBe(modelStudyRecipes[id].date);
      expect(JSON.stringify(STUDY_PRESENTATION)).toBe(before);
      const changed = studyText(id, { ...STUDY_PRESENTATION, date: 28 });
      if (modelStudyRecipes[id].date) expect(changed.find(t => t.regionId === 'calendar.date')!.text).toBe('28');
    }
    expect(() => studyArtworkKey('submariner', { ...STUDY_PRESENTATION, second: 60 })).toThrow();
    expect(() => studyArtworkKey('submariner', { ...STUDY_PRESENTATION, elapsedSeconds: -1 })).toThrow();
    const counters = studyText('daytona', STUDY_PRESENTATION);
    const ten = counters.find(t => t.regionId === 'counter.minutes.label.right')!;
    expect(ten.x).toBeCloseTo(6.55 + 2.47 * Math.sqrt(3) / 2, 8); expect(ten.y).toBeCloseTo(-1.235, 8);
    const forty = counters.find(t => t.regionId === 'counter.running-seconds.label.bottom')!;
    expect(forty.x).toBeCloseTo(-2.47 * Math.sqrt(3) / 2, 8); expect(forty.y).toBeCloseTo(-6.65 - 1.235, 8);
  });

  it('[ASSET-MODELS] never mutates/disposes borrowed maps, rejects missing and incompatible artwork, and isolates owned materials', () => {
    const input = studyInput('royal-oak'), a = createModelStudy(input), b = createModelStudy(input);
    let borrowedDisposals = 0, aDisposals = 0, bDisposals = 0, instanceDisposals = 0;
    (a.regions.get('dial.tapisserie') as THREE.InstancedMesh).addEventListener('dispose', () => instanceDisposals++);
    input.artwork.dial.addEventListener('dispose', () => borrowedDisposals++);
    input.artwork.bezel.addEventListener('dispose', () => borrowedDisposals++);
    const owned = (asset: typeof a) => new Set(asset.pickables.flatMap(m => [m.geometry, m.material as THREE.Material]));
    owned(a).forEach(r => r.addEventListener('dispose', () => aDisposals++));
    owned(b).forEach(r => r.addEventListener('dispose', () => bDisposals++));
    const before = [input.artwork.dial.version, input.artwork.bezel.version, input.artwork.dial.colorSpace];
    const aMaterial = a.pickables[0].material as THREE.MeshStandardMaterial, bMaterial = b.pickables[0].material as THREE.MeshStandardMaterial;
    expect(aMaterial).not.toBe(bMaterial); aMaterial.color.set('#ff0000'); expect(bMaterial.color.getHexString()).not.toBe('ff0000');
    const count = owned(a).size; a.dispose(); a.dispose(); expect(aDisposals).toBe(count); expect(bDisposals).toBe(0); expect(borrowedDisposals).toBe(0);
    expect(instanceDisposals).toBe(1);
    for (const patch of [{ units: 'm' }, { studyId: 'toString' }, { version: 'missing' },
      { artwork: { ...input.artwork, ready: false } }, { artwork: { ...input.artwork, key: studyArtworkKey('nautilus', input.presentation) } },
      { artwork: { ...input.artwork, dial: undefined } }, { presentation: { ...input.presentation, date: 20 } }]) {
      expect(() => createModelStudy({ ...input, ...patch } as ModelStudyInput)).toThrow();
    }
    expect([input.artwork.dial.version, input.artwork.bezel.version, input.artwork.dial.colorSpace]).toEqual(before);
    expect(borrowedDisposals).toBe(0); b.dispose(); expect(bDisposals).toBeGreaterThan(0); expect(borrowedDisposals).toBe(0);
    retireInput(input); expect(borrowedDisposals).toBe(2);
  });

  it('[ASSET-MODELS] seeded identity corruption and disconnected bracelets fail real checkers', () => {
    const input = studyInput('submariner'), a = createModelStudy(input); checkStudy(a, input);
    a.pickables[0].userData.semanticId = 'wrong'; expect(() => checkStudy(a, input)).toThrow();
    a.pickables[0].userData.semanticId = input.components.find(c => c.role === 'case')!.id;
    a.regions.get('bracelet.upper')!.position.y = 20; expect(() => checkStudy(a, input)).toThrow();
    a.dispose(); retireInput(input);
  });
});
