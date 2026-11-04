import { describe, expect, it } from 'vitest';
import {
  FIXES_FORMAT,
  fixMatches,
  fixesFor,
  invertCss,
  parseDarkReaderFixes,
  parseFixesBundle,
  verifyFixes,
} from '../src';

const SAMPLE = `*

INVERT
.global-thing

================================

example.com
*.example.org/app

INVERT
canvas.map
.logo

CSS
.header {
    background: \${white} !important;
}

IGNORE INLINE STYLE
.chart *

UNKNOWN DIRECTIVE
whatever

================================

docs.example.com

IGNORE IMAGE ANALYSIS
.avatar
`;

describe('Dark Reader fixes parser', () => {
  const fixes = parseDarkReaderFixes(SAMPLE);

  it('reads blocks, URLs and directives, skipping unknown ones', () => {
    expect(fixes).toHaveLength(3);
    expect(fixes[1]).toEqual({
      url: ['example.com', '*.example.org/app'],
      invert: ['canvas.map', '.logo'],
      css: '.header {\n    background: ${white} !important;\n}',
      ignoreInlineStyle: ['.chart *'],
    });
    expect(fixes[2]).toEqual({ url: ['docs.example.com'], ignoreImageAnalysis: ['.avatar'] });
  });
});

describe('matching', () => {
  const fix = { url: ['example.com', '*.example.org/app'] };

  it('matches hosts, subdomains and paths', () => {
    expect(fixMatches(fix, 'example.com', '/')).toBe(true);
    expect(fixMatches(fix, 'www.example.com', '/x')).toBe(true);
    expect(fixMatches(fix, 'mail.example.com', '/x')).toBe(true);
    expect(fixMatches(fix, 'badexample.com', '/')).toBe(false);
    expect(fixMatches(fix, 'a.example.org', '/app')).toBe(true);
    expect(fixMatches(fix, 'a.example.org', '/other')).toBe(false);
  });

  it('never applies the catch-all * entry', () => {
    expect(fixMatches({ url: ['*'] }, 'example.com', '/')).toBe(false);
  });

  it('merges matches with more specific patterns last', () => {
    const bundle = parseFixesBundle({
      format: FIXES_FORMAT,
      version: 1,
      sites: [
        { url: ['docs.example.com'], css: 'b{}' },
        { url: ['example.com'], css: 'a{}', invert: ['x'] },
      ],
    });
    const merged = fixesFor([bundle], 'docs.example.com', '/');
    expect(merged.css).toBe('a{}\nb{}');
    expect(merged.invert).toEqual(['x']);
  });

  it('re-inverts media inside inverted elements', () => {
    expect(invertCss(['.map'])).toContain('.map img, .map video');
    expect(invertCss([])).toBe('');
  });
});

describe('bundle validation', () => {
  it('rejects wrong format and bad versions, drops bad entries', () => {
    expect(parseFixesBundle({ format: 'x', version: 1, sites: [] })).toBeNull();
    expect(parseFixesBundle({ format: FIXES_FORMAT, version: 0, sites: [] })).toBeNull();
    const b = parseFixesBundle({
      format: FIXES_FORMAT,
      version: 3,
      sites: [{ url: [] }, { url: ['a.com'], css: 7, invert: ['', 'x'] }],
    });
    expect(b?.sites).toEqual([{ url: ['a.com'], invert: ['x'] }]);
  });
});

describe('signature check', () => {
  const bundle = {
    format: FIXES_FORMAT,
    version: 2,
    created: '',
    sites: [{ url: ['a.com'], css: 'a{}' }],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(bundle));

  async function sign(data: Uint8Array) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    const sig = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        pair.privateKey,
        data as BufferSource,
      ),
    );
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    return { sig: btoa(String.fromCharCode(...sig)), jwk };
  }

  it('accepts a correctly signed bundle', async () => {
    const { sig, jwk } = await sign(bytes);
    expect((await verifyFixes(bytes, sig, jwk))?.version).toBe(2);
  });

  it('rejects tampered data, a wrong key and malformed signatures', async () => {
    const { sig, jwk } = await sign(bytes);
    const tampered = new TextEncoder().encode(JSON.stringify({ ...bundle, version: 3 }));
    expect(await verifyFixes(tampered, sig, jwk)).toBeNull();
    const other = await sign(bytes);
    expect(await verifyFixes(bytes, sig, other.jwk)).toBeNull();
    expect(await verifyFixes(bytes, 'not base64!', jwk)).toBeNull();
    expect(await verifyFixes(bytes, btoa('short'), jwk)).toBeNull();
  });
});
