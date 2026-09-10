import { test, expect } from '@playwright/test';

test('first template: canonical edit to real WebGL, mappings, reuse and four views',async({page},testInfo)=>{
  const errors: string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/tests/assets/preview.html');
  await page.evaluate(()=>window.assetFixture.ready);
  const initial=await page.evaluate(()=>window.assetFixture.view.status);
  expect(initial.ready).toBe(true);expect(initial.manifest?.inputHash).toMatch(/^[a-f0-9]{64}$/);
  for(const preset of ['Front','Oblique','Profile','Detail'] as const) {
    await page.evaluate(preset=>window.assetFixture.view.setPreset(preset),preset);
    await page.locator('canvas').screenshot({path:testInfo.outputPath(`${preset}.png`)});
  }
  const observed=await page.evaluate(async()=>{
    const f=window.assetFixture,d=f.design(),before=JSON.stringify(d);
    const body=f.view.scene.getObjectByName('case.body') as import('three').Mesh;
    const geometry=body.geometry;
    const pngBefore=await f.exportPNG(d,'Front');
    const accepted=await f.edit([{kind:'dialColor',value:'#305458'},
      {kind:'text',id:d.objects[0].id,patch:{text:'COASTAL'}},
      {kind:'markers',patch:{length:2.3}},{kind:'track',patch:{visible:false}}]);
    const after=f.design(),pngAfter=await f.exportPNG(after,'Front');
    const model=f.buildWatch(after);
    const mapped=model.selectables.map(node=>node.userData.semanticId);
    const retained=body==f.view.scene.getObjectByName('case.body')&&body.geometry===geometry;
    model.dispose();model.dispose();
    return {beforeUntouched:before===JSON.stringify(d),retained,changed:JSON.stringify(d)!==JSON.stringify(after),
      input:f.view.status.manifest?.input,expected:JSON.stringify(accepted.variants[0].design),
      textMapped:mapped.includes(d.objects[0].id),markerMapped:mapped.includes(d.objects[2].id),hiddenTrackAbsent:!mapped.includes(d.objects[3].id),
      pngChanged:await pngBefore.text()!==await pngAfter.text()};
  });
  expect(observed).toMatchObject({beforeUntouched:true,retained:true,changed:true,textMapped:true,markerMapped:true,hiddenTrackAbsent:true,pngChanged:true});
  expect(observed.input).toBe(observed.expected);expect(errors).toEqual([]);
});
