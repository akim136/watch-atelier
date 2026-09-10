import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { execFileSync } from 'node:child_process';

test('three editable starters: reproducible four-view previews and actual renderer metrics',async({page},testInfo)=>{
  await page.setViewportSize({width:1600,height:1304});
  await page.goto('/tests/assets/preview.html');await page.evaluate(()=>window.assetFixture.ready);
  const records: unknown[]=[];
  for(const preset of ['instrument','gallery','coastal'] as const) {
    await page.selectOption('[aria-label="Starter fixture"]',preset);
    await page.waitForFunction(()=>window.assetFixture.view.status.ready);
    for(const camera of ['Front','Oblique','Profile','Detail'] as const) {
      await page.evaluate(camera=>window.assetFixture.view.setPreset(camera),camera);
      const path=testInfo.outputPath(`${preset}-${camera}.png`);
      await page.locator('canvas').screenshot({path});
      const state=await page.evaluate(()=>{
        const f=window.assetFixture,gl=f.view.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
        return {design:f.design(),status:f.view.status,browser:navigator.userAgent,
          gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),three:f.THREE.REVISION};
      });
      expect(state.status.ready).toBe(true);expect(state.status.manifest?.width).toBe(1600);expect(state.status.manifest?.height).toBe(1200);
      records.push({preset,camera,file:path,...state});
    }
  }
  const path=testInfo.outputPath('preview-manifest.json');
  await writeFile(path,JSON.stringify({candidate:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTree:execFileSync('git',['status','--short'],{encoding:'utf8'}),records},null,2));
  await testInfo.attach('preview-manifest',{path,contentType:'application/json'});
});

test('PNG matches the real live canvas and captures call-time design before mutation',async({page},testInfo)=>{
  await page.setViewportSize({width:1600,height:1304});
  await page.goto('/tests/assets/preview.html');await page.evaluate(()=>window.assetFixture.ready);
  const output=await page.evaluate(async()=>{
    const f=window.assetFixture;
    await f.edit(f.starterEdits(f.design(),'coastal'));
    await f.edit([{kind:'text',id:f.design().objects[0].id,patch:{text:'EDITED & <SAFE>'}}]);
    const design=f.design(),captured=JSON.stringify(design);f.view.setPreset('Front');f.view.render();
    const live=await new Promise<Blob>(resolve=>f.view.canvas.toBlob(blob=>resolve(blob!),'image/png'));
    const pending=f.exportPNG(design,'Front');design.dialColor='#ff0000';design.objects[0].text='TOO LATE';
    const exported=await pending;
    const encoded=async(blob:Blob)=>{
      const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
      for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      return btoa(binary);
    };
    return {live:await encoded(live),exported:await encoded(exported),captured,manifest:f.view.status.manifest};
  });
  const liveBytes=Buffer.from(output.live,'base64'),exportedBytes=Buffer.from(output.exported,'base64');
  const live=PNG.sync.read(liveBytes),exported=PNG.sync.read(exportedBytes);
  await writeFile(testInfo.outputPath('live.png'),liveBytes);
  await writeFile(testInfo.outputPath('exported.png'),exportedBytes);
  let differences=0;for(let i=0;i<exported.data.length;i++)if(exported.data[i]!==live.data[i])differences++;
  await writeFile(testInfo.outputPath('pixel-comparison.json'),JSON.stringify({live:[live.width,live.height],exported:[exported.width,exported.height],differences,manifest:output.manifest},null,2));
  expect(exported.width).toBe(1600);expect(exported.height).toBe(1200);
  expect(exported.data.equals(live.data)).toBe(true);expect(output.manifest?.input).toBe(output.captured);
  const path=testInfo.outputPath('faithful-edited-export.png');await writeFile(path,exportedBytes);
  await testInfo.attach('faithful-export',{path,contentType:'image/png'});
});

test('warm edits and 25 variant switches have bounded real GPU resource counts',async({page},testInfo)=>{
  await page.goto('/tests/assets/preview.html');await page.evaluate(()=>window.assetFixture.ready);
  const result=await page.evaluate(async()=>{
    const f=window.assetFixture;
    await f.edit(f.starterEdits(f.design(),'instrument'));
    const before=f.view.status.resources,edits:number[]=[],switches:number[]=[],orbitFrames:number[]=[];
    for(let i=0;i<25;i++) {
      let start=performance.now();await f.edit([{kind:'dialColor',value:i%2===0?'#354047':'#252e32'}]);edits.push(performance.now()-start);
      start=performance.now();await f.edit(f.starterEdits(f.design(),i%2===0?'gallery':'coastal'));switches.push(performance.now()-start);
    }
    await f.edit(f.starterEdits(f.design(),'instrument'));const after=f.view.status.resources;
    for(let i=0;i<90;i++) {
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      const start=performance.now();const angle=i/90*Math.PI*.6;
      f.view.setCamera({position:[Math.sin(angle)*65,35,Math.cos(angle)*45+90],target:[0,0,0],zoom:1});
      orbitFrames.push(performance.now()-start);
    }
    const stats=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return {samples:values.length,median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.ceil(sorted.length*.95)-1],max:Math.max(...values)};};
    return {before,after,editsMs:stats(edits),switchesMs:stats(switches),orbitRenderCpuMs:stats(orbitFrames),draw:f.view.status.draw};
  });
  expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries+2);
  expect(result.after.textures).toBeLessThanOrEqual(result.before.textures+2);
  const path=testInfo.outputPath('performance.json');await writeFile(path,JSON.stringify(result,null,2));
  await testInfo.attach('local-performance-observation',{path,contentType:'application/json'});
  // Exercise the actual OrbitControls pointer path as well as the timed camera updates.
  const before=await page.evaluate(()=>window.assetFixture.view.cameraState());
  await page.mouse.move(720,450);await page.mouse.down();await page.mouse.move(880,510,{steps:12});await page.mouse.up();
  const after=await page.evaluate(()=>window.assetFixture.view.cameraState());expect(after.position).not.toEqual(before.position);
});

test('corrupt font bytes and missing WebGL are explicit failures, never faithful output',async({page})=>{
  await page.route('**/fonts/**',route=>route.fulfill({status:200,body:'wrong dependency bytes'}));
  await page.goto('/tests/assets/preview.html');await page.evaluate(()=>window.assetFixture.ready);
  expect(await page.evaluate(()=>window.assetFixture.view.status.ready)).toBe(false);
  expect(await page.evaluate(async()=>{try{await window.assetFixture.exportPNG(window.assetFixture.design());return false;}catch{return true;}})).toBe(true);
  const failed=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.getContext=(()=>null) as typeof canvas.getContext;
    try {new window.assetFixture.WatchViewport(canvas,undefined,undefined,true);return false;}catch{return true;}
  });
  expect(failed).toBe(true);
});
