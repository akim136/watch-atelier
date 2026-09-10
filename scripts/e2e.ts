import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { run } from "./gates.ts";

const output =
  process.env.WATCH_TEST_OUTPUT ??
  resolve(
    "artifacts/runs",
    `e2e-${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`,
    "browser",
  );
const directory = dirname(output);
await mkdir(directory, { recursive: true });
const result = await run(
  "pnpm",
  ["exec", "playwright", "test", ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    timeoutMs: 220_000,
    env: {
      ...process.env,
      WATCH_TEST_OUTPUT: output,
      WATCH_E2E_REPORT:
        process.env.WATCH_E2E_REPORT ?? join(directory, "browser.json"),
    },
  },
);
await writeFile(
  join(directory, "browser-command.json"),
  JSON.stringify(result, null, 2),
);
console.log(result.stdout);
console.error(result.stderr);
console.log(`Browser evidence: ${directory}`);
process.exitCode =
  result.code === 0 &&
  !result.timedOut &&
  !result.outputOverflow &&
  !result.signal
    ? 0
    : 1;
