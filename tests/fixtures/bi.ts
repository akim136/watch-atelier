import { newProject } from "../../src/domain/model.ts";
import { capture, initialRequirements } from "../../src/build/snapshot.ts";
import {
  type Packet,
  type Source,
  type Candidate,
  type Offer,
  type Observation,
} from "../../src/build/model.ts";

/** SYNTHETIC calibration records, never current supplier evidence. */
export async function researchFixture(): Promise<Packet> {
  const project = newProject(),
    snapshot = await capture(project, project.variants[0].id);
  const date = new Date().toISOString();
  const sources: Source[] = ["movement", "case"].map((id) => ({
    id: "source-" + id,
    url: "https://www.namokimods.com/products/synthetic-" + id,
    publisher: "SYNTHETIC fixture seller",
    title: "SYNTHETIC exact " + id,
    retrievedAt: date,
    publishedAt: null,
    access: "retrieved",
    origin: "fixture",
    selected: false,
    hash: "a".repeat(64),
    observations: [],
    conflicts: [],
    limitation: "Synthetic test—not a listing.",
    retention: "bounded facts and locators; no page or image redistribution",
  }));
  const candidates: Candidate[] = ["movement", "case"].map((role) => ({
    id: role,
    role: role as Candidate["role"],
    name: "SYNTHETIC " + role,
    variant: role + "-exact",
    exactVariant: true,
    sourceId: "source-" + role,
    claimIds: [],
    aesthetic: "Synthetic field-watch control",
    questions: [],
    realization: "proposed-source-not-rendered",
  }));
  const offers: Offer[] = candidates.map((c, i) => ({
    id: "offer-" + c.id,
    candidateId: c.id,
    sourceId: c.sourceId,
    variant: c.variant,
    seller: "SYNTHETIC fixture seller",
    currency: "USD",
    tiers: [{ minPacks: 1, priceMinorPerPack: i ? 10000 : 3000 }],
    packQuantity: 1,
    moqPacks: 1,
    multiplePacks: 1,
    maxPacks: null,
    minimumSpendMinor: null,
    observedAt: date,
    stock: "reported-available",
    quantityConfirmed: false,
    exactVariant: true,
    included: i ? ["crystal", "crown", "caseback", "gasket"] : ["stem"],
    includedAssembly: "unassembled",
    evidenceIds: [],
    limitation: "SYNTHETIC—not current.",
  }));
  const p: Packet = {
    format: "watch-atelier-research",
    version: 1,
    id: crypto.randomUUID(),
    createdAt: date,
    snapshot,
    requirements: initialRequirements(snapshot),
    sources,
    candidates,
    offers,
    claims: [],
    selected: { movementId: "movement", caseId: "case" },
    owned: [],
    visualSuggestions: [],
    shared: false,
    guides: [
      {
        id: "guide",
        sourceId: "source-movement",
        title: "SYNTHETIC NH35 planning",
        family: "NH35",
        variant: null,
        access: "article",
        locator: "section:planning",
        timestampSeconds: null,
        topics: ["planning", "inspection"],
      },
    ],
    run: {
      id: crypto.randomUUID(),
      inputHash: snapshot.hash,
      provider: "fixture",
      model: "none",
      cliVersion: "none",
      promptVersion: "bi-1.0",
      schemaVersion: "bi-1.0",
      startedAt: date,
      endedAt: date,
      queries: [],
      usage: { input: 0, cachedInput: 0, output: 0 },
      failures: [],
      state: "complete",
      capabilities: [],
    },
  };
  for (const c of candidates) {
    addFact(p, c.id, "family", "NH35", "text", null, "");
    const o = offers.find((o) => o.candidateId === c.id)!;
    for (const t of o.tiers)
      addFact(
        p,
        c.id,
        "price",
        t.priceMinorPerPack,
        "minor",
        null,
        "USD:minPacks=" + t.minPacks,
      );
    addFact(
      p,
      c.id,
      "quantity",
      '{"packQuantity":1,"moqPacks":1,"multiplePacks":1,"maxPacks":null,"minimumSpendMinor":null}',
      "text",
      null,
      "",
    );
    addFact(p, c.id, "included", o.included.join(","), "text", null, "");
    addFact(p, c.id, "stock", "reported-available", "text", null, "");
    o.evidenceIds = sources
      .find((s) => s.id === c.sourceId)!
      .observations.map((o) => o.id);
  }
  addFact(p, "case", "diameter", 38, "mm", null, "outside diameter");
  addFact(p, "case", "height", 11, "mm", null, "with caseback");
  addFact(p, "case", "lugWidth", 20, "mm", null, "lug opening");
  return p;
}
export function addFact(
  p: Packet,
  candidateId: string,
  property: Observation["property"],
  value: Observation["value"],
  unit: Observation["unit"],
  tolerance: number | null,
  datum: string,
) {
  const c = p.candidates.find((c) => c.id === candidateId)!,
    s = p.sources.find((s) => s.id === c.sourceId)!;
  const id = c.id + "-" + property + "-" + s.observations.length;
  s.observations.push({
    id,
    subject: c.id,
    variant: c.variant,
    property,
    value,
    unit,
    tolerance,
    datum,
    locator: "synthetic.table." + property,
    excerpt: "",
    basis: "seller-reported",
  });
  p.claims.push({
    id: "claim-" + id,
    sourceId: s.id,
    observationId: id,
    subject: c.id,
    variant: c.variant,
    property,
    value,
    unit,
    status: "reported",
  });
  c.claimIds.push("claim-" + id);
}
