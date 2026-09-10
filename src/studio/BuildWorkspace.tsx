import { useEffect, useRef, useState } from "react";
import type { Project } from "../domain/model";
import {
  capture,
  initialRequirements,
  publicDiscovery,
  stale,
} from "../build/snapshot";
import {
  blankPacket,
  localResearch,
  providerStatus,
  ResearchJobs,
} from "../build/jobs";
import {
  packetSchema,
  requirementsSchema,
  type Packet,
  type Requirements,
  type Snapshot,
  type Style,
} from "../build/model";
import { ResearchDatabase, exportPacket, importPacket } from "../build/storage";
import {
  applicableGuide,
  assemblyOverview,
  estimate,
  options,
} from "../build/evaluate";
import { download } from "../application/studio";
import "./research.css";

const styles: Style[] = [
  "minimal",
  "dress",
  "field",
  "warm",
  "cool",
  "polished",
  "brushed",
];
const money = (currency: string, n: number) =>
  currency + " " + (n / 100).toFixed(2);
export function BuildWorkspace({
  project,
  activeId,
  onClose,
  hidden,
}: {
  project: Project;
  activeId: string;
  onClose: () => void;
  hidden: boolean;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [brief, setBrief] = useState<Requirements | null>(null);
  const [packet, setPacket] = useState<Packet | null>(null),
    [saved, setSaved] = useState<Packet[]>([]),
    [runs, setRuns] = useState<Packet[]>([]);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [consent, setConsent] = useState(false),
    [personal, setPersonal] = useState(false);
  const [provider, setProvider] = useState("Checking local provider…"),
    [available, setAvailable] = useState(false);
  const [url, setUrl] = useState(""),
    [title, setTitle] = useState(""),
    [role, setRole] = useState<"case" | "movement">("case");
  const jobs = useRef(new ResearchJobs()),
    db = useRef(new ResearchDatabase()),
    generation = useRef(0),
    mounted = useRef(true);
  const design = project.variants.find((v) => v.id === activeId)!.design;
  const context = project.id + activeId + design.revision,
    latest = useRef(context);
  latest.current = context;
  const report = (e: unknown) => {
    if (mounted.current)
      setMessage(e instanceof Error ? e.message : "Research operation failed.");
  };
  const refresh = async () => {
    const records = await db.current.list();
    if (mounted.current) {
      setSaved(records);
      if (db.current.warnings.length) setMessage(db.current.warnings.join(" "));
    }
  };
  const cancel = () => {
    generation.current++;
    jobs.current.cancel();
    setBusy(false);
  };
  const reset = async () => {
    cancel();
    const g = generation.current,
      key = latest.current;
    const s = await capture(project, activeId);
    if (!mounted.current || key !== latest.current || g !== generation.current)
      return;
    setSnapshot(s);
    setBrief(initialRequirements(s));
    setPacket(null);
    setConsent(false);
    setPersonal(false);
  };
  useEffect(() => {
    mounted.current = true;
    void reset().catch(report);
    void refresh().catch(report);
    void providerStatus()
      .then((s) => {
        if (mounted.current) {
          setAvailable(s.enabled);
          setProvider(
            s.enabled
              ? "Local Codex · " + s.model
              : "Provider disabled. Run pnpm dev:research.",
          );
        }
      })
      .catch((e) => {
        if (mounted.current) setProvider((e as Error).message);
      });
    return () => {
      mounted.current = false;
      generation.current++;
      jobs.current.cancel();
      void db.current.close();
    };
  }, []);
  const open = (p: Packet) => {
    cancel();
    setPacket(p);
    setSnapshot(p.snapshot);
    setBrief(p.requirements);
    setConsent(false);
    setPersonal(false);
  };
  const update = (patch: Partial<Requirements>) => {
    if (brief) {
      setBrief({ ...brief, ...patch, revision: brief.revision + 1 });
      setConsent(false);
    }
  };
  const change = (p: Packet) => {
    cancel();
    setPacket(
      packetSchema.parse({
        ...p,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      }),
    );
  };
  const start = async () => {
    if (!snapshot || !brief) return;
    setBusy(true);
    setMessage("");
    const key = latest.current,
      g = ++generation.current;
    try {
      const p = await jobs.current.start(
        snapshot,
        brief,
        consent,
        localResearch,
      );
      if (!p || !mounted.current || g !== generation.current) return;
      setRuns((old) => [...old, p]);
      if (key === latest.current) setPacket(p);
      else
        setMessage(
          "Research retained for a prior revision. Open it from session runs; current selection unchanged.",
        );
    } catch (e) {
      if (g === generation.current) report(e);
    } finally {
      if (mounted.current && g === generation.current) setBusy(false);
    }
  };
  const manual = () => {
    if (!snapshot || !brief) return;
    try {
      const p =
          packet ?? blankPacket(snapshot, requirementsSchema.parse(brief)),
        id = crypto.randomUUID();
      change({
        ...p,
        sources: [
          ...p.sources,
          {
            id,
            url,
            publisher: "User-provided evidence",
            title,
            retrievedAt: new Date().toISOString(),
            publishedAt: null,
            access: "user-provided",
            origin: "manual",
            selected: true,
            hash: null,
            observations: [],
            conflicts: [],
            limitation:
              "Not retrieved. Exact variant, specifications, price, stock and fit unresolved.",
            retention:
              "bounded facts and locators; no page or image redistribution",
          },
        ],
        candidates: [
          ...p.candidates,
          {
            id,
            role,
            name: title,
            variant: "user-unresolved",
            exactVariant: false,
            sourceId: id,
            claimIds: [],
            aesthetic: "User-selected reference; unverified.",
            questions: ["Obtain exact variant and supporting specifications."],
            realization: "proposed-source-not-rendered",
          },
        ],
      });
      setUrl("");
      setTitle("");
      setMessage("Manual source added locally. No URL was fetched.");
    } catch {
      setMessage(
        "Use an HTTPS source and title. Maximum four candidates/eight sources.",
      );
    }
  };
  const exportFile = (privateCopy: boolean) => {
    if (!packet) return;
    try {
      download(
        new Blob([exportPacket(packet, privateCopy)], {
          type: "application/json",
        }),
        privateCopy ? "watch-research-personal.json" : "watch-research.json",
      );
    } catch (e) {
      report(e);
    }
  };
  if (!snapshot || !brief)
    return (
      <aside
        className="build-workspace"
        style={hidden ? { display: "none" } : undefined}
      >
        <p>Preparing current design…</p>
        <button onClick={onClose}>Close research</button>
        {message && <p role="status">{message}</p>}
      </aside>
    );
  const outdated = stale(snapshot, project.id, activeId, design);
  const resultStale =
    packet &&
    (stale(packet.snapshot, project.id, activeId, design) ||
      JSON.stringify(packet.requirements) !== JSON.stringify(brief));
  return (
    <aside
      className="build-workspace"
      aria-label="Build Intelligence"
      style={hidden ? { display: "none" } : undefined}
    >
      <div className="research-heading">
        <div>
          <span className="eyebrow">BUILD INTELLIGENCE · BI-1</span>
          <h2>Research this build</h2>
        </div>
        <button aria-label="Close research" onClick={onClose}>
          ×
        </button>
      </div>
      <p>
        Revision {snapshot.revision} · {snapshot.dimensions.diameter} mm
        concept. Proposed parts never replace the watch.
      </p>
      {outdated && (
        <p className="research-warning">
          Design changed. This brief belongs to a prior revision.
        </p>
      )}
      <button disabled={busy} onClick={() => void reset().catch(report)}>
        Use current design revision
      </button>
      <p className="research-provider">{provider}</p>
      <details open={!packet}>
        <summary>Confirm requirements</summary>
        <fieldset disabled={busy}>
          <label>
            Supported family
            <select
              value={brief.family}
              onChange={(e) =>
                update({ family: e.target.value as Requirements["family"] })
              }
            >
              <option value="NH35">NH35 research path</option>
              <option value="unsupported">Other / custom concept</option>
            </select>
          </label>
          <label>
            Intended functions
            <select
              value={brief.functions}
              onChange={(e) =>
                update({
                  functions: e.target.value as Requirements["functions"],
                })
              }
            >
              <option value="three-hand">Three hands, no visible date</option>
              <option value="date-at-3">Three hands, date at 3</option>
              <option value="other">Other / unresolved</option>
            </select>
          </label>
          <small>
            Function is your assertion, never inferred from the rendered dial.
          </small>
          {(["diameter", "thickness", "lugWidth"] as const).map((k) => (
            <div key={k}>
              <label>
                {k === "lugWidth"
                  ? "Lug width"
                  : k[0].toUpperCase() + k.slice(1)}{" "}
                target mm
                <input
                  type="number"
                  min=".1"
                  max="100"
                  step=".1"
                  value={brief[k].value}
                  onChange={(e) =>
                    update({
                      [k]: {
                        ...brief[k],
                        value: Number(e.target.value),
                        origin: "user-assertion",
                      },
                    })
                  }
                />
              </label>
              <label className="research-check">
                <input
                  type="checkbox"
                  checked={brief[k].hard}
                  onChange={(e) =>
                    update({ [k]: { ...brief[k], hard: e.target.checked } })
                  }
                />
                Hard constraint
              </label>
              <small>{brief[k].origin} · not measured hardware</small>
            </div>
          ))}
          <div className="research-style">
            {styles.map((s) => (
              <label className="research-check" key={s}>
                <input
                  type="checkbox"
                  checked={brief.styles.includes(s)}
                  onChange={(e) =>
                    update({
                      styles: e.target.checked
                        ? [...brief.styles, s]
                        : brief.styles.filter((x) => x !== s),
                    })
                  }
                />
                {s}
              </label>
            ))}
          </div>
          {(["dialLayout", "finish", "like", "avoid"] as const).map((k) => (
            <label key={k}>
              {
                {
                  dialLayout: "Dial layout",
                  finish: "Finish target",
                  like: "Like traits (private)",
                  avoid: "Avoid traits (private)",
                }[k]
              }
              <input
                maxLength={500}
                value={brief[k]}
                onChange={(e) => update({ [k]: e.target.value })}
              />
            </label>
          ))}
          <label>
            Build quantity
            <input
              type="number"
              min="1"
              max="100000"
              value={brief.quantity}
              onChange={(e) => update({ quantity: Number(e.target.value) })}
            />
          </label>
          <label>
            Budget currency
            <select
              value={brief.currency}
              onChange={(e) =>
                update({ currency: e.target.value as Requirements["currency"] })
              }
            >
              {["USD", "SGD", "EUR", "GBP"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Budget (optional)
            <input
              type="number"
              min="0"
              step=".01"
              value={brief.budgetMinor === null ? "" : brief.budgetMinor / 100}
              onChange={(e) =>
                update({
                  budgetMinor: e.target.value
                    ? Math.round(Number(e.target.value) * 100)
                    : null,
                })
              }
            />
          </label>
          <label>
            Destination (private; optional)
            <input
              maxLength={80}
              value={brief.destination}
              onChange={(e) => update({ destination: e.target.value })}
            />
          </label>
          <label>
            Stock versus custom
            <select
              value={brief.custom}
              onChange={(e) =>
                update({ custom: e.target.value as Requirements["custom"] })
              }
            >
              <option value="stock-preferred">Stock preferred</option>
              <option value="custom-acceptable">Custom acceptable</option>
              <option value="custom-only">Custom only / gap report</option>
            </select>
          </label>
          <label>
            Public reference URLs (one per line, at most 3)
            <textarea
              value={brief.selectedUrls.join("\n")}
              onChange={(e) =>
                update({
                  selectedUrls: e.target.value.split("\n").filter(Boolean),
                })
              }
            />
          </label>
        </fieldset>
      </details>
      <details>
        <summary>Exactly what public research sends</summary>
        <pre>
          {JSON.stringify(
            requirementsSchema.safeParse(brief).success
              ? publicDiscovery(brief)
              : { error: "Complete valid requirements first." },
            null,
            2,
          )}
        </pre>
        <p>
          Sent to local Codex/OpenAI and web search; selected public URLs may
          reach their hosts. No images, private notes, project names, dial
          lettering or destination. Image analysis is not enabled in this
          candidate.
        </p>
      </details>
      <label className="research-check">
        <input
          type="checkbox"
          checked={consent}
          disabled={busy}
          onChange={(e) => setConsent(e.target.checked)}
        />
        I reviewed this public payload and consent to this research run.
      </label>
      <div className="research-actions">
        <button
          className="primary"
          disabled={
            !consent ||
            !available ||
            busy ||
            outdated ||
            runs.length >= 25 ||
            !requirementsSchema.safeParse(brief).success
          }
          onClick={() => void start()}
        >
          {busy ? "Researching…" : "Start live research"}
        </button>
        {busy && (
          <button
            onClick={() => {
              cancel();
              setMessage("Research cancelled. Late results will not open.");
            }}
          >
            Cancel research
          </button>
        )}
      </div>
      {message && (
        <p className="research-warning" role="status">
          {message}
        </p>
      )}
      <details>
        <summary>Manual evidence · no provider needed</summary>
        <label>
          Part role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "case" | "movement")}
          >
            <option value="case">Case</option>
            <option value="movement">Movement</option>
          </select>
        </label>
        <label>
          Manual part title
          <input
            value={title}
            maxLength={180}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Manual source URL
          <input
            value={url}
            maxLength={1000}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <button disabled={busy || !title || !url} onClick={manual}>
          Add manual source
        </button>
        <small>
          Private by default; cannot qualify fit. No automatic URL retrieval.
        </small>
      </details>
      {!!runs.length && (
        <label>
          Session runs
          <select
            value={packet?.run.id ?? ""}
            onChange={(e) => {
              const p = runs.find((p) => p.run.id === e.target.value);
              if (p) open(p);
            }}
          >
            <option value="">Choose retained run</option>
            {runs.map((p) => (
              <option key={p.run.id} value={p.run.id}>
                r{p.snapshot.revision} · {p.run.state} ·{" "}
                {new Date(p.createdAt).toLocaleTimeString()}
              </option>
            ))}
          </select>
        </label>
      )}
      {packet && (
        <>
          {resultStale && (
            <p className="research-warning" role="status">
              STALE RESEARCH — design or requirements changed. Packet remains
              bound to revision {packet.snapshot.revision}.
            </p>
          )}
          <ResearchResults packet={packet} change={change} />
          <div className="research-actions">
            <button
              disabled={busy}
              onClick={() =>
                void db.current
                  .save(packet)
                  .then(refresh)
                  .then(() => setMessage("Research packet saved locally."))
                  .catch(report)
              }
            >
              Save research packet
            </button>
            <button onClick={() => exportFile(false)}>
              Export research packet
            </button>
          </div>
          <small>
            Default export strips selected/private sources and inputs. Import
            downgrades evidence.
          </small>
          <label className="research-check">
            <input
              type="checkbox"
              checked={personal}
              onChange={(e) => setPersonal(e.target.checked)}
            />
            Include private research notes/sources in personal backup (no
            images).
          </label>
          <button disabled={!personal} onClick={() => exportFile(true)}>
            Export personal research backup
          </button>
        </>
      )}
      <section>
        <h3>Saved research</h3>
        <label>
          Import research packet
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (f.size > 2 * 1024 ** 2) {
                setMessage("Research file exceeds 2 MiB.");
                return;
              }
              cancel();
              const g = generation.current;
              void f
                .text()
                .then((t) => {
                  const p = importPacket(t);
                  if (mounted.current && g === generation.current) {
                    open(p);
                    setMessage(
                      "Imported unverified research copy. Watch unchanged.",
                    );
                  }
                })
                .catch(report);
            }}
          />
        </label>
        {saved.map((p) => (
          <div className="research-saved" key={p.id}>
            <button onClick={() => open(p)}>
              Open research · r{p.snapshot.revision} ·{" "}
              {new Date(p.createdAt).toLocaleString()}
            </button>
            <button
              aria-label="Delete saved research packet"
              onClick={() => {
                if (
                  window.confirm(
                    "Delete this research packet? Export a backup first. The watch is unchanged.",
                  )
                )
                  void db.current
                    .remove(p.id)
                    .then(refresh)
                    .then(() =>
                      setMessage(
                        "Research packet deleted. Recovery requires an exported backup.",
                      ),
                    )
                    .catch(report);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </section>
    </aside>
  );
}
function ResearchResults({
  packet: p,
  change,
}: {
  packet: Packet;
  change: (p: Packet) => void;
}) {
  const plans = options(p),
    costs = estimate(p);
  return (
    <div className="research-results">
      <p className="research-warning">
        {p.run.provider === "fixture"
          ? "SYNTHETIC FIXTURE — not current research."
          : p.run.provider === "imported"
            ? "Imported evidence unverified; fit and current prices downgraded."
            : p.run.provider === "manual"
              ? "Manual research — not retrieved facts."
              : "Live observations — no procurement or mechanical approval."}
      </p>
      <section>
        <h3>Sources & evidence</h3>
        {p.sources.map((s) => (
          <details key={s.id} className="research-card">
            <summary>
              {s.publisher} · {s.access}
            </summary>
            <a href={s.url} target="_blank" rel="noreferrer noopener">
              {s.title || s.url} ↗
            </a>
            <small>
              Checked {s.retrievedAt} · {s.origin}
            </small>
            <p>{s.limitation}</p>
            {s.conflicts.map((c, i) => (
              <p className="research-warning" key={i}>
                Conflict: {c}
              </p>
            ))}
            <ul>
              {s.observations.map((o) => (
                <li key={o.id}>
                  {o.variant}: {o.property} = {String(o.value)}{" "}
                  {o.unit === "mm" ? "mm" : ""}
                  <small>
                    {o.basis} · {o.locator}
                  </small>
                </li>
              ))}
            </ul>
            <small>
              Returns, samples and part-specific seller assessment remain
              unresolved. Platform badges are not part-quality or fit proof.
            </small>
          </details>
        ))}
      </section>
      <section>
        <h3>Proposed parts · watch unchanged</h3>
        {p.candidates.map((c) => (
          <article className="research-card" key={c.id}>
            <h4>{c.name}</h4>
            <p>
              {c.variant} ·{" "}
              {c.exactVariant
                ? "listing variant identified"
                : "variant unresolved"}
            </p>
            <p>{c.aesthetic}</p>
            <ul>
              {c.questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
            {p.offers
              .filter((o) => o.candidateId === c.id)
              .map((o) => (
                <div key={o.id}>
                  <p>
                    {o.seller} · {o.stock}
                  </p>
                  {o.tiers.map((t) => (
                    <p key={t.minPacks}>
                      {money(o.currency, t.priceMinorPerPack)} per pack of{" "}
                      {o.packQuantity}, from {t.minPacks} packs.
                    </p>
                  ))}
                  <small>
                    MOQ {o.moqPacks ?? "unknown"} packs; multiple{" "}
                    {o.multiplePacks ?? "unknown"}. {o.limitation}
                  </small>
                </div>
              ))}
          </article>
        ))}
      </section>
      <section>
        <h3>Coherent shortlists</h3>
        {!plans.length && (
          <p>
            A sourced movement and case are needed. Missing options are not
            invented.
          </p>
        )}
        {plans.map((o) => (
          <article className="research-card" key={o.id}>
            <h4>
              {o.movement.variant} + {o.casing.variant}
            </h4>
            <p className="research-warning">
              {o.status === "excluded"
                ? "Excluded — incompatibility, hard constraint or unavailable part"
                : "Provisional — required interfaces unknown"}
            </p>
            <ul>
              {o.gaps.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
            <details>
              <summary>Fit checks · physical validation not performed</summary>
              <ul>
                {o.checks.map((c) => (
                  <li key={c.rule}>
                    {c.result} · {c.rule}
                    <small>{c.limitation}</small>
                    <small>Inputs: {c.inputs.join(", ") || "missing"}</small>
                  </li>
                ))}
              </ul>
            </details>
            <button
              disabled={o.status === "excluded"}
              aria-pressed={
                p.selected?.movementId === o.movement.id &&
                p.selected?.caseId === o.casing.id
              }
              onClick={() =>
                change({
                  ...p,
                  selected: { movementId: o.movement.id, caseId: o.casing.id },
                })
              }
            >
              Select provisional plan
            </button>
          </article>
        ))}
      </section>
      {p.selected && (
        <section>
          <h3>Partial BOM & cost</h3>
          <p>Reported merchandise only. Not an all-in quote.</p>
          {costs.lines.map((l) => (
            <div key={l.candidate.id} className="research-card">
              <p>{l.candidate.name}</p>
              <label>
                Owned {l.candidate.role} units
                <input
                  type="number"
                  min="0"
                  max="100000"
                  value={
                    p.owned.find((o) => o.candidateId === l.candidate.id)
                      ?.units ?? 0
                  }
                  onChange={(e) => {
                    const units = Number(e.target.value);
                    if (
                      Number.isInteger(units) &&
                      units >= 0 &&
                      units <= 100000
                    )
                      change({
                        ...p,
                        owned: [
                          ...p.owned.filter(
                            (o) => o.candidateId !== l.candidate.id,
                          ),
                          { candidateId: l.candidate.id, units },
                        ],
                      });
                  }}
                />
              </label>
              {l.purchase && l.purchase.state !== "unknown" ? (
                <p>
                  Buy {l.purchase.packs} packs / {l.purchase.purchasedUnits}{" "}
                  units; cash {money(l.offer!.currency, l.purchase.cashMinor)}.
                  Allocated consumption{" "}
                  {money(l.offer!.currency, l.purchase.allocatedMinor)} across{" "}
                  {p.requirements.quantity} watches; {l.purchase.unusedUnits}{" "}
                  unused units.
                </p>
              ) : (
                <p>Purchase estimate unknown.</p>
              )}
            </div>
          ))}
          {Object.entries(costs.totals).map(([c, n]) => (
            <p className="research-subtotal" key={c}>
              {c} merchandise cash: {money(c, n)}
            </p>
          ))}
          {!Object.keys(costs.totals).length && (
            <p>No evidenced current subtotal.</p>
          )}
          {costs.mixedCurrencies && (
            <p>Separate currencies; no combined total or FX rate assumed.</p>
          )}
          <details open>
            <summary>Physical BOM · bundles purchased once</summary>
            <ul>
              {costs.physicalBOM.map((b, i) => (
                <li key={i}>
                  {b.part}
                  <small>
                    {b.assembly} · {b.purchasedAs}
                  </small>
                </li>
              ))}
            </ul>
          </details>
          <details open>
            <summary>Unknown charges & gaps</summary>
            <ul>
              {costs.unknown.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
          </details>
          <small>
            Shipping groups: {costs.shippingGroups.join("; ") || "unresolved"}.
            Allocation rounds up to a minor unit. Minimum-order cash is not a
            one-watch price.
          </small>
        </section>
      )}
      <section>
        <h3>Assembly resource overview</h3>
        <p>
          No parts purchased. Dependent fitting instructions are blocked by
          unresolved interfaces.
        </p>
        {p.guides.map((g) => (
          <article className="research-card" key={g.id}>
            <a
              href={p.sources.find((s) => s.id === g.sourceId)!.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              {g.title} ↗
            </a>
            <p>
              {g.access} · {applicableGuide(p, g).reason}
            </p>
            <small>{g.locator}</small>
          </article>
        ))}
        {assemblyOverview.map((s) => (
          <details key={s.phase}>
            <summary>{s.phase}</summary>
            <p>{s.action}</p>
            <small>Tools/prerequisites: {s.tools}</small>
          </details>
        ))}
        <details>
          <summary>Custom RFQ / gap checklist</summary>
          <p>
            Retain original geometry/artwork. Obtain drawings, datums,
            material/finish, missing tolerances, exact interfaces, sample
            acceptance and testing requirements. Request documented quote
            assumptions; no executable manufacturing instructions.
          </p>
        </details>
      </section>
      <details>
        <summary>Research run receipt</summary>
        <p>
          {p.run.provider} · {p.run.model} · {p.run.cliVersion}
        </p>
        <small>
          {p.run.startedAt} → {p.run.endedAt}
        </small>
        <p>
          {p.run.usage.reported
            ? "Reported tokens:"
            : "Usage unavailable or partial counters (not zero-cost):"}{" "}
          {p.run.usage.input} input / {p.run.usage.cachedInput} cached /{" "}
          {p.run.usage.output} output. Subscription work is not free or
          unlimited.
        </p>
        <small>
          Prompt/schema {p.run.promptVersion}; input {p.run.inputHash}
        </small>
        {p.run.failures.map((f, i) => (
          <p className="research-warning" key={i}>
            {f}
          </p>
        ))}
      </details>
    </div>
  );
}
