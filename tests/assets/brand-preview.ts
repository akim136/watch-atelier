import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createModelStudy } from '../../src/render/assets/model-studies';
import { MODEL_STUDY_VERSION, modelStudyRecipes, STUDY_PRESENTATION, studyArtworkKey, studyText, requireStudyPresentation,
  type ModelStudyId, type StudyPresentation } from '../../src/render/assets/model-recipes';
import { createStudio } from '../../src/render/assets/legacy/studio';
import { contentHash, FONT_FAMILY, FONT_HASHES, loadFonts } from '../../src/render/assets/legacy/resources';
import { fixtureProject } from './fixture';

// Test host owns every async dependency; production assets only borrow ready maps.
const canvas = document.querySelector('canvas')!, status = document.querySelector('#status')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(1600, 1200, false); renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
const scene = new THREE.Scene(), studio = createStudio(renderer, scene);
const camera = new THREE.PerspectiveCamera(38, 4 / 3, .1, 500);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = false; controls.enablePan = false;
const cameras = { Front: [0, 0, 146], Oblique: [48, 52, 134], Profile: [150, 18, 9], Detail: [16, 23, 104] } as const;
type View = keyof typeof cameras;
let current: { asset: ReturnType<typeof createModelStudy>; maps: THREE.Texture[]; hashes: string[] } | undefined;
let id: ModelStudyId = 'gmt-master-ii', view: View = 'Front', presentation = { ...STUDY_PRESENTATION };
let generation = 0, accepted = 0, disposed = false, pending = false;
const render = () => { if (!disposed) renderer.render(scene, camera); };
controls.addEventListener('change', render);
function setView(next: View) {
  if (!Object.hasOwn(cameras, next)) throw new Error('Unknown view.');
  view = next; camera.position.fromArray(cameras[next]); camera.zoom = next === 'Detail' ? 1.85 : 1;
  controls.target.set(0, 0, 0); camera.updateProjectionMatrix(); controls.update();
  (document.querySelector('#view') as HTMLSelectElement).value = next; render();
}
async function artwork(studyId: ModelStudyId, p: StudyPresentation) {
  await loadFonts();
  const maps: THREE.Texture[] = [], hashes: string[] = [];
  try {
    for (const slot of ['dial', 'bezel'] as const) {
      const surface = document.createElement('canvas'); surface.width = surface.height = 2048;
      const ctx = surface.getContext('2d'); if (!ctx) throw new Error('Canvas artwork unavailable.');
      const scale = 2048 / (slot === 'dial' ? 32 : modelStudyRecipes[studyId].diameter);
      ctx.translate(1024, 1024); ctx.scale(scale, scale); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const text of studyText(studyId, p).filter(t => t.slot === slot)) {
        ctx.save(); ctx.translate(text.x, -text.y); ctx.rotate(-text.rotation);
        ctx.font = `500 ${text.size}px "${FONT_FAMILY}"`; ctx.fillStyle = text.color;
        ctx.fillText(text.text, 0, 0); ctx.restore();
      }
      const map = new THREE.CanvasTexture(surface); map.colorSpace = THREE.SRGBColorSpace; maps.push(map);
      hashes.push(await contentHash(new Uint8Array(ctx.getImageData(0, 0, 2048, 2048).data)));
    }
    return { maps, hashes };
  } catch (error) { maps.forEach(m => m.dispose()); throw error; }
}
function retire(value: NonNullable<typeof current>) { value.asset.dispose(); value.maps.forEach(m => m.dispose()); }
async function show(studyId: ModelStudyId, p: StudyPresentation = STUDY_PRESENTATION, delayMs = 0) {
  // Capture caller content before any font/hash work can yield.
  p = { ...p }; requireStudyPresentation(p); studyArtworkKey(studyId, p);
  const request = ++generation; pending = true; status.textContent = 'Preparing verified artwork…';
  try {
    const prepared = await artwork(studyId, p);
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    if (disposed || request !== generation) { prepared.maps.forEach(m => m.dispose()); return false; }
    let asset: ReturnType<typeof createModelStudy>;
    try {
      asset = createModelStudy({ units: 'mm', studyId, version: MODEL_STUDY_VERSION,
        components: fixtureProject().variants[0].design.components, presentation: p,
        artwork: { ready: true, key: studyArtworkKey(studyId, p), dial: prepared.maps[0], bezel: prepared.maps[1] } });
    } catch (error) { prepared.maps.forEach(m => m.dispose()); throw error; }
    if (current) retire(current); current = { asset, ...prepared }; scene.add(asset.root);
    id = studyId; presentation = { ...p }; accepted = request; pending = false;
    (document.querySelector('#study') as HTMLSelectElement).value = id;
    const recipe = modelStudyRecipes[id];
    document.querySelector('#caption')!.textContent = `${recipe.brand} ${recipe.model} · ${recipe.reference} · concept exterior study`;
    setView(view); status.textContent = 'Ready · verified local font · retained procedural source'; return true;
  } catch (error) {
    if (request === generation) { pending = false; status.textContent = String(error); }
    throw error;
  }
}
function manifest() {
  const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
  return { kind: 'rendering-only-model-study', id, reference: modelStudyRecipes[id].reference, version: MODEL_STUDY_VERSION,
    inputKey: studyArtworkKey(id, presentation), presentation: { ...presentation }, view, units: 'mm', dialDatum: 3.45,
    viewport: [1600, 1200], dpr: 1, camera: { position: camera.position.toArray(), zoom: camera.zoom, target: controls.target.toArray() },
    artworkHashes: current?.hashes, fontFamily: FONT_FAMILY, fontHashes: FONT_HASHES,
    output: { colorSpace: renderer.outputColorSpace, toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure },
    environment: scene.environment?.name, browser: navigator.userAgent, three: THREE.REVISION,
    gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    resources: { ...renderer.info.memory }, draw: { ...renderer.info.render }, accepted, generation, pending,
    regions: current ? [...current.asset.regions].map(([name, m]) => ({ name, semanticId: m.userData.semanticId })) : [] };
}
function capture() {
  if (!current || pending || accepted !== generation || disposed) throw new Error('Export requires latest ready artwork.');
  render(); return { png: canvas.toDataURL('image/png'), manifest: manifest() };
}
function dispose() {
  if (disposed) return; disposed = true; generation++; if (current) retire(current); current = undefined;
  controls.dispose(); studio.dispose(); renderer.dispose();
}
document.querySelector('#study')!.addEventListener('change', e => { void show((e.target as HTMLSelectElement).value as ModelStudyId).catch(() => {}); });
document.querySelector('#view')!.addEventListener('change', e => setView((e.target as HTMLSelectElement).value as View));
document.querySelector('#export')!.addEventListener('click', () => {
  try { const result = capture(), a = document.createElement('a'); a.href = result.png; a.download = `${id}-${view}.png`; a.click(); }
  catch (error) { status.textContent = String(error); }
});
window.addEventListener('pagehide', dispose, { once: true });
const fixture = { show, setView, capture, manifest, render, dispose, camera, renderer, asset: () => current?.asset,
  livePNG: () => { render(); return canvas.toDataURL('image/png'); } };
declare global { interface Window { brandFixture: typeof fixture } }
window.brandFixture = fixture; setView('Front'); void show('gmt-master-ii').catch(() => {});
