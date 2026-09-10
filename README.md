# Watch Atelier

A local-first watch-design studio with revision-bound build research. Design an
original concept, edit its dial, inspect it in 3D, compare variants, and investigate
real parts without silently changing the watch.

Hackathon candidate, not manufacturing software or a physically qualified build.

## Run locally

Requires Node >=22.12, pnpm 10.13.1, and desktop Chrome for browser tests.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
```

Open http://127.0.0.1:5173. Reuse an existing server if one is already running.

For optional public-source research, stop the plain development server and run:

```sh
pnpm dev:research
```

The research adapter requires an installed local Codex CLI at
`~/.local/bin/codex`, existing authentication, and access to the configured
`gpt-6-astra` model. CLI 0.154.0 was tested. No credentials are supplied by this
repository. Subscription-authenticated work is not free or unlimited. There is no
paid API fallback. Manual and saved research remain usable without the provider.

## Try the loop

1. Add an optional local inspiration image and like/avoid annotations.
2. Edit dial color, lettering, markers and hands. Orbit the concept watch.
3. Lock a field, undo/redo, and create an independent comparison variant.
4. Save/reopen, export an editable shared design, or capture a clean PNG.
5. Select **Research this build**, confirm design targets, quantity and the public
   payload, and explicitly consent to the research request.
6. Inspect actual source links, variant stock conflicts and unknown fit checks.
   Select a provisional plan; inspect partial costs and assembly resources.
7. Save/reopen/export the research packet. Editing the watch marks old research
   stale; sourcing does not replace the rendered concept.

A useful synthetic brief is a single everyday watch, 39 mm as a soft target,
dark teal dial and warm strap. Use actual retrieved sources for the demonstration,
not fictional supplier listings. A subtotal is not the total price of a build.

## What Astra does

The local headless adapter uses `gpt-6-astra` for bounded public-web discovery.
The host retrieves supported pages and records evidence. Deterministic code
checks supported fit rules and calculates prices, quantities and bundles.
Image analysis, photo-to-CAD and AI-generated watch geometry are not implemented.

## Verification and limits

```sh
pnpm test
pnpm test:e2e
pnpm typecheck
pnpm lint
pnpm check:boundaries
pnpm build
pnpm verify
```

`pnpm research:smoke` performs an explicit live public-only research job and uses
the configured account. It is not part of the default offline tests.

The unchanged application snapshot passed 56 unit/integration tests and 14 Chrome
tests, lint, typecheck, boundary checks and build. A real local-browser research
journey returned four candidates and completed select, cost, save, reopen and
export. See [verification](docs/VERIFICATION.md) for the boundaries of those claims.

The renderer on `main` remains a temporary original concept. Separate
`assets/m1-visuals` and `assets/library-expansion` branches preserve committed
parallel asset candidates as source overlays, not integrated application releases.
Their tests require the matching host/support context; do not replace the current
renderer wholesale without integration review. Uncommitted asset work is excluded.

Visual acceptance, asset integration and some local-service failure/isolation tests
remain pending. Safari is unverified; dial text is ASCII. Browser storage can be
evicted. No purchases, hosted service, physical fit approval or manufacturing release.

## Privacy and publication

This is a curated public source snapshot, not the private development history.
Raw prompts, personal context, private references, account material and local
reports are excluded. See [privacy and security](docs/PRIVACY.md).

IBM Plex font files retain their [OFL license](public/fonts/OFL.txt). Public
visibility does not by itself grant a software license; no new blanket license
has been added to this project.
