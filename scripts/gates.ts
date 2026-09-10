import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface ProcessResult {
  command: string[];
  code: number | null;
  signal: string | null;
  timedOut: boolean;
  outputOverflow: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}
export function run(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<ProcessResult> {
  const start = performance.now();
  return new Promise((resolveResult) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "",
      timedOut = false,
      outputOverflow = false;
    const stop = () => {
      try {
        if (process.platform !== "win32" && child.pid)
          process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        /* The process may have already exited. */
      }
    };
    const collect = (chunk: Buffer, error: boolean) => {
      if (
        Buffer.byteLength(stdout) + Buffer.byteLength(stderr) + chunk.length >
        5 * 1024 ** 2
      ) {
        outputOverflow = true;
        stop();
        return;
      }
      if (error) stderr += chunk.toString();
      else stdout += chunk.toString();
    };
    child.stdout.on("data", (chunk) => collect(chunk, false));
    child.stderr.on("data", (chunk) => collect(chunk, true));
    child.on("error", (error) => {
      stderr += error.message;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, options.timeoutMs ?? 180_000);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolveResult({
        command: [command, ...args],
        code,
        signal,
        timedOut,
        outputOverflow,
        stdout,
        stderr,
        durationMs: performance.now() - start,
      });
    });
  });
}
export function requireProcess(result: ProcessResult) {
  if (
    result.code !== 0 ||
    result.signal ||
    result.timedOut ||
    result.outputOverflow
  )
    throw new Error(`Required command failed: ${result.command.join(" ")}`);
}
export async function fingerprint(root: string, files?: string[]) {
  if (!files) {
    const listed = await run(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: root },
    );
    requireProcess(listed);
    // Runtime, tests, build configuration, resources and gate inventories. Narrative progress
    // documents are deliberately outside this source digest and reviewed separately.
    files = [
      ...new Set(
        listed.stdout
          .split("\0")
          .filter((path) =>
            /^(src\/|public\/|tests\/|scripts\/|evals\/|package\.json$|pnpm-lock\.yaml$|index\.html$|.*config\.(ts|mjs)$|tsconfig\.json$)/.test(
              path,
            ),
          ),
      ),
    ].sort();
  }
  const hash = createHash("sha256"),
    entries: { path: string; sha256: string }[] = [];
  for (const file of [...files].sort()) {
    const bytes = await readFile(resolve(root, file)),
      digest = createHash("sha256").update(bytes).digest("hex");
    entries.push({ path: file, sha256: digest });
    hash.update(`${file.length}:${file}:${digest}\n`);
  }
  if (!entries.length)
    throw new Error("Cannot certify an empty source snapshot.");
  return { digest: hash.digest("hex"), files: entries };
}
export function requireSnapshot(before: string, after: string) {
  if (before !== after)
    throw new Error("Source changed during verification; evidence is stale.");
}
type TestResult = { title: string; status: string };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Malformed test report.");
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Malformed test report array.");
  return value;
}
function validateTests(tests: TestResult[], expected: string[]) {
  if (!tests.length || !expected.length)
    throw new Error("Required suite is empty.");
  if (new Set(tests.map((t) => t.title)).size !== tests.length)
    throw new Error("Duplicate reported tests.");
  if (tests.some((t) => t.status !== "passed"))
    throw new Error("Required tests failed or were skipped.");
  for (const title of expected)
    if (!tests.some((t) => t.title === title))
      throw new Error(`Missing required test: ${title}`);
  for (const test of tests)
    if (!expected.includes(test.title))
      throw new Error(`Unmapped test: ${test.title}`);
  return tests.length;
}
export function validateUnit(report: unknown, expected: string[]) {
  const r = object(report),
    tests: TestResult[] = [];
  if (
    r.success !== true ||
    r.numFailedTests !== 0 ||
    r.numPendingTests !== 0 ||
    r.numTodoTests !== 0 ||
    r.numFailedTestSuites !== 0 ||
    r.numPendingTestSuites !== 0
  )
    throw new Error("Unit runner reports failures or incomplete tests.");
  for (const rawSuite of array(r.testResults)) {
    const suite = object(rawSuite);
    if (suite.status !== "passed" || suite.message)
      throw new Error("Unit suite failed.");
    for (const raw of array(suite.assertionResults)) {
      const test = object(raw);
      if (
        array(test.failureMessages).length ||
        typeof test.title !== "string" ||
        typeof test.status !== "string"
      )
        throw new Error("Malformed or failing assertion.");
      tests.push({ title: test.title, status: test.status });
    }
  }
  const count = validateTests(tests, expected);
  if (r.numTotalTests !== count || r.numPassedTests !== count)
    throw new Error("Unit counts do not match assertions.");
  return count;
}
export function validateBrowser(report: unknown, expected: string[]) {
  const r = object(report),
    stats = object(r.stats),
    tests: TestResult[] = [];
  if (
    array(r.errors).length ||
    stats.unexpected !== 0 ||
    stats.flaky !== 0 ||
    stats.skipped !== 0
  )
    throw new Error(
      "Browser runner reports errors, retries, or skipped tests.",
    );
  const visit = (raw: unknown) => {
    const suite = object(raw);
    for (const child of array(suite.suites ?? [])) visit(child);
    for (const rawSpec of array(suite.specs ?? [])) {
      const spec = object(rawSpec);
      if (typeof spec.title !== "string" || spec.ok !== true)
        throw new Error("Browser specification did not pass.");
      const runs = array(spec.tests);
      if (runs.length !== 1)
        throw new Error("Expected one primary-browser test per specification.");
      const test = object(runs[0]),
        results = array(test.results);
      if (
        test.expectedStatus !== "passed" ||
        test.status !== "expected" ||
        results.length !== 1
      )
        throw new Error("Unexpected browser result or retry.");
      const result = object(results[0]);
      if (result.error || array(result.errors ?? []).length)
        throw new Error("Browser result contains errors.");
      tests.push({ title: spec.title, status: String(result.status) });
    }
  };
  array(r.suites).forEach(visit);
  const count = validateTests(tests, expected);
  if (stats.expected !== count)
    throw new Error("Browser counts do not match assertions.");
  return count;
}
export interface CaseMapping {
  unit: string[];
  browser: string[];
}
export function validateInventory(
  cases: string[],
  map: Record<string, CaseMapping>,
) {
  if (!cases.length || new Set(cases).size !== cases.length)
    throw new Error("Empty or duplicate case inventory.");
  if (Object.keys(map).length !== cases.length)
    throw new Error("Case inventory mismatch.");
  for (const id of cases) {
    const entry = map[id];
    if (
      !entry ||
      !Array.isArray(entry.unit) ||
      !Array.isArray(entry.browser) ||
      ![...entry.unit, ...entry.browser].length ||
      [...entry.unit, ...entry.browser].some(
        (title) => !title.includes(`[${id}]`),
      )
    )
      throw new Error(`Missing or invalid mapping for ${id}`);
  }
  return {
    unit: [...new Set(cases.flatMap((id) => map[id].unit))],
    browser: [...new Set(cases.flatMap((id) => map[id].browser))],
  };
}
