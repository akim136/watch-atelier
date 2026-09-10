import * as THREE from 'three';
import { MODEL_STUDY_VERSION, modelStudyRecipes, requireStudy, requireStudyPresentation,
  studyArtworkKey, type ModelStudyId, type StudyPresentation } from './model-recipes';

type Role = 'case' | 'bezel' | 'dial' | 'hands' | 'crystal' | 'strap';
export interface ModelStudyInput {
  readonly units: 'mm'; readonly studyId: ModelStudyId; readonly version: typeof MODEL_STUDY_VERSION;
  readonly components: readonly { readonly role: Role; readonly id: string }[];
  readonly presentation: StudyPresentation;
  /** Host-owned, already ready, sRGB square maps. Regions/strings stay in retained source data. */
  readonly artwork: { readonly ready: boolean; readonly key: string; readonly dial: THREE.Texture; readonly bezel: THREE.Texture };
}

function roundedRect(width: number, height: number, radius: number) {
  const x = width / 2, y = height / 2, s = new THREE.Shape();
  s.moveTo(-x + radius, y); s.lineTo(x - radius, y); s.quadraticCurveTo(x, y, x, y - radius);
  s.lineTo(x, -y + radius); s.quadraticCurveTo(x, -y, x - radius, -y);
  s.lineTo(-x + radius, -y); s.quadraticCurveTo(-x, -y, -x, -y + radius);
  s.lineTo(-x, y - radius); s.quadraticCurveTo(-x, y, -x + radius, y); s.closePath(); return s;
}
function octagon(width: number, height: number, cut: number, softness: number) {
  const x = width / 2, y = height / 2;
  const vertices = [[-x + cut, y], [x - cut, y], [x, y - cut], [x, -y + cut],
    [x - cut, -y], [-x + cut, -y], [-x, -y + cut], [-x, y - cut]].map(v => new THREE.Vector2(...v));
  const s = new THREE.Shape();
  vertices.forEach((v, i) => {
    const previous = vertices[(i + 7) % 8], next = vertices[(i + 1) % 8];
    const a = v.clone().lerp(previous, softness), b = v.clone().lerp(next, softness);
    if (!i) s.moveTo(a.x, a.y); else s.lineTo(a.x, a.y);
    s.quadraticCurveTo(v.x, v.y, b.x, b.y);
  }); s.closePath(); return s;
}
function solid(shape: THREE.Shape, depth: number, bevel = .12) {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel,
    bevelThickness: bevel, bevelSegments: 2, curveSegments: 12, steps: 1 });
}
function lathe(points: number[][]) {
  const geometry = new THREE.LatheGeometry(points.map(([r, z]) => new THREE.Vector2(r, z)), 128);
  geometry.rotateX(Math.PI / 2); return geometry;
}

