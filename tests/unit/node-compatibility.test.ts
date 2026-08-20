import { describe, expect, it } from 'vitest';

import { getNodeCompatibilityDiagnostic } from '../../src/node-compatibility.js';

describe('Node.js release compatibility', () => {
  it('accepts the declared floor and newer major releases without a warning', () => {
    expect(getNodeCompatibilityDiagnostic('24.18.0', '>=24.18.0')).toBeUndefined();
    expect(getNodeCompatibilityDiagnostic('24.18.0+build.1', '>=24.18.0')).toBeUndefined();
    expect(getNodeCompatibilityDiagnostic('24.18.1', '>=24.18.0')).toBeUndefined();
    expect(getNodeCompatibilityDiagnostic('25.0.0', '>=24.18.0')).toBeUndefined();
  });

  it('returns an actionable diagnostic before commands run below the declared floor', () => {
    expect(getNodeCompatibilityDiagnostic('22.18.0', '>=24.18.0')).toEqual({
      level: 'error',
      code: 'NODE_VERSION_UNSUPPORTED',
      message: 'Node.js 22.18.0 is unsupported; agentic-report requires Node.js 24.18.0 or newer.',
      remediation: 'Install Node.js 24.18.0 or newer, then rerun the same command.',
      details: { currentVersion: '22.18.0', requiredEngine: '>=24.18.0' },
    });
  });

  it('rejects a prerelease at the otherwise equal stable floor', () => {
    expect(getNodeCompatibilityDiagnostic('24.18.0-rc.1', '>=24.18.0')?.code).toBe(
      'NODE_VERSION_UNSUPPORTED',
    );
  });

  it('rejects an engine shape the runtime gate cannot interpret', () => {
    expect(() => getNodeCompatibilityDiagnostic('24.18.0', '^24.18.0')).toThrow(
      /package Node\.js engine has an unsupported format/u,
    );
  });
});
