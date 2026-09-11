import { z } from 'zod';
import { color, textSchema, trackSchema, componentSchema } from '../../domain/model';
import { appearanceSchema } from '../../domain/appearance';

export const RECTANGLE_VERSION = 'atelier-rectangular-1.0.0' as const;
export const RECTANGLE_MATERIAL_VERSION = 'atelier-rectangular-finishes-1.0.0' as const;
export const rectangularRecipes = Object.freeze({
  'atelier-rectangle-01': Object.freeze({ name: 'Rectangular dress', collection: 'original', width: 28, height: 36,
    thickness: 7.6, dialWidth: 22, dialHeight: 28, strapWidth: 20, strap: 'leather', layout: 'cardinal',
    dial: '#ded8c9', ink: '#303c40', hands: '#374b62', text: Object.freeze(['ATELIER', 'RECTANGLE']), reference: null, source: null }),
  'cartier-tank-wsta0106': Object.freeze({ name: 'Tank Must WSTA0106', collection: 'reference-study', width: 25.5, height: 33.7,
    thickness: 6.6, dialWidth: 20.2, dialHeight: 26.4, strapWidth: 19, strap: 'bracelet', layout: 'roman',
    dial: '#e5e4de', ink: '#242a2c', hands: '#244c85', text: Object.freeze(['CARTIER', '']), reference: 'WSTA0106',
    source: 'https://int.cartier.com/en/collections/watches/choose-your-watch/by-bracelet-or-straps/interchangeable-bracelets/interchangeable-metal/wsta0106-tank-must-de-cartier-watch.html' }),
});
export type RectangularId = keyof typeof rectangularRecipes;

/** Rendering-only projection. Main owns saved template/pattern identity and mutations. */
const projection = z.strictObject({
  assetId: z.enum(['atelier-rectangle-01', 'cartier-tank-wsta0106']), version: z.literal(RECTANGLE_VERSION), units: z.literal('mm'),
  sourceRevision: z.strictObject({ id: z.string().uuid(), revision: z.number().int().nonnegative() }),
  components: z.array(componentSchema).length(6), texts: z.tuple([textSchema, textSchema]),
  indices: z.strictObject({ id: z.string().uuid(), length: z.number().min(.5).max(3), color }),
  track: trackSchema, dialColor: color, appearance: appearanceSchema,
  presentation: z.strictObject({ hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59), second: z.number().min(0).lt(60) }),
});
export type RectangularProjection = z.infer<typeof projection>;
export function requireProjection(input: unknown): RectangularProjection {
  const p = projection.parse(input), ids = [...p.components.map(c => c.id), ...p.texts.map(t => t.id), p.indices.id, p.track.id];
  if (new Set(ids).size !== ids.length || new Set(p.components.map(c => c.role)).size !== 6) throw new Error('Duplicate/missing rectangular semantic identity.');
  if (p.appearance.bezel.style !== 'original') throw new Error('This dress family does not support colored or rotating bezels.');
  if (rectangularRecipes[p.assetId].strap !== 'bracelet' && p.appearance.braceletMaterial !== 'original') throw new Error('Bracelet finish requires the bracelet recipe.');
  return p;
}
export function rectangularArtworkKey(input: RectangularProjection) {
  const p = requireProjection(input);
  return JSON.stringify([p.assetId, p.version, p.dialColor, p.texts, p.indices, p.track]);
}
/** A changed recipe or semantic owner needs a detached replacement, not update. */
export function rectangularInstanceKey(input: RectangularProjection) {
  const p = requireProjection(input);
  return JSON.stringify([p.assetId, p.version, p.sourceRevision.id, p.components, p.texts.map(t => t.id), p.indices.id, p.track.id]);
}
export type ArtworkText = { regionId: string; semanticId: string; text: string; x: number; y: number; size: number; color: string; rotation: number };
export type ArtworkLine = { regionId: string; semanticId: string; x1: number; y1: number; x2: number; y2: number; width: number; color: string };
export function rectanglePoint(turn: number, halfWidth: number, halfHeight: number): [number, number] {
  const a = turn * Math.PI * 2, x = Math.sin(a), y = Math.cos(a);
  // Exactly zero direction components must not select a zero scale.
  const distance = Math.min(Math.abs(x) > 1e-12 ? halfWidth / Math.abs(x) : Infinity,
    Math.abs(y) > 1e-12 ? halfHeight / Math.abs(y) : Infinity);
  return [x * distance, y * distance];
}
/** Retained strings/paths in mm; the host rasterizes once without stretching glyphs. */
export function rectangularArtwork(input: RectangularProjection) {
  const p = requireProjection(input), r = rectangularRecipes[p.assetId], texts: ArtworkText[] = [], lines: ArtworkLine[] = [];
  p.texts.forEach((t, i) => texts.push({ regionId: `text.${i}`, semanticId: t.id, text: t.text, x: t.x, y: t.y, size: t.size, color: t.color, rotation: 0 }));
  const roman = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  for (let i = 0; i < 12; i++) {
    const [x, y] = rectanglePoint(i / 12, r.dialWidth / 2 - 1.65, r.dialHeight / 2 - 1.8);
    if (r.layout === 'roman' || i % 3 === 0) texts.push({ regionId: `indices.${i}`, semanticId: p.indices.id,
      text: r.layout === 'roman' ? roman[i] : String(i || 12), x, y,
      size: (r.layout === 'roman' ? 1.75 : 1.55) * (.65 + .35 * p.indices.length / 1.9), color: p.indices.color,
      rotation: r.layout === 'roman' ? -i * Math.PI / 6 : 0 });
    else {
      const [endX, endY] = rectanglePoint(i / 12, r.dialWidth / 2 - 1.65 - p.indices.length * .4, r.dialHeight / 2 - 1.8 - p.indices.length * .4);
      lines.push({ regionId: `indices.${i}`, semanticId: p.indices.id, x1: x, y1: y, x2: endX, y2: endY, width: .12, color: p.indices.color });
    }
  }
  if (p.track.visible) {
    const w = r.dialWidth / 2 - 3.15, h = r.dialHeight / 2 - 3.45;
    for (const [inset, tag] of [[0, 'outer'], [.42, 'inner']] as const) {
      const points = [[-w + inset, -h + inset], [w - inset, -h + inset], [w - inset, h - inset], [-w + inset, h - inset]];
      points.forEach(([x, y], i) => lines.push({ regionId: `track.${tag}.${i}`, semanticId: p.track.id,
        x1: x, y1: y, x2: points[(i + 1) % 4][0], y2: points[(i + 1) % 4][1], width: .045, color: p.track.color }));
    }
    for (let i = 0; i < 60; i++) {
      const a = rectanglePoint(i / 60, w, h), b = rectanglePoint(i / 60, w - .42, h - .42);
      lines.push({ regionId: `track.tick.${i}`, semanticId: p.track.id, x1: a[0], y1: a[1], x2: b[0], y2: b[1], width: i % 5 ? .035 : .09, color: p.track.color });
    }
  }
  return { texts, lines, width: r.dialWidth, height: r.dialHeight, textureSpan: 32, color: p.dialColor };
}
