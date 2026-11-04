#!/usr/bin/env node
/**
 * Creates the key pair that signs site-fix bundles.
 * Prints the public key (paste into apps/extension/src/data/fixes-key.ts) and the private
 * key (store as the FIXES_SIGNING_KEY repository secret; never commit it).
 */
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);
const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
console.log('Public key (commit this):');
console.log(JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }));
console.log('\nPrivate key (secret FIXES_SIGNING_KEY, keep it out of the repository):');
console.log(JSON.stringify(priv));
