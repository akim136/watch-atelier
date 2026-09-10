import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("[M1-16][M1-17] real renderer rejects stale work, reuses geometry and matches semantic IDs", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("canvas").first()).toHaveAttribute(
    "data-ready",
    "true",
  );
  const result = await page.evaluate(async () => {
    const viewportPath = "/src/render/viewport.ts",
      modelPath = "/src/domain/model.ts",
      resourcePath = "/src/render/resources.ts";
    const [{ WatchViewport }, { newProject }, { loadFonts }] =
      await Promise.all([
        import(viewportPath),
        import(modelPath),
        import(resourcePath),
      ]);
    const canvas = document.createElement("canvas");
    canvas.style.width = "700px";
    canvas.style.height = "600px";
    document.body.append(canvas);
    const view = new WatchViewport(canvas);
    try {
      const first = newProject().variants[0].design,
        newest = structuredClone(first);
      newest.dialColor = "#173d41";
      newest.revision = 2;
      newest.objects[0].text = "LATEST";
      const oldPending = view.update(first),
        newPending = view.update(newest);
      await Promise.all([oldPending, newPending]);
      const manifest = view.status.manifest;
      const caseId = newest.components.find(
        (c: { role: string }) => c.role === "case",
      ).id;
      // Inspect real projected nodes rather than a mocked scene description.
      let caseNode: { uuid: string; geometry: { uuid: string } } | undefined;
      const projectedIds: string[] = [];
      view.scene.traverse(
        (o: {
          uuid: string;
          userData: { semanticId?: string };
          geometry?: { uuid: string };
        }) => {
          if (o.userData.semanticId) projectedIds.push(o.userData.semanticId);
          if (o.userData.semanticId === caseId && o.geometry)
            caseNode = { uuid: o.uuid, geometry: o.geometry };
        },
      );
      const before = caseNode!.geometry.uuid,
        fontPromise = loadFonts();
      const changed = structuredClone(newest);
      changed.dialColor = "#704037";
      changed.revision++;
      changed.objects[0].text = "NEW ARTWORK";
      await view.update(changed);
      let after = "";
      view.scene.traverse(
        (o: {
          userData: { semanticId?: string };
          geometry?: { uuid: string };
        }) => {
          if (
            o.userData.semanticId === caseId &&
            o.geometry &&
            o.geometry.uuid === before
          )
            after = o.geometry.uuid;
        },
      );
      return {
        input: manifest.input,
        expected: JSON.stringify(newest),
        before,
        after,
        reusedFonts: fontPromise === loadFonts(),
        projectedIds,
        allowedIds: [
          ...newest.components.map((c: { id: string }) => c.id),
          ...newest.objects.map((o: { id: string }) => o.id),
        ],
        finalInput: view.status.manifest.input,
        finalExpected: JSON.stringify(changed),
        units: newest.units,
      };
    } finally {
      view.dispose();
      view.dispose();
      canvas.remove();
    }
  });
  expect(result.input).toBe(result.expected);
  expect(result.finalInput).toBe(result.finalExpected);
  expect(result.before).toBe(result.after);
  expect(result.reusedFonts).toBe(true);
  expect(result.units).toBe("mm");
  expect(result.projectedIds.length).toBeGreaterThan(10);
  expect(
    result.projectedIds.every((id: string) => result.allowedIds.includes(id)),
  ).toBe(true);
});

test("[M1-19] fixed views, numeric editing, keyboard cancellation and narrow layouts", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.locator("canvas").first()).toHaveAttribute(
    "data-ready",
    "true",
  );
  const revision = await page
    .getByTestId("studio")
    .getAttribute("data-revision");
  await page.getByLabel("Dial text", { exact: true }).fill("CANCEL THIS");
  await page.getByLabel("Dial text", { exact: true }).press("Escape");
  await expect(page.getByLabel("Dial text", { exact: true })).toHaveValue(
    "ATELIER",
  );
  await expect(page.getByTestId("studio")).toHaveAttribute(
    "data-revision",
    revision!,
  );
  await page.getByLabel("X mm", { exact: true }).fill("1.2");
  await page.getByLabel("X mm", { exact: true }).press("Enter");
  await expect(page.getByTestId("studio")).toHaveAttribute(
    "data-revision",
    String(Number(revision) + 1),
  );
  for (const name of ["Front", "Oblique", "Profile", "Detail"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({
      path: info.outputPath(`${name.toLowerCase()}.png`),
      animations: "disabled",
    });
  }
  await page.getByRole("button", { name: "Export", exact: false }).click();
  await expect(page.getByLabel("Close dialog")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Export", exact: false }),
  ).toBeFocused();
  for (const width of [720, 390]) {
    await page.setViewportSize({ width, height: width === 720 ? 450 : 844 });
    await expect(page.getByLabel("Dial hex", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(
        width === 720 ? "200-percent-equivalent.png" : "narrow.png",
      ),
      fullPage: true,
      animations: "disabled",
    });
  }
});

