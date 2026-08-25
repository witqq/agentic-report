import { isNormalizedPackageRelativePosixPath } from '../authoring/local-reference.js';

export const REVIEW_CONTRACT_VERSION = 1 as const;
export const MAX_REVIEW_RESPONSES = 500;
export const MAX_REVIEW_TARGETS = 500;
export const MAX_REVIEW_MANIFEST_BYTES = 750_000;
export const MAX_REVIEW_FILE_BYTES = 3_000_000;
export const MAX_REVIEW_NAME_LENGTH = 200;
export const MAX_REVIEW_TEXT_LENGTH = 4_000;

const MAX_REVIEW_ISSUES = 100;
const ID_PATTERN = /^[a-z][a-z0-9:._-]{0,127}$/u;
const FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/u;

export type ReviewFeedbackKind = 'comment' | 'question' | 'change-request' | 'blocker';
export type ReviewVerdict = 'approve' | 'revise' | 'reject';
export type ReviewChecklistStatus = 'checked' | 'unchecked' | 'not-applicable';
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
  readonly contractVersion: typeof REVIEW_CONTRACT_VERSION;
  readonly reportRevision: string;
  readonly targets: readonly ReviewTargetReference[];
  readonly requirements?: ReviewRequirements;
}

export interface ReviewVerdictValue {
  readonly verdict: ReviewVerdict;
  readonly rationale?: string;
}

interface ReviewResponseBase {
  readonly id: string;
  readonly target: ReviewTargetReference;
}

export interface ReviewFeedbackResponse extends ReviewResponseBase {
  readonly kind: ReviewFeedbackKind;
  readonly message: string;
}

export interface ReviewVerdictResponse extends ReviewResponseBase, ReviewVerdictValue {
  readonly kind: 'verdict';
}

export interface ReviewDecisionResponse extends ReviewResponseBase {
  readonly kind: 'decision';
  readonly optionId: string;
  readonly rationale?: string;
}

export interface ReviewChecklistItemResponse {
  readonly itemId: string;
  readonly status: ReviewChecklistStatus;
  readonly note?: string;
}

export interface ReviewChecklistResponse extends ReviewResponseBase {
  readonly kind: 'checklist';
  readonly items: readonly ReviewChecklistItemResponse[];
}

export type ReviewResponse =
  ReviewFeedbackResponse | ReviewVerdictResponse | ReviewDecisionResponse | ReviewChecklistResponse;

