# RESEARCH.md: Phase P0 findings

Researched 2026-11-04 from primary sources (store listings, official docs, GitHub, Bugzilla, advisory databases). Each section ends with what changes in our plan. Items marked **NEEDS HANDS-ON** could not be verified from a cloud container without a real browser profile and must be checked manually before P3.

---

## 1. Night Eye: current state

### Sources
- Chrome Web Store listing: https://chromewebstore.google.com/detail/dark-mode-night-eye/alncdjedloppbablonallfbkeiknmkdi
- Firefox AMO listing: https://addons.mozilla.org/en-US/firefox/addon/night-eye-dark-mode/
- Firefox AMO reviews: https://addons.mozilla.org/en-GB/firefox/addon/night-eye-dark-mode/reviews/?page=1
- Edge Add-ons listing: https://microsoftedge.microsoft.com/addons/detail/dark-mode-night-eye/gijhmcgnnbcpigflkfoimbnfjnbcphah
- Safari (App Store): https://apps.apple.com/app/id1450504903

### Facts (as listed on 2026-11-04)
| Item | Chrome | Firefox |
|---|---|---|
| Version | 6.1.1 | 6.1.1 |
| Last updated | 2026-08-27 | 2026-08-26 |
| Users | 300,000 | 6,126 |
| Rating | 4.6 (3.3K) | 3.6 (384; 105 one-star) |
| Size | 1.19 MiB | n/a |
| Languages | 51 (prompt said ~40) | n/a |
| Permissions | "read and change site data" | tabs, all-sites data |
| Android | n/a | Yes (Firefox for Android) |

Publisher: PROMOTINO OOD (Bulgaria). Chrome privacy disclosure says the developer **collects personally identifiable information**. That supports our F6 position (zero telemetry by default).

Pricing tiers now listed: **Lite** (free forever, 5 sites), **Pro** (subscription, 3-month free trial without a card), **Pro Max** (subscription, higher limits), **Ultimate** (one-time purchase). The one-time option is new compared with the prompt's §4 F5 description.

### Feature list from the listings vs build prompt §3
All §3 items are confirmed by the listings: three modes (Dark / Filtered / Normal); brightness, contrast, saturation, warmth (blue light), dim; per-site and per-subdomain settings; allow and disallow lists; schedule; follow OS scheme; PDF dark mode ("supported PDFs"); built-in dark theme support; import/export; in-extension support; "images option: converts only small images and icons".

Differences from §3:
- **Custom CSS** is listed by Night Eye. §3 does not list it (it is in our §5 power tools). Promote the per-site CSS editor to parity scope (P3), not P4.
- **Allow/disallow lists** are a Night Eye feature, not only an improvement. Move allowlist/blocklist mode to P3.
- **Per-page (path) settings and colour remapping** are in §3 but not mentioned on the current listings. **NEEDS HANDS-ON** to confirm they still exist in v6.1.1.
- **Keyboard shortcuts** are not mentioned on the listings. **NEEDS HANDS-ON.**

### Review evidence for the flaws in §4
Firefox reviews (3.6 average) repeat: "broke several websites", "breaks half of what i use", "kept ruining other sites like gmail" (F3, F4); "just goes right back to white" (F2); YouTube and DuckDuckGo "struggle with retaining dark mode settings" after uninstall, and a loading screen that persisted (F8); price complaints (F5).

### NEEDS HANDS-ON
Install v6.1.1 in Chrome and Firefox, and record every popup and options setting with screenshots. I could not do this here (no interactive browser profile, no extension store installs). This is a 30-minute manual task; a checklist for it is in Appendix A.

---

## 2. Dark Reader engine

### Sources
- Repo: https://github.com/darkreader/darkreader (cloned at `e792229`, 2026-11-03, version 4.9.134)
- npm: `darkreader@4.9.134`, MIT, 703 KB unpacked
- License: MIT, "Copyright (c) 2026 Dark Reader Ltd." The file also says "All rights reserved", which does not override the MIT grant. Keep the full notice in `THIRD_PARTY_NOTICES` for any reused file.

