import { z } from "zod";

export const LIMITS = {
  references: 3,
  variants: 8,
  history: 100,
  historyBytes: 5 * 1024 ** 2,
  sourceBytes: 10 * 1024 ** 2,
  assetBytes: 5 * 1024 ** 2,
  totalAssetBytes: 15 * 1024 ** 2,
  shareBytes: 2 * 1024 ** 2,
  backupBytes: 24 * 1024 ** 2,
} as const;
const id = z.string().uuid();
const revision = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER - 1);
export const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const bounded = (min: number, max: number) =>
  z.number().finite().min(min).max(max);
export const textSchema = z.strictObject({
  id,
  kind: z.literal("text"),
  text: z
    .string()
    .max(40)
    .regex(/^[\x20-\x7e]*$/),
  x: bounded(-9, 9),
  y: bounded(-9, 9),
  size: bounded(0.7, 2.5),
  color,
});
export const markerSchema = z.strictObject({
  id,
  kind: z.literal("markers"),
  style: z.enum(["baton", "dot"]),
  length: bounded(0.5, 3),
  color,
});
export const trackSchema = z.strictObject({
  id,
  kind: z.literal("track"),
  visible: z.boolean(),
  color,
});
export const fontIdentity = "ibm-plex-sans-condensed-2.0.0";
export const componentSchema = z.strictObject({
  id,
  role: z.enum(["case", "bezel", "dial", "hands", "crystal", "strap"]),
  realization: z.literal("concept"),
});
export const designSchema = z
  .strictObject({
    id,
    revision,
    units: z.literal("mm"),
    template: z.literal("atelier-39-v1"),
    font: z.literal(fontIdentity),
    dimensions: z.strictObject({
      diameter: z.literal(39),
      lugToLug: z.literal(46.5),
      lugWidth: z.literal(20),
      thickness: z.literal(10.8),
    }),
    components: z.array(componentSchema).length(6),
    dialColor: color,
    handStyle: z.enum(["baton", "leaf"]),
    strap: z.enum(["black", "cognac"]),
    objects: z.tuple([textSchema, textSchema, markerSchema, trackSchema]),
    locks: z
      .array(
        z.enum(["dialColor", "text", "markers", "track", "handStyle", "strap"]),
      )
      .max(6),
  })
  .superRefine((d, ctx) => {
    if (new Set(d.components.map((c) => c.role)).size !== 6)
      ctx.addIssue({
        code: "custom",
        message: "Every concept component role must appear exactly once.",
      });
    if (new Set(d.locks).size !== d.locks.length)
      ctx.addIssue({ code: "custom", message: "Duplicate locks." });
  });
export const assetSchema = z.strictObject({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  mediaType: z.literal("image/webp"),
  width: z.number().int().min(1).max(2048),
  height: z.number().int().min(1).max(2048),
  bytes: z.number().int().min(1).max(LIMITS.assetBytes),
  source: z.literal("user-local-unverified"),
  recipe: z.literal("reference-preview-v1"),
});
export const referenceSchema = z.strictObject({
  id,
  assetHash: z.string().regex(/^[a-f0-9]{64}$/),
  attribution: z.string().max(500),
  variantIds: z.array(id).min(1).max(8),
  notes: z
    .array(
      z.strictObject({
        id,
        kind: z.enum(["like", "avoid"]),
        text: z.string().max(500),
      }),
    )
    .max(4),
});
export const projectSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id,
    revision,
    name: z.string().min(1).max(80),
    brief: z.string().max(2000),
    variants: z
      .array(
        z.strictObject({
          id,
          name: z.string().min(1).max(80),
          design: designSchema,
        }),
      )
      .min(1)
      .max(LIMITS.variants),
    references: z.array(referenceSchema).max(LIMITS.references),
    assets: z.array(assetSchema).max(LIMITS.references),
  })
  .superRefine((p, ctx) => {
    const ids = [p.id];
    for (const v of p.variants) {
      ids.push(
        v.id,
        v.design.id,
        ...v.design.components.map((c) => c.id),
        ...v.design.objects.map((o) => o.id),
      );
      if (v.design.revision > p.revision)
        ctx.addIssue({
          code: "custom",
          message: "Design revision exceeds project revision.",
        });
    }
    for (const r of p.references) {
      ids.push(r.id, ...r.notes.map((n) => n.id));
      if (
        new Set(r.variantIds).size !== r.variantIds.length ||
        r.variantIds.some((id) => !p.variants.some((v) => v.id === id))
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid reference variant scope.",
        });
    }
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Duplicate identities." });
    if (new Set(p.assets.map((a) => a.hash)).size !== p.assets.length)
      ctx.addIssue({ code: "custom", message: "Duplicate asset hash." });
    if (
      p.references.some((r) => !p.assets.some((a) => a.hash === r.assetHash)) ||
      p.assets.some((a) => !p.references.some((r) => r.assetHash === a.hash))
    )
      ctx.addIssue({
        code: "custom",
        message: "Missing or orphan reference asset.",
      });
    if (p.assets.reduce((s, a) => s + a.bytes, 0) > LIMITS.totalAssetBytes)
      ctx.addIssue({
        code: "custom",
        message: "Reference assets exceed 15 MiB.",
      });
  });
