import { test, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  ResearchDatabase,
  exportPacket,
  importPacket,
} from "../src/build/storage.ts";
import { ResearchJobs } from "../src/build/jobs.ts";
import { researchFixture } from "./fixtures/bi.ts";

test("[BI-09][BI-11] research share strips private evidence; personal backup and import remain unverified without fetching", async () => {
  const p = await researchFixture();
  p.requirements.like =
    p.requirements.avoid =
    p.requirements.destination =
      "PRIVATE_SENTINEL";
  p.requirements.selectedUrls = [
    "https://www.namokimods.com/products/PRIVATE_SENTINEL",
  ];
  p.sources[1].selected = true;
  p.sources[1].title = "PRIVATE_SENTINEL";
  p.run.queries = ["PRIVATE_SENTINEL"];
  expect(exportPacket(p)).not.toContain("PRIVATE_SENTINEL");
  expect(exportPacket(p, true)).toContain("PRIVATE_SENTINEL");
  const imported = importPacket(exportPacket(p, true));
  expect(imported.id).not.toBe(p.id);
  expect(imported.sources.every((s) => s.origin === "imported")).toBe(true);
  expect(imported.run.provider).toBe("imported");
  expect(imported.requirements.like).toBe("PRIVATE_SENTINEL");
});

test("[BI-11] immutable research saves and packet-26 capacity are atomic and never evict existing packets", async () => {
  const factory = new IDBFactory(),
    db = new ResearchDatabase(factory),
    other = new ResearchDatabase(factory);
  const p = await researchFixture();
  const results = await Promise.allSettled([db.save(p), other.save(p)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await db.list()).toHaveLength(1);
  for (let n = 1; n < 25; n++) await db.save({ ...p, id: crypto.randomUUID() });
  await expect(db.save({ ...p, id: crypto.randomUUID() })).rejects.toThrow(
    "25 packets",
  );
  expect(await other.list()).toHaveLength(25);
  await db.remove(p.id);
  expect(await other.list()).toHaveLength(24);
  await db.save({ ...p, id: crypto.randomUUID() });
  expect(await other.list()).toHaveLength(25);
  await db.close();
  await other.close();
});

test("[BI-11] research storage absence and malformed records preserve healthy saved packets", async () => {
  const factory = new IDBFactory(),
    db = new ResearchDatabase(factory),
    p = await researchFixture();
  await expect(new ResearchDatabase(undefined).save(p)).rejects.toThrow(
    "unavailable",
  );
  await db.save(p);
  const connection = await new Promise<IDBDatabase>((resolve) => {
    const r = factory.open("watch-atelier-research-v1");
    r.onsuccess = () => resolve(r.result);
  });
  await new Promise<void>((resolve) => {
    const tx = connection.transaction("packets", "readwrite");
    tx.objectStore("packets").add({ id: crypto.randomUUID(), bad: true });
    tx.oncomplete = () => resolve();
  });
  expect((await db.list()).map((x) => x.id)).toEqual([p.id]);
  expect(db.warnings.join()).toContain("invalid research records");
  connection.close();
  await db.close();
});

test("[BI-08][BI-10] cancelled/late research cannot reopen cleared selection or overwrite a newer run", async () => {
  const p = await researchFixture(),
    jobs = new ResearchJobs();
  let release!: () => void;
  const old = jobs.start(p.snapshot, p.requirements, true, async (request) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return {
      ...p,
      run: { ...p.run, id: request.id, inputHash: request.inputHash },
    };
  });
  while (!release) await new Promise((resolve) => setTimeout(resolve, 0));
  jobs.cancel();
  const fresh = await jobs.start(
    p.snapshot,
    p.requirements,
    true,
    async (request) => ({
      ...p,
      run: { ...p.run, id: request.id, inputHash: request.inputHash },
    }),
  );
  release();
  expect(await old).toBeNull();
  expect(fresh?.candidates).toHaveLength(2);
  await expect(
    jobs.start(p.snapshot, p.requirements, false, async () => p),
  ).rejects.toThrow("Confirm");
  await expect(
    jobs.start(p.snapshot, p.requirements, true, async () => p),
  ).rejects.toThrow("another input");
  await expect(
    jobs.start(p.snapshot, p.requirements, true, async () => {
      throw new Error("Provider unavailable");
    }),
  ).rejects.toThrow("Provider unavailable");
});
