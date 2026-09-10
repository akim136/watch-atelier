import { useEffect, useState, useSyncExternalStore, useRef } from "react";
import { Studio, download } from "../application/studio";
import { type Lock, type Reference } from "../domain/model";
import type { Edit } from "../domain/commands";
import { Viewport } from "./Viewport";
import { BuildWorkspace } from "./BuildWorkspace";
import {
  exportPNG,
  presets,
  sameCamera,
  type Preset,
  type CameraState,
} from "../render/viewport";

const colors = [
  "#ece6d8",
  "#173d41",
  "#1d2630",
  "#704037",
  "#d2b48c",
  "#788a84",
];
function Field({
  label,
  value,
  onCommit,
  type = "text",
  min,
  max,
  step,
  maxLength,
}: {
  label: string;
  value: string | number;
  onCommit: (value: string) => void;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  const canceled = useRef(false);
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={draft}
        min={min}
        max={max}
        step={step}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (!canceled.current && draft !== String(value)) onCommit(draft);
          canceled.current = false;
          setDraft(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            canceled.current = true;
            setDraft(String(value));
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
function ReferenceCard({
  reference,
  studio,
}: {
  reference: Reference;
  studio: Studio;
}) {
  const state = studio.getSnapshot(),
    record = state.project.assets.find((a) => a.hash === reference.assetHash)!,
    bytes = state.assets.get(reference.assetHash);
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!bytes) {
      setUrl("");
      return;
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: "image/webp" }));
    setUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [bytes]);
  const update = (r: Reference) =>
    studio.dispatch({ type: "reference", reference: r, asset: record });
  return (
    <article className="reference-card">
      {url ? (
        <img src={url} alt="Your local watch inspiration" />
      ) : (
        <div className="missing-image">Reference image unavailable</div>
      )}
      <div className="reference-meta">
        <span>LOCAL REFERENCE</span>
        <button
          aria-label="Remove reference"
          onClick={() =>
            studio.dispatch({ type: "removeReference", id: reference.id })
          }
        >
          ×
        </button>
      </div>
      <Field
        label="Attribution"
        value={reference.attribution}
        maxLength={500}
        onCommit={(value) => update({ ...reference, attribution: value })}
      />
      {reference.notes.map((n) => (
        <Field
          key={n.id}
          label={n.kind === "like" ? "I like…" : "Avoid…"}
          value={n.text}
          maxLength={500}
          onCommit={(value) =>
            update({
              ...reference,
              notes: reference.notes.map((note) =>
                note.id === n.id ? { ...note, text: value } : note,
              ),
            })
          }
        />
      ))}
      <div className="reference-scope">
        <span>Applies to</span>
        {state.project.variants.map((v) => (
          <label key={v.id}>
            <input
              type="checkbox"
              checked={reference.variantIds.includes(v.id)}
              onChange={(e) =>
                update({
                  ...reference,
                  variantIds: e.target.checked
                    ? [...reference.variantIds, v.id]
                    : reference.variantIds.filter((id) => id !== v.id),
                })
              }
            />
            {v.name}
          </label>
        ))}
      </div>
    </article>
  );
}
export default function App() {
  const [researchOpen, setResearchOpen] = useState(false);
  const [researchStarted, setResearchStarted] = useState(false);
  const [studio] = useState(() => new Studio());
  const state = useSyncExternalStore(studio.subscribe, studio.getSnapshot);
  const [selected, setSelected] = useState<string>("dial"),
    [preset, setPreset] = useState<Preset>("Oblique"),
    [comparing, setComparing] = useState(false),
    [compareId, setCompareId] = useState(""),
    [camera, setCamera] = useState<CameraState>(presets.Oblique),
    [modal, setModal] = useState<"export" | "projects" | "reload" | null>(null),
    [includeBrief, setIncludeBrief] = useState(false),
    [includePrivate, setIncludePrivate] = useState(false),
    [exporting, setExporting] = useState(false),
    [side, setSide] = useState<"inspiration" | "design">("design");
  const dialog = useRef<HTMLDialogElement>(null),
    opener = useRef<HTMLElement | null>(null);
  const synchronizeCamera = (next: CameraState) =>
    setCamera((current) => (sameCamera(current, next) ? current : next));
  const variant = state.project.variants.find((v) => v.id === state.activeId)!,
    design = variant.design;
  const compare =
    state.project.variants.find(
      (v) => v.id === compareId && v.id !== variant.id,
    ) ?? state.project.variants.find((v) => v.id !== variant.id);
  useEffect(() => {
    void studio.initialize();
    return () => studio.dispose();
  }, [studio]);
  useEffect(() => {
    if (modal) {
      opener.current = document.activeElement as HTMLElement;
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
      opener.current?.focus();
    }
  }, [modal]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (state.saveState !== "saved") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [state.saveState]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void studio.save().catch(() => undefined);
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "z" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        studio.dispatch({ type: e.shiftKey ? "redo" : "undo" });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [studio]);
  const edit = (edits: Edit[]) =>
    studio.dispatch({ type: "edit", variantId: variant.id, edits });
  const lock = (field: Lock) => (
    <button
      className={`lock-button ${design.locks.includes(field) ? "locked" : ""}`}
      aria-label={`${design.locks.includes(field) ? "Unlock" : "Lock"} ${field}`}
      aria-pressed={design.locks.includes(field)}
      onClick={() =>
        studio.dispatch({
          type: "lock",
          variantId: variant.id,
          field,
          locked: !design.locks.includes(field),
        })
      }
    >
      {design.locks.includes(field) ? "Locked" : "Lock"}
    </button>
  );
  const chosen = design.objects.find((o) => o.id === selected);
  const text = chosen?.kind === "text" ? chosen : design.objects[0];
  const objectName = (id: string) => {
    const c = design.components.find((c) => c.id === id);
    setSelected(
      c?.role === "dial"
        ? "dial"
        : c?.role === "hands"
          ? "hands"
          : c?.role === "strap"
            ? "strap"
            : c
              ? "case"
              : id,
    );
  };
  const exportingJSON = async (kind: "share" | "backup") => {
    setExporting(true);
    try {
      download(
        new Blob([await studio.export(kind, includeBrief)], {
          type: "application/json",
        }),
        kind === "share"
          ? "watch-atelier-design.json"
          : "watch-atelier-personal-backup.json",
      );
      studio.report(
        `${kind === "share" ? "Shared design" : "Personal backup"} downloaded.`,
      );
    } catch (e) {
      studio.report((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  const png = async () => {
    setExporting(true);
    try {
      const snapshot = structuredClone(design);
      download(
        await exportPNG(snapshot, preset),
        `watch-atelier-r${snapshot.revision}.png`,
      );
      studio.report(
        `Watch preview downloaded from revision ${snapshot.revision}.`,
      );
    } catch (e) {
      studio.report((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  return (
    <div
      className="atelier"
      data-testid="studio"
      data-revision={state.project.revision}
    >
      <header className="topbar">
        <div className="brand">
          <span className="brand-symbol">◷</span>
          <span>
            WATCH <strong>ATELIER</strong>
          </span>
        </div>
        <span className="top-divider" />
        <button className="project-title" onClick={() => setModal("projects")}>
          {state.project.name}
          <span>⌄</span>
        </button>
        <span
          className={`save-status ${state.saveState}`}
          role="status"
          aria-label="Save status"
        >
          {state.saveState === "saved"
            ? "Saved locally"
            : state.saveState === "saving"
              ? "Saving…"
              : state.saveState === "conflict"
                ? "Save conflict"
                : state.saveState === "error"
                  ? "Save failed"
                  : "Unsaved changes"}
        </span>
        <div className="top-actions">
          <button
            aria-pressed={researchOpen}
            onClick={() => {
              setResearchStarted(true);
              setResearchOpen((value) => !value);
            }}
          >
            Research this build
          </button>
          <button
            title="Undo (⌘Z)"
            aria-label="Undo"
            disabled={!state.history.past.length || state.busy}
            onClick={() => studio.dispatch({ type: "undo" })}
          >
            ↶
          </button>
          <button
            title="Redo (⇧⌘Z)"
            aria-label="Redo"
            disabled={!state.history.future.length || state.busy}
            onClick={() => studio.dispatch({ type: "redo" })}
          >
            ↷
          </button>
          <button
            disabled={state.busy}
            onClick={() => void studio.save().catch(() => undefined)}
          >
            Save
          </button>
          <button className="primary" onClick={() => setModal("export")}>
            Export <span>↗</span>
          </button>
        </div>
      </header>
      <div className="mobile-tabs">
        <button
          onClick={() => setSide("inspiration")}
          aria-pressed={side === "inspiration"}
        >
          Inspiration
        </button>
        <button
          onClick={() => setSide("design")}
          aria-pressed={side === "design"}
        >
          Design
        </button>
      </div>
      <main className={"workspace" + (researchOpen ? " with-research" : "")}>
        <aside
          className={`left-panel ${side === "inspiration" ? "mobile-active" : ""}`}
          aria-label="Inspiration and studies"
        >
          <div className="section-heading">
            <span>01 / INSPIRATION</span>
            <span className="small-tag">PRIVATE</span>
          </div>
          <h1>Make it your own.</h1>
          <label className="brief-label" htmlFor="brief">
            Design brief
          </label>
          <textarea
            id="brief"
            maxLength={2000}
            placeholder="A quiet everyday watch. Warm dial, sharp details, nothing unnecessary…"
            value={state.project.brief}
            disabled={state.busy}
            onChange={(e) =>
              studio.dispatch({ type: "brief", value: e.target.value })
            }
          />
          <div className="section-row">
            <h2>References</h2>
            <span>{state.project.references.length} / 3</span>
          </div>
          <p className="subtle">Keep the detail you love. Leave the rest.</p>
          <fieldset disabled={state.busy} className="plain-fieldset">
            {state.project.references.map((r) => (
              <ReferenceCard key={r.id} reference={r} studio={studio} />
            ))}
            {state.project.references.length < 3 && (
              <label className="upload-box">
                <span>＋</span>
                <strong>Add a local image</strong>
                <small>PNG, JPEG or WebP · up to 10 MiB</small>
                <input
                  aria-label="Add local reference"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void studio.addReference(file);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </fieldset>
          <p className="privacy-note">
            References stay in this browser. Shared designs exclude them.
          </p>
          <div className="studies-heading">
            <div className="section-heading">02 / STUDIES</div>
            <button
              aria-label="Duplicate study"
              disabled={state.project.variants.length >= 8 || state.busy}
              onClick={() =>
                studio.dispatch({ type: "duplicate", variantId: variant.id })
              }
            >
              ＋ Duplicate
            </button>
          </div>
          <div className="studies">
            {state.project.variants.map((v, i) => (
              <button
                key={v.id}
                className={`study ${v.id === variant.id ? "active" : ""}`}
                onClick={() => studio.select(v.id)}
                aria-pressed={v.id === variant.id}
              >
                <span
                  className="study-swatch"
                  style={{ background: v.design.dialColor }}
                />
                <span>
                  <strong>{v.name}</strong>
                  <small>
                    {i === 0 ? "Original direction" : "Independent variation"}
                  </small>
                </span>
                <span>{String(i + 1).padStart(2, "0")}</span>
              </button>
            ))}
          </div>
          <button
            className="compare-button"
            disabled={state.project.variants.length < 2}
            aria-pressed={comparing}
            onClick={() => setComparing(!comparing)}
          >
            {comparing ? "Close comparison" : "Compare studies"} <span>◫</span>
          </button>
        </aside>
        <section className="stage" aria-label="Watch workspace">
          <div className="stage-top">
            <div>
              <span className="eyebrow">ORIGINAL CONCEPT / ATELIER 39</span>
              <h2>{variant.name}</h2>
            </div>
            <span className="concept-pill">Concept only</span>
          </div>
          <div className={`views ${comparing && compare ? "comparison" : ""}`}>
            <Viewport
              design={design}
              preset={preset}
              label={variant.name}
              onSelect={objectName}
              onCamera={synchronizeCamera}
              syncCamera={camera}
            />
            {comparing && compare && (
              <Viewport
                design={compare.design}
                preset={preset}
                label={compare.name}
                onSelect={() => undefined}
                syncCamera={camera}
                onCamera={synchronizeCamera}
              />
            )}
          </div>
          {comparing && compare && (
            <label className="compare-select">
              Compare with{" "}
              <select
                value={compare.id}
                onChange={(e) => setCompareId(e.target.value)}
              >
                {state.project.variants
                  .filter((v) => v.id !== variant.id)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <div
            className="camera-toolbar"
            role="group"
            aria-label="Camera views"
          >
            {(["Oblique", "Front", "Profile", "Detail"] as Preset[]).map(
              (p) => (
                <button
                  key={p}
                  aria-pressed={preset === p}
                  onClick={() => {
                    setPreset(p);
                    setCamera(presets[p]);
                  }}
                >
                  {p}
                </button>
              ),
            )}
            <span className="rotate-hint">Drag to rotate · Scroll to zoom</span>
          </div>
          <div className="stage-bottom">
            <span>
              39.0 <small>CASE MM</small>
            </span>
            <span>
              20.0 <small>LUG MM</small>
            </span>
            <p>Authored design dimensions. Not physically verified.</p>
          </div>
        </section>
        <aside
          className={`right-panel ${side === "design" ? "mobile-active" : ""}`}
          aria-label="Design inspector"
          style={researchOpen ? { display: "none" } : undefined}
        >
          <div className="section-heading">03 / DESIGN</div>
          <div className="inspector-title">
            <h2>Dial & details</h2>
            <span>R{design.revision}</span>
          </div>
          <fieldset className="plain-fieldset inspector" disabled={state.busy}>
            <Field
              label="Study name"
              value={variant.name}
              maxLength={80}
              onCommit={(value) =>
                studio.dispatch({
                  type: "rename",
                  variantId: variant.id,
                  value,
                })
              }
            />
            <p className="selection-status" aria-live="polite">
              {selected === "case"
                ? "Case geometry is fixed for this concept."
                : chosen?.kind === "text"
                  ? `Selected: ${chosen.id === design.objects[0].id ? "Text 1" : "Text 2"}`
                  : `Selected: ${chosen?.kind ?? selected}`}
            </p>
            <div
              className="object-picker"
              role="group"
              aria-label="Select semantic object"
            >
              <button
                aria-pressed={selected === "dial"}
                onClick={() => setSelected("dial")}
              >
                Dial
              </button>
              {design.objects.map((o, i) => (
                <button
                  key={o.id}
                  aria-pressed={selected === o.id}
                  onClick={() => setSelected(o.id)}
                >
                  {o.kind === "text"
                    ? `Text ${i + 1}`
                    : o.kind === "markers"
                      ? "Markers"
                      : "Track"}
                </button>
              ))}
            </div>
            <section
              className={`control-section ${selected === "dial" ? "selected-section" : ""}`}
            >
              <div className="section-row">
                <h3>Dial color</h3>
                {lock("dialColor")}
              </div>
              <div className="palette">
                {colors.map((c) => (
                  <button
                    key={c}
                    style={{ background: c }}
                    aria-label={`Dial color ${c}`}
                    aria-pressed={design.dialColor === c}
                    onClick={() => edit([{ kind: "dialColor", value: c }])}
                  />
                ))}
              </div>
              <Field
                label="Dial hex"
                value={design.dialColor}
                maxLength={7}
                onCommit={(value) => edit([{ kind: "dialColor", value }])}
              />
            </section>
            <section
              className={`control-section ${chosen?.kind === "text" ? "selected-section" : ""}`}
            >
              <div className="section-row">
                <h3>Typography</h3>
                {lock("text")}
              </div>
              <div className="text-switch">
                {design.objects.slice(0, 2).map((o, i) => (
                  <button
                    key={o.id}
                    aria-pressed={o.id === text.id}
                    onClick={() => setSelected(o.id)}
                  >
                    Text {i + 1}
                  </button>
                ))}
              </div>
              <Field
                key={text.id + "text"}
                label="Dial text"
                value={text.text}
                maxLength={40}
                onCommit={(value) =>
                  edit([{ kind: "text", id: text.id, patch: { text: value } }])
                }
              />
              <p className="font-label">IBM Plex Sans Condensed · Medium</p>
              <div className="numeric-grid">
                {(["size", "x", "y"] as const).map((prop) => (
                  <Field
                    key={text.id + prop}
                    label={
                      prop === "size" ? "Size mm" : `${prop.toUpperCase()} mm`
                    }
                    type="number"
                    value={text[prop]}
                    min={prop === "size" ? 0.7 : -9}
                    max={prop === "size" ? 2.5 : 9}
                    step={0.1}
                    onCommit={(value) =>
                      edit([
                        {
                          kind: "text",
                          id: text.id,
                          patch: { [prop]: value === "" ? NaN : Number(value) },
                        },
                      ])
                    }
                  />
                ))}
              </div>
              <Field
                label="Text color"
                value={text.color}
                maxLength={7}
                onCommit={(value) =>
                  edit([{ kind: "text", id: text.id, patch: { color: value } }])
                }
              />
              <small className="subtle">
                Up to 40 letters, numbers or punctuation.
              </small>
            </section>
            <section
              className={`control-section ${chosen?.kind === "markers" ? "selected-section" : ""}`}
            >
              <div className="section-row">
                <h3>Hour markers</h3>
                {lock("markers")}
              </div>
              <div className="segmented">
                {(["baton", "dot"] as const).map((style) => (
                  <button
                    key={style}
                    aria-pressed={design.objects[2].style === style}
                    onClick={() =>
                      edit([{ kind: "markers", patch: { style } }])
                    }
                  >
                    {style === "baton" ? "Baton" : "Dot"}
                  </button>
                ))}
              </div>
              <Field
                label="Marker length mm"
                type="number"
                value={design.objects[2].length}
                min={0.5}
                max={3}
                step={0.1}
                onCommit={(value) =>
                  edit([
                    {
                      kind: "markers",
                      patch: { length: value === "" ? NaN : Number(value) },
                    },
                  ])
                }
              />
              <Field
                label="Marker color"
                value={design.objects[2].color}
                maxLength={7}
                onCommit={(value) =>
                  edit([{ kind: "markers", patch: { color: value } }])
                }
              />
            </section>
            <section className="control-section">
              <div className="section-row">
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={design.objects[3].visible}
                    onChange={(e) =>
                      edit([
                        { kind: "track", patch: { visible: e.target.checked } },
                      ])
                    }
                  />
                  Minute track
                </label>
                {lock("track")}
              </div>
              <Field
                label="Track color"
                value={design.objects[3].color}
                maxLength={7}
                onCommit={(value) =>
                  edit([{ kind: "track", patch: { color: value } }])
                }
              />
            </section>
            <section className="control-section">
              <div className="section-row">
                <h3>Hands</h3>
                {lock("handStyle")}
              </div>
              <div className="segmented">
                {(["baton", "leaf"] as const).map((value) => (
                  <button
                    key={value}
                    aria-pressed={design.handStyle === value}
                    onClick={() => edit([{ kind: "handStyle", value }])}
                  >
                    {value === "baton" ? "Faceted" : "Leaf"}
                  </button>
                ))}
              </div>
              <div className="section-row">
                <h3>Strap</h3>
                {lock("strap")}
              </div>
              <div className="segmented">
                {(["black", "cognac"] as const).map((value) => (
                  <button
                    key={value}
                    aria-pressed={design.strap === value}
                    onClick={() => edit([{ kind: "strap", value }])}
                  >
                    {value === "black" ? "Ink leather" : "Cognac leather"}
                  </button>
                ))}
              </div>
            </section>
          </fieldset>
          <p className="inspector-footer">
            One original case. Every study stays editable.
          </p>
        </aside>
        {researchStarted && (
          <BuildWorkspace
            hidden={!researchOpen}
            project={state.project}
            activeId={state.activeId}
            onClose={() => setResearchOpen(false)}
          />
        )}
      </main>
      {(state.message || state.busy || state.importing) && (
        <div className="notification" role="alert">
          <span>
            {state.busy
              ? "Working locally…"
              : state.importing
                ? "Validating import locally…"
                : state.message}
          </span>
          {state.importing && (
            <button onClick={() => studio.cancelImport()}>Cancel import</button>
          )}
          {state.saveState === "conflict" && (
            <>
              <button onClick={() => void studio.saveCopy()}>
                Save a copy
              </button>
              <button onClick={() => setModal("reload")}>Reload latest</button>
            </>
          )}
          <button
            aria-label="Dismiss notification"
            onClick={() => studio.report("")}
          >
            ×
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModal(null);
        }}
      >
        <div className="modal-top">
          <span className="eyebrow">WATCH ATELIER</span>
          <button aria-label="Close dialog" onClick={() => setModal(null)}>
            ×
          </button>
        </div>
        {modal === "export" ? (
          <>
            <h2>Keep your design.</h2>
            <p>Choose exactly what leaves this browser.</p>
            <div className="export-card">
              <h3>
                Watch preview <span>PNG</span>
              </h3>
              <p>
                A clean 1600 × 1200 image of the current study, using the{" "}
                {preset.toLowerCase()} view.
              </p>
              <button
                className="primary"
                disabled={exporting}
                onClick={() => void png()}
              >
                Download preview
              </button>
            </div>
            <div className="export-card">
              <h3>
                Share editable design <span>JSON</span>
              </h3>
              <p>
                All studies, with semantic dial objects. Reference images, notes
                and personal names are excluded.
              </p>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={includeBrief}
                  onChange={(e) => setIncludeBrief(e.target.checked)}
                />
                Include my brief as public text
              </label>
              <button
                disabled={exporting}
                onClick={() => void exportingJSON("share")}
              >
                Download shared design
              </button>
            </div>
            <div className="export-card">
              <h3>
                Personal backup <span>PRIVATE JSON</span>
              </h3>
              <p>
                Includes your brief, names, reference notes and processed local
                images.
              </p>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={includePrivate}
                  onChange={(e) => setIncludePrivate(e.target.checked)}
                />
                Include my private references and notes
              </label>
              <button
                disabled={!includePrivate || exporting}
                onClick={() => void exportingJSON("backup")}
              >
                Download personal backup
              </button>
            </div>
          </>
        ) : modal === "projects" ? (
          <>
            <h2>Your local projects.</h2>
            <Field
              label="Project name"
              value={state.project.name}
              maxLength={80}
              onCommit={(value) => studio.dispatch({ type: "name", value })}
            />
            <p>
              Browser storage can be cleared or evicted. Keep a personal backup
              for important work.
            </p>
            <div className="project-list">
              {state.projects.map((s) => (
                <button
                  key={s.project.id}
                  onClick={() => {
                    void studio.load(s.project.id);
                    setModal(null);
                  }}
                >
                  {s.project.name}
                  <small>
                    {s.project.variants.length}{" "}
                    {s.project.variants.length === 1 ? "study" : "studies"} ·
                    saved locally
                  </small>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button
                onClick={() => {
                  void studio.createProject();
                  setModal(null);
                }}
              >
                New project
              </button>
              <button
                onClick={() => {
                  void studio.saveCopy();
                  setModal(null);
                }}
              >
                Save as copy
              </button>
            </div>
            <label className="upload-box">
              <strong>Import editable project</strong>
              <small>Opens as a copy and preserves current work</small>
              <input
                aria-label="Import editable project"
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void studio.importFile(file);
                    setModal(null);
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </>
        ) : modal === "reload" ? (
          <>
            <h2>Reload the saved project?</h2>
            <p>
              This discards this tab’s unsaved edits. Save a copy or export
              first to keep them.
            </p>
            <div className="modal-actions">
              <button onClick={() => setModal(null)}>Cancel</button>
              <button
                className="primary"
                onClick={() => {
                  void studio.reloadDiscarding();
                  setModal(null);
                }}
              >
                Discard edits and reload
              </button>
            </div>
          </>
        ) : null}
      </dialog>
    </div>
  );
}
