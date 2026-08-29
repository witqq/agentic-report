export const RESPONSE_CONTRACT_VERSION = 1 as const;
export const MAX_RESPONSE_FILE_BYTES = 2_000_000;
export const MAX_RESPONSE_FORMS = 20;
export const MAX_RESPONSE_QUESTIONS = 50;
export const MAX_RESPONSE_ITEMS = 250;
export const MAX_RESPONSE_OPTIONS = 20;
export const MAX_RESPONSE_TEXT_LENGTH = 4_000;
const RESPONSE_NUMBER_SCALE = 10_000;

const ID = /^[a-z][a-z0-9-]{0,63}$/u;
const SHA = /^sha256:[a-f0-9]{64}$/u;

export type ResponseQuestionKind =
  'bucket' | 'item-single' | 'item-multi' | 'single' | 'order' | 'number' | 'text';

export interface ResponseBucketDefinition {
  readonly id: string;
  readonly label: string;
}

export interface ResponseOptionDefinition {
  readonly id: string;
  readonly label: string;
}

export interface ResponseItemDefinition {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly meta: string;
  readonly href: string;
  readonly bucket?: string;
  readonly comment: boolean;
}

export interface ResponseQuestionDefinition {
  readonly id: string;
  readonly kind: ResponseQuestionKind;
  readonly title: string;
  readonly prompt?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly step?: number;
  readonly buckets: readonly ResponseBucketDefinition[];
  readonly options: readonly ResponseOptionDefinition[];
  readonly items: readonly ResponseItemDefinition[];
}

export interface ResponseFormManifest {
  readonly contractVersion: typeof RESPONSE_CONTRACT_VERSION;
  readonly id: string;
  readonly title: string;
  readonly revision: string;
  readonly questions: readonly ResponseQuestionDefinition[];
}

export type ResponseAnswerValue =
  | null
  | string
  | readonly string[]
  | readonly { readonly itemId: string; readonly bucketId: string | null }[]
  | readonly { readonly itemId: string; readonly optionId: string | null }[]
  | readonly { readonly itemId: string; readonly optionIds: readonly string[] }[]
  | readonly { readonly itemId: string; readonly value: number | null }[];

export interface ResponseAnswer {
  readonly id: string;
  readonly kind: ResponseQuestionKind;
  readonly answered: boolean;
  readonly value: ResponseAnswerValue;
}

export interface ResponseItemComment {
  readonly questionId: string;
  readonly itemId: string;
  readonly text: string;
}

export interface ResponseArtifact {
  readonly contractVersion: typeof RESPONSE_CONTRACT_VERSION;
  readonly form: { readonly id: string; readonly revision: string };
  readonly answers: readonly ResponseAnswer[];
  readonly comments: readonly ResponseItemComment[];
}

export interface ResponseContractIssue {
  readonly path: string;
  readonly message: string;
}

export class ResponseContractError extends Error {
  public constructor(
    public readonly issues: readonly ResponseContractIssue[],
    public readonly unsupportedVersion = false,
  ) {
    super(
      unsupportedVersion
        ? `Unsupported response contract version. Expected ${RESPONSE_CONTRACT_VERSION}.`
        : 'Response artifact does not satisfy the response contract.',
    );
    this.name = 'ResponseContractError';
  }
}

export function parseResponseFormManifest(input: unknown): ResponseFormManifest {
  const issues: ResponseContractIssue[] = [];
  const record = object(input, '$', issues);
  if (!record) throw new ResponseContractError(issues);
  exact(record, ['contractVersion', 'id', 'title', 'revision', 'questions'], '$', issues);
  version(record.contractVersion, '$.contractVersion');
  const id = identifier(record.id, '$.id', issues);
  const title = text(record.title, '$.title', 200, issues);
  const revision = fingerprint(record.revision, '$.revision', issues);
  const questions: ResponseQuestionDefinition[] = [];
  if (!Array.isArray(record.questions)) add(issues, '$.questions', 'must be an array');
  else if (record.questions.length < 1 || record.questions.length > MAX_RESPONSE_QUESTIONS)
    add(issues, '$.questions', `must contain 1 to ${MAX_RESPONSE_QUESTIONS} questions`);
  else
    record.questions.forEach((value, index) => {
      const parsed = question(value, `$.questions[${index}]`, issues);
      if (parsed) questions.push(parsed);
    });
  unique(
    questions.map((entry) => entry.id),
    '$.questions',
    'question id',
    issues,
  );
  if (!id || !title || !revision || issues.length > 0) throw new ResponseContractError(issues);
  return {
    contractVersion: RESPONSE_CONTRACT_VERSION,
    id,
    title,
    revision,
    questions,
  };
}

