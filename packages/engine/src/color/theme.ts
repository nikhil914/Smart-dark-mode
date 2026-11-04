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

export function themeFrom(adjust: Adjustments, preset: SaturationPreset = 'balanced'): Theme {
  return {
    ...DEFAULT_THEME,
    chroma: PRESET_CHROMA[preset] * (adjust.saturation / 100),
    brightness: adjust.brightness / 100,
    contrast: adjust.contrast / 100,
  };
}

export function themeKey(t: Theme): string {
  return `${t.bgL},${t.fgL},${t.borderL},${t.chroma},${t.brightness},${t.contrast}`;
}
