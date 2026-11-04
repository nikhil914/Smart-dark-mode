import {
  FETCH_LIMITS,
  LRU,
  checkFetchUrl,
  contentTypeAllowed,
  isPrivateAddress,
} from '@sdm/engine';
import type { FetchKind, FetchResponse } from '@/lib/messages';

const cache = new LRU<string, string>(200);
const perTab = new Map<number, { count: number; since: number }>();
const PER_TAB_PER_MINUTE = 120;

interface DnsApi {
  resolve(host: string): Promise<{ addresses: string[] }>;
}

function dnsApi(): DnsApi | undefined {
  return (browser as unknown as { dns?: DnsApi }).dns;
}

function rateLimited(tabId: number): boolean {
  const now = Date.now();
  let entry = perTab.get(tabId);
  if (!entry || now - entry.since > 60_000) perTab.set(tabId, (entry = { count: 0, since: now }));
  return ++entry.count > PER_TAB_PER_MINUTE;
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > maxBytes) return null;
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function toDataUrl(bytes: Uint8Array, type: string): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

/**
 * Fetches a cross-origin stylesheet or image for a content script.
 * https only, default port, no IPs or local names, no private addresses (Firefox
 * resolves DNS first), no cookies, no redirects, content type and size checked.
 */
export async function safeFetch(
  kind: FetchKind,
  rawUrl: string,
  tabId: number | undefined,
): Promise<FetchResponse> {
  if (tabId === undefined) return { ok: false, error: 'no-tab' };
  const check = checkFetchUrl(rawUrl);
  if (!check.ok) return { ok: false, error: check.reason };
  const url = check.url.href;
  const cacheKey = `${kind}:${url}`;
  const hit = cache.get(cacheKey);
  if (hit !== undefined) return { ok: true, data: hit };
  if (rateLimited(tabId)) return { ok: false, error: 'rate-limited' };

  const dns = dnsApi();
  if (dns) {
    try {
      const { addresses } = await dns.resolve(check.url.hostname);
      if (!addresses.length || addresses.some(isPrivateAddress))
        return { ok: false, error: 'private-address' };
    } catch {
      return { ok: false, error: 'dns' };
    }
  }

  try {
    const res = await fetch(url, {
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'force-cache',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, error: `http-${res.status}` };
    const type = res.headers.get('content-type');
    if (!contentTypeAllowed(kind, type)) return { ok: false, error: 'content-type' };
    const bytes = await readCapped(res, FETCH_LIMITS[kind].maxBytes);
    if (!bytes) return { ok: false, error: 'too-large' };
    const data =
      kind === 'css'
        ? new TextDecoder().decode(bytes)
        : toDataUrl(bytes, type!.split(';')[0]!.trim());
    cache.set(cacheKey, data);
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export function forgetTab(tabId: number): void {
  perTab.delete(tabId);
}
