import * as THREE from 'three';
import { fixtureProject } from './fixture';
import { DEFAULT_APPEARANCE } from '../../src/domain/appearance';
import { rectangularRecipes, rectangularArtwork, rectangularArtworkKey, RECTANGLE_VERSION,
  type RectangularId, type RectangularProjection } from '../../src/render/assets/rectangular-recipes';
import type { RectangularBounds, RectangularInput } from '../../src/render/assets/rectangular-watch';

/** Temporary explicit dial-field projection; NEVER assign family IDs to the old saved Design. */
export function rectangleFixture(assetId: RectangularId = 'atelier-rectangle-01'): RectangularProjection {
  const d = fixtureProject().variants[0].design, r = rectangularRecipes[assetId];
  return { assetId, version: RECTANGLE_VERSION, units: 'mm', sourceRevision: { id: d.id, revision: d.revision }, components: d.components,
    texts: [{ ...d.objects[0], text: r.text[0], x: 0, y: 3.8, size: 1.2, color: r.ink },
      { ...d.objects[1], text: r.text[1], x: 0, y: -4.1, size: .72, color: r.ink }],
    indices: { id: d.objects[2].id, length: 1.9, color: r.ink }, track: { ...d.objects[3], color: r.ink }, dialColor: r.dial,
    appearance: structuredClone(DEFAULT_APPEARANCE), presentation: { hour: 10, minute: 10, second: 30 } };
}
export function rectangularBounds(p: RectangularProjection, measure: (text: string, size: number) => number) {
  const records = rectangularArtwork(p), bounds: RectangularBounds[] = [];
  for (const t of records.texts.filter(t => t.text)) {
    const width = measure(t.text, t.size), height = t.size;
    bounds.push({ regionId: t.regionId, semanticId: t.semanticId, x: t.x, y: t.y,
      width: Math.abs(Math.cos(t.rotation)) * width + Math.abs(Math.sin(t.rotation)) * height,
      height: Math.abs(Math.sin(t.rotation)) * width + Math.abs(Math.cos(t.rotation)) * height });
  }
  for (const l of records.lines) bounds.push({ regionId: l.regionId, semanticId: l.semanticId, x: (l.x1 + l.x2) / 2, y: (l.y1 + l.y2) / 2,
    width: Math.abs(l.x2 - l.x1) + Math.max(l.width, .12), height: Math.abs(l.y2 - l.y1) + Math.max(l.width, .12) });
  return bounds;
}
export function rectangleInput(p = rectangleFixture()): RectangularInput {
  const texture = new THREE.DataTexture(new Uint8Array(16).fill(255), 2, 2); texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
  return { projection: p, artwork: { ready: true, key: rectangularArtworkKey(p), texture,
    bounds: rectangularBounds(p, (text, size) => text.length * size * .48) } };
}
