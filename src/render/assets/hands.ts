import * as THREE from 'three';
import { createFinish, FINISH_VERSION, requireFinish, type HandFinishId } from './materials';

export const HAND_RECIPE_VERSION = 'atelier-hand-studies-1.0.0' as const;
export const HAND_DIAL_DATUM_MM = 3.45;
export const handRecipes = Object.freeze({
  pencil: Object.freeze({ name: 'Pencil', hourWidth: 1.06, minuteWidth: .7 }),
  sword: Object.freeze({ name: 'Sword', hourWidth: 1.8, minuteWidth: 1.14 }),
  dauphine: Object.freeze({ name: 'Dauphine', hourWidth: 1.7, minuteWidth: 1.1 }),
  spade: Object.freeze({ name: 'Spade', hourWidth: 1.9, minuteWidth: 1.2 }),
});
export type HandRecipeId = keyof typeof handRecipes;
export interface HandPresentation {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}
export const REGRESSION_TIME: HandPresentation = Object.freeze({ hour: 10, minute: 10, second: 30 });

/** Authoring subpart input; NOT a new canonical Design or a whole-watch WatchRenderInput. */
export interface HandSetInput {
  readonly units: 'mm';
  readonly recipeId: HandRecipeId;
  readonly recipeVersion: typeof HAND_RECIPE_VERSION;
  readonly finishId: HandFinishId;
  readonly finishVersion: typeof FINISH_VERSION;
  /** Host resolves membership in the accepted Design; this factory checks role/syntax only. */
  readonly component: { readonly role: 'hands'; readonly id: string };
  readonly presentation: HandPresentation;
}

function requirePresentation(time: HandPresentation) {
  if (!time || !Number.isInteger(time.hour) || time.hour < 0 || time.hour >= 24 ||
      !Number.isInteger(time.minute) || time.minute < 0 || time.minute >= 60 ||
      !Number.isFinite(time.second) || time.second < 0 || time.second >= 60) {
    throw new Error('Invalid hand presentation time.');
  }
}

function rotations(time: HandPresentation) {
  requirePresentation(time);
  const clockwise = -2 * Math.PI;
  return {
    hour: clockwise * ((time.hour % 12 + time.minute / 60 + time.second / 3600) / 12),
    minute: clockwise * ((time.minute + time.second / 60) / 60),
    second: clockwise * time.second / 60,
  };
}

function outline(id: HandRecipeId, length: number, width: number) {
  const s = new THREE.Shape(), half = width / 2;
  if (id === 'spade') {
    s.moveTo(0, -1.8);
    s.quadraticCurveTo(-half * .45, -1.6, -half * .22, .6);
    s.lineTo(-half * .22, length * .52);
    s.bezierCurveTo(-half * 1.18, length * .52, -half * 1.18, length * .72, -half * .55, length * .8);
    s.quadraticCurveTo(-half * .18, length * .9, 0, length);
    s.quadraticCurveTo(half * .18, length * .9, half * .55, length * .8);
    s.bezierCurveTo(half * 1.18, length * .72, half * 1.18, length * .52, half * .22, length * .52);
    s.lineTo(half * .22, .6);
    s.quadraticCurveTo(half * .45, -1.6, 0, -1.8);
  } else if (id === 'dauphine') {
    s.moveTo(0, -1.8); s.lineTo(-half, length * .2); s.lineTo(0, length);
    s.lineTo(half, length * .2);
  } else if (id === 'sword') {
    s.moveTo(-half * .32, -1.7); s.lineTo(-half * .32, length * .15);
    s.lineTo(-half, length * .38); s.lineTo(0, length);
    s.lineTo(half, length * .38); s.lineTo(half * .32, length * .15);
    s.lineTo(half * .32, -1.7);
  } else {
    s.moveTo(-half, -1.65); s.lineTo(-half, length * .82); s.lineTo(0, length);
    s.lineTo(half, length * .82); s.lineTo(half, -1.65);
  }
  s.closePath();
  return s;
}

function extrude(shape: THREE.Shape) {
  return new THREE.ExtrudeGeometry(shape, { depth: .08, bevelEnabled: true,
    bevelThickness: .025, bevelSize: .025, bevelSegments: 2, curveSegments: 16, steps: 1 });
}

