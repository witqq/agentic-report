import { isNormalizedPackageRelativePosixPath } from '../authoring/local-reference.js';

export const REVIEW_CONTRACT_VERSION = 3 as const;
export const LEGACY_REVIEW_CONTRACT_VERSION = 2 as const;
export const REVIEW_TARGET_MANIFEST_VERSION = 2 as const;
export const MAX_REVIEW_THREADS = 500;
export const MAX_REVIEW_SEGMENTS = 500;
export const MAX_REVIEW_MESSAGES = 500;
export const MAX_REVIEW_RESPONSES = MAX_REVIEW_MESSAGES;
export const MAX_REVIEW_NAME_LENGTH = 200;

/**
 * Ceiling on reviewable blocks in one report.
 *
 * The limit keeps a review manifest addressable; it does not cap document length. A long
 * engineering walkthrough legitimately holds thousands of paragraphs, code fences and tables, and
 * splitting it into several artifacts would defeat the single-file distribution this package exists
 * for. Callers that need a different bound pass it explicitly.
 */
export const MAX_REVIEW_TARGETS = 5000;

export const MAX_REVIEW_MANIFEST_BYTES = 750_000;
export const MAX_REVIEW_FILE_BYTES = 3_000_000;
export const MAX_REVIEW_TEXT_LENGTH = 4_000;
const MAX_ISSUES = 100;
const ID = /^[a-z][a-z0-9:._-]{0,127}$/u;
const SHA = /^sha256:[a-f0-9]{64}$/u;

export type ReviewMessageAuthor = 'user' | 'agent';
export type ReviewBinding = 'exact' | 'changed' | 'missing' | 'ambiguous';
export interface ReviewSourceReference {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
}
export interface ReviewTargetReference {
  readonly id: string;
  readonly kind: string;
  readonly fingerprint: string;
  readonly stableKey?: string;
  readonly source: ReviewSourceReference;
}
export interface ReviewTargetManifest {
  readonly contractVersion: typeof REVIEW_TARGET_MANIFEST_VERSION;
  readonly reportRevision: string;
  readonly targets: readonly ReviewTargetReference[];
}
export interface ReviewMessage {
  readonly id: string;
  readonly author: ReviewMessageAuthor;
  readonly message: string;
}
export interface ReviewThread {
  readonly id: string;
  readonly segments: readonly ReviewThreadSegment[];
}
export interface ReviewThreadSegment {
  readonly id: string;
  readonly reportRevision: string;
  readonly target: ReviewTargetReference;
  readonly selection?: ReviewSelectionAnchor;
  readonly resolved: boolean;
  readonly messages: readonly ReviewMessage[];
}
export interface ReviewSelectionBoundary {
  readonly target: ReviewTargetReference;
  readonly offset: number;
}
export interface ReviewSelectionAnchor {
  readonly start: ReviewSelectionBoundary;
  readonly end: ReviewSelectionBoundary;
  readonly quote: string;
}
export interface ReviewArtifact {
  readonly contractVersion: typeof REVIEW_CONTRACT_VERSION;
  readonly report: { readonly revision: string };
  readonly threads: readonly ReviewThread[];
}
export interface ReviewContractIssue {
  readonly path: string;
  readonly message: string;
}
export interface ReviewTextConstraint {
  readonly input: string;
  readonly canonical: string;
  readonly codePointLength: number;
  readonly truncated: boolean;
}

export function constrainReviewText(value: string, maximum: number): ReviewTextConstraint {
  const normalized = value.normalize('NFC');
  const leading = /^\s*/u.exec(normalized)?.[0] ?? '';
  const points = Array.from(normalized.trim());
  const truncated = points.length > maximum;
  const canonical = (truncated ? points.slice(0, maximum) : points).join('');
  return {
    input: truncated ? `${leading}${canonical}` : normalized,
    canonical,
    codePointLength: points.length,
    truncated,
  };
}

