/**
 * Splits settings into chunks that fit `storage.sync` limits (8 KB per item, about
 * 100 KB total, 512 items) and joins them back.
 */

export const SYNC_PREFIX = 'sdm-sync:';
export const SYNC_META = `${SYNC_PREFIX}meta`;
/** Characters per chunk. Each value is JSON-encoded again by storage, so leave headroom. */
export const SYNC_CHUNK = 6000;
/** Keep well under the ~100 KB total quota. */
export const SYNC_MAX_CHUNKS = 14;

export interface SyncMeta {
  chunks: number;
  hash: string;
  updatedAt: number;
}

/** Small, stable, non-cryptographic hash (FNV-1a) used to detect changes. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export type SyncItems = Record<string, string | SyncMeta>;

/** Returns the items to write, or null when the data is too large to sync. */
export function toSyncItems(json: string, updatedAt: number): SyncItems | null {
  const chunks = Math.max(1, Math.ceil(json.length / SYNC_CHUNK));
  if (chunks > SYNC_MAX_CHUNKS) return null;
  const items: SyncItems = {};
  for (let i = 0; i < chunks; i++) {
    items[`${SYNC_PREFIX}${i}`] = json.slice(i * SYNC_CHUNK, (i + 1) * SYNC_CHUNK);
  }
  items[SYNC_META] = { chunks, hash: hashText(json), updatedAt };
  return items;
}

/** Keys left over from an earlier, larger write that should be removed. */
export function staleSyncKeys(previousChunks: number, chunks: number): string[] {
  const out: string[] = [];
  for (let i = chunks; i < previousChunks; i++) out.push(`${SYNC_PREFIX}${i}`);
  return out;
}

function isMeta(value: unknown): value is SyncMeta {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.chunks === 'number' &&
    Number.isInteger(v.chunks) &&
    v.chunks > 0 &&
    v.chunks <= SYNC_MAX_CHUNKS &&
    typeof v.hash === 'string' &&
    typeof v.updatedAt === 'number'
  );
}

/** Joins chunks back. Returns null when anything is missing or the hash does not match. */
export function fromSyncItems(
  items: Record<string, unknown>,
): { json: string; meta: SyncMeta } | null {
  const meta = items[SYNC_META];
  if (!isMeta(meta)) return null;
  let json = '';
  for (let i = 0; i < meta.chunks; i++) {
    const part = items[`${SYNC_PREFIX}${i}`];
    if (typeof part !== 'string') return null;
    json += part;
  }
  return hashText(json) === meta.hash ? { json, meta } : null;
}
