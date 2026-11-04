# Privacy policy

_Last updated: 4 November 2026_

Smart Dark Mode does not collect, sell or share any personal data. It has no accounts, no
analytics, no telemetry and no advertising.

## What stays on your device

- Your settings and site rules, kept in the browser's extension storage.
- A cache of the dark styles generated for sites you visit, so they show at once next time.
  It holds the site's origin and CSS only, and old entries are removed automatically.
- A list of sites found to have their own dark theme, and a record of the theme switches
  the extension changed on those sites, so they can be undone.

None of this leaves your device, except as described under "Sync".

## Network requests

The extension makes these requests only:

1. **Stylesheets and images of the page you are viewing**, when the page loads them from
   another site and the browser does not let the page read them. They are fetched without
   cookies so they can be converted to dark colours. Requests to private network addresses
   are refused.
2. **The site fixes file**, at most once a day, from this project's GitHub releases
   (`github.com/nikhil914/smart-dark-mode`). No information about you or your browsing is
   sent. GitHub sees an ordinary download request. You can turn this off in the options.
3. **PDF files you open**, which the built-in PDF viewer loads from the same address the
   browser was going to open.

## Sync

If you turn on sync, your settings (not your browsing history) are stored in your browser
account's sync storage (Google, Microsoft, Mozilla or Apple, depending on the browser) and
copied to your other devices. That storage is governed by your browser vendor's privacy
policy. Sync is off by default.

## Problem reports

"Report a problem" opens a pre-filled issue on GitHub in a new tab. It contains only the
site's host name, the mode and the extension version. Nothing is sent unless you submit the
issue yourself on GitHub.

## Safari app

The Safari app passes Shortcuts commands (turn dark mode on or off, choose a theme) to the
extension through a storage area shared between the app and the extension on your device.
It collects nothing.

## Permissions

| Permission | Why |
| --- | --- |
| Read and change data on all websites | To apply dark mode to the pages you visit. |
| Storage | To keep your settings on your device. |
| Tabs | To show the mode of the current site in the toolbar and popup. |
| Alarms | For scheduled dark mode and the daily fixes check. |
| Scripting | To apply dark styles before a page first paints. |
| Context menus | For the right-click menu items. |
| Declarative net request | To open PDF files in the dark viewer. |
| DNS (Firefox) | To refuse fetches that resolve to private network addresses. |
| Native messaging (Safari) | To receive Shortcuts commands from the Safari app. |

## Contact

Questions go to the issue tracker: https://github.com/nikhil914/smart-dark-mode/issues
