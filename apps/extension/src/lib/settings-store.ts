import { type Settings, defaultSettings, migrate } from '@sdm/settings';

const SETTINGS_KEY = 'settings';
const OS_DARK_KEY = 'osPrefersDark';

export async function loadSettings(): Promise<Settings> {
  const data = await browser.storage.local.get(SETTINGS_KEY);
  return migrate(data[SETTINGS_KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

/** Reads, migrates and writes back stored settings (run on install and update). */
export async function ensureSettings(): Promise<Settings> {
  const data = await browser.storage.local.get(SETTINGS_KEY);
  const settings =
    data[SETTINGS_KEY] === undefined ? defaultSettings() : migrate(data[SETTINGS_KEY]);
  await saveSettings(settings);
  return settings;
}

export function isSettingsChange(changes: Record<string, unknown>): boolean {
  return SETTINGS_KEY in changes;
}

export async function loadOsPrefersDark(): Promise<boolean> {
  const data = await browser.storage.local.get(OS_DARK_KEY);
  return data[OS_DARK_KEY] === true;
}

export async function saveOsPrefersDark(value: boolean): Promise<void> {
  await browser.storage.local.set({ [OS_DARK_KEY]: value });
}

export function isOsSchemeChange(changes: Record<string, unknown>): boolean {
  return OS_DARK_KEY in changes;
}
