import type { Adjustments } from '@sdm/settings';

export type SaturationPreset = 'vivid' | 'balanced' | 'muted';

/** Inputs to the colour transform. Every field is a plain number so the theme hashes cheaply. */
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
  /**
   * User colour remapping: original `#rrggbb` (lower case) to the colour it should become.
   * Applied before role mapping, for every role, and used as is.
   */
  remap?: Readonly<Record<string, string>>;
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

export function themeFrom(
  adjust: Adjustments,
  preset: SaturationPreset = 'balanced',
  remap?: Readonly<Record<string, string>>,
): Theme {
  const theme: Theme = {
    ...DEFAULT_THEME,
    chroma: PRESET_CHROMA[preset] * (adjust.saturation / 100),
    brightness: adjust.brightness / 100,
    contrast: adjust.contrast / 100,
  };
  if (remap && Object.keys(remap).length > 0) theme.remap = remap;
  return theme;
}

const remapKeys = new WeakMap<object, string>();

export function themeKey(t: Theme): string {
  const base = `${t.bgL},${t.fgL},${t.borderL},${t.chroma},${t.brightness},${t.contrast}`;
  if (!t.remap) return base;
  let key = remapKeys.get(t.remap);
  if (key === undefined) {
    key = Object.entries(t.remap)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([a, b]) => `${a}>${b}`)
      .join(';');
    remapKeys.set(t.remap, key);
  }
  return `${base}|${key}`;
}
