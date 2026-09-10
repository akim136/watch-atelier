import { BI_LIMITS, boundedJSON, type Packet } from "./model.ts";
import { validatePacket } from "./evaluate.ts";

export function exportPacket(packet: Packet, personal = false) {
  const p = structuredClone(validatePacket(packet));
  if (!personal) {
    p.shared = true;
    p.snapshot.referenceIds = [];
    p.requirements.like =
      p.requirements.avoid =
      p.requirements.finish =
      p.requirements.dialLayout =
      p.requirements.destination =
        "";
    p.requirements.budgetMinor = null;
    p.requirements.selectedUrls = [];
    for (const target of [
      p.requirements.diameter,
      p.requirements.thickness,
      p.requirements.lugWidth,
    ])
      target.evidence = "";
    p.visualSuggestions = [];
    p.run.queries = [];
    const privateSources = new Set(
      p.sources
        .filter((s) => s.selected || s.origin === "manual")
        .map((s) => s.id),
    );
    p.sources = p.sources.filter((s) => !privateSources.has(s.id));
    p.candidates = p.candidates.filter((c) => !privateSources.has(c.sourceId));
    p.claims = p.claims.filter(
      (c) =>
        !privateSources.has(c.sourceId) &&
        p.candidates.some((x) => x.id === c.subject),
    );
    for (const c of p.candidates)
      c.claimIds = c.claimIds.filter((id) => p.claims.some((x) => x.id === id));
    p.offers = p.offers.filter(
      (o) =>
        !privateSources.has(o.sourceId) &&
        p.candidates.some((c) => c.id === o.candidateId),
    );
    p.guides = p.guides.filter((g) => !privateSources.has(g.sourceId));
    p.owned = [];
    if (
      p.selected &&
      (!p.candidates.some((c) => c.id === p.selected!.caseId) ||
        !p.candidates.some((c) => c.id === p.selected!.movementId))
    )
      p.selected = null;
    // Failure messages are provider metadata, but private backups alone retain them.
    p.run.failures = [];
  }
  const text = JSON.stringify(validatePacket(p), null, 2);
  boundedJSON(text);
  return text;
}
export function importPacket(text: string): Packet {
  // Parse shape first, then downgrade imported evidence before evaluating any claims.
  const p = validatePacket(boundedJSON(text));
  p.id = crypto.randomUUID();
  p.createdAt = new Date().toISOString();
  p.run.provider = "imported";
  for (const s of p.sources) s.origin = "imported";
  return validatePacket(p);
}
export class ResearchDatabase {
  private connection?: Promise<IDBDatabase>;
  warnings: string[] = [];
  constructor(
    private factory: IDBFactory | undefined = globalThis.indexedDB,
    private name = "watch-atelier-research-v1",
  ) {}
  private open(): Promise<IDBDatabase> {
    if (!this.factory)
      return Promise.reject(
        new Error(
          "Research storage unavailable. Export the packet to retain it.",
        ),
      );
    return (this.connection ??= new Promise((resolve, reject) => {
      const request = this.factory!.open(this.name, 1);
      let failed = false;
      const failure = () => {
        failed = true;
        this.connection = undefined;
        reject(
          new Error(
            "Research storage unavailable. Existing watch storage is unchanged.",
          ),
        );
      };
      request.onupgradeneeded = () =>
        request.result.createObjectStore("packets", { keyPath: "id" });
      request.onerror = failure;
      request.onblocked = failure;
      request.onsuccess = () => {
        const db = request.result;
        if (failed) {
          db.close();
          return;
        }
        db.onversionchange = () => {
          db.close();
          this.connection = undefined;
        };
        resolve(db);
      };
    }));
  }
  async list() {
    const db = await this.open();
    return new Promise<Packet[]>((resolve, reject) => {
      const r = db.transaction("packets").objectStore("packets").getAll();
      r.onerror = () => reject(new Error("Could not read saved research."));
      r.onsuccess = () => {
        const healthy: Packet[] = [];
        let damaged = 0;
        for (const raw of r.result) {
          try {
            healthy.push(validatePacket(raw));
          } catch {
            damaged++;
          }
        }
        this.warnings = damaged
          ? [
              damaged +
                " invalid research records were not opened. No records were deleted.",
            ]
          : [];
        resolve(healthy.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      };
    });
  }
  async save(packet: Packet) {
    const p = validatePacket(packet);
    boundedJSON(JSON.stringify(p));
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("packets", "readwrite"),
        store = tx.objectStore("packets");
      let reason =
        "Could not save research. Export the packet; existing records are preserved.";
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error(reason));
      tx.onerror = () => {
        /* onabort owns the result */
      };
      const count = store.count();
      count.onsuccess = () => {
        if (count.result >= BI_LIMITS.packets) {
          reason =
            "Research storage holds 25 packets. Export and explicitly delete a packet before saving another.";
          tx.abort();
          return;
        }
        const add = store.add(p);
        add.onerror = () => {
          reason =
            "This packet is already saved. Save an independent packet revision; no existing record was overwritten.";
        };
      };
    });
  }
  async remove(id: string) {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("packets", "readwrite");
      tx.objectStore("packets").delete(id);
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(new Error("Could not delete this research packet."));
    });
  }
  async close() {
    (await this.connection)?.close();
    this.connection = undefined;
  }
}
