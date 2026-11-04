import { type FixesBundle, parseFixesBundle } from './format';

/**
 * Signed bundles: `fixes.json` plus `fixes.json.sig`, an ECDSA P-256 / SHA-256 signature
 * (IEEE P1363 r||s, base64) over the exact bytes of `fixes.json`. The public key is built
 * into the extension; a bundle that fails verification is dropped and the previous one kept.
 */

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64.trim());
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function verifyFixes(
  bytes: Uint8Array,
  signatureBase64: string,
  publicKey: JsonWebKey,
): Promise<FixesBundle | null> {
  let signature: Uint8Array;
  try {
    signature = base64ToBytes(signatureBase64);
  } catch {
    return null;
  }
  if (signature.length !== 64) return null;
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      publicKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      signature as BufferSource,
      bytes as BufferSource,
    );
    if (!ok) return null;
    return parseFixesBundle(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}
