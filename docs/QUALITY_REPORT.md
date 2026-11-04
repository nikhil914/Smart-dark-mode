# Quality report

Harness v1, phase P2. Generated with `pnpm --filter @sdm/harness harness` on 2026-11-04,
Chromium 1.63 build (headless), 1280×800, Linux. Raw numbers are written to
`tests/harness/out/` on every run; CI uploads them as the `harness-results` artifact.

## What is compared

| Mode | What it is |
| --- | --- |
| `none` | Plain browser, no dark mode. Baseline. |
| `ours` | This extension, unpacked build from `apps/extension/.output/chrome-mv3`, default settings. |
| `darkreader` | Dark Reader 4.9.134 npm build injected into every page (`DarkReader.enable()` as soon as `<head>` exists, brightness 100, contrast 100, sepia 0). |

The Dark Reader comparison uses its library build, not the store extension. The library
cannot run before `<head>` exists, so its flash numbers are a little worse than the
extension's would be. Its colour output is the same as the extension's dynamic mode.

## Metrics

| Metric | How it is measured | Good result |
| --- | --- | --- |
| White frames | CDP screencast while the page loads from a dark page, CPU throttled 4×. A frame counts as white when more than half its pixels have luminance > 0.6. | 0 |
| Bright % @1s / @8s | Share of viewport pixels with luminance > 0.6, one and eight seconds after `load`. The 8 s value catches styles added late by scripts (regression check, Night Eye flaw F2). | Low, and no higher at 8 s than at 1 s |
| Text AA % | Visible elements with direct text whose text/background contrast is at least 4.5:1. Walks open shadow roots. Background is the nearest opaque ancestor colour. | 100 |
| Task ms / Style ms | `Performance.getMetrics` TaskDuration and RecalcStyleDuration one second after load. | Close to `none` |
| Extra fetches | Requests with an `Origin` header or `Sec-Fetch-Mode: cors` that reached a trap server on another local port during the security fixture (stylesheet `<link>` loads by the page itself are excluded). | 0 |
| Icon range / photo RGB | Images fixture: luminance range inside a dark, transparent icon (higher means visible on the dark page) and the mean RGB of a photo (must match `none`). | Icon range high, photo unchanged |

## Fixtures

| Fixture | Covers |
| --- | --- |
| `basic` | Plain stylesheet, links, borders, buttons, form fields. |
| `css-vars` | Colours that come only from custom properties, including a variable defined from another variable and one variable used for both a background and a text colour. |
| `css-in-js` | `insertRule` at load, after 500 ms and after 3 s, plus a constructed sheet adopted after 6 s. |
| `shadow-dom` | A shadow root with a `<style>` element and one with an adopted sheet (Lit pattern), both attached before the extension's settings finish loading. |
| `inline` | `style=""` colours, `bgcolor`, SVG `fill`, and inline styles changed after load. |
| `images` | Dark transparent PNG icon and a photo. |
| `security` | Stylesheets pointing at `localhost` on another port, a private IP, an explicit port and `file://`. |

## Results (fixtures)

