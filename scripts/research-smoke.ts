import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { newProject } from "../src/domain/model.ts";
import {
  capture,
  initialRequirements,
  publicDiscovery,
  digest,
} from "../src/build/snapshot.ts";
import { blankPacket } from "../src/build/jobs.ts";
import {
  research,
  PROMPT,
  MODEL,
  cliArguments,
} from "../src/research-server/provider.ts";
import {
  validatePacket,
  options,
  estimate,
  liveSmokePass,
} from "../src/build/evaluate.ts";
import { fingerprint, run } from "./gates.ts";

const directory = join(
  process.cwd(),
  "artifacts/runs",
  "bi-live-" + new Date().toISOString().replace(/[:.]/g, "-"),
);
await mkdir(directory, { recursive: true });
const source = await fingerprint(process.cwd());
const project = newProject(),
  snapshot = await capture(project, project.variants[0].id),
  requirements = initialRequirements(snapshot);
const p = blankPacket(snapshot, requirements),
  input = publicDiscovery(requirements);
const request = {
  id: p.run.id,
  inputHash: await digest({ snapshot, requirements, publicInput: input }),
  publicInput: input,
  consentPublicDiscovery: true as const,
};
const result = await research(request, new AbortController().signal);
const packet = validatePacket({ ...p, ...result });
const plan = options(packet).find((o) => o.status === "provisional");
if (plan)
  packet.selected = { movementId: plan.movement.id, caseId: plan.casing.id };
await writeFile(
  join(directory, "packet.json"),
  JSON.stringify(packet, null, 2),
);
const outcome = {
  publicSyntheticOnly: true,
  source,
  head: (
    await run("git", ["rev-parse", "HEAD"], { cwd: process.cwd() })
  ).stdout.trim(),
  command: "pnpm research:smoke",
  model: MODEL,
  prompt: PROMPT,
  cliArguments: cliArguments("<isolated-scratch>", "<output-schema>"),
  input: request,
  sources: result.sources.map((s) => ({
    url: s.url,
    hash: s.hash,
    access: s.access,
    checked: s.retrievedAt,
    limitation: s.limitation,
  })),
  run: result.run,
  candidates: result.candidates.length,
  pairings: options(packet).length,
  estimate: estimate(packet),
  passed: liveSmokePass(packet),
};
await writeFile(
  join(directory, "summary.json"),
  JSON.stringify(outcome, null, 2),
);
console.log(
  JSON.stringify(
    {
      directory,
      passed: outcome.passed,
      run: result.run,
      sources: outcome.sources,
      candidates: outcome.candidates,
    },
    null,
    2,
  ),
);
process.exitCode = outcome.passed ? 0 : 1;
