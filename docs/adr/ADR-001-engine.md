# ADR-001: Conversion engine: selective fork of Dark Reader's DOM layer, new colour engine

- Status: Proposed (awaiting review at end of P0)
- Date: 2026-11-04
- Context documents: `RESEARCH.md` §2, §3, §4

## Context

We need a dynamic dark-mode engine that matches Night Eye's output and beats it on first-load speed (F1), staying dark on dynamic sites (F2), colour fidelity (F4), performance (F7), white flash (F10) and canvas apps (F11). The engine must also consume Dark Reader's MIT-licensed site-fix database (2,942 dynamic fixes, 248 inversion fixes, 1,314 dark sites, 230 detector hints), because that database is what makes "works on most sites" achievable for a new project (F12).

Dark Reader's DOM-side layer (`src/inject/dynamic-theme/`, ~7,300 lines) encodes years of edge cases: cascade-order preservation, cross-origin sheet loading, CSS variable type inference, inline styles, SVG attributes, custom elements, shadow roots and a main-world proxy for `insertRule`/`replaceSync`/`adoptedStyleSheets`. Its colour model, however, is HSL-based (`modify-colors.ts`), which conflicts with our OKLCH requirement (F4), and its fetch guard runs in the content script rather than the background (see CVE-2025-68467 analysis).

## Options

### A. Embed the npm package `darkreader@4.9.134`
- Pros: zero engine work; tracks upstream.
- Cons:
  - The API build runs entirely in the page. It fetches cross-origin CSS with plain `fetch` (subject to CORS) unless you plug in your own `fetch`, so we would still build the background fetch layer.
  - Colour transform is HSL and not pluggable. F4 (OKLCH, lightness ordering, APCA clamp) is impossible without patching.
  - No hooks for instant-on caching (F1b), worker offload (F1c), runaway-loop detection (F7), or our nonce-validated main-world channel (§8).
  - Single global instance; per-frame/per-shadow-root control is limited.
- Verdict: rejected. We would be fighting the API for every §4 fix.

### B. Full fork of the Dark Reader repo
- Pros: everything works on day one, including UI and background.
- Cons: inherits the MV2 Firefox build, the custom build system (`tasks/cli.js`), Preact-like custom UI framework (`malevic`), HSL colour model, the content-side fetch check, and ~60 K lines we would have to understand to change safely. Merging upstream fixes becomes painful once we restructure into the §6 package layout.
- Verdict: rejected as the starting point. Too much code we do not want.

### C. Clean-room engine
- Pros: full control, no licence notice to carry, architecture exactly as §6.
- Cons: re-discovering cascade-order, `@import`, `@layer`, CSS variable inference and shadow DOM edge cases would take months and would still not consume the fixes DB correctly unless we reproduce Dark Reader's selector and variable semantics exactly.
- Verdict: rejected for the DOM layer; chosen for the colour, image, cache and fetch layers.

### D. Selective fork (chosen)
Port specific Dark Reader modules into `packages/` with attribution, rewrite the rest.

| Our package | Source | Treatment |
|---|---|---|
| `engine/color` | none | **New.** OKLCH parse/convert (all CSS colour syntaxes incl. `color-mix()`, relative colours, `oklch()`), role-based lightness mapping, ordering preservation, WCAG 2.2 + APCA clamp, LRU ≥ 10 k. Pure functions, unit-tested. |
| `engine/css` | `modify-css.ts`, `variables.ts`, `css-rules.ts`, `css-text/*` | **Port** with the colour calls swapped to `engine/color`. Add `@layer`, `@container`, `@scope` handling. Keep `--darkreader-*` variable names as aliases so fixes DB CSS works unchanged. |
| `engine/fixes` | `config-manager.ts` parsing, `fixes.ts` | **Port parser**; add JSON format and signature check (F12). |
| `engine/image` | `image.ts` | **New** classifier (photo / icon / logo / diagram / screenshot) running in offscreen document / worker; Dark Reader's sampling thresholds used as baseline. |
| `content/` | `index.ts`, `style-manager.ts`, `stylesheet-modifier.ts`, `inline-style.ts`, `watch/*`, `meta-theme-color.ts` | **Port** and restructure: mutation batching per animation frame, work cap per frame, runaway-loop detector (F7), lazy off-screen analysis (F1d). |
| `main-world/` | `stylesheet-proxy.ts` | **Port**, then add `CSSStyleSheet.replace`, SPA navigation hooks, per-tab nonce, schema-validated messages (§8). |
| `background/fetch` | `utils/network.ts` | **New**, background-enforced, per `RESEARCH.md` §4. Dark Reader's localhost alias list reused. |
| `background/cache` | none | **New**: IndexedDB generated-CSS cache keyed by origin + hash(sheet URLs + ETags) (F1b). |
| config data | `src/config/*` | **Consume as data**, shipped in the signed fixes bundle. |

## Decision

Option D. Pin the upstream commit we port from (`e79222971bcae472a28f20de67c07d5a6de45148`, 2026-11-03, v4.9.134) and record it in `THIRD_PARTY_NOTICES.md` together with the full MIT licence text and copyright line "Copyright (c) 2026 Dark Reader Ltd.". Every ported file keeps a header comment naming its upstream path.

## Consequences

- Our own engine is MIT too (F6), so licence compatibility is straightforward.
- We must track upstream fixes to ported modules by hand. A monthly job diffs the ported upstream paths against the pinned commit and opens an issue listing changes.
- The fixes DB stays compatible as long as we keep (a) Dark Reader's directive syntax, (b) `${colour}` template semantics, run through our transform, and (c) the `--darkreader-neutral-background`, `--darkreader-neutral-text` and related variable names. Contract tests in `tests/unit/fixes-compat` lock this.
- Our colours will differ visually from Dark Reader's for the same fix. Some fixes tuned to HSL output may look off. The harness flags sites where our bright-area or contrast score is worse than Dark Reader's, and we override those in our own fixes layer.
- Estimated porting effort: P2 is the largest phase (about 3,500 lines ported, about 4,000 new).
