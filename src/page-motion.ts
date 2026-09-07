export const PAGE_MOTION_POLICY = {
  scrollProgress: { normalMotionOnly: true },
  sectionReveal: {
    default: false,
    normalMotionOnly: true,
    durationMs: 220,
    translationPx: 12,
  },
  stagger: { stepMs: 70, maximumItems: 12 },
  scene: { normalMotionOnly: true },
  pointer: {
    normalMotionOnly: true,
    finePointerOnly: true,
    depthPx: 10,
    tiltDegrees: 2.5,
    magneticPx: 7,
  },
  choreography: { stepMs: 60, maximumItems: 12, normalMotionOnly: true },
} as const;
