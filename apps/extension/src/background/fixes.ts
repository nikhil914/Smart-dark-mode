import {
  type FixesBundle,
  type SiteFix,
  fixesFor,
  parseFixesBundle,
  verifyFixes,
} from '@sdm/engine';
import { BUNDLED_FIXES } from '@/data/fixes';
import { FIXES_PUBLIC_KEY, FIXES_URL } from '@/data/fixes-key';
import { loadSettings } from '@/lib/settings-store';

/**
 * Keeps the downloaded fixes bundle (F12): fetched daily, accepted only with a valid
 * signature and a higher version than the one in use. A rejected download never replaces
 * the bundle already stored.
 */

const STORE_KEY = 'fixes-remote';
const STATUS_KEY = 'fixes-status';
export const FIXES_ALARM = 'fixes-update';
const MAX_BYTES = 5 * 1024 * 1024;

export type FixesStatus = 'updated' | 'unchanged' | 'disabled' | 'rejected' | 'failed';

let remote: FixesBundle | null | undefined;

async function loadRemote(): Promise<FixesBundle | null> {
  if (remote !== undefined) return remote;
  const data = await browser.storage.local.get(STORE_KEY);
  remote = parseFixesBundle(data[STORE_KEY]);
  return remote;
}

export async function siteFixes(host: string, path: string): Promise<SiteFix> {
  return fixesFor([BUNDLED_FIXES, await loadRemote()], host, path);
}

async function fetchLimited(url: string): Promise<Uint8Array | null> {
  const res = await fetch(url, { credentials: 'omit', cache: 'no-cache' });
  if (!res.ok) return null;
  const length = Number(res.headers.get('content-length') ?? 0);
  if (length > MAX_BYTES) return null;
  const buffer = new Uint8Array(await res.arrayBuffer());
  return buffer.length > MAX_BYTES ? null : buffer;
}

export async function updateFixes(): Promise<FixesStatus> {
  const settings = await loadSettings();
  let status: FixesStatus;
  if (!FIXES_PUBLIC_KEY || !settings.fixesUpdates) status = 'disabled';
  else {
    try {
      const [bytes, sig] = await Promise.all([
        fetchLimited(FIXES_URL),
        fetchLimited(`${FIXES_URL}.sig`),
      ]);
      if (!bytes || !sig) status = 'failed';
      else {
        const bundle = await verifyFixes(bytes, new TextDecoder().decode(sig), FIXES_PUBLIC_KEY);
        const current = await loadRemote();
        if (!bundle) status = 'rejected';
        else if (current && bundle.version <= current.version) status = 'unchanged';
        else {
          await browser.storage.local.set({ [STORE_KEY]: bundle });
          remote = bundle;
          status = 'updated';
        }
      }
    } catch {
      status = 'failed';
    }
  }
  const current = await loadRemote();
  await browser.storage.local.set({
    [STATUS_KEY]: { status, checkedAt: Date.now(), version: current?.version ?? null },
  });
  return status;
}

export async function scheduleFixesUpdates(): Promise<void> {
  const existing = await browser.alarms.get(FIXES_ALARM);
  if (!existing)
    await browser.alarms.create(FIXES_ALARM, { delayInMinutes: 1, periodInMinutes: 24 * 60 });
}
