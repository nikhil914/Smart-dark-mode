/**
 * Decides whether the background may fetch a cross-origin resource for a page.
 * Defends against CVE-2025-68467-style abuse: a page asking the extension to read
 * localhost or LAN resources that the page itself could not read.
 */

const LOCAL_ALIASES = new Set([
  '127-0-0-1.org.uk',
  '42foo.com',
  'domaincontrol.com',
  'fbi.com',
  'fuf.me',
  'lacolhost.com',
  'local.sisteminha.com',
  'localfabriek.nl',
  'localhost',
  'localhst.co.uk',
  'localmachine.info',
  'localmachine.name',
  'localtest.me',
  'lvh.me',
  'mouse-potato.com',
  'nip.io',
  'sslip.io',
  'vcap.me',
  'xip.io',
  'yoogle.com',
  'traefik.me',
  'localdev.me',
]);

const LOCAL_SUFFIXES = [
  '.corp',
  '.direct',
  '.home',
  '.home.arpa',
  '.internal',
  '.intranet',
  '.lan',
  '.local',
  '.localdomain',
  '.localhost',
  '.test',
  '.zz',
  '.arpa',
  '.onion',
  '.invalid',
  '.example',
];

export type GuardResult = { ok: true; url: URL } | { ok: false; reason: string };

function isIpLiteral(hostname: string): boolean {
  if (hostname.startsWith('[')) return true;
  const last = hostname.split('.').pop() ?? '';
  // WHATWG URL parsing already normalises decimal/hex/octal IPv4 into dotted form,
  // but a purely numeric last label still means an IP literal.
  return /^(0x[0-9a-f]+|\d+)$/i.test(last);
}

export function checkFetchUrl(raw: string): GuardResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'protocol' };
  if (url.port !== '') return { ok: false, reason: 'port' };
  if (url.username || url.password) return { ok: false, reason: 'credentials' };
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.')) return { ok: false, reason: 'single-label-host' };
  if (isIpLiteral(host)) return { ok: false, reason: 'ip-literal' };
  if (LOCAL_ALIASES.has(host) || [...LOCAL_ALIASES].some((a) => host.endsWith(`.${a}`))) {
    return { ok: false, reason: 'local-alias' };
  }
  if (LOCAL_SUFFIXES.some((s) => host.endsWith(s))) return { ok: false, reason: 'local-suffix' };
  return { ok: true, url };
}

/** True for loopback, private, link-local, CGNAT, ULA, multicast and unspecified addresses. */
export function isPrivateAddress(address: string): boolean {
  const a = address.toLowerCase().replace(/^\[|\]$/g, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapped) return isPrivateAddress(mapped[1]!);
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(a);
  if (v4) {
    const [o1, o2] = [Number(v4[1]), Number(v4[2])];
    return (
      o1 === 0 ||
      o1 === 10 ||
      o1 === 127 ||
      o1 >= 224 ||
      (o1 === 100 && o2 >= 64 && o2 <= 127) ||
      (o1 === 169 && o2 === 254) ||
      (o1 === 172 && o2 >= 16 && o2 <= 31) ||
      (o1 === 192 && o2 === 168) ||
      (o1 === 192 && o2 === 0) ||
      (o1 === 198 && (o2 === 18 || o2 === 19))
    );
  }
  if (a.includes(':')) {
    return a === '::' || a === '::1' || /^f[cd]/.test(a) || /^fe[89ab]/.test(a) || /^ff/.test(a);
  }
  return true;
}

export const FETCH_LIMITS = {
  css: { maxBytes: 2 * 1024 * 1024, types: ['text/css'] },
  image: { maxBytes: 5 * 1024 * 1024, types: ['image/'] },
} as const;

export function contentTypeAllowed(
  kind: keyof typeof FETCH_LIMITS,
  contentType: string | null,
): boolean {
  if (!contentType) return false;
  const ct = contentType.split(';')[0]!.trim().toLowerCase();
  if (kind === 'image' && ct === 'image/svg+xml') return false;
  return FETCH_LIMITS[kind].types.some((t) => (t.endsWith('/') ? ct.startsWith(t) : ct === t));
}
