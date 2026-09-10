import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { RECIPE } from '../../src/render/assets/legacy/recipe';

it('[ASSET-PROVENANCE] asset registry matches actual sources and bundled dependencies; missing dependency is not a pass',async()=>{
  const registry=JSON.parse(await readFile('docs/assets/registry.json','utf8'));
  expect(registry.assets).toHaveLength(5);expect(registry.sources.length).toBeGreaterThanOrEqual(10);
  expect(registry.template).toBe(RECIPE.template);expect(registry.recipeVersion).toBe(RECIPE.version);
  expect(registry.materialsVersion).toBe(RECIPE.materials);expect(registry.environmentVersion).toBe(RECIPE.environment);
  const check=async(path:string,sha256:string)=>createHash('sha256').update(await readFile(path)).digest('hex')===sha256;
  for(const source of registry.sources)expect(await check(source.path,source.sha256)).toBe(true);
  for(const dependency of registry.dependencies)if(dependency.path)expect(await check(dependency.path,dependency.sha256)).toBe(true);
  await expect(check('public/fonts/does-not-exist.woff2','0'.repeat(64))).rejects.toThrow();
  expect(await check(registry.sources[0].path,'0'.repeat(64))).toBe(false);
});
