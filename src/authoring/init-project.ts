import type { Dirent, Stats } from 'node:fs';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { InitProjectOptions, InitProjectResult } from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import { authoringRegistry, type ExampleDefinition } from './registry.js';
import { isRegistryIdentity } from './registry-identity.js';
import { packageStarterError, resolveConfinedStarterRoot } from './starter-path.js';

interface PreparedFile {
  readonly relativePath: string;
  readonly bytes: Buffer;
}

export async function initProject(options: InitProjectOptions): Promise<InitProjectResult> {
  const parsed = validateInitOptions(options);
  const starter = selectStarter(parsed.starter);
  const requestedPath = path.resolve(parsed.destination);
  await requireAbsentDestination(requestedPath);
  // The parent may be a symbolic link — on macOS `/tmp` is one — and the destination is then created
  // through it. Resolving the parent first means every later step, and the result the caller reads,
  // names where the files actually are.
  const projectPath = await resolveDestinationThroughParent(requestedPath);
  await requireAbsentDestination(projectPath);

  const starterRoot = await resolveConfinedStarterRoot(resolvePackageExamplesRoot(), starter.path);
  const preparedFiles = await readStarterTree(starterRoot);
  const files = preparedFiles.map((file) => file.relativePath);
  if (!files.includes(starter.entry)) {
    throw packageStarterError(
      `Packaged starter ${starter.id} does not contain its registry entry.`,
    );
  }

  await requireValidParent(path.dirname(projectPath));
  await createProject(projectPath, preparedFiles);
  return {
    starterId: starter.id,
    starterTitle: starter.title,
    projectPath,
    entryPath: path.join(projectPath, ...starter.entry.split('/')),
    files,
  };
}

function validateInitOptions(options: InitProjectOptions): InitProjectOptions {
  const value: unknown = options;
  if (!isRecord(value)) throw invalidOptionsError();
  try {
    const keys = Reflect.ownKeys(value);
    if (
      !Object.hasOwn(value, 'destination') ||
      keys.some((key) => key !== 'destination' && key !== 'starter')
    ) {
      throw invalidOptionsError();
    }
    const destinationDescriptor = Object.getOwnPropertyDescriptor(value, 'destination');
    const starterDescriptor = Object.getOwnPropertyDescriptor(value, 'starter');
    if (
      destinationDescriptor === undefined ||
      !('value' in destinationDescriptor) ||
      (starterDescriptor !== undefined && !('value' in starterDescriptor))
    ) {
      throw invalidOptionsError();
    }
    const destination: unknown = destinationDescriptor.value;
    const starter: unknown = starterDescriptor?.value;
    if (
      typeof destination !== 'string' ||
      destination.trim().length === 0 ||
      destination.includes('\0') ||
      (starter !== undefined && (typeof starter !== 'string' || !isRegistryIdentity(starter)))
    ) {
      throw invalidOptionsError();
    }
    return starter === undefined ? { destination } : { destination, starter };
  } catch (error) {
    if (error instanceof AgenticReportError) throw error;
    throw invalidOptionsError();
  }
}

function invalidOptionsError(): AgenticReportError {
  return new AgenticReportError({
    level: 'error',
    code: 'INIT_OPTIONS_INVALID',
    message: 'Initialization options must contain a destination and an optional safe starter ID.',
    remediation: 'Pass { destination: string, starter?: string } using a listed starter ID.',
    details: { supportedStarters: starterIds() },
  });
}

function selectStarter(requested: string | undefined): ExampleDefinition {
  const examples: readonly ExampleDefinition[] = authoringRegistry.examples;
  const starter =
    requested === undefined
      ? examples.find((example) => 'starter' in example && example.starter.default === true)
      : examples.find(
          (example) =>
            'starter' in example &&
            (example.id === requested || example.starter.aliases?.includes(requested) === true),
        );
  if (starter !== undefined) return starter;
  throw new AgenticReportError({
    level: 'error',
    code: 'STARTER_UNKNOWN',
    message: 'The requested starter is not packaged by this version of agentic-report.',
    remediation: 'Use a starter ID returned by listExamples().',
    details: { supportedStarters: starterIds() },
  });
}

function starterIds(): string[] {
  const examples: readonly ExampleDefinition[] = authoringRegistry.examples;
  return examples.flatMap((example) =>
    'starter' in example ? [example.id, ...(example.starter.aliases ?? [])] : [],
  );
}

function resolvePackageExamplesRoot(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  return path.basename(path.dirname(moduleDirectory)) === 'node'
    ? path.resolve(moduleDirectory, '../../../examples')
    : path.resolve(moduleDirectory, '../../examples');
}

async function requireAbsentDestination(destination: string): Promise<void> {
  try {
    await lstat(destination);
    throw destinationExistsError();
  } catch (error) {
    if (isFileSystemError(error, 'ENOENT') || isFileSystemError(error, 'ENOTDIR')) return;
    if (error instanceof AgenticReportError) throw error;
    throw new AgenticReportError(
      {
        level: 'error',
        code: 'INIT_DESTINATION_INVALID',
        message: 'Initialization destination could not be inspected safely.',
        remediation: 'Choose a writable absent destination path and retry.',
      },
      { cause: error },
    );
  }
}

