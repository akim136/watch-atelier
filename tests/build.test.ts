import { describe, expect, test } from "vitest";
import { newProject } from "../src/domain/model.ts";
import {
  capture,
  initialRequirements,
  publicDiscovery,
  stale,
} from "../src/build/snapshot.ts";
import { boundedJSON, packetSchema } from "../src/build/model.ts";
import {
  applicableGuide,
  estimate,
  fit,
  offerAge,
  options,
  pricePurchase,
  resolveClaim,
  supportedOffer,
  validatePacket,
  liveSmokePass,
} from "../src/build/evaluate.ts";
import { addFact, researchFixture } from "./fixtures/bi.ts";

test("[BI-01][BI-09][BI-10] canonical snapshot and public brief preserve identity without leaking private inputs", async () => {
  const project = newProject(),
    d = project.variants[0].design;
  project.name = "PRIVATE_SENTINEL";
  project.brief = "PRIVATE_SENTINEL";
  d.objects[0].text = "PRIVATE_SENTINEL";
  const snapshot = await capture(project, project.variants[0].id);
  expect(snapshot.designId).toBe(d.id);
  expect(snapshot.units).toBe("mm");
  expect(snapshot.dimensions).toEqual(d.dimensions);
  expect(snapshot.renderContract).toBe("watch-render-v1");
  const r = initialRequirements(snapshot);
  r.like =
    r.avoid =
    r.destination =
    r.dialLayout =
    r.finish =
      "PRIVATE_SENTINEL";
  expect(r.diameter.origin).toBe("concept-target");
  expect(JSON.stringify(publicDiscovery(r))).not.toContain("PRIVATE_SENTINEL");
  expect(JSON.stringify(publicDiscovery(r))).not.toContain(d.id);
  expect(stale(snapshot, project.id, project.variants[0].id, d)).toBe(false);
  expect(
    stale(snapshot, project.id, project.variants[0].id, { ...d, revision: 1 }),
  ).toBe(true);
});

test("[BI-02] exact evidence control rejects fabricated citations, wrong variants, values and image-only dimensions", async () => {
  const p = await researchFixture();
  expect(validatePacket(p).candidates).toHaveLength(2);
  const claim = p.claims[0];
  expect(resolveClaim(claim, p.sources)?.value).toBe("NH35");
  for (const changed of [
    { variant: "other" },
    { value: "NH36" },
    { sourceId: "made-up" },
    { observationId: "url-only" },
    { status: "inferred" as const },
  ])
    expect(resolveClaim({ ...claim, ...changed }, p.sources)).toBeUndefined();
  p.sources[0].observations[0].basis = "visual-inference";
  expect(resolveClaim(claim, p.sources)).toBeUndefined();
  expect(() => validatePacket(p)).toThrow("Claim does not match");
});

test("[BI-02][BI-03] supported envelope control keeps conflicts, absent specs and datum/tolerance gaps unknown", async () => {
  const p = await researchFixture();
  addFact(
    p,
    "movement",
    "movementEnvelope",
    27.4,
    "mm",
    0.02,
    "movement axis diameter",
  );
  addFact(
    p,
    "case",
    "holderEnvelope",
    27.5,
    "mm",
    0.02,
    "movement axis diameter",
  );
  expect(fit(p, p.candidates[0], p.candidates[1])[1].result).toBe("pass");
  expect(options(p)[0].status).toBe("provisional");
  expect(options(p)[0].missing).toContain("seals-v1");
  expect(options(p)[0].physicalValidation).toBe("not performed");
  const outer = p.sources[1].observations.at(-1)!;
  outer.datum = "different datum";
  expect(fit(p, p.candidates[0], p.candidates[1])[1].result).toBe("unknown");
  outer.datum = "movement axis diameter";
  outer.tolerance = null;
  expect(fit(p, p.candidates[0], p.candidates[1])[1].result).toBe("unknown");
  addFact(p, "case", "family", "NH36", "text", null, "");
  expect(fit(p, p.candidates[0], p.candidates[1])[0].result).toBe("unknown");
});

test("[BI-01][BI-03] attractive incompatible and hard-target pairs are excluded without redesigning unsupported concepts", async () => {
  const p = await researchFixture(),
    original = JSON.stringify(p.snapshot);
  p.requirements.diameter.hard = true;
  expect(options(p)[0].status).toBe("excluded");
  p.requirements.diameter.hard = false;
  const c = p.claims.find(
    (c) => c.subject === "case" && c.property === "family",
  )!;
  c.value = "MIYOTA";
  p.sources[1].observations.find((o) => o.id === c.observationId)!.value =
    "MIYOTA";
  p.candidates[1].aesthetic = "A perfect visual match";
  expect(options(p)[0].status).toBe("excluded");
  p.requirements.family = "unsupported";
  expect(options(p)[0].gaps.join(" ")).toContain("Retain the concept");
  expect(JSON.stringify(p.snapshot)).toBe(original);
});

test("[BI-04] exact offer evidence does not inherit other-variant stock, stale prices or supplier badges", async () => {
  const p = await researchFixture(),
    offer = p.offers[0];
  expect(supportedOffer(offer, p.sources[0])).toBe(true);
  expect(supportedOffer({ ...offer, variant: "other" }, p.sources[0])).toBe(
    false,
  );
  expect(
    supportedOffer(
      { ...offer, tiers: [{ minPacks: 1, priceMinorPerPack: 1 }] },
      p.sources[0],
    ),
  ).toBe(false);
  expect(offerAge(offer)).toBe("current-observation");
  offer.observedAt = "2020-01-01T00:00:00.000Z";
  expect(offerAge(offer)).toBe("stale");
  expect(estimate(p).unknown.join(" ")).toContain("freshness");
  expect(packetSchema.safeParse({ ...p, verifiedSupplier: true }).success).toBe(
    false,
  );
});

