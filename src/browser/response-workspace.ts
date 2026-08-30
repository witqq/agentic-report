import {
  MAX_RESPONSE_FILE_BYTES,
  MAX_RESPONSE_TEXT_LENGTH,
  RESPONSE_CONTRACT_VERSION,
  ResponseContractError,
  parseResponseArtifact,
  parseResponseFormManifest,
  serializeResponseArtifact,
  type ResponseAnswer,
  type ResponseArtifact,
  type ResponseFormManifest,
  type ResponseItemDefinition,
  type ResponseQuestionDefinition,
} from '../response/contract.js';
import { packageStrings, type PackageStrings } from '../localization.js';

class ResponseImportError extends Error {}

const RESPONSE_DRAG_TYPE = 'application/x-agentic-response-item';

export function installResponseWorkspaces(): void {
  const strings = packageStrings(document.documentElement.dataset.packageLocale);
  for (const root of document.querySelectorAll<HTMLElement>('[data-response-workspace]')) {
    const template = root.querySelector<HTMLElement>('[data-response-manifest]');
    const mount = root.querySelector<HTMLElement>('[data-response-mount]');
    if (!template || !mount) continue;
    try {
      const manifest = parseResponseFormManifest(JSON.parse(template.textContent ?? '') as unknown);
      createController(mount, manifest, strings);
    } catch {
      root.dataset.responseUnavailable = '';
    }
  }
}

