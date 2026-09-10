import { describe, it, expect } from "vitest";
import {
  newProject,
  newId,
  projectSchema,
  remapProject,
  LIMITS,
} from "../src/domain/model";
import {
  applyProjectCommand,
  emptyHistory,
  DomainError,
  type Command,
} from "../src/domain/commands";

describe("canonical design", () => {
  it("[M1-09] exact project counts, text and parameter limits have valid controls and just-over rejections", () => {
    let p = newProject();
    for (let i = 1; i < 8; i++)
      p = applyProjectCommand(
        p,
        { type: "duplicate", variantId: p.variants[0].id },
        p.revision,
      ).project;
    expect(projectSchema.safeParse(p).success).toBe(true);
    expect(() =>
      applyProjectCommand(
        p,
        { type: "duplicate", variantId: p.variants[0].id },
        p.revision,
      ),
    ).toThrow(/eight/);
    p.name = "N".repeat(80);
    p.brief = "B".repeat(2000);
    for (let i = 0; i < 3; i++) {
      const hash = String(i).repeat(64);
      p.assets.push({
        hash,
        mediaType: "image/webp",
        width: 2048,
        height: 2048,
        bytes: LIMITS.assetBytes,
        source: "user-local-unverified",
        recipe: "reference-preview-v1",
      });
      p.references.push({
        id: newId(),
        assetHash: hash,
        attribution: "A".repeat(500),
        variantIds: p.variants.map((v) => v.id),
        notes: Array.from({ length: 4 }, () => ({
          id: newId(),
          kind: "like" as const,
          text: "T".repeat(500),
        })),
      });
    }
    expect(projectSchema.safeParse(p).success).toBe(true);
    for (const property of ["name", "brief"] as const) {
      const over = structuredClone(p);
      over[property] += "X";
      expect(projectSchema.safeParse(over).success).toBe(false);
    }
    const refs = structuredClone(p);
    refs.references.push({ ...refs.references[0], id: newId() });
    expect(projectSchema.safeParse(refs).success).toBe(false);
    for (const params of [
      { x: -9, y: 9, size: 0.7, text: "X".repeat(40) },
      { x: 9, y: -9, size: 2.5, text: "<>& punctuation!" },
    ])
      expect(() =>
        applyProjectCommand(
          p,
          {
            type: "edit",
            variantId: p.variants[0].id,
            edits: [
              {
                kind: "text",
                id: p.variants[0].design.objects[0].id,
                patch: params,
              },
            ],
          },
          p.revision,
        ),
      ).not.toThrow();
    for (const patch of [
      { x: 9.01 },
      { y: -9.01 },
      { size: 2.51 },
      { size: 0.69 },
      { text: "X".repeat(41) },
      { text: "Unsupported Ω" },
    ])
      expect(() =>
        applyProjectCommand(
          p,
          {
            type: "edit",
            variantId: p.variants[0].id,
            edits: [
              { kind: "text", id: p.variants[0].design.objects[0].id, patch },
            ],
          },
          p.revision,
        ),
      ).toThrow();
  });
  it("[M1-02] real edit changes only requested semantics; no-op is unchanged", () => {
    const p = newProject(),
      id = p.variants[0].id;
    const result = applyProjectCommand(
      p,
      {
        type: "edit",
        variantId: id,
        edits: [{ kind: "dialColor", value: "#112233" }],
      },
      0,
    );
    expect(result.project.variants[0].design.dialColor).toBe("#112233");
    expect(p.variants[0].design.dialColor).toBe("#ece6d8");
    expect(result.project.variants[0].design.objects).toEqual(
      p.variants[0].design.objects,
    );
    expect(result.changed).toBe(true);
    expect(
      applyProjectCommand(
        result.project,
        {
          type: "edit",
          variantId: id,
          edits: [{ kind: "dialColor", value: "#112233" }],
        },
        1,
      ).changed,
    ).toBe(false);
    expect(() =>
      expect(p.variants[0].design.dialColor).toBe("#112233"),
    ).toThrow();
  });
  it("[M1-05] unlocked / specifically locked mixed batch / unlock controls", () => {
    let p = newProject();
    let h = emptyHistory();
    const id = p.variants[0].id;
    const run = (c: Command) => {
      const r = applyProjectCommand(p, c, p.revision, h);
      p = r.project;
      h = r.history;
    };
    run({
      type: "edit",
      variantId: id,
      edits: [{ kind: "dialColor", value: "#112233" }],
    });
    run({ type: "lock", variantId: id, field: "dialColor", locked: true });
    const before = structuredClone(p);
    try {
      run({
        type: "edit",
        variantId: id,
        edits: [
          { kind: "markers", patch: { length: 3 } },
          { kind: "dialColor", value: "#445566" },
        ],
      });
      throw Error("Expected rejection");
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError);
      expect((e as DomainError).code).toBe("locked");
    }
    expect(p).toEqual(before);
    expect(h.past).toHaveLength(2);
    run({ type: "lock", variantId: id, field: "dialColor", locked: false });
    run({
      type: "edit",
      variantId: id,
      edits: [{ kind: "dialColor", value: "#445566" }],
    });
    expect(p.variants[0].design.dialColor).toBe("#445566");
  });
  it("[M1-06] project history interleaves variants, locks, undo, redo and branch with fresh revisions", () => {
    let p = newProject(),
      h = emptyHistory();
    const run = (c: Command) => {
      const r = applyProjectCommand(p, c, p.revision, h);
      p = r.project;
      h = r.history;
    };
    const first = p.variants[0].id;
    run({ type: "brief", value: "Keep the quiet dial" });
    run({ type: "duplicate", variantId: first });
    const second = p.variants[1].id;
    run({
      type: "edit",
      variantId: second,
      edits: [{ kind: "markers", patch: { length: 3 } }],
    });
    run({ type: "lock", variantId: first, field: "text", locked: true });
    run({ type: "undo" });
    expect(p.variants[0].design.locks).toEqual([]);
    expect(p.variants[1].design.objects[2].length).toBe(3);
    run({ type: "undo" });
    expect(p.variants[1].design.objects[2].length).toBe(1.9);
    run({ type: "redo" });
    expect(p.revision).toBe(7);
    expect(p.variants[1].design.revision).toBe(7);
    run({ type: "undo" });
    run({ type: "brief", value: "Branch" });
    expect(h.future).toEqual([]);
    expect(() =>
      applyProjectCommand(p, { type: "brief", value: "stale" }, 0, h),
    ).toThrow(/older revision/);
    for (let i = 0; i < 110; i++) run({ type: "brief", value: `Brief ${i}` });
    expect(h.past.length).toBe(LIMITS.history);
  });
  it("[M1-07] copies remap identities and stay independent", () => {
    const p = newProject();
    const r = applyProjectCommand(
      p,
      { type: "duplicate", variantId: p.variants[0].id },
      0,
    ).project;
    expect(r.variants[0].design.objects[0].id).not.toBe(
      r.variants[1].design.objects[0].id,
    );
    r.variants[1].design.objects[0].text = "COPY";
    expect(r.variants[0].design.objects[0].text).toBe("ATELIER");
    const copy = remapProject(r);
    expect(copy.id).not.toBe(r.id);
    expect(projectSchema.safeParse(copy).success).toBe(true);
  });
  it("[M1-09] duplicate identities, unknown commands and nonfinite values reject atomically", () => {
    const p = newProject();
    p.variants[0].design.objects[0].id = p.variants[0].id;
    expect(projectSchema.safeParse(p).success).toBe(false);
    const valid = newProject();
    for (const value of [NaN, Infinity, -1, 4])
      expect(() =>
        applyProjectCommand(
          valid,
          {
            type: "edit",
            variantId: valid.variants[0].id,
            edits: [{ kind: "markers", patch: { length: value } }],
          },
          0,
        ),
      ).toThrow();
    expect(() =>
      applyProjectCommand(valid, { type: "hacked" } as unknown as Command, 0),
    ).toThrow();
    expect(valid.revision).toBe(0);
  });
  it("[M1-10] concept schema rejects invented trust and remote resources", () => {
    const p = newProject();
    expect(
      projectSchema.safeParse({
        ...p,
        supplierSKU: "FAKE",
        physicalApproval: true,
      }).success,
    ).toBe(false);
    expect(projectSchema.safeParse(p).success).toBe(true);
    expect(
      projectSchema.safeParse({
        ...p,
        assets: [{ url: "https://example.com/private" }],
      }).success,
    ).toBe(false);
  });
  it("[M1-17] millimeter concept values and exact min/max boundaries", () => {
    const p = newProject();
    expect(p.variants[0].design.units).toBe("mm");
    expect(p.variants[0].design.dimensions).toEqual({
      diameter: 39,
      lugToLug: 46.5,
      lugWidth: 20,
      thickness: 10.8,
    });
    for (const length of [0.5, 3])
      expect(
        applyProjectCommand(
          p,
          {
            type: "edit",
            variantId: p.variants[0].id,
            edits: [{ kind: "markers", patch: { length } }],
          },
          0,
        ).project.variants[0].design.objects[2].length,
      ).toBe(length);
    expect(
      projectSchema.safeParse({
        ...p,
        variants: [
          {
            ...p.variants[0],
            design: { ...p.variants[0].design, dimensions: { diameter: 38 } },
          },
        ],
      }).success,
    ).toBe(false);
  });
});
