import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { RECIPE } from '../../src/render/recipe.ts';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceFiles=(await readdir('src/render')).filter(file=>file.endsWith('.ts')).sort().map(file=>`src/render/${file}`);
const sources=await Promise.all(sourceFiles.map(async path=>({path,sha256:hash(await readFile(path))})));
const fontProvenance=JSON.parse(await readFile('docs/assets/font-provenance.json','utf8'));
const dependencies=[];
for(const name of ['three','zod']) {
  const pkg=JSON.parse(await readFile(`node_modules/${name}/package.json`,'utf8'));
  dependencies.push({id:name,version:pkg.version,license:pkg.license,source:pkg.repository,
    packageManifestSha256:hash(await readFile(`node_modules/${name}/package.json`))});
}
for(const weight of ['Regular','Medium']) {
  const path=`public/fonts/IBMPlexSansCondensed-${weight}.woff2`;
  dependencies.push({id:`ibm-plex-sans-condensed-${weight.toLowerCase()}`,version:'2.0.0',license:'OFL-1.1',
    path,sha256:hash(await readFile(path)),provenance:'docs/assets/font-provenance.json'});
}
dependencies.push({id:'ibm-plex-license',license:'OFL-1.1',path:'public/fonts/OFL.txt',sha256:hash(await readFile('public/fonts/OFL.txt'))});
const registry={format:'watch-atelier-asset-registry',version:1,template:RECIPE.template,recipeVersion:RECIPE.version,
  materialsVersion:RECIPE.materials,environmentVersion:RECIPE.environment,cameraVersion:RECIPE.cameras,
  realization:'concept',dimensionSource:'design-authored',units:'mm',catalogIdentity:null,
  physicalValidation:'not-assessed',originality:'original procedural authorship; external rights clearance not asserted',
  sources,sourceContentHash:hash(Buffer.from(JSON.stringify(sources))),dependencies,
  fontSourceRevision:fontProvenance.gitHead,
  assets:[
    {id:RECIPE.template,kind:'procedural-watch-template',source:'src/render/geometry.ts',roles:['case','bezel','hands','crystal','strap']},
    {id:'atelier-semantic-dial',kind:'semantic-dial-projection',source:'src/render/dial.ts',roles:['dial','text','markers','track']},
    {id:RECIPE.materials,kind:'appearance-library',source:'src/render/materials.ts',count:7},
    {id:RECIPE.environment,kind:'procedural-environment',source:'src/render/studio.ts',externalImages:false},
    {id:'atelier-starters-1.0.0',kind:'typed-edit-presets',source:'src/render/presets.ts',presets:['instrument','gallery','coastal']},
  ],
  verification:{report:'docs/assets/INTEGRATION.md',humanVisualAcceptance:'pending',fullApplicationIntegration:'pending'},
};
await writeFile('docs/assets/registry.json',JSON.stringify(registry,null,2)+'\n');
console.log(`Recorded ${sources.length} source recipes and ${dependencies.length} dependencies (${registry.sourceContentHash}).`);
