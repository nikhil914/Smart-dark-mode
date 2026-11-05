# Building from source

These steps rebuild the exact packages that are uploaded to the stores. They are written
for store reviewers, but anyone can follow them.

## Requirements

- Linux, macOS or Windows
- Node.js 22 (any 22.x release)
- pnpm 10.28.0. With Node 22 the simplest way is `corepack enable`, which picks the version
  pinned in `package.json`. Otherwise run `npm install -g pnpm@10.28.0`.

## Steps

Run these from the folder that contains this file:

```sh
pnpm install --frozen-lockfile
pnpm --filter @sdm/extension build:firefox
```

The Firefox add-on is written to `apps/extension/.output/firefox-mv3/`. Its contents match
the uploaded `smart-dark-mode-<version>-firefox.zip`.

Other targets use the same command with `build:chrome`, `build:edge` or `build:safari`.

## What the build does

- [WXT](https://wxt.dev) and Vite bundle and minify the TypeScript sources in
  `apps/extension/src` and the workspace packages in `packages/`.
- The PDF viewer uses `pdfjs-dist` from npm unchanged. Its fonts and WebAssembly image
  decoders are copied from `node_modules/pdfjs-dist` (see `apps/extension/wxt.config.ts`).
- No code is downloaded or generated at run time. The only remote file the extension may
  load is a signed JSON file of CSS fixes for individual sites, which is data and is
  verified before use.

`tests/harness/package.json` is included only because the lockfile lists it as a workspace
package. Nothing from it is part of the add-on.
