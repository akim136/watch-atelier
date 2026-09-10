import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import type { Mesh, MeshStandardMaterial } from "three";
import type { Design } from "../../src/domain/model";
import type { Edit } from "../../src/domain/commands";

test("[M1-07] either comparison viewport synchronizes both cameras and presets reset an orbit", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".canvas-wrap canvas")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await page.getByLabel("Duplicate study", { exact: true }).click();
  await page.getByRole("button", { name: "Compare studies" }).click();
  const canvases = page.locator(".canvas-wrap canvas");
  await expect(canvases).toHaveCount(2);
  await expect(canvases.nth(1)).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "Front", exact: true }).click();
  const front = await canvases.first().screenshot();
  for (const source of [1, 0]) {
    const before = await canvases.nth(1 - source).screenshot();
    const box = (await canvases.nth(source).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 70,
      box.y + box.height / 2 + 30,
      { steps: 10 },
    );
    await page.mouse.up();
    await expect
      .poll(async () =>
        (await canvases.nth(1 - source).screenshot()).equals(before),
      )
      .toBe(false);
  }
  await page.screenshot({
    path: info.outputPath("right-driven-comparison.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Front", exact: true }).click();
  await expect
    .poll(async () => (await canvases.first().screenshot()).equals(front))
    .toBe(true);
  expect(errors).toEqual([]);
});

test("[M1-14][M1-16] context loss stays unready through edits and restoration renders the latest design", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".canvas-wrap canvas")).toHaveAttribute(
    "data-ready",
    "true",
  );
  const result = await page.evaluate(async () => {
    const vp = "/src/render/viewport.ts",
      mp = "/src/domain/model.ts";
    const [{ WatchViewport }, { newProject }] = await Promise.all([
      import(vp),
      import(mp),
    ]);
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:700px;height:600px";
    document.body.append(canvas);
    let warning = "";
    const view = new WatchViewport(
      canvas,
      undefined,
      (message: string) => (warning = message),
    );
    const until = async (predicate: () => boolean) => {
      const deadline = performance.now() + 5000;
      while (!predicate()) {
        if (performance.now() > deadline)
          throw new Error("Context recovery timed out");
        await new Promise(requestAnimationFrame);
      }
    };
    try {
      const d = newProject().variants[0].design;
      await view.update(d);
      const gl = view.renderer.getContext(),
        ext = gl.getExtension("WEBGL_lose_context");
      if (!ext)
        throw new Error("Required WebGL context-loss capability unavailable");
      ext.loseContext();
      await until(() => warning.includes("context lost"));
      const lostReady = view.status.ready;
      d.dialColor = "#173d41";
      d.objects[0].text = "AFTER RECOVERY";
      d.revision++;
      await view.update(d);
      const during = {
        ready: view.status.ready,
        warning,
        lost: gl.isContextLost(),
      };
      ext.restoreContext();
      await until(() => !gl.isContextLost() && view.status.ready);
      const dialId = d.components.find(
        (c: { role: string }) => c.role === "dial",
      ).id;
      let pixel: number[] = [];
      view.scene.traverse((o: Mesh) => {
        if (o.userData.semanticId === dialId) {
          const image = (o.material as MeshStandardMaterial).map!
            .image as HTMLCanvasElement;
          pixel = Array.from(
            image.getContext("2d")!.getImageData(1024, 1024, 1, 1).data,
          );
        }
      });
      view.render();
      return {
        lostReady,
        during,
        restored: view.status.ready,
        warning,
        pixel,
        input: view.status.manifest.input,
        expected: JSON.stringify(d),
        textures: view.status.resources.textures,
      };
    } finally {
      view.dispose();
      canvas.remove();
    }
  });
  expect(result.lostReady).toBe(false);
  expect(result.during.ready).toBe(false);
  expect(result.during.lost).toBe(true);
  expect(result.during.warning).toContain("context lost");
  expect(result.restored).toBe(true);
  expect(result.warning).toBe("");
  expect(result.pixel).toEqual([23, 61, 65, 255]);
  expect(result.input).toBe(result.expected);
  expect(result.textures).toBeGreaterThan(1);
});

