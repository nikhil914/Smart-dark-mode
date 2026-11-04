/**
 * Public key that signs downloadable site-fix bundles (ECDSA P-256, JWK).
 * Generate the pair with `node scripts/fixes/keygen.mjs`, paste the public key here and
 * store the private key as the `FIXES_SIGNING_KEY` repository secret. While this is null,
 * the extension uses only the fixes built into it and never downloads any.
 */
export const FIXES_PUBLIC_KEY: JsonWebKey | null = null;

/** Where signed bundles are published (assets of the release tagged `fixes`). */
export const FIXES_URL =
  'https://github.com/nikhil914/smart-dark-mode/releases/download/fixes/fixes.json';
