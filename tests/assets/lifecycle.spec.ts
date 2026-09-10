import { test, expect } from '@playwright/test';

test('semantic raycasts survive update; a deliberately wrong mapping fails the checker',async({page})=>{
  await page.goto('/tests/assets/preview.html');await page.evaluate(()=>window.assetFixture.ready);
  const result=await page.evaluate(()=>{
    const f=window.assetFixture,d=f.design(),model=f.buildWatch(d),T=f.THREE;
    const pick=(x:number,y:number)=>new T.Raycaster(new T.Vector3(x,y,30),new T.Vector3(0,0,-1)).intersectObjects(model.selectables)[0]?.object.userData.semanticId;
    const check=()=>pick(d.objects[0].x,d.objects[0].y)===d.objects[0].id&&pick(12.65,0)===d.objects[2].id&&pick(0,15)===d.objects[3].id&&pick(0,0)===d.components.find(c=>c.role==='hands')!.id;
    const valid=check();model.group.getObjectByName('dial.marker.3')!.userData.semanticId='seeded-wrong-id';
    const corrupted=check();d.objects[2].length=2.1;model.update(d);const rebuilt=check();
    model.dispose();return {valid,corrupted,rebuilt};
  });
  expect(result).toEqual({valid:true,corrupted:false,rebuilt:true});
});

test('owned GPU resources release once; another instance remains intact; failed update is atomic',async({page})=>{
  await page.goto('/tests/assets/preview.html');await page.evaluate(()=>window.assetFixture.ready);
  const result=await page.evaluate(()=>{
    const f=window.assetFixture,d=f.design(),a=f.buildWatch(d),b=f.buildWatch(d);
    const counts=new Map<object,number>();
    const observe=(resource: import('three').BufferGeometry|import('three').Material|import('three').Texture)=>{
      if(counts.has(resource))return;counts.set(resource,0);resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)!+1));
    };
    a.group.traverse(node=>{
      if(node instanceof f.THREE.Mesh) {
        observe(node.geometry);
        for(const material of (Array.isArray(node.material)?node.material:[node.material])) {
          observe(material);for(const value of Object.values(material))if(value instanceof f.THREE.Texture)observe(value);
        }
      }
    });
    let otherDisposed=0;
    b.group.traverse(node=>{if(node instanceof f.THREE.Mesh)node.geometry.addEventListener('dispose',()=>otherDisposed++);});
    const original=HTMLCanvasElement.prototype.getContext;
    const invoke=original as (this:HTMLCanvasElement,id:string,options?:unknown)=>RenderingContext|null;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,...args:[string,unknown?]) {
      if(args[0]==='2d')return null;
      return invoke.apply(this,args);
    } as typeof original;
    let failure='';const originalBody=a.group.getObjectByName('case.body');
    try {const next=structuredClone(d);next.dialColor='#123456';a.update(next);}catch(error){failure=(error as Error).message;}
    finally {HTMLCanvasElement.prototype.getContext=original;}
    const retained=a.group.getObjectByName('case.body')===originalBody&&Array.from(counts.values()).every(count=>count===0);
    a.dispose();a.dispose();const allOnce=Array.from(counts.values()).every(count=>count===1);
    const surviving=otherDisposed===0&&b.group.children.length>0;
    b.dispose();return {failure,retained,allOnce,surviving,resources:counts.size};
  });
  expect(result.failure).toContain('Dial canvas unavailable');expect(result).toMatchObject({retained:true,allOnce:true,surviving:true});expect(result.resources).toBeGreaterThan(80);
});

test('context loss stays unready and dispose invalidates pending work',async({page})=>{
  await page.goto('/tests/assets/preview.html');await page.evaluate(()=>window.assetFixture.ready);
  const result=await page.evaluate(async()=>{
    const f=window.assetFixture,canvas=f.view.canvas;
    canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));
    let rejected=false;try{await f.view.update(f.design());}catch{rejected=true;}
    const lostUnready=!f.view.status.ready;
    const detached=document.createElement('canvas');const view=new f.WatchViewport(detached,undefined,undefined,true);
    const pending=view.update(f.design());view.dispose();await pending;
    const disposedUnready=!view.status.ready&&view.scene.children.length===0;
    return {rejected,lostUnready,disposedUnready};
  });
  expect(result).toEqual({rejected:true,lostUnready:true,disposedUnready:true});
});

