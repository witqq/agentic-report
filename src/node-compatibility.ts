import type { Diagnostic } from './contracts.js';

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u;
const MINIMUM_ENGINE_PATTERN = /^>=(\d+)\.(\d+)\.(\d+)$/u;

type VersionTuple = readonly [major: number, minor: number, patch: number];

export function getNodeCompatibilityDiagnostic(
  currentVersion: string,
  requiredEngine: string,
): Diagnostic | undefined {
  const current = parseVersion(currentVersion, VERSION_PATTERN, 'Node.js runtime version');
  const minimum = parseVersion(requiredEngine, MINIMUM_ENGINE_PATTERN, 'package Node.js engine');
  const numericComparison = compareVersions(current.version, minimum.version);
  if (numericComparison > 0 || (numericComparison === 0 && !current.isPrerelease)) return undefined;

  const minimumLabel = minimum.version.join('.');
  return {
    level: 'error',
    code: 'NODE_VERSION_UNSUPPORTED',
    message: `Node.js ${currentVersion} is unsupported; agentic-report requires Node.js ${minimumLabel} or newer.`,
    remediation: `Install Node.js ${minimumLabel} or newer, then rerun the same command.`,
    details: { currentVersion, requiredEngine },
  };
}

function parseVersion(
  value: string,
  pattern: RegExp,
  label: string,
): { readonly version: VersionTuple; readonly isPrerelease: boolean } {
  const match = value.match(pattern);
  const major = Number(match?.[1]);
  const minor = Number(match?.[2]);
  const patch = Number(match?.[3]);
  if (
    match === null ||
    !Number.isSafeInteger(major) ||
    !Number.isSafeInteger(minor) ||
    !Number.isSafeInteger(patch)
  ) {
    throw new Error(`${label} has an unsupported format: ${value}`);
  }
  return { version: [major, minor, patch], isPrerelease: match[4] !== undefined };
}

function compareVersions(left: VersionTuple, right: VersionTuple): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
