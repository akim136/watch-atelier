import { z } from "zod";
import {
  newId,
  projectSchema,
  referenceSchema,
  assetSchema,
  LIMITS,
  type Project,
  type Design,
  type Lock,
} from "./model";

const id = z.string().uuid();
const editSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("dialColor"), value: z.string() }),
  z.strictObject({
    kind: z.literal("handStyle"),
    value: z.enum(["baton", "leaf"]),
  }),
  z.strictObject({
    kind: z.literal("strap"),
    value: z.enum(["black", "cognac"]),
  }),
  z.strictObject({
    kind: z.literal("text"),
    id,
    patch: z.strictObject({
      text: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      size: z.number().optional(),
      color: z.string().optional(),
    }),
  }),
  z.strictObject({
    kind: z.literal("markers"),
    patch: z.strictObject({
      style: z.enum(["baton", "dot"]).optional(),
      length: z.number().optional(),
      color: z.string().optional(),
    }),
  }),
  z.strictObject({
    kind: z.literal("track"),
    patch: z.strictObject({
      visible: z.boolean().optional(),
      color: z.string().optional(),
    }),
  }),
]);
const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("edit"),
    variantId: id,
    edits: z.array(editSchema).min(1).max(16),
  }),
  z.strictObject({
    type: z.literal("lock"),
    variantId: id,
    field: z.enum([
      "dialColor",
      "text",
      "markers",
      "track",
      "handStyle",
      "strap",
    ]),
    locked: z.boolean(),
  }),
  z.strictObject({ type: z.literal("brief"), value: z.string() }),
  z.strictObject({ type: z.literal("name"), value: z.string() }),
  z.strictObject({
    type: z.literal("rename"),
    variantId: id,
    value: z.string(),
  }),
  z.strictObject({ type: z.literal("duplicate"), variantId: id }),
  z.strictObject({
    type: z.literal("reference"),
    reference: referenceSchema,
    asset: assetSchema,
  }),
  z.strictObject({ type: z.literal("removeReference"), id }),
  z.strictObject({ type: z.literal("undo") }),
  z.strictObject({ type: z.literal("redo") }),
]);
export type Edit = z.infer<typeof editSchema>;
export type Command = z.infer<typeof commandSchema>;
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export interface History {
  past: Project[];
  future: Project[];
}
export const emptyHistory = (): History => ({ past: [], future: [] });
export interface Accepted {
  project: Project;
  history: History;
  changed: boolean;
}
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const bound = (stack: Project[]) => {
  const out = [...stack];
  let bytes = out.reduce(
    (sum, p) => sum + new TextEncoder().encode(JSON.stringify(p)).length,
    0,
  );
  while (out.length > LIMITS.history || bytes > LIMITS.historyBytes) {
    bytes -= new TextEncoder().encode(JSON.stringify(out.shift())).length;
  }
  return out;
};
export function applyProjectCommand(
  current: Project,
  raw: Command,
  expectedRevision: number,
  history: History = emptyHistory(),
): Accepted {
  if (expectedRevision !== current.revision)
    throw new DomainError(
      "stale",
      "This action belongs to an older revision. Try again on the current design.",
    );
  const parsed = commandSchema.safeParse(raw);
  if (!parsed.success)
    throw new DomainError("invalid", "Unsupported or malformed action.");
  const cmd = parsed.data;
  let next = structuredClone(current);
  let h = history;
  if (cmd.type === "undo" || cmd.type === "redo") {
    const from = cmd.type === "undo" ? history.past : history.future;
    if (!from.length) return { project: current, history, changed: false };
    next = structuredClone(from[from.length - 1]);
    h =
      cmd.type === "undo"
        ? {
            past: from.slice(0, -1),
            future: bound([...history.future, current]),
          }
        : {
            past: bound([...history.past, current]),
            future: from.slice(0, -1),
          };
  } else {
    const variant =
      "variantId" in cmd
        ? next.variants.find((v) => v.id === cmd.variantId)
        : undefined;
    if ("variantId" in cmd && !variant)
      throw new DomainError("missing", "That variant no longer exists.");
    if (cmd.type === "edit") {
      const d = variant!.design;
      for (const e of cmd.edits) {
        if (d.locks.includes(e.kind as Lock))
          throw new DomainError(
            "locked",
            `${e.kind} is locked. Unlock it before editing.`,
          );
        if (
          e.kind === "dialColor" ||
          e.kind === "handStyle" ||
          e.kind === "strap"
        )
          Object.assign(d, { [e.kind]: e.value });
        else if (e.kind === "text") {
          const o = d.objects.find((o) => o.id === e.id && o.kind === "text");
          if (!o)
            throw new DomainError("missing", "Text object no longer exists.");
          Object.assign(o, e.patch);
        } else
          Object.assign(d.objects.find((o) => o.kind === e.kind)!, e.patch);
      }
    } else if (cmd.type === "lock") {
      variant!.design.locks = variant!.design.locks.filter(
        (f) => f !== cmd.field,
      );
      if (cmd.locked) variant!.design.locks.push(cmd.field);
      variant!.design.locks.sort();
    } else if (cmd.type === "brief") next.brief = cmd.value;
    else if (cmd.type === "name") next.name = cmd.value;
    else if (cmd.type === "rename") variant!.name = cmd.value;
    else if (cmd.type === "duplicate") {
      if (next.variants.length >= LIMITS.variants)
        throw new DomainError(
          "limit",
          "A project supports up to eight studies.",
        );
      const v = structuredClone(variant!);
      v.id = newId();
      v.name = `Study ${String(next.variants.length + 1).padStart(2, "0")}`;
      v.design.id = newId();
      v.design.objects.forEach((o) => (o.id = newId()));
      v.design.components.forEach((c) => (c.id = newId()));
      next.variants.push(v);
      for (const r of next.references)
        if (r.variantIds.includes(variant!.id)) r.variantIds.push(v.id);
    } else if (cmd.type === "reference") {
      const idx = next.references.findIndex((r) => r.id === cmd.reference.id);
      if (idx < 0) next.references.push(cmd.reference);
      else next.references[idx] = cmd.reference;
      if (!next.assets.some((a) => a.hash === cmd.asset.hash))
        next.assets.push(cmd.asset);
      next.assets = next.assets.filter((a) =>
        next.references.some((r) => r.assetHash === a.hash),
      );
    } else if (cmd.type === "removeReference") {
      if (!next.references.some((r) => r.id === cmd.id))
        throw new DomainError("missing", "Reference no longer exists.");
      next.references = next.references.filter((r) => r.id !== cmd.id);
      next.assets = next.assets.filter((a) =>
        next.references.some((r) => r.assetHash === a.hash),
      );
    }
    if (equal(current, next))
      return { project: current, history, changed: false };
    h = { past: bound([...history.past, current]), future: [] };
  }
  next.revision = current.revision + 1;
  for (const v of next.variants) {
    const before = current.variants.find((old) => old.id === v.id);
    v.design.revision =
      before && equal(semanticDesign(before.design), semanticDesign(v.design))
        ? before.design.revision
        : next.revision;
  }
  const result = projectSchema.safeParse(next);
  if (!result.success)
    throw new DomainError(
      "invalid",
      result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .slice(0, 3)
        .join(" · "),
    );
  return { project: result.data, history: h, changed: true };
}
export function semanticDesign(d: Design) {
  return { ...d, revision: 0 };
}