### Engine layout (`src/inject/dynamic-theme/`, ~7,300 lines)
| File | Role | Lines |
|---|---|---|
| `index.ts` | orchestration: create/remove theme, style watchers, inline-style watcher, shadow roots | 1,064 |
| `variables.ts` | CSS custom property type inference (colour vs bg vs border), `var()` resolution | 932 |
| `modify-css.ts` | rule rewriter: per property, decides bg / fg / border / gradient / image handling | 788 |
| `style-manager.ts` | one managed `<style>` per source sheet, cross-origin loading, cascade order | 683 |
| `inline-style.ts` | `style=""` and SVG `fill`/`stroke` attributes | 683 |
| `image.ts` | canvas sampling: dark/light/transparent/large classification | 418 |
| `stylesheet-modifier.ts` | async rule rewriting with change detection | 406 |
| `stylesheet-proxy.ts` | **main-world** overrides of `insertRule`, `deleteRule`, `replaceSync`, `attachShadow`, `adoptedStyleSheets` setter | 372 |
| `modify-colors.ts` | colour transform, **HSL-based** with fg/bg "poles" and caching | 320 |
| `css-rules.ts`, `css-collection.ts`, `palette.ts`, `selectors.ts`, `fixes.ts`, `meta-theme-color.ts`, `mv3-proxy.ts`, `network.ts` | helpers | ~900 |
| `watch/*` | custom elements, sheet changes, style position (keeps cascade order) | 536 |