export function parseResponseArtifact(
  input: unknown,
  manifest: ResponseFormManifest,
): ResponseArtifact {
  const formManifest = parseResponseFormManifest(manifest);
  const issues: ResponseContractIssue[] = [];
  const record = object(input, '$', issues);
  if (!record) throw new ResponseContractError(issues);
  exact(record, ['contractVersion', 'form', 'answers', 'comments'], '$', issues);
  version(record.contractVersion, '$.contractVersion');
  const form = object(record.form, '$.form', issues);
  if (form) exact(form, ['id', 'revision'], '$.form', issues);
  const formId = identifier(form?.id, '$.form.id', issues);
  const revision = fingerprint(form?.revision, '$.form.revision', issues);
  if (formId && formId !== formManifest.id) add(issues, '$.form.id', 'does not match this form');
  if (revision && revision !== formManifest.revision)
    add(issues, '$.form.revision', 'does not match this form revision');

  const answers: ResponseAnswer[] = [];
  if (!Array.isArray(record.answers)) add(issues, '$.answers', 'must be an array');
  else if (record.answers.length !== formManifest.questions.length)
    add(issues, '$.answers', 'must contain exactly one answer for every question');
  else
    record.answers.forEach((value, index) => {
      const definition = formManifest.questions[index];
      if (!definition) return;
      const parsed = answer(value, definition, `$.answers[${index}]`, issues);
      if (parsed) answers.push(parsed);
    });

  const comments: ResponseItemComment[] = [];
  if (!Array.isArray(record.comments)) add(issues, '$.comments', 'must be an array');
  else if (record.comments.length > MAX_RESPONSE_ITEMS)
    add(issues, '$.comments', `must contain at most ${MAX_RESPONSE_ITEMS} comments`);
  else
    record.comments.forEach((value, index) => {
      const parsed = comment(value, formManifest, `$.comments[${index}]`, issues);
      if (parsed) comments.push(parsed);
    });
  unique(
    comments.map((entry) => `${entry.questionId}\0${entry.itemId}`),
    '$.comments',
    'question/item comment',
    issues,
  );

  if (!formId || !revision || issues.length > 0) throw new ResponseContractError(issues);
  return {
    contractVersion: RESPONSE_CONTRACT_VERSION,
    form: { id: formId, revision },
    answers,
    comments,
  };
}

export function serializeResponseArtifact(
  input: ResponseArtifact,
  manifest: ResponseFormManifest,
): string {
  const artifact = parseResponseArtifact(input, manifest);
  return `${JSON.stringify({
    ...artifact,
    comments: [...artifact.comments].sort((left, right) =>
      compare(`${left.questionId}\0${left.itemId}`, `${right.questionId}\0${right.itemId}`),
    ),
  })}\n`;
}

function question(
  input: unknown,
  path: string,
  issues: ResponseContractIssue[],
): ResponseQuestionDefinition | undefined {
  const record = object(input, path, issues);
  if (!record) return;
  exact(
    record,
    ['id', 'kind', 'title', 'prompt', 'minimum', 'maximum', 'step', 'buckets', 'options', 'items'],
    path,
    issues,
    ['id', 'kind', 'title', 'buckets', 'options', 'items'],
  );
  const id = identifier(record.id, `${path}.id`, issues);
  const kind = questionKind(record.kind, `${path}.kind`, issues);
  const title = text(record.title, `${path}.title`, 200, issues);
  const prompt = optionalText(record.prompt, `${path}.prompt`, 500, issues);
  const minimum = optionalFinite(record.minimum, `${path}.minimum`, issues);
  const maximum = optionalFinite(record.maximum, `${path}.maximum`, issues);
  const step = optionalFinite(record.step, `${path}.step`, issues);
  const buckets = definitions(record.buckets, `${path}.buckets`, MAX_RESPONSE_OPTIONS, issues);
  const options = definitions(record.options, `${path}.options`, MAX_RESPONSE_OPTIONS, issues);
  const items = itemDefinitions(record.items, `${path}.items`, issues);
  if (kind)
    validateQuestionDomain(
      kind,
      {
        ...(minimum === undefined ? {} : { minimum }),
        ...(maximum === undefined ? {} : { maximum }),
        ...(step === undefined ? {} : { step }),
        buckets,
        options,
        items,
      },
      path,
      issues,
    );
  if (!id || !kind || !title) return;
  return {
    id,
    kind,
    title,
    ...(prompt === undefined ? {} : { prompt }),
    ...(minimum === undefined ? {} : { minimum }),
    ...(maximum === undefined ? {} : { maximum }),
    ...(step === undefined ? {} : { step }),
    buckets,
    options,
    items,
  };
}

