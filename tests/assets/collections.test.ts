import { it, expect } from 'vitest';
import { collectionEdits, collectionPresets, colorPalette, namedColor, type CollectionPreset, type PaletteColor } from '../../src/render/collections';
import { starterEdits } from '../../src/render/assets/legacy/presets';
import { applyProjectCommand, semanticDesign } from '../../src/domain/commands';
import { fixtureProject } from './fixture';
import acceptedStarters from './accepted-starters.json';

const apply=(p: ReturnType<typeof fixtureProject>,id: CollectionPreset)=>applyProjectCommand(p,{
  type:'edit',variantId:p.variants[0].id,edits:collectionEdits(p.variants[0].design,id),
},p.revision);
const luminance=(hex:string)=>{
  const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return c[0]*.2126+c[1]*.7152+c[2]*.0722;
};

it('[ASSET-COLORS] nine explicit studies preserve the fixed head and identities, remain editable and have distinct readable dials',()=>{
  expect(collectionPresets.map(p=>p.id)).toEqual(['midnight','porcelain','moss','claret','sand','ice','copper','plum','slate']);
  const baseline=fixtureProject(),before=JSON.stringify(baseline),designs=collectionPresets.map(({id})=>{
    const result=apply(baseline,id),d=result.project.variants[0].design,original=baseline.variants[0].design;
    expect(result.changed).toBe(true);expect(d.components).toEqual(original.components);expect(d.dimensions).toEqual(original.dimensions);
    expect(d.template).toBe(original.template);expect(d.objects.map(o=>o.id)).toEqual(original.objects.map(o=>o.id));
    for(const object of d.objects) {
      const a=luminance(d.dialColor),b=luminance(object.color);
      expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toBeGreaterThanOrEqual(4.5);
    }
    const edited=applyProjectCommand(result.project,{type:'edit',variantId:result.project.variants[0].id,
      edits:[{kind:'text',id:d.objects[0].id,patch:{text:'PERSONAL'}}]},result.project.revision);
    expect(edited.project.variants[0].design.objects[0].text).toBe('PERSONAL');
    return d;
  });
  expect(new Set(designs.map(d=>d.dialColor)).size).toBe(9);
  designs[0].objects[0].text='ONLY A';expect(designs[1].objects[0].text).toBe('ATELIER');
  expect(JSON.stringify(baseline)).toBe(before);
});

it('[ASSET-COLORS] reapplication is a no-op; A/B/A restores track, hand and strap; locked batches reject atomically',()=>{
  const a=apply(fixtureProject(),'moss'),same=apply(a.project,'moss');
  expect(same.changed).toBe(false);expect(same.project).toBe(a.project);
  const b=apply(a.project,'porcelain');expect(b.project.variants[0].design.objects[3].visible).toBe(false);
  const back=apply(b.project,'moss');expect(back.project.variants[0].design.objects[3].visible).toBe(true);
  expect(semanticDesign(back.project.variants[0].design)).toEqual(semanticDesign(a.project.variants[0].design));
  const locked=structuredClone(a.project);locked.variants[0].design.locks=['strap'];const before=JSON.stringify(locked);
  expect(()=>apply(locked,'porcelain')).toThrow('locked');expect(JSON.stringify(locked)).toBe(before);
  const d=a.project.variants[0].design,first=collectionEdits(d,'ice'),second=collectionEdits(d,'ice');
  const text=first.find(e=>e.kind==='text')!;if(text.kind==='text')text.patch.text='MUTATED';
  expect(second).toEqual(collectionEdits(d,'ice'));expect(first).not.toEqual(second);
});

it('[ASSET-COLORS] named palette has the explicit immutable inventory and rejects missing or inherited names',()=>{
  expect(Object.keys(colorPalette)).toEqual(['midnight','porcelain','moss','claret','sand','ice','copper','plum','slate',
    'ivory','ink','navy','silver','champagne','terracotta','teal','charcoal','paper']);
  expect(Object.isFrozen(colorPalette)).toBe(true);expect(new Set(Object.values(colorPalette)).size).toBe(18);
  for(const id of Object.keys(colorPalette) as PaletteColor[])expect(namedColor(id)).toMatch(/^#[0-9a-f]{6}$/);
  for(const id of ['missing','__proto__','toString'])expect(()=>namedColor(id as PaletteColor)).toThrow('Unsupported palette color');
  expect(()=>collectionEdits(fixtureProject().variants[0].design,'missing' as CollectionPreset)).toThrow('Unsupported collection preset');
});

it('[ASSET-COLORS] three original starters equal the accepted pre-expansion semantic snapshots',()=>{
  const p=fixtureProject();
  for(const id of ['instrument','gallery','coastal'] as const) {
    const result=applyProjectCommand(p,{type:'edit',variantId:p.variants[0].id,edits:starterEdits(p.variants[0].design,id)},p.revision);
    expect(semanticDesign(result.project.variants[0].design)).toEqual({...acceptedStarters[id],revision:0});
  }
});
