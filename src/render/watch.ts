import * as THREE from "three";
import {
  WATCH_RENDER_CONTRACT,
  WATCH_ASSET_VERSION,
  type WatchAsset,
  type WatchRenderInput,
} from "./contract";

const STEEL = 0xb6c1c9;
/** Temporary stand-in only; the parallel assets candidate will replace this factory. */
export function buildWatch(input: WatchRenderInput): WatchAsset {
  const d = input.design;
  const group = new THREE.Group(),
    selectables: THREE.Object3D[] = [],
    warnings: string[] = [];
  const steel = new THREE.MeshStandardMaterial({
    color: STEEL,
    metalness: 1,
    roughness: 0.28,
  });
  const polished = new THREE.MeshStandardMaterial({
    color: 0xe3e8eb,
    metalness: 1,
    roughness: 0.12,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x333b3e,
    metalness: 0.9,
    roughness: 0.28,
  });
  const component = (role: string) =>
    d.components.find((c) => c.role === role)!.id;
  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    id?: string,
  ) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    if (id) {
      m.userData.semanticId = id;
      selectables.push(m);
    }
    group.add(m);
    return m;
  };
  const lathe = (points: number[][], material: THREE.Material, id?: string) => {
    const g = new THREE.LatheGeometry(
      points.map(([r, z]) => new THREE.Vector2(r, z)),
      128,
    );
    g.rotateX(Math.PI / 2);
    return add(g, material, 0, 0, 0, id);
  };
  // Authored concept cross-section, never supplier geometry.
  const shell = lathe(
    [
      [0, -5.55],
      [17.2, -5.55],
      [18.4, -4.1],
      [19.5, -2.6],
      [19.5, 1.6],
      [18.9, 3.1],
      [17, 3.4],
      [16, 3.1],
      [16, -2],
      [0, -2],
    ],
    steel,
    component("case"),
  );
  shell.name = "case-shell";
  lathe(
    [
      [16.1, 2.5],
      [18.9, 2.5],
      [18.9, 3.05],
      [18.1, 4],
      [16.4, 4.25],
      [16.1, 4.05],
      [16.1, 2.5],
    ],
    polished,
    component("bezel"),
  );
  lathe(
    [
      [16.08, 3.05],
      [16.5, 3.05],
      [16.5, 3.65],
      [16.08, 3.65],
      [16.08, 3.05],
    ],
    dark,
  );
  for (const sy of [-1, 1])
    for (const sx of [-1, 1]) {
      const s = new THREE.Shape();
      s.moveTo(sx * 8.7, sy * 13);
      s.lineTo(sx * 14.8, sy * 12);
      s.lineTo(sx * 13.1, sy * 21.9);
      s.quadraticCurveTo(sx * 12.7, sy * 23.25, sx * 10.4, sy * 23.25);
      s.lineTo(sx * 9.9, sy * 20);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, {
        depth: 4.4,
        bevelEnabled: true,
        bevelThickness: 0.65,
        bevelSize: 0.5,
        bevelSegments: 3,
        steps: 1,
      });
      // Extrusion bevels expand the outline. Fit the final mesh, not the source
      // curve, to the declared 46.5 mm concept envelope.
      g.computeBoundingBox();
      const extent = Math.max(
        Math.abs(g.boundingBox!.min.y),
        Math.abs(g.boundingBox!.max.y),
      );
      g.scale(1, d.dimensions.lugToLug / 2 / extent, 1);
      const lug = add(g, steel, 0, 0, -3.5, component("case"));
      lug.name = "case-lug";
    }
  const leather = new THREE.MeshStandardMaterial({
    color: d.strap === "black" ? 0x23262a : 0x78462c,
    roughness: 0.86,
    metalness: 0,
  });
  for (const sy of [-1, 1]) {
    const s = new THREE.Shape();
    s.moveTo(-9.7, sy * 18);
    s.lineTo(9.7, sy * 18);
    s.lineTo(8.6, sy * 40);
    s.quadraticCurveTo(0, sy * 44, -8.6, sy * 40);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 2.2,
      bevelEnabled: true,
      bevelThickness: 0.5,
      bevelSize: 0.6,
      bevelSegments: 3,
    });
    add(g, leather, 0, 0, -3.8, component("strap"));
    const stitch = new THREE.MeshStandardMaterial({
      color: d.strap === "black" ? 0x676562 : 0xaa8163,
      roughness: 1,
    });
    for (let y = 23; y < 39; y += 2.4)
      for (const sx of [-1, 1]) {
        const m = add(
          new THREE.BoxGeometry(0.16, 1.15, 0.07),
          stitch,
          sx * (9.1 - (y - 20) * 0.045),
          sy * y,
          -0.85,
        );
        m.rotation.z = sy * sx * 0.04;
      }
  }
  const crown = add(
    new THREE.CylinderGeometry(2.3, 2.3, 2.8, 32),
    steel,
    20.5,
    0,
    0,
    component("case"),
  );
  crown.rotation.z = Math.PI / 2;
  for (let x = 19.4; x < 21.8; x += 0.45) {
    const m = add(new THREE.TorusGeometry(2.25, 0.1, 4, 32), polished, x, 0, 0);
    m.rotation.y = Math.PI / 2;
  }
  const dialMaterial = new THREE.MeshStandardMaterial({
    map: input.dialTexture,
    roughness: 0.69,
    metalness: 0.12,
  });
  add(
    new THREE.CircleGeometry(16, 128),
    dialMaterial,
    0,
    0,
    3.45,
    component("dial"),
  );
  const hitPlanes = new Map<string, THREE.Mesh>();
  const hitMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  for (const text of [d.objects[0], d.objects[1]]) {
    const mesh = add(
      new THREE.PlaneGeometry(1, 1),
      hitMaterial,
      text.x,
      text.y,
      3.55,
      text.id,
    );
    hitPlanes.set(text.id, mesh);
  }
  const markers = d.objects[2];
  const markerMat = new THREE.MeshStandardMaterial({
    color: markers.color,
    metalness: 0.68,
    roughness: 0.3,
  });
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6,
      r = 13.6 - markers.length / 2;
    const geometry =
      markers.style === "dot"
        ? new THREE.CylinderGeometry(
            markers.length / 3,
            markers.length / 3,
            0.22,
            24,
          )
        : new THREE.BoxGeometry(
            i % 3 === 0 ? 0.55 : 0.38,
            markers.length,
            0.22,
          );
    if (markers.style === "dot") geometry.rotateX(Math.PI / 2);
    const m = add(
      geometry,
      markerMat,
      Math.sin(a) * r,
      Math.cos(a) * r,
      3.61,
      markers.id,
    );
    m.rotation.z = -a;
  }
  const handsMat = new THREE.MeshStandardMaterial({
    color: 0x8a989e,
    metalness: 1,
    roughness: 0.21,
  });
  function hand(length: number, width: number, angle: number, z: number) {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, -1.8);
    shape.lineTo(-width / 2, length * 0.7);
    if (d.handStyle === "leaf") {
      shape.quadraticCurveTo(-width, length * 0.82, 0, length);
    } else shape.lineTo(0, length);
    shape.lineTo(width / 2, length * 0.7);
    shape.lineTo(width / 2, -1.8);
    shape.closePath();
    const m = add(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.15,
        bevelEnabled: true,
        bevelSize: 0.04,
        bevelThickness: 0.04,
        bevelSegments: 1,
      }),
      handsMat,
      0,
      0,
      z,
      component("hands"),
    );
    m.rotation.z = angle;
    const inlay = add(
      new THREE.BoxGeometry(width * 0.34, length * 0.64, 0.03),
      new THREE.MeshStandardMaterial({ color: 0xe8e1c8, roughness: 0.6 }),
      -Math.sin(angle) * length * 0.39,
      Math.cos(angle) * length * 0.39,
      z + 0.23,
    );
    inlay.rotation.z = angle;
  }
  hand(9.8, 1.1, Math.PI / 3, 3.95);
  hand(13.1, 0.7, -Math.PI / 3, 4.23);
  // Offset the shape, not its rotation origin: every hand turns about the same pin.
  const secondsGeometry = new THREE.BoxGeometry(0.1, 15.1, 0.1);
  secondsGeometry.translate(0, -3.8, 0);
  const second = add(
    secondsGeometry,
    new THREE.MeshStandardMaterial({
      color: 0x984737,
      metalness: 0.45,
      roughness: 0.35,
    }),
    0,
    0,
    4.62,
    component("hands"),
  );
  second.name = "seconds-hand";
  second.rotation.z = 0.32;
  const pin = add(
    new THREE.CylinderGeometry(0.62, 0.62, 0.36, 32),
    polished,
    0,
    0,
    4.53,
  );
  pin.name = "hand-pivot";
  pin.rotation.x = Math.PI / 2;
  const glass = add(
    new THREE.CircleGeometry(16.15, 128),
    new THREE.MeshPhysicalMaterial({
      color: 0xf2f6ff,
      transparent: true,
      opacity: 0.09,
      roughness: 0.03,
      metalness: 0,
      clearcoat: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    0,
    0,
    5.25,
    component("crystal"),
  );
  glass.renderOrder = 3;
  let disposed = false;
  const update = (next: WatchRenderInput) => {
    if (disposed) throw new Error("Watch asset is disposed.");
    dialMaterial.map = next.dialTexture;
    leather.color.set(next.design.strap === "black" ? 0x23262a : 0x78462c);
    markerMat.color.set(next.design.objects[2].color);
    for (const text of [next.design.objects[0], next.design.objects[1]]) {
      const mesh = hitPlanes.get(text.id),
        bounds = next.textBounds.find((b) => b.id === text.id);
      if (mesh && bounds) {
        mesh.position.set(text.x, text.y, 3.55);
        mesh.scale.set(bounds.width, bounds.height, 1);
      }
    }
  };
  update(input);
  return {
    contractVersion: WATCH_RENDER_CONTRACT,
    assetVersion: WATCH_ASSET_VERSION,
    root: group,
    pickables: selectables,
    warnings,
    update,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          geometries.add(o.geometry);
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            materials.add(m),
          );
        }
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
