import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";

function reference(red = 130) {
  const png = new PNG({ width: 80, height: 60 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = red;
    png.data[i + 1] = 100;
    png.data[i + 2] = i % 200;
    png.data[i + 3] = 255;
  }
  return {
    name: "synthetic-reference.png",
    mimeType: "image/png",
    buffer: PNG.sync.write(png),
  };
}
async function commit(page: Page, label: string, value: string) {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press("Enter");
}
async function ready(page: Page) {
  await expect(page.locator(".canvas-wrap canvas").first()).toHaveAttribute(
    "data-ready",
    "true",
  );
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Save status")).toHaveText("Saved locally");
}
async function downloaded(page: Page, name: string) {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  const download = await event;
  return { bytes: await readFile((await download.path())!), download };
}

test("[M1-01][M1-02][M1-03][M1-04][M1-05][M1-06][M1-07][M1-11][M1-12][M1-18] complete private inspiration to portable editable studio", async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5173/") &&
      !r.url().startsWith("data:") &&
      !r.url().startsWith("blob:")
    )
      external.push(r.url());
  });
  await page.goto("/");
  await ready(page);
  await page
    .getByLabel("Design brief")
    .fill("PRIVATE_BRIEF_314 quiet tool watch");
  await page.getByLabel("Add local reference").setInputFiles(reference());
  await expect(page.locator(".reference-card")).toHaveCount(1);
  await commit(
    page,
    "Attribution",
    "https://private.invalid/<script>alert(1)</script>",
  );
  await commit(
    page,
    "I like…",
    "PRIVATE_NOTE_314: <img src=https://private.invalid/x>",
  );
  await commit(page, "Avoid…", "Keep this shape, avoid this finish.");
  await page.getByLabel("Add local reference").setInputFiles(reference(40));
  await expect(page.locator(".reference-card")).toHaveCount(2);
  await page
    .locator(".reference-card")
    .last()
    .getByLabel("I like…")
    .fill("Second private direction");
  await page
    .locator(".reference-card")
    .last()
    .getByLabel("I like…")
    .press("Enter");
  await commit(page, "Dial text", "MERIDIAN & CO.");
  await commit(page, "Marker length mm", "2.4");
  await page.getByLabel("Dial color #d2b48c", { exact: true }).click();
  await ready(page);
  await expect(page.getByLabel("Dial hex")).toHaveValue("#d2b48c");
  await page.getByLabel("Lock dialColor", { exact: true }).click();
  await page.getByLabel("Dial color #173d41", { exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("dialColor is locked");
  await expect(page.getByLabel("Dial hex")).toHaveValue("#d2b48c");
  await page.getByLabel("Unlock dialColor", { exact: true }).click();
  await page.getByLabel("Dial color #173d41", { exact: true }).click();
  await page.getByLabel("Undo", { exact: true }).click();
  await expect(page.getByLabel("Dial hex")).toHaveValue("#d2b48c");
  await page.getByLabel("Redo", { exact: true }).click();
  await expect(page.getByLabel("Dial hex")).toHaveValue("#173d41");
  await page.getByLabel("Duplicate study", { exact: true }).click();
  await commit(page, "Study name", "Warm variation");
  await page.getByLabel("Dial color #ece6d8", { exact: true }).click();
  await page.getByRole("button", { name: "Compare studies" }).click();
  await expect(page.locator(".canvas-wrap canvas")).toHaveCount(2);
  await ready(page);
  const box = (await page
    .locator(".canvas-wrap canvas")
    .first()
    .boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 90,
    box.y + box.height / 2 + 35,
    { steps: 12 },
  );
  await page.mouse.up();
  await page.getByRole("button", { name: "Front", exact: true }).click();
  await page.screenshot({ path: info.outputPath("comparison.png") });
  await save(page);
  await page.reload();
  await ready(page);
  await expect(page.getByLabel("Design brief")).toHaveValue(
    "PRIVATE_BRIEF_314 quiet tool watch",
  );
  await expect(page.locator(".reference-card")).toHaveCount(2);
  await expect(
    page.locator(".reference-card").first().getByLabel("I like…"),
  ).toHaveValue("PRIVATE_NOTE_314: <img src=https://private.invalid/x>");
  await expect(page.getByLabel("Dial hex")).toHaveValue("#173d41");
  await page.locator(".study").filter({ hasText: "Warm variation" }).click();
  await expect(page.getByLabel("Dial hex")).toHaveValue("#ece6d8");
  await page.getByRole("button", { name: "Front", exact: true }).click();
  await ready(page);
  await page.getByRole("button", { name: "Export", exact: false }).click();
  const preview = await downloaded(page, "Download preview");
  await preview.download.saveAs(info.outputPath("edited-preview.png"));
  const png = PNG.sync.read(preview.bytes);
  expect([png.width, png.height]).toEqual([1600, 1200]);
  expect(new Set(png.data).size).toBeGreaterThan(100);
  const share = JSON.parse(
    (await downloaded(page, "Download shared design")).bytes.toString(),
  );
  expect(JSON.stringify(share)).not.toContain("PRIVATE_");
  expect(JSON.stringify(share)).not.toContain("private.invalid");
  expect(share.project.references).toEqual([]);
  expect(share.project.assets).toEqual([]);
  expect(share.assets).toEqual([]);
  expect(share.project.variants[0].design.dialColor).toBe("#173d41");
  expect(share.project.variants[1].design.dialColor).toBe("#ece6d8");
  expect(share.project.variants[1].design.objects[0].text).toBe(
    "MERIDIAN & CO.",
  );
  expect(share.project.variants[1].design.objects[2].length).toBe(2.4);
  await expect(
    page.getByRole("button", { name: "Download personal backup" }),
  ).toBeDisabled();
  await page.getByLabel("Include my private references and notes").check();
  const backup = await downloaded(page, "Download personal backup");
  expect(JSON.parse(backup.bytes.toString()).assets).toHaveLength(2);
  const clean = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const imported = await clean.newPage();
  try {
    await imported.goto("/");
    await ready(imported);
    await imported.locator(".project-title").click();
    await imported
      .getByLabel("Import editable project")
      .setInputFiles({
        name: "backup.json",
        mimeType: "application/json",
        buffer: backup.bytes,
      });
    await expect(imported.locator(".reference-card")).toHaveCount(2);
    await ready(imported);
    await commit(imported, "Dial text", "<SAFE & EDITABLE>");
    await commit(imported, "Marker length mm", "3");
    await save(imported);
    await imported.reload();
    await ready(imported);
    await expect(imported.getByLabel("Dial text", { exact: true })).toHaveValue(
      "<SAFE & EDITABLE>",
    );
    await expect(
      imported.getByLabel("Marker length mm", { exact: true }),
    ).toHaveValue("3");
    await imported.screenshot({ path: info.outputPath("reimported.png") });
  } finally {
    await clean.close();
  }
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("[M1-08][M1-09] invalid imports and mislabeled images preserve an editable project", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await commit(page, "Dial text", "UNSAVED CONTROL");
  const revision = await page
    .getByTestId("studio")
    .getAttribute("data-revision");
  await page
    .getByLabel("Add local reference")
    .setInputFiles({
      name: "fake.png",
      mimeType: "image/png",
      buffer: Buffer.from('<svg onload="alert(1)"/>'),
    });
  await expect(page.getByRole("alert")).toContainText(
    "malformed or unsupported",
  );
  await expect(page.locator(".reference-card")).toHaveCount(0);
  for (const text of ["{", '{"version":99}', "[".repeat(17) + "]".repeat(17)]) {
    await page.locator(".project-title").click();
    await page
      .getByLabel("Import editable project")
      .setInputFiles({
        name: "bad.json",
        mimeType: "application/json",
        buffer: Buffer.from(text),
      });
    await expect(page.getByRole("alert")).toContainText(
      /JSON|Unsupported|nesting/,
    );
    await expect(page.getByTestId("studio")).toHaveAttribute(
      "data-revision",
      revision!,
    );
    await expect(page.getByLabel("Dial text", { exact: true })).toHaveValue(
      "UNSAVED CONTROL",
    );
  }
  await page.getByLabel("Add local reference").setInputFiles(reference());
  await expect(page.locator(".reference-card")).toHaveCount(1);
});

test("[M1-15] two real tabs reject a stale save and preserve copy/reload choices", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await ready(page);
  await save(page);
  const other = await context.newPage();
  await other.goto("/");
  await ready(other);
  await commit(page, "Dial text", "LATEST A");
  await save(page);
  await commit(other, "Dial text", "MY UNSAVED B");
  await other.getByRole("button", { name: "Save", exact: true }).click();
  await expect(other.getByLabel("Save status")).toHaveText("Save conflict");
  await other.getByRole("button", { name: "Save a copy", exact: true }).click();
  await expect(other.getByLabel("Save status")).toHaveText("Saved locally");
  await expect(other.getByLabel("Dial text", { exact: true })).toHaveValue(
    "MY UNSAVED B",
  );
  await page.getByRole("button", { name: "Export", exact: false }).click();
  const latest = JSON.parse(
    (await downloaded(page, "Download shared design")).bytes.toString(),
  );
  expect(latest.project.variants[0].design.objects[0].text).toBe("LATEST A");
  await other.close();
});

