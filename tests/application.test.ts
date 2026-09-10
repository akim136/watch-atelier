import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { Studio } from "../src/application/studio";
import { ProjectDatabase } from "../src/storage/database";
import { newProject, newId } from "../src/domain/model";
import { sha256 } from "../src/storage/assets";
import { exportProject, importProject } from "../src/storage/transfer";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const studios: Studio[] = [];
afterEach(() => {
  studios.splice(0).forEach((s) => s.dispose());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function setup(factory = new IDBFactory()) {
  const db = new ProjectDatabase(factory);
  const studio = new Studio(db, false);
  studios.push(studio);
  await studio.initialize();
  return { db, studio };
}
async function source() {
  return new File(
    [await exportProject(newProject(), new Map(), "share")],
    "design.json",
    { type: "application/json" },
  );
}

describe("application transaction orchestration", () => {
  it("[M1-08][M1-13][M1-14] backup restores matching missing bytes atomically without losing current edits", async () => {
    const factory = new IDBFactory(),
      db = new ProjectDatabase(factory),
      p = newProject();
    const bytes = Uint8Array.from(
      atob("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA"),
      (c) => c.charCodeAt(0),
    );
    const hash = await sha256(bytes);
    p.assets = [
      {
        hash,
        mediaType: "image/webp",
        width: 1,
        height: 1,
        bytes: bytes.length,
        source: "user-local-unverified",
        recipe: "reference-preview-v1",
      },
    ];
    p.references = [
      {
        id: newId(),
        assetHash: hash,
        attribution: "LOCAL NOTE",
        variantIds: [p.variants[0].id],
        notes: [],
      },
    ];
    const backup = new File(
      [await exportProject(p, new Map([[hash, bytes]]), "backup")],
      "recovery.json",
    );
    await db.save(p, new Map([[hash, bytes]]), null);
    const raw = await new Promise<IDBDatabase>((resolve) => {
      const r = factory.open("watch-atelier-v1", 1);
      r.onsuccess = () => resolve(r.result);
    });
    try {
      await new Promise<void>((resolve) => {
        const tx = raw.transaction("assets", "readwrite");
        tx.objectStore("assets").put(new Uint8Array([1, 2, 3]), hash);
        tx.oncomplete = () => resolve();
      });
      const { studio } = await setup(factory);
      expect(studio.getSnapshot().assets.size).toBe(0);
      expect(studio.getSnapshot().message).toMatch(/missing or damaged/);
      studio.dispatch({ type: "brief", value: "Unsaved recovery edits" });
      const before = studio.getSnapshot();
      await studio.importFile(await source()); // unrelated share cannot fabricate missing bytes
      expect(studio.getSnapshot().project).toBe(before.project);
      expect(await db.list()).toHaveLength(1);
      // Native image decoding is covered in Chrome; this isolates application/IDB recovery.
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn(async () => ({ width: 1, height: 1, close() {} })),
      );
      const put = IDBObjectStore.prototype.put;
      const fault = vi
        .spyOn(IDBObjectStore.prototype, "put")
        .mockImplementation(function (this: IDBObjectStore, ...args) {
          const r = put.apply(this, args);
          r.addEventListener("success", () => this.transaction.abort());
          return r;
        });
      await studio.importFile(backup);
      expect(studio.getSnapshot().project).toBe(before.project);
      expect(studio.getSnapshot().history).toBe(before.history);
      expect(studio.getSnapshot().assets.size).toBe(0);
      expect((await db.load(p.id)).warnings).toHaveLength(1);
      expect(await db.list()).toHaveLength(1);
      fault.mockRestore();
      await studio.importFile(backup);
      expect(studio.getSnapshot().project.id).not.toBe(p.id);
      expect(studio.getSnapshot().assets.get(hash)).toEqual(bytes);
      expect((await db.load(p.id)).saved.project.brief).toBe(
        "Unsaved recovery edits",
      );
      expect((await db.load(p.id)).warnings).toEqual([]);
      expect((await db.load(studio.getSnapshot().project.id)).warnings).toEqual(
        [],
      );
      expect(await db.list()).toHaveLength(2);
    } finally {
      raw.close();
      await db.close();
    }
  });
  it("[M1-13] remounting a studio preserves unsaved edits and reopens storage safely", async () => {
    const { db, studio } = await setup();
    await studio.save();
    studio.dispatch({
      type: "brief",
      value: "Keep through development refresh",
    });
    studio.dispose();
    await studio.initialize();
    expect(studio.getSnapshot().project.brief).toBe(
      "Keep through development refresh",
    );
    await studio.save();
    expect(
      (await db.load(studio.getSnapshot().project.id)).saved.project.brief,
    ).toBe("Keep through development refresh");
    const closing = db.close(),
      listing = db.list();
    await closing;
    expect(await listing).toHaveLength(1);
  });
  it("[M1-13] keyboard save during copy cannot acknowledge the wrong project or skip its next edit", async () => {
    const { db, studio } = await setup();
    await studio.save();
    studio.dispatch({ type: "brief", value: "Original unsaved edit" });
    const entered = deferred<void>(),
      release = deferred<void>(),
      realSave = db.save.bind(db);
    const spy = vi.spyOn(db, "save").mockImplementationOnce(async (...args) => {
      entered.resolve();
      await release.promise;
      return realSave(...args);
    });
    const copying = studio.saveCopy();
    await entered.promise;
    await studio.save();
    expect(spy).toHaveBeenCalledTimes(1);
    release.resolve();
    await copying;
    studio.dispatch({ type: "brief", value: "NEW COPY EDIT" });
    await studio.save();
    expect(
      (await db.load(studio.getSnapshot().project.id)).saved.project.brief,
    ).toBe("NEW COPY EDIT");
    expect(studio.getSnapshot().saveState).toBe("saved");
  });
  it("[M1-13] save acknowledgement R cannot mark accepted R+1 saved", async () => {
    const { db, studio } = await setup();
    studio.dispatch({ type: "brief", value: "R1" });
    const entered = deferred<void>(),
      release = deferred<void>(),
      realSave = db.save.bind(db);
    vi.spyOn(db, "save").mockImplementationOnce(async (...args) => {
      entered.resolve();
      await release.promise;
      return realSave(...args);
    });
    const pending = studio.save();
    await entered.promise;
    studio.dispatch({ type: "brief", value: "R2" });
    release.resolve();
    await pending;
    expect(studio.getSnapshot().saveState).toBe("unsaved");
    expect(
      (await db.load(studio.getSnapshot().project.id)).saved.project.brief,
    ).toBe("R1");
    await studio.save();
    expect(studio.getSnapshot().saveState).toBe("saved");
    expect(
      (await db.load(studio.getSnapshot().project.id)).saved.project.brief,
    ).toBe("R2");
  });
  it("[M1-08] delayed import saves latest intervening edits atomically before switching", async () => {
    const { db, studio } = await setup();
    const before = studio.getSnapshot().project.id;
    const file = await source(),
      release = deferred<string>(),
      text = await file.text();
    vi.spyOn(file, "text").mockReturnValue(release.promise);
    const pending = studio.importFile(file);
    expect(studio.getSnapshot().importing).toBe(true);
    studio.dispatch({ type: "brief", value: "Typed during validation" });
    release.resolve(text);
    await pending;
    expect(studio.getSnapshot().project.id).not.toBe(before);
    expect((await db.load(before)).saved.project.brief).toBe(
      "Typed during validation",
    );
    expect((await db.list()).length).toBe(2);
  });
  it("[M1-08] canceled and malformed imports preserve current work and history", async () => {
    const { studio, db } = await setup();
    studio.dispatch({ type: "brief", value: "Unsaved notes" });
    const before = studio.getSnapshot(),
      file = await source(),
      release = deferred<string>(),
      text = await file.text();
    vi.spyOn(file, "text").mockReturnValue(release.promise);
    const pending = studio.importFile(file);
    studio.cancelImport();
    release.resolve(text);
    await pending;
    expect(studio.getSnapshot().project).toBe(before.project);
    expect(studio.getSnapshot().history).toBe(before.history);
    await studio.importFile(new File(['{"version":99}'], "invalid.json"));
    expect(studio.getSnapshot().project).toBe(before.project);
    expect(studio.getSnapshot().history).toBe(before.history);
    expect(studio.getSnapshot().message).toMatch(/Unsupported/);
    expect(await db.list()).toEqual([]);
  });
  it("[M1-08] canceled old import cannot unlock another import final commit", async () => {
    const { studio, db } = await setup(),
      old = await source(),
      releaseOld = deferred<string>();
    vi.spyOn(old, "text").mockReturnValue(releaseOld.promise);
    const canceled = studio.importFile(old);
    studio.cancelImport();
    const entered = deferred<void>(),
      releaseNew = deferred<void>(),
      real = db.saveMany.bind(db);
    vi.spyOn(db, "saveMany").mockImplementationOnce(async (...args) => {
      entered.resolve();
      await releaseNew.promise;
      return real(...args);
    });
    const current = studio.importFile(await source());
    await entered.promise;
    releaseOld.resolve("{}");
    await canceled;
    expect(studio.getSnapshot().busy).toBe(true);
    expect(studio.dispatch({ type: "brief", value: "Must not leak" })).toBe(
      false,
    );
    releaseNew.resolve();
    await current;
    expect(studio.getSnapshot().busy).toBe(false);
  });
  it("[M1-13] failed first save and import transaction keep backup recovery and subsequent save", async () => {
    const { studio, db } = await setup();
    studio.dispatch({ type: "brief", value: "Recover me" });
    const prior = studio.getSnapshot(),
      original = IDBObjectStore.prototype.put;
    const fault = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (this: IDBObjectStore, ...args) {
        const request = original.apply(this, args);
        request.addEventListener("success", () => this.transaction.abort());
        return request;
      });
    await expect(studio.save()).rejects.toThrow();
    expect(studio.getSnapshot().saveState).toBe("error");
    expect(
      (await importProject(await studio.export("backup"), false)).project.brief,
    ).toBe("Recover me");
    await studio.importFile(await source());
    expect(studio.getSnapshot().project).toBe(prior.project);
    expect(studio.getSnapshot().history).toBe(prior.history);
    expect(await db.list()).toEqual([]);
    fault.mockRestore();
    await studio.save();
    expect(studio.getSnapshot().saveState).toBe("saved");
  });
  it("[M1-15] stale import commits neither project and conflict copy preserves stale edits", async () => {
    const factory = new IDBFactory(),
      a = await setup(factory);
    await a.studio.save();
    const b = await setup(factory);
    a.studio.dispatch({ type: "brief", value: "Latest in A" });
    await a.studio.save();
    b.studio.dispatch({ type: "brief", value: "My edits in B" });
    const before = b.studio.getSnapshot();
    await b.studio.importFile(await source());
    expect(b.studio.getSnapshot().saveState).toBe("conflict");
    expect(b.studio.getSnapshot().project).toBe(before.project);
    expect(b.studio.getSnapshot().history).toBe(before.history);
    expect((await b.db.list()).length).toBe(1);
    await b.studio.saveCopy();
    expect(b.studio.getSnapshot().project.id).not.toBe(before.project.id);
    expect(b.studio.getSnapshot().project.brief).toBe("My edits in B");
    expect((await a.db.load(before.project.id)).saved.project.brief).toBe(
      "Latest in A",
    );
  });
  it("[M1-13] opening storage cannot overwrite an early accepted edit", async () => {
    const db = new ProjectDatabase(new IDBFactory()),
      release = deferred<void>(),
      real = db.list.bind(db);
    vi.spyOn(db, "list").mockImplementationOnce(async () => {
      await release.promise;
      return real();
    });
    const studio = new Studio(db, false);
    studios.push(studio);
    const pending = studio.initialize();
    expect(
      studio.dispatch({ type: "brief", value: "Not accepted while opening" }),
    ).toBe(false);
    release.resolve();
    await pending;
    expect(studio.dispatch({ type: "brief", value: "Accepted now" })).toBe(
      true,
    );
  });
});