test("[M1-02][M1-03] actual artwork, markers and exported pixels follow edits and reject a divergent projection", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.locator(".canvas-wrap canvas")).toHaveAttribute(
    "data-ready",
    "true",
  );
  const result = await page.evaluate(async () => {
    const vp = "/src/render/viewport.ts",
      mp = "/src/domain/model.ts",
      cp = "/src/domain/commands.ts";
    const [
      { WatchViewport, exportPNG },
      { newProject },
      { applyProjectCommand },
    ] = await Promise.all([import(vp), import(mp), import(cp)]);
    const canvas = document.createElement("canvas"),
      view = new WatchViewport(canvas, undefined, undefined, true);
    let project = newProject();
    const design = (): Design => project.variants[0].design;
    const apply = (edits: Edit[]) => {
      project = applyProjectCommand(
        project,
        { type: "edit", variantId: project.variants[0].id, edits },
        project.revision,
      ).project;
    };
    const pixels = async (blob: Blob) => {
      const bitmap = await createImageBitmap(blob),
        c = document.createElement("canvas");
      c.width = bitmap.width;
      c.height = bitmap.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const difference = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
      if (a.length !== b.length)
        throw new Error("Projection dimensions differ");
      let changed = 0,
        max = 0;
      for (let i = 0; i < a.length; i += 4) {
        const delta = Math.max(
          ...[0, 1, 2].map((c) => Math.abs(a[i + c] - b[i + c])),
        );
        max = Math.max(max, delta);
        if (delta > 2) changed++;
      }
      return { changed, max };
    };
    const faithful = (live: Uint8ClampedArray, png: Uint8ClampedArray) => {
      const diff = difference(live, png);
      if (diff.changed)
        throw new Error(
          `Divergent projection: ${diff.changed} pixels differ by more than 2/255`,
        );
      return diff;
    };
    const snapshots: Uint8ClampedArray[] = [],
      diffs: { changed: number; max: number }[] = [],
      encoded: string[] = [];
    try {
      view.resize(1600, 1200);
      view.setPreset("Front");
      const capture = async () => {
        await view.update(design());
        view.render();
        const liveBlob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b!), "image/png"),
        );
        const png = await exportPNG(design(), "Front"),
          exported = await pixels(png);
        diffs.push(faithful(await pixels(liveBlob), exported));
        snapshots.push(exported);
        // Only test-owned concepts enter evidence, never private reference images.
        const bytes = new Uint8Array(await png.arrayBuffer());
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        encoded.push(btoa(binary));
      };
      await capture();
      apply([{ kind: "dialColor", value: "#173d41" }]);
      await capture();
      apply([
        {
          kind: "text",
          id: design().objects[0].id,
          patch: { text: "PIXEL 7", size: 2, color: "#ffffff", x: 0, y: 5 },
        },
      ]);
      await capture();
      apply([
        {
          kind: "markers",
          patch: { style: "dot", length: 3, color: "#ff8844" },
        },
      ]);
      await capture();
      const dialId = design().components.find((c) => c.role === "dial")!.id;
      let artwork: HTMLCanvasElement | undefined;
      const markers: { type: string; length: number; color: string }[] = [];
      view.scene.traverse((o: Mesh) => {
        if (o.userData.semanticId === dialId)
          artwork = (o.material as MeshStandardMaterial).map!
            .image as HTMLCanvasElement;
        if (o.userData.semanticId === design().objects[2].id) {
          o.geometry.computeBoundingBox();
          const b = o.geometry.boundingBox!;
          markers.push({
            type: o.geometry.type,
            length: b.max.x - b.min.x,
            color: `#${(o.material as MeshStandardMaterial).color.getHexString()}`,
          });
        }
      });
      const ctx = artwork!.getContext("2d")!;
      const background = Array.from(ctx.getImageData(1024, 1024, 1, 1).data);
      // Independently draw the specified glyphs/placement in a track-free region.
      // This detects wrong/omitted text, not merely a self-reported input manifest.
      const expected = document.createElement("canvas");
      expected.width = expected.height = 2048;
      const oracle = expected.getContext("2d")!;
      oracle.fillStyle = "#173d41";
      oracle.fillRect(0, 0, 2048, 2048);
      oracle.font = '500 128px "Atelier Plex", sans-serif';
      oracle.textAlign = "center";
      oracle.textBaseline = "middle";
      oracle.fillStyle = "#ffffff";
      oracle.fillText("PIXEL 7", 1024, 704);
      const textDifference = difference(
        ctx.getImageData(500, 600, 1048, 210).data,
        oracle.getImageData(500, 600, 1048, 210).data,
      );
      let divergentRejected = false;
      try {
        faithful(snapshots[3], snapshots[0]);
      } catch {
        divergentRejected = true;
      }
      return {
        diffs,
        changes: snapshots.slice(1).map((p, i) => difference(p, snapshots[i])),
        background,
        textDifference,
        markers,
        divergentRejected,
        encoded,
      };
    } finally {
      view.dispose();
    }
  });
  expect(result.diffs.every((d) => d.changed === 0)).toBe(true);
  expect(result.background).toEqual([23, 61, 65, 255]);
  expect(result.textDifference.changed).toBe(0);
  expect(result.markers).toHaveLength(12);
  expect(
    result.markers.every(
      (m) =>
        m.type === "CylinderGeometry" &&
        Math.abs(m.length - 2) < 1e-5 &&
        m.color === "#ff8844",
    ),
  ).toBe(true);
  expect(result.changes[0].changed).toBeGreaterThan(10_000);
  expect(result.changes[1].changed).toBeGreaterThan(50);
  expect(result.changes[2].changed).toBeGreaterThan(50);
  expect(result.divergentRejected).toBe(true);
  for (let i = 0; i < result.encoded.length; i++)
    await writeFile(
      info.outputPath(`projection-${i}.png`),
      Buffer.from(result.encoded[i], "base64"),
    );
  await writeFile(
    info.outputPath("projection-metrics.json"),
    JSON.stringify({ ...result, encoded: undefined }, null, 2),
  );
});
