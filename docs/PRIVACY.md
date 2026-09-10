# Privacy and security boundaries

## Public versus private

Public: application source, configuration without secrets, lockfile, tests with
synthetic inputs, declarative evaluations, licensed fonts, curated technical docs,
and separately identified original asset-source candidates.

Private/local: personal reference images and annotations, saved projects and
research backups, account authentication, environment files, raw prompts/handoffs,
personal background and plans, machine-specific logs, traces, screenshots and
provider transcripts. Original development history is not published. Public
commits use the owner's GitHub noreply identity rather than a personal email.

Ignore rules are a convenience, not a security boundary: already tracked content
and previous commits must also be reviewed. Publish explicit reviewed snapshots,
never all local branches/tags or a mirror of the private repository.

## Runtime

References stay in browser-local storage. Default design sharing strips private
references, notes, brief and names; personal backup is a separate opt-in. Research
exports contain no image bytes. Review an export before sharing it.

Research runs require explicit consent to a bounded public payload. Private free
text, image bytes, names and annotations are not sent to the web-enabled provider.
The current adapter does not analyze images. Local Codex authentication remains
outside this repository and outside frontend bundles. Do not paste keys into chat,
source files, browser configuration or issue reports.

The optional research service is development-only and loopback-bound, with
same-origin checks, ephemeral authorization, limited concurrency and bounded jobs.
Source retrieval is allowlisted and validates destinations; external content is
untrusted. Do not expose this development server to a public network or tunnel.
Remaining runtime negative-test coverage is documented in VERIFICATION.md.

No external source, imported packet or model result can qualify hardware. Missing
interfaces, stock conflicts, shipping and taxes remain explicit unknowns.

For a suspected leak, stop publication and revoke affected credentials through
their provider before considering history cleanup. Do not post sensitive details
in a public issue.
