import * as THREE from 'three';

/** Original appearance recipes, not measured alloys, coatings or fabric specifications. */
export const FINISH_VERSION = 'atelier-part-finishes-1.0.0' as const;
export const finishRecipes = Object.freeze({
  'titanium-look': Object.freeze({ color: '#87929b', metalness: 1, roughness: .43, pattern: 'grain' }),
  'champagne-gold-look': Object.freeze({ color: '#c7a166', metalness: 1, roughness: .23, pattern: 'none' }),
  'bronze-look': Object.freeze({ color: '#a16e48', metalness: 1, roughness: .36, pattern: 'grain' }),
  'ink-ceramic-look': Object.freeze({ color: '#142c42', metalness: 0, roughness: .2, pattern: 'none' }),
  'woven-textile-look': Object.freeze({ color: '#526259', metalness: 0, roughness: .91, pattern: 'weave' }),
});
export type FinishId = keyof typeof finishRecipes;
export type HandFinishId = Exclude<FinishId, 'woven-textile-look'>;

export function requireFinish(id: string, version: string): asserts id is FinishId {
  if (version !== FINISH_VERSION) throw new Error(`Unsupported part finish version: ${version}`);
  if (!Object.hasOwn(finishRecipes, id)) throw new Error(`Unsupported part finish: ${id}`);
}

/** Scalar roughness in green; all channels contain linear data, never dial artwork. */
function patternTexture(pattern: string) {
  const size = 128, data = new Uint8Array(size * size * 4);
  let seed = 390241;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    // A restrained weave, not a baked highlight/shadow map. Height is a separate channel map.
    const warp = ((x >> 3) + (y >> 3)) % 2 === 0;
    const strand = Math.sin((warp ? x : y) % 8 / 7 * Math.PI);
    const value = pattern === 'weave' ? 208 + Math.round(strand * 35) : 218 + (seed >>> 28);
    const offset = (y * size + x) * 4;
    data[offset] = data[offset + 1] = data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = `${FINISH_VERSION}/${pattern}`;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Fresh material AND maps per call. The caller owns this handle, never just its material. */
export function createFinish(id: FinishId, version: typeof FINISH_VERSION) {
  requireFinish(id, version);
  const recipe = finishRecipes[id];
  const material = new THREE.MeshPhysicalMaterial({
    color: recipe.color, metalness: recipe.metalness, roughness: recipe.roughness,
    clearcoat: id === 'ink-ceramic-look' ? .8 : 0,
    clearcoatRoughness: .16,
  });
  const textures: THREE.Texture[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    material.dispose();
    textures.forEach(texture => texture.dispose());
    textures.length = 0;
    material.roughnessMap = material.bumpMap = null;
  };
  try {
    material.name = id;
    material.userData.recipeVersion = version;
    if (recipe.pattern !== 'none') {
      const texture = patternTexture(recipe.pattern);
      textures.push(texture);
      material.roughnessMap = texture;
      if (recipe.pattern === 'weave') {
        // Scalar height data; no normal-map color encoding or lighting in base color.
        material.bumpMap = texture;
        material.bumpScale = .035;
        texture.repeat.set(3, 3);
      }
    }
    return { material, dispose };
  } catch (error) { dispose(); throw error; }
}
