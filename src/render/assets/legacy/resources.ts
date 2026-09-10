import { type Design } from '../../../domain/model';
import { RECIPE } from './recipe';

export const FONT_HASHES = Object.freeze({regular:'a71a56e516751883cb7877112d39f9c13b92c2dc15caaf00277b7f9d941d673a',medium:'eb93da02ace70c39e4c4e811b8b02dd5f5d4804d186202d6668bea60d22f57d0'});
export const FONT_FAMILY='Atelier Plex';
export const FONT_ERROR='The intended dial font is unavailable. A fallback preview is shown; PNG export is blocked. Restore the bundled font and try again.';
export async function contentHash(bytes: Uint8Array) {
  const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
let fontPromise: Promise<void>|undefined;
export function loadFonts(): Promise<void> {
  if(fontPromise)return fontPromise;
  const controller=new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const faces: FontFace[]=[];
  const load=Promise.all((['regular','medium'] as const).map(async key=>{
    const response=await fetch(`/fonts/IBMPlexSansCondensed-${key==='regular'?'Regular':'Medium'}.woff2`,{signal:controller.signal});
    if(!response.ok)throw new Error('Font unavailable.');
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.length>512*1024||await contentHash(bytes)!==FONT_HASHES[key])throw new Error('Font hash mismatch.');
    const face=await new FontFace(FONT_FAMILY,bytes,{weight:key==='regular'?'400':'500'}).load();
    return face;
  }));
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Font readiness timed out.'));},10000);});
  fontPromise=Promise.race([load,timeout]).then(loaded=>{
    // Both verified faces become available together; timed-out completions cannot register.
    for(const face of loaded) { document.fonts.add(face);faces.push(face); }
  }).catch(()=>{
    controller.abort();faces.forEach(face=>document.fonts.delete(face));fontPromise=undefined;
    throw new Error(FONT_ERROR);
  }).finally(()=>clearTimeout(timer));
  return fontPromise;
}

/** Exact dependency keys; revision/locks/other appearance changes don't invalidate artwork. */
export const dialKey=(d: Design)=>JSON.stringify({font:d.font,hashes:FONT_HASHES,dialColor:d.dialColor,text:d.objects.slice(0,2),track:d.objects[3]});
export const geometryKey=(d: Design)=>JSON.stringify({template:d.template,version:RECIPE.version,dimensions:d.dimensions});

/** A -> B -> A is still three requests. Invalidation also retires same-key work. */
export class LatestArtifact<T> {
  private generation=0;
  async request(key: string,build: ()=>Promise<T>,accept: (value:T)=>void,discard: (value:T)=>void) {
    const generation=++this.generation;
    const value=await build();
    if(generation===this.generation) { accept(value);return {accepted:true,key}; }
    discard(value);return {accepted:false,key};
  }
  invalidate(){++this.generation;}
}

export const renderManifest=(d: Design,camera: string)=>({
  designId:d.id,revision:d.revision,input:JSON.stringify(d),dialKey:dialKey(d),geometryKey:geometryKey(d),
  recipe:d.template,recipeVersion:RECIPE.version,materials:RECIPE.materials,environment:RECIPE.environment,
  fontHashes:FONT_HASHES,camera,cameraVersion:RECIPE.cameras,time:RECIPE.time,output:'sRGB/ACES/exposure1',
});
