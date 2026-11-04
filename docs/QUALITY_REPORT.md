# Quality report

## P4 update (2026-11-04)

`features.mjs` now has 37 checks, and all of them pass. Twelve are new, for themes and the page tools:

| Scenario | Check | Result | Detail |
| --- | --- | --- | --- |
| Themes | AMOLED theme makes the page background black | pass | 0,0,0 |
| Themes | and differs from the default dark theme | pass | 22,22,22 |
| Themes | sepia theme tints the background warm | pass | 39,29,18 |
| Themes | custom theme colours the background | pass | 16,26,51 |
| Page tools | self-diagnosis chip shown on a page that stays bright | pass | 1 hosts |
| Page tools | generated CSS can be exported | pass | 2211 chars |
| Page tools | debug overlay switches on | pass | true |
| Page tools | and Escape switches it off | pass | false |
| Page tools | picker previews the fix live | pass | #fix-me {
| Page tools | picker saves the fix as site CSS | pass | "#fix-me {\n  background-color: ${#ffffff} !important;\n}" |
| Page tools | saved fix applies to the page, converted | pass | #fix-me {
| Page tools | context menu API available to the extension | pass |  |

The picker check drives the closed-shadow UI with the keyboard only (Tab, Space, Enter), so
keyboard use is covered as well.

One fixture was added to the metrics run, `bright-shadow`. It is a custom element that styles
itself from a closed shadow root, which no extension can read:

| Mode | Bright % @8s | Text AA % |
| --- | --- | --- |
| none | 99.9 | 100.0 |
| ours | 83.6 | 100.0 |
| darkreader | 87.1 | 100.0 |

Neither extension can convert this page. Here the self-check steps in: on this page it offers
filtered mode, the element picker or a problem report, which Dark Reader does not.

The other fixtures did not change in a meaningful way. Our engine still shows 0.0 to 0.6 %
bright area and 100 % text AA on every convertible fixture.

Load cost has drifted up. Main-thread task time is now 22 to 33 ms, against 15 to 24 ms for
Dark Reader, so the gap is about 13 ms (P3: 8 to 15 ms). The content script now also loads
the page tools and the fixes lookup. Lazy-loading the tools is part of the P6 performance work.

Not checked in a real browser yet:

- The bundled canvas fixes (Google Docs, Sheets, Slides, Maps, TradingView, Notion,
  Excalidraw). Their selectors come from each site's public markup and need checking on
  the live sites.
- Downloading signed bundles from a real release. The signature check is covered by unit
  tests, including a rejected bundle. No public key is set yet, so downloads stay off.
- Context menu clicks. Playwright cannot open the browser's own menu, so the check only
  confirms that the API is present.

---

## P3 update (2026-11-04)

Phase P3 adds a second script, `tests/harness/features.mjs`, which checks the parity
features in a real Chromium with the extension loaded. Each scenario runs in a fresh
profile on its own origin. CI runs it before the metrics on every pull request.

Result: 25 of 25 checks pass.

| Scenario | Check | Result | Detail |
| --- | --- | --- | --- |
| PDF viewer | navigation to a .pdf opens the built-in viewer | pass | chrome-extension://ncdoelmonjojijimlaclpmgplnbnnbgi/pdf.html?file=http://pdf.localhost:43561/doc.pdf |
| PDF viewer | page renders with a dark background | pass | 30,30,30 |
| PDF viewer | text layer present for selection | pass | 2 spans |
| PDF viewer | search finds both pages | pass | Page 1 of 2 with matches |
| PDF viewer | sepia style re-renders the page | pass | 244,236,216 |
| PDF viewer | "Open original" leaves the viewer for that one load | pass | http://pdf.localhost:43561/doc.pdf#sdm-original |
| Deep Integration | site's own dark theme switched on (Docusaurus marker) | pass | dark |
| Deep Integration | preference saved on the site | pass | dark |
| Deep Integration | page is not also converted | pass |  |
| Deep Integration | write recorded in the journal with its previous value | pass | [{"at":1793802298779,"integration":"docusaurus","key":"theme","kind":"localStorage","previous":null,"value":"dark"}] |
| Deep Integration | switching to "Convert anyway" restores the site storage | pass | null |
| Deep Integration | and the DOM change is undone | pass | light |
| Deep Integration | journal emptied after undo | pass | {} |
| Native dark | already-dark page detected and left alone | pass |  |
| Native dark | its own colours are kept | pass | rgb(17, 19, 24) / rgb(138, 180, 248) |
| Native dark | origin remembered for the next visit | pass | http://dark.localhost:43561 |
| Native dark | second visit skips conversion from the start | pass | 0 injected styles |
| Native dark | a light page on another origin is still converted | pass | rgb(22, 22, 22) |
| Remap and custom CSS | page palette lists the brand colour | pass | #1a73e8 #ffffff #222222 #e8f0fe |
| Remap and custom CSS | remapped colour used for text | pass | rgb(255, 0, 255) |
| Remap and custom CSS | and for every other use of it (border) | pass | rgb(255, 0, 255) |
| Remap and custom CSS | custom CSS applied | pass | underline |
| Remap and custom CSS | ${colour} template converted for dark mode | pass | rgb(56, 56, 56) |
| Sync | settings mirrored to storage.sync in chunks | pass | {"chunks":1,"hash":"94f28d21","updatedAt":1793802312943} |
| Sync | mirrored data matches local settings | pass | 346 chars |

The metrics harness now gives every fixture its own origin (`<name>.localhost`), since
some P3 behaviour is remembered per origin. Three fixtures were added:

| Fixture | Ours | Notes |
| --- | --- | --- |
| `integration` (Docusaurus-style site) | 0.6 % bright, 100 % AA | The site's own dark theme is switched on; nothing is converted. |
| `native-dark` (already dark) | 0.5 % bright, same as `none` | Detected after load and left untouched; skipped from the first paint on later visits. |
| `remap` (brand colours) | 0.1 % bright, 100 % AA | `none` reaches only 50 % AA here, because the page's own light-blue on blue fails. |

The P2 fixture numbers did not change in a meaningful way. One noisy run put `css-in-js` at
41 ms task time (P2: 27 ms); load cost is still a P6 item.

Not checked in a real browser yet:

- The site-specific Deep Integration entries (GitHub, Wikipedia, Stack Overflow and the
  others in `apps/extension/src/data/integrations.ts`). They are written from each site's
  public theme switch. This sandbox cannot reach them, so they must be confirmed against
  the live sites (the corpus job, or by hand) before release. Generator markers
  (Docusaurus and so on) are checked against the local fixture only.
- The PDF viewer in Firefox, and PDFs served without a `.pdf` address in Chromium (the
  content script catches those, but headless Chromium downloads PDFs instead of showing them).
- Sync between two real browser profiles. The check confirms that the chunks written to
  `storage.sync` match the local settings.

---

# P2 baseline

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