function createController(
  mount: HTMLElement,
  manifest: ResponseFormManifest,
  strings: PackageStrings,
): void {
  const answered = new Set<string>();
  let draggedItem: HTMLElement | undefined;
  const status = document.createElement('output');
  status.className = 'response-status';
  status.dataset.responseStatus = '';
  status.setAttribute('aria-live', 'polite');
  const questions = document.createElement('div');
  questions.className = 'response-question-list';
  questions.dataset.responseQuestions = '';
  for (const question of manifest.questions)
    questions.append(renderQuestion(manifest.id, question, strings));
  const actions = document.createElement('div');
  actions.className = 'response-actions';
  const copy = button(strings.copyResponse, 'responseCopy');
  const download = button(strings.downloadResponse, 'responseDownload');
  const importLabel = document.createElement('label');
  importLabel.className = 'response-file-action';
  importLabel.textContent = strings.importResponse;
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json,.json';
  importInput.dataset.responseImport = '';
  importLabel.append(importInput);
  actions.append(copy, download, importLabel);
  mount.replaceChildren(questions, actions, status);

  mount.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    if (!target.matches('[data-response-comment]')) markAnswered(target);
  });
  mount.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof HTMLSelectElement && target.matches('[data-response-bucket-select]')) {
      const item = target.closest<HTMLElement>('[data-response-item]');
      const question = target.closest<HTMLElement>('[data-response-question]');
      if (item && question) moveBucketItem(question, item, target.value);
    }
    if (target instanceof HTMLInputElement && target.matches('[data-response-import]')) {
      void importArtifact(target);
      return;
    }
    if (target instanceof Element && !target.matches('[data-response-comment]'))
      markAnswered(target);
  });
  mount.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const move = target.closest<HTMLButtonElement>('[data-response-order-move]');
    if (move) {
      const item = move.closest<HTMLLIElement>('[data-response-order-item]');
      const list = item?.parentElement;
      if (item && list) {
        const direction = move.dataset.responseOrderMove;
        const sibling = direction === 'up' ? item.previousElementSibling : item.nextElementSibling;
        if (sibling instanceof HTMLLIElement) {
          direction === 'up' ? list.insertBefore(item, sibling) : list.insertBefore(sibling, item);
          markAnswered(move);
          move.focus();
        }
      }
      return;
    }
    if (target.closest('[data-response-copy]')) void copyArtifact();
    else if (target.closest('[data-response-download]')) downloadArtifact();
  });
  mount.addEventListener('dragstart', (event) => {
    const item =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-response-item]')
        : null;
    const question = item?.closest<HTMLElement>('[data-response-question]');
    const itemId = item?.dataset.responseItem;
    const questionId = question?.dataset.responseQuestion;
    if (!item || !itemId || !questionId || !event.dataTransfer) return;
    draggedItem = item;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(RESPONSE_DRAG_TYPE, itemId);
  });
  mount.addEventListener('dragover', (event) => {
    const column =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-response-bucket-column]')
        : null;
    const question = column?.closest<HTMLElement>('[data-response-question]');
    if (
      !question ||
      !draggedItem ||
      draggedItem.closest<HTMLElement>('[data-response-question]') !== question
    )
      return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  });
  mount.addEventListener('drop', (event) => {
    const column =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-response-bucket-column]')
        : null;
    if (!column || !event.dataTransfer) return;
    const question = column.closest<HTMLElement>('[data-response-question]');
    if (
      !question ||
      !draggedItem ||
      draggedItem.closest<HTMLElement>('[data-response-question]') !== question ||
      event.dataTransfer.getData(RESPONSE_DRAG_TYPE) !== draggedItem.dataset.responseItem
    )
      return;
    event.preventDefault();
    if (draggedItem) {
      moveBucketItem(question, draggedItem, column.dataset.responseBucketColumn ?? '');
      markAnswered(question);
    }
    draggedItem = undefined;
  });
  mount.addEventListener('dragend', () => {
    draggedItem = undefined;
  });

  function markAnswered(target: Element): void {
    const question = target.closest<HTMLElement>('[data-response-question]');
    const id = question?.dataset.responseQuestion;
    if (!id) return;
    answered.add(id);
    question.dataset.responseAnswered = 'true';
    const state = question.querySelector<HTMLElement>('[data-response-answer-state]');
    if (state) state.hidden = true;
  }

  function currentArtifact(): ResponseArtifact {
    const answers = manifest.questions.map((question) => readAnswer(questions, question, answered));
    const comments = [
      ...questions.querySelectorAll<HTMLTextAreaElement>('[data-response-comment]'),
    ].flatMap((input) => {
      const text = input.value.trim().normalize('NFC');
      const questionId = input.dataset.responseQuestion;
      const itemId = input.dataset.responseItem;
      return !text || !questionId || !itemId ? [] : [{ questionId, itemId, text }];
    });
    return parseResponseArtifact(
      {
        contractVersion: RESPONSE_CONTRACT_VERSION,
        form: { id: manifest.id, revision: manifest.revision },
        answers,
        comments,
      },
      manifest,
    );
  }

  function serialized(): string {
    return serializeResponseArtifact(currentArtifact(), manifest);
  }

  async function copyArtifact(): Promise<void> {
    const value = exportValue();
    if (value === undefined) return;
    try {
      await navigator.clipboard.writeText(value);
      showStatus(strings.responseCopied, false);
    } catch {
      showStatus(strings.responseCopyUnavailable, true);
    }
  }

  function downloadArtifact(): void {
    const value = exportValue();
    if (value === undefined) return;
    const url = URL.createObjectURL(new Blob([value], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `response-${manifest.id}.json`;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    showStatus('', false);
  }

  function exportValue(): string | undefined {
    const invalid = questions.querySelector<HTMLInputElement>('[data-response-number]:invalid');
    if (invalid) {
      invalid.focus();
      showStatus(strings.responseInvalidValues, true);
      return;
    }
    try {
      return serialized();
    } catch (error) {
      if (!(error instanceof ResponseContractError)) throw error;
      showStatus(strings.responseInvalidValues, true);
      return;
    }
  }

  async function importArtifact(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      if (file.size > MAX_RESPONSE_FILE_BYTES)
        throw new ResponseImportError(strings.responseFileTooLarge(MAX_RESPONSE_FILE_BYTES));
      const artifact = parseResponseArtifact(JSON.parse(await file.text()) as unknown, manifest);
      applyArtifact(questions, manifest, artifact, answered);
      showStatus(strings.responseReady, false);
    } catch (error) {
      showStatus(
        error instanceof ResponseContractError && error.unsupportedVersion
          ? strings.responseUnsupported
          : error instanceof ResponseContractError &&
              error.issues.some((issue) => issue.path.startsWith('$.form'))
            ? strings.responseDifferentForm
            : error instanceof ResponseImportError
              ? error.message
              : strings.responseImportFailed,
        true,
      );
    }
  }

  function showStatus(message: string, error: boolean): void {
    status.textContent = message;
    status.toggleAttribute('data-response-error', error);
  }
}

