# Public asset candidate

This branch adds ten reviewed source/test/documentation files to public asset base
`ec5871057cc84b8effdf3d9898ab31662266fc0f`. No private development ancestry or raw
evidence was copied. The four existing hand/material files and earlier original
assets remain inherited from that curated base. New source hashes are recorded in
`studies-registry.json`. Recipes and fixtures are byte-identical to the tested
source snapshot; public narrative documentation is intentionally curated.

Publication is a source handoff, not integration acceptance. The new five unit
tests pass in this public checkout. Whole-checkout `pnpm typecheck` exits2 because
the inherited older asset overlay is incompatible with the main app seam:
`sameCamera` is missing, the viewport constructor differs, and `tests/watch.test.ts`
expects the current host input/root interface. The unchanged public base reproduces
the same errors. These are main-integrator work; no canonical/app edits are included
here. The separate asset fixture checks reported in STUDIES.md remain valid.

Use the new model factories and retained recipes during integration; do not merge
the whole historical renderer overlay blindly. Reconcile the original template
to `watch-render-v1`, add approved canonical selections for the expanded studies,
then rerun the combined application gates and obtain human visual acceptance.
No deployment or merge performed. This branch preserves a natural asset pause.
