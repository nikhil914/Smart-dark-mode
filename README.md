# Smart Dark Mode

An open-source (MIT) dark mode extension for Chromium browsers, Firefox (desktop and Android) and Safari. No telemetry.

Status: P1 skeleton. Dark mode currently uses a simple inversion filter as a placeholder; the real conversion engine arrives in P2. See `docs/` for research and architecture decisions.

## Layout

```
apps/extension/      WXT project: background, content script, popup, locales, icons
packages/settings/   settings schema, migrations, rules engine, schedule (pure TS, unit tested)
docs/                research, ADRs, wireframes
```

## Development

Requires Node 22 and pnpm 10.

```sh
pnpm install
pnpm dev                 # Chrome with live reload
pnpm --filter @sdm/extension dev:firefox
pnpm test                # unit tests
pnpm lint && pnpm typecheck
pnpm build               # .output/chrome-mv3 and .output/firefox-mv3
```

Load an unpacked build from `apps/extension/.output/chrome-mv3` (chrome://extensions, developer mode) or `apps/extension/.output/firefox-mv3/manifest.json` (about:debugging, This Firefox, Load Temporary Add-on). Edge, Opera, Brave and Vivaldi use the Chrome build.

## Rules

Settings resolve in this order, later levels overriding earlier ones field by field:

1. Global defaults
2. Domain (`example.com`, optionally including subdomains)
3. Subdomain (`docs.example.com`)
4. URL pattern (`*.atlassian.net/wiki/*` or `/regex/`)
5. Page (`example.com/path`)

Colour remaps, custom CSS and Deep Integration choices are stored on the same rules. Remaps merge across levels, custom CSS from every matching level is applied in order, and the most specific Deep Integration choice wins.

## Sites with their own dark theme

When a site already has a dark theme, the extension uses it instead of converting the page:

- Known sites and site generators (`apps/extension/src/data/integrations.ts`) have their theme switch turned on. Attribute and class changes last for one page view. Writes to the site's storage or cookies are recorded first in a journal in extension storage, with the value they replaced. Choosing "Convert anyway" or "Leave it alone", or turning dark mode off for the site, restores those values the next time the site is open. The options page lists every recorded change.
- Other pages that are already dark are detected after load and left as they are. Their origin is remembered, so later visits skip conversion from the first paint.

To add a site, add an entry to `integrations.ts` with the hosts, a selector that matches while the dark theme is on, and the actions. Prefer `attr` and `class` actions over storage writes.

## PDF viewer

PDF addresses open in a built-in pdf.js viewer with dark, sepia, inverted, custom and original styles, plus text selection, search and printing in the original colours. "Open original" shows the file in the browser's own viewer for that one load. Local `file://` PDFs need "Allow access to file URLs" turned on for the extension.

## Backup and sync

The options page exports every setting to a JSON file and imports this format or a Dark Reader export. With sync turned on, settings are mirrored to the browser's sync storage in chunks of 6,000 characters (up to about 84 KB).

## Themes

Dark mode comes in several themes: Dark, AMOLED black, Dim, Sepia, High contrast (text contrast of at least 7:1), Grayscale, and three colour-vision themes (protan, deutan, tritan) that move hues apart where those deficiencies confuse them. A saturation preset (vivid, balanced, muted) sets how strongly page colours come through.

Custom themes set the background, text, link, visited link, border, selection, button and scrollbar colours. Each one has a share code (`sdm-theme:...`) that can be copied and pasted into another browser. Themes can be chosen globally or per site.

Images: photos keep their colours and can be darkened by up to 40 %, dark icons and diagrams are inverted, and the original image shows while the pointer is over it.

## Page tools

- **Fix an element**: pick an element on the page, choose what to change (invert, dark background, light text, hide background image, hide), see it live, and save it as custom CSS for the site. Available from the popup, the right-click menu and a keyboard shortcut you can assign.
- **Inspect colours**: an overlay that shows, for the element under the pointer, its colours now, the page colours they came from, the contrast ratio and the stylesheet rule that set them.
- **Export CSS**: downloads the stylesheet generated for the current page.
- **Self-check**: after a page loads, a grid of points is sampled. If more than 15 % of it is still bright, or too much text has low contrast, a small prompt offers filtered mode, the element picker or a problem report. It runs on your device only and can be turned off in the options.

## Site fixes

Some sites need small corrections (canvas apps such as Google Docs, Maps or Excalidraw need inverting). Fixes are data, never code: CSS with `${colour}` templates and lists of selectors. A small set ships with the extension; a larger bundle, built from our own fixes (`fixes/own.json`) and Dark Reader's community fixes, is published as a release asset and downloaded once a day.

A downloaded bundle is used only when its ECDSA P-256 signature matches the public key built into the extension and its version is higher than the one in use. A failed check never replaces the bundle already stored.

To publish bundles:

1. Run `node scripts/fixes/keygen.mjs` once. Keep the private key safe and never commit it.
2. Put the printed public JWK into `apps/extension/src/data/fixes-key.ts`.
3. Add the private key as the repository secret `FIXES_SIGNING_KEY`.
4. Run the "Publish site fixes" workflow. It builds, signs, verifies and uploads `fixes.json` and `fixes.json.sig` to a release.

Until a public key is set, downloads stay off and only the bundled fixes are used.

## Browsers

| Browser                                         | Build                                              | Notes                                      |
| ----------------------------------------------- | -------------------------------------------------- | ------------------------------------------ |
| Chrome, Brave, Vivaldi, Opera, Arc              | `pnpm --filter @sdm/extension build:chrome`        |                                            |
| Edge (desktop and Android)                      | `build:edge`                                       |                                            |
| Firefox (desktop and Android)                   | `build:firefox`                                    | Firefox 140 or later, Android 142 or later |
| Safari (macOS 13, iOS and iPadOS 16.4 or later) | `build:safari`, then the app in `apps/safari-host` | See below                                  |

On phones the popup opens full width and every tool works with touch: press an image to see
the original, and tap to pick or inspect an element. Firefox for Android has no keyboard
shortcuts or right-click menu, so those features are reached from the popup.

### Safari app

Safari extensions ship inside an app. `apps/safari-host/project.yml` describes the macOS and
iOS apps for [XcodeGen](https://github.com/yonaskolb/XcodeGen). The generated Xcode project
is not committed. The app also adds two Shortcuts actions, "Set Smart Dark Mode" (on, off or
toggle) and "Set Smart Dark Mode theme", which can be used in Focus or time-of-day automations.
Safari cannot wake an extension from an app, so the extension picks up these commands
within a minute, or at once when you switch tabs.

Releasing to every store is described in `docs/RELEASE.md`. The privacy policy is
`docs/PRIVACY.md`, and the store texts are in `docs/store/`.

## Keyboard shortcuts

| Shortcut    | Action                                           |
| ----------- | ------------------------------------------------ |
| Alt+Shift+N | Open the popup                                   |
| Alt+Shift+D | Toggle dark mode on the current site             |
| Alt+Shift+A | Turn the extension on or off everywhere          |
| Alt+Shift+C | Cycle dark, filtered, normal on the current site |
| (unset)     | Fix an element on the page                       |

Browsers allow four suggested shortcuts, so "Fix an element" has none by default. Rebind them at `chrome://extensions/shortcuts` or in Firefox's add-on manager (Manage Extension Shortcuts).

## Quality harness

```sh
pnpm --filter @sdm/extension build
pnpm --filter @sdm/harness features   # feature checks, exit code 1 on failure
pnpm --filter @sdm/harness harness    # metrics against Dark Reader and no extension
```

Results are written to `tests/harness/out/`. `docs/QUALITY_REPORT.md` explains the metrics.

## Translations

UI strings live in `apps/extension/public/_locales/<lang>/messages.json` (en, ar, hi, es, fr, de, ru, zh_CN, ja, pt_BR). Non-English strings need review by native speakers before release.
