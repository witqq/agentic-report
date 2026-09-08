export const PAGE_MOTION_POLICY = {
  scrollProgress: { normalMotionOnly: true },
  sectionReveal: {
    default: false,
    normalMotionOnly: true,
    durationMs: 420,
    translationPx: 24,
  },
  stagger: { stepMs: 90, maximumItems: 12 },
  scene: { normalMotionOnly: true },
  pointer: {
    normalMotionOnly: true,
    finePointerOnly: true,
    depthPx: 24,
    tiltDegrees: 4.5,
    magneticPx: 9,
  },
  choreography: { stepMs: 75, maximumItems: 12, normalMotionOnly: true },
} as const;
