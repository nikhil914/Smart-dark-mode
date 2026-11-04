import { omitKey } from '@sdm/settings';

/**
 * Origins found to have their own dark theme. Kept in extension storage so the next visit
 * skips conversion from the first paint. Never touches page storage.
 */
const KEY = 'native-dark';
const MAX = 500;

type Store = Record<string, number>;

async function read(): Promise<Store> {
  const data = await browser.storage.local.get(KEY);
  const value = data[KEY];
  return typeof value === 'object' && value !== null ? (value as Store) : {};
}

export async function isNativeDark(origin: string): Promise<boolean> {
  return origin in (await read());
}

export async function rememberNativeDark(origin: string): Promise<void> {
  const store = await read();
  store[origin] = Date.now();
  const entries = Object.entries(store);
  const kept =
    entries.length > MAX
      ? Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, MAX))
      : store;
  await browser.storage.local.set({ [KEY]: kept });
}

export async function forgetNativeDark(origin: string): Promise<void> {
  const store = await read();
  if (!(origin in store)) return;
  await browser.storage.local.set({ [KEY]: omitKey(store, origin) });
}

export async function clearNativeDark(): Promise<void> {
  await browser.storage.local.remove(KEY);
}
