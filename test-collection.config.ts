import { readdir } from 'node:fs/promises';
import path from 'node:path';

export const canonicalUnitDirectory = 'tests/unit';

const testKinds = ['test', 'spec'] as const;
const testModuleExtensions = [
  'js',
  'jsx',
  'ts',
  'tsx',
  'cjs',
  'cjsx',
  'cts',
  'ctsx',
  'mjs',
  'mjsx',
  'mts',
  'mtsx',
] as const;

const recursivelyExcludedDirectories = [
  '.git',
  '.pnpm-store',
  'agent_temp_files_local',
  'coverage',
  'dist',
  'moira-ws',
  'node_modules',
  'playwright-report',
  'site',
  'test-results',
] as const;
const recursivelyExcludedDirectoryNames: ReadonlySet<string> = new Set(
  recursivelyExcludedDirectories,
);

const supportedTestSuffixes = new Set(
  testKinds.flatMap((kind) => testModuleExtensions.map((extension) => `.${kind}.${extension}`)),
);

export const canonicalUnitIncludes = testKinds.flatMap((kind) =>
  testModuleExtensions.map((extension) => `${canonicalUnitDirectory}/**/*.${kind}.${extension}`),
);

export const testCollectionExcludes = recursivelyExcludedDirectories.map(
  (directory) => `**/${directory}/**`,
);

export async function auditCanonicalUnitResults(
  reportedFiles: readonly string[],
  projectRoot = process.cwd(),
): Promise<string | undefined> {
  const canonicalRoot = path.resolve(projectRoot, canonicalUnitDirectory);
  const expectedFiles = await collectTestFiles(canonicalRoot);
  const reported = new Set(reportedFiles.map((file) => path.resolve(projectRoot, file)));
  const expected = new Set(expectedFiles);

  const unexpected = [...reported].filter((file) => !expected.has(file)).sort();
  const missing = [...expected].filter((file) => !reported.has(file)).sort();
  if (unexpected.length === 0 && missing.length === 0) return undefined;

  const details = [
    unexpected.length > 0 ? `unexpected: ${unexpected.join(', ')}` : undefined,
    missing.length > 0 ? `missing: ${missing.join(', ')}` : undefined,
  ].filter((detail): detail is string => detail !== undefined);
  return `Unit suite inventory differs from ${canonicalUnitDirectory} (${details.join('; ')}).`;
}

async function collectTestFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!recursivelyExcludedDirectoryNames.has(entry.name)) {
        files.push(...(await collectTestFiles(absolutePath)));
      }
      continue;
    }
    if (entry.isFile() && hasSupportedTestSuffix(entry.name)) files.push(absolutePath);
  }
  return files.sort();
}

function hasSupportedTestSuffix(fileName: string): boolean {
  for (const suffix of supportedTestSuffixes) {
    if (fileName.endsWith(suffix)) return true;
  }
  return false;
}
