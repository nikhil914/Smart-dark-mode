/**
 * Sends top-level PDF navigations to the built-in viewer (F9) with a declarativeNetRequest
 * redirect. Content scripts catch PDFs whose address does not end in .pdf.
 */
const REDIRECT_RULE = 1;
const ALLOW_BASE = 1000;
const MAX_ALLOW = 20;

export async function syncPdfRedirect(enabled: boolean): Promise<void> {
  const viewer = browser.runtime.getURL('/pdf.html');
  await browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [REDIRECT_RULE],
    addRules: enabled
      ? [
          {
            id: REDIRECT_RULE,
            priority: 1,
            action: { type: 'redirect', redirect: { regexSubstitution: `${viewer}?file=\\0` } },
            condition: {
              regexFilter: '^https?://[^?#]*\\.[Pp][Dd][Ff]([?][^#]*)?$',
              resourceTypes: ['main_frame'],
            },
          },
        ]
      : [],
  });
}

function escapeRegex(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

/** Lets one tab open one PDF address without the viewer ("Open original"). */
export async function allowOriginal(url: string, tabId: number): Promise<void> {
  const existing = await browser.declarativeNetRequest.getSessionRules();
  const ids = existing.map((r) => r.id).filter((id) => id >= ALLOW_BASE);
  const stale =
    ids.length >= MAX_ALLOW ? ids.sort((a, b) => a - b).slice(0, ids.length - MAX_ALLOW + 1) : [];
  const id = Math.max(ALLOW_BASE - 1, ...ids) + 1;
  await browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: stale,
    addRules: [
      {
        id,
        priority: 2,
        action: { type: 'allow' },
        condition: {
          regexFilter: `^${escapeRegex(url)}$`,
          resourceTypes: ['main_frame'],
          tabIds: [tabId],
        },
      },
    ],
  });
}

export async function forgetTabRules(tabId: number): Promise<void> {
  const rules = await browser.declarativeNetRequest.getSessionRules();
  const ids = rules.filter((r) => r.condition.tabIds?.includes(tabId)).map((r) => r.id);
  if (ids.length) await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids });
}
