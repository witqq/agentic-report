import {
  ARROW_DOWN_ICON,
  ARROW_UP_ICON,
  COPY_ICON,
  DOWNLOAD_ICON,
  PLUS_ICON,
  UPLOAD_ICON,
  WINDOW_ICON,
} from '../iconography.js';
import { asUi, asUiButton, type UiButtonVariant, type UiSize } from './ui.js';
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
import { browserIcon } from './icon.js';
import { contentElements } from './features.js';

class ResponseImportError extends Error {}

const RESPONSE_DRAG_TYPE = 'application/x-agentic-response-item';
let controlInstance = 0;

export interface ResponseWorkspacesController {
  readonly snapshot: () => ReadonlyMap<string, ResponseArtifact>;
  readonly destroy: () => void;
}

interface ResponseWorkspaceController {
  readonly id: string;
  readonly snapshot: () => ResponseArtifact;
  readonly destroy: () => void;
}

export function installResponseWorkspaces(
  page: HTMLElement = document.body,
  initial: ReadonlyMap<string, ResponseArtifact> = new Map(),
): ResponseWorkspacesController {
  const strings = packageStrings(
    page.closest<HTMLElement>('[data-localized-page-variant]')?.dataset.pagePackageLocale ??
      page.dataset.pagePackageLocale,
  );
  const controllers: ResponseWorkspaceController[] = [];
  for (const root of contentElements<HTMLElement>(page, '[data-response-workspace]')) {
    const template = root.querySelector<HTMLElement>('[data-response-manifest]');
    const mount = root.querySelector<HTMLElement>('[data-response-mount]');
    if (!template || !mount) continue;
    try {
      const manifest = parseResponseFormManifest(JSON.parse(template.textContent ?? '') as unknown);
      controllers.push(createController(mount, manifest, strings, initial.get(manifest.id)));
    } catch {
      root.dataset.responseUnavailable = '';
    }
  }
  return {
    snapshot: () =>
      new Map(controllers.map((controller) => [controller.id, controller.snapshot()])),
    destroy: () =>
      controllers.forEach((controller) => {
        controller.destroy();
      }),
  };
}