function definitions(
  input: unknown,
  path: string,
  maximum: number,
  issues: ResponseContractIssue[],
): ResponseBucketDefinition[] {
  const values: ResponseBucketDefinition[] = [];
  if (!Array.isArray(input)) {
    add(issues, path, 'must be an array');
    return values;
  }
  if (input.length > maximum) add(issues, path, `must contain at most ${maximum} entries`);
  input.slice(0, maximum).forEach((value, index) => {
    const item = object(value, `${path}[${index}]`, issues);
    if (!item) return;
    exact(item, ['id', 'label'], `${path}[${index}]`, issues);
    const id = identifier(item.id, `${path}[${index}].id`, issues);
    const label = text(item.label, `${path}[${index}].label`, 200, issues);
    if (id && label) values.push({ id, label });
  });
  unique(
    values.map((entry) => entry.id),
    path,
    'id',
    issues,
  );
  return values;
}

function itemDefinitions(
  input: unknown,
  path: string,
  issues: ResponseContractIssue[],
): ResponseItemDefinition[] {
  const values: ResponseItemDefinition[] = [];
  if (!Array.isArray(input)) {
    add(issues, path, 'must be an array');
    return values;
  }
  if (input.length > MAX_RESPONSE_ITEMS)
    add(issues, path, `must contain at most ${MAX_RESPONSE_ITEMS} items`);
  input.slice(0, MAX_RESPONSE_ITEMS).forEach((value, index) => {
    const itemPath = `${path}[${index}]`;
    const record = object(value, itemPath, issues);
    if (!record) return;
    exact(record, ['id', 'label', 'note', 'meta', 'href', 'bucket', 'comment'], itemPath, issues, [
      'id',
      'label',
      'note',
      'meta',
      'href',
      'comment',
    ]);
    const id = identifier(record.id, `${itemPath}.id`, issues);
    const label = text(record.label, `${itemPath}.label`, 500, issues);
    const note = text(record.note, `${itemPath}.note`, 1_000, issues);
    const meta = text(record.meta, `${itemPath}.meta`, 500, issues);
    const href = text(record.href, `${itemPath}.href`, 500, issues);
    const bucket = optionalIdentifier(record.bucket, `${itemPath}.bucket`, issues);
    if (typeof record.comment !== 'boolean') add(issues, `${itemPath}.comment`, 'must be boolean');
    if (id && label && note && meta && href) {
      values.push({
        id,
        label,
        note,
        meta,
        href,
        ...(bucket === undefined ? {} : { bucket }),
        comment: record.comment === true,
      });
    }
  });
  unique(
    values.map((entry) => entry.id),
    path,
    'item id',
    issues,
  );
  return values;
}

