import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { researchFixture } from "../fixtures/bi";

test("[BI-01][BI-05][BI-09][BI-10][BI-11] studio research fixture journey selects costs and saves/reopens/exports without leaking private inputs", async ({
  page,
}, info) => {
  const fixture = await researchFixture(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/__bi/session", (r) =>
    r.fulfill({
      json: {
        token: "a".repeat(64),
        enabled: true,
        model: "VISIBLE FIXTURE",
        cliVersion: "fixture",
      },
    }),
  );
  await page.route("**/__bi/research", async (r) => {
    const request = r.request().postDataJSON();
    expect(JSON.stringify(request)).not.toContain("PRIVATE_SENTINEL");
    await r.fulfill({
      json: {
        sources: fixture.sources,
        claims: fixture.claims,
        candidates: fixture.candidates,
        offers: fixture.offers,
        guides: fixture.guides,
        run: { ...fixture.run, id: request.id, inputHash: request.inputHash },
      },
    });
  });
  await page.goto("/");
  await expect(page.locator(".canvas-wrap canvas").first()).toHaveAttribute(
    "data-ready",
    "true",
  );
  await page.getByLabel("Design brief").fill("PRIVATE_SENTINEL");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Save status")).toHaveText("Saved locally");
  await page
    .getByRole("button", { name: "Research this build", exact: true })
    .click();
  const workspace = page.getByRole("complementary", {
    name: "Build Intelligence",
  });
  await expect(workspace.getByLabel("Diameter target mm")).toHaveValue("39");
  await workspace.getByLabel("Like traits (private)").fill("PRIVATE_SENTINEL");
  await workspace.getByLabel("I reviewed this public payload").check();
  await workspace.getByRole("button", { name: "Start live research" }).click();
  await expect(
    workspace.getByText("SYNTHETIC FIXTURE — not current research.", {
      exact: true,
    }),
  ).toBeVisible();
  await workspace
    .getByRole("button", { name: "Select provisional plan" })
    .click();
  await expect(
    workspace.getByText("USD merchandise cash: USD 130.00", { exact: true }),
  ).toBeVisible();
  await expect(
    workspace.getByText("Destination taxes and import charges", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("research-costed-fixture.png"),
  });
  await workspace
    .getByRole("button", { name: "Save research packet", exact: true })
    .click();
  await expect(
    workspace.getByText("Research packet saved locally.", { exact: true }),
  ).toBeVisible();
  const downloading = page.waitForEvent("download");
  await workspace
    .getByRole("button", { name: "Export research packet", exact: true })
    .click();
  const downloaded = await downloading,
    bytes = await readFile((await downloaded.path())!);
  expect(bytes.toString()).not.toContain("PRIVATE_SENTINEL");
  expect(JSON.parse(bytes.toString()).format).toBe("watch-atelier-research");
  await workspace.getByLabel("Close research").click();
  await page.getByLabel("Dial hex").fill("#704037");
  await page.getByLabel("Dial hex").press("Enter");
  await expect(page.locator(".canvas-wrap canvas").first()).toHaveAttribute(
    "data-ready",
    "true",
  );
  await page
    .getByRole("button", { name: "Research this build", exact: true })
    .click();
  await workspace.getByRole("button", { name: /Open research/ }).click();
  await expect(workspace.getByText(/STALE RESEARCH/)).toBeVisible();
  await workspace.getByLabel("Import research packet").setInputFiles({
    name: "research.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await expect(
    workspace.getByText(
      "Imported evidence unverified; fit and current prices downgraded.",
      { exact: true },
    ),
  ).toBeVisible();
  await workspace.getByLabel("Close research").click();
  await expect(page.getByLabel("Dial hex")).toHaveValue("#704037");
  expect(errors).toEqual([]);
});

test("[BI-08][BI-11] provider failure and manual evidence keep studio usable and malformed imports preserve research", async ({
  page,
}, info) => {
  await page.route("**/__bi/session", (r) =>
    r.fulfill({
      json: {
        token: "b".repeat(64),
        enabled: false,
        model: "none",
        cliVersion: "none",
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".canvas-wrap canvas").first()).toHaveAttribute(
    "data-ready",
    "true",
  );
  await page
    .getByRole("button", { name: "Research this build", exact: true })
    .click();
  const workspace = page.getByRole("complementary", {
    name: "Build Intelligence",
  });
  await expect(
    workspace.getByRole("button", { name: "Start live research" }),
  ).toBeDisabled();
  await workspace
    .getByText("Manual evidence · no provider needed", { exact: true })
    .click();
  await workspace.getByLabel("Manual part title").fill("My candidate case");
  await workspace
    .getByLabel("Manual source URL")
    .fill("https://www.namokimods.com/products/user-reference");
  await workspace.getByRole("button", { name: "Add manual source" }).click();
  await expect(
    workspace.getByRole("heading", { name: "My candidate case", exact: true }),
  ).toBeVisible();
  await workspace.getByLabel("Import research packet").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(
    workspace.getByRole("heading", { name: "My candidate case", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("research-manual.png") });
  await workspace.getByLabel("Close research").click();
  await page
    .getByRole("button", { name: "Research this build", exact: true })
    .click();
  await expect(
    workspace.getByRole("heading", { name: "My candidate case", exact: true }),
  ).toBeVisible();
  await workspace.getByLabel("Close research").click();
  await expect(page.getByLabel("Dial hex")).toBeVisible();
});