/** Two raised triangular facets. Noncoplanar normals produce the actual folded highlight. */
function facet(length: number, width: number, side: -1 | 1) {
  const points = [[0, -.8, .11], [side * width * .46, length * .2, .11],
    [0, length * .91, .11], [0, length * .2, .215]];
  // Positive-Z winding for both faces; do not use negative mesh scales.
  const indices = side === 1 ? [0, 1, 3, 1, 2, 3] : [0, 3, 1, 1, 3, 2];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(indices.flatMap(i => points[i]), 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Synchronous leaf asset: fresh ownership, no fonts, textures supplied by callers or loaders.
 * Keep this instance on artwork edits. Recipe/finish/identity changes require a replacement.
 * Host still owns canonical validation, asynchronous stale-work gates and whole-watch assembly.
 */
export function createHandSet(input: HandSetInput) {
  if (input.units !== 'mm') throw new Error('Hand assets require millimeters.');
  if (input.recipeVersion !== HAND_RECIPE_VERSION) throw new Error('Unsupported hand recipe version.');
  if (!Object.hasOwn(handRecipes, input.recipeId)) throw new Error(`Unsupported hand recipe: ${input.recipeId}`);
  requireFinish(input.finishId, input.finishVersion);
  if ((input.finishId as string) === 'woven-textile-look') throw new Error('Textile is not a supported hand finish.');
  if (input.component?.role !== 'hands' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.component.id)) {
    throw new Error('Expected a canonical hands component descriptor.');
  }
  requirePresentation(input.presentation);
  const semanticId = input.component.id;
  const root = new THREE.Group(), pickables: THREE.Mesh[] = [];
  root.name = `hands.${input.recipeId}`;
  root.userData = { semanticId, recipeId: input.recipeId, recipeVersion: input.recipeVersion,
    finishId: input.finishId, finishVersion: input.finishVersion, units: 'mm', realization: 'concept' };
  const owned = new Set<{ dispose(): void }>();
  let disposed = false;
  const own = <T extends { dispose(): void }>(value: T): T => { owned.add(value); return value; };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    root.removeFromParent(); root.clear(); pickables.length = 0;
    owned.forEach(resource => resource.dispose()); owned.clear();
  };
  const mesh = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D) => {
    const m = new THREE.Mesh(own(geometry), material);
    m.name = name; m.userData.semanticId = semanticId;
    parent.add(m); pickables.push(m); return m;
  };
  const pivots = {} as Record<'hour' | 'minute' | 'second', THREE.Group>;
  const setPresentation = (time: HandPresentation) => {
    if (disposed) throw new Error('Hand asset is disposed.');
    const angles = rotations(time); // validate before any mutation
    for (const role of ['hour', 'minute', 'second'] as const) pivots[role].rotation.z = angles[role];
  };
  try {
    const finish = own(createFinish(input.finishId, input.finishVersion));
    const inlay = own(new THREE.MeshStandardMaterial({ color: '#e9e2cd', roughness: .65 }));
    const accent = own(new THREE.MeshStandardMaterial({ color: '#b95634', metalness: .15, roughness: .5 }));
    inlay.name = 'atelier-hand-inlay-1.0.0'; accent.name = 'atelier-seconds-accent-1.0.0';
    const recipe = handRecipes[input.recipeId];
    for (const [role, length, width, offset] of [
      ['hour', 9.6, recipe.hourWidth, .41], ['minute', 12.35, recipe.minuteWidth, .74],
    ] as const) {
      const pivot = pivots[role] = new THREE.Group();
      pivot.name = `hands.${role}.pivot`; pivot.userData.semanticId = semanticId;
      pivot.position.z = HAND_DIAL_DATUM_MM + offset; root.add(pivot);
      mesh(`hands.${role}.body`, extrude(outline(input.recipeId, length, width)), finish.material, pivot);
      if (input.recipeId === 'dauphine') {
        for (const side of [-1, 1] as const) mesh(`hands.${role}.facet.${side}`, facet(length, width, side), finish.material, pivot);
      } else if (input.recipeId !== 'spade') {
        const s = new THREE.Shape();
        const half = width * (input.recipeId === 'sword' ? .27 : .24);
        s.moveTo(-half * .5, length * .23); s.lineTo(-half, length * .4); s.lineTo(0, length * .85);
        s.lineTo(half, length * .4); s.lineTo(half * .5, length * .23); s.closePath();
        const g = new THREE.ExtrudeGeometry(s, { depth: .02, bevelEnabled: false, steps: 1 });
        mesh(`hands.${role}.inlay`, g, inlay, pivot).position.z = .108;
      }
    }
    const seconds = pivots.second = new THREE.Group();
    seconds.name = 'hands.second.pivot'; seconds.userData.semanticId = semanticId;
    seconds.position.z = HAND_DIAL_DATUM_MM + 1.1; root.add(seconds);
    const needle = new THREE.BoxGeometry(.13, 15.95, .08);
    needle.translate(0, 5.125, 0); // tail -2.85 / tip 13.1, geometry offset leaves pivot centered
    mesh('hands.second.body', needle, accent, seconds);
    const counter = new THREE.TorusGeometry(.51, .105, 8, 40);
    counter.translate(0, -2, .01);
    mesh('hands.second.counterweight', counter, accent, seconds);
    const arbor = new THREE.CylinderGeometry(.19, .19, .8, 32);
    arbor.rotateX(Math.PI / 2);
    mesh('hands.arbor', arbor, finish.material, root).position.z = 4.25;
    const pin = new THREE.CylinderGeometry(.46, .46, .28, 40);
    pin.rotateX(Math.PI / 2);
    mesh('hands.pin', pin, finish.material, root).position.z = HAND_DIAL_DATUM_MM + 1.12;
    setPresentation(input.presentation);
    return { root, pickables: pickables as readonly THREE.Mesh[],
      recipeVersion: HAND_RECIPE_VERSION, setPresentation, dispose };
  } catch (error) { dispose(); throw error; }
}
