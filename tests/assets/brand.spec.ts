import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

const ids = ['gmt-master-ii', 'submariner', 'day-date', 'daytona', 'royal-oak', 'nautilus'] as const;
const pixels = (s: string) => PNG.sync.read(Buffer.from(s.split(',')[1], 'base64'));
for (const id of ids) test(`model study ${id}: four views and faithful renderer output`, async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/tests/assets/brand.html');
  await page.waitForFunction(() => window.brandFixture?.manifest().accepted > 0);
  await page.evaluate(id => window.brandFixture.show(id), id);
  const records: unknown[] = [];
  for (const view of ['Front', 'Oblique', 'Profile', 'Detail'] as const) {
    await page.selectOption('#view', view);
    const result = await page.evaluate(() => ({ live: window.brandFixture.livePNG(), ...window.brandFixture.capture() }));
    expect(result.manifest.id).toBe(id); expect(result.manifest.view).toBe(view);
    expect(result.manifest.artworkHashes).toHaveLength(2);
    expect(new Set(result.manifest.regions.map(r => r.semanticId)).size).toBe(6);
    const image = pixels(result.png); expect([image.width, image.height]).toEqual([1600, 1200]);
    expect(image.data.equals(pixels(result.live).data)).toBe(true);
    await writeFile(info.outputPath(`${id}-${view}.png`), Buffer.from(result.png.split(',')[1], 'base64'));
    records.push(result.manifest);
  }
  await writeFile(info.outputPath('manifest.json'), JSON.stringify(records, null, 2));
  expect(errors).toEqual([]);
});

test('model studies: valid edits, stale dependencies, replacement resources and orbit', async ({ page }, info) => {
  await page.goto('/tests/assets/brand.html'); await page.waitForFunction(() => window.brandFixture?.manifest().accepted > 0);
  const result = await page.evaluate(async () => {
    const f = window.brandFixture; await f.show('day-date'); const original = f.capture();
    await f.show('day-date', { ...original.manifest.presentation, date: 23, weekday: 'MONDAY' }); const edited = f.capture();
    const caller = { ...original.manifest.presentation };
    const captured = f.show('day-date', caller, 150); caller.date = 31;
    await captured; const capturedPresentation = f.capture().manifest.presentation;
    const stale = f.show('day-date', original.manifest.presentation, 300);
    let blocked = false; try { f.capture(); } catch { blocked = true; }
    const newer = await f.show('nautilus'); const staleAccepted = await stale;
    const finalId = f.manifest().id;
    await f.show('day-date'); const before = f.manifest(), times: number[] = [];
    for (let i = 0; i < 12; i++) { const start = performance.now(); await f.show(i % 2 ? 'royal-oak' : 'daytona'); times.push(performance.now() - start); }
    await f.show('day-date'); const restored = f.capture();
    return { original, edited, restored, before, times, blocked, newer, staleAccepted, finalId, capturedPresentation };
  });
  expect(result.blocked).toBe(true); expect(result.newer).toBe(true); expect(result.staleAccepted).toBe(false); expect(result.finalId).toBe('nautilus');
  expect(result.capturedPresentation.date).toBe(10);
  const a = pixels(result.original.png).data, b = pixels(result.edited.png).data;
  let differences = 0; for (let i = 0; i < a.length; i += 4) if (!a.subarray(i, i + 3).equals(b.subarray(i, i + 3))) differences++;
  expect(differences).toBeGreaterThan(100); expect(a.equals(pixels(result.restored.png).data)).toBe(true);
  expect(result.restored.manifest.resources).toEqual(result.before.resources);
  const beforeOrbit = await page.evaluate(() => window.brandFixture.camera.position.toArray());
  const rect = await page.locator('canvas').boundingBox();
  await page.mouse.move(rect!.x + 400, rect!.y + 300); await page.mouse.down();
  await page.mouse.move(rect!.x + 550, rect!.y + 360, { steps: 8 }); await page.mouse.up();
  expect(await page.evaluate(() => window.brandFixture.camera.position.toArray())).not.toEqual(beforeOrbit);
  await writeFile(info.outputPath('metrics.json'), JSON.stringify({ before: result.before, after: result.restored.manifest,
    timesMs: result.times, label: 'warm artwork preparation, hash, create/dispose and render submission, not GPU completion', differences }, null, 2));
});

test('model study missing font blocks capture with an explicit error', async ({ page }) => {
  await page.route('**/fonts/**', route => route.abort());
  await page.goto('/tests/assets/brand.html'); await expect(page.locator('#status')).toContainText('font is unavailable');
  expect(await page.evaluate(() => { try { window.brandFixture.capture(); return false; } catch { return true; } })).toBe(true);
});
