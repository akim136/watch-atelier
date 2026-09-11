# Rectangular family source handoff

This first integration slice contains `atelier-rectangle-01` (original rectangular
dress composition, leather-look strap) and `cartier-tank-wsta0106` (attributed Tank
Must reference study, steel-look bracelet). Hamilton field and NOMOS small-seconds
remain researched targets. The saved-family milestone is incomplete until the main
builder integrates the canonical contract described in FAMILIES-INTEGRATION.md.

Both assets are procedural concept geometry. The reference uses Cartier's published
33.7×25.5×6.6mm exterior dimensions, two blue sword hands and cabochon direction.
Dial opening, bracelet geometry, attachment widths and all internal/side details
are authored approximations. The original is28×36×7.6mm with a different dial layout.
There is no movement model, performance or fit claim. Cartier describes WSTA0106
as quartz; that source fact is not a simulated caliber or a saved movement choice.

The official page is linked in the recipe/registry. Its text was reviewed on
September10,2026. The official Cartier image fetch returned403, so photographic
fidelity comparison was unavailable. No brand photographs were bundled. The
editable CARTIER string uses the existing licensed IBM Plex Sans Condensed font,
not Cartier's exact wordmark artwork. Originality/rights clearance is not asserted
for the reference study. Modified appearance is labeled a custom concept.

## Rendering-only contract

`RectangularProjection` is a temporary read-only projection, not a saved Design.
It borrows six existing component identities, two text records, one index-pattern
identity and one minute-track identity. `rectangleFixture()` explicitly extracts
these from the existing fixture and supplies registered family values. Never assign
these IDs to the existing fixed39mm Design or save the fixture as a new document.

One unit is one millimeter. XY is the face, +X is3o'clock, +Y is12, +Z is outward.
Artwork is atZ3.45; crystal and raised rails atZ4.25; back at4.25−recipe thickness.
Clockwise angles are negative Z rotations from +Y. The two hands rotate separately;
10:10:30 is a presentation input. No second hand is invented for this dress pair.

Call `requireProjection`, then `rectangularArtwork` to obtain retained text and
line records in mm. The host measures text with the verified font, draws a square
32mm artwork canvas, and supplies `RectangularInput.artwork`: exact artwork key,
ready flag, sRGB square texture up to2048px, and one actual bound per nonempty text
or line. Bound centers/IDs must match records; all corners must fit the rounded dial.
The UV mapping clips the actual rectangle without stretching glyphs. Empty text
removes its target. Font failure must block faithful export rather than substitute.

`createRectangularAsset` returns a detached root, pickables, region mapping,
synchronous `update` and idempotent `dispose`. Every region retains the supplied
component/object identity; both hand nodes map to the existing hands component.
`rectangularInstanceKey` declares replacement identity. A changed recipe/version,
design owner or semantic IDs requires constructing a new asset before retiring
the accepted one. Ordinary dial/material/time edits retain fixed geometry.

Updates validate and stage before modifying accepted output; partial construction
and finish-preparation errors release only new owned resources. Each instance owns
its geometries/materials/finish maps. Dial textures, the environment and Three's
global lookup texture remain host/renderer-owned. The fixture clones before awaits,
discards stale completions and binds export readiness to the latest accepted input.

Roman/cardinal layout is fixed recipe content pending canonical pattern support.
Index length scales numeral size or baton length; index color, both text records,
dial color and track visibility/color remain separate semantic fields. The old
baton/dot `style` field is deliberately rejected. Case looks and independent metal
bracelet looks reuse the accepted appearance library. Leather recipes reject
bracelet overrides; this dress pair rejects colored/rotating bezel styles.

## Reproduce and integrate

Use installed repository dependencies and the existing scripts:

```sh
pnpm test tests/assets/rectangular.test.ts
WATCH_ASSET_PORT=5191 pnpm exec playwright test --config tests/assets/playwright.config.ts --headed tests/assets/rectangular.spec.ts
pnpm exec vite build --config tests/assets/rectangular.vite.config.ts
pnpm dev --port 5191
```

The scoped authoring fixture is `/tests/assets/rectangular.html`; it is not a second
editor or production route. Captures use production asset code,1600×1200,DPR1,
sRGB/ACES/exposure1, the existing procedural studio, a verified2048px artwork map,
fixed Front/Oblique/Profile/Detail cameras and fixed presentation. Capture hashes
and the full rendering projection accompany PNGs in ignored local test reports.
PNG/live comparisons use decoded pixels on the same renderer, not driver-independent
bitwise goldens. Browser tests exercise actual controls, orbit and failure recovery.

Main integration must register saved family identity/dimensions/patterns through
the existing mutation boundary, then validate save/reopen/history/import/compare.
The proposed `rectangular-test-map.json` contains additive exact-title inventory
entries for the main builder to merge into the appropriate shared maps; it does
not replace any existing case or assertion. Until then, `pnpm verify` correctly
fails its unmapped-test inventory even when every underlying command succeeds.
No shared schema, lockfile, package scripts, app routing or STATUS changes are made.

The independent plan/implementation reviewer closed the hit-center and identity
replacement findings. The builder fixed two visible coplanar seams and shortened
the minute tip after inspecting rendered numerals. A new zero-texture disposal
assertion was corrected using an independent physical-box control: Three r186
caches a16×16 DFG_LUT globally; both control and disposed watch report0geometries/
1texture. Tests require equality with that pinned control and exact mounted-resource
restoration. Assets do not dispose a renderer resource shared with other views.

This handoff is ready for main integration review, not deployment or human visual
acceptance. Exact candidate hashes, commands, results and limitations are recorded
in the accompanying registry and local integration evidence note.
