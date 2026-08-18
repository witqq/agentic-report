import type { JsonSchema } from './schemas.js';

export const EXTENSION_PROPOSAL_CONTRACT_VERSION = 1 as const;

const evidenceKeys = [
  'sourceGrammar',
  'executionCapabilities',
  'confinement',
  'offlineBehavior',
  'deterministicSerialization',
  'cspAndRuntime',
  'accessibility',
  'byteAndPerformanceBudgets',
  'packageDependenciesAndLicenses',
  'compatibility',
] as const;

const MINIMUM_EXPLANATION_CODE_POINTS = 20;
const NORMALIZED_EXPLANATION_PATTERN = String.raw`\S[\s\S]{18,}\S`;

export type ExtensionEvidenceKey = (typeof evidenceKeys)[number];

export interface ExtensionProposal {
  readonly contractVersion: typeof EXTENSION_PROPOSAL_CONTRACT_VERSION;
  readonly id: string;
  readonly summary: string;
  readonly trustBoundary: ExtensionTrustBoundary;
  readonly evidence: Readonly<Record<ExtensionEvidenceKey, string>>;
}

export interface ExtensionTrustBoundary {
  readonly authorCode: 'forbidden';
  readonly callbacks: 'forbidden';
  readonly eval: 'forbidden';
  readonly dynamicImports: 'forbidden';
  readonly networkAccess: 'forbidden';
  readonly confinement: 'source-root';
  readonly offline: 'required';
  readonly deterministicSerialization: 'required';
  readonly cspCompatible: 'required';
  readonly packageOwnedRuntime: 'required';
}

export interface ExtensionProposalValidation {
  readonly accepted: boolean;
  readonly issues: readonly string[];
}

export function getExtensionProposalSchema(): JsonSchema {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:agentic-report:schema:extension-proposal:1',
    title: 'Agentic Report extension proposal gate',
    type: 'object',
    additionalProperties: false,
    required: ['contractVersion', 'id', 'summary', 'trustBoundary', 'evidence'],
    properties: {
      contractVersion: { const: EXTENSION_PROPOSAL_CONTRACT_VERSION },
      id: { type: 'string', pattern: '^[a-z][a-z0-9-]{2,79}$' },
      summary: {
        type: 'string',
        minLength: MINIMUM_EXPLANATION_CODE_POINTS,
        pattern: NORMALIZED_EXPLANATION_PATTERN,
      },
      trustBoundary: {
        type: 'object',
        additionalProperties: false,
        required: Object.keys(safeTrustBoundary),
        properties: Object.fromEntries(
          Object.entries(safeTrustBoundary).map(([key, value]) => [key, { const: value }]),
        ),
      },
      evidence: {
        type: 'object',
        additionalProperties: false,
        required: [...evidenceKeys],
        properties: Object.fromEntries(
          evidenceKeys.map((key) => [
            key,
            {
              type: 'string',
              minLength: MINIMUM_EXPLANATION_CODE_POINTS,
              pattern: NORMALIZED_EXPLANATION_PATTERN,
            },
          ]),
        ),
      },
    },
  };
}

export function getExtensionProposalTemplate(): ExtensionProposal {
  return {
    contractVersion: EXTENSION_PROPOSAL_CONTRACT_VERSION,
    id: 'replace-with-extension-id',
    summary: 'Explain the bounded extension and the user problem it solves.',
    trustBoundary: { ...safeTrustBoundary },
    evidence: {
      sourceGrammar: 'Describe declarative syntax, validation, repair and discovery evidence.',
      executionCapabilities: 'Prove the package-owned bounded behavior and capability disposition.',
      confinement: 'Prove canonical source-root confinement and alias or race handling.',
      offlineBehavior: 'Prove compilation and file URL reading require no network access.',
      deterministicSerialization: 'Provide repeated artifact hashes and the supported environment.',
      cspAndRuntime: 'Prove CSP compatibility and bounded package-owned runtime behavior.',
      accessibility: 'Provide semantic, keyboard, touch and assistive technology evidence.',
      byteAndPerformanceBudgets:
        'Report measured artifact, runtime, build-time and memory consequences.',
      packageDependenciesAndLicenses:
        'List package, transitive dependency and license consequences.',
      compatibility: 'Define source, API, CLI and artifact compatibility plus migration behavior.',
    },
  };
}

export function validateExtensionProposal(input: unknown): ExtensionProposalValidation {
  const issues: string[] = [];
  if (!isRecord(input)) return { accepted: false, issues: ['proposal must be an object'] };
  checkExactKeys(
    input,
    ['contractVersion', 'id', 'summary', 'trustBoundary', 'evidence'],
    'proposal',
    issues,
  );
  if (input.contractVersion !== EXTENSION_PROPOSAL_CONTRACT_VERSION) {
    issues.push('contractVersion must equal 1');
  }
  if (typeof input.id !== 'string' || !/^[a-z][a-z0-9-]{2,79}$/u.test(input.id)) {
    issues.push('id must be a lowercase kebab-case identifier');
  }
  if (!hasMinimumNormalizedCodePoints(input.summary)) {
    issues.push('summary must contain at least 20 characters');
  }
  if (!isRecord(input.trustBoundary)) {
    issues.push('trustBoundary must be an object');
  } else {
    checkExactKeys(input.trustBoundary, Object.keys(safeTrustBoundary), 'trustBoundary', issues);
    for (const [key, expected] of Object.entries(safeTrustBoundary)) {
      if (input.trustBoundary[key] !== expected) {
        issues.push(`trustBoundary.${key} must equal ${JSON.stringify(expected)}`);
      }
    }
  }
  if (!isRecord(input.evidence)) {
    issues.push('evidence must be an object');
  } else {
    checkExactKeys(input.evidence, evidenceKeys, 'evidence', issues);
    for (const key of evidenceKeys) {
      if (!hasMinimumNormalizedCodePoints(input.evidence[key])) {
        issues.push(`evidence.${key} must contain at least 20 characters`);
      }
    }
  }
  return { accepted: issues.length === 0, issues };
}

function checkExactKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  label: string,
  issues: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push(`${label}.${key} is not allowed`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) issues.push(`${label}.${key} is required`);
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function hasMinimumNormalizedCodePoints(value: unknown): value is string {
  return typeof value === 'string' && [...value.trim()].length >= MINIMUM_EXPLANATION_CODE_POINTS;
}

const safeTrustBoundary = {
  authorCode: 'forbidden',
  callbacks: 'forbidden',
  eval: 'forbidden',
  dynamicImports: 'forbidden',
  networkAccess: 'forbidden',
  confinement: 'source-root',
  offline: 'required',
  deterministicSerialization: 'required',
  cspCompatible: 'required',
  packageOwnedRuntime: 'required',
} as const satisfies ExtensionTrustBoundary;
