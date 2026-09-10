import * as THREE from 'three';
import { RECIPE } from './recipe';

export const materialRecipes = Object.freeze({
  'brushed-steel-look': Object.freeze({ color: '#aeb9c1', metalness: 1, roughness: .3 }),
  'polished-steel-look': Object.freeze({ color: '#d5dee1', metalness: 1, roughness: .16 }),
  'matte-dial-look': Object.freeze({ color: '#ece6d8', metalness: .05, roughness: .82 }),
  'fine-grain-dial-look': Object.freeze({ color: '#ece6d8', metalness: .12, roughness: .7 }),
  'leather-look': Object.freeze({ color: '#252a2c', metalness: 0, roughness: .8 }),
  'rubber-look': Object.freeze({ color: '#20282b', metalness: 0, roughness: .96 }),
  'clear-crystal-look': Object.freeze({ color: '#ffffff', metalness: 0, roughness: .045 }),
});
export type MaterialLook = keyof typeof materialRecipes;

/** Always allocates a fresh material. No mutable singleton materials between variants. */
export function makeMaterial(look: MaterialLook, color?: string) {
  const recipe = materialRecipes[look];
  if (!recipe) throw new Error(`Unsupported material look: ${look}`);
  const material = look === 'clear-crystal-look'
    ? new THREE.MeshPhysicalMaterial({ ...recipe, transparent: true, opacity: .065,
      clearcoat: 1, clearcoatRoughness: .05, depthWrite: false })
    : new THREE.MeshStandardMaterial(recipe);
  if (color) material.color.set(color);
  material.name = look;
  material.userData.recipe = RECIPE.materials;
  return material;
}

/** Bounded original deterministic grain; scalar channels contain data, not sRGB artwork. */
export function grainTexture(seed: number = RECIPE.seed, size = 128) {
  if (!Number.isInteger(size) || size < 1 || size > 512) throw new Error('Invalid grain size.');
  let state = seed >>> 0;
  const bytes = new Uint8Array(size * size * 4);
  for (let i = 0; i < bytes.length; i += 4) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const value = 184 + (state >>> 28) * 2;
    bytes[i] = bytes[i + 1] = bytes[i + 2] = value;
    bytes[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(bytes, size, size);
  texture.name = 'atelier-grain-v1';
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