function validateQuestionDomain(
  kind: ResponseQuestionKind,
  domain: {
    readonly minimum?: number;
    readonly maximum?: number;
    readonly step?: number;
    readonly buckets: readonly ResponseBucketDefinition[];
    readonly options: readonly ResponseOptionDefinition[];
    readonly items: readonly ResponseItemDefinition[];
  },
  path: string,
  issues: ResponseContractIssue[],
): void {
  const itemKind = ['bucket', 'item-single', 'item-multi', 'order', 'number'].includes(kind);
  if (itemKind && domain.items.length < 1)
    add(issues, `${path}.items`, 'must not be empty for this kind');
  if (!itemKind && domain.items.length > 0)
    add(issues, `${path}.items`, 'must be empty for this kind');
  if (kind === 'bucket') {
    if (domain.buckets.length < 2 || domain.buckets.length > 5)
      add(issues, `${path}.buckets`, 'must contain 2 to 5 buckets');
    const known = new Set(domain.buckets.map((entry) => entry.id));
    for (const item of domain.items)
      if (item.bucket !== undefined && !known.has(item.bucket))
        add(issues, `${path}.items`, `item ${item.id} references an unknown bucket`);
  } else if (domain.buckets.length > 0)
    add(issues, `${path}.buckets`, 'must be empty for this kind');
  if (['item-single', 'item-multi', 'single'].includes(kind)) {
    if (domain.options.length < 2)
      add(issues, `${path}.options`, 'must contain at least two options');
  } else if (domain.options.length > 0)
    add(issues, `${path}.options`, 'must be empty for this kind');
  if (kind === 'number') {
    if (domain.minimum === undefined || domain.maximum === undefined)
      add(issues, path, 'number questions require minimum and maximum');
    else if (domain.minimum > domain.maximum) add(issues, path, 'minimum must not exceed maximum');
    if (domain.step !== undefined && domain.step <= 0)
      add(issues, `${path}.step`, 'must be positive');
  } else if (
    domain.minimum !== undefined ||
    domain.maximum !== undefined ||
    domain.step !== undefined
  )
    add(issues, path, 'numeric bounds are supported only for number questions');
}

function answer(
  input: unknown,
  definition: ResponseQuestionDefinition,
  path: string,
  issues: ResponseContractIssue[],
): ResponseAnswer | undefined {
  const record = object(input, path, issues);
  if (!record) return;
  exact(record, ['id', 'kind', 'answered', 'value'], path, issues);
  if (record.id !== definition.id) add(issues, `${path}.id`, `must equal ${definition.id}`);
  if (record.kind !== definition.kind) add(issues, `${path}.kind`, `must equal ${definition.kind}`);
  if (typeof record.answered !== 'boolean') add(issues, `${path}.answered`, 'must be boolean');
  const value = answerValue(record.value, definition, `${path}.value`, issues);
  if (value === undefined) return;
  return { id: definition.id, kind: definition.kind, answered: record.answered === true, value };
}

function answerValue(
  input: unknown,
  definition: ResponseQuestionDefinition,
  path: string,
  issues: ResponseContractIssue[],
): ResponseAnswerValue | undefined {
  if (definition.kind === 'single') {
    if (input === null) return null;
    const id = identifier(input, path, issues);
    if (id && !definition.options.some((entry) => entry.id === id))
      add(issues, path, 'references an unknown option');
    return id;
  }
  if (definition.kind === 'text')
    return typeof input === 'string'
      ? normalizedText(input, path, issues)
      : invalidValue(path, issues);
  if (definition.kind === 'order') {
    if (!Array.isArray(input)) return invalidValue(path, issues);
    const ids = input.map((value, index) => identifier(value, `${path}[${index}]`, issues) ?? '');
    if (
      ids.length !== definition.items.length ||
      new Set(ids).size !== ids.length ||
      definition.items.some((item) => !ids.includes(item.id))
    )
      add(issues, path, 'must contain every item id exactly once');
    return ids;
  }
  if (!Array.isArray(input)) return invalidValue(path, issues);
  if (input.length !== definition.items.length)
    add(issues, path, 'must contain one value for every item');
  if (definition.kind === 'bucket')
    return itemRecords(
      input,
      definition,
      path,
      'bucketId',
      definition.buckets,
      issues,
    ) as readonly {
      readonly itemId: string;
      readonly bucketId: string | null;
    }[];
  if (definition.kind === 'item-single')
    return itemRecords(
      input,
      definition,
      path,
      'optionId',
      definition.options,
      issues,
    ) as readonly {
      readonly itemId: string;
      readonly optionId: string | null;
    }[];
  if (definition.kind === 'item-multi') {
    return input.map((value, index) => {
      const recordPath = `${path}[${index}]`;
      const record = object(value, recordPath, issues) ?? {};
      exact(record, ['itemId', 'optionIds'], recordPath, issues);
      const expected = definition.items[index];
      if (record.itemId !== expected?.id)
        add(issues, `${recordPath}.itemId`, `must equal ${expected?.id ?? 'the authored item'}`);
      if (!Array.isArray(record.optionIds)) {
        add(issues, `${recordPath}.optionIds`, 'must be an array');
        return { itemId: expected?.id ?? '', optionIds: [] };
      }
      const optionIds = record.optionIds.map(
        (entry, optionIndex) =>
          identifier(entry, `${recordPath}.optionIds[${optionIndex}]`, issues) ?? '',
      );
      if (
        new Set(optionIds).size !== optionIds.length ||
        optionIds.some((id) => !definition.options.some((option) => option.id === id))
      )
        add(issues, `${recordPath}.optionIds`, 'must contain unique known option ids');
      return { itemId: expected?.id ?? '', optionIds };
    });
  }
  return input.map((value, index) => {
    const recordPath = `${path}[${index}]`;
    const record = object(value, recordPath, issues) ?? {};
    exact(record, ['itemId', 'value'], recordPath, issues);
    const expected = definition.items[index];
    if (record.itemId !== expected?.id)
      add(issues, `${recordPath}.itemId`, `must equal ${expected?.id ?? 'the authored item'}`);
    if (record.value !== null && typeof record.value !== 'number')
      add(issues, `${recordPath}.value`, 'must be a number or null');
    const number = typeof record.value === 'number' ? record.value : null;
    if (
      number !== null &&
      (!Number.isFinite(number) ||
        number < (definition.minimum ?? number) ||
        number > (definition.maximum ?? number))
    )
      add(issues, `${recordPath}.value`, 'is outside the authored numeric range');
    else if (
      number !== null &&
      definition.minimum !== undefined &&
      definition.step !== undefined &&
      !isStepAligned(number, definition.minimum, definition.step)
    )
      add(issues, `${recordPath}.value`, 'does not align with the authored numeric step');
    return { itemId: expected?.id ?? '', value: number };
  });
}

