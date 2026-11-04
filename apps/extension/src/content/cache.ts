/**
 * Instant-on cache (F1b): the CSS generated for an origin is kept in extension storage
 * and applied immediately on the next visit, before the page's sheets are analysed.
 * It never touches page storage.
 */
const PREFIX = 'cache:';
const INDEX_KEY = 'cache-index';
const MAX_ENTRY = 400 * 1024;
const MAX_ENTRIES = 60;

interface Entry {
  css: string;
  themeKey: string;
  t: number;
}

export async function readCache(origin: string, themeKey: string): Promise<string | null> {
  const key = PREFIX + origin;
  const data = await browser.storage.local.get(key);
  const entry = data[key] as Entry | undefined;
  return entry && entry.themeKey === themeKey ? entry.css : null;
}

export async function writeCache(origin: string, themeKey: string, css: string): Promise<void> {
  if (css.length > MAX_ENTRY) return;
  const key = PREFIX + origin;
  const { [INDEX_KEY]: rawIndex } = await browser.storage.local.get(INDEX_KEY);
  const index = (Array.isArray(rawIndex) ? rawIndex : []).filter(
    (k): k is string => typeof k === 'string' && k !== key,
  );
  index.push(key);
  const evict = index.length > MAX_ENTRIES ? index.splice(0, index.length - MAX_ENTRIES) : [];
  if (evict.length) await browser.storage.local.remove(evict);
  await browser.storage.local.set({
    [key]: { css, themeKey, t: Date.now() } satisfies Entry,
    [INDEX_KEY]: index,
  });
}

export async function clearCache(): Promise<void> {
  const { [INDEX_KEY]: rawIndex } = await browser.storage.local.get(INDEX_KEY);
  const index = Array.isArray(rawIndex) ? (rawIndex as string[]) : [];
  await browser.storage.local.remove([...index, INDEX_KEY]);
}
