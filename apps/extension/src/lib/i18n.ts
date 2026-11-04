/** Thin wrapper over the extension i18n API. Falls back to the key so missing strings are visible. */
export function t(key: string, substitutions?: string | string[]): string {
  return browser.i18n.getMessage(key as never, substitutions) || key;
}

/** Sets `lang` and `dir` on the document from the browser UI locale (RTL for ar, he, fa, ur). */
export function applyDocumentLocale(): void {
  document.documentElement.lang = browser.i18n.getUILanguage();
  document.documentElement.dir = t('@@bidi_dir') === 'rtl' ? 'rtl' : 'ltr';
}
