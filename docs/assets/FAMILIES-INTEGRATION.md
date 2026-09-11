# Main integrator: canonical family checkpoint

This is a concrete integration request, not a competing schema implementation.
Current canonical `Design.template` and dimensions are literals for one39mm round
watch. Bezel/material appearance does not encode family identity. Keep existing
documents byte/appearance compatible; don't hide geometry choice in a session selector.

Proposed registered original asset IDs: `atelier-rectangle-01`, `atelier-field-01`,
`atelier-small-seconds-01`. Reference-study IDs: `cartier-tank-wsta0106`,
`hamilton-field-h69439931`, `nomos-tangente-165`. Asset version1.0.0; rendering source
will retain exact family dimensions, layouts, allowed hand topology and provenance.
Main chooses the canonical representation and migration/version policy. Asset values
are fixed family recipes, not M3 free case-geometry controls.

Required main-owned behavior before the next catalog batch:

1. Select a registered template through the atomic mutation boundary. Store its
   identity/version and validated dimensions; keep original/reference/custom-concept
   provenance distinct. A reference with edits must never be labeled a catalog variant.
2. Preserve semantic text, pattern/track and component IDs or explicitly remap them
   atomically. Support two hands, central seconds or fixed off-center small seconds;
   numeric layouts remain editable semantic patterns, not a flattened saved PNG.
3. Validate text bounds against the actual dial shape. A rectangular dial cannot
   reuse a circular clipping test. Make family-incompatible controls explicit;
   don't let a blocked control pretend to apply. Fixed presentation is not a caliber.
4. Save/reopen, undo/redo, duplicate/compare and editable import/export must retain
   family/marks/appearance. Reject unknown IDs/versions without substitution. Old
   projects preserve original39mm appearance; BI snapshots must become stale and
   must not source parts from fictitious inherited round dimensions.
5. Run real combined journeys and PNG parity, then human visual acceptance. Retain
   existing evaluation gates. Schema/command/routing/test-map changes stay main-owned.

Assets can proceed through rendering-only fixtures while this contract is unresolved.
The family milestone cannot be marked saveable/complete until these checks pass.
No new models beyond this three-family batch should precede that checkpoint.