function renderQuestion(
  formId: string,
  question: ResponseQuestionDefinition,
  strings: PackageStrings,
): HTMLElement {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'response-question';
  fieldset.dataset.responseQuestion = question.id;
  fieldset.dataset.responseKind = question.kind;
  fieldset.dataset.responseAnswered = 'false';
  const legend = document.createElement('legend');
  legend.textContent = question.title;
  fieldset.append(legend);
  if (question.prompt) fieldset.append(textElement('p', 'response-prompt', question.prompt));
  const state = textElement('span', 'response-answer-state', strings.unanswered);
  state.dataset.responseAnswerState = '';
  fieldset.append(state);
  if (question.kind === 'bucket') fieldset.append(renderBucketQuestion(question, strings));
  else if (question.kind === 'single') fieldset.append(renderGlobalSingle(formId, question));
  else if (question.kind === 'text') fieldset.append(renderGlobalText(question));
  else if (question.kind === 'order') fieldset.append(renderOrderQuestion(question, strings));
  else fieldset.append(renderItemQuestion(formId, question, strings));
  return fieldset;
}

function renderBucketQuestion(
  question: ResponseQuestionDefinition,
  strings: PackageStrings,
): HTMLElement {
  const board = document.createElement('div');
  board.className = 'response-bucket-board';
  board.dataset.responseBucketBoard = '';
  for (const bucket of [{ id: '', label: strings.unassigned }, ...question.buckets]) {
    const column = document.createElement('section');
    column.className = 'response-bucket-column';
    column.dataset.responseBucketColumn = bucket.id;
    column.append(textElement('h4', 'response-bucket-title', bucket.label));
    const list = document.createElement('div');
    list.className = 'response-bucket-items';
    list.dataset.responseBucketItems = '';
    column.append(list);
    board.append(column);
  }
  for (const item of question.items) {
    const card = renderItemCard(question, item, strings);
    card.draggable = true;
    const select = document.createElement('select');
    select.dataset.responseBucketSelect = '';
    select.setAttribute('aria-label', strings.assignTo(item.label));
    for (const bucket of [{ id: '', label: strings.unassigned }, ...question.buckets]) {
      const option = document.createElement('option');
      option.value = bucket.id;
      option.textContent = bucket.label;
      option.selected = bucket.id === (item.bucket ?? '');
      select.append(option);
    }
    card.append(select);
    const column = board.querySelector<HTMLElement>(
      `[data-response-bucket-column="${CSS.escape(item.bucket ?? '')}"] [data-response-bucket-items]`,
    );
    column?.append(card);
  }
  return board;
}

function moveBucketItem(question: HTMLElement, item: HTMLElement, bucketId: string): void {
  const target = question.querySelector<HTMLElement>(
    `[data-response-bucket-column="${CSS.escape(bucketId)}"] [data-response-bucket-items]`,
  );
  if (!target) return;
  target.append(item);
  const select = item.querySelector<HTMLSelectElement>('[data-response-bucket-select]');
  if (select) select.value = bucketId;
}

function renderGlobalSingle(formId: string, question: ResponseQuestionDefinition): HTMLElement {
  const group = document.createElement('div');
  group.className = 'response-choice-list';
  for (const option of question.options) {
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `response-${formId}-${question.id}`;
    input.value = option.id;
    input.dataset.responseGlobalSingle = '';
    group.append(labelledControl(input, option.label));
  }
  return group;
}

function renderGlobalText(question: ResponseQuestionDefinition): HTMLElement {
  const input = document.createElement('textarea');
  input.maxLength = MAX_RESPONSE_TEXT_LENGTH;
  input.dataset.responseGlobalText = '';
  input.setAttribute('aria-label', question.title);
  return input;
}

function renderOrderQuestion(
  question: ResponseQuestionDefinition,
  strings: PackageStrings,
): HTMLElement {
  const list = document.createElement('ol');
  list.className = 'response-order-list';
  list.dataset.responseOrderList = '';
  for (const item of question.items) {
    const row = document.createElement('li');
    row.dataset.responseOrderItem = item.id;
    row.append(renderItemCard(question, item, strings));
    const actions = document.createElement('div');
    actions.className = 'response-item-actions';
    const up = button(strings.moveUp, 'responseOrderMove');
    up.dataset.responseOrderMove = 'up';
    const down = button(strings.moveDown, 'responseOrderMove');
    down.dataset.responseOrderMove = 'down';
    actions.append(up, down);
    row.append(actions);
    list.append(row);
  }
  return list;
}

