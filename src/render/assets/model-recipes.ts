/** Named third-party model studies. Authored reconstructions, never official product meshes. */
export const MODEL_STUDY_VERSION = 'named-model-studies-1.0.0' as const;
export const modelStudyRecipes = Object.freeze({
  'gmt-master-ii': Object.freeze({ brand: 'Rolex', model: 'GMT-Master II', reference: '126710BLNR-0003',
    source: 'https://www.rolex.com/en-us/watches/gmt-master-ii/m126710blnr-0003',
    family: 'round', diameter: 40, dial: '#111820', metal: '#c1c8cc', date: true, bezel: 'gmt', bracelet: 'oyster' }),
  submariner: Object.freeze({ brand: 'Rolex', model: 'Submariner', reference: '124060-0001',
    source: 'https://www.rolex.com/en-us/watches/submariner/m124060-0001',
    family: 'round', diameter: 41, dial: '#151a1c', metal: '#bcc4c9', date: false, bezel: 'dive', bracelet: 'oyster' }),
  'day-date': Object.freeze({ brand: 'Rolex', model: 'Day-Date 40', reference: '228238-0005',
    source: 'https://www.rolex.com/en-us/watches/day-date/m228238-0005',
    family: 'round', diameter: 40, dial: '#c9aa69', metal: '#d6b573', date: true, bezel: 'fluted', bracelet: 'president' }),
  daytona: Object.freeze({ brand: 'Rolex', model: 'Cosmograph Daytona', reference: '126500LN-0001',
    source: 'https://www.rolex.com/en-us/watches/cosmograph-daytona/m126500ln-0001',
    family: 'round', diameter: 40, dial: '#e7e7e1', metal: '#c4cbd0', date: false, bezel: 'tachymeter', bracelet: 'oyster' }),
  'royal-oak': Object.freeze({ brand: 'Audemars Piguet', model: 'Royal Oak', reference: '15510ST.OO.1320ST.06',
    source: 'https://www.audemarspiguet.com/en/watch-collection/royal-oak/15510ST.OO.1320ST.06',
    family: 'octagonal', diameter: 41, dial: '#244557', metal: '#b8c3cb', date: true, bezel: 'octagonal', bracelet: 'integrated-twin' }),
  nautilus: Object.freeze({ brand: 'Patek Philippe', model: 'Nautilus', reference: '5811/1G-001',
    source: 'https://www.patek.com/en/collection/nautilus/5811-1g-001',
    family: 'porthole', diameter: 41, dial: '#1e3a52', metal: '#c1c8ce', date: true, bezel: 'rounded-octagonal', bracelet: 'integrated-center' }),
});
export type ModelStudyId = keyof typeof modelStudyRecipes;
export interface StudyPresentation {
  readonly hour: number; readonly minute: number; readonly second: number;
  readonly date: number; readonly weekday: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
  readonly gmtHour: number; readonly elapsedSeconds: number;
}
export const STUDY_PRESENTATION: StudyPresentation = Object.freeze({ hour: 10, minute: 10, second: 30,
  date: 10, weekday: 'THURSDAY', gmtHour: 16, elapsedSeconds: 8257 });

