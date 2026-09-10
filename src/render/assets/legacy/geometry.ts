import * as THREE from 'three';
import { type Design } from '../../../domain/model';
import { makeMaterial, grainTexture } from './materials';
import { WatchPart } from './ownership';
import { RECIPE, handRotations } from './recipe';

export const componentId = (design: Design, role: Design['components'][number]['role']) => {
  const component = design.components.find(component => component.role === role);
  if (!component) throw new Error(`Missing concept component: ${role}`);
  return component.id;
};

function lathe(points: number[][]) {
  const geometry = new THREE.LatheGeometry(points.map(([radius, z]) => new THREE.Vector2(radius, z)), RECIPE.radialSegments);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** Rounded solid authored in XY. Bounds are explicit after the extrusion bevel. */
function solid(shape: THREE.Shape, depth: number, bevel: number) {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel,
    bevelThickness: bevel, bevelSegments: 3, curveSegments: 20, steps: 1 });
}

export function buildHead(design: Design) {
  const part = new WatchPart();
  try {
    const steel = part.own(makeMaterial('brushed-steel-look'));
    const polish = part.own(makeMaterial('polished-steel-look'));
    const inset = part.own(makeMaterial('brushed-steel-look', '#505b60'));
    const id = componentId(design, 'case');
    part.mesh('case.body', lathe([[0,-4.6],[17,-4.6],[18.2,-4.25],[19.2,-3.2],
      [19.5,-2.3],[19.5,.9],[19.35,1.6],[18.85,2.5],[17.4,2.95],[16,2.95],[16,-2.5],[0,-2.5]]), steel, id);
    part.mesh('case.back', lathe([[0,-5.4],[15.4,-5.4],[16.2,-5.2],[17.1,-4.7],[17.1,-4.4],[0,-4.4]]), steel, id);
    part.mesh('case.back-rim', lathe([[16.4,-4.96],[17.1,-4.72],[17.3,-4.4],[17.2,-4.18],[16.4,-4.18],[16.4,-4.96]]), polish, id);
    part.mesh('bezel.rim', lathe([[16,2.75],[18.5,2.75],[18.85,2.9],[18.85,3.25],
      [18.55,3.6],[17.3,4.2],[16.35,4.55],[16.1,4.5],[16,4.25],[16,2.75]]), polish, componentId(design,'bezel'));
    part.mesh('bezel.rehaut', lathe([[15.94,3.12],[16.08,3.12],[16.35,4.48],[16.18,4.48],[15.94,3.12]]), inset, componentId(design,'bezel'));

    for (const sy of [-1,1]) for (const sx of [-1,1]) {
      const shape = new THREE.Shape();
      shape.moveTo(sx*10.35,sy*12.5); shape.lineTo(sx*14.25,sy*12.1);
      shape.bezierCurveTo(sx*14.1,sy*16.8,sx*13.5,sy*21.7,sx*12.4,sy*22.9);
      shape.lineTo(sx*10.35,sy*22.9); shape.lineTo(sx*10.35,sy*18.5); shape.closePath();
      const geometry = solid(shape,3.1,.35);
      // Gentle downward lug sweep; no negative scale transforms or reversed normals.
      const position = geometry.getAttribute('position');
      for (let i=0;i<position.count;i++) position.setZ(i,position.getZ(i)-(Math.abs(position.getY(i))-12.1)*.17);
      geometry.computeVertexNormals();
      part.mesh(`case.lug.${sx}.${sy}`,geometry,steel,id,0,0,-2.4);
    }
    const crown = part.mesh('case.crown',lathe([[0,-1.8],[1.85,-1.8],[2.25,-1.5],[2.35,-1.15],[2.35,1.2],[2.15,1.55],[0,1.55]]),steel,id,20.65,0,-.4);
    crown.rotation.y=Math.PI/2;
    for(let i=0;i<9;i++) {
      const ring=part.mesh(`case.crown-flute.${i}`,new THREE.TorusGeometry(2.32,.055,4,48),polish,id,19.5+i*.27,0,-.4);
      ring.rotation.y=Math.PI/2;
    }
    const crystal = part.mesh('crystal.surface',lathe([[0,5.4],[7,5.38],[13,5.25],[15.7,4.98],
      [16.03,4.7],[16.03,4.5],[15.8,4.4],[0,4.4],[0,5.4]].reverse()),part.own(makeMaterial('clear-crystal-look')),componentId(design,'crystal'));
    crystal.renderOrder=3;
    crystal.userData.pickThrough=true;
    return part;
  } catch (error) { part.dispose(); throw error; }
}