export class ReviewContractError extends Error {
  public constructor(
    public readonly issues: readonly ReviewContractIssue[],
    public readonly unsupportedVersion = false,
    expectedVersion: number = REVIEW_CONTRACT_VERSION,
  ) {
    super(
      unsupportedVersion
        ? `Unsupported review contract version. Expected ${expectedVersion}.`
        : 'Review artifact does not satisfy the review contract.',
    );
    this.name = 'ReviewContractError';
  }
}

export function parseReviewArtifact(input: unknown): ReviewArtifact {
  const { record, version } = artifactVersioned(input);
  const issues: ReviewContractIssue[] = [];
  exact(record, ['contractVersion', 'report', 'threads'], '$', issues);
  const report = object(record.report, '$.report', issues);
  if (report) exact(report, ['revision'], '$.report', issues);
  const revision = fingerprint(report?.revision, '$.report.revision', issues);
  const threads: ReviewThread[] = [];
  if (!Array.isArray(record.threads)) add(issues, '$.threads', 'must be an array');
  else if (record.threads.length > MAX_REVIEW_THREADS)
    add(issues, '$.threads', `must contain at most ${MAX_REVIEW_THREADS} threads`);
  else
    record.threads.forEach((value, index) => {
      const item = thread(value, `$.threads[${index}]`, issues, version);
      if (item) threads.push(item);
    });
  unique(
    threads.map((item) => item.id),
    '$.threads',
    'thread id',
    issues,
  );
  for (const item of threads) {
    if (item.segments.filter((segment) => segment.reportRevision === revision).length > 1)
      add(issues, '$.threads', 'a thread must contain at most one current revision segment');
  }
  unique(
    threads.flatMap((item) =>
      item.segments
        .filter((segment) => segment.reportRevision === revision)
        .map((segment) =>
          segment.selection === undefined
            ? `block\0${segment.target.id}`
            : `selection\0${segment.target.id}\0${JSON.stringify(segment.selection)}`,
        ),
    ),
    '$.threads',
    'thread subject',
    issues,
  );
  if (
    threads.reduce(
      (sum, item) => sum + item.segments.reduce((n, segment) => n + segment.messages.length, 0),
      0,
    ) > MAX_REVIEW_MESSAGES
  )
    add(issues, '$.threads', `must contain at most ${MAX_REVIEW_MESSAGES} messages in total`);
  if (!revision || issues.length) throw new ReviewContractError(issues);
  return { contractVersion: REVIEW_CONTRACT_VERSION, report: { revision }, threads };
}

export function parseReviewTargetManifest(
  input: unknown,
  targetLimit: number = MAX_REVIEW_TARGETS,
): ReviewTargetManifest {
  const record = manifestVersioned(input);
  const issues: ReviewContractIssue[] = [];
  exact(record, ['contractVersion', 'reportRevision', 'targets'], '$', issues);
  const reportRevision = fingerprint(record.reportRevision, '$.reportRevision', issues);
  const targets: ReviewTargetReference[] = [];
  if (!Array.isArray(record.targets)) add(issues, '$.targets', 'must be an array');
  else if (record.targets.length > targetLimit)
    add(issues, '$.targets', `must contain at most ${targetLimit} targets`);
  else
    record.targets.forEach((value, index) => {
      const item = target(value, `$.targets[${index}]`, issues);
      if (item) targets.push(item);
    });
  unique(
    targets.map((item) => item.id),
    '$.targets',
    'target id',
    issues,
  );
  unique(
    targets.map((item) => item.stableKey).filter((value): value is string => value !== undefined),
    '$.targets',
    'stable key',
    issues,
  );
  if (!reportRevision || issues.length) throw new ReviewContractError(issues);
  return { contractVersion: REVIEW_TARGET_MANIFEST_VERSION, reportRevision, targets };
}

export function serializeReviewArtifact(input: ReviewArtifact): string {
  const artifact = parseReviewArtifact(input);
  return `${JSON.stringify({ ...artifact, threads: [...artifact.threads].sort((a, b) => compare(a.id, b.id)) })}\n`;
}

