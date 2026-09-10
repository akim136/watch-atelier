import { z } from "zod";

export const BI_VERSION = "bi-1.0" as const;
export const BI_LIMITS = {
  packets: 25,
  packetBytes: 2 * 1024 ** 2,
  sources: 8,
  imageBytes: 8 * 1024 ** 2,
} as const;
const text = z.string().max(500);
const key = z.string().min(1).max(120);
const count = z.number().int().min(1).max(100_000);
const minor = z.number().int().nonnegative().max(1_000_000_000);
const time = z.string().datetime();
export const publicUrl = z
  .string()
  .max(1000)
  .url()
  .refine((value) => {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443")
    );
  }, "Only public HTTPS URLs without credentials are supported.");
export const styleSchema = z.enum([
  "minimal",
  "dress",
  "field",
  "warm",
  "cool",
  "polished",
  "brushed",
]);
const targetSchema = z.strictObject({
  value: z.number().finite().positive().max(100),
  origin: z.enum([
    "concept-target",
    "user-assertion",
    "manufacturer-reported",
    "measured",
  ]),
  evidence: text,
  hard: z.boolean(),
});
export const requirementsSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  family: z.enum(["NH35", "unsupported"]),
  functions: z.enum(["three-hand", "date-at-3", "other"]),
  diameter: targetSchema,
  thickness: targetSchema,
  lugWidth: targetSchema,
  dialLayout: text,
  finish: text,
  styles: z.array(styleSchema).max(7),
  like: text,
  avoid: text,
  quantity: count,
  currency: z.enum(["USD", "SGD", "EUR", "GBP"]),
  destination: z.string().max(80),
  budgetMinor: minor.nullable(),
  custom: z.enum(["stock-preferred", "custom-acceptable", "custom-only"]),
  selectedUrls: z.array(publicUrl).max(3),
});
export const snapshotSchema = z.strictObject({
  projectId: z.string().uuid(),
  variantId: z.string().uuid(),
  designId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  units: z.literal("mm"),
  template: z.literal("atelier-39-v1"),
  renderContract: z.literal("watch-render-v1"),
  assetVersion: z.literal("atelier-39-v1"),
  dimensions: z.strictObject({
    diameter: z.number(),
    thickness: z.number(),
    lugWidth: z.number(),
    lugToLug: z.number(),
  }),
  appearance: z.strictObject({
    dialColor: z.string().regex(/^#[a-f\d]{6}$/i),
    handStyle: z.enum(["baton", "leaf"]),
    strap: z.enum(["black", "cognac"]),
  }),
  referenceIds: z.array(z.string().uuid()).max(3),
});
export const propertySchema = z.enum([
  "family",
  "diameter",
  "height",
  "lugWidth",
  "movementEnvelope",
  "holderEnvelope",
  "movementHeight",
  "caseDepth",
  "dialDiameter",
  "dialSeat",
  "handHourHole",
  "hourPost",
  "stemHeight",
  "crownHeight",
  "price",
  "stock",
  "included",
  "quantity",
  "identity",
]);
export const observationSchema = z.strictObject({
  id: key,
  subject: key,
  variant: key,
  property: propertySchema,
  value: z.union([
    z.number().finite().min(0).max(1_000_000_000),
    z.string().max(300),
  ]),
  unit: z.enum(["mm", "text", "minor", "units"]),
  tolerance: z.number().finite().nonnegative().max(10).nullable(),
  datum: z.string().max(100),
  locator: z.string().min(1).max(300),
  excerpt: z.string().max(300),
  basis: z.enum([
    "manufacturer-reported",
    "seller-reported",
    "user-assertion",
    "visual-inference",
  ]),
});
export const sourceSchema = z
  .strictObject({
    id: key,
    url: publicUrl,
    publisher: z.string().min(1).max(180),
    title: z.string().max(240),
    retrievedAt: time,
    publishedAt: z.string().max(60).nullable(),
    access: z.enum(["retrieved", "discovery-only", "blocked", "user-provided"]),
    origin: z.enum(["live", "fixture", "manual", "imported"]),
    selected: z.boolean(),
    hash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    observations: z.array(observationSchema).max(32),
    conflicts: z.array(text).max(8),
    limitation: text,
    retention: z.literal(
      "bounded facts and locators; no page or image redistribution",
    ),
  })
  .superRefine((s, ctx) => {
    const words = s.observations
      .map((o) => o.excerpt)
      .join(" ")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    if (words > 25)
      ctx.addIssue({
        code: "custom",
        message: "Source excerpt budget exceeds 25 words.",
      });
    if (new Set(s.observations.map((o) => o.id)).size !== s.observations.length)
      ctx.addIssue({
        code: "custom",
        message: "Duplicate observation identities.",
      });
    if (
      s.access !== "retrieved" &&
      s.access !== "user-provided" &&
      s.observations.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Unretrieved sources cannot offer evidence.",
      });
  });
