#!/usr/bin/env node
/** Runs a TypeScript script from this folder by bundling it with esbuild first. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const [name, ...args] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const out = join(mkdtempSync(join(tmpdir(), 'sdm-fixes-')), `${name}.mjs`);
await build({
  entryPoints: [join(here, `${name}.ts`)],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'warning',
});
process.exit(spawnSync(process.execPath, [out, ...args], { stdio: 'inherit' }).status ?? 1);
