import {
  packetSchema,
  offerSchema,
  type Packet,
  type Claim,
  type Source,
  type Candidate,
  type Offer,
  type Guide,
  type Observation,
} from "./model.ts";

export function resolveClaim(
  claim: Claim,
  sources: Source[],
): Observation | undefined {
  const source = sources.find((s) => s.id === claim.sourceId);
  if (
    !source ||
    source.access !== "retrieved" ||
    !source.hash ||
    (source.origin !== "live" && source.origin !== "fixture")
  )
    return;
  const fact = source.observations.find((o) => o.id === claim.observationId);
  if (
    !fact ||
    fact.subject !== claim.subject ||
    fact.variant !== claim.variant ||
    fact.property !== claim.property ||
    fact.value !== claim.value ||
    fact.unit !== claim.unit ||
    fact.basis === "visual-inference" ||
    fact.basis === "user-assertion" ||
    claim.status !== "reported"
  )
    return;
  return fact;
}
function fact(packet: Packet, c: Candidate, property: Observation["property"]) {
  const matches = packet.claims
    .filter(
      (x) =>
        c.claimIds.includes(x.id) &&
        x.subject === c.id &&
        x.variant === c.variant &&
        x.property === property,
    )
    .map((x) => resolveClaim(x, packet.sources))
    .filter((x) => !!x);
  if (
    !matches.length ||
    new Set(
      matches.map((x) =>
        JSON.stringify([x.value, x.unit, x.datum, x.tolerance]),
      ),
    ).size !== 1
  )
    return;
  return matches[0];
}
export type FitCheck = {
  rule: string;
  result: "pass" | "fail" | "unknown" | "not-applicable";
  inputs: string[];
  limitation: string;
};
function envelope(
  rule: string,
  inner?: Observation,
  outer?: Observation,
): FitCheck {
  const inputs = [inner?.id, outer?.id].filter((x): x is string => !!x);
  if (
    !inner ||
    !outer ||
    inner.unit !== "mm" ||
    outer.unit !== "mm" ||
    inner.datum !== outer.datum ||
    !inner.datum ||
    inner.tolerance === null ||
    outer.tolerance === null ||
    typeof inner.value !== "number" ||
    typeof outer.value !== "number"
  )
    return {
      rule,
      result: "unknown",
      inputs,
      limitation:
        "Missing documented compatible datums, units or tolerances. Concept geometry is not hardware evidence.",
    };
  return {
    rule,
    inputs,
    result:
      inner.value + inner.tolerance <= outer.value - outer.tolerance
        ? "pass"
        : "fail",
    limitation:
      "Documented envelope comparison only; does not establish retention, assembly clearance or physical validation.",
  };
}
export function fit(
  packet: Packet,
  movement: Candidate,
  casing: Candidate,
): FitCheck[] {
  const mf = fact(packet, movement, "family"),
    cf = fact(packet, casing, "family");
  const checks: FitCheck[] = [
    {
      rule: "family-v1",
      inputs: [mf?.id, cf?.id].filter((x): x is string => !!x),
      result: mf && cf ? (mf.value === cf.value ? "pass" : "fail") : "unknown",
      limitation:
        "Reported family match only; not exact variant or interface approval.",
    },
    envelope(
      "movement-holder-envelope-v1",
      fact(packet, movement, "movementEnvelope"),
      fact(packet, casing, "holderEnvelope"),
    ),
    envelope(
      "caseback-rotor-envelope-v1",
      fact(packet, movement, "movementHeight"),
      fact(packet, casing, "caseDepth"),
    ),
  ];
  for (const rule of [
    "holder-retention",
    "dial-diameter-feet-date",
    "hand-fitting-heights-sweep",
    "stem-crown-orientation-height",
    "crystal-rehaut",
    "seals",
    "bracelet-endlinks",
  ]) {
    checks.push({
      rule: rule + "-v1",
      result: "unknown",
      inputs: [],
      limitation:
        "Exact parts, datums, drawings and physical checks are missing. No dependent fitting instructions.",
    });
  }
  return checks;
}
export function options(packet: Packet) {
  const r = packet.requirements;
  return packet.candidates
    .filter((c) => c.role === "movement")
    .flatMap((movement) =>
      packet.candidates
        .filter((c) => c.role === "case")
        .map((casing) => {
          const checks = fit(packet, movement, casing);
          const gaps: string[] = [];
          let hard = false;
          for (const [name, property, target] of [
            ["diameter", "diameter", r.diameter],
            ["thickness", "height", r.thickness],
            ["lug width", "lugWidth", r.lugWidth],
          ] as const) {
            const observed = fact(packet, casing, property);
            if (!observed || typeof observed.value !== "number")
              gaps.push("Case " + name + " is undocumented for this variant.");
            else if (observed.value !== target.value) {
              gaps.push(
                "Case " +
                  name +
                  " " +
                  observed.value +
                  " mm differs from target " +
                  target.value +
                  " mm. Watch unchanged.",
              );
              if (target.hard) hard = true;
            }
          }
          if (
            r.family === "unsupported" ||
            r.functions === "other" ||
            r.custom === "custom-only"
          ) {
            hard = true;
            gaps.push(
              "Outside the supported NH35 stock-family path. Retain the concept; obtain custom drawings and an RFQ review.",
            );
          }
          if (r.functions === "three-hand")
            gaps.push(
              "NH35 has a date function; a no-date dial needs an explicit hidden-date decision and dial/interface evidence.",
            );
          const stock = packet.offers.filter(
            (o) => o.candidateId === movement.id || o.candidateId === casing.id,
          );
          const unavailable = stock.some((o) => o.stock === "unavailable");
          return {
            id: movement.id + "+" + casing.id,
            movement,
            casing,
            checks,
            gaps,
            status:
              hard || checks.some((c) => c.result === "fail") || unavailable
                ? ("excluded" as const)
                : ("provisional" as const),
            physicalValidation: "not performed" as const,
            missing: checks
              .filter((c) => c.result === "unknown")
              .map((c) => c.rule),
          };
        }),
    );
}
export function quantityValue(
  o: Pick<
    Offer,
    | "packQuantity"
    | "moqPacks"
    | "multiplePacks"
    | "maxPacks"
    | "minimumSpendMinor"
  >,
) {
  return JSON.stringify({
    packQuantity: o.packQuantity,
    moqPacks: o.moqPacks,
    multiplePacks: o.multiplePacks,
    maxPacks: o.maxPacks,
    minimumSpendMinor: o.minimumSpendMinor,
  });
}
export function supportedOffer(o: Offer, source?: Source) {
  if (
    !source ||
    source.access !== "retrieved" ||
    !source.hash ||
    !["live", "fixture"].includes(source.origin) ||
    !o.exactVariant
  )
    return false;
  const observations = source.observations.filter(
    (x) =>
      o.evidenceIds.includes(x.id) &&
      x.subject === o.candidateId &&
      x.variant === o.variant &&
      x.basis === "seller-reported",
  );
  return (
    o.tiers.length > 0 &&
    o.tiers.every((t) =>
      observations.some(
        (x) =>
          x.property === "price" &&
          x.unit === "minor" &&
          x.datum === o.currency + ":minPacks=" + t.minPacks &&
          x.value === t.priceMinorPerPack,
      ),
    ) &&
    observations.some(
      (x) => x.property === "quantity" && x.value === quantityValue(o),
    ) &&
    (!o.included.length ||
      observations.some(
        (x) => x.property === "included" && x.value === o.included.join(","),
      ))
  );
}
export function offerAge(o: Offer, now = Date.now()) {
  const age = now - Date.parse(o.observedAt);
  return age < -60_000 || age > 7 * 86400_000 ? "stale" : "current-observation";
}
function safe(n: number) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("Cost exceeds safe integer arithmetic limits.");
  return n;
}
/** Prices are per purchase pack; tiers/MOQ/multiples are pack counts, never watch counts. */
export function pricePurchase(raw: Offer, watches: number, ownedUnits = 0) {
  const o = offerSchema.parse(raw);
  if (
    !Number.isSafeInteger(watches) ||
    watches < 1 ||
    watches > 100_000 ||
    !Number.isSafeInteger(ownedUnits) ||
    ownedUnits < 0 ||
    ownedUnits > 100_000
  )
    throw new Error("Invalid build or owned quantity.");
  const requiredUnits = Math.max(0, watches - ownedUnits);
  if (!requiredUnits)
    return {
      state: "owned" as const,
      requiredUnits,
      packs: 0,
      purchasedUnits: 0,
      unitPackPrice: 0,
      cashMinor: 0,
      allocatedMinor: 0,
      unusedUnits: 0,
    };
  if (o.moqPacks === null || o.multiplePacks === null || !o.exactVariant)
    return {
      state: "unknown" as const,
      reason: "Exact variant or order rules unresolved.",
    };
  const packs = safe(
    Math.ceil(
      Math.max(Math.ceil(requiredUnits / o.packQuantity), o.moqPacks) /
        o.multiplePacks,
    ) * o.multiplePacks,
  );
  if (o.maxPacks !== null && packs > o.maxPacks)
    return {
      state: "unknown" as const,
      reason: "Required purchase exceeds the reported order maximum.",
    };
  const tier = [...o.tiers]
    .sort((a, b) => b.minPacks - a.minPacks)
    .find((t) => t.minPacks <= packs);
  if (!tier)
    return {
      state: "unknown" as const,
      reason: "No price tier applies to the actual purchase quantity.",
    };
  const purchasedUnits = safe(packs * o.packQuantity),
    cashMinor = safe(packs * tier.priceMinorPerPack);
  // Ceiling of proportional consumed inventory value; exact rational allocation is retained.
  const numerator = BigInt(cashMinor) * BigInt(requiredUnits);
  const allocatedMinor = safe(
    Number((numerator + BigInt(purchasedUnits) - 1n) / BigInt(purchasedUnits)),
  );
  return {
    state: "priced" as const,
    requiredUnits,
    packs,
    purchasedUnits,
    cashMinor,
    allocatedMinor,
    allocationBasis: [cashMinor, requiredUnits, purchasedUnits] as const,
    unusedUnits: purchasedUnits - requiredUnits,
    unitPackPrice: tier.priceMinorPerPack,
  };
}
export function estimate(packet: Packet, now = Date.now()) {
  const ids = packet.selected
    ? [packet.selected.movementId, packet.selected.caseId]
    : [];
  const totals: Partial<Record<Offer["currency"], number>> = {};
  const allocated: Partial<Record<Offer["currency"], number>> = {};
  const unknown = [
    "Shipping (grouped by seller)",
    "Destination taxes and import charges",
    "Dial",
    "Hands",
    "Strap",
    "Tools and consumables",
    "Labor, testing and any custom setup",
  ];
  const groups = new Map<
    string,
    { currency: Offer["currency"]; subtotal: number; minimum: number | null }
  >();
  const lines = ids.map((id) => {
    const candidate = packet.candidates.find((c) => c.id === id)!;
    const offer = packet.offers.find((o) => o.candidateId === id);
    const owned = packet.owned.find((o) => o.candidateId === id)?.units ?? 0;
    if (!offer) {
      unknown.push(candidate.name + ": no exact offer.");
      return { candidate, offer, purchase: null };
    }
    const source = packet.sources.find((s) => s.id === offer.sourceId);
    if (
      !supportedOffer(offer, source) ||
      offerAge(offer, now) === "stale" ||
      offer.stock === "unavailable"
    ) {
      unknown.push(
        candidate.name +
          ": evidence, variant, price freshness or availability unresolved.",
      );
      return { candidate, offer, purchase: null };
    }
    const purchase = pricePurchase(offer, packet.requirements.quantity, owned);
    if (purchase.state === "unknown")
      unknown.push(candidate.name + ": " + purchase.reason);
    else {
      totals[offer.currency] = safe(
        (totals[offer.currency] ?? 0) + purchase.cashMinor,
      );
      allocated[offer.currency] = safe(
        (allocated[offer.currency] ?? 0) + purchase.allocatedMinor,
      );
      const groupKey = offer.seller + ":" + offer.currency,
        group = groups.get(groupKey);
      groups.set(groupKey, {
        currency: offer.currency,
        subtotal: safe((group?.subtotal ?? 0) + purchase.cashMinor),
        minimum:
          Math.max(group?.minimum ?? 0, offer.minimumSpendMinor ?? 0) || null,
      });
      if (!offer.quantityConfirmed || offer.stock !== "reported-available")
        unknown.push(
          candidate.name +
            ": requested-quantity fulfillment is unconfirmed (" +
            offer.stock +
            ").",
        );
    }
    return { candidate, offer, purchase };
  });
  for (const [seller, g] of groups) {
    if (g.minimum !== null && g.subtotal < g.minimum)
      unknown.push(
        seller +
          ": minimum spend shortfall " +
          (g.minimum - g.subtotal) +
          " minor units; no filler purchase assumed.",
      );
  }
  const physicalBOM = lines.flatMap(({ candidate, offer }) => [
    {
      part: candidate.role,
      purchasedAs: candidate.id,
      assembly: "proposed—not purchased",
    },
    ...(offer &&
    supportedOffer(
      offer,
      packet.sources.find((s) => s.id === offer.sourceId),
    )
      ? offer.included.map((part) => ({
          part,
          purchasedAs: candidate.id,
          assembly: "included; assembly state " + offer.includedAssembly,
        }))
      : []),
  ]);
  return {
    lines,
    totals,
    allocated,
    unknown,
    physicalBOM,
    shippingGroups: [...groups.keys()],
    mixedCurrencies: Object.keys(totals).length > 1,
    overallTotal: null,
  };
}
export function applicableGuide(packet: Packet, g: Guide) {
  const source = packet.sources.find((s) => s.id === g.sourceId);
  const m = packet.candidates.find((c) => c.id === packet.selected?.movementId);
  if (
    !source ||
    source.access !== "retrieved" ||
    !["live", "fixture"].includes(source.origin)
  )
    return {
      applicable: false,
      reason: "Content not retrieved or imported/manual evidence unverified.",
      executable: false,
    };
  if (g.family === "other" || (g.variant !== null && g.variant !== m?.variant))
    return {
      applicable: false,
      reason: "Wrong or unresolved exact movement variant.",
      executable: false,
    };
  if (
    g.timestampSeconds !== null &&
    !["video", "transcript"].includes(g.access)
  )
    return {
      applicable: false,
      reason: "Timestamp is unsupported by the accessed media.",
      executable: false,
    };
  return {
    applicable: true,
    reason:
      g.access === "title-only" || g.access === "description"
        ? "Discovery context only; video content not accessed."
        : "Planning overview only. Exact interfaces and purchased parts require review.",
    executable: false,
  };
}
export function validatePacket(raw: unknown) {
  const p = packetSchema.parse(raw);
  // Reject forged factual links even when the JSON schema itself is valid.
  for (const c of p.claims) {
    const s = p.sources.find((s) => s.id === c.sourceId)!;
    if (["live", "fixture"].includes(s.origin) && !resolveClaim(c, p.sources))
      throw new Error("Claim does not match retrieved exact-variant evidence.");
  }
  return p;
}
export const assemblyOverview = [
  {
    phase: "Before ordering",
    tools: "Drawings and a documented parts list",
    action:
      "Resolve movement variant, holder, dial feet/date position, hand stack and case interfaces. Confirm included versus preassembled contents.",
  },
  {
    phase: "Prepare",
    tools:
      "Clean bench, movement holder, magnification and protective handling tools",
    action:
      "Review applicable instructions and inventory received parts. Obtain qualified help for unresolved operations.",
  },
  {
    phase: "Dial, hands and casing — blocked",
    tools: "Exact part-specific tools still to be established",
    action:
      "Do not execute dependent fitting operations until dimensions, datums and clearances are resolved.",
  },
  {
    phase: "Inspect and test",
    tools:
      "Appropriate timing/inspection and qualified pressure-testing equipment",
    action:
      "Plan alignment, sweep, crown operation and function inspections. No water-resistance claim without applicable physical testing.",
  },
] as const;

/** Fixture-testable live receipt gate; only an actual smoke run supplies live evidence. */
export function liveSmokePass(p: Packet) {
  return (
    ["complete", "partial"].includes(p.run.state) &&
    p.run.provider === "codex-local" &&
    p.run.capabilities.includes("public-web-discovery") &&
    options(p).some((o) => o.status === "provisional") &&
    p.sources.some(
      (s) => s.url.includes("namokimods.com") && s.access === "retrieved",
    ) &&
    p.sources.some((s) => s.url.includes("alibaba.com")) &&
    p.guides.length > 0
  );
}