function artifactVersioned(input: unknown): {
  readonly record: Readonly<Record<string, unknown>>;
  readonly version: typeof REVIEW_CONTRACT_VERSION | typeof LEGACY_REVIEW_CONTRACT_VERSION;
} {
  if (!plain(input)) throw new ReviewContractError([{ path: '$', message: 'must be an object' }]);
  if (
    input.contractVersion !== REVIEW_CONTRACT_VERSION &&
    input.contractVersion !== LEGACY_REVIEW_CONTRACT_VERSION
  )
    throw new ReviewContractError(
      [
        {
          path: '$.contractVersion',
          message: `must equal ${REVIEW_CONTRACT_VERSION} or legacy ${LEGACY_REVIEW_CONTRACT_VERSION}; version 1 formal reviews are not supported`,
        },
      ],
      true,
    );
  return { record: input, version: input.contractVersion };
}

function manifestVersioned(input: unknown): Readonly<Record<string, unknown>> {
  if (!plain(input)) throw new ReviewContractError([{ path: '$', message: 'must be an object' }]);
  if (input.contractVersion !== REVIEW_TARGET_MANIFEST_VERSION)
    throw new ReviewContractError(
      [
        {
          path: '$.contractVersion',
          message: `must equal ${REVIEW_TARGET_MANIFEST_VERSION}`,
        },
      ],
      true,
      REVIEW_TARGET_MANIFEST_VERSION,
    );
  return input;
}

function thread(
  input: unknown,
  path: string,
  issues: ReviewContractIssue[],
  version: typeof REVIEW_CONTRACT_VERSION | typeof LEGACY_REVIEW_CONTRACT_VERSION,
): ReviewThread | undefined {
  const record = object(input, path, issues);
  if (!record) return;
  exact(record, ['id', 'segments'], path, issues);
  const id = identifier(record.id, `${path}.id`, issues);
  const segments: ReviewThreadSegment[] = [];
  if (!Array.isArray(record.segments)) add(issues, `${path}.segments`, 'must be an array');
  else if (record.segments.length > MAX_REVIEW_SEGMENTS)
    add(issues, `${path}.segments`, `must contain at most ${MAX_REVIEW_SEGMENTS} segments`);
  else
    record.segments.forEach((value, index) => {
      const item = segment(value, `${path}.segments[${index}]`, issues, version);
      if (item) segments.push(item);
    });
  unique(
    segments.map((item) => item.id),
    `${path}.segments`,
    'segment id',
    issues,
  );
  unique(
    segments.flatMap((item) => item.messages.map((message) => message.id)),
    `${path}.segments`,
    'thread message id',
    issues,
  );
  unique(
    segments.map((item) => `${item.reportRevision}\0${item.target.id}`),
    `${path}.segments`,
    'segment revision target',
    issues,
  );
  if (!segments.length) add(issues, `${path}.segments`, 'must contain at least one segment');
  return id ? { id, segments } : undefined;
}

function segment(
  input: unknown,
  path: string,
  issues: ReviewContractIssue[],
  version: typeof REVIEW_CONTRACT_VERSION | typeof LEGACY_REVIEW_CONTRACT_VERSION,
): ReviewThreadSegment | undefined {
  const record = object(input, path, issues);
  if (!record) return;
  exact(
    record,
    version === REVIEW_CONTRACT_VERSION
      ? ['id', 'reportRevision', 'target', 'selection', 'resolved', 'messages']
      : ['id', 'reportRevision', 'target', 'resolved', 'messages'],
    path,
    issues,
  );
  const id = identifier(record.id, `${path}.id`, issues);
  const reportRevision = fingerprint(record.reportRevision, `${path}.reportRevision`, issues);
  const owner = target(record.target, `${path}.target`, issues);
  const selection =
    version === REVIEW_CONTRACT_VERSION && record.selection !== undefined
      ? selectionAnchor(record.selection, `${path}.selection`, issues)
      : undefined;
  if (
    selection !== undefined &&
    owner !== undefined &&
    !equivalentTarget(owner, selection.start.target)
  )
    add(issues, `${path}.selection.start.target`, 'must equal the segment target');
  if (typeof record.resolved !== 'boolean') add(issues, `${path}.resolved`, 'must be boolean');
  const messages: ReviewMessage[] = [];
  if (!Array.isArray(record.messages)) add(issues, `${path}.messages`, 'must be an array');
  else if (record.messages.length > MAX_REVIEW_MESSAGES)
    add(issues, `${path}.messages`, `must contain at most ${MAX_REVIEW_MESSAGES} messages`);
  else
    record.messages.forEach((value, index) => {
      const item = message(value, `${path}.messages[${index}]`, issues);
      if (item) messages.push(item);
    });
  unique(
    messages.map((item) => item.id),
    `${path}.messages`,
    'message id',
    issues,
  );
  if (!messages.length) add(issues, `${path}.messages`, 'must contain at least one message');
  return id && reportRevision && owner && typeof record.resolved === 'boolean'
    ? {
        id,
        reportRevision,
        target: owner,
        ...(selection === undefined ? {} : { selection }),
        resolved: record.resolved,
        messages,
      }
    : undefined;
}

