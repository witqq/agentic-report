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
  type ReviewTargetManifest,
  type ReviewTargetReference,
  type ReviewThread,
  type ReviewThreadSegment,
} from '../review/contract.js';
import type { ResolvedReviewArtifact } from '../review/binding.js';

const mobileReview = window.matchMedia('(max-width: 56.99rem)');

interface Elements {
  dialog: HTMLDialogElement;
  toggle: HTMLButtonElement;
  toggleLabel: HTMLElement;
  toggleCount: HTMLElement;
  close: HTMLButtonElement;
  exit: HTMLButtonElement;
  error: HTMLElement;
  summary: HTMLOutputElement;
  editor: HTMLElement;
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
    if (label) label.textContent = 'Review unavailable';
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
  let selected: string | undefined;
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
  mobileReview.addEventListener('change', () => {
    if (!el.dialog.open) return;
    el.dialog.close();
    queueMicrotask(() => open(opener));
  });
  for (const item of targets.values()) {
    item.open.addEventListener('click', () => {
      select(item.target.id);
      open(item.open);
    });
    item.quick.addEventListener('click', () => {
      toggleResolved(item.target.id);
    });
  }
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
    opener = button;
    if (!active) active = true;
    if (!el.dialog.open) mobileReview.matches ? el.dialog.showModal() : el.dialog.show();
    document.documentElement.dataset.reviewOpen = '';
    sync();
    (selected ? el.message : el.close).focus({ preventScroll: true });
  }
  function close(): void {
    if (el.dialog.open) el.dialog.close();
  }
  function select(id: string): void {
    selected = id;
    clearEditor();
    for (const item of targets.values())
      item.element.toggleAttribute('data-review-selected', item.target.id === id);
    renderEditor();
  }
  function saveMessage(): void {
    const target = selected ? targets.get(selected)?.target : undefined;
    const text = normalize(el.message.value);
    if (!target || !text) {
      showError('Enter a message for the selected block.');
      return;
    }
    const existing = threadForTarget(target.id);
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
    el.add.textContent = 'Save message';
    el.cancel.hidden = false;
    el.message.focus();
  }
  function clearEditor(): void {
    editing = undefined;
    el.message.value = '';
    el.add.textContent = 'Add message';
    el.cancel.hidden = true;
  }
  function toggleResolved(id: string): void {
    const thread = threadForTarget(id);
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
    return selected === undefined ? undefined : threadForTarget(selected);
  }
  function threadForTarget(targetId: string): ReviewThread | undefined {
    return artifact.threads.find((thread) => {
      const current = currentSegment(thread);
      if (current?.target.id === targetId) return true;
      return prior?.resolved.threads.some(
        (entry) => entry.thread.id === thread.id && entry.currentTarget?.id === targetId,
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
    renderPrior();
    for (const item of targets.values()) renderTarget(item);
    const openCount = artifact.threads.filter(
      (item) => currentSegment(item)?.resolved === false,
    ).length;
    el.summary.textContent = `${artifact.threads.length} threads · ${openCount} unresolved`;
    el.toggleCount.hidden = artifact.threads.length === 0;
    el.toggleCount.textContent = String(openCount);
    sync();
  }
  function renderEditor(): void {
    const item = selected ? targets.get(selected) : undefined;
    const thread = currentThread();
    el.editor.hidden = !item;
    if (!item) return;
    el.label.textContent = item.label;
    el.messages.replaceChildren();
    el.empty.hidden = Boolean(thread);
    for (const segment of thread?.segments ?? [])
      for (const message of segment.messages) {
        const li = document.createElement('li');
        li.className = 'review-response';
        const body = document.createElement('div');
        const author = document.createElement('strong');
        author.textContent = message.author === 'agent' ? 'Agent' : 'You';
        const text = document.createElement('p');
        text.textContent = message.message;
        body.append(author, text);
        li.append(body);
        if (segment.reportRevision === manifest.reportRevision) {
          const edit = document.createElement('button');
          edit.type = 'button';
          edit.textContent = 'Edit';
          edit.dataset.reviewMessageEdit = message.id;
          li.append(edit);
        }
        el.messages.append(li);
      }
    const segment = thread === undefined ? undefined : currentSegment(thread);
    el.resolve.hidden = !segment;
    el.resolve.textContent = segment?.resolved ? 'Reopen thread' : 'Resolve thread';
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
      `${segment?.resolved ? 'Reopen' : 'Resolve'} thread for ${item.label}`,
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
      li.textContent = `Prior · ${entry.binding} · ${latest?.resolved ? 'resolved' : 'unresolved'} · ${entry.thread.segments
        .flatMap((part) => part.messages)
        .map((item) => `${item.author}: ${item.message}`)
        .join(' / ')}`;
      el.priorList.append(li);
    }
    if (stale.length === 0) {
      for (const thread of orphaned) {
        const latest = thread.segments.at(-1);
        const li = document.createElement('li');
        li.className = 'review-response';
        li.textContent = `Historical · ${latest?.resolved ? 'resolved' : 'unresolved'} · ${thread.segments
          .flatMap((part) => part.messages)
          .map((item) => `${item.author}: ${item.message}`)
          .join(' / ')}`;
        el.priorList.append(li);
      }
    }
  }
  async function importReview(): Promise<void> {
    const file = el.importInput.files?.[0];
    el.importInput.value = '';
    if (!file) return;
    const previous = artifact;
    try {
      if (file.size > MAX_REVIEW_FILE_BYTES)
        throw new Error(`Review files must be no larger than ${MAX_REVIEW_FILE_BYTES} bytes.`);
      const imported = parseReviewArtifact(JSON.parse(await file.text()) as unknown);
      if (imported.report.revision !== manifest.reportRevision)
        throw new Error('This review belongs to a different report revision.');
      validateTargets(imported, manifest);
      artifact = imported;
      clearError();
      render();
    } catch (error) {
      artifact = previous;
      showError(
        error instanceof ReviewContractError && error.unsupportedVersion
          ? 'Version 1 reviews are unsupported. Export a version-2 thread review.'
          : error instanceof Error
            ? error.message
            : 'Review import failed.',
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
        ? 'Close review'
        : 'Open review'
      : 'Review';
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
    editor: find<HTMLElement>('[data-review-target-editor]'),
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
    open.setAttribute('aria-label', `Open discussion for ${label}`);
    const quick = document.createElement('button');
    quick.type = 'button';
    quick.className = 'review-target-resolve';
    quick.hidden = true;
    element.after(open, quick);
    map.set(target.id, { target, element, open, quick, label });
  }
  return map;
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
  for (const thread of artifact.threads) {
    const currentSegments = thread.segments.filter(
      (segment) => segment.reportRevision === artifact.report.revision,
    );
    if (currentSegments.length > 1)
      throw new Error('Imported review contains more than one current segment for a thread.');
    for (const segment of currentSegments) {
      const current = manifest.targets.find((item) => item.id === segment.target.id);
      if (!current || JSON.stringify(current) !== JSON.stringify(segment.target))
        throw new Error(
          'Imported review contains a current target that is not part of this report revision.',
        );
    }
  }
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
  return excerpt || target.kind.replace(/^(?:markdown|directive):/u, '').replaceAll('-', ' ');
}
