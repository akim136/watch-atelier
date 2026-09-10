import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { collectionPresets, namedColor } from '../../src/render/collections';

for(const {id,name} of collectionPresets) test(`${name}: selector applies canonical composition, preserves head and supports visible text edit`,async({page},testInfo)=>{
  await page.setViewportSize({width:1600,height:1304});
  await page.goto('/tests/assets/preview.html');await page.evaluate(()=>window.assetFixture.ready);
  const head=await page.evaluate(()=>window.assetFixture.view.scene.getObjectByName('case.body')!.uuid);
  const records:unknown[]=[];
    const revision=await page.evaluate(()=>window.assetFixture.design().revision);
    await page.selectOption('[aria-label="Starter fixture"]',id);
    await page.waitForFunction(expected=>window.assetFixture.view.status.ready
      &&window.assetFixture.design().dialColor===expected,namedColor(id));
    expect(await page.locator('#status').innerText()).toBe('Concept only · intended font ready');
    for(const camera of ['Front','Oblique'] as const) {
      await page.evaluate(camera=>window.assetFixture.view.setPreset(camera),camera);
      await page.locator('canvas').screenshot({path:testInfo.outputPath(`${id}-${camera}.png`)});
    }
    const state=await page.evaluate(()=>({design:window.assetFixture.design(),status:window.assetFixture.view.status,
      head:window.assetFixture.view.scene.getObjectByName('case.body')!.uuid}));
    expect(state.design.dialColor).toBe(namedColor(id));expect(state.design.objects[1].text).toBe(name.toUpperCase());
    expect(state.design.revision).toBeGreaterThan(revision);
    expect(state.head).toBe(head);expect(state.status.manifest?.input).toBe(JSON.stringify(state.design));
    records.push({id,...state});
  const before=await page.locator('canvas').screenshot();
  await page.evaluate(async()=>{const f=window.assetFixture;await f.edit([{kind:'text',id:f.design().objects[0].id,patch:{text:'MY WATCH'}}]);});
  const after=await page.locator('canvas').screenshot();expect(before.equals(after)).toBe(false);
  expect(await page.evaluate(()=>window.assetFixture.design().objects[0].text)).toBe('MY WATCH');
  await writeFile(testInfo.outputPath('collection-manifest.json'),JSON.stringify({
    candidate:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTree:execFileSync('git',['status','--short'],{encoding:'utf8'}),records,
  },null,2));
});
