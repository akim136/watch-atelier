/** Original design-authored millimeter recipe. Appearance only; no physical qualification. */
export const RECIPE = Object.freeze({
  template: 'atelier-39-v1', version: '1.1.0', materials: 'atelier-looks-1.1.0',
  environment: 'atelier-softboxes-1.0.0', cameras: 'atelier-views-1.0.0',
  dialRadius: 16, dialZ: 3.2, crystalTop: 5.4, backZ: -5.4,
  dialPixels: 2048, radialSegments: 128, seed: 3901,
  time: Object.freeze({ hour: 10, minute: 10, second: 30 }),
});

/** Clockwise radians from twelve; Three rotation around +Z has the opposite sign. */
export const clockRotation = (turns: number) => -turns * Math.PI * 2;
export const clockPoint = (turns: number, radius: number): [number, number] =>
  [Math.sin(turns * Math.PI * 2) * radius, Math.cos(turns * Math.PI * 2) * radius];

export const handRotations = () => ({
  hour: clockRotation((RECIPE.time.hour % 12 + RECIPE.time.minute / 60 + RECIPE.time.second / 3600) / 12),
  minute: clockRotation((RECIPE.time.minute + RECIPE.time.second / 60) / 60),
  second: clockRotation(RECIPE.time.second / 60),
});