| Page | Mode | White frames | Bright % @1s | Bright % @8s | Text AA % | Task ms | Style ms | Extra fetches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| basic | none | 1/2 | 98.9 | 98.9 | 94.7 | 15 | 2 | 0 |
| css-in-js | none | 2/3 | 99.9 | 99.8 | 100.0 | 10 | 0 | 0 |
| css-vars | none | 1/2 | 99.5 | 99.5 | 85.7 | 13 | 0 | 0 |
| images | none | 1/2 | 99.8 | 99.8 | 100.0 | 12 | 0 | 0 |
| inline | none | 1/2 | 99.8 | 99.7 | 100.0 | 12 | 0 | 0 |
| security | none | 1/2 | 99.9 | 99.9 | 100.0 | 12 | 0 | 0 |
| shadow-dom | none | 1/2 | 99.8 | 99.8 | 100.0 | 11 | 0 | 0 |
| basic | ours | 0/3 | 0.6 | 0.6 | 100.0 | 36 | 2 | 0 |
| css-in-js | ours | 0/4 | 0.1 | 0.1 | 100.0 | 27 | 1 | 0 |
| css-vars | ours | 0/3 | 0.3 | 0.3 | 100.0 | 26 | 1 | 0 |
| images | ours | 0/4 | 10.3 | 10.3 | 100.0 | 31 | 1 | 0 |
| inline | ours | 0/3 | 0.2 | 0.2 | 100.0 | 28 | 2 | 0 |
| security | ours | 0/2 | 0.0 | 0.0 | 100.0 | 34 | 1 | 0 |
| shadow-dom | ours | 0/2 | 0.1 | 0.1 | 100.0 | 22 | 1 | 0 |
| basic | darkreader | 0/2 | 0.7 | 0.7 | 94.7 | 26 | 2 | 0 |
| css-in-js | darkreader | 0/3 | 0.1 | 0.1 | 100.0 | 21 | 1 | 0 |
| css-vars | darkreader | 0/2 | 0.3 | 0.3 | 71.4 | 18 | 0 | 0 |
| images | darkreader | 0/2 | 10.3 | 10.3 | 100.0 | 18 | 0 | 0 |
| inline | darkreader | 0/3 | 0.1 | 0.1 | 100.0 | 18 | 1 | 0 |
| security | darkreader | 0/3 | 0.1 | 0.1 | 100.0 | 26 | 0 | 0 |
| shadow-dom | darkreader | 0/1 | 0.2 | 0.2 | 100.0 | 17 | 0 | 0 |

| Mode | Icon luminance range | Photo mean RGB |
| --- | --- | --- |
| none | 0.92 | 186, 192, 166 |
| ours | 0.73 | 186, 192, 166 |
| darkreader | 0.03 | 186, 192, 166 |

The images fixture keeps about 10 % bright pixels in every dark mode because the photo is
left as it is, which is intended.

## Findings

1. **Text contrast.** Ours reaches AA on every text element in every fixture. Dark Reader
   keeps the page's own low-contrast pairs (`basic` 94.7 %, `css-vars` 71.4 %, which is worse
   than the light page's 85.7 %). This is the contrast clamp in `engine/color/transform.ts`
   doing its job.
2. **Dark icons.** Our image classifier inverts the dark transparent icon, so it stays
   visible (range 0.73). In Dark Reader it disappears into the background (range 0.03).
3. **Photos** are untouched by both.
4. **Late styles.** No fixture got brighter between 1 s and 8 s in either dark mode, so
   `insertRule`, late adopted sheets and late inline style changes are all caught.
5. **Shadow DOM, fixed during this phase.** The first run left both shadow-DOM cards light
   (12.8 % bright). Their roots were attached by page scripts while the extension was still
   reading settings, so the `attachShadow` notification arrived before anyone listened. The
   engine now also discovers open shadow roots when it starts, at `DOMContentLoaded` and in
   every added subtree. After the fix: 0.1 %.
6. **No flash.** No white frame in our mode on any fixture. The registered instant-on
   stylesheet paints the page dark before the engine has run.
7. **Load cost.** Ours spends about 15 ms more main-thread time than no extension and about
   8 ms more than Dark Reader on these small pages. Most of it is the first full pass
   (scanning every sheet for variables, then rendering). Reducing this is a P6 task:
   lazy rendering of off-screen inline styles and reuse of the per-origin CSS cache before
   the first pass.
8. **Security.** No mode made any request to the trap server. For ours this is the URL
   guard refusing `http:`, explicit ports, `localhost` and private addresses before any
   network access; the guard has 37 unit tests in `packages/engine/test/url-guard.test.ts`.

## Limits of this run

- The screencast only emits a frame when the picture changes, so pages produce two to four
  frames. It reliably separates "a white frame was painted" from "none was", but it is not
  a frame-accurate timing measure.
- The sandbox that produced this report has no internet access, so the 20-site corpus
  (`tests/harness/corpus.txt`) was not run here. It runs in CI from the *Quality harness*
  workflow with the `corpus` input, and its tables land in `out/corpus-report.md`.
- Firefox, Safari and Android are not covered yet. Playwright cannot load Firefox or Safari
  extensions; those platforms get manual smoke checklists in P5.
- Text contrast uses the nearest opaque background colour and ignores background images
  and gradients, so text over images is not judged.