test('distinct design replacements detach old roots; failure after staging disposes only new resources',async({page})=>{
  await page.goto('/tests/assets/preview.html');await page.evaluate(()=>window.assetFixture.ready);
  const result=await page.evaluate(async()=>{
    const f=window.assetFixture,original=f.design(),other=f.buildWatch(original);
    let otherDisposed=0;other.group.traverse(node=>{if(node instanceof f.THREE.Mesh)node.geometry.addEventListener('dispose',()=>otherDisposed++);});
    for(let i=1;i<=12;i++) {
      const d=structuredClone(original);d.id=`20000000-0000-4000-8000-${String(i).padStart(12,'0')}`;await f.view.update(d);
    }
    const roots=f.view.scene.children.filter(node=>node.name==='atelier-39-v1').length;
    const model=f.buildWatch(original),oldBody=model.group.getObjectByName('case.body'),oldDial=model.group.getObjectByName('dial.surface');
    const dispose=f.THREE.BufferGeometry.prototype.dispose;
    const makeNormals=f.THREE.ExtrudeGeometry.prototype.computeVertexNormals;
    let disposedGeometries=0;
    f.THREE.BufferGeometry.prototype.dispose=function(){disposedGeometries++;return dispose.call(this);};
    f.THREE.ExtrudeGeometry.prototype.computeVertexNormals=function(){throw new Error('seeded hand construction failure');};
    let error='';
    try {const next=structuredClone(original);next.dialColor='#456789';next.handStyle='leaf';model.update(next);}
    catch(value){error=(value as Error).message;}
    finally {f.THREE.BufferGeometry.prototype.dispose=dispose;f.THREE.ExtrudeGeometry.prototype.computeVertexNormals=makeNormals;}
    const retained=model.group.getObjectByName('case.body')===oldBody&&model.group.getObjectByName('dial.surface')===oldDial;
    const unaffected=otherDisposed===0;model.dispose();other.dispose();
    return {roots,error,disposedGeometries,retained,unaffected};
  });
  expect(result.roots).toBe(1);expect(result.error).toContain('seeded hand construction failure');
  expect(result.disposedGeometries).toBeGreaterThan(2);expect(result.retained).toBe(true);expect(result.unaffected).toBe(true);
});

test('missing font is labeled, blocks PNG, and successful retry restores faithful rendering',async({page})=>{
  let missing=true;
  await page.route('**/fonts/**',route=>missing?route.fulfill({status:404,body:'missing fixture dependency'}):route.continue());
  await page.goto('/tests/assets/preview.html');await page.evaluate(()=>window.assetFixture.ready);
  expect(await page.evaluate(()=>window.assetFixture.view.status.ready)).toBe(false);
  await expect(page.getByRole('status')).toContainText('font is unavailable');
  expect(await page.evaluate(async()=>{try{await window.assetFixture.exportPNG(window.assetFixture.design());return false;}catch{return true;}})).toBe(true);
  missing=false;
  await page.evaluate(()=>window.assetFixture.view.update(window.assetFixture.design()));
  expect(await page.evaluate(()=>window.assetFixture.view.status.ready)).toBe(true);
  expect(await page.evaluate(async()=>(await window.assetFixture.exportPNG(window.assetFixture.design())).type)).toBe('image/png');
});

test('two displayed variants stay visually independent when one changes and is disposed',async({page})=>{
  await page.goto('/tests/assets/preview.html');await page.evaluate(()=>window.assetFixture.ready);
  const result=await page.evaluate(async()=>{
    const f=window.assetFixture,d=f.design();d.id=crypto.randomUUID();
    d.components.forEach(component=>component.id=crypto.randomUUID());d.objects.forEach(object=>object.id=crypto.randomUUID());
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;right:0;top:0;width:500px;height:500px';document.body.append(canvas);
    const other=new f.WatchViewport(canvas,undefined,undefined,true);other.resize(500,500);await other.update(d);
    const hash=async()=>{other.render();const blob=await new Promise<Blob>(resolve=>canvas.toBlob(blob=>resolve(blob!)));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).join(',');};
    const before=await hash();await f.edit(f.starterEdits(f.design(),'instrument'));f.view.dispose();
    const after=await hash(),ready=other.status.ready;other.dispose();canvas.remove();
    return {unchanged:before===after,ready};
  });
  expect(result).toEqual({unchanged:true,ready:true});
});

test('late font completion uses only the last immutable input; A-B-A texture results retire obsolete work',async({page})=>{
  let release!: ()=>void;const blocked=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/fonts/**',async route=>{await blocked;await route.continue();});
  await page.goto('/tests/assets/preview.html');await page.waitForFunction(()=>Boolean(window.assetFixture));
  await page.evaluate(()=>{
    const f=window.assetFixture,a=f.design(),b=structuredClone(a);b.dialColor='#305458';
    Object.assign(window,{pendingAssets:Promise.all([f.view.update(a),f.view.update(b),f.view.update(a)])});
    a.dialColor='#ff0000';
  });
  release();
  await page.evaluate(()=>(window as unknown as {pendingAssets:Promise<unknown>}).pendingAssets);
  expect(await page.evaluate(()=>JSON.parse(window.assetFixture.view.status.manifest!.input).dialColor)).toBe('#ece6d8');
  const result=await page.evaluate(async()=>{
    const f=window.assetFixture,gate=new f.LatestArtifact<import('../../src/render/assets/legacy/dial').DialArtwork>();
    const completed: (()=>void)[]=[],accepted: string[]=[],discarded: string[]=[];
    const jobs=['A','B','A'].map((key,index)=>gate.request(key,()=>new Promise(resolve=>{
      completed.push(()=>{const artwork=new f.DialArtwork(f.design());artwork.texture.name=String(index);resolve(artwork);});
    }),value=>{accepted.push(value.texture.name);value.dispose();},value=>{discarded.push(value.texture.name);value.dispose();}));
    completed[2]();await jobs[2];completed[1]();await jobs[1];completed[0]();await jobs[0];
    return {accepted,discarded};
  });
  expect(result).toEqual({accepted:['2'],discarded:['1','0']});
});