describe("deterministic purchases", () => {
  test("[BI-05] MOQ/tier eligibility uses actual purchased packs and separates cash from allocation", async () => {
    const p = await researchFixture(),
      o = p.offers[0];
    o.moqPacks = 100;
    o.tiers = [{ minPacks: 100, priceMinorPerPack: 1000 }];
    expect(pricePurchase(o, 1)).toMatchObject({
      packs: 100,
      purchasedUnits: 100,
      cashMinor: 100000,
      allocatedMinor: 1000,
      unusedUnits: 99,
    });
    o.moqPacks = 1;
    expect(pricePurchase(o, 1).state).toBe("unknown");
    o.tiers = [
      { minPacks: 1, priceMinorPerPack: 2000 },
      { minPacks: 100, priceMinorPerPack: 1000 },
    ];
    expect(pricePurchase(o, 1)).toMatchObject({ packs: 1, cashMinor: 2000 });
    expect(pricePurchase(o, 100)).toMatchObject({
      packs: 100,
      cashMinor: 100000,
    });
  });
  test("[BI-05] packs, multiples, owned units, order maxima and arithmetic bounds have positive controls", async () => {
    const p = await researchFixture(),
      o = p.offers[0];
    o.packQuantity = 3;
    o.multiplePacks = 2;
    expect(pricePurchase(o, 5, 1)).toMatchObject({
      packs: 2,
      purchasedUnits: 6,
      requiredUnits: 4,
      cashMinor: 6000,
      allocatedMinor: 4000,
    });
    expect(pricePurchase(o, 5, 5)).toMatchObject({
      state: "owned",
      cashMinor: 0,
      packs: 0,
    });
    o.maxPacks = 1;
    expect(pricePurchase(o, 5).state).toBe("unknown");
    expect(() => pricePurchase(o, Infinity)).toThrow();
    expect(() => pricePurchase(o, 1, -1)).toThrow();
    expect(() =>
      pricePurchase(
        {
          ...o,
          tiers: [{ minPacks: 1, priceMinorPerPack: Number.MAX_SAFE_INTEGER }],
        },
        1,
      ),
    ).toThrow();
  });
  test("[BI-05] bundle children appear physically but are purchased once; shipping/tax/minimum spend and currencies stay separate", async () => {
    const p = await researchFixture();
    expect(estimate(p).totals).toEqual({ USD: 13000 });
    expect(estimate(p).physicalBOM.map((x) => x.part)).toEqual([
      "movement",
      "stem",
      "case",
      "crystal",
      "crown",
      "caseback",
      "gasket",
    ]);
    expect(estimate(p).unknown).toContain(
      "Destination taxes and import charges",
    );
    const o = p.offers[1];
    o.currency = "SGD";
    o.minimumSpendMinor = 15000;
    const s = p.sources[1];
    s.observations.find((x) => x.property === "price")!.datum =
      "SGD:minPacks=1";
    s.observations.find((x) => x.property === "quantity")!.value =
      '{"packQuantity":1,"moqPacks":1,"multiplePacks":1,"maxPacks":null,"minimumSpendMinor":15000}';
    const e = estimate(p);
    expect(e.totals).toEqual({ USD: 3000, SGD: 10000 });
    expect(e.overallTotal).toBeNull();
    expect(e.mixedCurrencies).toBe(true);
    expect(e.unknown.join(" ")).toContain("minimum spend shortfall 5000");
  });
});

test("[BI-06] relevant overview control rejects wrong variants and timestamps from descriptions", async () => {
  const p = await researchFixture(),
    g = p.guides[0];
  expect(applicableGuide(p, g)).toMatchObject({
    applicable: true,
    executable: false,
  });
  expect(applicableGuide(p, { ...g, family: "other" }).applicable).toBe(false);
  expect(applicableGuide(p, { ...g, variant: "wrong" }).applicable).toBe(false);
  expect(
    applicableGuide(p, { ...g, access: "description", timestampSeconds: 42 })
      .applicable,
  ).toBe(false);
  expect(applicableGuide(p, { ...g, access: "title-only" }).reason).toContain(
    "not accessed",
  );
});

test("[BI-09] manual/imported evidence never promotes fit or reported prices to current observations", async () => {
  const p = await researchFixture();
  for (const s of p.sources) s.origin = "imported";
  expect(
    fit(p, p.candidates[0], p.candidates[1]).every(
      (c) => c.result === "unknown",
    ),
  ).toBe(true);
  expect(estimate(p).totals).toEqual({});
});

test("[BI-11] bounded strict research parsing rejects malformed, deep, large and executable payloads", async () => {
  const p = await researchFixture();
  expect(validatePacket(boundedJSON(JSON.stringify(p))).id).toBe(p.id);
  expect(() => boundedJSON("[".repeat(17) + "0" + "]".repeat(17))).toThrow(
    "structural",
  );
  expect(() => boundedJSON('"123456"', 2)).toThrow("large");
  expect(() => boundedJSON("{bad")).toThrow();
  expect(() => validatePacket({ ...p, script: "alert(1)" })).toThrow();
  expect(() => validatePacket({ ...p, version: 2 })).toThrow();
  p.run.provider = "codex-local";
  p.run.capabilities = ["public-web-discovery"];
  p.sources[1].url = "https://www.alibaba.com/product-detail/synthetic";
  expect(liveSmokePass(p)).toBe(true);
  expect(liveSmokePass({ ...p, run: { ...p.run, state: "cancelled" } })).toBe(
    false,
  );
  expect(liveSmokePass({ ...p, candidates: [] })).toBe(false);
});
