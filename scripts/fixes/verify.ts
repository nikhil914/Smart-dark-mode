/** Checks a signed bundle against the public key built into the extension. */
import { readFileSync } from 'node:fs';
import { verifyFixes } from '../../packages/engine/src/fixes';
import { FIXES_PUBLIC_KEY } from '../../apps/extension/src/data/fixes-key';

const file = process.argv[2]!;
if (!FIXES_PUBLIC_KEY) {
  console.error('No public key in apps/extension/src/data/fixes-key.ts yet.');
  process.exit(1);
}
const bundle = await verifyFixes(
  new Uint8Array(readFileSync(file)),
  readFileSync(`${file}.sig`, 'utf8'),
  FIXES_PUBLIC_KEY,
);
if (!bundle) {
  console.error('Signature check failed.');
  process.exit(1);
}
console.log(`OK: version ${bundle.version}, ${bundle.sites.length} sites`);
