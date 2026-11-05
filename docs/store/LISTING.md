# Store listings

Text and assets for each store. Screenshots, promo tiles and the Chrome Web Store icon are
in `screenshots/` and are rendered by `node tests/harness/assets.mjs` after a build.

## Name

Smart Dark Mode

## Short description

Chrome and Edge show the manifest description (`extDescription` in
`apps/extension/public/_locales/*/messages.json`) as the summary. It cannot be edited in
the dashboard:

> Dark mode for every website, with per-site rules, scheduling and no tracking.

Firefox Add-ons summary (250 characters max) and other places that ask for one line:

> Readable dark mode for every website: themes, per-site rules, dark PDF viewer. Free, open source, no tracking.

## Full description

Smart Dark Mode turns every website dark without breaking it.

Readable by design
- Colours are converted in a perceptual colour space (OKLCH), so text keeps its contrast
  and brand colours stay recognisable.
- No white flash: pages open dark from the first frame.
- Photos keep their colours; dark icons and diagrams are inverted so you can see them.

Your way
- Themes: Dark, AMOLED black, Dim, Sepia, High contrast, Grayscale, and themes for red-,
  green- and blue-weak colour vision. Or make your own and share it with a code.
- Rules per site, subdomain, page or URL pattern, with brightness, contrast, saturation,
  warmth and dim sliders.
- Schedule by time of day, or follow your system’s dark setting.
- Swap any colour on a page for another, or add your own CSS.

Sites that already have a dark theme
- Detected and left alone, or their own dark theme is switched on for you, and switched
  back if you change your mind.

Tools
- Fix this element: pick anything on the page and make it dark, light, inverted or hidden.
- Inspect colours: see what any colour was before conversion and its contrast ratio.
- Built-in dark PDF viewer with search and text selection.

Private
- No accounts, no analytics, no tracking. Your settings stay on your device unless you
  turn on sync.
- Open source under the MIT licence: https://github.com/nikhil914/smart-dark-mode

## Category

- Chrome Web Store: Accessibility (one category only)
- Edge Add-ons: Accessibility
- Firefox Add-ons, desktop: Appearance
- Firefox Add-ons, Android: User Interface, or the closest match offered
- App Store: Utilities

## Images

| File | Chrome Web Store | Firefox Add-ons |
| --- | --- | --- |
| `store-icon-128.png` | Store icon | Not needed (taken from the add-on) |
| `1-dark-page.png` to `5-pdf-viewer.png` (1280x800) | Screenshots, all five | Screenshots, all five |
| `promo-440x280.png` | Small promo tile | Not used |
| `promo-1400x560.png` | Marquee promo tile (optional) | Not used |

Screenshot captions for Firefox Add-ons:

1. Pages turn dark from the first frame, with text contrast kept.
2. Before and after: colours are converted, not inverted.
3. The popup: mode, theme and sliders for the current site.
4. Options: themes, schedule, site rules and more.
5. The built-in dark PDF viewer.

## Single purpose (Chrome)

Shows websites in dark colours, with controls for how and where that happens.

## Permission justifications (Chrome and Edge review forms)

- Host permission `<all_urls>`: dark mode must style every page the user opens; the user
  chooses where it applies.
- `storage`: settings and site rules.
- `tabs`: read the current tab's address to show and change its rule in the popup and badge.
- `alarms`: schedule switching and a daily download of the signed site fixes file.
- `scripting`: register styles that apply before first paint, so there is no white flash.
- `contextMenus`: "Dark mode on this site", "Fix this element" and "Open PDF in dark viewer".
- `declarativeNetRequestWithHostAccess`: redirect PDF addresses to the built-in dark viewer.
- Remote code: none. Answer "No, I am not using remote code". The fixes file is data
  (CSS text and selectors), signed and checked before use.

Firefox only, not asked for in a form: `dns` resolves host names before cross-origin
stylesheet fetches so requests to private network addresses can be refused.

## Notes for Firefox reviewers

Paste into "Notes to Reviewer" when uploading:

> The add-on is built with WXT and Vite from TypeScript sources, so the uploaded files are
> bundled and minified. The source zip is the full workspace. Build steps are in BUILDING.md
> at its top level: Node 22, pnpm 10.28.0, then `pnpm install --frozen-lockfile` and
> `pnpm --filter @sdm/extension build:firefox`. The output in
> `apps/extension/.output/firefox-mv3/` matches the uploaded package.
>
> The linter warnings come from third-party libraries bundled unchanged: Preact
> (innerHTML for dangerouslySetInnerHTML, unused by our code) and pdf.js (dynamic import of
> its own worker and decoders, all shipped inside the package).
>
> To test: open any website. It turns dark. The toolbar popup changes the mode per site.
> Open a PDF link to see the dark PDF viewer.

## Data use disclosures

Chrome and Edge: collects no user data in any category, so leave every box unticked. Tick
the three statements: not sold or transferred to third parties, not used for purposes
unrelated to the single purpose, not used for creditworthiness or lending.

Firefox: the manifest declares `data_collection_permissions: none`, which AMO shows on the
listing. Nothing to fill in.

## Privacy policy URL

https://github.com/nikhil914/smart-dark-mode/blob/main/docs/PRIVACY.md

## Homepage URL

https://github.com/nikhil914/smart-dark-mode

## Support URL

https://github.com/nikhil914/smart-dark-mode/issues

## Licence

MIT (Firefox Add-ons asks for it when the version is uploaded).

## App Store (Safari) extras

- Subtitle (30 characters max): Dark mode for every website
- Keywords (100 characters max): dark mode,dark theme,night mode,safari extension,dark reader,pdf,accessibility,eye strain
- Age rating: 4+
- Screenshots: App Store needs device sizes (6.9" iPhone 1320x2868, 13" iPad 2064x2752,
  Mac 2880x1800). Take them on a device or simulator once the app is built; the 1280x800
  set here is for the browser stores.
