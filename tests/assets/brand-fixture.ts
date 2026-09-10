import * as THREE from 'three';
import { fixtureProject } from './fixture';
import { MODEL_STUDY_VERSION, STUDY_PRESENTATION, studyArtworkKey, type ModelStudyId, type StudyPresentation } from '../../src/render/assets/model-recipes';
import type { ModelStudyInput } from '../../src/render/assets/model-studies';

export function studyInput(id: ModelStudyId, presentation: StudyPresentation = STUDY_PRESENTATION): ModelStudyInput {
  const map = () => {
    const t = new THREE.DataTexture(new Uint8Array(16).fill(255), 2, 2); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
  };
  return { units: 'mm', studyId: id, version: MODEL_STUDY_VERSION,
    components: fixtureProject().variants[0].design.components,
    presentation: { ...presentation }, artwork: { ready: true, key: studyArtworkKey(id, presentation), dial: map(), bezel: map() } };
}