export interface ReviewArtifact {
  readonly contractVersion: typeof REVIEW_CONTRACT_VERSION;
  readonly report: { readonly revision: string };
  readonly reviewer?: { readonly name: string };
  readonly pageVerdict?: ReviewVerdictValue;
  readonly responses: readonly ReviewResponse[];
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

export interface ReviewDecisionRequirement {
  readonly targetId: string;
  readonly required: boolean;
  readonly optionIds: readonly string[];
  readonly title?: string;
  readonly optionLabels?: Readonly<Record<string, string>>;
}

export interface ReviewChecklistRequirement {
  readonly targetId: string;
  readonly title?: string;
  readonly items: readonly {
    readonly itemId: string;
    readonly required: boolean;
    readonly label?: string;
  }[];
}

export interface ReviewRequirements {
  readonly decisions: readonly ReviewDecisionRequirement[];
  readonly checklists: readonly ReviewChecklistRequirement[];
}

export function assertReviewRequirements(
  artifact: ReviewArtifact,
  requirements: ReviewRequirements,
): void {
  for (const response of artifact.responses) {
    if (
      response.kind === 'decision' &&
      !requirements.decisions.some((decision) => decision.targetId === response.target.id)
    )
      throw new Error('Decision response does not belong to a current decision.');
    if (
      response.kind === 'checklist' &&
      !requirements.checklists.some((checklist) => checklist.targetId === response.target.id)
    )
      throw new Error('Checklist response does not belong to a current checklist.');
  }
  for (const decision of requirements.decisions) {
    const responses = artifact.responses.filter(
      (candidate): candidate is ReviewDecisionResponse =>
        candidate.kind === 'decision' && candidate.target.id === decision.targetId,
    );
    if (responses.length > 1)
      throw new Error('Review contains more than one response for a decision.');
    const response = responses[0];
    if (
      response !== undefined &&
      !['open', 'deferred', ...decision.optionIds].includes(response.optionId)
    ) {
      throw new Error('Review contains an unknown decision option.');
    }
    if (
      artifact.pageVerdict?.verdict === 'approve' &&
      decision.required &&
      response === undefined
    ) {
      throw new Error('Resolve required decisions before approving the report.');
    }
    if (
      artifact.pageVerdict?.verdict === 'approve' &&
      decision.required &&
      (response?.optionId === 'open' || response?.optionId === 'deferred')
    ) {
      throw new Error('Resolve open or deferred required decisions before approving the report.');
    }
  }
  for (const checklist of requirements.checklists) {
    const responses = artifact.responses.filter(
      (candidate): candidate is ReviewChecklistResponse =>
        candidate.kind === 'checklist' && candidate.target.id === checklist.targetId,
    );
    if (responses.length > 1)
      throw new Error('Review contains more than one response for a checklist.');
    const response = responses[0];
    if (
      response?.items.some(
        (item) => !checklist.items.some((current) => current.itemId === item.itemId),
      )
    ) {
      throw new Error('Review contains an unknown checklist item.');
    }
    if (artifact.pageVerdict?.verdict !== 'approve') continue;
    const unresolved = checklist.items.some((item) => {
      if (!item.required) return false;
      const state = response?.items.find((candidate) => candidate.itemId === item.itemId);
      return state === undefined || state.status === 'unchecked';
    });
    if (unresolved)
      throw new Error('Complete required checklist items before approving the report.');
  }
}

export function constrainReviewText(value: string, maximum: number): ReviewTextConstraint {
  const normalized = value.normalize('NFC');
  const leadingWhitespace = /^\s*/u.exec(normalized)?.[0] ?? '';
  const codePoints = Array.from(normalized.trim());
  const truncated = codePoints.length > maximum;
  const canonical = (truncated ? codePoints.slice(0, maximum) : codePoints).join('');
  return {
    input: truncated ? `${leadingWhitespace}${canonical}` : normalized,
    canonical,
    codePointLength: codePoints.length,
    truncated,
  };
}

export class ReviewContractError extends Error {
  public readonly issues: readonly ReviewContractIssue[];

