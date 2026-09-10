# Reserved: M1 visual-asset workstream

The parallel visual-asset workstream owns candidate geometry/material implementation here.
Do not replace it with another polished library. The integrator owns contract.ts, domain,
commands, semantic artwork, viewport, cameras, fonts, exports, storage and application UI.

Implement `createWatchAsset: CreateWatchAsset` from `../contract.ts`. See
`docs/RENDERING_CONTRACT.md` for coordinate, identity and lifecycle requirements.
Place provenance and reproducible recipes with the candidate. No new dependencies,
remote assets, private reference copies, or supplier/physical claims.

`../watch.ts` is a temporary legacy stand-in, not the candidate or an accepted baseline.
Integration is pending candidate delivery and review; do not edit that stand-in concurrently.