export function buildStrap(design: Design) {
  const part = new WatchPart();
  try {
    const leather=part.own(makeMaterial('leather-look',design.strap==='black'?'#24282a':'#794a32'));
    const grain=part.own(grainTexture()); grain.repeat.set(3,8); leather.roughnessMap=grain;
    const stitch=part.own(makeMaterial('rubber-look',design.strap==='black'?'#62615b':'#bd9571'));
    for(const sy of [-1,1]) {
      const shape=new THREE.Shape();
      shape.moveTo(-9.65,19.3);shape.lineTo(9.65,19.3);shape.lineTo(8.25,39.8);
      shape.quadraticCurveTo(8.2,42.2,0,43.7);shape.quadraticCurveTo(-8.2,42.2,-8.25,39.8);shape.closePath();
      const geometry=solid(shape,1.7,.3);
      if(sy<0)geometry.rotateZ(Math.PI);
      part.mesh(`strap.${sy>0?'upper':'lower'}`,geometry,leather,componentId(design,'strap'),0,0,-3.65);
      for(let y=24;y<39;y+=1.65)for(const sx of [-1,1]) {
        const seam=part.mesh(`strap.stitch.${sy}.${sx}.${y}`,new THREE.CapsuleGeometry(.055,.7,2,4),stitch,componentId(design,'strap'),sx*(9-(y-20)*.07),sy*y,-1.6);
        seam.rotation.z=sx*sy*.07;
      }
    }
    return part;
  } catch(error) { part.dispose(); throw error; }
}

export function buildHands(design: Design) {
  const part=new WatchPart();
  try {
    const metal=part.own(makeMaterial('polished-steel-look','#aebfc7'));
    metal.metalness=.65;metal.roughness=.26;
    const light=part.own(makeMaterial('matte-dial-look','#e8dfc9'));
    const accent=part.own(makeMaterial('matte-dial-look','#b36045'));
    const rotations=handRotations();
    const id=componentId(design,'hands');
    for(const [name,length,width,z] of [['hour',9.4,1.12,3.65],['minute',12.45,.76,4.01]] as const) {
      const shape=new THREE.Shape();
      if(design.handStyle==='leaf') {
        shape.moveTo(0,-1.9);
        shape.bezierCurveTo(-width*.42,-1.8,-width*.63,length*.36,-width*.48,length*.62);
        shape.quadraticCurveTo(-width*.28,length*.87,0,length);
        shape.quadraticCurveTo(width*.28,length*.87,width*.48,length*.62);
        shape.bezierCurveTo(width*.63,length*.36,width*.42,-1.8,0,-1.9);
      } else {
        shape.moveTo(-width/2,-1.9);shape.lineTo(-width/2,length*.74);shape.lineTo(0,length);
        shape.lineTo(width/2,length*.74);shape.lineTo(width/2,-1.9);
      }
      shape.closePath();
      const pivot=new THREE.Group();pivot.name=`hands.${name}.pivot`;pivot.userData.semanticId=id;
      pivot.position.z=z;pivot.rotation.z=rotations[name];part.group.add(pivot);
      const mesh=part.mesh(`hands.${name}`,solid(shape,.1,.035),metal,id);pivot.add(mesh);
      const inlayShape=new THREE.Shape();
      inlayShape.moveTo(0,length*.12);inlayShape.quadraticCurveTo(-width*.25,length*.45,0,length*.83);
      inlayShape.quadraticCurveTo(width*.25,length*.45,0,length*.12);inlayShape.closePath();
      const inlayGeometry=design.handStyle==='leaf'?solid(inlayShape,.02,.005):new THREE.BoxGeometry(width*.34,length*.62,.03);
      const inlay=part.mesh(`hands.${name}.inlay`,inlayGeometry,light,id,0,design.handStyle==='leaf'?0:length*.41,.16);pivot.add(inlay);
    }
    const pivot=new THREE.Group();pivot.name='hands.second.pivot';pivot.userData.semanticId=id;
    pivot.position.z=4.42;pivot.rotation.z=rotations.second;part.group.add(pivot);
    const second=part.mesh('hands.second',new THREE.BoxGeometry(.12,16.6,.085),accent,id,0,5.5,0);pivot.add(second);
    const counter=part.mesh('hands.second.counterweight',new THREE.TorusGeometry(.57,.12,6,32),accent,id,0,-1.9,.03);pivot.add(counter);
    const cap=part.mesh('hands.pin',new THREE.CylinderGeometry(.5,.5,.24,48),metal,id,0,0,4.48);cap.rotation.x=Math.PI/2;
    return part;
  } catch(error) { part.dispose(); throw error; }
}
