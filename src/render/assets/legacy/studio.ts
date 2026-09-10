import * as THREE from 'three';
import { OwnedResources } from './ownership';
import { RECIPE } from './recipe';

export type Preset = 'Oblique'|'Front'|'Profile'|'Detail';
export type CameraState = { position: number[]; target: number[]; zoom: number };
export const presets: Record<Preset,CameraState> = {
  Oblique:{position:[36,45,132],target:[0,0,0],zoom:1},
  Front:{position:[0,0,136],target:[0,0,0],zoom:1},
  Profile:{position:[150,18,9],target:[0,0,0],zoom:1.05},
  Detail:{position:[16,23,104],target:[0,1,3],zoom:1.9},
};

/** Original neutral studio: three softboxes and two flags; no external HDR or texture. */
export function createStudio(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const owner=new OwnedResources(),source=new THREE.Scene();
  let environment: THREE.WebGLRenderTarget|undefined;
  try {
    const room=owner.own(new THREE.BoxGeometry(240,240,240));
    const wall=owner.own(new THREE.MeshBasicMaterial({color:'#8b9297',side:THREE.BackSide}));
    source.add(new THREE.Mesh(room,wall));
    for(const [width,height,x,y,z,intensity] of [[65,130,-65,35,70,3.5],[36,115,80,10,35,2.8],[90,28,0,-60,70,1.8]]) {
      const geometry=owner.own(new THREE.PlaneGeometry(width,height));
      const material=owner.own(new THREE.MeshBasicMaterial({color:new THREE.Color('white').multiplyScalar(intensity),side:THREE.DoubleSide}));
      const card=new THREE.Mesh(geometry,material);card.position.set(x,y,z);card.lookAt(0,0,0);source.add(card);
    }
    const pmrem=owner.own(new THREE.PMREMGenerator(renderer));
    environment=pmrem.fromScene(source,.04);
    environment.texture.name=RECIPE.environment;
    scene.environment=environment.texture;scene.environmentIntensity=1;
    scene.background=new THREE.Color('#151c21');
    const lights=new THREE.Group();
    lights.add(new THREE.HemisphereLight(0xeaf1f5,0x495052,1));
    const key=new THREE.DirectionalLight(0xfff4e2,1.8);key.position.set(-35,55,80);lights.add(key);
    const fill=new THREE.DirectionalLight(0xd7e7f5,.5);fill.position.set(45,-20,40);lights.add(fill);
    scene.add(lights);
    let disposed=false;
    return { dispose() { if(disposed)return;disposed=true;environment?.dispose();lights.removeFromParent();scene.environment=null; } };
  } catch(error) {environment?.dispose();scene.environment=null;throw error;}
  finally { owner.dispose();source.clear(); }
}