function renderItemQuestion(
  formId: string,
  question: ResponseQuestionDefinition,
  strings: PackageStrings,
): HTMLElement {
  const list = document.createElement('div');
  list.className = 'response-item-list';
  for (const item of question.items) {
    const card = renderItemCard(question, item, strings);
    if (question.kind === 'number') {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = String(question.minimum);
      input.max = String(question.maximum);
      if (question.step !== undefined) input.step = String(question.step);
      input.dataset.responseNumber = '';
      input.setAttribute('aria-label', item.label);
      card.append(input);
    } else {
      const choices = document.createElement('div');
      choices.className = 'response-choice-list';
      for (const option of question.options) {
        const input = document.createElement('input');
        input.type = question.kind === 'item-multi' ? 'checkbox' : 'radio';
        input.name = `response-${formId}-${question.id}-${item.id}`;
        input.value = option.id;
        input.dataset.responseItemChoice = '';
        choices.append(labelledControl(input, option.label));
      }
      card.append(choices);
    }
    list.append(card);
  }
  return list;
}

function renderItemCard(
  question: ResponseQuestionDefinition,
  item: ResponseItemDefinition,
  strings: PackageStrings,
): HTMLElement {
  const card = document.createElement('article');
  card.className = 'response-item';
  card.dataset.responseItem = item.id;
  card.append(textElement('h4', 'response-item-label', item.label));
  card.append(textElement('p', 'response-item-note', item.note));
  card.append(textElement('p', 'response-item-meta', item.meta));
  const link = document.createElement('a');
  link.href = item.href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = strings.openOriginal;
  link.dataset.responseOriginal = '';
  card.append(link);
  if (item.comment) {
    const input = document.createElement('textarea');
    input.maxLength = MAX_RESPONSE_TEXT_LENGTH;
    input.dataset.responseComment = '';
    input.dataset.responseQuestion = question.id;
    input.dataset.responseItem = item.id;
    input.setAttribute('aria-label', `${strings.itemComment}: ${item.label}`);
    card.append(labelledControl(input, strings.itemComment));
  }
  return card;
}

function readAnswer(
  root: HTMLElement,
  question: ResponseQuestionDefinition,
  answered: ReadonlySet<string>,
): ResponseAnswer {
  const element = root.querySelector<HTMLElement>(
    `[data-response-question="${CSS.escape(question.id)}"]`,
  );
  if (!element) throw new Error(`Response question is missing: ${question.id}.`);
  let value: ResponseAnswer['value'];
  if (question.kind === 'bucket')
    value = question.items.map((item) => ({
      itemId: item.id,
      bucketId:
        element
          .querySelector<HTMLElement>(`[data-response-item="${CSS.escape(item.id)}"]`)
          ?.closest<HTMLElement>('[data-response-bucket-column]')?.dataset.responseBucketColumn ||
        null,
    }));
  else if (question.kind === 'item-single')
    value = question.items.map((item) => ({
      itemId: item.id,
      optionId:
        element.querySelector<HTMLInputElement>(
          `[data-response-item="${CSS.escape(item.id)}"] [data-response-item-choice]:checked`,
        )?.value ?? null,
    }));
  else if (question.kind === 'item-multi')
    value = question.items.map((item) => ({
      itemId: item.id,
      optionIds: [
        ...element.querySelectorAll<HTMLInputElement>(
          `[data-response-item="${CSS.escape(item.id)}"] [data-response-item-choice]:checked`,
        ),
      ].map((input) => input.value),
    }));
  else if (question.kind === 'single')
    value =
      element.querySelector<HTMLInputElement>('[data-response-global-single]:checked')?.value ??
      null;
  else if (question.kind === 'order')
    value = [...element.querySelectorAll<HTMLElement>('[data-response-order-item]')].map(
      (item) => item.dataset.responseOrderItem ?? '',
    );
  else if (question.kind === 'number')
    value = question.items.map((item) => {
      const raw = element.querySelector<HTMLInputElement>(
        `[data-response-item="${CSS.escape(item.id)}"] [data-response-number]`,
      )?.value;
      return { itemId: item.id, value: raw ? Number(raw) : null };
    });
  else
    value =
      element
        .querySelector<HTMLTextAreaElement>('[data-response-global-text]')
        ?.value.trim()
        .normalize('NFC') ?? '';
  return { id: question.id, kind: question.kind, answered: answered.has(question.id), value };
}

