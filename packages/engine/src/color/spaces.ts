/** Colour space conversions. All sRGB channels are 0..1, gamma encoded unless named `lin`. */

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface OKLCH {
  l: number;
  c: number;
  h: number;
  a: number;
}

type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];

function mul(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function toLinear(c: number): number {
  const s = Math.abs(c);
  const v = s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  return Math.sign(c) * v;
}

export function fromLinear(c: number): number {
  const s = Math.abs(c);
  const v = s <= 0.0031308 ? s * 12.92 : 1.055 * s ** (1 / 2.4) - 0.055;
  return Math.sign(c) * v;
}

const LMS_FROM_LINEAR_SRGB: Mat3 = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];
const OKLAB_FROM_LMS: Mat3 = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];
const LMS_FROM_OKLAB: Mat3 = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.0894841775, -1.291485548],
];
const LINEAR_SRGB_FROM_LMS: Mat3 = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
];

export function linearSrgbToOklab(v: Vec3): Vec3 {
  const lms = mul(LMS_FROM_LINEAR_SRGB, v).map(Math.cbrt) as Vec3;
  return mul(OKLAB_FROM_LMS, lms);
}

export function oklabToLinearSrgb(v: Vec3): Vec3 {
  const lms = mul(LMS_FROM_OKLAB, v).map((x) => x * x * x) as Vec3;
  return mul(LINEAR_SRGB_FROM_LMS, lms);
}

export function rgbToOklch(c: RGBA): OKLCH {
  const [l, a, b] = linearSrgbToOklab([toLinear(c.r), toLinear(c.g), toLinear(c.b)]);
  const chroma = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l, c: chroma, h: chroma < 1e-4 ? 0 : h, a: c.a };
}

function oklchToLinear(c: OKLCH): Vec3 {
  const hr = (c.h * Math.PI) / 180;
  return oklabToLinearSrgb([c.l, c.c * Math.cos(hr), c.c * Math.sin(hr)]);
}

function inGamut(v: Vec3): boolean {
  const e = 1e-4;
  return v.every((x) => x >= -e && x <= 1 + e);
}

/** OKLCH to sRGB, reducing chroma (keeping L and h) until the colour fits the sRGB gamut. */
export function oklchToRgb(c: OKLCH): RGBA {
  const l = Math.min(1, Math.max(0, c.l));
  let lin = oklchToLinear({ ...c, l });
  if (!inGamut(lin)) {
    let lo = 0;
    let hi = c.c;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear({ l, c: mid, h: c.h, a: c.a }))) lo = mid;
      else hi = mid;
    }
    lin = oklchToLinear({ l, c: lo, h: c.h, a: c.a });
  }
  const clamp = (x: number) => Math.min(1, Math.max(0, fromLinear(x)));
  return { r: clamp(lin[0]), g: clamp(lin[1]), b: clamp(lin[2]), a: c.a };
}

// CIE Lab (D50) to XYZ D50, then Bradford to D65, then linear sRGB.
const D50: Vec3 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];
const XYZ_D65_FROM_D50: Mat3 = [
  [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
  [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
  [0.012314014864481998, -0.020507649298898964, 1.330365926242124],
];
const LINEAR_SRGB_FROM_XYZ_D65: Mat3 = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];
const XYZ_D65_FROM_LINEAR_P3: Mat3 = [
  [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
  [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
  [0, 0.04511338185890264, 1.043944368900976],
];

export function labToLinearSrgb(L: number, a: number, b: number): Vec3 {
  const k = 24389 / 27;
  const e = 216 / 24389;
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const xyz: Vec3 = [
    (fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k) * D50[0],
    (L > k * e ? ((L + 16) / 116) ** 3 : L / k) * D50[1],
    (fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k) * D50[2],
  ];
  return mul(LINEAR_SRGB_FROM_XYZ_D65, mul(XYZ_D65_FROM_D50, xyz));
}

export function linearP3ToLinearSrgb(v: Vec3): Vec3 {
  return mul(LINEAR_SRGB_FROM_XYZ_D65, mul(XYZ_D65_FROM_LINEAR_P3, v));
}

export function linearToRgba(v: Vec3, a: number): RGBA {
  const clamp = (x: number) => Math.min(1, Math.max(0, fromLinear(x)));
  return { r: clamp(v[0]), g: clamp(v[1]), b: clamp(v[2]), a };
}
