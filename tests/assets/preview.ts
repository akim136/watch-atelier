import * as THREE from 'three';
import { applyProjectCommand, type Edit } from '../../src/domain/commands';
import { WatchViewport, exportPNG, type Preset } from '../../src/render/viewport';
import { fixtureProject } from './fixture';
import { buildWatch, renderSnapshot } from '../../src/render/watch';
import { DialArtwork } from '../../src/render/dial';
import { LatestArtifact, loadFonts } from '../../src/render/resources';
import { starterEdits, starterPresets, type StarterPreset } from '../../src/render/presets';

const canvas=document.querySelector('canvas')!;
const status=document.querySelector('#status')!;
let project=fixtureProject();
const view=new WatchViewport(canvas,undefined,message=>{status.textContent=message||'Concept only · intended font ready';});
async function edit(edits: Edit[]) {
  const accepted=applyProjectCommand(project,{type:'edit',variantId:project.variants[0].id,edits},project.revision);
  if(!accepted.changed)throw new Error('Fixture edit must change the canonical document.');
  project=accepted.project;await view.update(project.variants[0].design);return structuredClone(project);
}
const ready=view.update(project.variants[0].design);
const selector=document.createElement('select');selector.setAttribute('aria-label','Starter fixture');
selector.add(new Option('Initial fixture',''));
starterPresets.forEach(preset=>selector.add(new Option(preset.name,preset.id)));
document.querySelector('header')!.append(selector);
selector.addEventListener('change',()=>{if(selector.value)void edit(starterEdits(project.variants[0].design,selector.value as StarterPreset));});
document.querySelector('#camera')!.addEventListener('change',event=>view.setPreset((event.target as HTMLSelectElement).value as Preset));
document.querySelector('#edit')!.addEventListener('click',()=>{void edit([{kind:'dialColor',value:'#305458'},{kind:'text',id:project.variants[0].design.objects[0].id,patch:{text:'COASTAL'}}]);});
const fixture={view,ready,edit,design:()=>structuredClone(project.variants[0].design),exportPNG,WatchViewport,
  buildWatch,renderSnapshot,DialArtwork,LatestArtifact,loadFonts,starterEdits,starterPresets,THREE};
declare global { interface Window { assetFixture: typeof fixture } }
window.assetFixture=fixture;
