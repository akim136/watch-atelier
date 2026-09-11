import * as THREE from 'three';
import { createFinish, FINISH_VERSION, type HandFinishId } from './materials';
import { rectangularRecipes, rectangularArtwork, rectangularArtworkKey, rectangularInstanceKey, requireProjection,
  RECTANGLE_VERSION, RECTANGLE_MATERIAL_VERSION, type RectangularProjection } from './rectangular-recipes';

export interface RectangularBounds { readonly regionId: string; readonly semanticId: string;
  readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface RectangularInput {
  readonly projection: unknown;
  readonly artwork: { readonly ready: boolean; readonly key: string; readonly texture: THREE.Texture;
    readonly bounds: readonly RectangularBounds[] };
}
function shape(w: number, h: number, r: number) {
  const s = new THREE.Shape(), x = w / 2, y = h / 2;
  s.moveTo(-x + r, y); s.lineTo(x - r, y); s.quadraticCurveTo(x, y, x, y - r);
  s.lineTo(x, -y + r); s.quadraticCurveTo(x, -y, x - r, -y); s.lineTo(-x + r, -y);
  s.quadraticCurveTo(-x, -y, -x, -y + r); s.lineTo(-x, y - r); s.quadraticCurveTo(-x, y, -x + r, y); s.closePath(); return s;
}
function solid(w: number, h: number, radius: number, depth: number, bevel = .15) {
  const geometry = new THREE.ExtrudeGeometry(shape(w - bevel * 2, h - bevel * 2, radius),
    { depth: depth - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 16 });
  geometry.translate(0, 0, bevel); return geometry;
}
export function insideRectangle(x: number, y: number, w: number, h: number, radius = .65) {
  if (Math.abs(x) > w / 2 || Math.abs(y) > h / 2) return false;
  return Math.hypot(Math.max(0, Math.abs(x) - w / 2 + radius), Math.max(0, Math.abs(y) - h / 2 + radius)) <= radius + 1e-6;
}
function validate(input: RectangularInput) {
  const p = requireProjection(input.projection), r = rectangularRecipes[p.assetId], a = input.artwork;
  const image = a?.texture?.image as { width?: unknown; height?: unknown } | undefined;
  if (!a?.ready || a.key !== rectangularArtworkKey(p) || !a.texture?.isTexture || a.texture.colorSpace !== THREE.SRGBColorSpace ||
    typeof image?.width !== 'number' || !Number.isInteger(image.width) || image.width < 2 || image.width > 2048 || image.width !== image.height) throw new Error('Missing, stale or invalid rectangular artwork.');
  const records = rectangularArtwork(p), expected = new Map([...records.texts.filter(t => t.text), ...records.lines].map(t => [t.regionId,
    { semanticId: t.semanticId, x: 'x' in t ? t.x : (t.x1 + t.x2) / 2, y: 'y' in t ? t.y : (t.y1 + t.y2) / 2 }]));
  if (!Array.isArray(a.bounds) || a.bounds.length !== expected.size || new Set(a.bounds.map(b => b.regionId)).size !== expected.size) throw new Error('Missing or duplicate artwork mappings.');
  for (const b of a.bounds) {
    const record = expected.get(b.regionId);
    if (!record || record.semanticId !== b.semanticId || Math.abs(record.x - b.x) > 1e-6 || Math.abs(record.y - b.y) > 1e-6 ||
      ![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.width <= 0 || b.height <= 0 ||
      ![-1, 1].every(sx => [-1, 1].every(sy => insideRectangle(b.x + sx * b.width / 2, b.y + sy * b.height / 2, r.dialWidth, r.dialHeight)))) throw new Error('Incorrect semantic mapping or artwork outside rectangular dial.');
  }
  return p;
}
function finishes(p: RectangularProjection) {
  const owned: { dispose(): void }[] = [];
  const get = (id: string, roughness: number) => {
    if (id === 'original' || id === 'steel') {
      const m = new THREE.MeshPhysicalMaterial({ color: '#b6c1ca', metalness: .8, roughness }); owned.push(m); return m;
    }
    const f = createFinish(id as HandFinishId, FINISH_VERSION); owned.push(f); return f.material;
  };
  try {
    const body = get(p.appearance.caseMaterial, .3), rim = body.clone(); rim.roughness = Math.min(.22, body.roughness); owned.push(rim);
    const bracelet = get(p.appearance.braceletMaterial, .34), center = bracelet.clone(); center.roughness = .25; owned.push(center);
    return { body, rim, bracelet, center, dispose() { owned.forEach(o => o.dispose()); owned.length = 0; } };
  } catch (e) { owned.forEach(o => o.dispose()); throw e; }
}

/** Synchronous asset projection. Neither a saved design nor the fixed39mm WatchAsset implementation. */
export function createRectangularAsset(input: RectangularInput) {
  let accepted = validate(input), materials = finishes(accepted);
  const r = rectangularRecipes[accepted.assetId], root = new THREE.Group(), owned: { dispose(): void }[] = [];
  const pickables: THREE.Mesh[] = [], regions = new Map<string, THREE.Object3D>();
  const metalMeshes: [THREE.Mesh, 'body' | 'rim' | 'bracelet' | 'center'][] = [];
  const own = <T extends { dispose(): void }>(o: T) => { owned.push(o); return o; };
  const id = (role: string) => accepted.components.find(c => c.role === role)!.id;
  const add = (name: string, role: string, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = root, selectable = true) => {
    const mesh = new THREE.Mesh(own(g), m); mesh.name = name; mesh.position.set(x, y, z);
    mesh.userData = { semanticId: id(role), regionId: name }; parent.add(mesh); regions.set(name, mesh);
    if (selectable) pickables.push(mesh); return mesh;
  };
  const metal = (name: string, role: string, g: THREE.BufferGeometry, key: 'body' | 'rim' | 'bracelet' | 'center', x = 0, y = 0, z = 0) => {
    const mesh = add(name, role, g, materials[key], x, y, z); metalMeshes.push([mesh, key]); return mesh;
  };
  const hitMaterial = own(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
  let hitRoot = new THREE.Group(), hitMeshes: THREE.Mesh[] = [], retired = false;
  const prepareHits = (bounds: readonly RectangularBounds[]) => {
    const group = new THREE.Group(), meshes: THREE.Mesh[] = [];
    try {
      for (const b of bounds) {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(b.width, b.height), hitMaterial);
        mesh.position.set(b.x, b.y, 3.47); mesh.name = b.regionId; mesh.userData = { semanticId: b.semanticId, regionId: b.regionId };
        group.add(mesh); meshes.push(mesh);
      }
      return { group, meshes };
    } catch (e) { meshes.forEach(m => m.geometry.dispose()); group.clear(); throw e; }
  };
  const replaceHits = (next: ReturnType<typeof prepareHits>) => {
    hitRoot.removeFromParent(); hitMeshes.forEach(m => { m.geometry.dispose(); regions.delete(m.name); });
    for (const m of hitMeshes) { const at = pickables.indexOf(m); if (at >= 0) pickables.splice(at, 1); }
    hitRoot.clear(); hitRoot = next.group; hitMeshes = next.meshes; root.add(hitRoot);
    hitMeshes.forEach(m => { regions.set(m.name, m); pickables.push(m); });
  };
  const dispose = () => {
    if (retired) return; retired = true; root.removeFromParent(); hitMeshes.forEach(m => m.geometry.dispose()); hitMeshes = [];
    materials.dispose(); owned.forEach(o => o.dispose()); owned.length = 0; root.clear(); hitRoot.clear(); regions.clear(); pickables.length = 0;
  };
  try {
    const backZ = 4.25 - r.thickness;
    metal('case.body', 'case', solid(r.width - .4, r.height - .4, 1.4, 2.85 - backZ), 'body', 0, 0, backZ + .2);
    metal('case.back', 'case', solid(r.width - 2, r.height - 2.2, 1.4, .6), 'body', 0, 0, backZ);
    const ring = shape(r.width - .3, r.height - .3, 1.3), hole = new THREE.Path();
    const holeShape = shape(r.dialWidth, r.dialHeight, .65); hole.copy(holeShape); ring.holes.push(hole);
    const bezel = new THREE.ExtrudeGeometry(ring, { depth: .5, bevelEnabled: true, bevelSize: .15, bevelThickness: .15, bevelSegments: 4, curveSegments: 16 });
    metal('bezel.frame', 'bezel', bezel, 'rim', 0, 0, 3.5);
    const railWidth = (r.width - r.dialWidth) / 2 - .15;
    // Raised rails must not share the frame's front plane: coplanar faces changed
    // pixels with material/program sort order after an appearance reset.
    for (const sx of [-1, 1]) metal(`case.rail.${sx}`, 'case', solid(railWidth, r.height - .3, .85, 1.35, .12), 'rim',
      sx * (r.width / 2 - railWidth / 2 - .1), 0, 2.9);
    const dialGeometry = new THREE.ShapeGeometry(shape(r.dialWidth, r.dialHeight, .65), 32);
    const pos = dialGeometry.getAttribute('position'), uv = dialGeometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, .5 + pos.getX(i) / 32, .5 + pos.getY(i) / 32);
    const dialMaterial = own(new THREE.MeshStandardMaterial({ map: input.artwork.texture, roughness: .86, metalness: .03 }));
    add('dial.surface', 'dial', dialGeometry, dialMaterial, 0, 0, 3.45);
    const handMaterial = own(new THREE.MeshPhysicalMaterial({ color: r.hands, metalness: .7, roughness: .3 }));
    const pivots: THREE.Group[] = [];
    for (const [role, length, width, z] of [['hour', r.collection === 'reference-study' ? 5.8 : 6.8, .85, 3.72], ['minute', r.dialWidth / 2 - 2.5, .58, 3.96]] as const) {
      const pivot = new THREE.Group(); pivot.name = `hands.${role}.pivot`; pivot.position.z = z; pivot.userData = { semanticId: id('hands'), regionId: pivot.name };
      root.add(pivot); regions.set(pivot.name, pivot); pivots.push(pivot);
      const hand = new THREE.Shape(); hand.moveTo(0, -.7); hand.lineTo(-width / 2, length * .25); hand.lineTo(0, length); hand.lineTo(width / 2, length * .25); hand.closePath();
      add(`hands.${role}.blade`, 'hands', new THREE.ExtrudeGeometry(hand, { depth: .07, bevelEnabled: true, bevelSize: .018, bevelThickness: .018, bevelSegments: 2 }), handMaterial, 0, 0, 0, pivot);
    }
    const pin = new THREE.CylinderGeometry(.38, .38, .45, 32); pin.rotateX(Math.PI / 2); add('hands.pin', 'hands', pin, handMaterial, 0, 0, 3.91);
    const crown = new THREE.CylinderGeometry(1.6, 1.6, 1.9, 32); crown.rotateZ(Math.PI / 2);
    metal('case.crown', 'case', crown, 'rim', r.width / 2 + .65, 0, 1.15);
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8, flute = new THREE.BoxGeometry(1.65, .12, .12);
      metal(`crown.flute.${i}`, 'case', flute, 'body', r.width / 2 + .65, Math.sin(a) * 1.6, 1.15 + Math.cos(a) * 1.6);
    }
    if (r.collection === 'reference-study') {
      const jewel = own(new THREE.MeshPhysicalMaterial({ color: '#173a69', metalness: .05, roughness: .12, clearcoat: 1 }));
      const gem = add('crown.cabochon', 'case', new THREE.SphereGeometry(1.35, 32, 20), jewel, r.width / 2 + 1.6, 0, 1.15); gem.scale.x = .55;
    }
    const leather = own(new THREE.MeshStandardMaterial({ color: '#302d2b', roughness: .87 }));
    const stitch = own(new THREE.MeshStandardMaterial({ color: '#756c5c', roughness: 1 }));
    for (const sy of [-1, 1]) {
      const station = r.height / 2 - .7;
      metal(`attachment.${sy}`, 'strap', solid(r.strapWidth, 3, .5, 2.05, .12), 'bracelet', 0, sy * station, backZ + 1.3);
      if (r.strap === 'leather') {
        const strap = add(`strap.${sy}`, 'strap', solid(r.strapWidth, 29, 1.2, 1.65, .2), leather, 0, sy * (station + 13.4), backZ + 1.4);
        strap.userData.attachment = [0, sy * station, backZ + 2.2];
        for (const sx of [-1, 1]) for (let i = 0; i < 13; i++) add(`strap.stitch.${sy}.${sx}.${i}`, 'strap', new THREE.BoxGeometry(.075, .7, .025), stitch,
          sx * (r.strapWidth / 2 - 1.1), sy * (station + 1.8 + i * 1.8), backZ + 3.07);
      } else {
        for (let row = 0; row < 9; row++) {
          const y = station + row * 3.1, w = r.strapWidth - row * .24, z = backZ + 1.4 - row * .045;
          for (const [label, x, width, key] of [['left', -w * .36, w * .27, 'bracelet'], ['center', 0, w * .45, 'center'], ['right', w * .36, w * .27, 'bracelet']] as const)
            metal(`strap.${sy}.${row}.${label}`, 'strap', solid(width, 3.25, .5, 1.55, .12), key, x, sy * y, z);
          metal(`strap.${sy}.${row}.crossbar`, 'strap', solid(w * .82, .65, .18, .6, .08), 'bracelet', 0, sy * y, z + .4);
        }
      }
    }
    const glass = own(new THREE.MeshPhysicalMaterial({ transparent: true, opacity: .035, roughness: .1, clearcoat: .8, depthWrite: false }));
    const crystal = add('crystal', 'crystal', new THREE.ShapeGeometry(shape(r.dialWidth, r.dialHeight, .65)), glass, 0, 0, 4.25, root, false); crystal.renderOrder = 4;
    const pose = (p: RectangularProjection) => {
      pivots[0].rotation.z = -(p.presentation.hour % 12 + p.presentation.minute / 60 + p.presentation.second / 3600) * Math.PI / 6;
      pivots[1].rotation.z = -(p.presentation.minute + p.presentation.second / 60) * Math.PI / 30;
    };
    const manifest = (p: RectangularProjection) => ({ assetId: p.assetId, version: RECTANGLE_VERSION, materials: RECTANGLE_MATERIAL_VERSION,
      input: structuredClone(p), artworkKey: rectangularArtworkKey(p), realization: r.collection === 'original' ? 'original-concept' : 'reference-derived-concept',
      customized: p.dialColor !== r.dial || p.indices.color !== r.ink || p.indices.length !== 1.9 || !p.track.visible || p.track.color !== r.ink ||
        p.texts.some((t, i) => t.text !== r.text[i] || t.color !== r.ink || t.x !== 0 || t.y !== (i ? -4.1 : 3.8) || t.size !== (i ? .72 : 1.2)) ||
        p.appearance.caseMaterial !== 'original' || p.appearance.braceletMaterial !== 'original',
      reference: r.reference, source: r.source, units: 'mm', dialDatum: 3.45, physicalValidation: 'not-assessed' });
    replaceHits(prepareHits(input.artwork.bounds)); pose(accepted); root.name = accepted.assetId; root.userData = manifest(accepted);
    return { root, pickables: pickables as readonly THREE.Mesh[], regions: regions as ReadonlyMap<string, THREE.Object3D>, dispose,
      update(next: RectangularInput) {
        if (retired) throw new Error('Cannot update disposed rectangular asset.');
        const p = validate(next); if (rectangularInstanceKey(p) !== rectangularInstanceKey(accepted)) throw new Error('New recipe or identities require asset replacement.');
        let stagedMaterials: ReturnType<typeof finishes> | undefined, stagedHits: ReturnType<typeof prepareHits> | undefined;
        try {
          if (JSON.stringify(p.appearance) !== JSON.stringify(accepted.appearance)) stagedMaterials = finishes(p);
          if (rectangularArtworkKey(p) !== rectangularArtworkKey(accepted)) stagedHits = prepareHits(next.artwork.bounds);
        } catch (e) { stagedMaterials?.dispose(); stagedHits?.meshes.forEach(m => m.geometry.dispose()); throw e; }
        if (stagedMaterials) { const prior = materials; materials = stagedMaterials; metalMeshes.forEach(([mesh, key]) => { mesh.material = materials[key]; }); prior.dispose(); }
        if (stagedHits) replaceHits(stagedHits);
        dialMaterial.map = next.artwork.texture; dialMaterial.needsUpdate = true; pose(p); accepted = p; root.userData = manifest(p);
      } };
  } catch (e) { dispose(); throw e; }
}
