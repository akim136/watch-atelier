# Unintegrated asset source overlay

The candidate preserves the existing older `buildWatch`, `WatchViewport` and
`exportPNG` renderer interfaces. It depends on the host's canonical `Design`,
commands, bundled fonts and pinned dependencies. The public main base supplies
current host files, but that does not prove compatibility with the older asset
snapshot. Shared application state remains integrator-owned.

The main app has since established `watch-render-v1` in `src/render/contract.ts`.
Its asset/artwork ownership and Z=3.45 mm artwork plane must be reconciled explicitly
with this older renderer, which uses its own projection and Z=3.2 mm artwork plane.
Do not transplant this entire renderer as an already-integrated factory.

One unit is one millimeter. All dimensions and materials are authored concept
targets, not measured hardware or supplier properties. Semantic IDs come from the
host; no new persisted design schema is owned here. Each rendered instance owns its
resources and must be independently disposed.

`registry.json` preserves source and dependency hashes; `font-provenance.json` and
`IBM-Plex-OFL.txt` retain the font source and license. The registry references the
host's bundled fonts; this overlay has not passed the combined application gates.
No new license grant or third-party brand asset is implied by publication.

After adaptation, run the asset geometry, font, registry and lifecycle tests and
actual inspection fixtures, then the host's full editing/history/storage/import/
export/privacy and browser gates. Compare all four views and clean PNG output.
New public-snapshot publication did not rerun the asset suites or accept visuals.