  public constructor(issues: readonly ReviewContractIssue[]) {
    super('Review artifact does not satisfy the review contract.');
    this.name = 'ReviewContractError';
    this.issues = issues;
  }
}

export function parseReviewArtifact(input: unknown): ReviewArtifact {
  const issues: ReviewContractIssue[] = [];
  const artifact = reviewArtifact(input, issues);
  if (artifact === undefined || issues.length > 0) throw new ReviewContractError(issues);
  return artifact;
}

export function parseReviewTargetManifest(input: unknown): ReviewTargetManifest {
  const issues: ReviewContractIssue[] = [];
  const record = requireRecord(input, '$', issues);
  if (record === undefined) throw new ReviewContractError(issues);
  exactKeys(record, ['contractVersion', 'reportRevision', 'targets', 'requirements'], '$', issues);
  if (record.contractVersion !== REVIEW_CONTRACT_VERSION) {
    issue(issues, '$.contractVersion', 'must equal 1');
  }
  const reportRevision = fingerprint(record.reportRevision, '$.reportRevision', issues);
  const targetsValue = record.targets;
  const targets: ReviewTargetReference[] = [];
  if (!Array.isArray(targetsValue)) issue(issues, '$.targets', 'must be an array');
  else if (targetsValue.length > MAX_REVIEW_TARGETS) {
    issue(issues, '$.targets', `must contain at most ${MAX_REVIEW_TARGETS} targets`);
  } else {
    for (const [index, value] of targetsValue.entries()) {
      const target = reviewTarget(value, `$.targets[${index}]`, issues);
      if (target !== undefined) targets.push(target);
    }
  }
  uniqueValues(
    targets.map((target) => target.id),
    '$.targets',
    'target id',
    issues,
  );
  uniqueOptionalValues(
    targets.map((target) => target.stableKey),
    '$.targets',
    'stable key',
    issues,
  );
  const requirements = parseReviewRequirements(record.requirements, '$.requirements', issues);
  if (reportRevision === undefined || issues.length > 0) throw new ReviewContractError(issues);
  return {
    contractVersion: REVIEW_CONTRACT_VERSION,
    reportRevision,
    targets,
    ...(requirements === undefined ? {} : { requirements }),
  };
}

function parseReviewRequirements(
  input: unknown,
  path: string,
  issues: ReviewContractIssue[],
): ReviewRequirements | undefined {
  if (input === undefined) return undefined;
  const record = requireRecord(input, path, issues);
  if (record === undefined) return undefined;
  exactKeys(record, ['decisions', 'checklists'], path, issues);
  const decisions: ReviewDecisionRequirement[] = [];
  const checklists: ReviewChecklistRequirement[] = [];
  if (!Array.isArray(record.decisions)) issue(issues, `${path}.decisions`, 'must be an array');
  else if (record.decisions.length > MAX_REVIEW_RESPONSES)
    issue(issues, `${path}.decisions`, `must contain at most ${MAX_REVIEW_RESPONSES} decisions`);
  else
    for (const [index, value] of record.decisions.entries()) {
      const item = requireRecord(value, `${path}.decisions[${index}]`, issues);
      if (item === undefined) continue;
      exactKeys(
        item,
        ['targetId', 'required', 'optionIds', 'title', 'optionLabels'],
        `${path}.decisions[${index}]`,
        issues,
      );
      const targetId = identifier(item.targetId, `${path}.decisions[${index}].targetId`, issues);
      if (typeof item.required !== 'boolean')
        issue(issues, `${path}.decisions[${index}].required`, 'must be boolean');
      if (!Array.isArray(item.optionIds))
        issue(issues, `${path}.decisions[${index}].optionIds`, 'must be an array');
      else if (item.optionIds.length > MAX_REVIEW_RESPONSES)
        issue(
          issues,
          `${path}.decisions[${index}].optionIds`,
          `must contain at most ${MAX_REVIEW_RESPONSES} options`,
        );
      else {
        const optionIds = item.optionIds
          .map((option, optionIndex) =>
            identifier(option, `${path}.decisions[${index}].optionIds[${optionIndex}]`, issues),
          )
          .filter((option): option is string => option !== undefined);
        if (targetId !== undefined && typeof item.required === 'boolean')
          decisions.push({
            targetId,
            required: item.required,
            optionIds,
            ...(typeof item.title === 'string' ? { title: item.title } : {}),
            ...(isPlainRecord(item.optionLabels)
              ? { optionLabels: item.optionLabels as Readonly<Record<string, string>> }
              : {}),
          });
      }
    }
  if (!Array.isArray(record.checklists)) issue(issues, `${path}.checklists`, 'must be an array');
  else if (record.checklists.length > MAX_REVIEW_RESPONSES)
    issue(issues, `${path}.checklists`, `must contain at most ${MAX_REVIEW_RESPONSES} checklists`);
  else
    for (const [index, value] of record.checklists.entries()) {
      const item = requireRecord(value, `${path}.checklists[${index}]`, issues);
      if (item === undefined) continue;
      exactKeys(item, ['targetId', 'items', 'title'], `${path}.checklists[${index}]`, issues);
      const targetId = identifier(item.targetId, `${path}.checklists[${index}].targetId`, issues);
      const items: Array<{ itemId: string; required: boolean }> = [];
      if (!Array.isArray(item.items))
        issue(issues, `${path}.checklists[${index}].items`, 'must be an array');
      else if (item.items.length > MAX_REVIEW_RESPONSES)
        issue(
          issues,
          `${path}.checklists[${index}].items`,
          `must contain at most ${MAX_REVIEW_RESPONSES} items`,
        );
      else
        for (const [itemIndex, value] of item.items.entries()) {
          const child = requireRecord(
            value,
            `${path}.checklists[${index}].items[${itemIndex}]`,
            issues,
          );
          if (child === undefined) continue;
          exactKeys(
            child,
            ['itemId', 'required', 'label'],
            `${path}.checklists[${index}].items[${itemIndex}]`,
            issues,
          );
          const itemId = identifier(
            child.itemId,
            `${path}.checklists[${index}].items[${itemIndex}].itemId`,
            issues,
          );
          if (typeof child.required !== 'boolean')
            issue(
              issues,
              `${path}.checklists[${index}].items[${itemIndex}].required`,
              'must be boolean',
            );
          if (itemId !== undefined && typeof child.required === 'boolean')
            items.push({
              itemId,
              required: child.required,
              ...(typeof child.label === 'string' ? { label: child.label } : {}),
            });
        }
      if (targetId !== undefined)
        checklists.push({
          targetId,
          items,
          ...(typeof item.title === 'string' ? { title: item.title } : {}),
        });
    }
  return { decisions, checklists };
}

export function serializeReviewArtifact(input: ReviewArtifact): string {
  const artifact = parseReviewArtifact(input);
  const responses = [...artifact.responses]
    .map((response) =>
      response.kind === 'checklist'
        ? {
            ...response,
            items: [...response.items].sort((left, right) => compare(left.itemId, right.itemId)),
          }
        : response,
    )
    .sort((left, right) => compare(left.id, right.id));
  return `${JSON.stringify({ ...artifact, responses })}\n`;
}

function reviewArtifact(input: unknown, issues: ReviewContractIssue[]): ReviewArtifact | undefined {
  const record = requireRecord(input, '$', issues);
  if (record === undefined) return undefined;
  exactKeys(
    record,
    ['contractVersion', 'report', 'reviewer', 'pageVerdict', 'responses'],
    '$',
    issues,
  );
  if (record.contractVersion !== REVIEW_CONTRACT_VERSION) {
    issue(issues, '$.contractVersion', 'must equal 1');
  }

  const reportRecord = requireRecord(record.report, '$.report', issues);
  if (reportRecord !== undefined) exactKeys(reportRecord, ['revision'], '$.report', issues);
  const revision = fingerprint(reportRecord?.revision, '$.report.revision', issues);

  let reviewer: { readonly name: string } | undefined;
  if (record.reviewer !== undefined) {
    const reviewerRecord = requireRecord(record.reviewer, '$.reviewer', issues);
    if (reviewerRecord !== undefined) {
      exactKeys(reviewerRecord, ['name'], '$.reviewer', issues);
      const name = boundedText(
        reviewerRecord.name,
        '$.reviewer.name',
        MAX_REVIEW_NAME_LENGTH,
        issues,
      );
      if (name !== undefined) reviewer = { name };
    }
  }

  const pageVerdict =
    record.pageVerdict === undefined
      ? undefined
      : verdictValue(record.pageVerdict, '$.pageVerdict', issues);

  const responses: ReviewResponse[] = [];
  if (!Array.isArray(record.responses)) issue(issues, '$.responses', 'must be an array');
  else if (record.responses.length > MAX_REVIEW_RESPONSES) {
    issue(issues, '$.responses', `must contain at most ${MAX_REVIEW_RESPONSES} responses`);
  } else {
    for (const [index, value] of record.responses.entries()) {
      const response = reviewResponse(value, `$.responses[${index}]`, issues);
      if (response !== undefined) responses.push(response);
    }
  }
  uniqueValues(
    responses.map((response) => response.id),
    '$.responses',
    'response id',
    issues,
  );
  const verdictTargets = new Set<string>();
  for (const response of responses) {
    if (response.kind !== 'verdict') continue;
    if (verdictTargets.has(response.target.id)) {
      issue(issues, '$.responses', 'Imported review contains more than one verdict for a block.');
      break;
    }
    verdictTargets.add(response.target.id);
  }
  if (
    pageVerdict?.verdict === 'approve' &&
    responses.some(
      (response) =>
        response.kind === 'blocker' ||
        (response.kind === 'verdict' && response.verdict !== 'approve'),
    )
  ) {
    issue(
      issues,
      '$.pageVerdict.verdict',
      'Resolve blockers and revise or reject block verdicts before approving the report.',
    );
  }
  if (revision === undefined || issues.length > 0) return undefined;
  return {
    contractVersion: REVIEW_CONTRACT_VERSION,
    report: { revision },
    ...(reviewer === undefined ? {} : { reviewer }),
    ...(pageVerdict === undefined ? {} : { pageVerdict }),
    responses,
  };
}

function reviewResponse(
  input: unknown,
  path: string,
  issues: ReviewContractIssue[],
): ReviewResponse | undefined {
  const record = requireRecord(input, path, issues);
  if (record === undefined) return undefined;
  const kind = record.kind;
  const commonKeys = ['id', 'kind', 'target'];
  const id = identifier(record.id, `${path}.id`, issues);
  const target = reviewTarget(record.target, `${path}.target`, issues);
  if (isFeedbackKind(kind)) {
    exactKeys(record, [...commonKeys, 'message'], path, issues);
    const message = boundedText(record.message, `${path}.message`, MAX_REVIEW_TEXT_LENGTH, issues);
    return id === undefined || target === undefined || message === undefined
      ? undefined
      : { id, kind, target, message };
  }
  if (kind === 'verdict') {
    exactKeys(record, [...commonKeys, 'verdict', 'rationale'], path, issues);
    const value = verdictFields(record, path, issues);
    return id === undefined || target === undefined || value === undefined
      ? undefined
      : { id, kind, target, ...value };
  }
  if (kind === 'decision') {
    exactKeys(record, [...commonKeys, 'optionId', 'rationale'], path, issues);
    const optionId = identifier(record.optionId, `${path}.optionId`, issues);
    const rationale = optionalText(record.rationale, `${path}.rationale`, issues);
    return id === undefined || target === undefined || optionId === undefined
      ? undefined
      : { id, kind, target, optionId, ...(rationale === undefined ? {} : { rationale }) };
  }
  if (kind === 'checklist') {
    exactKeys(record, [...commonKeys, 'items'], path, issues);
    const items: ReviewChecklistItemResponse[] = [];
    if (!Array.isArray(record.items)) issue(issues, `${path}.items`, 'must be an array');
    else if (record.items.length > MAX_REVIEW_RESPONSES) {
      issue(issues, `${path}.items`, `must contain at most ${MAX_REVIEW_RESPONSES} items`);
    } else {
      for (const [index, itemValue] of record.items.entries()) {
        const item = checklistItem(itemValue, `${path}.items[${index}]`, issues);
        if (item !== undefined) items.push(item);
      }
    }
    uniqueValues(
      items.map((item) => item.itemId),
      `${path}.items`,
      'item id',
      issues,
    );
    return id === undefined || target === undefined ? undefined : { id, kind, target, items };
  }
  issue(issues, `${path}.kind`, 'must be a supported response kind');
  return undefined;
}

function reviewTarget(
  input: unknown,
  path: string,
  issues: ReviewContractIssue[],
): ReviewTargetReference | undefined {
  const record = requireRecord(input, path, issues);
  if (record === undefined) return undefined;
  exactKeys(record, ['id', 'kind', 'fingerprint', 'stableKey', 'source'], path, issues);
  const id = identifier(record.id, `${path}.id`, issues);
  const kind = boundedToken(record.kind, `${path}.kind`, issues);
  const targetFingerprint = fingerprint(record.fingerprint, `${path}.fingerprint`, issues);
  const stableKey =
    record.stableKey === undefined
      ? undefined
      : identifier(record.stableKey, `${path}.stableKey`, issues);
  const source = sourceReference(record.source, `${path}.source`, issues);
  return id === undefined ||
    kind === undefined ||
    targetFingerprint === undefined ||
    source === undefined
    ? undefined
    : {
        id,
        kind,
        fingerprint: targetFingerprint,
        ...(stableKey === undefined ? {} : { stableKey }),
        source,
      };
}

function sourceReference(
  input: unknown,
  path: string,
  issues: ReviewContractIssue[],
): ReviewSourceReference | undefined {
  const record = requireRecord(input, path, issues);
  if (record === undefined) return undefined;
  exactKeys(record, ['file', 'line', 'column', 'endLine', 'endColumn'], path, issues);
  const file = record.file;
  if (typeof file !== 'string' || !isNormalizedPackageRelativePosixPath(file)) {
    issue(issues, `${path}.file`, 'must be a normalized confined relative POSIX path');
  }
  const line = positiveInteger(record.line, `${path}.line`, issues);
  const column = positiveInteger(record.column, `${path}.column`, issues);
  const endLine = positiveInteger(record.endLine, `${path}.endLine`, issues);
  const endColumn = positiveInteger(record.endColumn, `${path}.endColumn`, issues);
  if (line !== undefined && endLine !== undefined && endLine < line) {
    issue(issues, `${path}.endLine`, 'must not precede line');
  }
  if (
    line !== undefined &&
    column !== undefined &&
    endLine === line &&
    endColumn !== undefined &&
    endColumn < column
  ) {
    issue(issues, `${path}.endColumn`, 'must not precede column on the same line');
  }
  return typeof file !== 'string' ||
    !isNormalizedPackageRelativePosixPath(file) ||
    line === undefined ||
    column === undefined ||
    endLine === undefined ||
    endColumn === undefined
    ? undefined
    : { file, line, column, endLine, endColumn };
}

function verdictValue(
  input: unknown,
  path: string,
  issues: ReviewContractIssue[],
): ReviewVerdictValue | undefined {
  const record = requireRecord(input, path, issues);
  if (record === undefined) return undefined;
  exactKeys(record, ['verdict', 'rationale'], path, issues);
  return verdictFields(record, path, issues);
}

function verdictFields(
  record: Readonly<Record<string, unknown>>,
  path: string,
  issues: ReviewContractIssue[],
): ReviewVerdictValue | undefined {
  const verdict = record.verdict;
  if (verdict !== 'approve' && verdict !== 'revise' && verdict !== 'reject') {
    issue(issues, `${path}.verdict`, 'must be approve, revise, or reject');
    return undefined;
  }
  const rationale = optionalText(record.rationale, `${path}.rationale`, issues);
  if ((verdict === 'revise' || verdict === 'reject') && rationale === undefined) {
    issue(issues, `${path}.rationale`, `is required when verdict is ${verdict}`);
  }
  return { verdict, ...(rationale === undefined ? {} : { rationale }) };
}

function checklistItem(
  input: unknown,
  path: string,
  issues: ReviewContractIssue[],
): ReviewChecklistItemResponse | undefined {
  const record = requireRecord(input, path, issues);
  if (record === undefined) return undefined;
  exactKeys(record, ['itemId', 'status', 'note'], path, issues);
  const itemId = identifier(record.itemId, `${path}.itemId`, issues);
  const status = record.status;
  if (status !== 'checked' && status !== 'unchecked' && status !== 'not-applicable') {
    issue(issues, `${path}.status`, 'must be checked, unchecked, or not-applicable');
  }
  const note = optionalText(record.note, `${path}.note`, issues);
  if (status === 'not-applicable' && note === undefined) {
    issue(issues, `${path}.note`, 'is required when status is not-applicable');
  }
  return itemId === undefined ||
    (status !== 'checked' && status !== 'unchecked' && status !== 'not-applicable')
    ? undefined
    : { itemId, status, ...(note === undefined ? {} : { note }) };
}

function requireRecord(
  value: unknown,
  path: string,
  issues: ReviewContractIssue[],
): Readonly<Record<string, unknown>> | undefined {
  if (!isPlainRecord(value)) {
    issue(issues, path, 'must be an object');
    return undefined;
  }
  return value;
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  path: string,
  issues: ReviewContractIssue[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issue(issues, `${path}.${key}`, 'is not allowed');
  }
  for (const key of allowed) {
    if (
      ![
        'reviewer',
        'pageVerdict',
        'stableKey',
        'rationale',
        'note',
        'requirements',
        'title',
        'optionLabels',
        'label',
      ].includes(key) &&
      !Object.hasOwn(value, key)
    ) {
      issue(issues, `${path}.${key}`, 'is required');
    }
  }
}

function identifier(
  value: unknown,
  path: string,
  issues: ReviewContractIssue[],
): string | undefined {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    issue(issues, path, 'must be a lowercase review identifier');
    return undefined;
  }
  return value;
}

