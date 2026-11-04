/**
 * Builds a fixes bundle: Dark Reader's dynamic-theme fixes (MIT) converted to our format,
 * then our own fixes, which win where both apply.
 *
 *   node scripts/fixes/run.mjs build <darkreader-fixes.config|-> <our-fixes.json|-> <out.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  FIXES_FORMAT,
  type FixesBundle,
  type SiteFix,
  parseDarkReaderFixes,
  parseFixesBundle,
} from '../../packages/engine/src/fixes';

const [darkreaderPath, ownPath, outPath] = process.argv.slice(2);
if (!outPath) {
  console.error('usage: build <darkreader-fixes.config|-> <our-fixes.json|-> <out.json>');
  process.exit(2);
}

const sites: SiteFix[] = [];
if (darkreaderPath && darkreaderPath !== '-') {
  sites.push(...parseDarkReaderFixes(readFileSync(darkreaderPath, 'utf8')));
}
if (ownPath && ownPath !== '-') {
  const own = parseFixesBundle(JSON.parse(readFileSync(ownPath, 'utf8')));
  if (!own) throw new Error(`${ownPath} is not a fixes bundle`);
  sites.push(...own.sites);
}

const now = new Date();
const bundle: FixesBundle = {
  format: FIXES_FORMAT,
  // Minutes since 2026-01-01: always increasing, fits easily in a safe integer.
  version: Math.floor((now.getTime() - Date.UTC(2026, 0, 1)) / 60000),
  created: now.toISOString(),
  sites,
};
writeFileSync(outPath, JSON.stringify(bundle));
console.log(`${sites.length} site fixes, version ${bundle.version} -> ${outPath}`);
