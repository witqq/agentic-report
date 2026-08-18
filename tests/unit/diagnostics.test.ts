import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/contracts.js';
import { AgenticReportError, exitCodeForDiagnostic, toDiagnostic } from '../../src/diagnostics.js';

const validationDiagnostic: Diagnostic = {
  level: 'error',
  code: 'INVALID_MANIFEST',
  message: 'Invalid metadata.',
  remediation: 'Use the schema.',
};

describe('diagnostic transport', () => {
  it('preserves expected diagnostic state through a defensive transport value', () => {
    const transported = toDiagnostic(new AgenticReportError(validationDiagnostic));
    expect(transported).toStrictEqual(validationDiagnostic);
    expect(transported).not.toBe(validationDiagnostic);
  });

  it('redacts credentials from every expected diagnostic transport field', () => {
    const original: Diagnostic = {
      level: 'warning',
      code: 'ASSET_READ_FAILED',
      message:
        'Could not read https://alice:secret@local.test/file?X-Amz-Credential=alpha&X-Amz-Signature=beta&X-Amz-Security-Token=gamma&view=full',
      remediation: 'Retry with password=hunter2 after checking the local file.',
      source: { file: '/tmp/token=source-secret/report.md', line: 2, column: 4 },
      details: {
        authorization: 'Bearer private',
        nested: { url: 'https://local.test/data?api_key=delta&sig=epsilon', safe: 'visible' },
      },
    };

    expect(toDiagnostic(new AgenticReportError(original))).toStrictEqual({
      level: 'warning',
      code: 'ASSET_READ_FAILED',
      message:
        'Could not read https://local.test/file?X-Amz-Credential=[REDACTED]&X-Amz-Signature=[REDACTED]&X-Amz-Security-Token=[REDACTED]&view=full',
      remediation: 'Retry with password=[REDACTED] after checking the local file.',
      source: { file: '/tmp/token=[REDACTED]/report.md', line: 2, column: 4 },
      details: {
        authorization: '[REDACTED]',
        nested: {
          url: 'https://local.test/data?api_key=[REDACTED]&sig=[REDACTED]',
          safe: 'visible',
        },
      },
    });
    expect(original.details).toStrictEqual({
      authorization: 'Bearer private',
      nested: { url: 'https://local.test/data?api_key=delta&sig=epsilon', safe: 'visible' },
    });
  });

  it('redacts unexpected failures behind the internal diagnostic contract', () => {
    expect(toDiagnostic(new Error('filesystem failed'))).toMatchObject({
      level: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Unexpected internal failure.',
    });
  });

  it('distinguishes validation, package build, and internal exit codes', () => {
    expect(exitCodeForDiagnostic(validationDiagnostic)).toBe(1);
    expect(
      exitCodeForDiagnostic({
        ...validationDiagnostic,
        code: 'PACKAGE_ASSET_MISSING',
      }),
    ).toBe(2);
    expect(
      exitCodeForDiagnostic({
        ...validationDiagnostic,
        code: 'INTERNAL_ERROR',
      }),
    ).toBe(3);
  });
});
