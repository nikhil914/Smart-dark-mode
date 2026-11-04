import type { SiteFix } from './format';

/**
 * Converts Dark Reader's `dynamic-theme-fixes.config` text (MIT, darkreader/darkreader)
 * into site fixes. Blocks are separated by a line of `=` signs; each block starts with
 * URL lines, then directives (`INVERT`, `CSS`, `IGNORE INLINE STYLE`,
 * `IGNORE IMAGE ANALYSIS`) each followed by their values.
 */
const DIRECTIVES = new Map<string, keyof SiteFix>([
  ['INVERT', 'invert'],
  ['CSS', 'css'],
  ['IGNORE INLINE STYLE', 'ignoreInlineStyle'],
  ['IGNORE IMAGE ANALYSIS', 'ignoreImageAnalysis'],
]);

export function parseDarkReaderFixes(text: string): SiteFix[] {
  const fixes: SiteFix[] = [];
  for (const block of text.split(/^={3,}\s*$/m)) {
    const lines = block.split(/\r?\n/);
    const url: string[] = [];
    let i = 0;
    while (i < lines.length && !lines[i]!.trim()) i++;
    for (; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (!line || DIRECTIVES.has(line) || /^[A-Z][A-Z ]+$/.test(line)) break;
      url.push(line);
    }
    if (!url.length) continue;
    const fix: SiteFix = { url };
    let current: keyof SiteFix | null = null;
    let skipping = false;
    const values: string[] = [];
    const flush = () => {
      if (!current || skipping) return;
      if (current === 'css') {
        const css = values.join('\n').trim();
        if (css) fix.css = css;
      } else if (current !== 'url') {
        const list = values.map((v) => v.trim()).filter(Boolean);
        if (list.length) fix[current] = list;
      }
    };
    for (; i < lines.length; i++) {
      const raw = lines[i]!;
      const line = raw.trim();
      if (/^[A-Z][A-Z ]+$/.test(line) && (DIRECTIVES.has(line) || line.length > 3)) {
        flush();
        values.length = 0;
        current = DIRECTIVES.get(line) ?? null;
        // Directives we do not support (e.g. IGNORE IMAGE ANALYSIS variants added later) are skipped.
        skipping = current === null;
        continue;
      }
      values.push(current === 'css' ? raw : line);
    }
    flush();
    if (fix.css || fix.invert || fix.ignoreInlineStyle || fix.ignoreImageAnalysis) fixes.push(fix);
  }
  return fixes;
}

/**
 * Dark Reader fixes use `var(--darkreader-neutral-background)` and similar. Our engine
 * names these differently; this maps them to colours from the current theme.
 */
export function darkReaderVariablesCss(
  background: string,
  text: string,
  selection: string,
): string {
  return `:root {
  --darkreader-neutral-background: ${background};
  --darkreader-neutral-text: ${text};
  --darkreader-selection-background: ${selection};
  --darkreader-selection-text: ${text};
}`;
}