export const claimSchema = z.strictObject({
  id: key,
  sourceId: key,
  observationId: key,
  subject: key,
  variant: key,
  property: propertySchema,
  value: observationSchema.shape.value,
  unit: observationSchema.shape.unit,
  status: z.enum(["reported", "inferred", "user-asserted"]),
});
export const candidateSchema = z.strictObject({
  id: key,
  role: z.enum(["movement", "case"]),
  name: z.string().min(1).max(240),
  variant: key,
  exactVariant: z.boolean(),
  sourceId: key,
  claimIds: z.array(key).max(32),
  aesthetic: text,
  questions: z.array(text).max(12),
  realization: z.literal("proposed-source-not-rendered"),
});
export const offerSchema = z
  .strictObject({
    id: key,
    candidateId: key,
    sourceId: key,
    variant: key,
    seller: z.string().min(1).max(180),
    currency: requirementsSchema.shape.currency,
    tiers: z
      .array(z.strictObject({ minPacks: count, priceMinorPerPack: minor }))
      .max(8),
    packQuantity: count,
    moqPacks: count.nullable(),
    multiplePacks: count.nullable(),
    maxPacks: count.nullable(),
    minimumSpendMinor: minor.nullable(),
    observedAt: time,
    stock: z.enum([
      "reported-available",
      "unavailable",
      "backorder",
      "unknown",
      "conflicting",
    ]),
    quantityConfirmed: z.boolean(),
    exactVariant: z.boolean(),
    included: z
      .array(
        z.enum([
          "crystal",
          "crown",
          "caseback",
          "gasket",
          "springbars",
          "stem",
        ]),
      )
      .max(6),
    includedAssembly: z.enum(["unknown", "unassembled", "assembled"]),
    evidenceIds: z.array(key).max(16),
    limitation: text,
  })
  .superRefine((o, ctx) => {
    if (
      new Set(o.tiers.map((t) => t.minPacks)).size !== o.tiers.length ||
      new Set(o.included).size !== o.included.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Duplicate tiers or bundle contents.",
      });
  });