export type Project = z.infer<typeof projectSchema>;
export type Design = z.infer<typeof designSchema>;
export type DialText = z.infer<typeof textSchema>;
export type AssetRecord = z.infer<typeof assetSchema>;
export type Reference = z.infer<typeof referenceSchema>;
export type Lock = Design["locks"][number];
export type Variant = Project["variants"][number];
export const newId = () => crypto.randomUUID();
export function newProject(): Project {
  return projectSchema.parse({
    schemaVersion: 1,
    id: newId(),
    revision: 0,
    name: "Untitled study",
    brief: "",
    references: [],
    assets: [],
    variants: [
      {
        id: newId(),
        name: "Study 01",
        design: {
          id: newId(),
          revision: 0,
          units: "mm",
          template: "atelier-39-v1",
          font: fontIdentity,
          dimensions: {
            diameter: 39,
            lugToLug: 46.5,
            lugWidth: 20,
            thickness: 10.8,
          },
          components: [
            "case",
            "bezel",
            "dial",
            "hands",
            "crystal",
            "strap",
          ].map((role) => ({ id: newId(), role, realization: "concept" })),
          dialColor: "#ece6d8",
          handStyle: "baton",
          strap: "black",
          locks: [],
          objects: [
            {
              id: newId(),
              kind: "text",
              text: "ATELIER",
              x: 0,
              y: 5.6,
              size: 1.6,
              color: "#242a2b",
            },
            {
              id: newId(),
              kind: "text",
              text: "STUDY 01",
              x: 0,
              y: -6.6,
              size: 0.85,
              color: "#55534e",
            },
            {
              id: newId(),
              kind: "markers",
              style: "baton",
              length: 1.9,
              color: "#2f3839",
            },
            { id: newId(), kind: "track", visible: true, color: "#77746b" },
          ],
        },
      },
    ],
  });
}
export function remapProject(input: Project): Project {
  const p = structuredClone(input);
  const ids = new Map<string, string>();
  const map = (id: string) => {
    if (!ids.has(id)) ids.set(id, newId());
    return ids.get(id)!;
  };
  p.id = map(p.id);
  p.revision = 0;
  for (const v of p.variants) {
    v.id = map(v.id);
    v.design.id = map(v.design.id);
    v.design.revision = 0;
    v.design.components.forEach((c) => (c.id = map(c.id)));
    v.design.objects.forEach((o) => (o.id = map(o.id)));
  }
  for (const r of p.references) {
    r.id = map(r.id);
    r.variantIds = r.variantIds.map(map);
    r.notes.forEach((n) => (n.id = map(n.id)));
  }
  return projectSchema.parse(p);
}
