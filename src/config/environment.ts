export interface RuntimeEnvironment {
  readonly ci: boolean;
  readonly noColor: boolean;
}

export function getRuntimeEnvironment(): RuntimeEnvironment {
  return {
    ci: process.env.CI === 'true',
    noColor: process.env.NO_COLOR !== undefined || !process.stderr.isTTY,
  };
}
