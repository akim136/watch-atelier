import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
const pixels = (s: string) => PNG.sync.read(Buffer.from(s.split(',')[1], 'base64')).data;
for (const id of ['atelier-rectangle-01', 'cartier-tank-wsta0106']) test(`rectangular ${id}: four actual views, semantic edit and faithful PNG`, async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/tests/assets/rectangular.html'); await page.waitForFunction(() => window.rectangleFixture?.manifest().accepted > 0);
  await page.selectOption('#asset', id); await expect(page.locator('#status')).toContainText('Ready');
  const records: unknown[] = [];
  for (const view of ['Front', 'Oblique', 'Profile', 'Detail']) {
    await page.selectOption('#view', view);
    const r = await page.evaluate(() => ({ ...window.rectangleFixture.capture(), live: window.rectangleFixture.livePNG() }));
    expect(r.manifest.assetId).toBe(id); expect(r.manifest.view).toBe(view); expect(pixels(r.png).equals(pixels(r.live))).toBe(true);
    await writeFile(info.outputPath(`${id}-${view}.png`), Buffer.from(r.png.split(',')[1], 'base64')); records.push(r.manifest);
  }
  await page.selectOption('#view', 'Front'); const before = await page.evaluate(() => window.rectangleFixture.capture());
  await page.fill('#text', 'EDIT'); await page.locator('#color').fill('#b8cbd0'); await page.fill('#length', '2.4'); await page.uncheck('#track'); await page.click('#apply');
  await expect(page.locator('#status')).toContainText('Ready'); const after = await page.evaluate(() => window.rectangleFixture.capture());
  expect(pixels(before.png).equals(pixels(after.png))).toBe(false); expect(after.manifest.customized).toBe(true);
  expect(await page.evaluate(() => window.rectangleFixture.asset()!.regions.has('track.tick.1'))).toBe(false);
  await writeFile(info.outputPath('edited.png'), Buffer.from(after.png.split(',')[1], 'base64'));
  const isolated = await page.evaluate(async () => {
    const f = window.rectangleFixture, original = f.projection(), results: { edit: string; before: string; after: string; restored: string }[] = [];
    for (const edit of ['text', 'color', 'indices', 'track']) {
      const p = structuredClone(original), before = f.capture().png;
      if (edit === 'text') p.texts[0].text = 'ONLY TEXT';
      if (edit === 'color') p.dialColor = '#c7c0a9';
      if (edit === 'indices') p.indices.length = 1.1;
      if (edit === 'track') p.track.visible = true;
      await f.show(p); const after = f.capture().png; await f.show(original); results.push({ edit, before, after, restored: f.capture().png });
    }
    return results;
  });
  for (const r of isolated) { expect(pixels(r.before).equals(pixels(r.after)), r.edit).toBe(false); expect(pixels(r.before).equals(pixels(r.restored)), `${r.edit} reset`).toBe(true); }
  await writeFile(info.outputPath('manifest.json'), JSON.stringify({ records, edit: after.manifest }, null, 2)); expect(errors).toEqual([]);
});
test('rectangular stale inputs, failed preparation, retry, independent material resets and resources', async ({ page }, info) => {
  await page.goto('/tests/assets/rectangular.html'); await page.waitForFunction(() => window.rectangleFixture?.manifest().accepted > 0);
  const result = await page.evaluate(async () => {
    const f = window.rectangleFixture, original = f.projection(), before = f.capture(), body = f.asset()!.regions.get('case.body');
    const caller = f.projection(); const request = f.show(caller, 150); caller.texts[0].text = 'MUTATED'; await request;
    const immutable = f.projection().texts[0].text;
    const old = f.show({ ...original, dialColor: '#ff0000' }, 300); const fast = await f.show(original); const staleAccepted = await old;
    let failure = false; try { await f.show({ ...original, dialColor: '#000000' }, 0, true); } catch { failure = true; }
    const preserved = f.livePNG(); let exportBlocked = false; try { f.capture(); } catch { exportBlocked = true; }
    await f.show(original); const times: number[] = [], memoryBefore = f.manifest().resources;
    for (let i = 0; i < 25; i++) {
      const start = performance.now(); const p = f.projection(); p.appearance.caseMaterial = i % 2 ? 'titanium-look' : 'bronze-look'; await f.show(p); times.push(performance.now() - start);
    }
    await f.show(original); const after = f.capture(); return { before, after, immutable, fast, staleAccepted, failure, preserved, exportBlocked,
      bodyRetained: body === f.asset()!.regions.get('case.body'), memoryBefore, times };
  });
  for (const [name, png] of [['before-reset', result.before.png], ['after-reset', result.after.png]] as const)
    await writeFile(info.outputPath(`${name}.png`), Buffer.from(png.split(',')[1], 'base64'));
  expect(result.immutable).toBe('ATELIER'); expect(result.fast).toBe(true); expect(result.staleAccepted).toBe(false); expect(result.failure).toBe(true); expect(result.exportBlocked).toBe(true);
  expect(pixels(result.before.png).equals(pixels(result.preserved))).toBe(true); expect(pixels(result.before.png).equals(pixels(result.after.png))).toBe(true);
  expect(result.bodyRetained).toBe(true); expect(result.memoryBefore).toEqual(result.after.manifest.resources);
  const beforeOrbit = await page.evaluate(() => window.rectangleFixture.camera.position.toArray());
  const rect = await page.locator('canvas').boundingBox(); await page.mouse.move(rect!.x + 400, rect!.y + 300); await page.mouse.down();
  await page.mouse.move(rect!.x + 550, rect!.y + 350, { steps: 8 }); await page.mouse.up();
  expect(await page.evaluate(() => window.rectangleFixture.camera.position.toArray())).not.toEqual(beforeOrbit);
  await writeFile(info.outputPath('metrics.json'), JSON.stringify({ before: result.before.manifest, after: result.after.manifest, times: result.times }, null, 2));
});
test('rectangular missing font is explicit and blocks faithful output', async ({ page }) => {
  await page.route('**/fonts/**', r => r.abort()); await page.goto('/tests/assets/rectangular.html'); await expect(page.locator('#status')).toContainText('font is unavailable');
  expect(await page.evaluate(() => { try { window.rectangleFixture.capture(); return false; } catch { return true; } })).toBe(true);
});
test('rectangular family and semantic-owner replacement releases GPU resources', async ({ page }, info) => {
  await page.goto('/tests/assets/rectangular.html'); await page.waitForFunction(() => window.rectangleFixture?.manifest().accepted > 0);
  const r = await page.evaluate(async () => {
    const f = window.rectangleFixture, original = f.projection(), first = f.asset(), memory = f.manifest().resources;
    const another = structuredClone(original); another.sourceRevision.id = crypto.randomUUID(); another.texts[0].id = crypto.randomUUID();
    await f.show(another); const remapped = f.asset()!.regions.get('text.0')!.userData.semanticId === another.texts[0].id;
    const replaced = first !== f.asset(), retired = first!.root.children.length === 0;
    await f.show(original);
    for (let i = 0; i < 10; i++) { const other = structuredClone(original); other.sourceRevision.id = crypto.randomUUID(); await f.show(other); await f.show(original); }
    const after = f.capture(); f.dispose(); const final = { ...f.renderer.info.memory };
    return { remapped, replaced, retired, memory, after: after.manifest, final, control: f.emptyStudioResources() };
  });
  expect(r.remapped && r.replaced && r.retired).toBe(true); expect(r.memory).toEqual(r.after.resources);
  await writeFile(info.outputPath('mount-metrics.json'), JSON.stringify(r, null, 2));
  // r186 caches DFG_LUT globally. The independent physical-box control proves
  // that one texture belongs to Three, not to a retired watch or artwork map.
  expect(r.control).toEqual({ geometries: 0, textures: 1 }); expect(r.final).toEqual(r.control);
});
