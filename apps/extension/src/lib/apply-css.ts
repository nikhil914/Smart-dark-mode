import type { Adjustments } from '@sdm/settings';

/** Filtered mode: original colours, only brightness, contrast, saturation, warmth and dim. */
export function filteredCss(a: Adjustments): string {
  const parts = [
    a.brightness !== 100 ? `brightness(${a.brightness / 100})` : '',
    a.contrast !== 100 ? `contrast(${a.contrast / 100})` : '',
    a.saturation !== 100 ? `saturate(${a.saturation / 100})` : '',
    a.warmth > 0 ? `sepia(${(a.warmth / 100) * 0.6})` : '',
  ].filter(Boolean);
  const filter = parts.length ? `html { filter: ${parts.join(' ')} !important; }\n` : '';
  return filter + overlayCss({ ...a, warmth: 0 });
}

/**
 * Warmth and dim for Dark mode, as a fixed overlay rather than a page-wide filter,
 * which would force expensive compositing of the whole page (F7).
 */
export function overlayCss(a: Pick<Adjustments, 'warmth' | 'dim'>): string {
  const layers: string[] = [];
  if (a.warmth > 0) layers.push(`rgb(255 147 41 / ${(a.warmth / 100) * 0.35})`);
  if (a.dim > 0) layers.push(`rgb(0 0 0 / ${a.dim / 100})`);
  if (!layers.length) return '';
  const bg = layers.map((c) => `linear-gradient(${c}, ${c})`).join(', ');
  return `html::after {
  content: "" !important; position: fixed !important; inset: 0 !important;
  background: ${bg} !important; mix-blend-mode: multiply !important;
  pointer-events: none !important; z-index: 2147483647 !important;
}`;
}
