# Wireframes (P0)

## Popup (360 px wide; same layout on Firefox for Android)
- Header: site favicon and hostname, the rule that applies ("this site, subdomains inherit"), and a global on/off button.
- Mode switch: Dark / Filtered / Normal.
- Native theme banner (only when the site has its own dark theme): Use site's theme / Use ours / Don't touch.
- Theme picker: Dark (Balanced, Vivid, Muted), AMOLED black, Dim grey, Sepia.
- Sliders (hidden in Normal mode): brightness, contrast, saturation, warmth, dim.
- "Apply to" scope: this site, this subdomain only, this page only, everywhere.
- Status line: schedule state and fixes DB version.
- Footer actions: Fix an element, Report site, Settings.

## Options page: Sites and rules
- Left navigation: General, Sites and rules, Schedule, Themes, Images and controls, Site fixes, Shortcuts, Privacy, Backup and sync, Advanced.
- List mode switch: "On everywhere except blocked" / "Only on allowed sites".
- Precedence strip, lowest to highest: Global, Domain, Subdomain, URL pattern, Page.
- Add rule input (domain, glob such as `*.atlassian.net/wiki/*`, or `/regex/`).
- Rules table: match, level, mode, overridden settings, native-theme choice, Edit.
- Footer: export settings (JSON), import from file / Night Eye / Dark Reader, show QR code for phone.

## Element picker and self-diagnosis chip
- Hovered element outlined, with its selector shown in a label.
- Floating panel "Fix this element": Parent / Child navigation (arrow keys also work).
- Actions: Invert, Keep original colours, Force background, Force text colour, Hide background image.
- Generated rule shown in Dark Reader fix syntax (`INVERT` or `CSS` block), with live preview.
- Buttons: Save for this site, Share fix.
- Self-diagnosis chip at the bottom of the page: "This page doesn't look right (18% still bright)", with Try Filtered, Fix an element, Report and Dismiss.
