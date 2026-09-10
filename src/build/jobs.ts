import { z } from "zod";
import {
  requirementsSchema,
  snapshotSchema,
  styleSchema,
  BI_VERSION,
  type Packet,
  type Snapshot,
  type Requirements,
} from "./model.ts";
import { digest, publicDiscovery } from "./snapshot.ts";
import { validatePacket } from "./evaluate.ts";

export const publicInputSchema = z.strictObject({
  family: requirementsSchema.shape.family,
  functions: requirementsSchema.shape.functions,
  targetsMm: z.strictObject({
    diameter: z.number().positive().max(100),
    thickness: z.number().positive().max(100),
    lugWidth: z.number().positive().max(100),
  }),
  dimensionOrigin: z.literal(
    "user-confirmed-targets-not-hardware-measurements",
  ),
  quantity: requirementsSchema.shape.quantity,
  styles: z.array(styleSchema).max(7),
  urls: requirementsSchema.shape.selectedUrls,
});
export const jobRequestSchema = z.strictObject({
  id: z.string().uuid(),
  inputHash: snapshotSchema.shape.hash,
  publicInput: publicInputSchema,
  consentPublicDiscovery: z.literal(true),
});
export type JobRequest = z.infer<typeof jobRequestSchema>;
export type ResearchData = Pick<
  Packet,
  "sources" | "claims" | "candidates" | "offers" | "guides" | "run"
>;
export type ResearchProvider = (
  request: JobRequest,
  signal: AbortSignal,
) => Promise<ResearchData>;
export function blankPacket(
  snapshot: Snapshot,
  requirements: Requirements,
): Packet {
  const time = new Date().toISOString();
  return {
    format: "watch-atelier-research",
    version: 1,
    id: crypto.randomUUID(),
    createdAt: time,
    snapshot: structuredClone(snapshot),
    requirements: structuredClone(requirements),
    sources: [],
    claims: [],
    candidates: [],
    offers: [],
    guides: [],
    selected: null,
    owned: [],
    visualSuggestions: [],
    shared: false,
    run: {
      id: crypto.randomUUID(),
      inputHash: snapshot.hash,
      provider: "manual",
      model: "none",
      cliVersion: "none",
      promptVersion: BI_VERSION,
      schemaVersion: BI_VERSION,
      startedAt: time,
      endedAt: time,
      queries: [],
      usage: { input: 0, cachedInput: 0, output: 0 },
      failures: [],
      state: "partial",
      capabilities: [],
    },
  };
}
export class ResearchJobs {
  private generation = 0;
  private active?: AbortController;
  /** A cancelled/cleared/late request can never publish into the caller's state. */
  async start(
    snapshot: Snapshot,
    requirements: Requirements,
    consent: boolean,
    provider: ResearchProvider,
  ): Promise<Packet | null> {
    if (!consent)
      throw new Error(
        "Confirm the public discovery payload before starting research.",
      );
    this.cancel();
    const generation = this.generation,
      controller = new AbortController();
    this.active = controller;
    const p = blankPacket(snapshot, requirements),
      input = publicDiscovery(requirements);
    const inputHash = await digest({
      snapshot,
      requirements,
      publicInput: input,
    });
    if (generation !== this.generation) return null;
    const request = jobRequestSchema.parse({
      id: p.run.id,
      inputHash,
      publicInput: input,
      consentPublicDiscovery: true,
    });
    try {
      const result = await provider(request, controller.signal);
      if (generation !== this.generation || controller.signal.aborted)
        return null;
      if (
        result.run.id !== request.id ||
        result.run.inputHash !== request.inputHash
      )
        throw new Error("Research response belongs to another input.");
      return validatePacket({
        ...p,
        sources: result.sources,
        claims: result.claims,
        candidates: result.candidates,
        offers: result.offers,
        guides: result.guides,
        run: result.run,
      });
    } catch (error) {
      if (generation !== this.generation || controller.signal.aborted)
        return null;
      throw error;
    } finally {
      if (generation === this.generation) this.active = undefined;
    }
  }
  cancel() {
    this.generation++;
    this.active?.abort();
    this.active = undefined;
  }
}

let token: string | undefined;
export async function providerStatus() {
  const response = await fetch("/__bi/session", {
    headers: { "X-Watch-Atelier": "research" },
    cache: "no-store",
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    throw new Error(
      "Local research provider unavailable. Run pnpm dev:research; manual and saved packets still work.",
    );
  const data = z
    .strictObject({
      token: z.string().length(64),
      enabled: z.boolean(),
      model: z.string(),
      cliVersion: z.string(),
    })
    .parse(await response.json());
  token = data.token;
  return data;
}
export async function localResearch(
  request: JobRequest,
  signal: AbortSignal,
): Promise<ResearchData> {
  if (!token) await providerStatus();
  const response = await fetch("/__bi/research", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify(jobRequestSchema.parse(request)),
    signal,
  });
  if (!response.ok) {
    // Server errors are controlled codes, never raw provider payloads.
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.message === "string"
        ? body.message
        : "Research failed. Saved/manual research remains available.",
    );
  }
  return (await response.json()) as ResearchData; // Complete schema/identity validation occurs before publication.
}
