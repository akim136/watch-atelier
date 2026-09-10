import * as THREE from 'three';
import { type Design } from '../../../domain/model';
import { FONT_FAMILY } from './resources';
import { componentId } from './geometry';
import { makeMaterial, grainTexture } from './materials';
import { WatchPart, OwnedResources } from './ownership';
import { RECIPE, clockPoint, clockRotation } from './recipe';

export interface TextBounds { id: string; x: number; y: number; width: number; height: number }
export class DialArtwork extends OwnedResources {
  readonly texture: THREE.CanvasTexture;
  readonly bounds: TextBounds[] = [];
  readonly warnings: string[] = [];
  constructor(design: Design, family = FONT_FAMILY) {
    super();
    const canvas = document.createElement('canvas');
    this.cleanup(() => { canvas.width = canvas.height = 1; });
    try {
      canvas.width = canvas.height = RECIPE.dialPixels;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Dial canvas unavailable. Restore Canvas 2D support.');
      const px = canvas.width / (RECIPE.dialRadius * 2), center = canvas.width / 2;
      ctx.fillStyle = design.dialColor;
      ctx.fillRect(0,0,canvas.width,canvas.height);
      const track = design.objects[3];
      if(track.visible) {
        ctx.strokeStyle=track.color;
        for(let i=0;i<60;i++) {
          const outer=clockPoint(i/60,15.15),inner=clockPoint(i/60,i%5===0?14.65:14.88);
          ctx.lineWidth=(i%5===0?.085:.045)*px;
          ctx.beginPath();ctx.moveTo(center+outer[0]*px,center-outer[1]*px);
          ctx.lineTo(center+inner[0]*px,center-inner[1]*px);ctx.stroke();
        }
      }
      for(const text of design.objects.slice(0,2)) if(text.kind==='text') {
        ctx.font=`500 ${text.size*px}px "${family}"`;
        ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=text.color;
        const metrics=ctx.measureText(text.text);
        const width=Math.max(metrics.width,metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight)/px;
        const height=Math.max(text.size, (metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent)/px);
        if(Math.hypot(Math.abs(text.x)+width/2,Math.abs(text.y)+height/2)>RECIPE.dialRadius) {
          this.warnings.push('Dial text extends beyond the dial edge. Reduce its size or move it inward.');
        }
        this.bounds.push({id:text.id,x:text.x,y:text.y,width:Math.max(width,1),height:height*1.25});
        ctx.fillText(text.text,center+text.x*px,center-text.y*px);
      }
      this.texture=this.own(new THREE.CanvasTexture(canvas));
      this.texture.name='semantic-dial';
      this.texture.colorSpace=THREE.SRGBColorSpace;
      this.texture.anisotropy=4;
    } catch(error) { this.dispose(); throw error; }
  }
}

export function buildDial(design: Design, artwork: DialArtwork) {
  const part=new WatchPart();
  try {
    const material=part.own(makeMaterial('fine-grain-dial-look'));
    const grain=part.own(grainTexture(RECIPE.seed+1));grain.repeat.set(8,8);material.roughnessMap=grain;
    material.color.set('#ffffff'); material.map=artwork.texture;
    part.mesh('dial.surface',new THREE.CircleGeometry(RECIPE.dialRadius,RECIPE.radialSegments),material,componentId(design,'dial'),0,0,RECIPE.dialZ);
    const invisible=part.own(new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
    for(const bounds of artwork.bounds) {
      part.mesh(`dial.text.${bounds.id}`,new THREE.PlaneGeometry(bounds.width,bounds.height),invisible,bounds.id,bounds.x,bounds.y,RECIPE.dialZ+.025);
    }
    if(design.objects[3].visible)part.mesh('dial.track',new THREE.RingGeometry(14.55,15.35,128),invisible,design.objects[3].id,0,0,RECIPE.dialZ+.025);
    return part;
  } catch(error) { part.dispose(); throw error; }
}

export function buildMarkers(design: Design) {
  const part=new WatchPart();
  try {
    const markers=design.objects[2];
    const metal=part.own(makeMaterial('polished-steel-look',markers.color));
    metal.metalness=.4;metal.roughness=.3;
    for(let i=0;i<12;i++) {
      const dot=markers.style==='dot';
      const geometry=dot?new THREE.CylinderGeometry(markers.length/3,markers.length/3,.2,32)
        :new THREE.BoxGeometry(i%3===0?.5:.35,markers.length,.2);
      if(dot)geometry.rotateX(Math.PI/2);
      const [x,y]=clockPoint(i/12,13.6-markers.length/2);
      const mesh=part.mesh(`dial.marker.${i}`,geometry,metal,markers.id,x,y,RECIPE.dialZ+.16);
      mesh.rotation.z=clockRotation(i/12);
    }
    return part;
  } catch(error) { part.dispose(); throw error; }
}