export function requireStudy(id: string, version: string): asserts id is ModelStudyId {
  if (version !== MODEL_STUDY_VERSION) throw new Error('Unsupported model study version.');
  if (!Object.hasOwn(modelStudyRecipes, id)) throw new Error(`Unsupported model study: ${id}`);
}
export function requireStudyPresentation(p: StudyPresentation) {
  const bound = (n: number, max: number) => Number.isInteger(n) && n >= 0 && n < max;
  if (!p || !bound(p.hour, 24) || !bound(p.minute, 60) || !bound(p.second, 60) ||
      !bound(p.gmtHour, 24) || !bound(p.elapsedSeconds, 43200) || !Number.isInteger(p.date) || p.date < 1 || p.date > 31 ||
      !['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].includes(p.weekday)) {
    throw new Error('Invalid model study presentation.');
  }
}
export function studyArtworkKey(id: ModelStudyId, p: StudyPresentation) {
  requireStudy(id, MODEL_STUDY_VERSION); requireStudyPresentation(p);
  return JSON.stringify([MODEL_STUDY_VERSION, id, p.hour, p.minute, p.second, p.date, p.weekday, p.gmtHour, p.elapsedSeconds]);
}

/** Retained text records in mm. Fixture hosts rasterize these; no photographed dial artwork. */
export interface StudyText {
  readonly regionId: string; readonly text: string; readonly x: number; readonly y: number;
  readonly size: number; readonly color: string; readonly rotation: number;
  readonly slot: 'dial' | 'bezel';
}
export function studyText(id: ModelStudyId, p: StudyPresentation): readonly StudyText[] {
  requireStudy(id, MODEL_STUDY_VERSION); requireStudyPresentation(p);
  const recipe = modelStudyRecipes[id], dark = id === 'day-date' || id === 'daytona';
  const ink = dark ? '#20272b' : '#e3e4dc', texts: StudyText[] = [];
  const add = (regionId: string, text: string, x: number, y: number, size: number, color = ink, slot: 'dial' | 'bezel' = 'dial', rotation = 0) =>
    texts.push({ regionId, text, x, y, size, color, slot, rotation });
  if (recipe.brand === 'Rolex') {
    add('brand.wordmark', 'ROLEX', 0, 5.9, 1.23);
    add('brand.line2', 'OYSTER PERPETUAL', 0, 4.65, .67);
    if (id === 'day-date') add('dial.model-label', 'DAY-DATE', 0, 3.65, .79);
    else if (id === 'daytona') {
      add('dial.model-label', 'COSMOGRAPH', 0, 3.6, .64);
      add('dial.daytona-label', 'DAYTONA', 0, -3.1, .7, '#9d3426');
    } else add('dial.model-label', recipe.model.toUpperCase(), 0, -5.9, .81);
  } else {
    add('brand.wordmark', recipe.brand.toUpperCase(), 0, 5.7, id === 'royal-oak' ? .88 : .99);
    if (id === 'nautilus') add('brand.location', 'GENEVE', 0, 4.5, .58);
  }
  if (recipe.date) add('calendar.date', String(p.date), 10.6, 0, 1.65, '#152025');
  if (id === 'day-date') add('calendar.weekday', p.weekday, 0, 11.4, .87, '#1a2025');
  if (id === 'gmt-master-ii' || id === 'submariner') {
    const values = id === 'gmt-master-ii' ? [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22] : [10, 20, 30, 40, 50];
    for (const value of values) {
      const angle = value / (id === 'gmt-master-ii' ? 24 : 60) * Math.PI * 2;
      add(`bezel.numeral.${value}`, String(value), Math.sin(angle) * 18.05, Math.cos(angle) * 18.05, 1.5, '#e4e5df', 'bezel', -angle);
    }
  }
  if (id === 'daytona') {
    for (const value of [60, 65, 70, 75, 80, 90, 100, 120, 140, 160, 200, 240, 300, 400]) {
      const angle = 60 / value * Math.PI * 2;
      add(`bezel.tachymeter.${value}`, String(value), Math.sin(angle) * 18.05, Math.cos(angle) * 18.05, .94, '#e5e6e0', 'bezel', -angle);
    }
    for (const [role, x, y, top, right, bottom, left] of [
      ['minutes', 6.55, 0, '30', '10', '20', ''], ['hours', -6.55, 0, '12', '3', '6', '9'],
      ['running-seconds', 0, -6.65, '60', '20', '40', ''],
    ] as const) {
      for (const [suffix, label] of [['top', top], ['right', right], ['bottom', bottom], ['left', left]] as const) {
        const angle = Number(label) / Number(top) * Math.PI * 2;
        if (label) add(`counter.${role}.label.${suffix}`, label, x + Math.sin(angle) * 2.47, y + Math.cos(angle) * 2.47, .67, '#f0efe9');
      }
    }
  }
  return texts;
}