test("[M1-19] primary Chromium responsiveness and warmed GPU resource bounds", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.locator("canvas").first()).toHaveAttribute(
    "data-ready",
    "true",
  );
  const metrics = await page.evaluate(async () => {
    const viewportPath = "/src/render/viewport.ts",
      modelPath = "/src/domain/model.ts",
      commandPath = "/src/domain/commands.ts";
    const [
      { WatchViewport, exportPNG },
      { newProject },
      { applyProjectCommand },
    ] = await Promise.all([
      import(viewportPath),
      import(modelPath),
      import(commandPath),
    ]);
    const canvas = document.createElement("canvas");
    canvas.style.cssText =
      "width:884px;height:700px;position:fixed;inset:0;z-index:99";
    document.body.append(canvas);
    const view = new WatchViewport(canvas);
    let project = newProject();
    const percentile = (values: number[], fraction: number) =>
      [...values].sort((a, b) => a - b)[
        Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)
      ];
    try {
      await view.update(project.variants[0].design);
      const edits: number[] = [];
      for (let i = 0; i < 30; i++) {
        const start = performance.now();
        project = applyProjectCommand(
          project,
          {
            type: "edit",
            variantId: project.variants[0].id,
            edits: [
              { kind: "dialColor", value: i % 2 ? "#ece6d8" : "#173d41" },
            ],
          },
          project.revision,
        ).project;
        await view.update(project.variants[0].design);
        edits.push(performance.now() - start);
      }
      const frames: number[] = [];
      let previous = performance.now();
      const start = previous;
      while (performance.now() - start < 5000) {
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        frames.push(now - previous);
        previous = now;
        const theta = (now - start) / 5000;
        view.setCamera({
          position: [Math.sin(theta) * 100, 35, Math.cos(theta) * 110],
          target: [0, 0, 0],
          zoom: 1,
        });
      }
      const exportStart = performance.now();
      await exportPNG(project.variants[0].design);
      const pngMs = performance.now() - exportStart;
      const before = view.status.resources;
      for (let i = 0; i < 25; i++) {
        const other = newProject().variants[0].design;
        other.handStyle = i % 2 ? "leaf" : "baton";
        await view.update(other);
        await exportPNG(other);
      }
      const gl = view.renderer.getContext(),
        debug = gl.getExtension("WEBGL_debug_renderer_info");
      const memory = (
        performance as Performance & { memory?: { usedJSHeapSize: number } }
      ).memory;
      return {
        userAgent: navigator.userAgent,
        dpr: devicePixelRatio,
        viewport: [884, 700],
        gpu: debug
          ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
          : "unavailable",
        editP95Ms: percentile(edits, 0.95),
        orbitMedianMs: percentile(frames, 0.5),
        orbitP95Ms: percentile(frames, 0.95),
        orbitFrames: frames.length,
        pngMs,
        before,
        after: view.status.resources,
        heapBytes: memory?.usedJSHeapSize ?? null,
      };
    } finally {
      view.dispose();
      canvas.remove();
    }
  });
  await writeFile(
    info.outputPath("performance.json"),
    JSON.stringify(metrics, null, 2),
  );
  await info.attach("performance.json", {
    path: info.outputPath("performance.json"),
    contentType: "application/json",
  });
  expect(metrics.editP95Ms).toBeLessThanOrEqual(100);
  expect(metrics.orbitMedianMs).toBeLessThanOrEqual(20);
  expect(metrics.orbitP95Ms).toBeLessThanOrEqual(34);
  expect(metrics.pngMs).toBeLessThanOrEqual(3000);
  expect(metrics.after.geometries).toBeLessThanOrEqual(
    metrics.before.geometries + 2,
  );
  expect(metrics.after.textures).toBeLessThanOrEqual(
    metrics.before.textures + 2,
  );
});
