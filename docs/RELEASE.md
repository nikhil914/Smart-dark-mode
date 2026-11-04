# Releasing

Store uploads need the owner's developer accounts, so they are done by hand. Everything
up to the upload is automated.

## 1. Prepare

1. Set the version in `apps/extension/package.json` and `MARKETING_VERSION` in
   `apps/safari-host/project.yml`. Raise `CURRENT_PROJECT_VERSION` too.
2. Run the checks: `pnpm lint && pnpm typecheck && pnpm test`, then build and run
   `pnpm --filter @sdm/harness features`.
3. Refresh the store images if the UI changed: `node tests/harness/assets.mjs`.
4. Merge to `main`, then push a tag such as `v0.1.0`. The **Release** workflow checks that
   the tag matches the version, runs the checks, and attaches these to a draft release:
   - `*-chrome.zip`: Chrome Web Store, Opera, and other Chromium stores
   - `*-edge.zip`: Microsoft Edge Add-ons
   - `*-firefox.zip` and `*-sources.zip`: Firefox Add-ons (AMO asks for the source zip
     because the code is bundled)
   - `*-safari.zip`: the web extension inside the Safari app, for reference

## 2. Chrome Web Store

Developer account: one-time USD 5 fee. Upload `*-chrome.zip` in the developer dashboard.
Copy the listing text, single purpose, permission justifications and data disclosures from
`docs/store/LISTING.md`. Add the screenshots and the 440x280 tile from `docs/store/screenshots/`.

## 3. Microsoft Edge Add-ons

Free Partner Center account. Upload `*-edge.zip`. The same listing text works. Edge for
Android installs extensions from the same listing.

## 4. Firefox Add-ons (desktop and Android)

Free account. Upload `*-firefox.zip` and `*-sources.zip`, and say in the reviewer notes:
"Build with `pnpm install --frozen-lockfile && pnpm --filter @sdm/extension build:firefox`
(Node 22, pnpm 10)." The manifest already marks the add-on as Android compatible and
declares that it collects no data.

## 5. Safari (macOS, iOS, iPadOS)

Needs the Apple Developer Program (USD 99 a year) and a Mac with Xcode 16.

1. `pnpm --filter @sdm/extension build:safari`
2. `brew install xcodegen && xcodegen generate --spec apps/safari-host/project.yml`
3. Open `apps/safari-host/SmartDarkMode.xcodeproj`. For all four targets, set your team.
   The App Group `group.io.github.nikhil914.smartdarkmode` must be registered in your
   account. Xcode offers to register it when you choose the team.
4. Product > Archive for the macOS app and the iOS app, then distribute both to App Store
   Connect. Use the App Store extras in `docs/store/LISTING.md`. App Store screenshots must
   come from a device or simulator, at the sizes listed there.

The **Safari app** workflow builds both apps unsigned on every pull request, so the step
above only adds signing.

## 6. Site fixes

These are separate from extension releases. Run the **Publish site fixes** workflow when
`fixes/own.json` changes or Dark Reader's fixes should be picked up. It replaces the assets
of the release tagged `fixes`. Before the first run, create the key pair (see README).
