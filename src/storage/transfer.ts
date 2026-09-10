import { z } from "zod";
import {
  projectSchema,
  remapProject,
  LIMITS,
  type Project,
} from "../domain/model";
import { validateAsset, type AssetBytes } from "./assets";

const envelope = z.strictObject({
  format: z.literal("watch-atelier"),
  version: z.literal(1),
  kind: z.enum(["share", "backup"]),
  project: projectSchema,
  assets: z
    .array(
      z.strictObject({
        hash: z.string().regex(/^[a-f0-9]{64}$/),
        base64: z.string().max(Math.ceil(LIMITS.assetBytes / 3) * 4),
      }),
    )
    .max(3),
});
export function boundedJSON(text: string): unknown {
  if (new TextEncoder().encode(text).length > LIMITS.backupBytes)
    throw new Error("Project files must be 24 MiB or less.");
  let depth = 0,
    inString = false,
    escape = false;
  for (const c of text) {
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{" || c === "[") {
      if (++depth > 16)
        throw new Error("Project nesting exceeds the supported limit.");
    } else if (c === "}" || c === "]") depth--;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("This is not valid project JSON.");
  }
  const stack = [value];
  let nodes = 0;
  while (stack.length) {
    const item = stack.pop();
    if (++nodes > 50000)
      throw new Error("Project exceeds the supported field count.");
    if (item && typeof item === "object") {
      const values = Object.values(item);
      if (nodes + stack.length + values.length > 50000)
        throw new Error("Project exceeds the supported field count.");
      for (const child of values) stack.push(child);
    }
  }
  return value;
}
const encode = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
};
const decode = (text: string) => {
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text))
    throw new Error("Invalid reference encoding.");
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
};
export async function exportProject(
  project: Project,
  bytes: AssetBytes,
  kind: "share" | "backup",
  includeBrief = false,
) {
  let p = projectSchema.parse(project);
  const assets: { hash: string; base64: string }[] = [];
  if (kind === "share") {
    p = remapProject({
      ...p,
      name: "Shared watch study",
      brief: includeBrief ? p.brief : "",
      references: [],
      assets: [],
      variants: p.variants.map((v, i) => ({
        ...v,
        name: `Study ${String(i + 1).padStart(2, "0")}`,
      })),
    });
  } else
    for (const record of p.assets) {
      const data = bytes.get(record.hash);
      if (!data)
        throw new Error(
          "A reference is missing. Restore it or remove it before creating a personal backup.",
        );
      await validateAsset(record, data);
      assets.push({ hash: record.hash, base64: encode(data) });
    }
  const result = JSON.stringify(
    { format: "watch-atelier", version: 1, kind, project: p, assets },
    null,
    2,
  );
  if (
    new TextEncoder().encode(result).length >
    (kind === "share" ? LIMITS.shareBytes : LIMITS.backupBytes)
  )
    throw new Error("Export exceeds the supported file size.");
  return result;
}
export async function importProject(
  text: string,
  decodeImages = true,
): Promise<{ project: Project; bytes: AssetBytes }> {
  const result = envelope.safeParse(boundedJSON(text));
  if (!result.success)
    throw new Error(
      "Unsupported or invalid Watch Atelier project. Only editable version 1 concept projects are supported.",
    );
  const e = result.data;
  if (
    e.kind === "share" &&
    (new TextEncoder().encode(text).length > LIMITS.shareBytes ||
      e.project.references.length ||
      e.assets.length ||
      e.project.assets.length)
  )
    throw new Error(
      "Invalid shared design: private reference content is not allowed.",
    );
  if (
    new Set(e.assets.map((a) => a.hash)).size !== e.assets.length ||
    e.assets.length !== e.project.assets.length
  )
    throw new Error("Reference inventory does not match the project.");
  const bytes: AssetBytes = new Map();
  for (const record of e.project.assets) {
    const a = e.assets.find((a) => a.hash === record.hash);
    if (!a) throw new Error("Missing reference asset.");
    const data = decode(a.base64);
    await validateAsset(record, data, decodeImages);
    bytes.set(record.hash, data);
  }
  return { project: remapProject(e.project), bytes };
}
