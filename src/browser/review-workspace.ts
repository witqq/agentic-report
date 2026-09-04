import {
  MAX_REVIEW_FILE_BYTES,
  MAX_REVIEW_TEXT_LENGTH,
  REVIEW_CONTRACT_VERSION,
  ReviewContractError,
  constrainReviewText,
  parseReviewArtifact,
  parseReviewTargetManifest,
  serializeReviewArtifact,
  type ReviewArtifact,
  type ReviewMessage,
  type ReviewSelectionAnchor,
  type ReviewTargetManifest,
  type ReviewTargetReference,
  type ReviewThread,
  type ReviewThreadSegment,
} from '../review/contract.js';
import type { ResolvedReviewArtifact } from '../review/binding.js';
import { packageStrings } from '../localization.js';

const mobileReview = window.matchMedia('(max-width: 56.99rem)');
const strings = packageStrings(document.documentElement.dataset.packageLocale);

class ReaderImportError extends Error {}

interface Elements {
  dialog: HTMLDialogElement;
  toggle: HTMLButtonElement;
  toggleLabel: HTMLElement;
  toggleCount: HTMLElement;
  close: HTMLButtonElement;
  exit: HTMLButtonElement;
  error: HTMLElement;
  summary: HTMLOutputElement;
  selectionAction: HTMLButtonElement;
  currentSection: HTMLElement;
  currentList: HTMLOListElement;
  editor: HTMLElement;
  editorTitle: HTMLElement;
  label: HTMLElement;
  messages: HTMLOListElement;
  empty: HTMLElement;
  message: HTMLTextAreaElement;
  add: HTMLButtonElement;
  cancel: HTMLButtonElement;
  resolve: HTMLButtonElement;
  priorSection: HTMLElement;
  priorList: HTMLOListElement;
  importInput: HTMLInputElement;
  exportButton: HTMLButtonElement;
}
interface TargetDom {
  target: ReviewTargetReference;
  element: HTMLElement;
  open: HTMLButtonElement;
  quick: HTMLButtonElement;
  label: string;
}
interface ReviewSubject {
  readonly target: ReviewTargetReference;
  readonly label: string;
  readonly selection?: ReviewSelectionAnchor;
}

export function installReviewWorkspace(): void {
  const template = document.querySelector<HTMLTemplateElement>('template[data-review-manifest]');
  const toggle = document.querySelector<HTMLButtonElement>('[data-review-toggle]');
  if (!template || !toggle) return;
  try {
    const manifest = parseReviewTargetManifest(
      JSON.parse(template.content.textContent ?? '') as unknown,
    );
    const elements = collect(toggle);
    const targets = collectTargets(manifest);
    if (!elements || !targets) throw new Error('Review workspace markup is incomplete.');
    createController(manifest, targets, elements, readPrior());
  } catch {
    toggle.disabled = true;
    toggle.dataset.reviewUnavailable = '';
    const label = toggle.querySelector<HTMLElement>('[data-review-toggle-label]');
    if (label) label.textContent = strings.reviewUnavailable;
  }
}