function boundedToken(
  value: unknown,
  path: string,
  issues: ReviewContractIssue[],
): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 80 ||
    !/^[a-z][a-z0-9:-]*$/u.test(value)
  ) {
    issue(issues, path, 'must be a bounded lowercase token');
    return undefined;
  }
  return value;
}

function fingerprint(
  value: unknown,
  path: string,
  issues: ReviewContractIssue[],
): string | undefined {
  if (typeof value !== 'string' || !FINGERPRINT_PATTERN.test(value)) {
    issue(issues, path, 'must be a lowercase SHA-256 identity');
    return undefined;
  }
  return value;
}

function boundedText(
  value: unknown,
  path: string,
  maximum: number,
  issues: ReviewContractIssue[],
): string | undefined {
  if (typeof value !== 'string') {
    issue(issues, path, 'must be text');
    return undefined;
  }
  const constrained = constrainReviewText(value, maximum);
  if (constrained.codePointLength === 0 || constrained.truncated) {
    issue(issues, path, `must contain 1 to ${maximum} Unicode code points`);
    return undefined;
  }
  return constrained.canonical;
}

function optionalText(
  value: unknown,
  path: string,
  issues: ReviewContractIssue[],
): string | undefined {
  return value === undefined ? undefined : boundedText(value, path, MAX_REVIEW_TEXT_LENGTH, issues);
}

function positiveInteger(
  value: unknown,
  path: string,
  issues: ReviewContractIssue[],
): number | undefined {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    issue(issues, path, 'must be a positive safe integer');
    return undefined;
  }
  return value as number;
}

function uniqueValues(
  values: readonly string[],
  path: string,
  label: string,
  issues: ReviewContractIssue[],
): void {
  if (new Set(values).size !== values.length) issue(issues, path, `contains a duplicate ${label}`);
}

function uniqueOptionalValues(
  values: readonly (string | undefined)[],
  path: string,
  label: string,
  issues: ReviewContractIssue[],
): void {
  uniqueValues(
    values.filter((value): value is string => value !== undefined),
    path,
    label,
    issues,
  );
}

function isFeedbackKind(value: unknown): value is ReviewFeedbackKind {
  return (
    value === 'comment' || value === 'question' || value === 'change-request' || value === 'blocker'
  );
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function issue(issues: ReviewContractIssue[], path: string, message: string): void {
  if (issues.length < MAX_REVIEW_ISSUES) issues.push({ path, message });
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