Key observations:
1. **Colour model is HSL.** `modify-colors.ts` converts rgb → HSL and moves lightness toward a pole. This is the root cause of F4-type complaints (hue shifts on blues, flattened greys). Our OKLCH engine (§4 F4) replaces this module entirely.
2. **OKLCH colours are not handled correctly yet** (open issue #13406). `color.ts` recognises `oklch` and `color-mix` names, but parsing is partial.
3. **Main-world proxy already exists** and covers what F2 asks for, except `CSSStyleSheet.replace` (async) and SPA navigation re-application. Our version adds both, plus a per-tab nonce (§8).
4. **Fetch guard lives in the content script** (`dynamic-theme/network.ts` calls `shouldIgnoreCors` before messaging the background). The background `getOKResponse` does not re-check. See §4 below.
5. **Firefox build is MV2** (`manifest-firefox.json` uses `background.page`, `strict_min_version: 78.0`). Only Chrome has an MV3 manifest.

### Site-fix database (`src/config/`)
| File | Entries (2026-11-03) | Prompt estimate |
|---|---|---|
| `dynamic-theme-fixes.config` | 2,942 sections (42,696 lines) | ~2,900 |
| `inversion-fixes.config` | 248 | ~250 |
| `dark-sites.config` | 1,314 | ~1,300 |
| `detector-hints.config` | 230 | n/a |
| `static-themes.config`, `color-schemes.drconf` | present | n/a |

Fix syntax: blocks separated by `====` lines; directives `INVERT`, `CSS`, `IGNORE INLINE STYLE`, `IGNORE IMAGE ANALYSIS`. CSS blocks use `${colour}` templates (run through the transform) and `var(--darkreader-neutral-background)` / `--darkreader-neutral-text` tokens. **To consume these fixes unchanged we must emit the same `--darkreader-*` variable names** (as aliases of our own `--sdm-*` tokens). That is a hard compatibility requirement for ADR-001.

### Decision
See `adr/ADR-001-engine.md`: **selective fork**. Port the DOM-side injection layer (style discovery, proxy, watchers, variables, cascade-order management) with the MIT notice; write a new OKLCH colour engine, image classifier and fetch layer; consume the config files as data.

---

## 3. Dark Reader issue tracker → test cases

Pulled 2026-11-04 with `gh api search/issues` (open issues, sorted by comments). Raw list: Appendix B. Topic searches were added for shadow DOM, CSS variables, performance, white flash, adoptedStyleSheets and Google Cloud Console, because the comment-sorted top 50 is dominated by old feature requests.

Converted to harness test cases (IDs used in `tests/e2e` and `tests/visual` from P2):

| Test ID | Source issue(s) | What the test asserts | Maps to |
|---|---|---|---|
| T-FLASH-01 | #3811, #11190, #14169 | navigate between two dark-converted pages, new window, restored tab: 0 frames with mean luminance > 0.5 | F10 |
| T-FLASH-02 | #12064 (Safari) | same as T-FLASH-01 on Safari (manual until P5) | F10 |
| T-FLASH-03 | #13823 | addons.mozilla.org load: 0 bright frames | F10 |
| T-FLASH-04 | #13084 | page with native dark theme: no "flash of dark styling" before detection decides to leave it alone | F1, Deep Integration |
| T-DELAY-01 | #469, #7569 | dynamic mode applied before first paint without manual toggle | F1 |
| T-DOCS-01 | #8730, #1934, #12762 | Google Docs and Sheets: images not inverted, canvas body dark, no white load | F11 |
| T-ICON-01 | #9796 | Gmail icons visible (contrast ≥ 3:1 against bg) | §5 images |
| T-PNG-01 | #3753 | dark transparent PNG logo on dark bg: visible | §5 images |
| T-CONTRAST-01 | #7067 | text on a converted highlight bg (yellow) passes 4.5:1 | F4 |
| T-CHECKBOX-01 | #2610 | native checkbox/radio contrast ≥ 3:1 | §5 forms |
| T-SHADOW-01 | #6768, #15753 | open shadow root styled on first load and after host re-creation | F2 |
| T-SHADOW-02 | #15580 | GitHub relative-time element: no raw CSS text leaking into content | F2 |
| T-VAR-01 | #13406 | `oklch()` colours (direct and in `var()`) converted | F4 |
| T-VAR-02 | #5179 | site with native dark mode + CSS variables: disabling us restores site exactly | F8 |
| T-VAR-03 | #12266, #15318 | partially themed site via CSS variables: bright-area ≤ 3 % | F2 |
| T-PERF-01 | #10403, #11834 | Firefox content process CPU idle after 30 s within budget | F7 |
| T-PERF-02 | #4256 | Google results scroll: no long tasks > 50 ms attributable to us | F7 |
| T-PERF-03 | #16006 | site **disabled** for us: added main-thread time ≈ 0 (we must not run the engine at all) | F7 |
| T-PERF-04 | #10297, #7561 | Google Cloud Console (Firefox and Chrome): mutation loop detected, backs off to Simplified mode, no runaway CPU | F7 |
| T-AKAMAI-01 | #8774 | Akamai-protected site: no "Access Denied" (our fetches must not look like bot traffic or re-request page resources with odd headers) | §6 fetch |
| T-PDF-01 | #12965, #8439 | local `file://` PDF and HTML: works if user grants file access, otherwise a clear message | F9 |
| T-AUTO-01 | #9903, #8515, #5680, #2722 | schedule and OS-scheme automation turn on **and off** reliably, desktop and Android | §3 automation |
| T-AUTO-02 | #7059, #8039 | follow system scheme on Firefox Android and Kiwi-class Chromium | §3 automation |
| T-IMPORT-01 | #3927, #4722 | export → clear all → import round-trip is lossless; "clear all" leaves nothing behind | §3 export |
| T-DEVFIX-01 | #12996 | a per-site CSS fix survives browser restart | §5 CSS editor |
| T-POPUP-01 | #7402, #6402 | popup never renders blank (settings load failure shows fallback UI) | P1 |
| T-OTHEREXT-01 | #6849, #15994, #4763 | do not restyle other extensions' injected UI or `chrome-extension://` frames; coexist with password managers and Shopify checkout | §6 |
| T-TOGGLE-01 | #2335, #6779 | turning off removes every injected node and adopted sheet within 1 frame | F8 |
| T-RFP-01 | #11631 | Firefox with `privacy.resistFingerprinting`: canvas sampling disabled gracefully, no hang | §5 images |

Feature requests worth noting (not test cases): #2168 Xresources/Pywal palette import (131 comments, the most-requested idea; cheap to support via user themes), #4765 plug into Chrome's force-dark (not available to extensions), #4637 time-based theme switching (covered by schedule).

---

## 4. CVE-2025-68467: cross-origin stylesheet fetch to localhost/LAN

### Sources
- GitLab advisory: https://advisories.gitlab.com/npm/darkreader/CVE-2025-68467/
- NVD: https://nvd.nist.gov/vuln/detail/CVE-2025-68467
- GitHub advisory: GHSA-x369-mcw8-8rvj

### Summary
Dark Reader before 4.9.117 let a website make the extension fetch a stylesheet from a local server (for example `http://localhost:8080/style.css`). The extension's privileged fetch bypasses CORS, so the page could read local content that answered with `text/css`. CVSS 3.1: 3.4 Low (`AV:N/AC:H/PR:N/UI:R/S:C/C:L/I:N/A:N`). CWE-200, CWE-346, CWE-668. Fixed in 4.9.117.

### What the fix looks like in current Dark Reader
`src/utils/network.ts` `shouldIgnoreCors()` refuses: non-`https:`, any explicit port, IP-literal hosts, ~20 localhost alias domains (`lvh.me`, `nip.io`, `sslip.io`, `localtest.me`, ...), local TLD suffixes (`.local`, `.lan`, `.internal`, `.home`, `.corp`, `.test`, ...), and more than a cap of distinct CORS hosts.

### Remaining gaps we design against
1. **Check runs in the content script, not the background.** A compromised or confused content-script path could message the background directly. Our background re-validates every request.
2. **DNS rebinding.** A public hostname such as `evil.example` can resolve to `192.168.1.1`. Hostname checks cannot catch this. Mitigations:
   - Firefox: the `dns` API (`browser.dns.resolve`) lets the background resolve and refuse private addresses before fetching. Use it.
   - Chromium: no DNS API for extensions. Chrome's **Local Network Access** permission (prompt rolling out from Chrome 142, per https://developer.chrome.com/blog/local-network-access) blocks public-to-private requests from web contexts. The blog does not say whether it applies to extension service workers. **NEEDS HANDS-ON**: test whether an MV3 service worker fetch to a rebinding hostname is blocked in current Chrome.
   - All browsers: only fetch cross-origin stylesheets whose URL **the page itself already loaded** (it appears in `document.styleSheets` with an `ownerNode`/`href`, or in `performance.getEntriesByType('resource')`). A page can still list a rebinding host, so this narrows but does not close the hole. We also require the response `Content-Type` to be `text/css`, and we never hand raw fetched text back to the page (see 3).
3. **Never expose fetched text to the page.** The converted CSS we inject is visible to page JS (it is in the DOM). If a fetched sheet is converted and injected, the page can read our output and reconstruct the original. Mitigation: the injected output only contains declarations whose values we rewrote (colours, images), not the original sheet text, and we only fetch sheets the browser has already applied to the page (so their rules are already in effect). This matches the §8 test "a page tries to read fetched cross-origin CSS".

### Our fetch design (implemented in P2, `packages/background/fetch.ts`)
```
request(url, kind: 'css'|'image', tabId, frameOrigin)
  1. parse URL; refuse unless protocol === 'https:' and port === ''
  2. refuse IP literals (v4 dotted/decimal/hex/octal, v6 incl. [::ffff:127.0.0.1]),
     localhost aliases and local suffixes (Dark Reader's list + .arpa, .onion, .home.arpa)
  3. Firefox: dns.resolve(host) and refuse if any address is loopback, private
     (10/8, 172.16/12, 192.168/16, 100.64/10 CGNAT), link-local (169.254/16, fe80::/10),
     ULA (fc00::/7), unspecified, multicast
  4. refuse unless the URL was observed as a page resource for (tabId, frameOrigin)
  5. fetch with credentials:'omit', redirect:'manual' (re-validate any redirect target
     through steps 1-4), referrerPolicy:'no-referrer', AbortSignal timeout 10 s
  6. require Content-Type text/css (css) or image/* except image/svg+xml served cross-origin
     unless sanitised; stream with a byte cap: 2 MB css, 5 MB image
  7. cache only in extension storage (IndexedDB in the extension origin); never in page storage
  8. per-tab rate limit and distinct-host cap
```
Security tests in §8 of the prompt map directly onto steps 1, 2, 4, 5 and 7.

---

## 5. Platform limits (November 2026)

### Chromium MV3 (Chrome, Edge, Brave, Opera, Vivaldi, Arc, Yandex, Whale)
Source: https://developer.chrome.com/docs/extensions/reference/api/scripting
- `scripting.registerContentScripts` (Chrome 96+): fields `id, matches, excludeMatches, css, js, runAt, allFrames, world (102+), matchOriginAsFallback (119+), persistAcrossSessions`. **It has no `origin` field**, so CSS registered this way is author-origin. The prompt's F1(a) `origin: USER` is only available through `scripting.insertCSS` (`StyleOrigin` `AUTHOR` | `USER`), which runs after navigation commits and can lose the race with first paint.
- **Plan:** register the fallback CSS with `registerContentScripts({css, runAt:'document_start'})` for first-paint coverage, using high specificity and `!important` on `html, body` background and `color-scheme`. Optionally follow with `insertCSS({origin:'USER'})` for the few rules that must beat page `!important`. Measure both with T-FLASH-01.
- Main-world content scripts: `world: 'MAIN'` in manifest `content_scripts` (Chrome 111+), which is how Dark Reader injects its proxy.
- Service worker is stateless; persist everything to `chrome.storage`; use `chrome.alarms` for schedule.
- Offscreen documents (`chrome.offscreen`) are available for DOM-needing work (image decoding with canvas). A Web Worker inside the content script is blocked by page CSP on many sites, so heavy work goes to the offscreen document or an extension-origin worker reached via the background.

### Firefox desktop
Sources: https://blog.mozilla.org/addons/2024/07/10/manifest-v3-updates-landed-in-firefox-128/, https://bugzilla.mozilla.org/show_bug.cgi?id=1751346
- MV3 uses `background.scripts` (event page), not a service worker. `browser_specific_settings.gecko.id` required.
- `content_scripts[].world: 'MAIN'` and `match_origin_as_fallback`: **Firefox 128+**.
- **adoptedStyleSheets from content scripts: fixed in Firefox 153** (bug 1751346, ObservableArray support in Xray wrappers). Before 153, reading gives an opaque object and writing throws "Accessing from Xray wrapper is not supported".
- **Firefox ESR**: ESR 140 predates the fix. **NEEDS HANDS-ON**: confirm whether the current ESR is 140 or 153. Workaround for older versions: do all adoptedStyleSheets work in the MAIN-world script (which we need anyway for the proxy), or inject a `<style>` into the shadow root as a fallback.
- Set `strict_min_version: "128.0"`.

### Firefox for Android
- Same XPI. Firefox 128 blog: MV3 fully supported on Android since the optional/host permission UI landed in Firefox 127. Must set `browser_specific_settings.gecko_android`. No `commands` (keyboard shortcuts) or context menus on Android; popup must be touch-friendly.

### Edge for Android
Source: https://github.com/microsoft/MicrosoftEdge-Extensions/issues/529
- Extensions are **not automatically available** on Edge for Android just because they are on Edge Add-ons. Required: published on Edge Add-ons; a mobile user value statement; core functionality verified on Edge Android (and iOS, per Microsoft's latest reply); core test cases for Microsoft's QA; then a request through Microsoft's form. No published approval criteria or SLA.
- Plan: publish on Edge desktop first (P5), then submit the mobile request with T-AUTO-02 and the touch-popup test cases.

### Safari macOS, iOS and iPadOS
Source: https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari
- The tool is now **`xcrun safari-web-extension-packager`** (renamed from `safari-web-extension-converter`). Flags: `--project-location, --rebuild-project, --app-name, --bundle-identifier, --swift, --ios-only, --macos-only, --copy-resources, --no-open, --no-prompt, --force`.
- There is also a **web-based packager in App Store Connect**, which means packaging no longer strictly needs a local Mac, though running Xcode for the SwiftUI host app and App Intents still does.
- Packager prints unsupported manifest keys; we keep a Safari-specific manifest via WXT.
- **NEEDS HANDS-ON**: Safari's current support for `world:'MAIN'` content scripts, `scripting.registerContentScripts` with `css`, and `storage.sync`. Dark Reader issue #12064 shows Safari white flash is a known problem, so T-FLASH-02 must run on a real device.
- Requires an Apple Developer Program membership ($99/year) to ship to the App Store.

### Chrome for Android
Source: https://www.howtogeek.com/chrome-for-android-extensions-desktop/
- No extension support on phones. Google has experimental "desktop Android" Chrome builds that allow manual `.crx` installs, but no Web Store and nothing for regular phones. **Out of scope**, as the prompt says.

---

## 6. Competitors: what to adopt

| Competitor | Source | Notable features | Adopt? |
|---|---|---|---|
| Noir (Mac $3.99 one-time; iOS separate app) | https://apps.apple.com/us/app/id1592917505 | 20+ themes + custom, Shortcuts, Focus Filters, widgets, iCloud sync, site reports | Already in §5. Note Noir's **one-time price**: that is the market expectation on Apple platforms if we ever charge. |
| Midnight Lizard (Firefox 10.7.1, last updated 2021-01-20, ~6K users; open source) | https://addons.mozilla.org/addon/midnight-lizard-quantum | colour schemes incl. **colourful** and grayscale; per-site scheme; URL match patterns; whitelist/blacklist; Simplified mode; browser theme sync; **local HTML files**; **"increase text contrast" slider**; "shade bright colours and images"; Alt+Shift+L / Alt+Shift+M shortcuts | Adopt: **text-contrast slider** (separate from global contrast), **local file support** (with `file://` access prompt), **default shortcuts Alt+Shift+D/A** (avoid clashing with Midnight Lizard's L/M). The project is unmaintained, which leaves room for us. |
| Turn Off the Lights (4.7.0, 2026-09-12, ~66K Firefox users) | https://addons.mozilla.org/en-GB/firefox/addon/turn-off-the-lights | dim everything except the video; auto-dim on play; opacity shortcut; orange "eye protection" shader with its own allow/block list; dark mode for local files | Adopt a **"Cinema" toggle** (dim the page around the playing video, P4, optional) and a **separate schedule for the warmth filter** (warmth on at night even where dark mode is off). |
| Dark Reader | repo above | Pywal/Xresources import requested in #2168 | Adopt **theme import from Pywal `colors.json`**: cheap, highly requested. |

New items to add to the backlog (not in §5): text-contrast slider, local-file support, Cinema/video dim, independent warmth schedule, Pywal import.

---

## 7. Framework

See `adr/ADR-002-framework.md`. Short version: **WXT 0.21.5** (npm, published 2026-10-26, actively maintained). Plasmo's latest npm publish is 0.90.5 from 2025-05-17, 18 months without a release.

---

## 8. Open questions and risks
1. **Payments**: decided 2026-11-04: open source (MIT), no payments. F5 is out of scope.
2. **Repository**: `nikhil914/smart-dark-mode`.
3. **Comparing against Night Eye in the harness** (§7): automated runs need Night Eye's packaged extension. Chrome Web Store CRX downloads for testing are possible but its licence terms forbid redistribution; we should load it from the user's own install path in CI-less local runs only. Also, the free tier only works on 5 sites, so a fair 200-site comparison needs a Pro trial account. **Decision needed in P2.**
4. **Bundle size**: Night Eye is 1.19 MiB; our 1.5 MB budget includes pdf.js (`pdfjs-dist@6.5.438`, worker alone is several hundred KB). Ship the PDF viewer as a lazily loaded extension page so it does not count against content-script size.
5. **DNS rebinding on Chromium** has no complete fix (see §4). We document it as residual risk with the resource-observed mitigation.

---

## Appendix A: Night Eye hands-on checklist
For each of Chrome and Firefox, on v6.1.1, screenshot and list:
1. Popup in each mode (Dark, Filtered, Normal) on a normal site and on a site with a native dark theme.
2. Every slider and its range/default; whether it is per-site or global; any per-page or per-subdomain toggle.
3. Colour remap UI (if present): how a colour is picked, how it is stored.
4. Options page: every tab and setting; schedule; OS scheme; shortcuts; allow/deny lists; custom CSS; import/export format (save a sample export file, which we need for the importer).
5. First-run flow: does it still redirect to a payment or trial page?
6. Uninstall: which sites keep changed localStorage/cookies (check DuckDuckGo and YouTube).

## Appendix B: top 50 most-commented open Dark Reader issues (2026-11-04)
```
#      comments  title
2168   131  [Idea] .Xresources/Pywal colors
8774    69  [Bug] "Access Denied" on Akamai based websites
559     64  Translations
469     53  [Dynamic] delay when loading new page
3811    38  [Feature Request] Remove the White Flash Between Web Pages while Navigating in Dark Mode
8730    36  [Broken Website] Google Docs has inverted images
9903    34  [Bug] Automation settings not working on desktop or mobile
5952    33  [Broken Website] Gurushots.com
2273    33  Button or URL to manually activate dark mode in websites
4722    25  [BUG] Clearing all data does not quite clear all data (revealed during export)
12965   25  Doesn't work with local PDF files
7059    23  Use system color scheme not working on Kiwi Browser (Android)
7067    22  Fix too low contrast for text background color i.e. yellow highlight against white text
3927    22  [BUG] Import not working in Firefox (desktop)
6402    21  [Bug] Safari: dark reader cannot be sometimes opened
12064   21  [Bug] Dark Reader for Safari flashes white before applying dark mode.
10403   21  [Performance Issue] Dark Reader is slowing down Firefox
5673    20  Fonts not changing on firefox
6779    20  Thunderbird 93.0b2 - 94.0b1 - won't turn off
11631   20  [Bug] Dark Reader + RFP causes Fennec 116/Mull 116 to become unresponsive
13084   20  [Bug] Flash of dark styling
3753    20  PNG and other transparent image support
2722    19  [BUG] auto not working on google chrome
3364    19  Firefox theme issue
9796    19  [Broken Website] Gmail icons are dark (invisible)
13944   19  [Feature Request] Add option to remove pay-nag for those who have donated
1205    18  Project dead? Planned to make it open source for Safari?
5238    18  [BUG] Thunderbird Dark Reader does not work for Exchange accounts
4108    18  [Feature Request] Consider switching to CodeMirror for DevTools
8515    18  [Bug] Automation doesn't stop automatically
6894    18  [Feature Request] Option to exclude images from inverting colors in Filter theme
3778    17  [BUG] after upgrading to Firefox 81 Dark Reader sometimes fails to apply
4438    17  [Broken Website] Messenger.com with gradient theme since new update
7402    17  [Bug] Can't disable Dark Reader on github.com ... popup blank
7569    17  Dynamic Mode not applied on all websites until after manual toggle
1474    16  [Dynamic Theme] Dark mode works bad at dev.azure.com
6849    16  [Bug] Dark Reader modifying extension popover
8039    16  [Bug] android firefox does not follow system color scheme
6032    16  Turn Dark Reader into what's supposed to be.
1934    15  Google Sheets: The Images are color inverted
2335    15  [Safari] Dark reader stays on after being turned off
4765    15  Possible to "plug into" Chrome's enable-force-dark?
12202   15  latest update causing a lot of issues
12578   15  [Broken Website] SalesForce - *.lightning.force.com
12996   15  [Bug] Fixing a style problem via dev tools 'per site' ... fix vanishes after reboot
5680    15  [BUG] Dark mode not toggling off with system theme
8439    15  [Bug] Dark Reader breaks when viewing local files
2610    14  [Feature Request] Improve contrast of checkboxes
4763    14  [BUG] can not login into local phpmyadmin with darkreader and keepassxc in firefox
4637    14  [Feature Request] Switch theme based on time
```
Topic searches added: #15580, #15753, #6768 (shadow DOM); #13406, #5179, #12266, #15318 (CSS variables / oklch); #11834, #4256, #2971, #16006 (performance); #13823, #11190, #14169, #12762 (white flash); #15994 (adoptedStyleSheets); #10297, #7561 (Google Cloud Console).
