import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildHead, buildHands, buildStrap } from '../../src/render/assets/legacy/geometry';
import { buildMarkers } from '../../src/render/assets/legacy/dial';
import { renderSnapshot } from '../../src/render/assets/legacy/watch';
import { clockPoint, clockRotation, handRotations } from '../../src/render/assets/legacy/recipe';
import { makeMaterial, grainTexture } from '../../src/render/assets/legacy/materials';
import { fixtureProject } from './fixture';

function signature(root: THREE.Object3D) {
  const values: unknown[]=[];root.updateMatrixWorld(true);
  root.traverse(node=>{
    if(node instanceof THREE.Mesh) values.push({name:node.name,id:node.userData.semanticId,
      transform:node.matrixWorld.toArray(),positions:Array.from(node.geometry.getAttribute('position').array),
      normals:Array.from(node.geometry.getAttribute('normal').array),index:node.geometry.index?Array.from(node.geometry.index.array):null});
  });
  return values;
}
describe('M1 asset geometry boundary',()=>{
  it('[ASSET-GEOMETRY] has exact authored head/attachment bounds and finite deterministic geometry',()=>{
    const design=fixtureProject().variants[0].design,before=JSON.stringify(design);
    const a=buildHead(design),b=buildHead(design);
    try {
      expect(signature(a.group)).toEqual(signature(b.group));
      const body=new THREE.Box3().setFromObject(a.group.getObjectByName('case.body')!);
      expect(body.max.x-body.min.x).toBeCloseTo(39,4);
      const head=new THREE.Box3().setFromObject(a.group);
      expect(head.max.z-head.min.z).toBeCloseTo(10.8,4);
      const crystal=a.group.getObjectByName('crystal.surface') as THREE.Mesh;
      const positions=crystal.geometry.getAttribute('position'),normals=crystal.geometry.getAttribute('normal');
      let top=0,bottom=0;
      for(let i=0;i<positions.count;i++) {
        const radius=Math.hypot(positions.getX(i),positions.getY(i));
        if(radius>1&&radius<14&&positions.getZ(i)>5.2) {expect(normals.getZ(i)).toBeGreaterThan(.9);top++;}
        if(radius>1&&positions.getZ(i)<4.401) {expect(normals.getZ(i)).toBeLessThan(-.9);bottom++;}
      }
      expect(top).toBeGreaterThan(100);expect(bottom).toBeGreaterThan(100);
      const lugs=new THREE.Box3();
      a.group.children.filter(node=>node.name.startsWith('case.lug')).forEach(node=>lugs.expandByObject(node));
      expect(lugs.max.y-lugs.min.y).toBeCloseTo(46.5,4);
      const right=new THREE.Box3().setFromObject(a.group.getObjectByName('case.lug.1.1')!);
      const left=new THREE.Box3().setFromObject(a.group.getObjectByName('case.lug.-1.1')!);
      expect(right.min.x-left.max.x).toBeCloseTo(20,4);
      a.group.traverse(node=>{if(node instanceof THREE.Mesh)for(const attr of Object.values((node.geometry as THREE.BufferGeometry).attributes))expect(Array.from(attr.array).every(Number.isFinite)).toBe(true);});
      expect(JSON.stringify(design)).toBe(before);
    } finally {a.dispose();b.dispose();}
  });
  it('[ASSET-GEOMETRY] places twelve/three markers and clockwise hand pivots correctly at 10:10:30',()=>{
    expect(clockPoint(0,10)).toEqual([0,10]);expect(clockPoint(.25,10)[0]).toBeCloseTo(10);
    const three=new THREE.Vector3(0,10,0).applyAxisAngle(new THREE.Vector3(0,0,1),clockRotation(.25));
    expect(three.x).toBeCloseTo(10);expect(three.y).toBeCloseTo(0);
    const d=fixtureProject().variants[0].design,hands=buildHands(d),markers=buildMarkers(d);
    try {
      expect(markers.group.getObjectByName('dial.marker.0')!.position.y).toBeGreaterThan(12);
      expect(markers.group.getObjectByName('dial.marker.3')!.position.x).toBeGreaterThan(12);
      expect(markers.group.children.every(node=>node.userData.semanticId===d.objects[2].id)).toBe(true);
      for(const [hand,rotation] of Object.entries(handRotations())) {
        const pivot=hands.group.getObjectByName(`hands.${hand}.pivot`)!;
        expect(pivot.position.x).toBe(0);expect(pivot.position.y).toBe(0);expect(pivot.rotation.z).toBe(rotation);
      }
    } finally {hands.dispose();markers.dispose();}
  });
  it('[ASSET-GEOMETRY] owns independent materials/geometry and deterministic bounded non-color grain',()=>{
    const d=fixtureProject().variants[0].design,a=buildStrap(d),b=buildStrap(d);
    try {
      const am=a.group.children[0] as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
      const bm=b.group.children[0] as typeof am;
      expect(am.geometry).not.toBe(bm.geometry);expect(am.material).not.toBe(bm.material);
      const before=bm.material.color.getHex();am.material.color.set('#ff0000');expect(bm.material.color.getHex()).toBe(before);
      let bDisposed=false;bm.geometry.addEventListener('dispose',()=>{bDisposed=true;});a.dispose();expect(bDisposed).toBe(false);
      const grain=grainTexture(),same=grainTexture();expect(grain.image.data).toEqual(same.image.data);expect(grain.colorSpace).toBe(THREE.NoColorSpace);grain.dispose();same.dispose();
      expect(()=>grainTexture(1,2048)).toThrow('Invalid grain size');
      const material=makeMaterial('brushed-steel-look');material.dispose();
    } finally {a.dispose();b.dispose();}
  });
  it('[ASSET-GEOMETRY] rejects unsupported units/version/missing identity with a valid control',()=>{
    const d=fixtureProject().variants[0].design;expect(renderSnapshot(d)).toEqual(d);
    for(const patch of [{units:'m'},{template:'atelier-round-01'},{components:d.components.slice(1)},{objects:d.objects.map(o=>({...o,id:d.id}))}]) {
      expect(()=>renderSnapshot({...d,...patch} as typeof d)).toThrow();
    }
  });
});
