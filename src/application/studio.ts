import {
  applyProjectCommand,
  emptyHistory,
  type Command,
  type History,
} from "../domain/commands";
import { newProject, newId, remapProject, type Project } from "../domain/model";
import {
  ProjectDatabase,
  SaveConflict,
  type SavedProject,
} from "../storage/database";
import { ingestReference, type AssetBytes } from "../storage/assets";
import { exportProject, importProject } from "../storage/transfer";

export interface StudioState {
  project: Project;
  activeId: string;
  history: History;
  saveState: "unsaved" | "saving" | "saved" | "error" | "conflict";
  message: string;
  busy: boolean;
  importing: boolean;
  projects: SavedProject[];
  assets: AssetBytes;
  initialized: boolean;
}
function retainedAssets(
  project: Project,
  history: History,
  bytes: AssetBytes,
): AssetBytes {
  const hashes = new Set(
    [project, ...history.past, ...history.future].flatMap((p) =>
      p.assets.map((a) => a.hash),
    ),
  );
  return new Map([...bytes].filter(([hash]) => hashes.has(hash)));
}
export class Studio {
  private state: StudioState;
  private listeners = new Set<() => void>();
  private version: number | null = null;
  private savedRevision = -1;
  private savedProjectId = "";
  private queue: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private channel?: BroadcastChannel;
  private importGeneration = 0;
  private initialization?: Promise<void>;
  constructor(
    private db = new ProjectDatabase(),
    private channelEnabled = true,
  ) {
    const project = newProject();
    this.state = {
      project,
      activeId: project.variants[0].id,
      history: emptyHistory(),
      saveState: "unsaved",
      message: "",
      busy: true,
      importing: false,
      projects: [],
      assets: new Map(),
      initialized: false,
    };
    this.connectNotifications();
  }
  private connectNotifications() {
    if (
      this.channelEnabled &&
      !this.channel &&
      typeof BroadcastChannel !== "undefined"
    ) {
      this.channel = new BroadcastChannel("watch-atelier-saves");
      this.channel.onmessage = (e) => {
        if (
          e.data?.id === this.state.project.id &&
          e.data?.version !== this.version
        )
          this.patch({
            message:
              "Another tab saved this project. Your next save will check for conflicts.",
          });
      };
    }
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private patch(value: Partial<StudioState>) {
    this.state = { ...this.state, ...value };
    this.listeners.forEach((l) => l());
  }
  private fail(error: unknown) {
    this.patch({
      message:
        error instanceof Error
          ? error.message
          : "The operation could not complete.",
      saveState:
        error instanceof SaveConflict ? "conflict" : this.state.saveState,
    });
  }
  report(message: string) {
    this.patch({ message });
  }
  initialize() {
    this.connectNotifications();
    return (this.initialization ??= this.initializeOnce());
  }
  private async initializeOnce() {
    try {
      const projects = await this.db.list();
      this.patch({ projects });
      let warnings = [...this.db.readWarnings];
      if (projects.length) {
        const data = await this.db.load(projects[0].project.id);
        this.activate(data.saved.project, data.bytes, data.saved.saveVersion);
        warnings = [...warnings, ...data.warnings];
      }
      if (warnings.length) this.patch({ message: warnings.join(" ") });
    } catch (e) {
      this.fail(e);
    } finally {
      this.patch({ initialized: true, busy: false });
    }
  }
  select(id: string) {
    if (this.state.project.variants.some((v) => v.id === id))
      this.patch({ activeId: id });
  }
  dispatch(command: Command) {
    if (this.state.busy) return false;
    try {
      const result = applyProjectCommand(
        this.state.project,
        command,
        this.state.project.revision,
        this.state.history,
      );
      if (!result.changed) return false;
      const id =
        command.type === "duplicate"
          ? result.project.variants.at(-1)!.id
          : result.project.variants.some((v) => v.id === this.state.activeId)
            ? this.state.activeId
            : result.project.variants[0].id;
      this.patch({
        project: result.project,
        history: result.history,
        assets: retainedAssets(
          result.project,
          result.history,
          this.state.assets,
        ),
        activeId: id,
        saveState: this.state.saveState === "conflict" ? "conflict" : "unsaved",
        message: "",
      });
      this.schedule();
      return true;
    } catch (e) {
      this.fail(e);
      return false;
    }
  }
  private schedule() {
    clearTimeout(this.timer);
    if (this.state.saveState === "conflict") return;
    this.timer = setTimeout(() => void this.save().catch(() => undefined), 750);
  }
  async save() {
    if (!this.state.initialized || this.state.busy) return;
    return this.persistCurrent();
  }
  private async persistCurrent() {
    clearTimeout(this.timer);
    const job = this.queue
      .catch(() => undefined)
      .then(async () => {
        const captured = this.state.project,
          assets = this.state.assets;
        if (
          this.savedProjectId === captured.id &&
          this.savedRevision === captured.revision &&
          this.version !== null
        )
          return;
        this.patch({ saveState: "saving" });
        try {
          const saved = await this.db.save(captured, assets, this.version);
          if (this.state.project.id !== captured.id) return;
          this.version = saved.saveVersion;
          this.savedProjectId = captured.id;
          this.savedRevision = captured.revision;
          this.channel?.postMessage({ id: captured.id, version: this.version });
          this.patch({
            saveState:
              this.state.project.revision === captured.revision
                ? "saved"
                : "unsaved",
            projects: [
              saved,
              ...this.state.projects.filter(
                (s) => s.project.id !== captured.id,
              ),
            ],
          });
        } catch (e) {
          this.patch({
            saveState: e instanceof SaveConflict ? "conflict" : "error",
          });
          this.fail(e);
          throw e;
        }
      });
    this.queue = job;
    return job;
  }
  private activate(
    project: Project,
    assets: AssetBytes,
    version: number | null,
    saved = true,
  ) {
    this.version = version;
    this.savedProjectId = project.id;
    this.savedRevision = saved ? project.revision : -1;
    this.patch({
      project,
      assets: retainedAssets(project, emptyHistory(), assets),
      history: emptyHistory(),
      activeId: project.variants[0].id,
      saveState: saved ? "saved" : "unsaved",
      message: "",
    });
  }
  async load(id: string, preserveCurrent = true) {
    if (this.state.busy) return;
    this.patch({ busy: true });
    clearTimeout(this.timer);
    try {
      await this.queue.catch(() => undefined);
      if (preserveCurrent) await this.persistCurrent();
      const data = await this.db.load(id);
      this.activate(data.saved.project, data.bytes, data.saved.saveVersion);
      if (data.warnings.length)
        this.patch({ message: data.warnings.join(" ") });
    } catch (e) {
      this.fail(e);
    } finally {
      this.patch({ busy: false });
    }
  }
  async reloadDiscarding() {
    const id = this.state.project.id;
    await this.load(id, false);
  }
  async saveCopy() {
    if (this.state.busy) return;
    this.patch({ busy: true });
    clearTimeout(this.timer);
    try {
      await this.queue.catch(() => undefined);
      const copy = remapProject(this.state.project);
      const saved = await this.db.save(copy, this.state.assets, null);
      this.activate(copy, this.state.assets, saved.saveVersion);
      this.patch({
        projects: [saved, ...this.state.projects],
        message: "Saved as an independent project copy.",
      });
    } catch (e) {
      this.fail(e);
    } finally {
      this.patch({ busy: false });
    }
  }
  async createProject() {
    if (this.state.busy) return;
    this.patch({ busy: true });
    clearTimeout(this.timer);
    try {
      await this.persistCurrent();
      const p = newProject(),
        saved = await this.db.save(p, new Map(), null);
      this.activate(p, new Map(), saved.saveVersion);
      this.patch({ projects: [saved, ...this.state.projects] });
    } catch (e) {
      this.fail(e);
    } finally {
      this.patch({ busy: false });
    }
  }
  async addReference(file: File) {
    if (this.state.busy) return;
    const projectId = this.state.project.id,
      variantId = this.state.activeId;
    this.patch({ busy: true });
    try {
      const a = await ingestReference(file);
      if (this.state.project.id !== projectId)
        throw new Error("Project changed while preparing the image.");
      const assets = new Map(this.state.assets);
      assets.set(a.record.hash, a.bytes);
      this.patch({ busy: false, assets });
      this.dispatch({
        type: "reference",
        asset: a.record,
        reference: {
          id: newId(),
          assetHash: a.record.hash,
          attribution: "",
          variantIds: [variantId],
          notes: [
            { id: newId(), kind: "like", text: "" },
            { id: newId(), kind: "avoid", text: "" },
          ],
        },
      });
    } catch (e) {
      this.fail(e);
    } finally {
      this.patch({
        busy: false,
        assets: retainedAssets(
          this.state.project,
          this.state.history,
          this.state.assets,
        ),
      });
    }
  }
  cancelImport() {
    if (!this.state.importing) return;
    ++this.importGeneration;
    this.patch({
      importing: false,
      message: "Import canceled. Your current work is unchanged.",
    });
  }
  async importFile(file: File) {
    if (file.size > 24 * 1024 ** 2) {
      this.report("Project files must be 24 MiB or less.");
      return;
    }
    if (this.state.busy || this.state.importing) return;
    const generation = ++this.importGeneration;
    let committing = false;
    this.patch({ importing: true });
    try {
      const source = await file.text();
      if (generation !== this.importGeneration) return;
      const staged = await importProject(source);
      if (generation !== this.importGeneration) return;
      if (this.state.busy)
        throw new Error("Finish the current operation before importing.");
      committing = true;
      this.patch({ busy: true, importing: false });
      clearTimeout(this.timer);
      await this.queue.catch(() => undefined);
      const current = this.state.project;
      // A validated backup can restore missing content-addressed resources in the
      // current project too. Do not change session state until both saves commit.
      const recoveredAssets = new Map(this.state.assets);
      for (const record of current.assets) {
        const restored = staged.bytes.get(record.hash);
        if (!recoveredAssets.has(record.hash) && restored)
          recoveredAssets.set(record.hash, restored);
      }
      const saves = await this.db.saveMany([
        {
          project: current,
          bytes: recoveredAssets,
          expectedVersion: this.version,
        },
        { project: staged.project, bytes: staged.bytes, expectedVersion: null },
      ]);
      this.channel?.postMessage({
        id: current.id,
        version: saves[0].saveVersion,
      });
      this.activate(staged.project, staged.bytes, saves[1].saveVersion);
      this.patch({
        projects: [
          saves[1],
          saves[0],
          ...this.state.projects.filter((p) => p.project.id !== current.id),
        ],
        message:
          "Imported as a new editable project. Your previous project is saved.",
      });
    } catch (e) {
      if (generation === this.importGeneration) this.fail(e);
    } finally {
      if (generation === this.importGeneration)
        this.patch({
          importing: false,
          ...(committing ? { busy: false } : {}),
        });
    }
  }
  async export(kind: "share" | "backup", includeBrief = false) {
    return exportProject(
      this.state.project,
      this.state.assets,
      kind,
      includeBrief,
    );
  }
  dispose() {
    ++this.importGeneration;
    clearTimeout(this.timer);
    this.channel?.close();
    this.channel = undefined;
    void this.db.close().catch(() => undefined);
  }
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