function destinationExistsError(): AgenticReportError {
  return new AgenticReportError({
    level: 'error',
    code: 'INIT_DESTINATION_EXISTS',
    message: 'Initialization destination already exists.',
    remediation: 'Choose a new absent destination path. Existing directories are never reused.',
  });
}

/**
 * The destination as it exists on disk: the parent resolved through any symbolic links, with the
 * requested name below it. A link in the parent is not the danger the rule was written against —
 * writing into an existing directory is, and the absent-destination refusal is what prevents that.
 */
async function resolveDestinationThroughParent(destination: string): Promise<string> {
  const parent = path.dirname(destination);
  try {
    return path.join(await realpath(parent), path.basename(destination));
  } catch (error) {
    if (isFileSystemError(error, 'ENOENT')) throw parentMissingError(error);
    throw parentInvalidError(error);
  }
}

async function requireValidParent(parent: string): Promise<void> {
  try {
    const parentStat = await lstat(parent);
    if (!parentStat.isDirectory()) {
      throw parentNotDirectoryError();
    }
  } catch (error) {
    if (error instanceof AgenticReportError) throw error;
    if (isFileSystemError(error, 'ENOENT')) throw parentMissingError(error);
    throw parentInvalidError(error);
  }
}

/**
 * The three refusals below share a code and differ in message, because an author who reads only the
 * message must learn which check failed: a missing parent, a parent that is not a directory, and a
 * parent that cannot be inspected call for different actions.
 */
function parentMissingError(cause?: unknown): AgenticReportError {
  return new AgenticReportError(
    {
      level: 'error',
      code: 'INIT_PARENT_INVALID',
      message: 'Initialization destination parent does not exist.',
      remediation: 'Create the parent directory, then retry with the same destination.',
    },
    cause === undefined ? undefined : { cause },
  );
}

function parentNotDirectoryError(): AgenticReportError {
  return new AgenticReportError({
    level: 'error',
    code: 'INIT_PARENT_INVALID',
    message: 'Initialization destination parent is not a directory.',
    remediation: 'Choose a destination whose parent is a directory, then retry.',
  });
}

function parentInvalidError(cause?: unknown): AgenticReportError {
  return new AgenticReportError(
    {
      level: 'error',
      code: 'INIT_PARENT_INVALID',
      message: 'Initialization destination parent could not be inspected.',
      remediation: 'Choose a parent directory this process can read, then retry.',
    },
    cause === undefined ? undefined : { cause },
  );
}

async function readStarterTree(root: string): Promise<PreparedFile[]> {
  const files: PreparedFile[] = [];
  await readStarterDirectory(root, '', files);
  return files;
}

async function readStarterDirectory(
  directory: string,
  relativeDirectory: string,
  files: PreparedFile[],
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw starterReadError(error);
  }
  entries.sort((left, right) => compareNames(left.name, right.name));
  for (const entry of entries) {
    const relativePath =
      relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`;
    const sourcePath = path.join(directory, entry.name);
    let entryStat: Stats;
    try {
      entryStat = await lstat(sourcePath);
    } catch (error) {
      throw starterReadError(error);
    }
    if (entryStat.isSymbolicLink()) {
      throw packageStarterError('Packaged starter contains an unsupported symbolic link.');
    }
    if (entryStat.isDirectory()) {
      await readStarterDirectory(sourcePath, relativePath, files);
      continue;
    }
    if (!entryStat.isFile()) {
      throw packageStarterError('Packaged starter contains an unsupported file type.');
    }
    try {
      files.push({ relativePath, bytes: await readFile(sourcePath) });
    } catch (error) {
      throw starterReadError(error);
    }
  }
}

function starterReadError(error: unknown): AgenticReportError {
  return new AgenticReportError(
    {
      level: 'error',
      code: 'STARTER_READ_FAILED',
      message: 'The packaged starter could not be read before project creation.',
      remediation: 'Reinstall agentic-report and retry initialization.',
    },
    { cause: error },
  );
}

async function createProject(destination: string, files: readonly PreparedFile[]): Promise<void> {
  try {
    await mkdir(destination);
  } catch (error) {
    if (isDestinationConflict(error)) throw destinationExistsError();
    throw publicationError(error);
  }

  try {
    for (const file of files) {
      const target = path.join(destination, ...file.relativePath.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.bytes, { flag: 'wx' });
    }
  } catch (error) {
    if (isDestinationConflict(error)) {
      throw new AgenticReportError(
        {
          level: 'error',
          code: 'INIT_DESTINATION_CONFLICT',
          message: 'A path appeared while the new project was being created.',
          remediation:
            'Inspect the incomplete destination, preserve external files, then remove it explicitly before retrying at a new path.',
        },
        { cause: error },
      );
    }
    throw publicationError(error);
  }
}

function publicationError(error: unknown): AgenticReportError {
  return new AgenticReportError(
    {
      level: 'error',
      code: 'INIT_PUBLICATION_FAILED',
      message: 'The new project could not be written completely.',
      remediation:
        'Inspect the destination state. If an incomplete directory exists, remove it explicitly before retrying at a new path.',
    },
    { cause: error },
  );
}

function isDestinationConflict(error: unknown): boolean {
  return ['EEXIST', 'ENOTEMPTY', 'EISDIR'].some((code) => isFileSystemError(error, code));
}

function isFileSystemError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function compareNames(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
