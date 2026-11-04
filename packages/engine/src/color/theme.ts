import type { Adjustments, CustomThemeColors, SaturationPreset, ThemeId } from '@sdm/settings';
import { parseColor } from './parse';
import { rgbToOklch } from './spaces';

export type { SaturationPreset } from '@sdm/settings';

/** Colour vision deficiency the palette is shifted for. */
export type Cvd = 'protan' | 'deutan' | 'tritan';

/** Inputs to the colour transform. Plain values, so the theme hashes cheaply. */
export interface Theme {
  /** OKLab lightness of the darkest page background (white maps here). */
  bgL: number;
  /** OKLab lightness of body text (black maps here). Off-white to limit halation. */
  fgL: number;
  /** Lightness of borders converted from white. */
  borderL: number;
  /** Chroma multiplier from the saturation preset and the saturation slider. */
  chroma: number;
  /** Brightness multiplier on all output lightness, 0.5..1.5. */
  brightness: number;
  /** Contrast multiplier around the mid point, 0.5..1.5. */
  contrast: number;
  /** Minimum text/background contrast enforced where both are known (WCAG ratio). */
  minContrast?: number;
  /** Hue and chroma given to neutral (grey) colours, e.g. for sepia. */
  tint?: { h: number; bgC: number; fgC: number };
  /** Shifts hues that the given colour vision deficiency confuses. */
  cvd?: Cvd;
  /**
   * User colour remapping: original `#rrggbb` (lower case) to the colour it should become.
   * Applied before role mapping, for every role, and used as is.
   */
  remap?: Readonly<Record<string, string>>;
  /** Page-wide colours of a user theme (links, selection, scrollbar...). */
  custom?: Readonly<CustomThemeColors>;
}

const PRESET_CHROMA: Record<SaturationPreset, number> = { vivid: 1, balanced: 0.85, muted: 0.6 };

export const DEFAULT_THEME: Readonly<Theme> = {
  bgL: 0.2,
  fgL: 0.88,
  borderL: 0.34,
  chroma: PRESET_CHROMA.balanced,
  brightness: 1,
  contrast: 1,
};

type BuiltIn = Exclude<ThemeId, `custom:${string}`>;

/** Differences from DEFAULT_THEME for each built-in theme. */
const BUILT_IN: Record<BuiltIn, Partial<Theme>> = {
  dark: {},
  // Pure black page background for OLED screens; nested panels stay just above black.
  amoled: { bgL: 0, borderL: 0.28, fgL: 0.86 },
  dim: { bgL: 0.3, borderL: 0.42, fgL: 0.9 },
  sepia: { bgL: 0.24, fgL: 0.86, tint: { h: 70, bgC: 0.025, fgC: 0.035 } },
  contrast: { bgL: 0.08, fgL: 0.97, borderL: 0.55, minContrast: 7 },
  grayscale: { chroma: 0 },
  protan: { cvd: 'protan' },
  deutan: { cvd: 'deutan' },
  tritan: { cvd: 'tritan' },
};

export const BUILT_IN_THEMES = Object.keys(BUILT_IN) as BuiltIn[];

export interface ThemeOptions {
  preset?: SaturationPreset;
  remap?: Readonly<Record<string, string>> | undefined;
  theme?: ThemeId;
  /** Colours of the custom theme `theme` refers to. */
  custom?: CustomThemeColors | undefined;
}

/** Derives lightness and tint from a user theme's background and text colours. */
function fromCustom(colors: CustomThemeColors): Partial<Theme> {
  const bg = parseColor(colors.background);
  const fg = parseColor(colors.text);
  const border = parseColor(colors.border);
  if (!bg || !fg) return {};
  const b = rgbToOklch(bg);
  const f = rgbToOklch(fg);
  const out: Partial<Theme> = {
    bgL: b.l,
    fgL: f.l,
    borderL: border ? rgbToOklch(border).l : Math.min(1, b.l + 0.14),
    custom: colors,
  };
  if (b.c > 0.005 || f.c > 0.005) {
    out.tint = { h: b.c > 0.005 ? b.h : f.h, bgC: b.c, fgC: f.c };
  }
  return out;
}

export function themeFrom(
  adjust: Adjustments,
  presetOrOptions: SaturationPreset | ThemeOptions = 'balanced',
  remap?: Readonly<Record<string, string>>,
): Theme {
  const opts: ThemeOptions =
    typeof presetOrOptions === 'string' ? { preset: presetOrOptions, remap } : presetOrOptions;
  const id = opts.theme ?? 'dark';
  const base: Partial<Theme> = id.startsWith('custom:')
    ? opts.custom
      ? fromCustom(opts.custom)
      : {}
    : BUILT_IN[id as BuiltIn];
  const chroma = base.chroma ?? PRESET_CHROMA[opts.preset ?? 'balanced'];
  const theme: Theme = {
    ...DEFAULT_THEME,
    ...base,
    chroma: chroma * (adjust.saturation / 100),
    brightness: adjust.brightness / 100,
    contrast: adjust.contrast / 100,
  };
  if (opts.remap && Object.keys(opts.remap).length > 0) theme.remap = opts.remap;
  return theme;
}

const objectKeys = new WeakMap<object, string>();

function keyOf(value: object, make: () => string): string {
  let key = objectKeys.get(value);
  if (key === undefined) {
    key = make();
    objectKeys.set(value, key);
  }
  return key;
}

export function themeKey(t: Theme): string {
  let key = `${t.bgL},${t.fgL},${t.borderL},${t.chroma},${t.brightness},${t.contrast}`;
  if (t.minContrast) key += `|mc${t.minContrast}`;
  if (t.tint) key += `|t${t.tint.h},${t.tint.bgC},${t.tint.fgC}`;
  if (t.cvd) key += `|${t.cvd}`;
  if (t.custom) {
    const custom = t.custom;
    key += `|c${keyOf(custom, () => JSON.stringify(custom))}`;
  }
  if (t.remap) {
    const remap = t.remap;
    key += `|${keyOf(remap, () =>
      Object.entries(remap)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([a, b]) => `${a}>${b}`)
        .join(';'),
    )}`;
  }
  return key;
}
