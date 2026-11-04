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

## Keyboard shortcuts

| Shortcut    | Action                                           |
| ----------- | ------------------------------------------------ |
| Alt+Shift+N | Open the popup                                   |
| Alt+Shift+D | Toggle dark mode on the current site             |
| Alt+Shift+A | Turn the extension on or off everywhere          |
| Alt+Shift+C | Cycle dark, filtered, normal on the current site |

Rebind them at `chrome://extensions/shortcuts` or in Firefox's add-on manager (Manage Extension Shortcuts).

## Quality harness

```sh
pnpm --filter @sdm/extension build
pnpm --filter @sdm/harness features   # feature checks, exit code 1 on failure
pnpm --filter @sdm/harness harness    # metrics against Dark Reader and no extension
```

Results are written to `tests/harness/out/`. `docs/QUALITY_REPORT.md` explains the metrics.

## Translations

UI strings live in `apps/extension/public/_locales/<lang>/messages.json` (en, ar, hi, es, fr, de, ru, zh_CN, ja, pt_BR). Non-English strings need review by native speakers before release.
