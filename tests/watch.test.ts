import { expect, it } from "vitest";
import { Box3, Mesh, Texture, Vector3 } from "three";
import { newProject } from "../src/domain/model";
import { buildWatch } from "../src/render/watch";

function pivotDistance(hand: Mesh, pivot: Vector3) {
  hand.geometry.computeBoundingBox();
  const box = hand.geometry.boundingBox!;
  const a = hand.localToWorld(new Vector3(0, box.min.y, 0)),
    b = hand.localToWorld(new Vector3(0, box.max.y, 0));
  const dx = b.x - a.x,
    dy = b.y - a.y;
  return {
    distance:
      Math.abs(dx * (pivot.y - a.y) - dy * (pivot.x - a.x)) /
      Math.hypot(dx, dy),
    along: ((pivot.x - a.x) * dx + (pivot.y - a.y) * dy) / (dx * dx + dy * dy),
  };
}
it("[M1-17] final mesh bounds match declared case diameter, thickness and lug-to-lug millimeters", () => {
  const design = newProject().variants[0].design,
    texture = new Texture();
  const asset = buildWatch({ design, dialTexture: texture, textBounds: [] });
  try {
    asset.root.updateMatrixWorld(true);
    const whole = new Box3().setFromObject(asset.root);
    const shell = new Box3().setFromObject(
      asset.root.getObjectByName("case-shell")!,
    );
    const lugs = new Box3();
    asset.root.traverse((o) => {
      if (o.name === "case-lug") lugs.expandByObject(o);
    });
    expect(shell.max.x - shell.min.x).toBeCloseTo(
      design.dimensions.diameter,
      4,
    );
    expect(whole.max.z - whole.min.z).toBeCloseTo(
      design.dimensions.thickness,
      4,
    );
    expect(lugs.max.y - lugs.min.y).toBeCloseTo(design.dimensions.lugToLug, 4);
    expect(lugs.max.y).toBeCloseTo(-lugs.min.y, 4);
    // These checks measure post-bevel geometry, not the authored curve or manifest.
    expect(Math.abs(9.75 - design.dimensions.thickness)).toBeGreaterThan(1);
    expect(Math.abs(47.521965 - design.dimensions.lugToLug)).toBeGreaterThan(1);
  } finally {
    asset.dispose();
    texture.dispose();
  }
});
it("[M1-19] seconds-hand centerline crosses the shared pin at every rotation, with old-offset negative control", () => {
  const design = newProject().variants[0].design,
    texture = new Texture();
  const asset = buildWatch({
    design,
    dialTexture: texture,
    textBounds: design.objects
      .slice(0, 2)
      .map((o) => ({ id: o.id, width: 4, height: 2 })),
  });
  try {
    const seconds = asset.root.getObjectByName("seconds-hand") as Mesh;
    const pivot = asset.root
      .getObjectByName("hand-pivot")!
      .getWorldPosition(new Vector3());
    for (const angle of [0, 0.32, Math.PI / 2, Math.PI, Math.PI * 1.7]) {
      seconds.rotation.z = angle;
      asset.root.updateMatrixWorld(true);
      const result = pivotDistance(seconds, pivot);
      expect(result.distance).toBeLessThan(1e-6);
      expect(result.along).toBeGreaterThan(0);
      expect(result.along).toBeLessThan(1);
    }
    const old = seconds.clone();
    old.geometry = seconds.geometry.clone();
    old.geometry.translate(0, 3.8, 0);
    old.position.y = -3.8;
    old.rotation.z = 0.32;
    old.updateMatrixWorld(true);
    expect(pivotDistance(old, pivot).distance).toBeGreaterThan(1);
    old.geometry.dispose();
  } finally {
    asset.dispose();
    texture.dispose();
  }
});
