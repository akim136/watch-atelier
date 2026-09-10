import { z } from "zod";
import { projectSchema, type Project } from "../domain/model";
import { validateAsset, type AssetBytes } from "./assets";

const savedSchema = z.strictObject({
  project: projectSchema,
  saveVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  savedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export type SavedProject = z.infer<typeof savedSchema>;
export class SaveConflict extends Error {
  constructor() {
    super(
      "This project was saved in another tab. Save a copy or reload the latest version.",
    );
  }
}
export class ProjectDatabase {
  private connection?: Promise<IDBDatabase>;
  private warnings: string[] = [];
  get readWarnings(): readonly string[] {
    return this.warnings;
  }
  constructor(
    private factory: IDBFactory | undefined = globalThis.indexedDB,
    private name = "watch-atelier-v1",
  ) {}
  private open() {
    if (!this.factory)
      return Promise.reject(
        new Error(
          "Local storage is unavailable. You can still export your design.",
        ),
      );
    return (this.connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory!.open(this.name, 1);
      let rejected = false;
      request.onupgradeneeded = () => {
        request.result.createObjectStore("projects", { keyPath: "project.id" });
        request.result.createObjectStore("assets");
      };
      request.onerror = () => {
        rejected = true;
        this.connection = undefined;
        reject(
          new Error(
            "Local storage is unavailable. You can still export your design.",
          ),
        );
      };
      request.onblocked = () => {
        rejected = true;
        this.connection = undefined;
        reject(new Error("Close older Watch Atelier tabs to open storage."));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (rejected) {
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
  async list(): Promise<SavedProject[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db
        .transaction("projects")
        .objectStore("projects")
        .getAll();
      request.onsuccess = () => {
        const projects: SavedProject[] = [];
        let invalid = 0;
        for (const raw of request.result) {
          const parsed = savedSchema.safeParse(raw);
          if (parsed.success) projects.push(parsed.data);
          else invalid++;
        }
        this.warnings = invalid
          ? [
              `${invalid} saved project record(s) are invalid and were not opened. Healthy projects remain available; no stored records were deleted. Restore a personal backup for damaged projects.`,
            ]
          : [];
        resolve(projects.sort((a, b) => b.savedAt - a.savedAt));
      };
      request.onerror = () =>
        reject(new Error("Could not read saved projects."));
    });
  }
  async load(
    id: string,
  ): Promise<{ saved: SavedProject; bytes: AssetBytes; warnings: string[] }> {
    const db = await this.open();
    const raw = await new Promise<unknown>((resolve, reject) => {
      const request = db
        .transaction("projects")
        .objectStore("projects")
        .get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Could not read this project."));
    });
    if (!raw) throw new Error("Saved project was not found.");
    const parsed = savedSchema.safeParse(raw);
    if (!parsed.success)
      throw new Error(
        "This saved project is invalid. Existing storage has been preserved; restore a personal backup.",
      );
    const saved = parsed.data,
      bytes: AssetBytes = new Map(),
      warnings: string[] = [];
    for (const record of saved.project.assets) {
      try {
        const data = await new Promise<Uint8Array<ArrayBuffer>>(
          (resolve, reject) => {
            const request = db
              .transaction("assets")
              .objectStore("assets")
              .get(record.hash);
            request.onsuccess = () =>
              request.result
                ? resolve(new Uint8Array(request.result))
                : reject(new Error("Missing asset"));
            request.onerror = () => reject(new Error("Asset read failed"));
          },
        );
        await validateAsset(record, data);
        bytes.set(record.hash, data);
      } catch {
        warnings.push(
          "A reference image is missing or damaged. Restore a personal backup or remove that reference.",
        );
      }
    }
    return { saved, bytes, warnings };
  }
  async save(
    project: Project,
    bytes: AssetBytes,
    expectedVersion: number | null,
  ) {
    return (await this.saveMany([{ project, bytes, expectedVersion }]))[0];
  }
  async saveMany(
    entries: {
      project: Project;
      bytes: AssetBytes;
      expectedVersion: number | null;
    }[],
  ): Promise<SavedProject[]> {
    if (
      !entries.length ||
      entries.length > 2 ||
      new Set(entries.map((e) => e.project.id)).size !== entries.length
    )
      throw new Error("Invalid save transaction.");
    const snapshots = entries.map((e) => ({
      ...e,
      project: projectSchema.parse(e.project),
    }));
    // Validate before opening the transaction. Never await hashing inside a live IDB transaction.
    for (const entry of snapshots)
      for (const asset of entry.project.assets) {
        const bytes = entry.bytes.get(asset.hash);
        if (!bytes)
          throw new Error(
            "A reference is missing or damaged. Export a shared design or restore/remove the reference before saving.",
          );
        await validateAsset(asset, bytes);
      }
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["projects", "assets"], "readwrite");
      const projects = transaction.objectStore("projects"),
        assets = transaction.objectStore("assets");
      const saved: SavedProject[] = new Array(snapshots.length);
      let error: Error | undefined;
      transaction.onabort = () =>
        reject(
          error ??
            new Error(
              "The local save failed. Your edits remain available for export.",
            ),
        );
      transaction.onerror = () => {
        error ??= new Error(
          "Local storage rejected the save. Your edits remain available for export.",
        );
      };
      transaction.oncomplete = () => resolve(saved);
      snapshots.forEach((entry, index) => {
        const read = projects.get(entry.project.id);
        read.onsuccess = () => {
          const old = read.result as SavedProject | undefined;
          if ((old?.saveVersion ?? null) !== entry.expectedVersion) {
            error = new SaveConflict();
            transaction.abort();
            return;
          }
          for (const record of entry.project.assets)
            assets.put(entry.bytes.get(record.hash)!, record.hash);
          const value = {
            project: entry.project,
            saveVersion: (old?.saveVersion ?? 0) + 1,
            savedAt: Date.now(),
          };
          saved[index] = value;
          projects.put(value);
        };
      });
    });
  }
  async close() {
    const closing = this.connection;
    this.connection = undefined;
    if (closing) (await closing).close();
  }
}
