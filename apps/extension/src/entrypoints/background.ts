import {
  type Mode,
  type Settings,
  automationActive,
  migrate,
  nextBoundary,
  nextMode,
  resolve,
  setRuleMode,
  siteDomain,
  toPageLocation,
} from '@sdm/settings';
import { syncFallback } from '@/background/fallback';
import { FIXES_ALARM, scheduleFixesUpdates, siteFixes, updateFixes } from '@/background/fixes';
import { createMenus, onMenuClick } from '@/background/menus';
import { allowOriginal, forgetTabRules, syncPdfRedirect } from '@/background/pdf';
import { isRemoteChange, onLocalChange, pull } from '@/background/sync';
import { forgetTab, safeFetch } from '@/background/safe-fetch';
import { isContentMessage } from '@/lib/messages';
import {
  ensureSettings,
  isOsSchemeChange,
  isSettingsChange,
  loadOsPrefersDark,
  loadSettings,
  saveSettings,
} from '@/lib/settings-store';

const BOUNDARY_ALARM = 'schedule-boundary';

const BADGE: Record<Mode, { text: string; color: string }> = {
  dark: { text: '', color: '#f0a35e' },
  filtered: { text: 'F', color: '#5e9bf0' },
  normal: { text: 'off', color: '#6b6b73' },
};

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    const settings = await ensureSettings();
    await syncPdfRedirect(settings.pdf.enabled);
    await pull();
    await scheduleFixesUpdates();
    await createMenus();
    await scheduleBoundaryAlarm();
    await refreshFallback();
    await refreshAllBadges();
  });

  browser.runtime.onStartup.addListener(async () => {
    await createMenus();
    await pull();
    await scheduleBoundaryAlarm();
    await refreshFallback();
    await refreshAllBadges();
  });

  browser.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'sync') {
      if (isRemoteChange(changes)) await pull();
      return;
    }
    if (area !== 'local') return;
    if (isSettingsChange(changes)) {
      const change = changes.settings as { oldValue?: unknown; newValue?: unknown };
      const previous = change.oldValue === undefined ? undefined : migrate(change.oldValue);
      const next = migrate(change.newValue);
      if (previous?.pdf.enabled !== next.pdf.enabled) await syncPdfRedirect(next.pdf.enabled);
      await onLocalChange(previous, next);
      await scheduleBoundaryAlarm();
    }
    if (isSettingsChange(changes) || isOsSchemeChange(changes)) {
      await refreshFallback();
      await refreshAllBadges();
    }
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === FIXES_ALARM) {
      await updateFixes();
      return;
    }
    if (alarm.name !== BOUNDARY_ALARM) return;
    await scheduleBoundaryAlarm();
    await refreshFallback();
    await refreshAllBadges();
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isContentMessage(message) || sender.id !== browser.runtime.id) return undefined;
    if (message.type === 'sdm:fetch') {
      void safeFetch(message.kind, message.url, sender.tab?.id).then(sendResponse);
      return true;
    }
    if (message.type === 'sdm:fixes') {
      void siteFixes(message.host, message.path).then(sendResponse);
      return true;
    }
    if (message.type === 'sdm:fixes-update') {
      // Only extension pages (no tab) may ask; content scripts cannot trigger downloads.
      if (sender.tab) return undefined;
      void updateFixes().then(sendResponse);
      return true;
    }
    if (message.type === 'sdm:pdf-original' && sender.tab?.id !== undefined) {
      void allowOriginal(message.url, sender.tab.id).then(() => sendResponse(true));
      return true;
    }
    return undefined;
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    forgetTab(tabId);
    void forgetTabRules(tabId);
  });

  browser.tabs.onActivated.addListener(({ tabId }) => void refreshBadge(tabId));
  browser.tabs.onUpdated.addListener((tabId, info) => {
    if (info.url !== undefined || info.status === 'loading') void refreshBadge(tabId);
  });

  onMenuClick((url) => changeSiteMode(url, 'toggle-site'));

  browser.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-global') {
      const settings = await loadSettings();
      await saveSettings({ ...settings, enabled: !settings.enabled });
      return;
    }
    if (command === 'pick-element') {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id !== undefined) {
        await browser.tabs
          .sendMessage(tab.id, { type: 'sdm:tool', tool: 'picker' }, { frameId: 0 })
          .catch(() => undefined);
      }
      return;
    }
    if (command !== 'toggle-site' && command !== 'cycle-mode') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) await changeSiteMode(tab.url, command);
  });
});

async function changeSiteMode(url: string, how: 'toggle-site' | 'cycle-mode'): Promise<void> {
  const settings = await loadSettings();
  const loc = toPageLocation(url);
  if (!loc) return;
  const domain = siteDomain(loc.host);
  const current = configuredMode(settings, url);
  const next: Mode =
    how === 'toggle-site' ? (current === 'normal' ? 'dark' : 'normal') : nextMode(current);
  // Store nothing when the site would just follow the global default.
  const value = next === settings.defaultMode ? undefined : next;
  await saveSettings(setRuleMode(settings, 'domain', domain, value));
}

async function refreshFallback(): Promise<void> {
  const [settings, osDark] = await Promise.all([loadSettings(), loadOsPrefersDark()]);
  await syncFallback(settings, osDark);
}

/** The mode the user configured for a URL, ignoring the master switch and automation. */
function configuredMode(settings: Settings, url: string): Mode {
  const loc = toPageLocation(url);
  if (!loc) return 'normal';
  return resolve({ ...settings, enabled: true, listMode: 'blocklist' }, loc, {
    automationActive: true,
  }).mode;
}

async function effectiveMode(url: string | undefined): Promise<Mode | null> {
  const loc = url ? toPageLocation(url) : null;
  if (!loc) return null;
  const [settings, osDark] = await Promise.all([loadSettings(), loadOsPrefersDark()]);
  const active = automationActive(settings, new Date(), osDark);
  return resolve(settings, loc, { automationActive: active }).mode;
}

async function refreshBadge(tabId: number): Promise<void> {
  try {
    const tab = await browser.tabs.get(tabId);
    const mode = await effectiveMode(tab.url);
    const badge = mode ? BADGE[mode] : { text: '', color: '#6b6b73' };
    await browser.action.setBadgeText({ tabId, text: badge.text });
    await browser.action.setBadgeBackgroundColor({ tabId, color: badge.color });
  } catch {
    // Tab closed between the event and this call.
  }
}

async function refreshAllBadges(): Promise<void> {
  const tabs = await browser.tabs.query({});
  await Promise.all(tabs.map((t) => (t.id === undefined ? undefined : refreshBadge(t.id))));
}

async function scheduleBoundaryAlarm(): Promise<void> {
  await browser.alarms.clear(BOUNDARY_ALARM);
  const settings = await loadSettings();
  if (settings.automation.kind !== 'schedule') return;
  const { from, to } = settings.automation.schedule;
  const next = nextBoundary(new Date(), from, to);
  if (next) await browser.alarms.create(BOUNDARY_ALARM, { when: next.getTime() + 1000 });
}
