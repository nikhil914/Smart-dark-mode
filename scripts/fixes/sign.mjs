#!/usr/bin/env node
/**
 * Signs a bundle: writes <file>.sig (base64 ECDSA P-256 / SHA-256, r||s).
 * The private JWK comes from the FIXES_SIGNING_KEY environment variable.
 *
 *   FIXES_SIGNING_KEY='{"kty":"EC",...}' node scripts/fixes/sign.mjs fixes.json
 */
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const secret = process.env.FIXES_SIGNING_KEY;
if (!file || !secret) {
  console.error('usage: FIXES_SIGNING_KEY=<private jwk> sign.mjs <fixes.json>');
  process.exit(2);
}
const key = await crypto.subtle.importKey(
  'jwk',
  JSON.parse(secret),
  { name: 'ECDSA', namedCurve: 'P-256' },
  false,
  ['sign'],
);
const data = readFileSync(file);
const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, data));
writeFileSync(`${file}.sig`, Buffer.from(sig).toString('base64'));
console.log(`signed ${file}`);