function selectionAnchor(
  input: unknown,
  path: string,
  issues: ReviewContractIssue[],
): ReviewSelectionAnchor | undefined {
  const record = object(input, path, issues);
  if (!record) return;
  exact(record, ['start', 'end', 'quote'], path, issues);
  const start = selectionBoundary(record.start, `${path}.start`, issues);
  const end = selectionBoundary(record.end, `${path}.end`, issues);
  const quote = selectionQuote(record.quote, `${path}.quote`, issues);
  if (
    start !== undefined &&
    end !== undefined &&
    start.target.id === end.target.id &&
    end.offset <= start.offset
  )
    add(issues, `${path}.end.offset`, 'must follow the start offset in the same target');
  return start && end && quote ? { start, end, quote } : undefined;
}

function selectionBoundary(
  input: unknown,
  path: string,
  issues: ReviewContractIssue[],
): ReviewSelectionBoundary | undefined {
  const record = object(input, path, issues);
  if (!record) return;
  exact(record, ['target', 'offset'], path, issues);
  const owner = target(record.target, `${path}.target`, issues);
  const offset = nonNegative(record.offset, `${path}.offset`, issues);
  return owner && offset !== undefined ? { target: owner, offset } : undefined;
}

function selectionQuote(
  value: unknown,
  path: string,
  issues: ReviewContractIssue[],
): string | undefined {
  if (typeof value !== 'string') {
    add(issues, path, 'must be text');
    return;
  }
  const normalized = value.normalize('NFC');
  const length = Array.from(normalized).length;
  if (!normalized.trim() || length > MAX_REVIEW_TEXT_LENGTH) {
    add(
      issues,
      path,
      `must contain non-whitespace text up to ${MAX_REVIEW_TEXT_LENGTH} Unicode code points`,
    );
    return;
  }
  return normalized;
}

function message(
  input: unknown,
  path: string,
  issues: ReviewContractIssue[],
): ReviewMessage | undefined {
  const record = object(input, path, issues);
  if (!record) return;
  exact(record, ['id', 'author', 'message'], path, issues);
  const id = identifier(record.id, `${path}.id`, issues);
  const author = record.author;
  if (author !== 'user' && author !== 'agent')
    add(issues, `${path}.author`, 'must be user or agent');
  const text = bounded(record.message, `${path}.message`, issues);
  return id && (author === 'user' || author === 'agent') && text
    ? { id, author, message: text }
    : undefined;
}

function target(
  input: unknown,
  path: string,
  issues: ReviewContractIssue[],
): ReviewTargetReference | undefined {
  const record = object(input, path, issues);
  if (!record) return;
  exact(record, ['id', 'kind', 'fingerprint', 'stableKey', 'source'], path, issues);
  const id = identifier(record.id, `${path}.id`, issues);
  const kind = token(record.kind, `${path}.kind`, issues);
  const hash = fingerprint(record.fingerprint, `${path}.fingerprint`, issues);
  const stableKey =
    record.stableKey === undefined
      ? undefined
      : identifier(record.stableKey, `${path}.stableKey`, issues);
  const source = sourceRef(record.source, `${path}.source`, issues);
  return id && kind && hash && source
    ? { id, kind, fingerprint: hash, ...(stableKey ? { stableKey } : {}), source }
    : undefined;
}

