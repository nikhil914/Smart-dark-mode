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

## Keyboard shortcuts

| Shortcut    | Action                                           |
| ----------- | ------------------------------------------------ |
| Alt+Shift+N | Open the popup                                   |
| Alt+Shift+D | Toggle dark mode on the current site             |
| Alt+Shift+A | Turn the extension on or off everywhere          |
| Alt+Shift+C | Cycle dark, filtered, normal on the current site |

Rebind them at `chrome://extensions/shortcuts` or in Firefox's add-on manager (Manage Extension Shortcuts).

## Translations

UI strings live in `apps/extension/public/_locales/<lang>/messages.json` (en, ar, hi, es, fr, de, ru, zh_CN, ja, pt_BR). Non-English strings need review by native speakers before release.
