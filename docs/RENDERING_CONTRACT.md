# Main rendering seam — watch-render-v1

The canonical DesignV1, mutations, history, references, persistence, artwork,
fonts, cameras and PNG export remain host-owned. Candidate geometry/materials
belong under `src/render/assets/`. Source interface: `src/render/contract.ts`.

- One Three unit = 1 mm. Right-handed XY dial plane; +X at 3 o'clock, +Y at
  12 o'clock, +Z toward the front camera. XY origin is dial center. Artwork plane
  is Z=3.45 mm. Do not bake presentation rotation or scale into the root.
- Original `atelier-39-v1` concept targets: diameter 39, lug-to-lug 46.5,
  lug width 20, overall thickness 10.8 and dial diameter 32 mm. Not measured parts.
  All hand rotations share the XY origin; offset shapes inside local geometry.
- Semantic IDs come from the host design. Pickable nodes carry the corresponding
  `userData.semanticId`; no invented persisted IDs or independent editable state.
- Host `dialTexture` is sRGB, oriented +Y at 12, and contains accepted text/color/
  track. Assets must not repaint it. Marker geometry follows canonical parameters.
- `createWatchAsset(input)` returns a detached root, pickables and warnings.
  `update(input)` is synchronous; the host rejects stale asynchronous inputs.
  Reuse unaffected geometry. Do not mutate input or attach application listeners.
- `dispose()` is idempotent and releases owned resources only. Never dispose host
  textures, fonts, renderer or camera. Instances cannot share mutable GPU state.
- Live, comparison and clean 1600x1200 PNG must use the same factory. Output is
  sRGB/ACES, exposure 1. No reference images, selection overlays or UI in clean PNG.

The separate legacy asset branches predate this seam and require explicit adaptation
and integration tests, not a wholesale merge. No catalog/physical qualification or
new production dependencies. Human visual acceptance remains separate.
