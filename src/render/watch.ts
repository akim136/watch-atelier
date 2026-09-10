import * as THREE from 'three';
import { designSchema, type Design } from '../domain/model';
import { buildHead, buildHands, buildStrap } from './geometry';
import { buildDial, buildMarkers, DialArtwork } from './dial';
import { WatchPart } from './ownership';
import { dialKey, FONT_FAMILY } from './resources';

export interface WatchModel {
  group: THREE.Group; selectables: THREE.Object3D[]; warnings: string[];
  identity: string; update: (design: Design, family?: string) => void; dispose: () => void;
}

export function renderSnapshot(input: Design): Design {
  const design=designSchema.parse(input);
  const ids=[design.id,...design.components.map(c=>c.id),...design.objects.map(o=>o.id)];
  if(new Set(ids).size!==ids.length)throw new Error('Duplicate render semantic identities.');
  return design;
}
export const identityKey = (design: Design) => JSON.stringify([design.id,design.components,design.objects.map(o=>o.id)]);

/** Pure design projection; callers own validation/locks/history, renderer owns derived objects. */
export function buildWatch(input: Design, family=FONT_FAMILY): WatchModel {
  let current=renderSnapshot(input), currentFamily=family;
  const group=new THREE.Group();group.name='atelier-39-v1';
  const parts: Record<string,WatchPart>={};
  let artwork: DialArtwork | undefined;
  let disposed=false;
  const model: WatchModel={group,identity:identityKey(current),selectables:[],warnings:[],update,dispose};
  function mappings() {
    model.selectables=[];
    const meshes: THREE.Mesh[]=[];
    group.traverse(node=>{if(node instanceof THREE.Mesh)meshes.push(node);});
    // Three normally sorts opaque draws by allocation-dependent material IDs. Stable region
    // ordering makes fresh and incrementally updated scenes use the same MSAA/depth order.
    meshes.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
    meshes.forEach((mesh,index)=>{mesh.renderOrder=index;if(!mesh.userData.pickThrough)model.selectables.push(mesh);});
    model.warnings=[...(artwork?.warnings??[])];
    group.updateMatrixWorld(true);
  }
  function dispose() {
    if(disposed)return;
    disposed=true;
    Object.values(parts).forEach(part=>part.dispose());
    artwork?.dispose();group.removeFromParent();group.clear();model.selectables=[];model.warnings=[];
  }
  function update(input: Design, family=FONT_FAMILY) {
    if(disposed)throw new Error('Watch model is disposed.');
    const next=renderSnapshot(input);
    if(identityKey(next)!==model.identity)throw new Error('A new semantic identity requires a new watch instance.');
    const staged: Record<string,WatchPart>={};
    let nextArtwork: DialArtwork|undefined;
    try {
      if(dialKey(next)!==dialKey(current)||family!==currentFamily) {
        nextArtwork=new DialArtwork(next,family);
        staged.dial=buildDial(next,nextArtwork);
      }
      if(JSON.stringify(next.objects[2])!==JSON.stringify(current.objects[2]))staged.markers=buildMarkers(next);
      if(next.handStyle!==current.handStyle)staged.hands=buildHands(next);
      if(next.strap!==current.strap)staged.strap=buildStrap(next);
    } catch(error) { Object.values(staged).forEach(part=>part.dispose());nextArtwork?.dispose();throw error; }
    for(const [key,part] of Object.entries(staged)) { parts[key].dispose();parts[key]=part;group.add(part.group); }
    if(nextArtwork) { artwork?.dispose();artwork=nextArtwork; }
    current=next;currentFamily=family;mappings();
  }
  try {
    // Canvas failure precedes expensive geometry construction.
    artwork=new DialArtwork(current,family);
    parts.head=buildHead(current);parts.strap=buildStrap(current);parts.hands=buildHands(current);
    parts.dial=buildDial(current,artwork);parts.markers=buildMarkers(current);
    Object.values(parts).forEach(part=>group.add(part.group));mappings();return model;
  } catch(error) { dispose();throw error; }
}
