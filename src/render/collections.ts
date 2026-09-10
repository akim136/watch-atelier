import { type Design } from '../domain/model';
import { type Edit } from '../domain/commands';

/** Original color/composition recipes. These propose existing edits; they are not design state. */
export const COLLECTION_VERSION = 'atelier-color-studies-1.0.1';
export const colorPalette = Object.freeze({
  midnight: '#152943', porcelain: '#f3efe5', moss: '#304939', claret: '#552d3c',
  sand: '#c4ad84', ice: '#c8dfe2', copper: '#4a251b', plum: '#42374d', slate: '#4c5862',
  ivory: '#eee7d6', ink: '#1b2226', navy: '#253f64', silver: '#b8c2c8',
  champagne: '#cfb783', terracotta: '#bd7252', teal: '#355b5c', charcoal: '#252e32', paper: '#faf8f0',
});
export type PaletteColor = keyof typeof colorPalette;
export function namedColor(id: PaletteColor): string {
  if (!Object.hasOwn(colorPalette, id)) throw new Error('Unsupported palette color.');
  return colorPalette[id];
}

const studies = Object.freeze([
  Object.freeze({ id: 'midnight', name: 'Midnight', ink: 'ivory', marker: 'baton', length: 2.4, hand: 'baton', strap: 'black', track: true, top: 5.8, size: 1.55 }),
  Object.freeze({ id: 'porcelain', name: 'Porcelain', ink: 'navy', marker: 'baton', length: 1.1, hand: 'leaf', strap: 'black', track: false, top: 6.1, size: 1.35 }),
  Object.freeze({ id: 'moss', name: 'Moss', ink: 'ivory', marker: 'baton', length: 2.7, hand: 'baton', strap: 'cognac', track: true, top: 5.5, size: 1.55 }),
  Object.freeze({ id: 'claret', name: 'Claret', ink: 'ivory', marker: 'dot', length: 1.45, hand: 'leaf', strap: 'black', track: false, top: 6, size: 1.4 }),
  Object.freeze({ id: 'sand', name: 'Sand', ink: 'ink', marker: 'baton', length: 2.3, hand: 'baton', strap: 'black', track: true, top: 5.5, size: 1.65 }),
  Object.freeze({ id: 'ice', name: 'Ice', ink: 'navy', marker: 'dot', length: 1.25, hand: 'baton', strap: 'black', track: true, top: 5.8, size: 1.45 }),
  Object.freeze({ id: 'copper', name: 'Copper', ink: 'ivory', marker: 'baton', length: 1.6, hand: 'leaf', strap: 'cognac', track: false, top: 6, size: 1.45 }),
  Object.freeze({ id: 'plum', name: 'Plum', ink: 'ivory', marker: 'dot', length: 1.65, hand: 'leaf', strap: 'black', track: true, top: 5.7, size: 1.5 }),
  Object.freeze({ id: 'slate', name: 'Slate', ink: 'ivory', marker: 'baton', length: 1.2, hand: 'baton', strap: 'black', track: false, top: 6.2, size: 1.35 }),
] as const);
export type CollectionPreset = typeof studies[number]['id'];
export const collectionPresets = Object.freeze(studies.map(({ id, name }) => Object.freeze({ id, name })));

/** Every call creates fresh payloads and binds text IDs to the caller's canonical design. */
export function collectionEdits(design: Design, id: CollectionPreset): Edit[] {
  const study = studies.find(item => item.id === id);
  if (!study) throw new Error('Unsupported collection preset.');
  const ink = namedColor(study.ink);
  return [
    { kind: 'dialColor', value: namedColor(study.id) },
    { kind: 'text', id: design.objects[0].id, patch: { text: 'ATELIER', x: 0, y: study.top, size: study.size, color: ink } },
    { kind: 'text', id: design.objects[1].id, patch: { text: study.name.toUpperCase(), x: 0, y: -6.5, size: .85, color: ink } },
    { kind: 'markers', patch: { style: study.marker, length: study.length, color: ink } },
    { kind: 'track', patch: { visible: study.track, color: ink } },
    { kind: 'handStyle', value: study.hand },
    { kind: 'strap', value: study.strap },
  ];
}
