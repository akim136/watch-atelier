import { fixtureProject } from './fixture';
import { createHandSet, HAND_RECIPE_VERSION, REGRESSION_TIME, type HandRecipeId, type HandSetInput } from '../../src/render/assets/hands';
import { FINISH_VERSION, type HandFinishId } from '../../src/render/assets/materials';

/** Authoring-only choices. No unknown enums enter the canonical fixture Design. */
export function handInput(recipeId: HandRecipeId = 'pencil', finishId: HandFinishId = 'titanium-look'): HandSetInput {
  const design = fixtureProject().variants[0].design;
  const component = design.components.find(component => component.role === 'hands')!;
  return { units: 'mm', recipeId, recipeVersion: HAND_RECIPE_VERSION, finishId,
    finishVersion: FINISH_VERSION, component: { role: 'hands', id: component.id },
    presentation: { ...REGRESSION_TIME } };
}
export type HandAsset = ReturnType<typeof createHandSet>;
