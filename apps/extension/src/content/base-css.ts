import { type Theme, formatColor, modifyColor, parseColor } from '@sdm/engine';

/** Inline-style properties we mirror into custom properties on the element. */
export const INLINE_PROPS = [
  'background-color',
  'background-image',
  'background',
  'color',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'box-shadow',
  'fill',
  'stroke',
  'stop-color',
] as const;

export function inlineVar(prop: string): string {
  return `--sdm-inline-${prop}`;
}

export function inlineAttr(prop: string): string {
  return `data-sdm-inline-${prop}`;
}

function c(value: string, role: Parameters<typeof modifyColor>[1], theme: Theme): string {
  return formatColor(modifyColor(parseColor(value)!, role, theme));
}

/** Page-wide defaults, injected before the page's own sheets so converted page rules win. */
export function baseCss(theme: Theme): string {
  const u = theme.custom;
  const bg = u?.background ?? c('#ffffff', 'background', theme);
  const fg = u?.text ?? c('#000000', 'text', theme);
  const link = u?.link ?? c('#0000ee', 'text', theme);
  const visited = u?.visited ?? c('#551a8b', 'text', theme);
  const border = u?.border ?? c('#cccccc', 'border', theme);
  const field = u?.button ?? c('#f8f8f8', 'background', theme);
  const scrollbar = u?.scrollbar ?? border;
  const selection = u?.selection ?? c('#b4d5fe', 'background', theme);
  return `
:root { color-scheme: dark !important; }
html { background-color: ${bg}; color: ${fg}; }
html, body { scrollbar-color: ${scrollbar} ${bg}; }
a:link { color: ${link}; }
a:visited { color: ${visited}; }
input, textarea, select, button { background-color: ${field}; color: ${fg}; border-color: ${border}; }
::placeholder { color: ${c('#757575', 'text', theme)}; opacity: 0.7; }
::selection { background-color: ${selection}; color: ${fg}; }
:focus-visible { outline-color: ${link}; }
`;
}

export interface ImageOptions {
  hoverOriginal: boolean;
  /** 0–40 percent. */
  photoDim: number;
}

/** Rules that apply converted inline styles and image decisions. Must win over inline styles. */
export function overrideCss(images: ImageOptions = { hoverOriginal: false, photoDim: 0 }): string {
  const inline = INLINE_PROPS.map(
    (p) => `[${inlineAttr(p)}] { ${p}: var(${inlineVar(p)}) !important; }`,
  ).join('\n');
  const dim =
    images.photoDim > 0
      ? `img[data-sdm-img="photo"] { filter: brightness(${(100 - images.photoDim) / 100}) !important; }\n`
      : '';
  // Hover (or press, on touch screens) shows the image as the site made it. Hover is
  // limited to real pointers: on touch screens it would stick after a tap.
  const hover = images.hoverOriginal
    ? `@media (hover: hover) { img[data-sdm-img]:hover, svg[data-sdm-img]:hover { filter: none !important; } }\nimg[data-sdm-img]:active, svg[data-sdm-img]:active { filter: none !important; }\n`
    : '';
  return `${inline}
img[data-sdm-img="invert"], svg[data-sdm-img="invert"] { filter: invert(0.88) hue-rotate(180deg) !important; }
${dim}${hover}`;
}

/** Shown until the dynamic theme is ready; also mirrored as a registered stylesheet. */
export const FALLBACK_BG = '#1b1c1e';
