# Hand, material and named-model authoring studies

This additive source candidate supplies four original hand sets (pencil, sword,
dauphine, spade), five procedural finish appearances (titanium, champagne gold,
bronze, ink ceramic, woven textile), and six named exterior studies: Rolex
GMT-Master II, Submariner, Day-Date and Daytona; Audemars Piguet Royal Oak; Patek
Philippe Nautilus. Exact selected references and source URLs are retained in
`src/render/assets/model-recipes.ts`. Existing original Atelier presets and nine
color studies remain unchanged.

These are authored concept reconstructions, not official meshes or precise replicas.
Brand text uses IBM Plex Sans Condensed as disclosed substitute typography. The
Rolex coronet is a geometric approximation. No brand font, photograph, external
mesh or official logo file is bundled. Third-party brand/design rights are unassessed;
source attribution and the font license do not confer unrelated rights. Original
source authoring is not a global originality clearance.

## Integration boundary

The current host seam is `watch-render-v1`: one unit is one mm, XY dial, +X three,
+Y twelve, +Z outward, artwork datum Z=3.45. Main owns canonical design/schema,
semantic artwork/fonts, studio/cameras, history/storage and app integration.
New leaf modules are under `src/render/assets/`. They are authoring factories,
not drop-in implementations of the entire host `WatchAsset` interface. The earlier
M1 candidate uses an older whole-renderer seam and Z=3.2; reconcile it explicitly.

`createHandSet` accepts a registered recipe/version, appearance and host hands ID.
It returns detached independently owned geometry and supports presentation changes.
`createModelStudy` accepts a fixed study/version, six host component IDs and bounded
calendar/time presentation plus two already-ready borrowed sRGB artwork maps.
Maps must match the exact study/presentation key. Region IDs are stable derived
names, not invented persisted object IDs. New complication and logo object IDs
must be designed by the integrator. Recreate the detached study for a new input;
dispose old owned meshes/materials/geometries, including instanced buffers. The host
alone disposes artwork textures. No listeners, fetches or product state in factories.

The test host retains semantic text records, verifies the bundled font hashes,
creates two bounded 2048-square maps, captures input before async work, discards
stale results and blocks exports until the newest result is ready. Its selectors
are fixture inputs, not saved-design controls. No new dependency, lockfile, route,
global script or domain field is added by this batch.

## Verification and preview

Use the existing pnpm installation and `pnpm dev --port 5186`, then open
`/tests/assets/brand.html` or `/tests/assets/parts.html`. Fixed front, oblique,
profile and detail views use production asset geometry. Study output is 1600×1200,
DPR 1, ACES/sRGB/exposure 1, the procedural studio and fixed 10:10:30 presentation.
Calendar is day10/THURSDAY, GMT16, elapsed chronograph2h17m37s. Daytona central
seconds is chronograph37; bottom counter is running30. Detail intentionally crops
the outer assembly; front/profile preserve it.

Executed in the source worktree on macOS arm64, Three0.186.0 and headed Chromium153
with ANGLE Metal Apple M3 Pro:

- `pnpm test`: 41 passed, zero failed/skipped, 9 files.
- `pnpm typecheck`: exit0.
- `pnpm exec eslint src/render/assets tests/assets/brand*.ts`: exit0.
- `pnpm exec vite build --config tests/assets/brand.vite.config.ts`: exit0;
  708.68 kB JS /184.58 kB gzip; the existing >500 kB warning remains.
- `pnpm exec playwright test --config tests/assets/playwright.config.ts --headed`:
  34 passed, zero skipped,38.3s. Includes prior originals/colors/hand studies and
  eight new model cases. New cases cover all six×four PNGs, live/export pixel
  equality, real date changes, delayed dependencies, missing fonts, replacement
  resources and pointer orbit. Tests also seed bad semantic mappings and inputs.

Representative Day-Date resources remained248 geometries/4 textures after12
alternating RoyalOak/Daytona replacements and return. Draw248calls/51,748triangles.
The date/weekday edit changed839 pixels. Warm preparation/hash/create/dispose/render
submission samples ranged83.2–103ms; this is not GPU completion or a general FPS
claim. Hand fixture separately retained70geometries/3textures across25replacements.
Raw local reports and renderer PNGs are intentionally excluded from publication.

After the full gate, two sport-hour roundel heights were separated to remove a
visible coplanar artifact. Final delta:5 unit tests, typecheck and scoped lint pass;
all8 model browser cases pass in14.7s. The full34-case report predates only this
two-number change. The independent reviewer closed the three findings at the prior
source checkpoint; final roundel delta is builder-reviewed. Actual final source
hashes and dependency records are in `studies-registry.json`.

Independent read-only reviews covered the plan and implementation. Three model
defects were repaired with regression assertions: caller mutation across awaits,
RoyalOak instance-buffer disposal, and Daytona counter-scale label coordinates.
Builder visual inspection found and repaired overlapping bezel/calendar artwork;
zero-bezel marks and sport twelve-index lume were added. Human acceptance is pending.

## Natural pause and remaining work

Ready for source review and integration, not product/deployment acceptance. These
are simplified exterior studies: stiff short bracelet segments, simplified lugs,
flat/overdark reflections at some angles, approximate brand marks, no cyclops
magnification, no gem simulation, no clasp and no faithful exhibition backs. Further
surface polish and reference fidelity remain. No actual caliber or engineering
interface is modeled; all six selected references are self-winding examples.
Automatic/manual-wind/quartz support remains an explicit integration proposal,
not a fake movement hidden under a solid back. Broader case/strap/movement/logo
controls require main-owned canonical changes. No save/reopen/import or combined
app acceptance is claimed by these fixture tests. Stop for integration and human
visual review; no merge, deployment or later milestone is performed.
