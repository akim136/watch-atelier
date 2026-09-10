import { afterEach, it, expect, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.resetModules();});

it('[ASSET-FONTS] font readiness timeout cannot register late faces over a successful retry',async()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
  const regular=await readFile('public/fonts/IBMPlexSansCondensed-Regular.woff2');
  const medium=await readFile('public/fonts/IBMPlexSansCondensed-Medium.woff2');
  const registered=new Set<object>(),late: (()=>void)[]=[];
  let blocking=true,started!: ()=>void;
  const facesStarted=new Promise<void>(resolve=>{started=resolve;});
  class Face {
    load() {
      if(!blocking)return Promise.resolve(this);
      return new Promise<Face>(resolve=>{late.push(()=>resolve(this));if(late.length===2)started();});
    }
  }
  vi.stubGlobal('FontFace',Face);
  vi.stubGlobal('document',{fonts:{add:(face:object)=>registered.add(face),delete:(face:object)=>registered.delete(face)}});
  vi.stubGlobal('fetch',async(url:string)=>new Response(new Uint8Array(url.includes('Regular')?regular:medium)));
  const {loadFonts}=await import('../../src/render/assets/legacy/resources');
  const timedOut=loadFonts(),failure=expect(timedOut).rejects.toThrow('font is unavailable');
  await facesStarted;await vi.advanceTimersByTimeAsync(10001);await failure;
  expect(registered.size).toBe(0);
  blocking=false;await loadFonts();const current=[...registered];expect(current).toHaveLength(2);
  late.forEach(resolve=>resolve());await Promise.resolve();await Promise.resolve();
  expect([...registered]).toEqual(current);
});