function isStepAligned(value: number, minimum: number, step: number): boolean {
  const scaledValue = scaledResponseNumber(value);
  const scaledMinimum = scaledResponseNumber(minimum);
  const scaledStep = scaledResponseNumber(step);
  return (
    scaledValue !== undefined &&
    scaledMinimum !== undefined &&
    scaledStep !== undefined &&
    scaledStep > 0 &&
    (scaledValue - scaledMinimum) % scaledStep === 0
  );
}

function scaledResponseNumber(value: number): number | undefined {
  const fixed = value.toFixed(4);
  if (Number(fixed) !== value) return;
  const negative = fixed.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? fixed.slice(1) : fixed).split('.');
  const scaled = Number(whole) * RESPONSE_NUMBER_SCALE + Number(fraction.padEnd(4, '0'));
  if (!Number.isSafeInteger(scaled)) return;
  return negative ? -scaled : scaled;
}

function itemRecords(
  input: readonly unknown[],
  definition: ResponseQuestionDefinition,
  path: string,
  valueKey: 'bucketId' | 'optionId',
  domain: readonly { readonly id: string }[],
  issues: ResponseContractIssue[],
): readonly Readonly<Record<string, string | null>>[] {
  return input.map((value, index) => {
    const recordPath = `${path}[${index}]`;
    const record = object(value, recordPath, issues) ?? {};
    exact(record, ['itemId', valueKey], recordPath, issues);
    const expected = definition.items[index];
    if (record.itemId !== expected?.id)
      add(issues, `${recordPath}.itemId`, `must equal ${expected?.id ?? 'the authored item'}`);
    const selected = record[valueKey];
    if (
      selected !== null &&
      (typeof selected !== 'string' || !domain.some((entry) => entry.id === selected))
    )
      add(issues, `${recordPath}.${valueKey}`, 'must be null or a known id');
    return {
      itemId: expected?.id ?? '',
      [valueKey]: typeof selected === 'string' ? selected : null,
    };
  });
}

function comment(
  input: unknown,
  manifest: ResponseFormManifest,
  path: string,
  issues: ResponseContractIssue[],
): ResponseItemComment | undefined {
  const record = object(input, path, issues);
  if (!record) return;
  exact(record, ['questionId', 'itemId', 'text'], path, issues);
  const questionId = identifier(record.questionId, `${path}.questionId`, issues);
  const itemId = identifier(record.itemId, `${path}.itemId`, issues);
  const value = normalizedText(record.text, `${path}.text`, issues);
  const questionDefinition = manifest.questions.find((entry) => entry.id === questionId);
  const itemDefinition = questionDefinition?.items.find((entry) => entry.id === itemId);
  if (!itemDefinition?.comment) add(issues, path, 'does not reference a comment-enabled item');
  if (!questionId || !itemId || !value) return;
  return { questionId, itemId, text: value };
}