test("[M1-13] native IndexedDB abort is visible and prior state and backup remain recoverable", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await commit(page, "Dial text", "PRIOR SAVED");
  await save(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const r = original.apply(this, args);
      if (this.name === "assets")
        r.addEventListener("success", () => this.transaction.abort());
      return r;
    };
  });
  await page.getByLabel("Add local reference").setInputFiles(reference());
  await expect(page.locator(".reference-card")).toHaveCount(1);
  await commit(page, "Dial text", "RECOVER CURRENT");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Save status")).toHaveText("Save failed");
  await page.getByRole("button", { name: "Export", exact: false }).click();
  await page.getByLabel("Include my private references and notes").check();
  const backup = JSON.parse(
    (await downloaded(page, "Download personal backup")).bytes.toString(),
  );
  expect(backup.project.variants[0].design.objects[0].text).toBe(
    "RECOVER CURRENT",
  );
  expect(backup.assets).toHaveLength(1);
  await page.reload();
  await ready(page);
  await expect(page.getByLabel("Dial text", { exact: true })).toHaveValue(
    "PRIOR SAVED",
  );
  await expect(page.locator(".reference-card")).toHaveCount(0);
  await commit(page, "Dial text", "SUBSEQUENT SUCCESS");
  await save(page);
});

test("[M1-14] wrong font hash labels fallback and blocks PNG without blocking semantic JSON", async ({
  page,
}) => {
  await page.route("**/fonts/*Medium.woff2", (route) =>
    route.fulfill({
      status: 200,
      contentType: "font/woff2",
      body: "not the intended font",
    }),
  );
  await page.goto("/");
  await expect(page.locator(".viewport-warning")).toContainText(
    "intended dial font is unavailable",
  );
  await page.getByRole("button", { name: "Export", exact: false }).click();
  await page.getByRole("button", { name: "Download preview" }).click();
  await expect(page.getByRole("alert")).toContainText("PNG export is blocked");
  expect(
    JSON.parse(
      (await downloaded(page, "Download shared design")).bytes.toString(),
    ).project.schemaVersion,
  ).toBe(1);
  await page.unroute("**/fonts/*Medium.woff2");
  await page.reload();
  await ready(page);
});
