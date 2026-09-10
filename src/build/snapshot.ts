import { designSchema, type Project, type Design } from "../domain/model.ts";
import {
  WATCH_RENDER_CONTRACT,
  WATCH_ASSET_VERSION,
} from "../render/contract.ts";
import {
  snapshotSchema,
  requirementsSchema,
  type Snapshot,
  type Requirements,
} from "./model.ts";

export async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(bytes), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export async function capture(
  project: Project,
  variantId: string,
): Promise<Snapshot> {
  const v = project.variants.find((v) => v.id === variantId);
  if (!v) throw new Error("The selected design is no longer available.");
  const d = designSchema.parse(v.design);
  return snapshotSchema.parse({
    projectId: project.id,
    variantId,
    designId: d.id,
    revision: d.revision,
    hash: await digest(d),
    units: d.units,
    template: d.template,
    renderContract: WATCH_RENDER_CONTRACT,
    assetVersion: WATCH_ASSET_VERSION,
    dimensions: d.dimensions,
    appearance: {
      dialColor: d.dialColor,
      handStyle: d.handStyle,
      strap: d.strap,
    },
    referenceIds: project.references
      .filter((r) => r.variantIds.includes(variantId))
      .map((r) => r.id),
  });
}
export function initialRequirements(s: Snapshot): Requirements {
  const target = (value: number) => ({
    value,
    origin: "concept-target" as const,
    evidence: "",
    hard: false,
  });
  return requirementsSchema.parse({
    revision: 0,
    family: "NH35",
    functions: "three-hand",
    diameter: target(s.dimensions.diameter),
    thickness: target(s.dimensions.thickness),
    lugWidth: target(s.dimensions.lugWidth),
    dialLayout: "Original concept dial; date-window intent must be confirmed.",
    finish: "Concept finish; not a material measurement.",
    styles: ["minimal"],
    like: "",
    avoid: "",
    quantity: 1,
    currency: "USD",
    destination: "",
    budgetMinor: null,
    custom: "stock-preferred",
    selectedUrls: [],
  });
}
export function stale(
  snapshot: Snapshot,
  projectId: string,
  variantId: string,
  design: Design,
) {
  return (
    snapshot.projectId !== projectId ||
    snapshot.variantId !== variantId ||
    snapshot.designId !== design.id ||
    snapshot.revision !== design.revision
  );
}
/** Deliberately excludes names, notes, free text, reference IDs, images and exact artwork. */
export function publicDiscovery(requirements: Requirements) {
  const r = requirementsSchema.parse(requirements);
  return {
    family: r.family,
    functions: r.functions,
    targetsMm: {
      diameter: r.diameter.value,
      thickness: r.thickness.value,
      lugWidth: r.lugWidth.value,
    },
    dimensionOrigin:
      "user-confirmed-targets-not-hardware-measurements" as const,
    quantity: r.quantity,
    styles: r.styles,
    urls: r.selectedUrls,
  };
}
