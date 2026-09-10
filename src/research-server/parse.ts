import { z } from "zod";
import {
  type Source,
  type Observation,
  type Candidate,
  type Offer,
  type Claim,
  type Guide,
} from "../build/model.ts";
import { quantityValue } from "../build/evaluate.ts";
import { plain } from "./retrieve.ts";

export const seeds = [
  "https://www.namokimods.com/products/seiko-sii-nh35a-automatic-movement",
  "https://www.namokimods.com/products/nmk912-field-watch-case-polished-finish",
  "https://www.timemodule.com/en/product_line_up/mechanical/mechanical/mechanical_NH0_NH3/",
  "https://germany.alibaba.com/product-detail/36-39mm-Sapphire-Glass-Nh35-Watch_1601913483042.html",
  "https://www.namokimods.com/en-au/blogs/namokitimes/watch-modding-101-guide-for-beginners",
];
const productSchema = z.object({
  title: z.string().max(240),
  description: z.string().max(30000),
  variants: z
    .array(
      z.object({
        id: z.number(),
        title: z.string().max(100),
        sku: z.string().max(100),
        price: z.number().int().nonnegative(),
        available: z.boolean(),
        quantity_rule: z.object({
          min: z.number().int().positive(),
          max: z.number().int().positive().nullable(),
          increment: z.number().int().positive(),
        }),
      }),
    )
    .max(30),
});
export function parseSource(
  source: Source,
  html: string,
): {
  candidates: Candidate[];
  offers: Offer[];
  claims: Claim[];
  guides: Guide[];
} {
  const result: ReturnType<typeof parseSource> = {
    candidates: [],
    offers: [],
    claims: [],
    guides: [],
  };
  if (source.access !== "retrieved") return result;
  const text = plain(html),
    url = new URL(source.url);
  source.title = plain(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? url.pathname,
  ).slice(0, 240);
  if (
    url.hostname.includes("namokimods.com") &&
    url.pathname.includes("/products/")
  ) {
    const json = html.match(
      /<script[^>]*id=["']ProductJson-[^"']+["'][^>]*>([\s\S]*?)<\/script>/i,
    )?.[1];
    const currency = html.match(
      /Shopify.currency\s*=\s*\{\s*"active"\s*:\s*"(USD|SGD|EUR|GBP)"/,
    )?.[1] as Offer["currency"] | undefined;
    if (!json || !currency) {
      source.limitation =
        "Variant JSON or explicit same-response currency unavailable; no offer extracted.";
      return result;
    }
    const parsed = productSchema.safeParse(JSON.parse(json));
    if (!parsed.success) {
      source.limitation =
        "Product structure unsupported; exact variants and price not extracted.";
      return result;
    }
    const p = parsed.data,
      description = plain(p.description);
    const role = /seiko-sii-nh35a-automatic-movement/.test(url.pathname)
      ? "movement"
      : /nmk912-field-watch-case-polished-finish/.test(url.pathname)
        ? "case"
        : null;
    if (!role) {
      source.limitation =
        "Outside the two supported product parsers; retained for discovery only.";
      return result;
    }
    const variants =
      role === "movement" ? p.variants.slice(0, 1) : p.variants.slice(0, 2);
    for (const v of variants) {
      const id = source.id + "-" + v.id,
        variant = v.sku + " / " + v.title;
      const candidate: Candidate = {
        id,
        role,
        name: p.title,
        variant,
        exactVariant: true,
        sourceId: source.id,
        claimIds: [],
        aesthetic:
          role === "case"
            ? "Polished field-case direction; dimensions are supplier-reported, not the rendered component."
            : "NH35-family discovery; exact manufacturer hand-height code unresolved.",
        questions: [
          "Confirm exact manufacturer variant, technical drawings, quantity availability, returns and sample policy.",
        ],
        realization: "proposed-source-not-rendered",
      };
      result.candidates.push(candidate);
      const add = (
        property: Observation["property"],
        value: Observation["value"],
        unit: Observation["unit"],
        locator: string,
        datum = "",
      ) => {
        const oid = id + "-" + property + "-" + source.observations.length;
        source.observations.push({
          id: oid,
          subject: id,
          variant,
          property,
          value,
          unit,
          datum,
          tolerance: null,
          locator,
          excerpt: "",
          basis: "seller-reported",
        });
        const cid = "claim-" + oid;
        candidate.claimIds.push(cid);
        result.claims.push({
          id: cid,
          sourceId: source.id,
          observationId: oid,
          subject: id,
          variant,
          property,
          value,
          unit,
          status: "reported",
        });
        return oid;
      };
      if (role === "movement" && /Caliber Number:\s*NH35A/i.test(description))
        add(
          "family",
          "NH35",
          "text",
          "ProductJson.description: Caliber Number",
        );
      if (role === "movement" && /NH36A/.test(html)) {
        source.conflicts.push(
          "Parent description identifies NH35A; other page metadata contains NH36A. Confirm exact supplied manufacturer code.",
        );
        candidate.questions.push(
          "Resolve conflicting NH35/NH36 metadata before procurement.",
        );
      }
      if (role === "case") {
        for (const [property, regex, datum] of [
          ["diameter", /Diamete\s*r:\s*([\d.]+)\s*mm/i, "outside diameter"],
          [
            "height",
            /Thickness:\s*([\d.]+)mm\s*\(Case with Slim Caseback\)/i,
            "with slim caseback",
          ],
          ["lugWidth", /Lug Width:\s*([\d.]+)mm/i, "lug opening"],
        ] as const) {
          const match = description.match(regex);
          if (match)
            add(
              property,
              Number(match[1]),
              "mm",
              "ProductJson.description: " + property,
              datum,
            );
        }
      }
      const included: Offer["included"] = [];
      const contents: [Offer["included"][number], RegExp][] =
        role === "case"
          ? [
              ["crystal", /Flat Sapphire Crystal/],
              ["crown", /SKX013 Sterile Crown/],
              ["caseback", /SKX Slim Caseback/],
              ["gasket", /Caseback Gasket/],
              ["springbars", /Pair of 20mm Springbars/],
            ]
          : [
              [
                "stem",
                /(?:^|[.!?]\s*)Comes supplied with watch stem(?:[.!?]|$)/i,
              ],
            ];
      const inclusionText =
        role === "case"
          ? (description.match(
              /Each case comes in a set inclusive of:\s*([\s\S]*)/i,
            )?.[1] ?? "")
          : description;
      for (const [part, regex] of contents)
        if (
          regex.test(inclusionText) &&
          !/\b(?:not|without|excluded|separately)\b/i.test(inclusionText)
        )
          included.push(part);
      const conflict =
        role === "case" &&
        (text.includes(v.title + " is backordered") ||
          (!v.available && html.includes("schema.org/InStock")));
      const stock: Offer["stock"] = !v.available
        ? "unavailable"
        : conflict
          ? "conflicting"
          : "reported-available";
      if (conflict)
        source.conflicts.push(
          v.title +
            ": page-level/structured stock signals disagree; selected-variant availability remains unresolved.",
        );
      const offer: Offer = {
        id: "offer-" + id,
        candidateId: id,
        sourceId: source.id,
        variant,
        seller: "namokiMODS",
        currency,
        tiers: [{ minPacks: v.quantity_rule.min, priceMinorPerPack: v.price }],
        packQuantity: 1,
        moqPacks: v.quantity_rule.min,
        multiplePacks: v.quantity_rule.increment,
        maxPacks: v.quantity_rule.max,
        minimumSpendMinor: null,
        observedAt: source.retrievedAt,
        stock,
        exactVariant: true,
        quantityConfirmed: false,
        included,
        includedAssembly: "unknown",
        evidenceIds: [],
        limitation:
          "Observed storefront price/order rules only. No quantity fulfillment, shipping, tax, quality or physical-fit guarantee.",
      };
      offer.evidenceIds.push(
        add(
          "price",
          v.price,
          "minor",
          "ProductJson.variants[id=" +
            v.id +
            "].price; Shopify.currency.active",
          currency + ":minPacks=" + v.quantity_rule.min,
        ),
      );
      offer.evidenceIds.push(
        add(
          "quantity",
          quantityValue(offer),
          "text",
          "ProductJson.variants[id=" +
            v.id +
            "].quantity_rule; one listed movement/case bundle",
        ),
      );
      offer.evidenceIds.push(
        add(
          "stock",
          stock,
          "text",
          "ProductJson.variants[id=" +
            v.id +
            "].available; page backorder/JSON-LD cross-check",
        ),
      );
      if (included.length)
        offer.evidenceIds.push(
          add(
            "included",
            included.join(","),
            "text",
            "ProductJson.description: supplied/included contents",
          ),
        );
      result.offers.push(offer);
    }
  } else if (url.hostname.includes("alibaba.com")) {
    source.limitation =
      "Live listing retrieved; multiple size variants share the page. Selected variant, applicable price tier, quantity eligibility and included contents are unresolved. No exact offer is costed.";
    const jsons = [
      ...html.matchAll(
        /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi,
      ),
    ];
    for (const m of jsons) {
      try {
        const parsed: unknown = JSON.parse(m[1]);
        const products = (Array.isArray(parsed) ? parsed : [parsed]) as Record<
          string,
          unknown
        >[];
        const p = products.find((x) => x["@type"] === "Product");
        if (!p || typeof p.name !== "string" || !/NH35/i.test(p.name)) continue;
        const seller =
          typeof p.description === "string"
            ? p.description.match(
                /(?:von |from )([A-Z][A-Za-z ,.&-]+(?:Ltd\.|Limited))/,
              )?.[1]
            : undefined;
        if (seller) source.publisher = seller.slice(0, 180);
        result.candidates.push({
          id: source.id + "-listing",
          role: "case",
          name: plain(p.name).slice(0, 240),
          variant: "36mm / 39mm unresolved",
          exactVariant: false,
          sourceId: source.id,
          claimIds: [],
          aesthetic:
            "Seller title suggests a related NH35 case; dimensions and selected variant need evidence.",
          questions: [
            "Confirm exact size variant, holder/dial/stem interfaces, pack contents, applicable quantity-tier price and stock.",
            "Platform protection or assessment labels do not qualify this component.",
          ],
          realization: "proposed-source-not-rendered",
        });
        break;
      } catch {
        /* Invalid metadata is not evidence. */
      }
    }
  } else if (url.hostname.includes("timemodule.com")) {
    source.limitation =
      "Manufacturer family documentation retrieved. Exact supplied movement code and drawings still required.";
    const match = text.match(/NH35 Size:.*?Height:\s*([\d.]+)mm/);
    if (match)
      source.observations.push({
        id: source.id + "-nh35-height",
        subject: "NH35",
        variant: "family—not supplied part",
        property: "height",
        value: Number(match[1]),
        unit: "mm",
        tolerance: null,
        datum: "manufacturer family height",
        locator: "NH35 product section / Height",
        excerpt: "",
        basis: "manufacturer-reported",
      });
    result.guides.push({
      id: source.id + "-docs",
      sourceId: source.id,
      title: "TMI NH35 specifications and technical-document links",
      family: "NH35",
      variant: null,
      access: "article",
      locator: "NH35 / Technical Information",
      timestampSeconds: null,
      topics: ["planning", "operation"],
    });
  }
  if (
    url.pathname.includes("/blogs/") &&
    /watch-modding-101-guide-for-beginners/.test(url.pathname)
  ) {
    result.guides.push({
      id: source.id + "-guide",
      sourceId: source.id,
      title: source.title,
      family: "general",
      variant: null,
      access: "article",
      locator: "Beginner guide article; exact-part applicability unresolved",
      timestampSeconds: null,
      topics: ["planning", "tools", "inspection"],
    });
  }
  return result;
}
