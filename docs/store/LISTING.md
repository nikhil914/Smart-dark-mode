# Store listings

Text and assets for each store. Screenshots and promo tiles are in `screenshots/` and are
rendered by `node tests/harness/assets.mjs` after a build.

## Name

Smart Dark Mode

## Short description (Chrome: 132 characters max)

Readable dark mode for every website: themes, per-site rules, dark PDF viewer. Free, open source, no tracking.

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

- Chrome Web Store: Accessibility (secondary: Productivity)
- Edge Add-ons: Accessibility
- Firefox Add-ons: Appearance, Accessibility
- App Store: Utilities

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
- Remote code: none. The fixes file is data (CSS text and selectors), signed and checked
  before use.

## Data use disclosures

Collects no user data in any category. Not sold, not transferred, not used for anything
unrelated to the extension's single purpose.

## Privacy policy URL

https://github.com/nikhil914/smart-dark-mode/blob/main/docs/PRIVACY.md

## Support URL

https://github.com/nikhil914/smart-dark-mode/issues

## App Store (Safari) extras

- Subtitle (30 characters max): Dark mode for every website
- Keywords (100 characters max): dark mode,dark theme,night mode,safari extension,dark reader,pdf,accessibility,eye strain
- Age rating: 4+
- Screenshots: App Store needs device sizes (6.9" iPhone 1320x2868, 13" iPad 2064x2752,
  Mac 2880x1800). Take them on a device or simulator once the app is built; the 1280x800
  set here is for the browser stores.
