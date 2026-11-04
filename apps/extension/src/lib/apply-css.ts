import type { Adjustments, Mode } from '@sdm/settings';

/**
 * P1 placeholder renderer. Dark mode uses a whole-page inversion filter until the
 * dynamic engine lands in P2 (F7 forbids a full-page filter in the final Dark mode).
 * Filtered mode is the real implementation: it only adjusts, never recolours.
 */

const MEDIA =
  'img, video, picture, canvas, iframe, embed, object, svg image, [style*="background-image"]';

function filterChain(a: Adjustments, extra = ''): string {
  const parts = [
    extra,
    a.brightness !== 100 ? `brightness(${a.brightness / 100})` : '',
    a.contrast !== 100 ? `contrast(${a.contrast / 100})` : '',
    a.saturation !== 100 ? `saturate(${a.saturation / 100})` : '',
    a.warmth > 0 ? `sepia(${(a.warmth / 100) * 0.6})` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : 'none';
}

function dimOverlay(a: Adjustments): string {
  if (a.dim <= 0) return '';
  return `html::after {
  content: "" !important; position: fixed !important; inset: 0 !important;
  background: rgb(0 0 0 / ${a.dim / 100}) !important;
  pointer-events: none !important; z-index: 2147483647 !important;
}`;
}

export function buildCss(mode: Mode, a: Adjustments): string {
  if (mode === 'normal') return '';
  if (mode === 'filtered') {
    return `html { filter: ${filterChain(a)} !important; }\n${dimOverlay(a)}`;
  }
  return `html {
  color-scheme: dark !important;
  background: #fff !important;
  filter: ${filterChain(a, 'invert(0.92) hue-rotate(180deg)')} !important;
}
${MEDIA} { filter: invert(1) hue-rotate(180deg) !important; }
${dimOverlay(a)}`;
}
