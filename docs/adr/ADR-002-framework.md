# ADR-002: Build framework: WXT

- Status: Proposed (awaiting review at end of P0)
- Date: 2026-11-04

## Context

One TypeScript monorepo must produce: Chromium MV3 (Chrome, Edge, Opera, Brave, Vivaldi, Arc, Yandex, Whale), Firefox MV3 desktop + Android (event page, `gecko` id), and a Safari build that goes through `xcrun safari-web-extension-packager`. We need per-browser manifests, per-browser entrypoint inclusion (for example the Firefox-only `theme` sync and `dns` resolver), fast dev reload, small bundles (≤ 1.5 MB per package), and a workspace layout matching §6 of the build prompt.

## Options

| | WXT | Plasmo | Hand-rolled Vite |
|---|---|---|---|
| Latest release (npm) | 0.21.5, 2026-10-26 | 0.90.5, 2025-05-17 | n/a |
| Maintenance | active | no release in ~18 months | ours |
| Per-browser targets | `wxt -b chrome|firefox|safari|edge|opera`; `--mv3` per target | yes | write it ourselves |
| Per-browser entrypoint include/exclude | `include: ['firefox']`, `filterEntrypoints` | limited | manual |
| Per-browser option values (`matches`, `runAt`, `world`) | object keyed by browser | no | manual |
| Runtime flags | `import.meta.env.BROWSER`, `.FIREFOX`, `.MANIFEST_VERSION` | `process.env.PLASMO_BROWSER` | manual |
| UI framework | any (we pick Preact) | React-centric | any |
| Firefox default | MV2 unless `--mv3` (we force MV3) | MV3 | n/a |
| Zip / store submit | `wxt zip`, `wxt submit` | `plasmo package`, BPP | manual |

Source: https://wxt.dev/guide/key-concepts/multiple-browsers.html, npm registry metadata pulled 2026-11-04.

## Decision

Use **WXT**, pinned to an exact version, with **Preact** (about 4 KB) for popup/options/picker UI to keep bundles small. The `engine` package stays framework-free and is built and tested by Vitest independently of WXT.

Layout:
```
apps/extension/        # WXT project: entrypoints only, thin
  entrypoints/
    background.ts      # imports packages/background
    content.ts         # imports packages/content (isolated world, document_start)
    main-world.content.ts  # world: 'MAIN'
    popup/, options/, picker/  # Preact
    pdf-viewer/        # unlisted page, lazy-loaded pdf.js
    offscreen.html     # Chromium only (include: ['chrome','edge','opera'])
packages/engine, content, main-world, background, ui, pdf-viewer
apps/safari-host/      # Xcode project generated once by the packager, then committed
```

Build targets: `wxt build -b chrome --mv3`, `-b firefox --mv3`, `-b edge`, `-b opera`, `-b safari --mv3`. Safari output is fed to `xcrun safari-web-extension-packager --rebuild-project` in CI on a macOS runner.

## Consequences

- WXT is pre-1.0. Breaking changes are possible between minor versions. Mitigation: exact pin, Renovate with manual approval, and the engine does not depend on WXT at all.
- Firefox must be built with `--mv3` explicitly, because WXT defaults Firefox to MV2.
- Dark Reader's custom build tasks are not reused; ported modules are plain TS and build fine under Vite.
- If WXT stalls the way Plasmo has, the fallback is a hand-rolled Vite config. Entrypoints are thin, so the migration cost is low.
