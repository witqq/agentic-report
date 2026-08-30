import { randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  open,
  readdir,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import type { BuildReportOptions, BuildReportResult } from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import { prepareReport, validateRequestedFormat, type PreparedReport } from './prepare-report.js';

export async function buildReport(options: BuildReportOptions): Promise<BuildReportResult> {
  const requestedFormat = validateRequestedFormat(options.format);
  const share = validateShareOption(options.share);
  const prepared = await prepareReport({
    input: options.input,
    ...(requestedFormat === undefined ? {} : { format: requestedFormat }),
    ...(options.output === undefined ? {} : { output: options.output }),
    ...(options.review === undefined ? {} : { review: options.review }),
    share,
    publication: true,
  });
  const outputPath = requireOutputPath(prepared);

  if (prepared.format === 'single-file') {
    const bytes = await publishSingleFile(prepared, outputPath);
    return buildResult(prepared, outputPath, bytes);
  }

  let directoryBuild: Awaited<ReturnType<typeof prepareDirectoryOutput>>;
  try {
    directoryBuild = await prepareDirectoryOutput(outputPath);
  } catch (error) {
    if (error instanceof AgenticReportError) throw error;
    throw publicationError(outputPath, error);
  }
  try {
    await materializePreparedDirectory(prepared, directoryBuild.stagingPath);
    const workingHtmlPath = path.join(directoryBuild.stagingPath, 'index.html');
    const bytes = (await stat(workingHtmlPath)).size;
    await publishDirectoryOutput(directoryBuild, outputPath);
    return buildResult(prepared, path.join(outputPath, 'index.html'), bytes);
  } catch (error) {
    await removeStagingPath(directoryBuild.stagingPath, outputPath);
    if (error instanceof AgenticReportError) throw error;
    throw publicationError(outputPath, error);
  }
}

async function publishSingleFile(prepared: PreparedReport, outputPath: string): Promise<number> {
  const parent = path.dirname(outputPath);
  const stagingPath = path.join(
    parent,
    `.${path.basename(outputPath)}.agentic-report-${randomUUID()}.tmp`,
  );
  try {
    await mkdir(parent, { recursive: true });
    const handle = await open(stagingPath, 'wx', 0o600);
    try {
      await handle.writeFile(prepared.html, 'utf8');
    } finally {
      await handle.close();
    }
    const bytes = (await stat(stagingPath)).size;
    await rename(stagingPath, outputPath);
    return bytes;
  } catch (error) {
    await removeStagingPath(stagingPath, outputPath);
    if (error instanceof AgenticReportError) throw error;
    throw publicationError(outputPath, error);
  }
}

async function materializePreparedDirectory(
  prepared: PreparedReport,
  outputDirectory: string,
): Promise<void> {
  for (const file of prepared.resourceFiles) {
    const target = path.join(outputDirectory, ...file.relativePath.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.bytes);
  }
  await writeFile(path.join(outputDirectory, 'index.html'), prepared.html, 'utf8');
}

function buildResult(
  prepared: PreparedReport,
  outputPath: string,
  bytes: number,
): BuildReportResult {
  return {
    outputPath,
    format: prepared.format,
    bytes,
    embeddedAssets: prepared.embeddedAssets,
    externalAssets: prepared.externalAssets,
    contentHash: prepared.contentHash,
    share: prepared.share,
    neutralizedSourceLinks: prepared.neutralizedSourceLinks,
    warnings: prepared.warnings,
  };
}

function validateShareOption(value: unknown): boolean {
  if (value === undefined || value === false) return false;
  if (value === true) return true;
  throw new AgenticReportError({
    level: 'error',
    code: 'BUILD_SHARE_INVALID',
    message: 'Share-safe build selection must be a boolean.',
    remediation: 'Pass share: true or share: false.',
  });
}

function requireOutputPath(prepared: PreparedReport): string {
  if (prepared.outputPath !== undefined) return prepared.outputPath;
  throw new AgenticReportError({
    level: 'error',
    code: 'INTERNAL_OUTPUT_PATH_MISSING',
    message: 'Prepared build output path is missing.',
    remediation: 'Rebuild the package and retry with the same source.',
  });
}

async function prepareDirectoryOutput(
  outputPath: string,
): Promise<{ readonly stagingPath: string; readonly destinationExisted: boolean }> {
  let destinationExisted = false;
  try {
    const outputStat = await stat(outputPath);
    if (!outputStat.isDirectory()) {
      throw new AgenticReportError({
        level: 'error',
        code: 'OUTPUT_DIRECTORY_INVALID',
        message: `Directory output target is not a directory: ${outputPath}`,
        remediation: 'Choose a missing or empty directory path for directory output.',
      });
    }
    const existing = await readdir(outputPath);
    if (existing.length > 0) {
      throw new AgenticReportError({
        level: 'error',
        code: 'OUTPUT_DIRECTORY_NOT_EMPTY',
        message: `Directory output target is not empty: ${outputPath}`,
        remediation: 'Choose a new empty output directory to avoid destructive cleanup.',
      });
    }
    destinationExisted = true;
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const parent = path.dirname(outputPath);
  await mkdir(parent, { recursive: true });
  const stagingPath = await mkdtemp(
    path.join(parent, `.${path.basename(outputPath)}.agentic-report-`),
  );
  return { stagingPath, destinationExisted };
}

async function publishDirectoryOutput(
  build: { readonly stagingPath: string; readonly destinationExisted: boolean },
  outputPath: string,
): Promise<void> {
  if (build.destinationExisted) await rmdir(outputPath);
  try {
    await rename(build.stagingPath, outputPath);
  } catch (error) {
    if (build.destinationExisted) await mkdir(outputPath);
    throw error;
  }
}

async function removeStagingPath(stagingPath: string, outputPath: string): Promise<void> {
  try {
    await rm(stagingPath, { recursive: true, force: true });
  } catch (error) {
    throw new AgenticReportError(
      {
        level: 'error',
        code: 'OUTPUT_STAGING_CLEANUP_FAILED',
        message: `Compiler staging output could not be removed: ${stagingPath}`,
        remediation: 'Inspect and remove the reported staging path before retrying the build.',
        details: { outputPath, stagingPath },
      },
      { cause: error },
    );
  }
}

function publicationError(outputPath: string, error: unknown): AgenticReportError {
  return new AgenticReportError(
    {
      level: 'error',
      code: 'OUTPUT_PUBLICATION_FAILED',
      message: `The prepared artifact could not be published to: ${outputPath}`,
      remediation:
        'Check the destination parent and existing target, then retry; any previous output remains authoritative.',
      details: { outputPath },
    },
    { cause: error },
  );
}
