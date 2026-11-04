import { type Settings, applyExternalCommands, parseExternalCommands } from '@sdm/settings';
import { loadSettings, saveSettings } from '@/lib/settings-store';

/**
 * Safari only: the host app offers Shortcuts actions ("Turn dark mode on", "Set theme").
 * Safari cannot wake an extension from the app, so the app queues commands and the
 * extension collects them whenever it runs: at startup, on a one-minute alarm, and when
 * tabs change. It also reports its state, so "toggle" in Shortcuts knows what to flip.
 */

/** Ignored by Safari, which routes to the containing app; required by the API. */
const APP_ID = 'io.github.nikhil914.SmartDarkMode';
export const NATIVE_ALARM = 'native-poll';
const MIN_INTERVAL_MS = 2000;

type SendNative = (application: string, message: unknown) => Promise<unknown>;

function sendNative(): SendNative | undefined {
  const runtime = browser.runtime as { sendNativeMessage?: SendNative };
  return runtime.sendNativeMessage?.bind(browser.runtime);
}

export function nativeBridgeAvailable(): boolean {
  return import.meta.env.BROWSER === 'safari' && sendNative() !== undefined;
}

let last = 0;

export async function pollNative(force = false): Promise<void> {
  const send = sendNative();
  if (!nativeBridgeAvailable() || !send) return;
  const now = Date.now();
  if (!force && now - last < MIN_INTERVAL_MS) return;
  last = now;
  try {
    const commands = parseExternalCommands(await send(APP_ID, { type: 'poll' }));
    if (!commands.length) return;
    const settings = await loadSettings();
    await saveSettings(applyExternalCommands(settings, commands));
  } catch {
    // The app is not installed alongside, or the extension context is going away.
  }
}

export async function reportState(settings: Settings): Promise<void> {
  const send = sendNative();
  if (!nativeBridgeAvailable() || !send) return;
  try {
    await send(APP_ID, { type: 'state', enabled: settings.enabled, theme: settings.theme });
  } catch {
    // As above.
  }
}

export async function scheduleNativePoll(): Promise<void> {
  if (!nativeBridgeAvailable()) return;
  const existing = await browser.alarms.get(NATIVE_ALARM);
  if (!existing) await browser.alarms.create(NATIVE_ALARM, { periodInMinutes: 1 });
}
