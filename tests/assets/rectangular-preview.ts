import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createStudio } from '../../src/render/assets/legacy/studio';
import { loadFonts, FONT_FAMILY, FONT_HASHES, contentHash } from '../../src/render/assets/legacy/resources';
import { createRectangularAsset, type RectangularInput } from '../../src/render/assets/rectangular-watch';
import { rectangularArtwork, rectangularArtworkKey, rectangularInstanceKey, rectangularRecipes, requireProjection, type RectangularId, type RectangularProjection } from '../../src/render/assets/rectangular-recipes';
import { rectangleFixture, rectangularBounds } from './rectangular-fixture';

const canvas = document.querySelector('canvas')!, status = document.querySelector('#status')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(1600, 1200, false); renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
const scene = new THREE.Scene(), studio = createStudio(renderer, scene), camera = new THREE.PerspectiveCamera(38, 4 / 3, .1, 500);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = false; controls.enablePan = false;
const cameras = { Front: [0, 0, 145], Oblique: [40, 45, 138], Profile: [145, 12, 8], Detail: [10, 15, 91] } as const;
type View = keyof typeof cameras;
let view: View = 'Front', current: { asset: ReturnType<typeof createRectangularAsset>; texture: THREE.Texture; hash: string; projection: RectangularProjection } | undefined;
let generation = 0, accepted = 0, pending = false, disposed = false;
const render = () => { if (!disposed) renderer.render(scene, camera); };
controls.addEventListener('change', render);
function setView(value: View) {
  if (!Object.hasOwn(cameras, value)) throw new Error('Unknown camera'); view = value; camera.position.fromArray(cameras[view]);
  camera.zoom = view === 'Detail' ? 1.7 : 1; controls.target.set(0, 0, 0); camera.updateProjectionMatrix(); controls.update();
  (document.querySelector('#view') as HTMLSelectElement).value = view; render();
}
async function prepare(input: RectangularProjection) {
  await loadFonts();
  const records = rectangularArtwork(input), surface = document.createElement('canvas'); surface.width = surface.height = 2048;
  const ctx = surface.getContext('2d'); if (!ctx) throw new Error('Artwork canvas unavailable.');
  ctx.fillStyle = records.color; ctx.fillRect(0, 0, 2048, 2048);
  ctx.translate(1024, 1024); ctx.scale(64, 64); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of records.texts) {
    ctx.save(); ctx.translate(t.x, -t.y); ctx.rotate(-t.rotation); ctx.font = `400 ${t.size}px "${FONT_FAMILY}"`;
    ctx.fillStyle = t.color; ctx.fillText(t.text, 0, 0); ctx.restore();
  }
  for (const l of records.lines) { ctx.strokeStyle = l.color; ctx.lineWidth = l.width; ctx.beginPath(); ctx.moveTo(l.x1, -l.y1); ctx.lineTo(l.x2, -l.y2); ctx.stroke(); }
  const bounds = rectangularBounds(input, (text, size) => { ctx.font = `400 ${size}px "${FONT_FAMILY}"`; return ctx.measureText(text).width; });
  const hash = await contentHash(new Uint8Array(ctx.getImageData(0, 0, 2048, 2048).data));
  const texture = new THREE.CanvasTexture(surface); texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, hash, bounds };
}
async function show(value: RectangularProjection, delayMs = 0, failStage = false) {
  const projection = requireProjection(value), request = ++generation; pending = true; status.textContent = 'Preparing verified artwork…';
  let prepared: Awaited<ReturnType<typeof prepare>> | undefined;
  try {
    prepared = await prepare(projection); if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    if (disposed || request !== generation) { prepared.texture.dispose(); return false; }
    if (failStage) throw new Error('Seeded preparation failure');
    const input: RectangularInput = { projection, artwork: { ready: true, key: rectangularArtworkKey(projection), texture: prepared.texture, bounds: prepared.bounds } };
    if (current && rectangularInstanceKey(current.projection) === rectangularInstanceKey(projection)) {
      current.asset.update(input); current.texture.dispose(); current.texture = prepared.texture; current.projection = projection; current.hash = prepared.hash;
    } else {
      const asset = createRectangularAsset(input); if (current) { current.asset.dispose(); current.texture.dispose(); }
      current = { asset, texture: prepared.texture, hash: prepared.hash, projection }; scene.add(asset.root);
    }
    prepared = undefined; accepted = request; pending = false;
    (document.querySelector('#asset') as HTMLSelectElement).value = projection.assetId;
    (document.querySelector('#text') as HTMLInputElement).value = projection.texts[0].text;
    (document.querySelector('#color') as HTMLInputElement).value = projection.dialColor;
    (document.querySelector('#length') as HTMLInputElement).value = String(projection.indices.length);
    (document.querySelector('#track') as HTMLInputElement).checked = projection.track.visible;
    document.querySelector('#caption')!.textContent = `${rectangularRecipes[projection.assetId].name} · ${current.asset.root.userData.customized ? 'custom concept' : current.asset.root.userData.realization} · two hands · 10:10:30`;
    setView(view); status.textContent = 'Ready · rendering fixture; canonical family save support pending'; return true;
  } catch (e) { prepared?.texture.dispose(); if (request === generation) { pending = false; status.textContent = (e as Error).message; } throw e; }
}
function manifest() {
  const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
  return { ...current?.asset.root.userData, assetId: current?.projection.assetId, customized: Boolean(current?.asset.root.userData.customized),
    contentHash: current?.hash, sourceRevision: current?.projection.sourceRevision, view,
    viewport: [1600, 1200], dpr: 1, fontHashes: FONT_HASHES, output: 'sRGB/ACES/exposure1', environment: scene.environment?.name,
    camera: { position: camera.position.toArray(), target: controls.target.toArray(), zoom: camera.zoom },
    resources: { ...renderer.info.memory }, draw: { ...renderer.info.render }, three: THREE.REVISION, browser: navigator.userAgent,
    gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), generation, accepted, pending };
}
function capture() {
  if (!current || disposed || pending || accepted !== generation) throw new Error('Export requires latest ready family projection.');
  render(); return { png: canvas.toDataURL('image/png'), manifest: manifest() };
}
function dispose() { if (disposed) return; disposed = true; generation++; current?.asset.dispose(); current?.texture.dispose(); controls.dispose(); studio.dispose(); renderer.dispose(); }
/** Independent empty-studio control separates asset ownership from renderer internals. */
function emptyStudioResources() {
  const control = new THREE.WebGLRenderer(), controlScene = new THREE.Scene(), environment = createStudio(control, controlScene);
  // Exercise Three's physical shader / DFG lookup once without any asset code.
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshPhysicalMaterial(), mesh = new THREE.Mesh(geometry, material);
  controlScene.add(mesh); const camera = new THREE.PerspectiveCamera(); camera.position.z = 5; control.render(controlScene, camera);
  mesh.removeFromParent(); geometry.dispose(); material.dispose(); environment.dispose(); control.dispose(); return { ...control.info.memory };
}
document.querySelector('#asset')!.addEventListener('change', e => { void show(rectangleFixture((e.target as HTMLSelectElement).value as RectangularId)).catch(() => {}); });
document.querySelector('#view')!.addEventListener('change', e => setView((e.target as HTMLSelectElement).value as View));
document.querySelector('#apply')!.addEventListener('click', () => {
  if (!current || pending) return; const p = structuredClone(current.projection); p.sourceRevision.revision++;
  p.texts[0].text = (document.querySelector('#text') as HTMLInputElement).value; p.dialColor = (document.querySelector('#color') as HTMLInputElement).value;
  p.indices.length = Number((document.querySelector('#length') as HTMLInputElement).value); p.track.visible = (document.querySelector('#track') as HTMLInputElement).checked;
  void show(p).catch(e => { status.textContent = String(e); });
});
document.querySelector('#export')!.addEventListener('click', () => { try { const r = capture(), a = document.createElement('a'); a.href = r.png; a.download = `${current!.projection.assetId}-${view}.png`; a.click(); } catch (e) { status.textContent = String(e); } });
window.addEventListener('pagehide', dispose, { once: true });
const fixture = { show, setView, capture, manifest, dispose, emptyStudioResources, renderer, camera, asset: () => current?.asset,
  projection: () => structuredClone(current!.projection), livePNG: () => { render(); return canvas.toDataURL('image/png'); } };
declare global { interface Window { rectangleFixture: typeof fixture } }
window.rectangleFixture = fixture; setView('Front'); void show(rectangleFixture()).catch(() => {});
