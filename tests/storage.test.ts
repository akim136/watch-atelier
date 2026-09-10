import { describe, it, expect } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import {
  newProject,
  newId,
  LIMITS,
  type AssetRecord,
} from "../src/domain/model";
import { applyProjectCommand } from "../src/domain/commands";
import { ProjectDatabase, SaveConflict } from "../src/storage/database";
import {
  exportProject,
  importProject,
  boundedJSON,
} from "../src/storage/transfer";
import { rasterHeader, sha256 } from "../src/storage/assets";
import { Studio } from "../src/application/studio";

// A real 1x1 still WebP. Decoded in browser integration; unit checks use the actual header/hash parser.
export const pixel = Uint8Array.from(
  atob("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA"),
  (c) => c.charCodeAt(0),
);
async function fixture() {
  const p = newProject();
  const info = rasterHeader(pixel);
  const record: AssetRecord = {
    hash: await sha256(pixel),
    mediaType: "image/webp",
    width: info.width,
    height: info.height,
    bytes: pixel.length,
    source: "user-local-unverified",
    recipe: "reference-preview-v1",
  };
  p.assets = [record];
  p.references = [
    {
      id: newId(),
      assetHash: record.hash,
      attribution: "PRIVATE_ATTRIBUTION",
      variantIds: [p.variants[0].id],
      notes: [{ id: newId(), kind: "avoid", text: "PRIVATE_SECRET_999" }],
    },
  ];
  p.brief = "PRIVATE_BRIEF";
  return { p, bytes: new Map([[record.hash, pixel]]) };
}
describe("portable local projects", () => {
  it("[M1-06] removing and restoring references retains bytes across interleaved variant history", async () => {
    const { p, bytes } = await fixture(),
      db = new ProjectDatabase(new IDBFactory());
    await db.save(p, bytes, null);
    const studio = new Studio(db, false);
    await studio.initialize();
    try {
      studio.dispatch({ type: "duplicate", variantId: p.variants[0].id });
      studio.dispatch({ type: "removeReference", id: p.references[0].id });
      expect(studio.getSnapshot().project.references).toEqual([]);
      expect(studio.getSnapshot().assets.size).toBe(1);
      studio.dispatch({ type: "undo" });
      expect(
        studio.getSnapshot().project.references[0].variantIds,
      ).toHaveLength(2);
      expect(
        (await importProject(await studio.export("backup"), false)).bytes,
      ).toEqual(bytes);
      studio.dispatch({ type: "undo" });
      expect(studio.getSnapshot().project.variants).toHaveLength(1);
      studio.dispatch({ type: "redo" });
      expect(studio.getSnapshot().project.variants).toHaveLength(2);
      await studio.save();
      expect((await db.load(p.id)).warnings).toEqual([]);
    } finally {
      studio.dispose();
    }
  });
  it("[M1-09] JSON byte, node and nesting limits reject at the boundary without recursion", () => {
    expect(boundedJSON("[".repeat(16) + "]".repeat(16))).toBeDefined();
    expect(() => boundedJSON("[".repeat(17) + "]".repeat(17))).toThrow(
      /nesting/,
    );
    expect(boundedJSON(JSON.stringify(Array(49999).fill(0)))).toHaveLength(
      49999,
    );
    expect(() => boundedJSON(JSON.stringify(Array(50000).fill(0)))).toThrow(
      /field count/,
    );
    const exact = '"' + "x".repeat(LIMITS.backupBytes - 2) + '"';
    expect((boundedJSON(exact) as string).length).toBe(LIMITS.backupBytes - 2);
    expect(() => boundedJSON(exact + " ")).toThrow(/24 MiB/);
  });
  it("[M1-14] one corrupt stored project does not hide healthy projects or delete the damaged record", async () => {
    const factory = new IDBFactory(),
      db = new ProjectDatabase(factory),
      p = newProject();
    await db.save(p, new Map(), null);
    const raw = await new Promise<IDBDatabase>((resolve) => {
      const r = factory.open("watch-atelier-v1", 1);
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise<void>((resolve) => {
      const t = raw.transaction("projects", "readwrite");
      t.objectStore("projects").put({
        project: { id: "damaged" },
        saveVersion: 1,
        savedAt: 0,
      });
      t.oncomplete = () => resolve();
    });
    expect((await db.list()).map((s) => s.project.id)).toEqual([p.id]);
    expect(db.readWarnings[0]).toMatch(/invalid/);
    const count = await new Promise<number>((resolve) => {
      const r = raw.transaction("projects").objectStore("projects").count();
      r.onsuccess = () => resolve(r.result);
    });
    expect(count).toBe(2);
    expect((await db.load(p.id)).saved.project).toEqual(p);
    raw.close();
    await db.close();
  });
  it("[M1-14] damaged persisted reference cannot receive a successful save acknowledgement", async () => {
    const factory = new IDBFactory(),
      db = new ProjectDatabase(factory),
      { p, bytes } = await fixture();
    await db.save(p, bytes, null);
    const raw = await new Promise<IDBDatabase>((resolve) => {
      const r = factory.open("watch-atelier-v1", 1);
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise<void>((resolve) => {
      const t = raw.transaction("assets", "readwrite");
      t.objectStore("assets").put(new Uint8Array([1, 2, 3]), p.assets[0].hash);
      t.oncomplete = () => resolve();
    });
    const damaged = await db.load(p.id);
    expect(damaged.warnings).toHaveLength(1);
    expect(damaged.bytes.size).toBe(0);
    damaged.saved.project.brief = "Still editable";
    await expect(
      db.save(damaged.saved.project, damaged.bytes, 1),
    ).rejects.toThrow(/damaged/);
    expect((await db.load(p.id)).saved.saveVersion).toBe(1);
    expect(
      await exportProject(damaged.saved.project, damaged.bytes, "share", true),
    ).toContain("Still editable");
    await db.save(damaged.saved.project, bytes, 1);
    expect((await db.load(p.id)).warnings).toEqual([]);
    raw.close();
    await db.close();
  });
  it("[M1-09] a valid maximum-size reference round-trips without base64 stack overflow", async () => {
    const bytes = new Uint8Array(LIMITS.assetBytes);
    bytes.set(pixel);
    const view = new DataView(bytes.buffer);
    view.setUint32(4, bytes.length - 8, true);
    bytes.set(new TextEncoder().encode("JUNK"), pixel.length);
    view.setUint32(pixel.length + 4, bytes.length - pixel.length - 8, true);
    expect(rasterHeader(bytes)).toEqual({
      width: 1,
      height: 1,
      mediaType: "image/webp",
    });
    const { p } = await fixture();
    const record = {
      ...p.assets[0],
      hash: await sha256(bytes),
      bytes: bytes.length,
    };
    p.assets = [record];
    p.references[0].assetHash = record.hash;
    const encoded = await exportProject(
      p,
      new Map([[record.hash, bytes]]),
      "backup",
    );
    const restored = await importProject(encoded, false);
    expect(restored.bytes.get(record.hash)?.length).toBe(LIMITS.assetBytes);
    const over = JSON.parse(encoded);
    over.project.assets[0].bytes++;
    await expect(importProject(JSON.stringify(over), false)).rejects.toThrow(
      /invalid/,
    );
  });
  it("[M1-01] real IDB adapter preserves reference scope and supports brief-only", async () => {
    const db = new ProjectDatabase(new IDBFactory());
    const { p, bytes } = await fixture();
    await db.save(p, bytes, null);
    const out = await db.load(p.id);
    expect(out.saved.project).toEqual(p);
    expect(out.bytes).toEqual(bytes);
    const plain = newProject();
    await db.save(plain, new Map(), null);
    expect((await db.list()).length).toBe(2);
    await db.close();
  });
  it("[M1-04] portable semantic text and markers survive remap and continue editing", async () => {
    const p = newProject();
    const text = await exportProject(p, new Map(), "share");
    const imported = await importProject(text, false);
    expect(imported.project.id).not.toBe(p.id);
    expect(
      imported.project.variants[0].design.objects.map((o) => ({
        ...o,
        id: "",
      })),
    ).toEqual(p.variants[0].design.objects.map((o) => ({ ...o, id: "" })));
    const edited = applyProjectCommand(
      imported.project,
      {
        type: "edit",
        variantId: imported.project.variants[0].id,
        edits: [
          {
            kind: "text",
            id: imported.project.variants[0].design.objects[0].id,
            patch: { text: "EDITED" },
          },
        ],
      },
      0,
    );
    expect(edited.project.variants[0].design.objects[0].text).toBe("EDITED");
    const flat = JSON.parse(text);
    flat.project.variants[0].design.objects = ["bitmap"];
    await expect(importProject(JSON.stringify(flat), false)).rejects.toThrow();
  });
  it("[M1-08] malformed, partial, unknown version and deep imports reject with current work intact", async () => {
    const p = newProject();
    p.brief = "Unsaved";
    for (const t of [
      "{",
      "{}",
      JSON.stringify({ version: 99 }),
      "[".repeat(17) + "]".repeat(17),
    ])
      await expect(importProject(t, false)).rejects.toThrow();
    expect(p.brief).toBe("Unsaved");
    expect(boundedJSON('{"literal":"[[["}')).toEqual({ literal: "[[[" });
  });
  it("[M1-09] raster corruption and count limits reject; valid controls pass", async () => {
    expect(rasterHeader(pixel)).toEqual({
      width: 1,
      height: 1,
      mediaType: "image/webp",
    });
    const changed = pixel.slice();
    changed[4] = 0;
    expect(() => rasterHeader(changed)).toThrow();
    expect(() =>
      rasterHeader(new TextEncoder().encode('<svg onload="alert(1)"/>')),
    ).toThrow();
    const { p, bytes } = await fixture();
    const text = await exportProject(p, bytes, "backup");
    const bad = JSON.parse(text);
    bad.assets[0].base64 = "!";
    await expect(importProject(JSON.stringify(bad), false)).rejects.toThrow();
  });
  it("[M1-11] sharing excludes all private names, notes, images and links; opted backup restores", async () => {
    const { p, bytes } = await fixture();
    p.name = "PRIVATE_NAME";
    p.variants[0].name = "PRIVATE_VARIANT";
    const share = await exportProject(p, bytes, "share");
    expect(share).not.toContain("PRIVATE");
    expect(share).not.toContain(p.assets[0].hash);
    expect((await importProject(share, false)).project.references).toEqual([]);
    const backup = await importProject(
      await exportProject(p, bytes, "backup"),
      false,
    );
    expect(backup.project.references[0].notes[0].text).toBe(
      "PRIVATE_SECRET_999",
    );
    expect(backup.bytes).toEqual(bytes);
    expect(backup.project.references[0].variantIds).toEqual([
      backup.project.variants[0].id,
    ]);
  });
  it("[M1-13] abort after asset write rolls back both stores; current work remains exportable", async () => {
    const factory = new IDBFactory(),
      db = new ProjectDatabase(factory);
    const { p, bytes } = await fixture();
    const first = newProject();
    await db.save(first, new Map(), null);
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      const request = original.apply(this, args);
      if (this.name === "assets")
        request.addEventListener("success", () => this.transaction.abort());
      return request;
    };
    try {
      await expect(db.save(p, bytes, null)).rejects.toThrow();
    } finally {
      IDBObjectStore.prototype.put = original;
    }
    expect((await db.list()).map((s) => s.project.id)).toEqual([first.id]);
    expect(await exportProject(p, bytes, "backup")).toContain(
      "PRIVATE_SECRET_999",
    );
    await db.save(p, bytes, null);
    expect((await db.load(p.id)).warnings).toEqual([]);
    await db.close();
  });
  it("[M1-14] missing and corrupted bytes are explicit; share recovery remains available", async () => {
    const { p, bytes } = await fixture();
    await expect(exportProject(p, new Map(), "backup")).rejects.toThrow(
      /missing/,
    );
    const bad = new Map(bytes);
    bad.set(p.assets[0].hash, pixel.slice(0, 8));
    await expect(exportProject(p, bad, "backup")).rejects.toThrow(/hash/);
    expect(await exportProject(p, new Map(), "share")).toContain(
      "watch-atelier",
    );
  });
  it("[M1-15] IDB version check rejects stale writers; independent project copies save", async () => {
    const factory = new IDBFactory(),
      a = new ProjectDatabase(factory),
      b = new ProjectDatabase(factory);
    const p = newProject();
    await a.save(p, new Map(), null);
    const old = await b.load(p.id);
    p.brief = "new";
    await a.save(p, new Map(), 1);
    old.saved.project.brief = "stale";
    await expect(
      b.save(old.saved.project, new Map(), 1),
    ).rejects.toBeInstanceOf(SaveConflict);
    expect((await a.load(p.id)).saved.project.brief).toBe("new");
    await b.save(newProject(), new Map(), null);
    await a.close();
    await b.close();
  });
});
