import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createHandSet, HAND_RECIPE_VERSION, handRecipes, type HandRecipeId } from '../../src/render/assets/hands';
import { createFinish, finishRecipes, FINISH_VERSION, type HandFinishId } from '../../src/render/assets/materials';
import { createStudio } from '../../src/render/studio';
import { handInput, type HandAsset } from './parts-fixture';

/** Test-only host. None of these selections are canonical saved-product state. */
const canvas = document.querySelector('canvas')!;
const status = document.querySelector('#status')!, caption = document.querySelector('#caption')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(1024, 1024, false); renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
const scene = new THREE.Scene(), studio = createStudio(renderer, scene);
const camera = new THREE.OrthographicCamera(-19.5, 19.5, 19.5, -19.5, .1, 500);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = false; controls.enablePan = false;
controls.minZoom = .3; controls.maxZoom = 4;
const cameras = {
  Front: { position: [0, 0, 100], target: [0, 0, 3.9], zoom: 1 },
  Oblique: { position: [35, 42, 85], target: [0, 0, 3.9], zoom: 1 },
  Profile: { position: [60, 6, 6], target: [0, 0, 3.9], zoom: 1.04 },
  Detail: { position: [20, 28, 85], target: [0, 2, 4.1], zoom: 2.1 },
} as const;
type View = keyof typeof cameras;
let current: { root: THREE.Group; dispose(): void } | undefined;
let hand: HandAsset | undefined;
let selection = { kind: 'hands', recipeId: 'pencil', finishId: 'titanium-look', view: 'Front' };
let disposed = false;
let replacements = 0;
const render = () => { if (!disposed) renderer.render(scene, camera); };
controls.addEventListener('change', render);

function setView(view: View) {
  if (!Object.hasOwn(cameras, view)) throw new Error('Unknown specimen view.');
  const recipe = cameras[view];
  camera.position.fromArray(recipe.position); controls.target.fromArray(recipe.target);
  camera.zoom = selection.kind === 'materials' ? .4 : recipe.zoom;
  (document.querySelector('#view') as HTMLSelectElement).value = view;
  camera.updateProjectionMatrix(); controls.update(); selection = { ...selection, view }; render();
}

function support() {
  const root = new THREE.Group();
  const resources: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(value: T) => { resources.push(value); return value; };
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, z: number) => {
    const mesh = new THREE.Mesh(own(geometry), material); mesh.position.z = z; root.add(mesh); return mesh;
  };
  const face = own(new THREE.MeshStandardMaterial({ color: '#ded8c5', roughness: .86, metalness: .02 }));
  const edge = own(new THREE.MeshStandardMaterial({ color: '#727f86', roughness: .35, metalness: 1 }));
  const tick = own(new THREE.MeshStandardMaterial({ color: '#4f5859', roughness: .6 }));
  const disc = new THREE.CylinderGeometry(16, 16, .4, 128); disc.rotateX(Math.PI / 2);
  add(disc, face, 3.25); // top is host datum 3.45
  add(new THREE.TorusGeometry(16.1, .12, 12, 128), edge, 3.38);
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0, length = major ? .9 : .38;
    const m = add(new THREE.BoxGeometry(major ? .14 : .06, length, .025), tick, 3.48);
    const angle = i * Math.PI / 30, r = 14.4 - length / 2;
    m.position.x = Math.sin(angle) * r; m.position.y = Math.cos(angle) * r; m.rotation.z = -angle;
  }
  let retired = false;
  return { root, dispose() { if (retired) return; retired = true; root.removeFromParent(); root.clear(); resources.forEach(r => r.dispose()); } };
}

function showHand(recipeId: HandRecipeId, finishId: HandFinishId) {
  const nextHand = createHandSet(handInput(recipeId, finishId));
  let pedestal: ReturnType<typeof support>;
  try { pedestal = support(); } catch (error) { nextHand.dispose(); throw error; }
  const root = new THREE.Group(); root.add(pedestal.root, nextHand.root);
  const next = { root, dispose() { root.removeFromParent(); nextHand.dispose(); pedestal.dispose(); root.clear(); } };
  current?.dispose(); current = next; hand = nextHand; scene.add(root); replacements++;
  selection = { kind: 'hands', recipeId, finishId, view: selection.view };
  caption.textContent = `${handRecipes[recipeId].name} / ${finishId} · 10:10:30 · four fixed views; Detail intentionally crops the dial support.`;
  setView(selection.view as View);
  status.textContent = 'Ready · geometry in mm · recipe 1.0.0 · no remote assets';
}

