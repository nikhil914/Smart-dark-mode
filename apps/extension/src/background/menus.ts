import { t } from '@/lib/i18n';
import type { ToolRequest } from '@/lib/messages';

/**
 * Right-click menu. Not every browser has one (Firefox for Android), so every call is
 * guarded and the features stay reachable from the popup.
 */

export const MENU_SITE = 'sdm-site';
export const MENU_FIX = 'sdm-fix';
export const MENU_PDF = 'sdm-pdf';

type Menus = typeof browser.contextMenus;

function menus(): Menus | undefined {
  return (browser as { contextMenus?: Menus }).contextMenus;
}

export async function createMenus(): Promise<void> {
  const api = menus();
  if (!api) return;
  await api.removeAll();
  api.create({ id: MENU_SITE, title: t('menuToggleSite'), contexts: ['page', 'frame'] });
  api.create({
    id: MENU_FIX,
    title: t('menuFixElement'),
    contexts: ['page', 'frame', 'selection', 'image', 'link'],
  });
  api.create({
    id: MENU_PDF,
    title: t('menuOpenPdf'),
    contexts: ['link'],
    targetUrlPatterns: ['*://*/*.pdf', '*://*/*.PDF', '*://*/*.pdf?*', '*://*/*.PDF?*'],
  });
}

export function onMenuClick(toggleSite: (url: string) => Promise<void>): void {
  const api = menus();
  if (!api) return;
  api.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_SITE && tab?.url) void toggleSite(tab.url);
    else if (info.menuItemId === MENU_FIX && tab?.id !== undefined) {
      const request: ToolRequest = { type: 'sdm:tool', tool: 'picker', atContextMenu: true };
      void browser.tabs.sendMessage(tab.id, request, { frameId: 0 }).catch(() => undefined);
    } else if (info.menuItemId === MENU_PDF && info.linkUrl && /^https?:/i.test(info.linkUrl)) {
      const viewer = browser.runtime.getURL('/pdf.html');
      void browser.tabs.create({
        url: `${viewer}?file=${encodeURIComponent(info.linkUrl)}`,
        ...(tab?.index !== undefined ? { index: tab.index + 1 } : {}),
      });
    }
  });
}
