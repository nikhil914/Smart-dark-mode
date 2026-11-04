import { describe, expect, it } from 'vitest';
import { checkFetchUrl, contentTypeAllowed, isPrivateAddress } from '../src/net/url-guard';

describe('checkFetchUrl', () => {
  it.each([
    'http://localhost:8080/x.css',
    'http://192.168.1.1/x.css',
    'https://192.168.1.1/x.css',
    'https://example.com:8443/x.css',
    'file:///etc/passwd',
    'https://localhost/x.css',
    'https://127.0.0.1/x.css',
    'https://2130706433/x.css',
    'https://0x7f000001/x.css',
    'https://[::1]/x.css',
    'https://[::ffff:127.0.0.1]/x.css',
    'https://foo.lvh.me/x.css',
    'https://10.0.0.1.nip.io/x.css',
    'https://printer.local/x.css',
    'https://router.home.arpa/x.css',
    'https://intranet/x.css',
    'https://user:pw@example.com/x.css',
    'data:text/css,body{}',
    'javascript:alert(1)',
  ])('refuses %s', (url) => {
    expect(checkFetchUrl(url).ok).toBe(false);
  });

  it.each(['https://cdn.example.org/site.css', 'https://fonts.googleapis.com/css2?family=Inter'])(
    'allows %s',
    (url) => expect(checkFetchUrl(url).ok).toBe(true),
  );
});

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.1',
    '192.168.0.10',
    '169.254.1.1',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:10.0.0.1',
    '224.0.0.1',
  ])('%s is private', (ip) => expect(isPrivateAddress(ip)).toBe(true));
  it.each(['8.8.8.8', '151.101.1.69', '2606:4700::1111'])('%s is public', (ip) =>
    expect(isPrivateAddress(ip)).toBe(false),
  );
});

describe('contentTypeAllowed', () => {
  it('validates content types', () => {
    expect(contentTypeAllowed('css', 'text/css; charset=utf-8')).toBe(true);
    expect(contentTypeAllowed('css', 'text/html')).toBe(false);
    expect(contentTypeAllowed('image', 'image/png')).toBe(true);
    expect(contentTypeAllowed('image', 'image/svg+xml')).toBe(false);
    expect(contentTypeAllowed('css', null)).toBe(false);
  });
});
