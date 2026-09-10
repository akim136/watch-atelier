import { type Design } from '../../../domain/model';
import { type Edit } from '../../../domain/commands';

export const STARTER_VERSION='atelier-starters-1.0.0';
export const starterPresets=Object.freeze([
  Object.freeze({id:'instrument',name:'Instrument',description:'Charcoal, ivory indices and warm leather.'}),
  Object.freeze({id:'gallery',name:'Gallery',description:'Warm ivory, leaf hands and a quiet open dial.'}),
  Object.freeze({id:'coastal',name:'Coastal',description:'Muted blue-green with pale dot indices.'}),
] as const);
export type StarterPreset=typeof starterPresets[number]['id'];

/** Proposes normal typed edits; the integrator applies them through its existing boundary. */
export function starterEdits(design: Design,preset: StarterPreset): Edit[] {
  if(!starterPresets.some(item=>item.id===preset))throw new Error('Unsupported starter preset.');
  const gallery=preset==='gallery',instrument=preset==='instrument';
  const ink=gallery?'#343d3c':'#eee7d6';
  return [
    {kind:'dialColor',value:gallery?'#e4decf':instrument?'#252e32':'#355b5c'},
    {kind:'text',id:design.objects[0].id,patch:{text:'ATELIER',size:1.55,x:0,y:5.8,color:ink}},
    {kind:'text',id:design.objects[1].id,patch:{text:gallery?'NO. 01':instrument?'INSTRUMENT':'COASTAL',size:.85,x:0,y:-6.5,color:gallery?'#575d56':'#cad2c8'}},
    {kind:'markers',patch:{style:preset==='coastal'?'dot':'baton',length:gallery?1.4:instrument?2.1:1.3,color:ink}},
    {kind:'track',patch:{visible:!gallery,color:gallery?'#77796d':'#a9b8b0'}},
    {kind:'handStyle',value:gallery?'leaf':'baton'},
    {kind:'strap',value:instrument?'cognac':'black'},
  ];
}
