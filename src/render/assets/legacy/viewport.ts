import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { type Design } from '../../../domain/model';
import { buildWatch, identityKey, renderSnapshot, type WatchModel } from './watch';
import { loadFonts, renderManifest, contentHash, FONT_FAMILY } from './resources';
import { createStudio, presets, type Preset, type CameraState } from './studio';
export { presets, type Preset, type CameraState } from './studio';

export class WatchViewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene=new THREE.Scene();
  readonly camera=new THREE.PerspectiveCamera(40,1,.1,500);
  readonly controls: OrbitControls;
  private model?: WatchModel;
  private studio?: ReturnType<typeof createStudio>;
  private observer?: ResizeObserver;
  private disposed=false;
  private contextLost=false;
  private design?: Design;
  private inputHash='';
  private ready=false;
  private fontFailure='';
  private requested=0;
  private presetName: Preset|'Custom'='Oblique';
  private pointer?: [number,number];
  private settingCamera=false;
  onCamera?: (state: CameraState)=>void;

  private change=()=>{
    if(this.settingCamera)return;
    this.presetName='Custom';
    this.render();
    this.onCamera?.(this.cameraState());
  };
  private down=(event: PointerEvent)=>{this.pointer=[event.clientX,event.clientY];};
  private up=(event: PointerEvent)=>{
    const start=this.pointer;this.pointer=undefined;
    if(!start||Math.hypot(event.clientX-start[0],event.clientY-start[1])>4||!this.model)return;
    const rect=this.canvas.getBoundingClientRect();
    if(rect.width<1||rect.height<1)return;
    const ray=new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),this.camera);
    const hit=ray.intersectObjects(this.model.selectables)[0];
    if(hit)this.onSelect?.(hit.object.userData.semanticId);
  };
  private cancel=()=>{this.pointer=undefined;};
  private lost=(event: Event)=>{
    event.preventDefault();this.contextLost=true;this.ready=false;++this.requested;
    this.onStatus?.('3D context lost. Your design is preserved. Recreate the viewport to restore rendering.');
  };

  constructor(readonly canvas: HTMLCanvasElement,private onSelect?: (id:string)=>void,
    private onStatus?: (message:string)=>void,exporting=false) {
    // Match the live and export multisample/readback path. Export renders immediately before toBlob.
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});
    let controls: OrbitControls|undefined;
    try {
      this.renderer.setPixelRatio(exporting?1:Math.min(window.devicePixelRatio,2));
      this.renderer.outputColorSpace=THREE.SRGBColorSpace;
      this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1;
      this.studio=createStudio(this.renderer,this.scene);
      controls=new OrbitControls(this.camera,canvas);this.controls=controls;
      controls.enableDamping=false;controls.enablePan=false;controls.minDistance=30;controls.maxDistance=220;
      controls.addEventListener('change',this.change);
      canvas.addEventListener('webglcontextlost',this.lost);
      this.setPreset('Oblique');
      if(!exporting) {
        this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);
        canvas.addEventListener('pointerdown',this.down);canvas.addEventListener('pointerup',this.up);
        canvas.addEventListener('pointercancel',this.cancel);this.resize();
      }
    } catch(error) {
      this.observer?.disconnect();controls?.dispose();this.studio?.dispose();
      canvas.removeEventListener('webglcontextlost',this.lost);
      canvas.removeEventListener('pointerdown',this.down);canvas.removeEventListener('pointerup',this.up);canvas.removeEventListener('pointercancel',this.cancel);
      this.renderer.dispose();this.renderer.forceContextLoss();throw error;
    }
  }

  get status() {
    return {ready:this.ready&&!this.disposed&&!this.contextLost,fontFailure:this.fontFailure,
      manifest:this.design?{...renderManifest(this.design,this.presetName),inputHash:this.inputHash,
        cameraState:this.cameraState(),width:this.canvas.width,height:this.canvas.height,
        pixelRatio:this.renderer.getPixelRatio(),faithful:this.ready&&!this.disposed&&!this.contextLost}:null,
      resources:{...this.renderer.info.memory},draw:{...this.renderer.info.render}};
  }
  cameraState(): CameraState { return {position:this.camera.position.toArray(),target:this.controls.target.toArray(),zoom:this.camera.zoom}; }
  setCamera(state: CameraState) {
    if(this.disposed)return;
    if(state.position.length!==3||state.target.length!==3||![...state.position,...state.target,state.zoom].every(Number.isFinite)||state.zoom<=0)throw new Error('Invalid camera state.');
    this.presetName='Custom';this.settingCamera=true;
    try { this.camera.position.fromArray(state.position);this.camera.zoom=state.zoom;this.controls.target.fromArray(state.target);this.camera.updateProjectionMatrix();this.controls.update(); }
    finally {this.settingCamera=false;}
    this.render();
  }
  setPreset(preset: Preset) {
    if(!presets[preset])throw new Error('Unsupported camera preset.');
    this.setCamera(presets[preset]);this.presetName=preset;
  }
  resize(width=this.canvas.clientWidth,height=this.canvas.clientHeight) {
    if(this.disposed)return;
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)return;
    this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.render();
  }
  async update(input: Design) {
    if(this.disposed)throw new Error('Viewport is disposed.');
    if(this.contextLost)throw new Error('3D context lost. Recreate the viewport before updating.');
    const design=renderSnapshot(input),request=++this.requested;
    this.ready=false;
    let fontFailure='';
    try {
      const [hash]=await Promise.all([
        contentHash(new TextEncoder().encode(JSON.stringify(design))),
        loadFonts().catch(error=>{fontFailure=(error as Error).message;}),
      ]);
      if(this.disposed||this.contextLost||request!==this.requested)return;
      if(this.model?.identity===identityKey(design))this.model.update(design,fontFailure?'sans-serif':FONT_FAMILY);
      else {
        const next=buildWatch(design,fontFailure?'sans-serif':FONT_FAMILY);
        this.model?.dispose();this.model=next;this.scene.add(next.group);
      }
      this.design=design;this.inputHash=hash;this.fontFailure=fontFailure;this.ready=!fontFailure;
      this.onStatus?.([fontFailure,...this.model.warnings].filter(Boolean).join(' '));this.render();
    } catch(error) {
      if(request===this.requested&&!this.disposed) {this.ready=false;this.onStatus?.((error as Error).message);}
      throw error;
    }
  }
  render() { if(!this.disposed&&!this.contextLost)this.renderer.render(this.scene,this.camera); }
  dispose() {
    if(this.disposed)return;
    this.disposed=true;this.ready=false;++this.requested;
    this.observer?.disconnect();this.controls.removeEventListener('change',this.change);this.controls.dispose();
    this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointerup',this.up);
    this.canvas.removeEventListener('pointercancel',this.cancel);this.canvas.removeEventListener('webglcontextlost',this.lost);
    this.model?.dispose();this.studio?.dispose();this.scene.clear();this.renderer.dispose();this.renderer.forceContextLoss();
  }
}

export async function exportPNG(input: Design,preset: Preset='Oblique'): Promise<Blob> {
  // Capture before the first await; edits to the caller's object cannot change this export.
  const design=renderSnapshot(input);
  await loadFonts();
  const canvas=document.createElement('canvas');
  let view: WatchViewport|undefined;
  try {
    view=new WatchViewport(canvas,undefined,undefined,true);view.resize(1600,1200);view.setPreset(preset);
    await view.update(design);
    if(!view.status.ready||view.status.manifest?.input!==JSON.stringify(design))throw new Error('Preview resources are not ready for this design.');
    view.render();
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PNG export failed. Try again.')),'image/png'));
    if(!view.status.ready)throw new Error('Preview context was lost during export.');
    return blob;
  } finally {view?.dispose();canvas.width=canvas.height=1;}
}