function createController(
  manifest: ReviewTargetManifest,
  targets: ReadonlyMap<string, TargetDom>,
  el: Elements,
  prior: { artifact: ReviewArtifact; resolved: ResolvedReviewArtifact } | undefined,
): void {
  let artifact = prior
    ? { ...parseReviewArtifact(prior.artifact), report: { revision: manifest.reportRevision } }
    : emptyArtifact(manifest.reportRevision);
  let active = false;
  let selected: ReviewSubject | undefined;
  let pendingSelection: ReviewSubject | undefined;
  let editing: string | undefined;
  let opener: HTMLButtonElement = el.toggle;
  limit(el.message);
  el.toggle.addEventListener('click', () =>
    active ? (el.dialog.open ? exit() : open(el.toggle)) : activate(),
  );
  el.close.addEventListener('click', close);
  el.exit.addEventListener('click', exit);
  el.dialog.addEventListener('close', () => {
    document.documentElement.removeAttribute('data-review-open');
    sync();
    opener.focus({ preventScroll: true });
  });
  el.dialog.addEventListener('click', (event) => {
    if (event.target === el.dialog && mobileReview.matches) close();
  });
  document.addEventListener('selectionchange', () => updateSelectionAction(false));
  document.addEventListener('pointerup', () => queueMicrotask(() => updateSelectionAction(false)));
  document.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') updateSelectionAction(true);
  });
  window.addEventListener('resize', () => updateSelectionAction(false));
  window.addEventListener('scroll', () => updateSelectionAction(false), true);
  el.selectionAction.addEventListener('pointerdown', (event) => event.preventDefault());
  el.selectionAction.addEventListener('click', createSelectionNote);
  mobileReview.addEventListener('change', () => {
    if (!el.dialog.open) return;
    el.dialog.close();
    queueMicrotask(() => open(opener));
  });
  for (const item of targets.values()) {
    item.open.addEventListener('click', () => {
      select(subjectForTarget(item));
      open(item.open);
    });
    item.quick.addEventListener('click', () => {
      toggleResolved(subjectForTarget(item));
    });
  }
  el.currentList.addEventListener('click', (event) => {
    const node = event.target;
    if (!(node instanceof Element)) return;
    const button = node.closest<HTMLButtonElement>('[data-review-thread-open]');
    const thread = artifact.threads.find((item) => item.id === button?.dataset.reviewThreadOpen);
    const segment = thread === undefined ? undefined : currentSegment(thread);
    if (!button || !segment) return;
    select(subjectForSegment(segment));
    open(button);
  });
  el.add.addEventListener('click', saveMessage);
  el.cancel.addEventListener('click', clearEditor);
  el.messages.addEventListener('click', (event) => {
    const node = event.target;
    if (!(node instanceof Element)) return;
    const edit = node.closest<HTMLButtonElement>('[data-review-message-edit]');
    if (edit) editMessage(edit.dataset.reviewMessageEdit ?? '');
  });
  el.resolve.addEventListener('click', () => {
    if (selected) toggleResolved(selected);
  });
  el.importInput.addEventListener('change', () => void importReview());
  el.exportButton.addEventListener('click', exportReview);
  render();

  function activate(): void {
    active = true;
    document.documentElement.dataset.reviewActive = '';
    for (const item of targets.values()) {
      item.open.hidden = false;
      renderTarget(item);
    }
    sync();
    if (!mobileReview.matches) open(el.toggle);
  }
  function exit(): void {
    active = false;
    selected = undefined;
    pendingSelection = undefined;
    hideSelectionAction();
    document.documentElement.removeAttribute('data-review-active');
    for (const item of targets.values()) {
      item.open.hidden = true;
      item.quick.hidden = true;
      item.element.removeAttribute('data-review-selected');
    }
    if (el.dialog.open) el.dialog.close();
    else sync();
  }
  function open(button: HTMLButtonElement): void {
    if (!active) active = true;
    if (!el.dialog.open) {
      opener = button;
      mobileReview.matches ? el.dialog.showModal() : el.dialog.show();
    }
    document.documentElement.dataset.reviewOpen = '';
    sync();
    (selected ? el.message : el.close).focus({ preventScroll: true });
  }
  function close(): void {
    if (el.dialog.open) el.dialog.close();
  }
  function select(subject: ReviewSubject): void {
    selected = subject;
    clearEditor();
    for (const item of targets.values())
      item.element.toggleAttribute(
        'data-review-selected',
        item.target.id === subject.target.id || item.target.id === subject.selection?.end.target.id,
      );
    renderEditor();
  }
  function saveMessage(): void {
    const target = selected?.target;
    const text = normalize(el.message.value);
    if (!target || !text) {
      showError(strings.enterMessage);
      return;
    }
    const existing = selected === undefined ? undefined : threadForSubject(selected);
    const current = existing === undefined ? undefined : currentSegment(existing);
    const messages = current?.messages ?? [];
    const message: ReviewMessage = editing
      ? {
          ...(messages.find((item) => item.id === editing) ?? {
            id: editing,
            author: 'user' as const,
          }),
          message: text,
        }
      : { id: nextMessageId(existing, target.id), author: 'user', message: text };
    const nextMessages = editing
      ? messages.map((item) => (item.id === editing ? message : item))
      : [...messages, message];
    const segment: ReviewThreadSegment = current
      ? { ...current, resolved: false, messages: nextMessages }
      : {
          id: nextSegmentId(existing, target.id),
          reportRevision: manifest.reportRevision,
          target,
          ...(selected?.selection === undefined ? {} : { selection: selected.selection }),
          resolved: false,
          messages: nextMessages,
        };
    const thread: ReviewThread = {
      id: existing?.id ?? nextThreadId(target.id),
      segments: current
        ? (existing?.segments.map((item) => (item.id === current.id ? segment : item)) ?? [segment])
        : [...(existing?.segments ?? []), segment],
    };
    artifact = {
      ...artifact,
      threads: [...artifact.threads.filter((item) => item.id !== thread.id), thread],
    };
    clearEditor();
    clearError();
    render();
  }
  function editMessage(id: string): void {
    const thread = currentThread();
    const message =
      thread === undefined
        ? undefined
        : currentSegment(thread)?.messages.find((item) => item.id === id);
    if (!message) return;
    editing = id;
    el.message.value = message.message;
    el.add.textContent = strings.saveMessage;
    el.cancel.hidden = false;
    el.message.focus();
  }
  function clearEditor(): void {
    editing = undefined;
    el.message.value = '';
    el.add.textContent = strings.addMessage;
    el.cancel.hidden = true;
  }
  function toggleResolved(subject: ReviewSubject): void {
    const thread = threadForSubject(subject);
    const segment = thread === undefined ? undefined : currentSegment(thread);
    if (!thread || !segment) return;
    artifact = {
      ...artifact,
      threads: artifact.threads.map((item) =>
        item.id === thread.id
          ? {
              ...item,
              segments: item.segments.map((part) =>
                part.id === segment.id ? { ...part, resolved: !part.resolved } : part,
              ),
            }
          : item,
      ),
    };
    render();
  }
  function currentSegment(thread: ReviewThread): ReviewThreadSegment | undefined {
    return thread.segments.find((segment) => segment.reportRevision === manifest.reportRevision);
  }
  function currentThread(): ReviewThread | undefined {
    return selected === undefined ? undefined : threadForSubject(selected);
  }
  function threadForTarget(targetId: string): ReviewThread | undefined {
    const item = targets.get(targetId);
    return item === undefined ? undefined : threadForSubject(subjectForTarget(item));
  }
  function threadForSubject(subject: ReviewSubject): ReviewThread | undefined {
    return artifact.threads.find((thread) => {
      const current = currentSegment(thread);
      if (current && matchesSubject(current, subject)) return true;
      if (subject.selection !== undefined) return false;
      return prior?.resolved.threads.some(
        (entry) => entry.thread.id === thread.id && entry.currentTarget?.id === subject.target.id,
      );
    });
  }
  function nextMessageId(thread: ReviewThread | undefined, targetId: string): string {
    const occupied = new Set(
      thread?.segments.flatMap((segment) => segment.messages.map((message) => message.id)) ?? [],
    );
    return nextGeneratedId(`message-${targetId}`, occupied);
  }
  function nextSegmentId(thread: ReviewThread | undefined, targetId: string): string {
    return nextGeneratedId(
      `segment-${targetId}`,
      new Set(thread?.segments.map((segment) => segment.id) ?? []),
    );
  }
  function nextThreadId(targetId: string): string {
    return nextGeneratedId(
      `thread-${targetId}`,
      new Set(artifact.threads.map((thread) => thread.id)),
    );
  }
  function render(): void {
    renderEditor();
    renderCurrent();
    renderPrior();
    for (const item of targets.values()) renderTarget(item);
    const openCount = artifact.threads.filter(
      (item) => currentSegment(item)?.resolved === false,
    ).length;
    el.summary.textContent = strings.threadsSummary(artifact.threads.length, openCount);
    el.toggleCount.hidden = artifact.threads.length === 0;
    el.toggleCount.textContent = String(openCount);
    sync();
  }
  function renderEditor(): void {
    const item = selected ? targets.get(selected.target.id) : undefined;
    const thread = currentThread();
    el.editor.hidden = !item;
    if (!item) return;
    el.editorTitle.textContent = selected?.selection
      ? strings.noteForSelection
      : strings.discussionSelected;
    el.label.textContent = selected?.label ?? item.label;
    el.messages.replaceChildren();
    el.empty.hidden = Boolean(thread);
    for (const segment of thread?.segments ?? [])
      for (const message of segment.messages) {
        const li = document.createElement('li');
        li.className = 'review-response';
        const body = document.createElement('div');
        const author = document.createElement('strong');
        author.textContent = message.author === 'agent' ? strings.agent : strings.you;
        const text = document.createElement('p');
        text.textContent = message.message;
        body.append(author, text);
        li.append(body);
        if (segment.reportRevision === manifest.reportRevision) {
          const edit = document.createElement('button');
          edit.type = 'button';
          edit.textContent = strings.edit;
          edit.dataset.reviewMessageEdit = message.id;
          li.append(edit);
        }
        el.messages.append(li);
      }
    const segment = thread === undefined ? undefined : currentSegment(thread);
    el.resolve.hidden = !segment;
    el.resolve.textContent = segment?.resolved ? strings.reopenThread : strings.resolveThread;
  }
  function renderCurrent(): void {
    el.currentList.replaceChildren();
    const current = artifact.threads
      .map((thread) => ({ thread, segment: currentSegment(thread) }))
      .filter(
        (entry): entry is { thread: ReviewThread; segment: ReviewThreadSegment } =>
          entry.segment !== undefined,
      );
    el.currentSection.hidden = current.length === 0;
    for (const entry of current) {
      const subject = subjectForSegment(entry.segment);
      const li = document.createElement('li');
      li.className = 'review-response';
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.reviewThreadOpen = entry.thread.id;
      button.textContent = subject.selection
        ? strings.openNote(subject.label)
        : strings.openDiscussion(subject.label);
      li.append(button);
      el.currentList.append(li);
    }
  }
  function renderTarget(item: TargetDom): void {
    const thread = threadForTarget(item.target.id);
    const segment = thread === undefined ? undefined : currentSegment(thread);
    const messageCount = thread?.segments.reduce((sum, part) => sum + part.messages.length, 0) ?? 0;
    item.open.textContent = thread ? `${segment?.resolved ? '○' : '●'} ${messageCount}` : '＋';
    item.open.dataset.reviewThreadState = segment?.resolved
      ? 'resolved'
      : thread
        ? 'open'
        : 'empty';
    item.quick.hidden = !active || !segment;
    item.quick.textContent = segment?.resolved ? '↻' : '✓';
    item.quick.setAttribute(
      'aria-label',
      strings.resolveFor(segment?.resolved === true, item.label),
    );
  }
  function renderPrior(): void {
    el.priorList.replaceChildren();
    const stale = prior?.resolved.reportStatus === 'stale' ? prior.resolved.threads : [];
    const orphaned = artifact.threads.filter((thread) => currentSegment(thread) === undefined);
    el.priorSection.hidden = stale.length === 0 && orphaned.length === 0;
    for (const entry of stale) {
      const li = document.createElement('li');
      li.className = 'review-response';
      const latest = entry.thread.segments.at(-1);
      li.textContent = `${strings.prior} · ${strings.reviewBinding(entry.binding)} · ${latest?.resolved ? strings.resolved : strings.unresolved} · ${entry.thread.segments
        .flatMap((part) => part.messages)
        .map((item) => `${item.author === 'agent' ? strings.agent : strings.you}: ${item.message}`)
        .join(' / ')}`;
      el.priorList.append(li);
    }
    if (stale.length === 0) {
      for (const thread of orphaned) {
        const latest = thread.segments.at(-1);
        const li = document.createElement('li');
        li.className = 'review-response';
        li.textContent = `${strings.historical} · ${latest?.resolved ? strings.resolved : strings.unresolved} · ${thread.segments
          .flatMap((part) => part.messages)
          .map(
            (item) => `${item.author === 'agent' ? strings.agent : strings.you}: ${item.message}`,
          )
          .join(' / ')}`;
        el.priorList.append(li);
      }
    }
  }
  function createSelectionNote(): void {
    const subject = pendingSelection;
    if (!subject) return;
    pendingSelection = undefined;
    hideSelectionAction();
    if (!active) activate();
    select(subject);
    open(el.toggle);
  }
  function updateSelectionAction(focus: boolean): void {
    if (document.activeElement === el.selectionAction && pendingSelection) return;
    const candidate = captureSelection(targets);
    if (!candidate) {
      pendingSelection = undefined;
      hideSelectionAction();
      return;
    }
    pendingSelection = candidate.subject;
    el.selectionAction.hidden = false;
    el.selectionAction.style.left = `${candidate.position.left}px`;
    el.selectionAction.style.top = `${candidate.position.top}px`;
    if (focus) el.selectionAction.focus({ preventScroll: true });
  }
  function hideSelectionAction(): void {
    el.selectionAction.hidden = true;
    el.selectionAction.style.removeProperty('left');
    el.selectionAction.style.removeProperty('top');
  }
  async function importReview(): Promise<void> {
    const file = el.importInput.files?.[0];
    el.importInput.value = '';
    if (!file) return;
    const previous = artifact;
    try {
      if (file.size > MAX_REVIEW_FILE_BYTES)
        throw new ReaderImportError(strings.fileTooLarge(MAX_REVIEW_FILE_BYTES));
      const imported = parseReviewArtifact(JSON.parse(await file.text()) as unknown);
      if (imported.report.revision !== manifest.reportRevision)
        throw new ReaderImportError(strings.differentRevision);
      validateTargets(imported, manifest);
      artifact = imported;
      clearError();
      render();
    } catch (error) {
      artifact = previous;
      showError(
        error instanceof ReviewContractError && error.unsupportedVersion
          ? strings.unsupportedReview
          : error instanceof ReaderImportError
            ? error.message
            : strings.importFailed,
      );
      render();
    }
  }
  function exportReview(): void {
    const url = URL.createObjectURL(
      new Blob([serializeReviewArtifact(artifact)], { type: 'application/json;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'review.json';
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    clearError();
  }
  function sync(): void {
    el.toggle.setAttribute('aria-expanded', String(el.dialog.open));
    el.toggleLabel.textContent = active
      ? el.dialog.open
        ? strings.closeReview
        : strings.openReview
      : strings.review;
  }
  function showError(message: string): void {
    el.error.textContent = message;
    el.error.hidden = false;
  }
  function clearError(): void {
    el.error.textContent = '';
    el.error.hidden = true;
  }
}

function collect(toggle: HTMLButtonElement): Elements | undefined {
  const find = <T extends Element>(selector: string) => document.querySelector<T>(selector);
  const values = {
    dialog: find<HTMLDialogElement>('[data-review-dialog]'),
    toggle,
    toggleLabel: toggle.querySelector<HTMLElement>('[data-review-toggle-label]'),
    toggleCount: toggle.querySelector<HTMLElement>('[data-review-toggle-count]'),
    close: find<HTMLButtonElement>('[data-review-close]'),
    exit: find<HTMLButtonElement>('[data-review-exit]'),
    error: find<HTMLElement>('[data-review-error]'),
    summary: find<HTMLOutputElement>('[data-review-summary]'),
    selectionAction: find<HTMLButtonElement>('[data-review-selection-action]'),
    currentSection: find<HTMLElement>('[data-review-current-section]'),
    currentList: find<HTMLOListElement>('[data-review-current-list]'),
    editor: find<HTMLElement>('[data-review-target-editor]'),
    editorTitle: find<HTMLElement>('[data-review-editor-title]'),
    label: find<HTMLElement>('[data-review-target-label]'),
    messages: find<HTMLOListElement>('[data-review-thread-messages]'),
    empty: find<HTMLElement>('[data-review-thread-empty]'),
    message: find<HTMLTextAreaElement>('[data-review-message]'),
    add: find<HTMLButtonElement>('[data-review-add-message]'),
    cancel: find<HTMLButtonElement>('[data-review-cancel-message-edit]'),
    resolve: find<HTMLButtonElement>('[data-review-resolve-thread]'),
    priorSection: find<HTMLElement>('[data-review-prior-section]'),
    priorList: find<HTMLOListElement>('[data-review-prior-list]'),
    importInput: find<HTMLInputElement>('[data-review-import]'),
    exportButton: find<HTMLButtonElement>('[data-review-export]'),
  };
  return Object.values(values).some((value) => value === null) ? undefined : (values as Elements);
}
function collectTargets(
  manifest: ReviewTargetManifest,
): ReadonlyMap<string, TargetDom> | undefined {
  const owners = [...document.querySelectorAll<HTMLElement>('[data-review-target]')];
  const map = new Map<string, TargetDom>();
  for (const target of manifest.targets) {
    const element = owners.find((candidate) => candidate.dataset.reviewTarget === target.id);
    if (!element) return;
    const label = visibleLabel(target, element);
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'review-target-control';
    open.dataset.reviewTargetControl = target.id;
    open.hidden = true;
    open.setAttribute('aria-label', strings.openDiscussion(label));
    const quick = document.createElement('button');
    quick.type = 'button';
    quick.className = 'review-target-resolve';
    quick.hidden = true;
    element.after(open, quick);
    map.set(target.id, { target, element, open, quick, label });
  }
  return map;
}
function subjectForTarget(item: TargetDom): ReviewSubject {
  return { target: item.target, label: item.label };
}
function subjectForSegment(segment: ReviewThreadSegment): ReviewSubject {
  if (segment.selection !== undefined)
    return {
      target: segment.target,
      selection: segment.selection,
      label: compactQuote(segment.selection.quote),
    };
  const element = findTargetElement(segment.target.id);
  return {
    target: segment.target,
    label:
      element === undefined
        ? strings.reviewTargetFallback(segment.target.kind)
        : visibleLabel(segment.target, element),
  };
}
function matchesSubject(segment: ReviewThreadSegment, subject: ReviewSubject): boolean {
  return (
    segment.target.id === subject.target.id &&
    JSON.stringify(segment.selection) === JSON.stringify(subject.selection)
  );
}
function captureSelection(
  targets: ReadonlyMap<string, TargetDom>,
):
  | { readonly subject: ReviewSubject; readonly position: { left: number; top: number } }
  | undefined {
  const selection = window.getSelection();
  if (selection?.rangeCount !== 1 || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const start = targetAt(range.startContainer, targets);
  const end = targetAt(range.endContainer, targets);
  const article = start?.element.closest('.report-content article');
  if (!start || !end || !article || end.element.closest('.report-content article') !== article)
    return;
  try {
    const startOffset = boundaryOffset(start.element, range.startContainer, range.startOffset);
    const endOffset = boundaryOffset(end.element, range.endContainer, range.endOffset);
    if (start.element === end.element && endOffset <= startOffset) return;
    const quote = selectedQuote(range);
    if (!quote.trim() || Array.from(quote).length > MAX_REVIEW_TEXT_LENGTH) return;
    const anchor: ReviewSelectionAnchor = {
      start: { target: start.target, offset: startOffset },
      end: { target: end.target, offset: endOffset },
      quote,
    };
    const rect = selectionRect(range, start.element);
    return {
      subject: { target: start.target, selection: anchor, label: compactQuote(quote) },
      position: {
        left: Math.min(Math.max(rect.left + rect.width / 2, 4), window.innerWidth - 4),
        top: Math.max(rect.top, 3.5 * 16),
      },
    };
  } catch {
    return;
  }
}
function targetAt(node: Node, targets: ReadonlyMap<string, TargetDom>): TargetDom | undefined {
  const element = node instanceof Element ? node : node.parentElement;
  const owner = element?.closest<HTMLElement>('[data-review-target]');
  return owner === null || owner === undefined
    ? undefined
    : targets.get(owner.dataset.reviewTarget ?? '');
}
function boundaryOffset(owner: HTMLElement, node: Node, offset: number): number {
  const prefix = document.createRange();
  prefix.selectNodeContents(owner);
  prefix.setEnd(node, offset);
  return Array.from(prefix.toString()).length;
}
function selectedQuote(range: Range): string {
  const fragment = range.cloneContents();
  for (const control of fragment.querySelectorAll(
    '[data-review-target-control], .review-target-resolve, [data-review-selection-action]',
  ))
    control.remove();
  return (fragment.textContent ?? '').normalize('NFC');
}
function selectionRect(range: Range, fallback: HTMLElement): DOMRect {
  const rectangles = [...range.getClientRects()].filter(
    (rect) => rect.width > 0 || rect.height > 0,
  );
  return rectangles.at(-1) ?? range.getBoundingClientRect() ?? fallback.getBoundingClientRect();
}
function compactQuote(value: string): string {
  const compact = value.replace(/\s+/gu, ' ').trim();
  return compact.length <= 120 ? compact : `${compact.slice(0, 117)}…`;
}
function readPrior(): { artifact: ReviewArtifact; resolved: ResolvedReviewArtifact } | undefined {
  const template = document.querySelector<HTMLTemplateElement>('template[data-prior-review]');
  if (!template) return;
  try {
    const value = JSON.parse(template.content.textContent ?? '') as {
      artifact: unknown;
      resolved: ResolvedReviewArtifact;
    };
    return { artifact: parseReviewArtifact(value.artifact), resolved: value.resolved };
  } catch {
    return;
  }
}
function emptyArtifact(revision: string): ReviewArtifact {
  return { contractVersion: REVIEW_CONTRACT_VERSION, report: { revision }, threads: [] };
}
function validateTargets(artifact: ReviewArtifact, manifest: ReviewTargetManifest): void {
  const targets = collectTargetOwners(manifest);
  if (!targets) throw new ReaderImportError(strings.unknownCurrentTarget);
  for (const thread of artifact.threads) {
    const currentSegments = thread.segments.filter(
      (segment) => segment.reportRevision === artifact.report.revision,
    );
    if (currentSegments.length > 1) throw new ReaderImportError(strings.multipleCurrentSegments);
    for (const segment of currentSegments) {
      const current = manifest.targets.find((item) => item.id === segment.target.id);
      if (!current || JSON.stringify(current) !== JSON.stringify(segment.target))
        throw new ReaderImportError(strings.unknownCurrentTarget);
      if (segment.selection !== undefined && !validSelectionAnchor(segment.selection, targets))
        throw new ReaderImportError(strings.invalidSelectionAnchor);
    }
  }
}
function collectTargetOwners(
  manifest: ReviewTargetManifest,
):
  | ReadonlyMap<string, { readonly target: ReviewTargetReference; readonly element: HTMLElement }>
  | undefined {
  const result = new Map<
    string,
    { readonly target: ReviewTargetReference; readonly element: HTMLElement }
  >();
  for (const target of manifest.targets) {
    const element = findTargetElement(target.id);
    if (!element) return;
    result.set(target.id, { target, element });
  }
  return result;
}
function findTargetElement(id: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('[data-review-target]')].find(
    (element) => element.dataset.reviewTarget === id,
  );
}
function validSelectionAnchor(
  anchor: ReviewSelectionAnchor,
  targets: ReadonlyMap<
    string,
    { readonly target: ReviewTargetReference; readonly element: HTMLElement }
  >,
): boolean {
  const start = targets.get(anchor.start.target.id);
  const end = targets.get(anchor.end.target.id);
  if (
    !start ||
    !end ||
    JSON.stringify(start.target) !== JSON.stringify(anchor.start.target) ||
    JSON.stringify(end.target) !== JSON.stringify(anchor.end.target)
  )
    return false;
  const startPoint = pointAtCodePointOffset(start.element, anchor.start.offset);
  const endPoint = pointAtCodePointOffset(end.element, anchor.end.offset);
  if (!startPoint || !endPoint) return false;
  const range = document.createRange();
  try {
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
  } catch {
    return false;
  }
  return !range.collapsed && selectedQuote(range) === anchor.quote;
}
function pointAtCodePointOffset(
  owner: HTMLElement,
  offset: number,
): { readonly node: Text; readonly offset: number } | undefined {
  const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let last: Text | undefined;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (!(node instanceof Text)) continue;
    last = node;
    const points = Array.from(node.data);
    if (remaining <= points.length)
      return { node, offset: points.slice(0, remaining).join('').length };
    remaining -= points.length;
  }
  return remaining === 0 && last ? { node: last, offset: last.data.length } : undefined;
}
function limit(input: HTMLTextAreaElement): void {
  input.addEventListener('input', () => {
    const value = constrainReviewText(input.value, MAX_REVIEW_TEXT_LENGTH);
    if (value.truncated) input.value = value.input;
  });
}
function normalize(value: string): string {
  return value.trim().normalize('NFC');
}
function nextGeneratedId(base: string, occupied: ReadonlySet<string>): string {
  let sequence = 1;
  while (occupied.has(`${base}-${sequence}`)) sequence += 1;
  return `${base}-${sequence}`;
}
function visibleLabel(target: ReviewTargetReference, element: HTMLElement): string {
  const excerpt = (element.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 80);
  return excerpt || strings.reviewTargetFallback(target.kind);
}
