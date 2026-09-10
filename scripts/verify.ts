import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import { createHash } from "node:crypto";
import os from "node:os";
import {
  fingerprint,
  run,
  requireProcess,
  requireSnapshot,
  validateInventory,
  validateUnit,
  validateBrowser,
  type CaseMapping,
  type ProcessResult,
} from "./gates.ts";

const root = process.cwd(),
  directory = resolve(
    root,
    "artifacts/runs",
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`,
  );
await mkdir(directory, { recursive: true });
const snapshot = await fingerprint(root);
const results: ProcessResult[] = [],
  issues: string[] = [];
let unitCount = 0,
  browserCount = 0;
console.log(`Evidence directory: ${relative(root, directory)}`);
try {
  const cases = (await readFile("evals/m1-cases.jsonl", "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line).case_id as string);
  const mapping = JSON.parse(
    await readFile("evals/m1-test-map.json", "utf8"),
  ) as Record<string, CaseMapping>;
  const biCases = JSON.parse(await readFile("evals/bi1-cases.json", "utf8"))
    .deterministic as string[];
  const biMapping = JSON.parse(
    await readFile("evals/bi1-test-map.json", "utf8"),
  ) as Record<string, CaseMapping>;
  const assetMapping = JSON.parse(await readFile("evals/assets-test-map.json", "utf8")) as Record<string, CaseMapping>;
  const expected = validateInventory([...cases, ...biCases, "ASSET-GEOMETRY", "ASSET-FONTS", "ASSET-PRESETS", "ASSET-COLORS", "ASSET-PARTS", "ASSET-MODELS", "ASSET-PROVENANCE"], {
    ...mapping,
    ...biMapping,
    ...assetMapping,
  });
  const commands = [
    ["test", "--reporter=json", `--outputFile=${join(directory, "unit.json")}`],
    ["lint"],
    ["typecheck"],
    ["check:boundaries"],
    ["build"],
    ["test:e2e"],
  ];
  for (const args of commands) {
    console.log(`Running: pnpm ${args.join(" ")}`);
    const result = await run("pnpm", args, {
      cwd: root,
      timeoutMs: 240_000,
      env: {
        ...process.env,
        WATCH_TEST_OUTPUT: join(directory, "browser"),
        WATCH_E2E_REPORT: join(directory, "browser.json"),
      },
    });
    results.push(result);
    await writeFile(
      join(directory, `${results.length}-${args[0]}.log`),
      result.stdout + result.stderr,
    );
    requireProcess(result);
  }
  unitCount = validateUnit(
    JSON.parse(await readFile(join(directory, "unit.json"), "utf8")),
    expected.unit,
  );
  browserCount = validateBrowser(
    JSON.parse(await readFile(join(directory, "browser.json"), "utf8")),
    expected.browser,
  );
  requireSnapshot(snapshot.digest, (await fingerprint(root)).digest);
} catch (error) {
  issues.push(error instanceof Error ? error.message : String(error));
}

const artifacts: { path: string; sha256: string }[] = [];
async function collect(dir: string) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collect(path);
    else
      artifacts.push({
        path: relative(directory, path),
        sha256: createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      });
  }
}
await collect(directory);
const head = await run("git", ["rev-parse", "HEAD"], { cwd: root });
const summary = {
  schemaVersion: 1,
  timestamp: new Date().toISOString(),
  milestone: "M1 + BI-1 deterministic candidate",
  buildIntelligenceLiveGate:
    "Separate required BI-12 receipt from pnpm research:smoke; fixture success is not live success.",
  buildIntelligenceScopeGate:
    "Pending: time-boxed candidate excludes private-image/preview analysis and is not full addendum acceptance.",
  base: "063093933ee0bad6cd5c9d1c5c3efe4e66f6c4ae",
  head: head.stdout.trim(),
  snapshot,
  environment: {
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    node: process.version,
    cpus: os.cpus()[0]?.model,
    memory: os.totalmem(),
  },
  machineGate: issues.length ? "failed" : "passed",
  issues,
  unitCount,
  browserCount,
  finalIndependentReview:
    "pending; see docs/reviews for separately bound coverage",
  productVisualAcceptance: "pending owner",
  visualAssetCandidate: "pending delivery/integration",
  commands: results.map(
    ({ stdout: _stdout, stderr: _stderr, ...result }) => result,
  ),
  artifacts,
};
await writeFile(
  join(directory, "summary.json"),
  JSON.stringify(summary, null, 2),
);
console.log(
  `Machine gate: ${summary.machineGate}. Unit tests: ${unitCount}; browser tests: ${browserCount}. Human acceptance is pending.`,
);
for (const issue of issues) console.error(issue);
process.exitCode = issues.length ? 1 : 0;