function showMaterials() {
  const root = new THREE.Group(), owned: { dispose(): void }[] = [];
  try {
    const positions = [[-24, 16], [0, 16], [24, 16], [-12, -16], [12, -16]];
    Object.keys(finishRecipes).forEach((id, i) => {
      const finish = createFinish(id as keyof typeof finishRecipes, FINISH_VERSION); owned.push(finish);
      const shape = new THREE.Shape();
      shape.moveTo(-8, -10); shape.lineTo(8, -10); shape.quadraticCurveTo(9, -10, 9, -9);
      shape.lineTo(9, 9); shape.quadraticCurveTo(9, 10, 8, 10); shape.lineTo(-8, 10);
      shape.quadraticCurveTo(-9, 10, -9, 9); shape.lineTo(-9, -9); shape.quadraticCurveTo(-9, -10, -8, -10);
      const tile = new THREE.ExtrudeGeometry(shape, { depth: .7, bevelEnabled: true, bevelSize: .3, bevelThickness: .3, bevelSegments: 3, curveSegments: 8 });
      // Texture scale is intentional in this fixture: one UV tile over the plate.
      const uv = tile.getAttribute('uv');
      for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) / 18, uv.getY(j) / 20);
      const sphere = new THREE.SphereGeometry(5.8, 64, 32); owned.push(tile, sphere);
      for (const [geometry, z] of [[tile, 0], [sphere, 5.9]] as const) {
        const m = new THREE.Mesh(geometry, finish.material); m.name = `${id}.${z === 0 ? 'plate' : 'sphere'}`;
        m.position.set(positions[i][0], positions[i][1], z); root.add(m);
      }
    });
  } catch (error) { owned.forEach(r => r.dispose()); root.clear(); throw error; }
  current?.dispose(); hand = undefined;
  current = { root, dispose() { root.removeFromParent(); root.clear(); owned.forEach(r => r.dispose()); } };
  scene.add(root); selection = { kind: 'materials', recipeId: 'five-finish-sheet', finishId: 'all-five', view: 'Front' };
  caption.textContent = 'Top row: titanium / champagne gold / bronze. Bottom row: ink ceramic / woven textile. All are appearance studies.';
  setView('Front'); status.textContent = 'Ready · five procedural materials · no physical material qualification';
}

function manifest() {
  const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
  return { kind: 'authoring-specimen', selection: { ...selection }, recipeVersion: HAND_RECIPE_VERSION,
    materialVersion: FINISH_VERSION, fixtureVersion: 'atelier-part-specimens-1.0.0',
    semanticId: hand?.root.userData.semanticId ?? null, componentRole: hand ? 'hands' : null,
    units: 'mm', dialDatum: 3.45, viewport: [1024, 1024], dpr: 1,
    camera: { position: camera.position.toArray(), target: controls.target.toArray(), zoom: camera.zoom },
    output: { colorSpace: renderer.outputColorSpace, toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure },
    environment: scene.environment?.name, browser: navigator.userAgent, three: THREE.REVISION,
    gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    resources: { ...renderer.info.memory }, draw: { ...renderer.info.render }, replacements,
    pickables: hand?.pickables.map(m => ({ name: m.name, semanticId: m.userData.semanticId })) ?? [] };
}

function capture() {
  render(); const metadata = manifest();
  return new Promise<{ blob: Blob; manifest: ReturnType<typeof manifest> }>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve({ blob, manifest: metadata }) : reject(new Error('PNG capture unavailable.')), 'image/png');
  });
}
function dispose() {
  if (disposed) return; disposed = true; current?.dispose(); controls.dispose(); studio.dispose(); renderer.dispose();
}
document.querySelector('#hand')!.addEventListener('change', () => showHand(
  (document.querySelector('#hand') as HTMLSelectElement).value as HandRecipeId,
  (document.querySelector('#finish') as HTMLSelectElement).value as HandFinishId));
document.querySelector('#finish')!.addEventListener('change', () => showHand(
  (document.querySelector('#hand') as HTMLSelectElement).value as HandRecipeId,
  (document.querySelector('#finish') as HTMLSelectElement).value as HandFinishId));
document.querySelector('#view')!.addEventListener('change', event => setView((event.target as HTMLSelectElement).value as View));
document.querySelector('#materials')!.addEventListener('click', showMaterials);
document.querySelector('#export')!.addEventListener('click', () => {
  void capture().then(({ blob, manifest: meta }) => {
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url;
    a.download = `atelier-${meta.selection.recipeId}-${meta.selection.view}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }).catch(error => { status.textContent = String(error); });
});
window.addEventListener('pagehide', dispose, { once: true });
showHand('pencil', 'titanium-look');
const fixture = { showHand, showMaterials, setView, manifest, capture, render, dispose, renderer, scene, camera, controls,
  hand: () => hand, livePNG: () => { render(); return canvas.toDataURL('image/png'); } };
declare global { interface Window { partsFixture: typeof fixture } }
window.partsFixture = fixture;