function questionKind(
  input: unknown,
  path: string,
  issues: ResponseContractIssue[],
): ResponseQuestionKind | undefined {
  const values: readonly ResponseQuestionKind[] = [
    'bucket',
    'item-single',
    'item-multi',
    'single',
    'order',
    'number',
    'text',
  ];
  if (typeof input === 'string' && values.includes(input as ResponseQuestionKind))
    return input as ResponseQuestionKind;
  add(issues, path, `must be one of ${values.join(', ')}`);
  return;
}

function version(input: unknown, path: string): void {
  if (input !== RESPONSE_CONTRACT_VERSION)
    throw new ResponseContractError(
      [{ path, message: `must equal ${RESPONSE_CONTRACT_VERSION}` }],
      true,
    );
}

function object(
  input: unknown,
  path: string,
  issues: ResponseContractIssue[],
): Readonly<Record<string, unknown>> | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    add(issues, path, 'must be an object');
    return;
  }
  const prototype = Object.getPrototypeOf(input) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    add(issues, path, 'must be a plain object');
    return;
  }
  return input as Readonly<Record<string, unknown>>;
}

function exact(
  input: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  path: string,
  issues: ResponseContractIssue[],
  required: readonly string[] = allowed,
): void {
  for (const key of Object.keys(input))
    if (!allowed.includes(key)) add(issues, `${path}.${key}`, 'is not allowed');
  for (const key of required)
    if (!Object.hasOwn(input, key)) add(issues, `${path}.${key}`, 'is required');
}

function identifier(
  input: unknown,
  path: string,
  issues: ResponseContractIssue[],
): string | undefined {
  if (typeof input === 'string' && ID.test(input)) return input;
  add(issues, path, 'must be a lowercase stable identifier');
  return;
}

function optionalIdentifier(
  input: unknown,
  path: string,
  issues: ResponseContractIssue[],
): string | undefined {
  return input === undefined ? undefined : identifier(input, path, issues);
}

function fingerprint(
  input: unknown,
  path: string,
  issues: ResponseContractIssue[],
): string | undefined {
  if (typeof input === 'string' && SHA.test(input)) return input;
  add(issues, path, 'must be a sha256 fingerprint');
  return;
}

function text(
  input: unknown,
  path: string,
  maximum: number,
  issues: ResponseContractIssue[],
): string | undefined {
  if (typeof input !== 'string') {
    add(issues, path, 'must be a string');
    return;
  }
  const value = input.trim().normalize('NFC');
  if (value.length < 1 || [...value].length > maximum) {
    add(issues, path, `must contain 1 to ${maximum} characters`);
    return;
  }
  return value;
}

function optionalText(
  input: unknown,
  path: string,
  maximum: number,
  issues: ResponseContractIssue[],
): string | undefined {
  return input === undefined ? undefined : text(input, path, maximum, issues);
}

function normalizedText(
  input: unknown,
  path: string,
  issues: ResponseContractIssue[],
): string | undefined {
  if (typeof input !== 'string') return invalidValue(path, issues);
  const value = input.trim().normalize('NFC');
  if ([...value].length > MAX_RESPONSE_TEXT_LENGTH) {
    add(issues, path, `must contain at most ${MAX_RESPONSE_TEXT_LENGTH} characters`);
    return;
  }
  return value;
}

function optionalFinite(
  input: unknown,
  path: string,
  issues: ResponseContractIssue[],
): number | undefined {
  if (input === undefined) return;
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  add(issues, path, 'must be a finite number');
  return;
}

function invalidValue(path: string, issues: ResponseContractIssue[]): undefined {
  add(issues, path, 'has an invalid value for this question kind');
  return;
}

function unique(
  values: readonly string[],
  path: string,
  label: string,
  issues: ResponseContractIssue[],
): void {
  if (new Set(values).size !== values.length) add(issues, path, `contains a duplicate ${label}`);
}

function add(issues: ResponseContractIssue[], path: string, message: string): void {
  if (issues.length < 100) issues.push({ path, message });
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