/** A fixed exterior authoring study, NOT a canonical saved-watch factory or a caliber model. */
export function createModelStudy(input: ModelStudyInput) {
  requireStudy(input.studyId, input.version); requireStudyPresentation(input.presentation);
  if (input.units !== 'mm') throw new Error('Model study requires millimeters.');
  const roles: Role[] = ['case', 'bezel', 'dial', 'hands', 'crystal', 'strap'];
  if (input.components.length !== 6 || roles.some(role => input.components.filter(c => c.role === role).length !== 1) ||
      new Set(input.components.map(c => c.id)).size !== 6 || input.components.some(c =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(c.id))) {
    throw new Error('Model study requires six distinct host component descriptors.');
  }
  const artwork = input.artwork;
  if (!artwork?.ready || artwork.key !== studyArtworkKey(input.studyId, input.presentation)) throw new Error('Model study artwork is missing, stale or belongs to a different study.');
  for (const texture of [artwork.dial, artwork.bezel]) {
    const image = texture?.image as { width?: unknown; height?: unknown } | undefined;
    if (!texture?.isTexture || texture.colorSpace !== THREE.SRGBColorSpace || !image ||
        typeof image.width !== 'number' || !Number.isInteger(image.width) || image.width < 2 || image.width > 2048 || image.width !== image.height) {
      throw new Error('Model study requires ready bounded sRGB artwork in both slots.');
    }
  }
  if (artwork.dial === artwork.bezel) throw new Error('Dial and bezel artwork slots must be distinct.');
  const studyId = input.studyId, r = modelStudyRecipes[studyId], p = { ...input.presentation };
  const ids = Object.fromEntries(input.components.map(c => [c.role, c.id])) as Record<Role, string>;
  const root = new THREE.Group(), pickables: THREE.Mesh[] = [], owned = new Set<{ dispose(): void }>();
  const regionMap = new Map<string, THREE.Object3D>();
  const own = <T extends { dispose(): void }>(value: T) => { owned.add(value); return value; };
  let disposed = false;
  const dispose = () => {
    if (disposed) return; disposed = true; root.removeFromParent(); root.clear(); pickables.length = 0; regionMap.clear();
    owned.forEach(resource => resource.dispose()); owned.clear();
  };
  const add = (name: string, role: Role, geometry: THREE.BufferGeometry, material: THREE.Material,
    x = 0, y = 0, z = 0, parent: THREE.Object3D = root) => {
    const m = new THREE.Mesh(own(geometry), material); m.name = name;
    m.userData = { semanticId: ids[role], regionId: name, conceptStudy: true };
    m.position.set(x, y, z); parent.add(m); pickables.push(m); regionMap.set(name, m); return m;
  };
  const group = (name: string, role: Role, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group(); g.name = name; g.userData = { semanticId: ids[role], regionId: name };
    g.position.set(x, y, z); root.add(g); regionMap.set(name, g); return g;
  };
  try {
    const steel = own(new THREE.MeshStandardMaterial({ color: r.metal, metalness: .9, roughness: .32 }));
    const polish = own(new THREE.MeshStandardMaterial({ color: r.metal, metalness: .95, roughness: .19 }));
    const dark = own(new THREE.MeshStandardMaterial({ color: '#131c22', roughness: .28, metalness: .12 }));
    const pale = own(new THREE.MeshStandardMaterial({ color: '#dce6dd', roughness: .55, metalness: .04 }));
    const dial = own(new THREE.MeshStandardMaterial({ color: r.dial, roughness: .7, metalness: .16 }));
    const radius = r.diameter / 2;
    if (r.family === 'round') {
      add('case.body', 'case', lathe([[0, -4.5], [radius - 1.6, -4.5], [radius, -2.5],
        [radius, 1.9], [radius - .7, 2.8], [0, 2.8], [0, -4.5]]), steel);
      for (const sy of [-1, 1]) for (const sx of [-1, 1]) {
        const s = new THREE.Shape(); s.moveTo(sx * 10.6, sy * 12.9); s.lineTo(sx * 15.2, sy * 12.5);
        s.lineTo(sx * 12.7, sy * 23.3); s.lineTo(sx * 10.4, sy * 23.3); s.closePath();
        add(`case.lug.${sx}.${sy}`, 'case', solid(s, 3.2, .23), steel, 0, 0, -2.3);
      }
    } else {
      const body = r.family === 'octagonal' ? octagon(40.6, 42, 9, .035) : octagon(40, 38, 8, .48);
      add('case.body', 'case', solid(body, 5.7, .3), steel, 0, 0, -3.4);
      for (const sy of [-1, 1]) add(`case.integrated-attachment.${sy}`, 'case',
        solid(roundedRect(23, 7, .8), 2.8, .2), steel, 0, sy * 20, -2);
      if (r.family === 'porthole') for (const sx of [-1, 1]) add(`case.porthole-ear.${sx}`, 'case',
        solid(roundedRect(3.2, 10, 1), 4.8, .2), polish, sx * 20.8, 0, -2.6);
    }
    add('case.back', 'case', lathe([[0, -5.1], [14, -5.1], [16, -4.7], [16, -3.1], [0, -3.1], [0, -5.1]]), steel);
    // Exterior-only back study: no invented hidden movement or implied sapphire-back fidelity.
    const crown = add('case.crown', 'case', lathe([[0, -1.3], [2.2, -1.3], [2.55, -.95], [2.55, 1.1], [2.2, 1.4], [0, 1.4], [0, -1.3]]), polish, radius + 1.2, 0, -.1);
    crown.rotation.y = Math.PI / 2;
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      const flute = add(`crown.flute.${i}`, 'case', new THREE.BoxGeometry(2.15, .13, .24), steel,
        radius + 1.1, Math.sin(a) * 2.48, Math.cos(a) * 2.48 - .1);
      flute.rotation.x = -a;
    }
    if (['gmt-master-ii', 'submariner', 'daytona'].includes(studyId)) {
      for (const sy of [-1, 1]) add(`case.crown-guard.${sy}`, 'case', solid(roundedRect(4.2, 2.1, .6), 3.5, .2), steel, radius - .4, sy * 3.7, -1.8);
    }
    if (studyId === 'daytona') for (const sy of [-1, 1]) {
      const button = add(`chronograph.pusher.${sy}`, 'case', new THREE.CylinderGeometry(1.65, 1.65, 3.1, 32), polish, radius - .2, sy * 8.4, -.1);
      button.rotation.z = Math.PI / 2;
    }

    if (r.family === 'round') {
      add('bezel.rim', 'bezel', lathe([[15.7, 2.8], [radius, 2.8], [radius + .05, 3.25],
        [radius - .3, 3.85], [16.3, 4.2], [15.7, 3.9], [15.7, 2.8]]), polish);
      if (r.bezel === 'fluted') {
        for (let i = 0; i < 64; i++) {
          const a = i * Math.PI / 32, mesh = add(`bezel.flute.${i}`, 'bezel', new THREE.BoxGeometry(.31, 2.3, .24), polish,
            Math.sin(a) * 18.1, Math.cos(a) * 18.1, 4.02); mesh.rotation.z = -a;
        }
      } else {
        const insert = add('bezel.insert', 'bezel', new THREE.RingGeometry(16.35, radius - .35, 128, 1, 0, r.bezel === 'gmt' ? Math.PI : Math.PI * 2), dark, 0, 0, 4.26);
        if (r.bezel === 'gmt') {
          const blue = own(new THREE.MeshStandardMaterial({ color: '#234f88', roughness: .27, metalness: .12 }));
          add('bezel.blue-half', 'bezel', new THREE.RingGeometry(16.35, radius - .35, 96, 1, Math.PI, Math.PI), blue, 0, 0, 4.26);
        }
        insert.userData.scaleRole = r.bezel;
        if (r.bezel === 'gmt' || r.bezel === 'dive') {
          const zero = new THREE.Shape(); zero.moveTo(-.65, .55); zero.lineTo(.65, .55); zero.lineTo(0, -.7); zero.closePath();
          add('bezel.zero-index', 'bezel', solid(zero, .03, .015), pale, 0, 18.05, 4.32);
          if (r.bezel === 'dive') for (let i = 1; i < 60; i++) {
            if (i % 10 === 0) continue;
            const a = i * Math.PI / 30, major = i % 5 === 0;
            if (i > 15 && !major) continue;
            const tick = add(`bezel.minute.${i}`, 'bezel', new THREE.BoxGeometry(major ? .12 : .055, major ? .65 : .35, .02), pale,
              Math.sin(a) * 18.05, Math.cos(a) * 18.05, 4.33); tick.rotation.z = -a;
          }
        }
        for (let i = 0; i < 80; i++) {
          const a = i * Math.PI / 40;
          const knurl = add(`bezel.knurl.${i}`, 'bezel', new THREE.BoxGeometry(.22, .32, .4), polish,
            Math.sin(a) * radius, Math.cos(a) * radius, 3.4); knurl.rotation.z = -a;
        }
      }
    } else {
      const shape = r.family === 'octagonal' ? octagon(39.6, 39.6, 11.6, .025) : octagon(39.2, 35.8, 8.2, .46);
      const hole = new THREE.Path(); hole.absarc(0, 0, 15.9, 0, Math.PI * 2, true); shape.holes.push(hole);
      add('bezel.rim', 'bezel', solid(shape, .8, .23), polish, 0, 0, 3.03);
      if (r.family === 'octagonal') for (let i = 0; i < 8; i++) {
        const a = (i + .5) * Math.PI / 4;
        const x = Math.sin(a) * 19.1, y = Math.cos(a) * 19.1;
        const screw = add(`bezel.screw.${i}`, 'bezel', new THREE.CylinderGeometry(.6, .6, .12, 6), pale, x, y, 4.15);
        screw.rotation.x = Math.PI / 2;
        const slot = add(`bezel.screw-slot.${i}`, 'bezel', new THREE.BoxGeometry(.08, .83, .02), dark, x, y, 4.225); slot.rotation.z = -a;
      }
    }
    add('bezel.rehaut', 'bezel', lathe([[15.7, 3.2], [16.05, 3.2], [16.05, 4.15], [15.7, 4.15], [15.7, 3.2]]), steel);
    add('dial.base', 'dial', new THREE.CircleGeometry(15.85, 128), dial, 0, 0, 3.45);
    if (studyId === 'royal-oak') {
      const positions: [number, number][] = [];
      for (let x = -15; x <= 15; x += .95) for (let y = -15; y <= 15; y += .95) if (Math.hypot(x, y) < 15.25) positions.push([x, y]);
      const geometry = own(new THREE.BoxGeometry(.69, .69, .07));
      const grid = own(new THREE.InstancedMesh(geometry, dial, positions.length)), matrix = new THREE.Matrix4();
      grid.name = 'dial.tapisserie'; grid.userData = { semanticId: ids.dial, regionId: grid.name,
        instanceRegions: positions.map((_, i) => `dial.tapisserie.${i}`) };
      positions.forEach(([x, y], i) => grid.setMatrixAt(i, matrix.makeTranslation(x, y, 3.49)));
      root.add(grid); regionMap.set(grid.name, grid); pickables.push(grid);
    }
    if (studyId === 'nautilus') for (let y = -14.4; y <= 14.4; y += .9) {
      const length = Math.sqrt(15.6 ** 2 - y ** 2) * 2;
      add(`dial.horizontal-ridge.${y.toFixed(1)}`, 'dial', new THREE.BoxGeometry(length, .055, .035), steel, 0, y, 3.48);
    }
    if (studyId === 'daytona') for (const [name, x, y] of [['minutes', 6.55, 0], ['hours', -6.55, 0], ['running-seconds', 0, -6.65]] as const) {
      add(`counter.${name}.ring`, 'dial', new THREE.RingGeometry(2.15, 3.25, 96), dark, x, y, 3.54);
      for (let i = 0; i < 30; i++) {
        const a = i * Math.PI / 15, m = add(`counter.${name}.tick.${i}`, 'dial', new THREE.BoxGeometry(.032, .2, .015), pale,
          x + Math.sin(a) * 3.01, y + Math.cos(a) * 3.01, 3.57); m.rotation.z = -a;
      }
    }
    if (r.date) {
      add('calendar.date-surround', 'dial', solid(roundedRect(3.3, 2.8, .13), .04, .04), polish, 10.6, 0, 3.52);
      add('calendar.date-paper', 'dial', new THREE.PlaneGeometry(2.85, 2.35), pale, 10.6, 0, 3.65);
    }
    if (studyId === 'day-date') {
      add('calendar.day-surround', 'dial', solid(roundedRect(8.3, 2, .6), .04, .04), polish, 0, 11.4, 3.52);
      add('calendar.day-paper', 'dial', new THREE.PlaneGeometry(7.8, 1.65), pale, 0, 11.4, 3.65);
    }
    const artMaterial = (texture: THREE.Texture) => own(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
    add('dial.lettering', 'dial', new THREE.CircleGeometry(16, 128), artMaterial(artwork.dial), 0, 0, 3.70);
    add('bezel.lettering', 'bezel', new THREE.RingGeometry(16.35, radius, 128), artMaterial(artwork.bezel), 0, 0, 4.30);
    // Ring UVs map to a full 2D disk, so the host uses a diameter of 2*radius.
    const bezelUV = (regionMap.get('bezel.lettering') as THREE.Mesh).geometry;
    const position = bezelUV.getAttribute('position'), uv = bezelUV.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, .5 + position.getX(i) / (2 * radius), .5 + position.getY(i) / (2 * radius));
    for (let i = 0; i < 60; i++) {
      const a = i * Math.PI / 30;
      const tick = add(`dial.minute-tick.${i}`, 'dial', new THREE.BoxGeometry(.045, .32, .02), studyId === 'day-date' || studyId === 'daytona' ? dark : pale,
        Math.sin(a) * 15.05, Math.cos(a) * 15.05, 3.56); tick.rotation.z = -a;
    }
    for (let i = 0; i < 12; i++) {
      if (r.date && i === 3 || studyId === 'day-date' && i === 0) continue;
      const a = i * Math.PI / 6, sport = studyId === 'gmt-master-ii' || studyId === 'submariner';
      let geometry: THREE.BufferGeometry;
      if (sport && i === 0) {
        const s = new THREE.Shape(); s.moveTo(-1.3, .85); s.lineTo(1.3, .85); s.lineTo(0, -1.4); s.closePath(); geometry = solid(s, .1, .06);
      } else if (sport && i % 3 !== 0) {
        geometry = new THREE.CylinderGeometry(.81, .81, .14, 32); geometry.rotateX(Math.PI / 2);
      } else geometry = solid(roundedRect(studyId === 'day-date' ? .67 : .65, i === 0 ? 2.6 : 2.0, .07), .14, .045);
      const marker = add(`dial.index.${i}`, 'dial', geometry, polish, Math.sin(a) * 13.2, Math.cos(a) * 13.2, 3.64); marker.rotation.z = -a;
      if (sport && i === 0) {
        const fill = new THREE.Shape(); fill.moveTo(-1.04, .64); fill.lineTo(1.04, .64); fill.lineTo(0, -1.13); fill.closePath();
        add('dial.index.0.lume', 'dial', new THREE.ShapeGeometry(fill), pale, 0, 13.2, 3.82);
      }
      if (sport && i % 3 !== 0) add(`dial.index.${i}.lume`, 'dial', new THREE.CircleGeometry(.64, 32), pale, marker.position.x, marker.position.y, 3.735);
      else if (!sport || i % 3 === 0 && i !== 0) {
        const inlay = add(`dial.index.${i}.inlay`, 'dial', new THREE.BoxGeometry(.36, i === 0 ? 2.25 : 1.65, .025), pale,
          marker.position.x, marker.position.y, 3.84); inlay.rotation.z = -a;
      }
    }
    if (r.brand === 'Rolex') {
      const emblem = group('brand.coronet-approximation', 'dial', 0, 8.1, 3.7);
      const oval = add('brand.coronet.base', 'dial', new THREE.TorusGeometry(.41, .075, 6, 32), polish, 0, -.6, 0, emblem); oval.scale.x = 1.5; oval.scale.y = .55;
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * .34, top = .85 - Math.abs(i - 2) * .16;
        const g = new THREE.CylinderGeometry(.025, .095, top + .6, 8);
        const point = add(`brand.coronet.point.${i}`, 'dial', g, polish, x * .7, (top - .6) / 2, 0, emblem);
        point.rotation.z = -(i - 2) * .13;
        add(`brand.coronet.bead.${i}`, 'dial', new THREE.SphereGeometry(.08, 8, 6), polish, x, top, 0, emblem);
      }
    }

    const needle = (name: string, length: number, width: number, turns: number, z: number, material: THREE.Material, x = 0, y = 0) => {
      const pivot = group(`${name}.pivot`, 'hands', x, y, z); pivot.rotation.z = -turns * Math.PI * 2;
      const s = new THREE.Shape(); s.moveTo(-width / 2, -1.1); s.lineTo(-width / 2, length * .88);
      s.lineTo(0, length); s.lineTo(width / 2, length * .88); s.lineTo(width / 2, -1.1); s.closePath();
      add(`${name}.body`, 'hands', solid(s, .07, .015), material, 0, 0, 0, pivot); return pivot;
    };
    const sporty = studyId === 'gmt-master-ii' || studyId === 'submariner';
    const hour = needle('hands.hour', 8.5, sporty ? .72 : .65, (p.hour % 12 + p.minute / 60 + p.second / 3600) / 12, 4.02, polish);
    const minute = needle('hands.minute', 12.4, .66, (p.minute + p.second / 60) / 60, 4.34, polish);
    add('hands.minute.inlay', 'hands', new THREE.BoxGeometry(.26, 9.2, .015), studyId === 'day-date' ? dark : pale, 0, 6.25, .115, minute);
    if (sporty) {
      add('hands.hour.roundel', 'hands', new THREE.TorusGeometry(1.02, .14, 8, 48), polish, 0, 6.3, .08, hour);
      add('hands.hour.roundel-lume', 'hands', new THREE.CircleGeometry(.87, 40), pale, 0, 6.3, .13, hour);
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3;
        const spoke = add(`hands.hour.roundel-spoke.${i}`, 'hands', new THREE.BoxGeometry(.08, .87, .025), polish,
          Math.sin(a) * .43, 6.3 + Math.cos(a) * .43, .17, hour); spoke.rotation.z = -a;
      }
    } else add('hands.hour.inlay', 'hands', new THREE.BoxGeometry(.25, 5.9, .015), studyId === 'day-date' ? dark : pale, 0, 4.8, .115, hour);
    if (studyId === 'gmt-master-ii') {
      const blue = own(new THREE.MeshStandardMaterial({ color: '#338ac2', roughness: .35, metalness: .2 }));
      const gmt = needle('hands.gmt', 12.8, .14, (p.gmtHour + p.minute / 60) / 24, 3.89, blue);
      const tip = new THREE.Shape(); tip.moveTo(-1, 11.1); tip.lineTo(1, 11.1); tip.lineTo(0, 13.2); tip.closePath();
      add('hands.gmt.arrow', 'hands', solid(tip, .045, .035), pale, 0, 0, .07, gmt);
    }
    if (studyId === 'daytona') {
      needle('hands.chronograph-seconds', 13, .1, p.elapsedSeconds % 60 / 60, 4.67, dark);
      needle('counter.minutes.hand', 2.3, .08, (p.elapsedSeconds / 60 % 30) / 30, 3.85, polish, 6.55, 0);
      needle('counter.hours.hand', 2.3, .08, (p.elapsedSeconds / 3600 % 12) / 12, 3.85, polish, -6.55, 0);
      needle('counter.running-seconds.hand', 2.3, .08, p.second / 60, 3.85, polish, 0, -6.65);
    } else {
      const second = needle('hands.running-seconds', 13.25, .09, p.second / 60, 4.67, polish);
      if (sporty) add('hands.running-seconds.dot', 'hands', new THREE.CircleGeometry(.4, 24), pale, 0, 8.6, .1, second);
    }
    const pin = new THREE.CylinderGeometry(.45, .45, 1, 40); pin.rotateX(Math.PI / 2); add('hands.pin', 'hands', pin, polish, 0, 0, 4.37);

    for (const sy of [-1, 1]) {
      const half = group(`bracelet.${sy > 0 ? 'upper' : 'lower'}`, 'strap');
      const rows = r.bracelet === 'president' ? 9 : 6, pitch = r.bracelet === 'president' ? 2.5 : 3.75;
      for (let row = 0; row < rows; row++) {
        const y = 20.3 + row * pitch, width = 20.4 - row * .45;
        const z = -1.9 - Math.max(0, y - 22) * .08;
        const integrated = r.bracelet.startsWith('integrated');
        if (integrated) {
          add(`bracelet.${sy}.${row}.body`, 'strap', solid(roundedRect(width + 1.8, pitch - .18, .5), 1.8, .13), steel, 0, sy * y, z, half);
          if (r.bracelet === 'integrated-twin') for (const sx of [-1, 1]) add(`bracelet.${sy}.${row}.connector.${sx}`, 'strap',
            solid(roundedRect(2, pitch * .95, .35), .2, .08), polish, sx * 4.7, sy * (y + pitch * .35), z + 1.85, half);
          else add(`bracelet.${sy}.${row}.center`, 'strap', solid(roundedRect(11.2 - row * .3, pitch * .6, .65), .22, .1), polish, 0, sy * y, z + 1.86, half);
        } else {
          for (const [column, x, w] of [['left', -width * .375, width * .25], ['center', 0, width * .48], ['right', width * .375, width * .25]] as const) {
            add(`bracelet.${sy}.${row}.${column}`, 'strap', solid(roundedRect(w - .13, pitch - .12, r.bracelet === 'president' ? .8 : .35), 1.8, .12),
              column === 'center' && studyId !== 'submariner' ? polish : steel, x, sy * y, z, half);
          }
        }
      }
    }
    const crystal = own(new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: .045, roughness: .04, clearcoat: 1, depthWrite: false }));
    const glass = add('crystal.face', 'crystal', new THREE.CircleGeometry(16.1, 128), crystal, 0, 0, 5.08); glass.renderOrder = 5;
    root.name = `study.${studyId}`; root.userData = { studyId, version: input.version, reference: r.reference,
      source: r.source, inputKey: studyArtworkKey(studyId, p), realization: 'concept-study', engineeringValidation: 'not-assessed' };
    return { root, pickables: pickables as readonly THREE.Mesh[], regions: regionMap as ReadonlyMap<string, THREE.Object3D>, dispose };
  } catch (error) { dispose(); throw error; }
}
