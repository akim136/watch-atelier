import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

for (const id of ['pencil', 'sword', 'dauphine', 'spade'] as const) {
  test(`hand specimen ${id}: actual geometry, four views and faithful capture`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/tests/assets/parts.html');
    await page.waitForFunction(() => !!window.partsFixture);
    await page.selectOption('#hand', id);
    await expect(page.locator('#caption')).toContainText(id[0].toUpperCase() + id.slice(1));
    const records: unknown[] = [];
    for (const view of ['Front', 'Oblique', 'Profile', 'Detail'] as const) {
      await page.selectOption('#view', view);
      const result = await page.evaluate(async () => {
        const f = window.partsFixture, live = f.livePNG(), output = await f.capture();
        const bytes = new Uint8Array(await output.blob.arrayBuffer()); let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return { live: live.split(',')[1], png: btoa(binary), manifest: output.manifest };
      });
      expect(result.manifest.selection).toEqual({ kind: 'hands', recipeId: id, finishId: 'titanium-look', view });
      expect(result.manifest.pickables.length).toBeGreaterThanOrEqual(5);
      expect(result.manifest.pickables.every(m => m.semanticId === result.manifest.semanticId)).toBe(true);
      const png = Buffer.from(result.png, 'base64'), decoded = PNG.sync.read(png);
      expect([decoded.width, decoded.height]).toEqual([1024, 1024]);
      expect(decoded.data.equals(PNG.sync.read(Buffer.from(result.live, 'base64')).data)).toBe(true);
      await writeFile(info.outputPath(`${id}-${view}.png`), png);
      records.push({ ...result.manifest, file: `${id}-${view}.png`, decodedByteDifferences: 0 });
    }
    await writeFile(info.outputPath('manifest.json'), JSON.stringify(records, null, 2));
    expect(errors).toEqual([]);
  });
}

test('five-finish sheet, meaningful hand/finish changes and bounded GPU resources', async ({ page }, info) => {
  await page.goto('/tests/assets/parts.html'); await page.waitForFunction(() => !!window.partsFixture);
  const observation = await page.evaluate(async () => {
    const f = window.partsFixture;
    f.showHand('pencil', 'titanium-look'); f.setView('Front');
    const before = f.manifest(), baseline = f.livePNG();
    const rendered: Record<string, string> = {};
    for (const id of ['pencil', 'sword', 'dauphine', 'spade'] as const) {
      f.showHand(id, 'titanium-look'); rendered[id] = f.livePNG();
    }
    f.showHand('pencil', 'champagne-gold-look'); const gold = f.livePNG();
    f.showHand('pencil', 'titanium-look');
    const timing: number[] = [];
    for (let i = 0; i < 25; i++) {
      const start = performance.now(); f.showHand(i % 2 ? 'dauphine' : 'spade', i % 2 ? 'bronze-look' : 'ink-ceramic-look');
      timing.push(performance.now() - start);
    }
    f.showHand('pencil', 'titanium-look');
    const after = f.manifest(); timing.sort((a, b) => a - b);
    return { before, after, baseline, rendered, gold, retainedPixels: f.livePNG(), timing: {
      samples: 25, medianMs: timing[12], p95Ms: timing[23], label: 'synchronous create/dispose plus render submission; not GPU completion' } };
  });
  const pixels = (data: string) => PNG.sync.read(Buffer.from(data.split(',')[1], 'base64')).data;
  const different = (a: Buffer, b: Buffer) => { let count = 0; for (let i = 0; i < a.length; i += 4) if (!a.subarray(i, i + 3).equals(b.subarray(i, i + 3))) count++; return count; };
  const images = Object.values(observation.rendered).map(pixels);
  for (let a = 0; a < images.length; a++) for (let b = a + 1; b < images.length; b++) expect(different(images[a], images[b])).toBeGreaterThan(250);
  expect(different(pixels(observation.baseline), pixels(observation.gold))).toBeGreaterThan(500);
  expect(pixels(observation.baseline).equals(pixels(observation.retainedPixels))).toBe(true);
  expect(observation.after.resources.geometries).toBeLessThanOrEqual(observation.before.resources.geometries + 2);
  expect(observation.after.resources.textures).toBeLessThanOrEqual(observation.before.resources.textures + 2);
  const cameraBefore = await page.evaluate(() => window.partsFixture.camera.position.toArray());
  const rect = await page.locator('canvas').boundingBox();
  await page.mouse.move(rect!.x + 450, rect!.y + 400); await page.mouse.down();
  await page.mouse.move(rect!.x + 570, rect!.y + 440, { steps: 8 }); await page.mouse.up();
  expect(await page.evaluate(() => window.partsFixture.camera.position.toArray())).not.toEqual(cameraBefore);
  await page.selectOption('#view', 'Detail');
  await page.click('#materials');
  await expect(page.locator('#view')).toHaveValue('Front');
  const sheet = await page.evaluate(() => window.partsFixture.manifest());
  expect(sheet.selection.kind).toBe('materials');
  const sheetBytes = await page.locator('canvas').screenshot({ path: info.outputPath('five-materials.png') });
  const sheetPixels = PNG.sync.read(sheetBytes), background = sheetPixels.data.subarray(0, 3);
  // A visible empty border is required; the first inspected sheet clipped its outside plates.
  for (let i = 0; i < 1024; i++) for (const [x, y] of [[i, 8], [i, 1015], [8, i], [1015, i]]) {
    const offset = (y * 1024 + x) * 4;
    expect(sheetPixels.data.subarray(offset, offset + 3).equals(background)).toBe(true);
  }
  const metrics = { before: observation.before, after: observation.after, timing: observation.timing };
  await writeFile(info.outputPath('metrics.json'), JSON.stringify({ ...metrics, sheet }, null, 2));
  await page.selectOption('#hand', 'sword');
  await expect(page.locator('#view')).toHaveValue('Front');
  expect(await page.evaluate(() => window.partsFixture.manifest().selection.view)).toBe('Front');
});
