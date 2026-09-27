/**
 * Перевод цвета между sRGB-кодом `#rrggbb` и OKLCH (светлота, насыщенность, тон) по матрицам Björn
 * Ottosson. Нужен, чтобы менять светлоту цвета бренда, не трогая его тон: в OKLCH светлота и тон
 * независимы, а в sRGB или HSL затемнение жёлтого уводит его в оливковый по-разному для разных тонов.
 */

export interface Oklch {
  /** Светлота, 0 — чёрный, 1 — белый. */
  readonly l: number;
  /** Насыщенность, 0 — серый; в sRGB редко выше 0,37. */
  readonly c: number;
  /** Тон в градусах, 0–360; у серого не определён и равен 0. */
  readonly h: number;
}

/** `#rgb` или `#rrggbb` без прозрачности; остальное пакет в цвет бренда не принимает. */
export const OPAQUE_HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/iu;

export function hexToOklch(hex: string): Oklch {
  if (!OPAQUE_HEX_PATTERN.test(hex)) throw new Error(`Not an opaque hex colour: ${hex}`);
  const digits = hex.slice(1);
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
  const channel = (index: number): number =>
    toLinear(Number.parseInt(full.slice(index, index + 2), 16) / 255);
  return linearToOklch(channel(0), channel(2), channel(4));
}

/**
 * Код ближайшего цвета sRGB с той же светлотой и тоном: насыщенность, которая не помещается в sRGB,
 * уменьшается ровно до границы охвата, поэтому тон не плывёт, как при обрезке каналов.
 */
export function oklchToHex(color: Oklch): string {
  const l = Math.min(1, Math.max(0, color.l));
  let c = Math.max(0, color.c);
  if (!inGamut({ l, c, h: color.h })) {
    let low = 0;
    let high = c;
    for (let step = 0; step < 30; step += 1) {
      const middle = (low + high) / 2;
      if (inGamut({ l, c: middle, h: color.h })) low = middle;
      else high = middle;
    }
    c = low;
  }
  const [r, g, b] = oklchToLinear({ l, c, h: color.h });
  return `#${[r, g, b]
    .map((value) =>
      Math.round(fromLinear(Math.min(1, Math.max(0, value))) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Наименьшая разница тонов по кругу, в градусах. */
export function hueDistance(left: number, right: number): number {
  const difference = Math.abs(left - right) % 360;
  return difference > 180 ? 360 - difference : difference;
}

const GAMUT_EPSILON = 1e-7;

function inGamut(color: Oklch): boolean {
  return oklchToLinear(color).every(
    (value) => value >= -GAMUT_EPSILON && value <= 1 + GAMUT_EPSILON,
  );
}

function linearToOklch(r: number, g: number, b: number): Oklch {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.hypot(a, bAxis);
  const hue = chroma < 1e-6 ? 0 : ((Math.atan2(bAxis, a) * 180) / Math.PI + 360) % 360;
  return { l: lightness, c: chroma, h: hue };
}

function oklchToLinear(color: Oklch): readonly [number, number, number] {
  const radians = (color.h * Math.PI) / 180;
  const a = color.c * Math.cos(radians);
  const b = color.c * Math.sin(radians);
  const l = (color.l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (color.l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (color.l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function toLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}