function createController(
  mount: HTMLElement,
  manifest: ResponseFormManifest,
  strings: PackageStrings,
  initial: ResponseArtifact | undefined,
): ResponseWorkspaceController {
  const abort = new AbortController();
  const answered = new Set<string>();
  let draggedItem: HTMLElement | undefined;
  const status = document.createElement('output');
  status.className = 'response-status ui-meta';
  status.dataset.responseStatus = '';
  status.setAttribute('aria-live', 'polite');
  const questions = document.createElement('div');
  questions.className = 'response-question-list';
  questions.dataset.responseQuestions = '';
  // Export/import identity remains the authored form. Native radio groups belong to this actual
  // controller instance: copied forms with the same manifest must not uncheck each other.
  const controlName = `instance-${++controlInstance}`;
  for (const question of manifest.questions)
    questions.append(renderQuestion(controlName, question, strings));
  const actions = document.createElement('div');
  actions.className = 'response-actions';
  const copy = button(strings.copyResponse, 'responseCopy', COPY_ICON, 'secondary', 'md');
  const download = button(
    strings.downloadResponse,
    'responseDownload',
    DOWNLOAD_ICON,
    'primary',
    'md',
  );
  const importLabel = asUiButton(document.createElement('label'), 'secondary', 'md');
  importLabel.classList.add('response-file-action');
  importLabel.append(browserIcon(UPLOAD_ICON), document.createTextNode(strings.importResponse));
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json,.json';
  importInput.dataset.responseImport = '';
  importLabel.append(importInput);
  actions.append(copy, download, importLabel);
  mount.replaceChildren(questions, actions, status);

  mount.addEventListener(
    'input',
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
      if (!target.matches('[data-response-comment]')) markAnswered(target);
    },
    { signal: abort.signal },
  );
  mount.addEventListener(
    'change',
    (event) => {
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
    },
    { signal: abort.signal },
  );
  mount.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const toggle = target.closest<HTMLButtonElement>('[data-response-comment-toggle]');
      if (toggle) {
        const card = toggle.closest<HTMLElement>('[data-response-item]');
        const field = card?.querySelector<HTMLTextAreaElement>(':scope > [data-response-comment]');
        if (field) {
          showComment(toggle, field, field.hidden !== false);
          if (!field.hidden) field.focus({ preventScroll: true });
        }
        return;
      }
      const move = target.closest<HTMLButtonElement>('[data-response-order-move]');
      if (move) {
        const item = move.closest<HTMLLIElement>('[data-response-order-item]');
        const list = item?.parentElement;
        if (item && list) {
          const direction = move.dataset.responseOrderMove;
          const sibling =
            direction === 'up' ? item.previousElementSibling : item.nextElementSibling;
          if (sibling instanceof HTMLLIElement) {
            direction === 'up'
              ? list.insertBefore(item, sibling)
              : list.insertBefore(sibling, item);
            syncOrderEdges(list);
            markAnswered(move);
            move.focus();
          }
        }
        return;
      }
      if (target.closest('[data-response-copy]')) void copyArtifact();
      else if (target.closest('[data-response-download]')) downloadArtifact();
    },
    { signal: abort.signal },
  );
  mount.addEventListener(
    'dragstart',
    (event) => {
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
    },
    { signal: abort.signal },
  );
  mount.addEventListener(
    'dragover',
    (event) => {
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
    },
    { signal: abort.signal },
  );
  mount.addEventListener(
    'drop',
    (event) => {
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
    },
    { signal: abort.signal },
  );
  mount.addEventListener(
    'dragend',
    () => {
      draggedItem = undefined;
    },
    { signal: abort.signal },
  );

  if (initial !== undefined) applyArtifact(questions, manifest, initial, answered);

  function markAnswered(target: Element): void {
    const question = target.closest<HTMLElement>('[data-response-question]');
    const id = question?.dataset.responseQuestion;
    if (!id) return;
    answered.add(id);
    question.dataset.responseAnswered = 'true';
    showAnswerState(question, true);
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

  return {
    id: manifest.id,
    snapshot: currentArtifact,
    destroy: () => abort.abort(),
  };
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
  legend.className = 'ui-item-title';
  legend.textContent = question.title;
  fieldset.append(legend);
  if (question.prompt) fieldset.append(textElement('p', 'response-prompt', question.prompt));
  const state = textElement('span', 'response-answer-state ui-label', strings.unanswered);
  state.dataset.responseAnswerState = '';
  state.dataset.unansweredLabel = strings.unanswered;
  state.dataset.answeredLabel = strings.answered;
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
    column.append(textElement('h4', 'response-bucket-title ui-label', bucket.label));
    const list = document.createElement('div');
    list.className = 'response-bucket-items';
    list.dataset.responseBucketItems = '';
    column.append(list);
    board.append(column);
  }
  for (const item of question.items) {
    const card = renderItemCard(question, item, strings);
    card.draggable = true;
    const select = asUi(document.createElement('select'), 'ui-field');
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
    footerLast(card);
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
  const input = asUi(document.createElement('textarea'), 'ui-field');
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
    const card = renderItemCard(question, item, strings);
    // Перемещение — такое же действие карточки, как ссылка и комментарий: малые кнопки в её подвале,
    // значок рядом со словом, как у всех операций пакета.
    const move = document.createElement('div');
    move.className = 'response-item-move';
    const up = button(strings.moveUp, 'responseOrderMove', ARROW_UP_ICON, 'quiet', 'sm');
    up.dataset.responseOrderMove = 'up';
    const down = button(strings.moveDown, 'responseOrderMove', ARROW_DOWN_ICON, 'quiet', 'sm');
    down.dataset.responseOrderMove = 'down';
    move.append(up, down);
    card.querySelector(':scope > .response-item-footer')?.append(move);
    row.append(card);
    list.append(row);
  }
  syncOrderEdges(list);
  return list;
}

/**
 * Крайний пункт не двигается дальше края: его кнопка помечена недоступной. Пометка — `aria-disabled`, а
 * не `disabled`, чтобы кнопка, которая только что довела пункт до края, не теряла фокус клавиатуры.
 */
function syncOrderEdges(list: HTMLElement): void {
  const rows = [...list.children];
  rows.forEach((row, index) => {
    for (const move of row.querySelectorAll<HTMLButtonElement>('[data-response-order-move]')) {
      const edge =
        move.dataset.responseOrderMove === 'up' ? index === 0 : index === rows.length - 1;
      if (edge) move.setAttribute('aria-disabled', 'true');
      else move.removeAttribute('aria-disabled');
    }
  });
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
      const input = asUi(document.createElement('input'), 'ui-field');
      input.type = 'number';
      input.min = String(question.minimum);
      input.max = String(question.maximum);
      if (question.step !== undefined) input.step = String(question.step);
      // Подсказка называет допустимый диапазон: пустое поле без неё не говорит, какую оценку ждут.
      input.placeholder = `${question.minimum}–${question.maximum}`;
      input.classList.add('response-number');
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
    footerLast(card);
    list.append(card);
  }
  return list;
}

