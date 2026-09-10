import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  run,
  requireProcess,
  fingerprint,
  requireSnapshot,
  validateUnit,
  validateBrowser,
  validateInventory,
} from "../scripts/gates";

const title = "[M1-20] disposable checker control";
const healthy = () => ({
  success: true,
  numTotalTests: 1,
  numPassedTests: 1,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  numFailedTestSuites: 0,
  numPendingTestSuites: 0,
  testResults: [
    {
      status: "passed",
      message: "",
      assertionResults: [{ title, status: "passed", failureMessages: [] }],
    },
  ],
});
describe("required gate integrity", () => {
  it("[M1-20] real child process failures, timeout and missing executable fail with a passing control", async () => {
    const options = { cwd: process.cwd(), timeoutMs: 2000 };
    const pass = await run(
      process.execPath,
      ["-e", "process.exit(0)"],
      options,
    );
    expect(() => requireProcess(pass)).not.toThrow();
    for (const result of [
      await run(process.execPath, ["-e", "process.exit(7)"], options),
      await run(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
        ...options,
        timeoutMs: 100,
      }),
      await run("watch-atelier-does-not-exist", [], options),
    ])
      expect(() => requireProcess(result)).toThrow();
  });
  it("[M1-20] zero, missing individual test, skipped, failing, errored and malformed reports cannot pass", () => {
    expect(validateUnit(healthy(), [title])).toBe(1);
    expect(() =>
      validateUnit(healthy(), [title, "missing individual test"]),
    ).toThrow(/Missing/);
    expect(() => validateUnit({}, [title])).toThrow();
    const empty = healthy();
    empty.testResults[0].assertionResults = [];
    empty.numTotalTests = empty.numPassedTests = 0;
    expect(() => validateUnit(empty, [title])).toThrow(/empty/);
    for (const status of ["pending", "skipped", "failed"]) {
      const broken = healthy();
      broken.testResults[0].assertionResults[0].status = status;
      expect(() => validateUnit(broken, [title])).toThrow();
    }
    const errored = healthy();
    errored.testResults[0].message = "Runner crashed";
    expect(() => validateUnit(errored, [title])).toThrow();
    expect(() => JSON.parse("{")).toThrow();
    expect(
      validateInventory(["M1-20"], { "M1-20": { unit: [title], browser: [] } })
        .unit,
    ).toEqual([title]);
    expect(() =>
      validateInventory(["M1-20", "M1-21"], {
        "M1-20": { unit: [title], browser: [] },
      }),
    ).toThrow();
  });
  it("[M1-20] browser report errors, skipped tests and retries fail even with optimistic aggregate counts", () => {
    const report = {
      errors: [],
      stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 },
      suites: [
        {
          specs: [
            {
              title,
              ok: true,
              tests: [
                {
                  expectedStatus: "passed",
                  status: "expected",
                  results: [{ status: "passed", errors: [] }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(validateBrowser(report, [title])).toBe(1);
    expect(() =>
      validateBrowser({ ...report, errors: ["Runner error"] }, [title]),
    ).toThrow();
    expect(() => validateBrowser({ ...report, suites: [] }, [title])).toThrow();
    report.suites[0].specs[0].tests[0].results[0].status = "skipped";
    expect(() => validateBrowser(report, [title])).toThrow();
    report.suites[0].specs[0].tests[0].results.push({
      status: "passed",
      errors: [],
    });
    expect(() => validateBrowser(report, [title])).toThrow();
  });
  it("[M1-21] actual ESLint rejects domain adapter imports, reexports and dynamic imports; allows domain utilities", async () => {
    const eslint = new ESLint();
    const lint = async (code: string) =>
      (
        await eslint.lintText(code, {
          filePath: "src/domain/disposable-boundary-fixture.ts",
        })
      )[0];
    expect(
      (await lint("export { newProject } from './model';")).errorCount,
    ).toBe(0);
    for (const code of [
      "import '../render/watch';",
      "export * from '../storage/database';",
      "export * from './../main';",
      "import('../studio/App');",
    ])
      expect(
        (await lint(code)).messages.some((m) =>
          ["no-restricted-imports", "no-restricted-syntax"].includes(
            m.ruleId ?? "",
          ),
        ),
      ).toBe(true);
  });
  it("[M1-22] actual file fingerprints reject stale evidence after source changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "watch-atelier-gate-"));
    await writeFile(join(root, "fixture.ts"), "export const revision=1;");
    const before = await fingerprint(root, ["fixture.ts"]);
    expect(() => requireSnapshot(before.digest, before.digest)).not.toThrow();
    await writeFile(join(root, "fixture.ts"), "export const revision=2;");
    const after = await fingerprint(root, ["fixture.ts"]);
    expect(() => requireSnapshot(before.digest, after.digest)).toThrow(/stale/);
    expect(before.files[0].sha256).not.toBe(after.files[0].sha256);
  });
});