function sourceRef(
  input: unknown,
  path: string,
  issues: ReviewContractIssue[],
): ReviewSourceReference | undefined {
  const record = object(input, path, issues);
  if (!record) return;
  exact(record, ['file', 'line', 'column', 'endLine', 'endColumn'], path, issues);
  const file = record.file;
  if (typeof file !== 'string' || !isNormalizedPackageRelativePosixPath(file))
    add(issues, `${path}.file`, 'must be a normalized confined relative POSIX path');
  const line = positive(record.line, `${path}.line`, issues),
    column = positive(record.column, `${path}.column`, issues),
    endLine = positive(record.endLine, `${path}.endLine`, issues),
    endColumn = positive(record.endColumn, `${path}.endColumn`, issues);
  if (line && endLine && endLine < line) add(issues, `${path}.endLine`, 'must not precede line');
  if (line && column && endLine === line && endColumn && endColumn < column)
    add(issues, `${path}.endColumn`, 'must not precede column on the same line');
  return typeof file === 'string' &&
    isNormalizedPackageRelativePosixPath(file) &&
    line &&
    column &&
    endLine &&
    endColumn
    ? { file, line, column, endLine, endColumn }
    : undefined;
}

function object(
  value: unknown,
  path: string,
  issues: ReviewContractIssue[],
): Readonly<Record<string, unknown>> | undefined {
  if (!plain(value)) {
    add(issues, path, 'must be an object');
    return;
  }
  return value;
}
function exact(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  path: string,
  issues: ReviewContractIssue[],
): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) add(issues, `${path}.${key}`, 'is not allowed');
  for (const key of allowed)
    if (key !== 'stableKey' && key !== 'selection' && !Object.hasOwn(value, key))
      add(issues, `${path}.${key}`, 'is required');
}
function identifier(
  value: unknown,
  path: string,
  issues: ReviewContractIssue[],
): string | undefined {
  if (typeof value !== 'string' || !ID.test(value)) {
    add(issues, path, 'must be a lowercase review identifier');
    return;
  }
  return value;
}
function token(value: unknown, path: string, issues: ReviewContractIssue[]): string | undefined {
  if (typeof value !== 'string' || value.length > 80 || !/^[a-z][a-z0-9:-]*$/u.test(value)) {
    add(issues, path, 'must be a bounded lowercase token');
    return;
  }
  return value;
}
function fingerprint(
  value: unknown,
  path: string,
  issues: ReviewContractIssue[],
): string | undefined {
  if (typeof value !== 'string' || !SHA.test(value)) {
    add(issues, path, 'must be a lowercase SHA-256 identity');
    return;
  }
  return value;
}
function bounded(value: unknown, path: string, issues: ReviewContractIssue[]): string | undefined {
  if (typeof value !== 'string') {
    add(issues, path, 'must be text');
    return;
  }
  const result = constrainReviewText(value, MAX_REVIEW_TEXT_LENGTH);
  if (!result.codePointLength || result.truncated) {
    add(issues, path, `must contain 1 to ${MAX_REVIEW_TEXT_LENGTH} Unicode code points`);
    return;
  }
  return result.canonical;
}
function positive(value: unknown, path: string, issues: ReviewContractIssue[]): number | undefined {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    add(issues, path, 'must be a positive safe integer');
    return;
  }
  return value as number;
}
function nonNegative(
  value: unknown,
  path: string,
  issues: ReviewContractIssue[],
): number | undefined {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    add(issues, path, 'must be a non-negative safe integer');
    return;
  }
  return value as number;
}
function equivalentTarget(left: ReviewTargetReference, right: ReviewTargetReference): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
function unique(
  values: readonly string[],
  path: string,
  label: string,
  issues: ReviewContractIssue[],
): void {
  if (new Set(values).size !== values.length) add(issues, path, `contains a duplicate ${label}`);
}
function plain(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
function add(issues: ReviewContractIssue[], path: string, message: string): void {
  if (issues.length < MAX_ISSUES) issues.push({ path, message });
}
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
