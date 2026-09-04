import { readFile, stat } from 'node:fs/promises';

import type { InspectReviewOptions, InspectReviewResult } from '../contracts.js';
import { AgenticReportError, sanitizeTransportValue } from '../diagnostics.js';
import { bindReviewArtifact } from '../review/binding.js';
import {
  parseReviewArtifact,
  ReviewContractError,
  REVIEW_CONTRACT_VERSION,
  MAX_REVIEW_FILE_BYTES,
} from '../review/contract.js';
import { resolveLocalPath } from '../source/load-source.js';
import { prepareReport } from './prepare-report.js';

export async function inspectReview(options: InspectReviewOptions): Promise<InspectReviewResult> {
  const parsedOptions = validateOptions(options);
  const prepared = await prepareReport({ input: parsedOptions.input });
  const reviewPath = await resolveLocalPath(
    prepared.source.sourceRoot,
    parsedOptions.review,
    'REVIEW_OUTSIDE_SOURCE',
  );
  const review = await readReviewArtifact(reviewPath);
  const bound = bindReviewArtifact(review, prepared.reviewManifest);
  return sanitizeTransportValue({
    contractVersion: REVIEW_CONTRACT_VERSION,
    projectPath: prepared.source.sourceRoot,
    entryPath: prepared.source.entryPath,
    reportRevision: prepared.reviewManifest.reportRevision,
    reviewedRevision: review.report.revision,
    reportStatus: bound.reportStatus,
    threads: bound.threads,
  });
}

function validateOptions(options: InspectReviewOptions): InspectReviewOptions {
  const value: unknown = options;
  if (!isRecord(value)) throw optionsError();
  try {
    const keys = Reflect.ownKeys(value);
    if (
      !Object.hasOwn(value, 'input') ||
      !Object.hasOwn(value, 'review') ||
      keys.some((key) => key !== 'input' && key !== 'review')
    ) {
      throw optionsError();
    }
    const input = dataProperty(value, 'input');
    const review = dataProperty(value, 'review');
    if (!isPathInput(input) || !isPathInput(review)) throw optionsError();
    return { input, review };
  } catch (error) {
    if (error instanceof AgenticReportError) throw error;
    throw optionsError();
  }
}

async function readReviewArtifact(reviewPath: string) {
  try {
    const reviewStat = await stat(reviewPath);
    if (!reviewStat.isFile() || reviewStat.size > MAX_REVIEW_FILE_BYTES) {
      throw new AgenticReportError({
        level: 'error',
        code: 'REVIEW_ARTIFACT_INVALID',
        message: 'Review artifact must be an ordinary bounded JSON file.',
        remediation: `Use a review JSON file no larger than ${MAX_REVIEW_FILE_BYTES} bytes.`,
        source: { file: reviewPath },
        details: { maximumBytes: MAX_REVIEW_FILE_BYTES },
      });
    }
    const text = await readFile(reviewPath, 'utf8');
    return parseReviewArtifact(JSON.parse(text) as unknown);
  } catch (error) {
    if (error instanceof AgenticReportError) throw error;
    if (error instanceof ReviewContractError) {
      throw new AgenticReportError({
        level: 'error',
        code: error.unsupportedVersion ? 'REVIEW_VERSION_UNSUPPORTED' : 'REVIEW_ARTIFACT_INVALID',
        message: error.message,
        remediation: error.unsupportedVersion
          ? 'Export a version-3 review from the current report; legacy version 2 is also accepted.'
          : 'Regenerate the review from the bound report or fix the reported fields.',
        source: { file: reviewPath },
        details: { issues: error.issues },
      });
    }
    if (error instanceof SyntaxError) {
      throw new AgenticReportError({
        level: 'error',
        code: 'REVIEW_ARTIFACT_INVALID',
        message: 'Review artifact is not valid JSON.',
        remediation: 'Regenerate the review from the bound report or fix its JSON syntax.',
        source: { file: reviewPath },
      });
    }
    throw new AgenticReportError(
      {
        level: 'error',
        code: 'REVIEW_READ_FAILED',
        message: `Could not read review artifact: ${reviewPath}`,
        remediation: 'Use a readable review JSON file under the report source directory.',
        source: { file: reviewPath },
      },
      { cause: error },
    );
  }
}

function dataProperty(value: Readonly<Record<string, unknown>>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !('value' in descriptor)) throw optionsError();
  return descriptor.value;
}

function isPathInput(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes('\0');
}

function optionsError(): AgenticReportError {
  return new AgenticReportError({
    level: 'error',
    code: 'REVIEW_OPTIONS_INVALID',
    message: 'Review inspection options must contain input and review paths.',
    remediation: 'Pass { input: string, review: string } without additional fields.',
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