export const guideSchema = z.strictObject({
  id: key,
  sourceId: key,
  title: z.string().max(240),
  family: z.enum(["NH35", "other", "general"]),
  variant: key.nullable(),
  access: z.enum([
    "article",
    "video",
    "transcript",
    "description",
    "title-only",
  ]),
  locator: z.string().max(300),
  timestampSeconds: z.number().int().nonnegative().max(36000).nullable(),
  topics: z
    .array(
      z.enum([
        "planning",
        "tools",
        "dial-hands",
        "casing",
        "inspection",
        "operation",
      ]),
    )
    .max(6),
});
export const usageSchema = z.strictObject({
  reported: z.boolean().optional(),
  input: z.number().int().nonnegative(),
  cachedInput: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
});
export const runSchema = z.strictObject({
  id: z.string().uuid(),
  inputHash: snapshotSchema.shape.hash,
  provider: z.enum(["codex-local", "manual", "fixture", "imported"]),
  model: z.string().max(100),
  cliVersion: z.string().max(80),
  promptVersion: z.literal(BI_VERSION),
  schemaVersion: z.literal(BI_VERSION),
  startedAt: time,
  endedAt: time,
  queries: z.array(z.string().max(300)).max(8),
  usage: usageSchema,
  failures: z.array(text).max(16),
  state: z.enum(["complete", "partial", "failed", "cancelled"]),
  capabilities: z
    .array(z.enum(["public-web-discovery", "isolated-image-style"]))
    .max(2),
});
export const packetSchema = z
  .strictObject({
    format: z.literal("watch-atelier-research"),
    version: z.literal(1),
    id: z.string().uuid(),
    createdAt: time,
    snapshot: snapshotSchema,
    requirements: requirementsSchema,
    run: runSchema,
    sources: z.array(sourceSchema).max(BI_LIMITS.sources),
    claims: z.array(claimSchema).max(48),
    candidates: z.array(candidateSchema).max(4),
    offers: z.array(offerSchema).max(8),
    guides: z.array(guideSchema).max(12),
    selected: z.strictObject({ movementId: key, caseId: key }).nullable(),
    owned: z
      .array(
        z.strictObject({
          candidateId: key,
          units: z.number().int().nonnegative().max(100_000),
        }),
      )
      .max(4),
    visualSuggestions: z.array(styleSchema).max(7),
    shared: z.boolean(),
  })
  .superRefine((p, ctx) => {
    for (const items of [
      p.sources,
      p.claims,
      p.candidates,
      p.offers,
      p.guides,
    ]) {
      if (new Set(items.map((x) => x.id)).size !== items.length)
        ctx.addIssue({
          code: "custom",
          message: "Duplicate research identities.",
        });
    }
    for (const c of p.candidates)
      if (
        !p.sources.some((s) => s.id === c.sourceId) ||
        c.claimIds.some(
          (id) =>
            !p.claims.some(
              (x) =>
                x.id === id && x.subject === c.id && x.variant === c.variant,
            ),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Candidate has dangling evidence.",
        });
    for (const c of p.claims)
      if (
        !p.sources.some(
          (s) =>
            s.id === c.sourceId &&
            s.observations.some((o) => o.id === c.observationId),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Claim has dangling evidence.",
        });
    for (const o of p.offers)
      if (
        !p.candidates.some(
          (c) => c.id === o.candidateId && c.variant === o.variant,
        ) ||
        !p.sources.some(
          (s) =>
            s.id === o.sourceId &&
            o.evidenceIds.every((id) =>
              s.observations.some((x) => x.id === id),
            ),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Offer has dangling evidence or wrong variant.",
        });
    if (
      p.selected &&
      (!p.candidates.some(
        (c) => c.id === p.selected!.movementId && c.role === "movement",
      ) ||
        !p.candidates.some(
          (c) => c.id === p.selected!.caseId && c.role === "case",
        ))
    )
      ctx.addIssue({ code: "custom", message: "Invalid selected pairing." });
    if (
      p.guides.some((g) => !p.sources.some((s) => s.id === g.sourceId)) ||
      p.owned.some((o) => !p.candidates.some((c) => c.id === o.candidateId)) ||
      new Set(p.owned.map((o) => o.candidateId)).size !== p.owned.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid resource or owned-part identity.",
      });
  });
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Requirements = z.infer<typeof requirementsSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
export type Offer = z.infer<typeof offerSchema>;
export type Guide = z.infer<typeof guideSchema>;
export type Packet = z.infer<typeof packetSchema>;
export type Style = z.infer<typeof styleSchema>;

/** Both HTTP and file import use a bounded parse before recursive schema work. */
export function boundedJSON(
  text: string,
  maxBytes = BI_LIMITS.packetBytes,
): unknown {
  if (new TextEncoder().encode(text).length > maxBytes)
    throw new Error("Research input is too large.");
  let depth = 0,
    string = false,
    escape = false,
    nodes = 0;
  for (const c of text) {
    if (string) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') string = false;
    } else if (c === '"') string = true;
    else if (c === "{" || c === "[") {
      if (++depth > 16 || ++nodes > 10000)
        throw new Error("Research input exceeds structural limits.");
    } else if (c === "}" || c === "]") depth--;
  }
  return JSON.parse(text);
}
