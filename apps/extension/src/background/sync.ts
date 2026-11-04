import {
  type Settings,
  SYNC_META,
  SYNC_PREFIX,
  fromSyncItems,
  hashText,
  migrate,
  staleSyncKeys,
  toSyncItems,
} from '@sdm/settings';
import { loadSettings, saveSettings } from '@/lib/settings-store';

/**
 * Mirrors settings to `storage.sync`, chunked to fit its per-item limit, and applies
 * settings that another browser wrote. Local storage stays the source every script reads.
 */

const STATE_KEY = 'sync-state';
const PUSH_DELAY_MS = 2000;

export type SyncError = 'too-large' | 'quota' | null;

interface SyncState {
  /** Hash of the settings last pushed or pulled, so our own writes are not applied back. */
  hash: string;
  updatedAt: number;
  error: SyncError;
}

async function readState(): Promise<SyncState> {
  const data = await browser.storage.local.get(STATE_KEY);
  const v = data[STATE_KEY] as Partial<SyncState> | undefined;
  return { hash: v?.hash ?? '', updatedAt: v?.updatedAt ?? 0, error: v?.error ?? null };
}

async function writeState(state: SyncState): Promise<void> {
  await browser.storage.local.set({ [STATE_KEY]: state });
}

async function readRemote(): Promise<{
  settings: Settings;
  hash: string;
  updatedAt: number;
} | null> {
  const items = await browser.storage.sync.get(null);
  const joined = fromSyncItems(items);
  if (!joined) return null;
  try {
    return {
      settings: migrate(JSON.parse(joined.json)),
      hash: joined.meta.hash,
      updatedAt: joined.meta.updatedAt,
    };
  } catch {
    return null;
  }
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;

export function schedulePush(): void {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void push(), PUSH_DELAY_MS);
}

async function push(): Promise<void> {
  const settings = await loadSettings();
  if (!settings.sync) return;
  const json = JSON.stringify(settings);
  const state = await readState();
  const hash = hashText(json);
  if (hash === state.hash && !state.error) return;
  const updatedAt = Date.now();
  const items = toSyncItems(json, updatedAt);
  if (!items) {
    await writeState({ ...state, error: 'too-large' });
    return;
  }
  const before = (await browser.storage.sync.get(SYNC_META))[SYNC_META] as
    { chunks?: number } | undefined;
  try {
    await browser.storage.sync.set(items);
    const stale = staleSyncKeys(before?.chunks ?? 0, Object.keys(items).length - 1);
    if (stale.length) await browser.storage.sync.remove(stale);
    await writeState({ hash, updatedAt, error: null });
  } catch {
    await writeState({ ...state, error: 'quota' });
  }
}

/** Applies remote settings when they are newer than what this browser last saw. */
export async function pull(force = false): Promise<boolean> {
  const local = await loadSettings();
  if (!local.sync) return false;
  const remote = await readRemote();
  if (!remote) return false;
  const state = await readState();
  if (remote.hash === state.hash) return false;
  if (!force && remote.updatedAt <= state.updatedAt) return false;
  const next: Settings = { ...remote.settings, sync: true };
  await writeState({
    hash: hashText(JSON.stringify(next)),
    updatedAt: remote.updatedAt,
    error: null,
  });
  await saveSettings(next);
  return true;
}

/**
 * Called on every local settings change. When sync has just been switched on, settings
 * saved by another browser win; otherwise local changes are pushed.
 */
export async function onLocalChange(previous: Settings | undefined, next: Settings): Promise<void> {
  if (!next.sync) return;
  if (previous && !previous.sync) {
    if (await pull(true)) return;
  }
  schedulePush();
}

export function isRemoteChange(changes: Record<string, unknown>): boolean {
  return Object.keys(changes).some((k) => k.startsWith(SYNC_PREFIX));
}