/**
 * Состояние вопроса меняет подпись, а не исчезает: строка остаётся на месте, и выбор варианта не
 * сдвигает форму под указателем.
 */
function showAnswerState(question: HTMLElement, answered: boolean): void {
  const state = question.querySelector<HTMLElement>('[data-response-answer-state]');
  if (!state) return;
  state.textContent =
    (answered ? state.dataset.answeredLabel : state.dataset.unansweredLabel) ?? '';
  state.dataset.responseAnswerState = answered ? 'answered' : '';
}

/**
 * Ответ идёт раньше действий карточки: подвал — после ответа, а поле комментария — под подвалом, чтобы
 * открывающая его кнопка оставалась на месте.
 */
function footerLast(card: HTMLElement): void {
  const footer = card.querySelector(':scope > .response-item-footer');
  if (footer) card.append(footer);
  const comment = card.querySelector(':scope > [data-response-comment]');
  if (comment) card.append(comment);
}

/** Кнопка комментария открывает и закрывает поле под подвалом; сама она не двигается. */
function showComment(toggle: HTMLElement, field: HTMLTextAreaElement, open: boolean): void {
  field.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
}

function renderItemCard(
  question: ResponseQuestionDefinition,
  item: ResponseItemDefinition,
  strings: PackageStrings,
): HTMLElement {
  const card = document.createElement('article');
  card.className = 'response-item';
  card.dataset.responseItem = item.id;
  card.append(textElement('h4', 'response-item-label ui-item-title', item.label));
  card.append(textElement('p', 'response-item-note', item.note));
  card.append(textElement('p', 'response-item-meta ui-meta', item.meta));
  // Действия карточки — в одном подвале и одного малого размера: ссылка на оригинал, комментарий и, у
  // вопроса на порядок, перемещение.
  const footer = document.createElement('div');
  footer.className = 'response-item-footer';
  const link = asUiButton(document.createElement('a'), 'quiet', 'sm');
  link.href = item.href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  // Значок окна говорит, что оригинал откроется отдельно, как у остальных действий подвала — значок и слово.
  link.append(browserIcon(WINDOW_ICON), document.createTextNode(strings.openOriginal));
  link.dataset.responseOriginal = '';
  footer.append(link);
  card.append(footer);
  if (item.comment) {
    const input = asUi(document.createElement('textarea'), 'ui-field');
    input.maxLength = MAX_RESPONSE_TEXT_LENGTH;
    input.dataset.responseComment = '';
    input.dataset.responseQuestion = question.id;
    input.dataset.responseItem = item.id;
    input.setAttribute('aria-label', `${strings.itemComment}: ${item.label}`);
    // Комментарий нужен не к каждому пункту: поле скрыто за малой кнопкой в подвале и не растит форму.
    input.classList.add('response-comment');
    input.hidden = true;
    const toggle = button(strings.itemComment, 'responseCommentToggle', PLUS_ICON, 'quiet', 'sm');
    toggle.setAttribute('aria-expanded', 'false');
    footer.append(toggle);
    card.append(input);
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
    showAnswerState(element, answer.answered);
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
      if (list) syncOrderEdges(list);
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
    const toggle = input
      ?.closest('[data-response-item]')
      ?.querySelector<HTMLElement>('[data-response-comment-toggle]');
    if (input) {
      input.value = comment.text;
      if (toggle) showComment(toggle, input, true);
    }
  }
}

/**
 * Подпись и её элемент. Вариант выбора (radio, checkbox) — `ui-choice`: отметка, затем текст. Поле —
 * `ui-field-group`: сначала подпись-метка, затем поле.
 */
function labelledControl<T extends HTMLElement>(control: T, label: string): HTMLLabelElement {
  const owner = document.createElement('label');
  const text = document.createElement('span');
  text.textContent = label;
  if (
    control instanceof HTMLInputElement &&
    (control.type === 'radio' || control.type === 'checkbox')
  ) {
    owner.className = 'ui-choice';
    owner.append(control, text);
  } else {
    owner.className = 'ui-field-group';
    text.className = 'ui-label';
    owner.append(text, control);
  }
  return owner;
}

function button(
  label: string,
  dataName: string,
  icon: Parameters<typeof browserIcon>[0] | undefined,
  variant: UiButtonVariant,
  size: UiSize,
): HTMLButtonElement {
  const control = asUiButton(document.createElement('button'), variant, size);
  control.type = 'button';
  if (icon !== undefined) control.append(browserIcon(icon));
  control.append(document.createTextNode(label));
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
