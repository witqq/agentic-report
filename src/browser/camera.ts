/** Кадр камеры пролёта: `x y ширина высота` в координатах схемы. */
export type CameraBox = readonly [number, number, number, number];

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Плавный разгон и торможение камеры. */
export function easeInOut(value: number): number {
  return value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2;
}

/**
 * Кадр камеры в момент `share` пролёта: ширина кадра меняется по экспоненте — так приближение идёт с
 * постоянной скоростью, — а угол кадра движется так, что цель остаётся на месте экрана.
 */
export function cameraAt(from: CameraBox, to: CameraBox, share: number): CameraBox {
  const eased = easeInOut(clamp(share));
  const width = from[2] * (to[2] / from[2]) ** eased;
  const travelled = from[2] === to[2] ? eased : (from[2] - width) / (from[2] - to[2]);
  return [
    from[0] + (to[0] - from[0]) * travelled,
    from[1] + (to[1] - from[1]) * travelled,
    width,
    width * (from[3] / from[2]),
  ];
}