function applyArtifact(
  root: HTMLElement,
  manifest: ResponseFormManifest,
  artifact: ResponseArtifact,
  answered: Set<string>,
): void {
  answered.clear();
  for (const answer of artifact.answers) {
    const question = manifest.questions.find((entry) => entry.id === answer.id);
    const element = root.querySelector<HTMLElement>(
      `[data-response-question="${CSS.escape(answer.id)}"]`,
    );
    if (!question || !element) continue;
    if (answer.answered) answered.add(answer.id);
    element.dataset.responseAnswered = String(answer.answered);
    const state = element.querySelector<HTMLElement>('[data-response-answer-state]');
    if (state) state.hidden = answer.answered;
    if (question.kind === 'bucket' && Array.isArray(answer.value)) {
      for (const entry of answer.value as readonly { itemId: string; bucketId: string | null }[]) {
        const item = element.querySelector<HTMLElement>(
          `[data-response-item="${CSS.escape(entry.itemId)}"]`,
        );
        if (item) moveBucketItem(element, item, entry.bucketId ?? '');
      }
    } else if (question.kind === 'single') {
      for (const input of element.querySelectorAll<HTMLInputElement>(
        '[data-response-global-single]',
      ))
        input.checked = false;
      const input =
        typeof answer.value === 'string'
          ? element.querySelector<HTMLInputElement>(
              `[data-response-global-single][value="${CSS.escape(answer.value)}"]`,
            )
          : null;
      if (input) input.checked = true;
    } else if (question.kind === 'text') {
      const input = element.querySelector<HTMLTextAreaElement>('[data-response-global-text]');
      if (input && typeof answer.value === 'string') input.value = answer.value;
    } else if (question.kind === 'order' && Array.isArray(answer.value)) {
      const list = element.querySelector<HTMLElement>('[data-response-order-list]');
      for (const id of answer.value as readonly string[]) {
        const item = element.querySelector<HTMLElement>(
          `[data-response-order-item="${CSS.escape(id)}"]`,
        );
        if (list && item) list.append(item);
      }
    } else if (question.kind === 'number' && Array.isArray(answer.value)) {
      for (const entry of answer.value as readonly { itemId: string; value: number | null }[]) {
        const input = element.querySelector<HTMLInputElement>(
          `[data-response-item="${CSS.escape(entry.itemId)}"] [data-response-number]`,
        );
        if (input) input.value = entry.value === null ? '' : String(entry.value);
      }
    } else if (Array.isArray(answer.value)) {
      for (const entry of answer.value as readonly {
        itemId: string;
        optionId?: string | null;
        optionIds?: readonly string[];
      }[]) {
        const selected = entry.optionIds ?? (entry.optionId ? [entry.optionId] : []);
        for (const input of element.querySelectorAll<HTMLInputElement>(
          `[data-response-item="${CSS.escape(entry.itemId)}"] [data-response-item-choice]`,
        ))
          input.checked = selected.includes(input.value);
      }
    }
  }
  for (const input of root.querySelectorAll<HTMLTextAreaElement>('[data-response-comment]'))
    input.value = '';
  for (const comment of artifact.comments) {
    const input = root.querySelector<HTMLTextAreaElement>(
      `[data-response-comment][data-response-question="${CSS.escape(comment.questionId)}"][data-response-item="${CSS.escape(comment.itemId)}"]`,
    );
    if (input) input.value = comment.text;
  }
}

function labelledControl<T extends HTMLElement>(control: T, label: string): HTMLLabelElement {
  const owner = document.createElement('label');
  owner.append(control, document.createTextNode(label));
  return owner;
}

function button(label: string, dataName: string): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  control.dataset[dataName] = '';
  return control;
}

function textElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}
