import { it, expect } from 'vitest';
import { starterEdits, starterPresets } from '../../src/render/assets/legacy/presets';
import { applyProjectCommand } from '../../src/domain/commands';
import { buildHands } from '../../src/render/assets/legacy/geometry';
import { materialRecipes, makeMaterial } from '../../src/render/assets/legacy/materials';
import { fixtureProject } from './fixture';
import * as THREE from 'three';

it('[ASSET-PRESETS] all three starters are supported independent edits preserving identities and fixed geometry',()=>{
  const p=fixtureProject(),d=p.variants[0].design,before=JSON.stringify(p);
  const designs=starterPresets.map(preset=>{
    const edits=starterEdits(d,preset.id);
    const result=applyProjectCommand(p,{type:'edit',variantId:p.variants[0].id,edits},p.revision);
    expect(result.changed).toBe(true);const design=result.project.variants[0].design;
    expect(design.components).toEqual(d.components);expect(design.dimensions).toEqual(d.dimensions);
    expect(design.objects.map(o=>o.id)).toEqual(d.objects.map(o=>o.id));
    const again=applyProjectCommand(result.project,{type:'edit',variantId:p.variants[0].id,edits:[{kind:'text',id:d.objects[0].id,patch:{text:'EDITABLE'}}]},result.project.revision);
    expect(again.project.variants[0].design.objects[0].text).toBe('EDITABLE');
    return design;
  });
  expect(JSON.stringify(p)).toBe(before);expect(new Set(designs.map(d=>d.dialColor)).size).toBe(3);
  designs[0].objects[0].text='ONLY A';expect(designs[1].objects[0].text).toBe('ATELIER');
  const locked=structuredClone(p);locked.variants[0].design.locks=['dialColor'];
  expect(()=>applyProjectCommand(locked,{type:'edit',variantId:p.variants[0].id,edits:starterEdits(d,'gallery')},0)).toThrow('locked');
});

it('[ASSET-PRESETS] hand alternatives change authored geometry with the same pivots and semantic component',()=>{
  const d=fixtureProject().variants[0].design,a=buildHands(d),b=buildHands({...d,handStyle:'leaf'});
  try {
    const mesh=(root:THREE.Group)=>root.getObjectByName('hands.hour') as THREE.Mesh;
    expect(Array.from(mesh(a.group).geometry.getAttribute('position').array)).not.toEqual(Array.from(mesh(b.group).geometry.getAttribute('position').array));
    expect(mesh(a.group).userData.semanticId).toBe(mesh(b.group).userData.semanticId);
    expect(a.group.getObjectByName('hands.hour.pivot')!.rotation.z).toBe(b.group.getObjectByName('hands.hour.pivot')!.rotation.z);
  } finally {a.dispose();b.dispose();}
});

it('[ASSET-PRESETS] seven material recipes allocate independently; unsupported look rejects',()=>{
  expect(Object.keys(materialRecipes)).toHaveLength(7);
  for(const key of Object.keys(materialRecipes) as (keyof typeof materialRecipes)[]) {
    const a=makeMaterial(key),b=makeMaterial(key);expect(a).not.toBe(b);expect(a.color).not.toBe(b.color);a.dispose();b.dispose();
  }
  expect(()=>makeMaterial('unknown' as keyof typeof materialRecipes)).toThrow('Unsupported material look');
});
