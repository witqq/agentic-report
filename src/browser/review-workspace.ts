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
const OPEN_HIGHLIGHT = 'agentic-review-open';
const RESOLVED_HIGHLIGHT = 'agentic-review-resolved';

class ReaderImportError extends Error {}

interface Elements {
  dialog: HTMLDialogElement;
  toggle: HTMLButtonElement;
  toggleLabel: HTMLElement;
  toggleCount: HTMLElement;
  close: HTMLButtonElement;
  drawerError: HTMLElement;
  summary: HTMLOutputElement;
  selectionAction: HTMLButtonElement;
  currentSection: HTMLElement;
  currentList: HTMLOListElement;
  popover: HTMLElement;
  popoverClose: HTMLButtonElement;
  popoverError: HTMLElement;
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
  readonly target: ReviewTargetReference;
  readonly element: HTMLElement;
  readonly label: string;
}

interface ReviewSubject {
  readonly target: ReviewTargetReference;
  readonly label: string;
  readonly selection?: ReviewSelectionAnchor;
}

interface RenderedSelection {
  readonly thread: ReviewThread;
  readonly segment: ReviewThreadSegment;
  readonly subject: ReviewSubject;
  readonly range: Range;
}

interface AnchoredAction {
  readonly subject: ReviewSubject;
  readonly range?: Range;
  readonly kind: 'create' | 'thread';
  readonly position: { readonly left: number; readonly top: number };
}

type HighlightRegistry = {
  delete(name: string): boolean;
  set(name: string, highlight: unknown): void;
};

type HighlightConstructor = new (...ranges: AbstractRange[]) => unknown;

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
  let selected: ReviewSubject | undefined;
  let pendingAction: AnchoredAction | undefined;
  let pressedAction: AnchoredAction | undefined;
  let editing: string | undefined;
  let drawerOpener: HTMLElement = el.toggle;
  let restoreDrawerFocus = true;
  let popoverOpener: HTMLElement | undefined;
  let popoverAnchor: Range | DOMRect | undefined;
  let renderedSelections: readonly RenderedSelection[] = [];
  let repositionFrame: number | undefined;
  const markerHost = document.createElement('div');
  markerHost.className = 'review-highlight-markers';
  markerHost.dataset.reviewHighlightMarkers = '';
  document.body.append(markerHost);

  limit(el.message);
  el.toggle.addEventListener('click', () =>
    el.dialog.open ? closeDrawer() : openDrawer(el.toggle),
  );
  el.close.addEventListener('click', () => closeDrawer());
  el.dialog.addEventListener('close', () => {
    syncToggle();
    if (restoreDrawerFocus) drawerOpener.focus({ preventScroll: true });
    restoreDrawerFocus = true;
  });
  el.dialog.addEventListener('click', (event) => {
    if (event.target === el.dialog && mobileReview.matches) closeDrawer();
  });
  document.addEventListener('selectionchange', () => updateSelectionAction(false));
  document.addEventListener('pointerup', (event) => {
    const pressed = pressedAction;
    if (pressed)
      window.setTimeout(() => {
        if (pressedAction === pressed) pressedAction = undefined;
      }, 0);
    queueMicrotask(() => {
      if (updateSelectionAction(false)) return;
      updateHighlightAction(event.clientX, event.clientY);
    });
  });
  document.addEventListener('pointermove', (event) => {
    if (window.getSelection()?.isCollapsed === false || !el.popover.hidden) return;
    if (event.target === el.selectionAction || markerHost.contains(event.target as Node)) return;
    updateHighlightAction(event.clientX, event.clientY);
  });
  document.addEventListener('pointerdown', (event) => {
    const node = event.target;
    if (!(node instanceof Node)) return;
    if (!el.selectionAction.contains(node)) pressedAction = undefined;
    if (el.popover.hidden || el.popover.contains(node)) return;
    if (el.selectionAction.contains(node) || markerHost.contains(node)) return;
    closePopover(false);
  });
  document.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') updateSelectionAction(true);
    if (event.key === 'Escape' && !el.popover.hidden) closePopover(true);
  });
  window.addEventListener('resize', scheduleReposition);
  window.addEventListener('scroll', scheduleReposition, true);
  el.selectionAction.addEventListener('pointerdown', (event) => {
    pressedAction = pendingAction;
    event.preventDefault();
  });
  el.selectionAction.addEventListener('pointercancel', () => {
    pressedAction = undefined;
  });
  el.selectionAction.addEventListener('click', openPendingAction);
  markerHost.addEventListener('click', (event) => {
    const node = event.target;
    if (!(node instanceof Element)) return;
    const marker = node.closest<HTMLButtonElement>('[data-review-highlight-marker]');
    const entry = renderedSelections.find(
      (item) => item.thread.id === marker?.dataset.reviewHighlightMarker,
    );
    if (!marker || !entry) return;
    select(entry.subject);
    openPopover(entry.range, marker);
  });
  mobileReview.addEventListener('change', () => {
    if (!el.dialog.open) return;
    el.dialog.close();
    queueMicrotask(() => openDrawer(drawerOpener));
  });
  el.currentList.addEventListener('click', (event) => {
    const node = event.target;
    if (!(node instanceof Element)) return;
    const button = node.closest<HTMLButtonElement>('[data-review-thread-open]');
    const thread = artifact.threads.find((item) => item.id === button?.dataset.reviewThreadOpen);
    const segment = thread === undefined ? undefined : currentSegment(thread);
    if (!button || !segment) return;
    const subject = subjectForSegment(segment);
    const range =
      segment.selection === undefined ? undefined : reconstructRange(segment.selection, targets);
    const owner = targets.get(subject.target.id)?.element;
    const fallbackAnchor = button.getBoundingClientRect();
    closeDrawer(false);
    owner?.scrollIntoView({ behavior: 'instant', block: 'center' });
    const anchor = range ?? owner?.getBoundingClientRect() ?? fallbackAnchor;
    select(subject);
    openPopover(anchor, el.toggle);
  });
  el.priorList.addEventListener('click', (event) => {
    const node = event.target;
    if (!(node instanceof Element)) return;
    const button = node.closest<HTMLButtonElement>('[data-review-prior-open]');
    const entry = prior?.resolved.threads.find(
      (item) => item.thread.id === button?.dataset.reviewPriorOpen,
    );
    const target =
      entry?.currentTarget === undefined ? undefined : targets.get(entry.currentTarget.id);
    if (!button || !entry || !target) return;
    closeDrawer(false);
    target.element.scrollIntoView({ behavior: 'instant', block: 'center' });
    select({ target: target.target, label: target.label });
    openPopover(target.element.getBoundingClientRect(), el.toggle);
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
  el.popoverClose.addEventListener('click', () => closePopover(true));
  el.importInput.addEventListener('change', () => void importReview());
  el.exportButton.addEventListener('click', exportReview);
  render();

  function openDrawer(button: HTMLElement): void {
    drawerOpener = button;
    restoreDrawerFocus = true;
    if (!el.dialog.open) mobileReview.matches ? el.dialog.showModal() : el.dialog.show();
    syncToggle();
    el.close.focus({ preventScroll: true });
  }

  function closeDrawer(restoreFocus = true): void {
    if (!el.dialog.open) return;
    restoreDrawerFocus = restoreFocus;
    el.dialog.close();
  }

  function openPopover(anchor: Range | DOMRect, opener: HTMLElement): void {
    popoverAnchor = anchor;
    popoverOpener = opener;
    el.popover.hidden = false;
    hideAction();
    clearPopoverError();
    renderEditor();
    positionPopover();
    el.message.focus({ preventScroll: true });
  }

  function closePopover(restoreFocus: boolean): void {
    if (el.popover.hidden) return;
    el.popover.hidden = true;
    popoverAnchor = undefined;
    clearEditor();
    clearPopoverError();
    if (!restoreFocus) return;
    const opener = popoverOpener;
    popoverOpener = undefined;
    if (opener === el.selectionAction) {
      if (updateSelectionAction(true)) return;
      el.toggle.focus({ preventScroll: true });
      return;
    }
    if (opener?.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
    else el.toggle.focus({ preventScroll: true });
  }

  function select(subject: ReviewSubject): void {
    selected = subject;
    clearEditor();
    renderEditor();
  }

  function saveMessage(): void {
    const target = selected?.target;
    const text = normalize(el.message.value);
    if (!target || !text) {
      showPopoverError(strings.enterMessage);
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
    clearPopoverError();
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
    renderHighlights();
    const openCount = artifact.threads.filter(
      (item) => currentSegment(item)?.resolved === false,
    ).length;
    el.summary.textContent = strings.threadsSummary(artifact.threads.length, openCount);
    el.toggleCount.hidden = artifact.threads.length === 0;
    el.toggleCount.textContent = String(openCount);
    syncToggle();
  }

  function renderEditor(): void {
    if (!selected) return;
    const thread = currentThread();
    el.editorTitle.textContent = selected.selection
      ? strings.noteForSelection
      : strings.discussionSelected;
    el.label.textContent = selected.label;
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
      li.dataset.reviewThreadState = entry.segment.resolved ? 'resolved' : 'open';
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.reviewThreadOpen = entry.thread.id;
      const state = entry.segment.resolved ? `○ ${strings.resolved}` : `● ${strings.unresolved}`;
      button.textContent = `${state} · ${
        subject.selection ? strings.openNote(subject.label) : strings.openDiscussion(subject.label)
      }`;
      li.append(button);
      el.currentList.append(li);
    }
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
      const summary = `${strings.prior} · ${strings.reviewBinding(entry.binding)} · ${latest?.resolved ? strings.resolved : strings.unresolved} · ${entry.thread.segments
        .flatMap((part) => part.messages)
        .map((item) => `${item.author === 'agent' ? strings.agent : strings.you}: ${item.message}`)
        .join(' / ')}`;
      const target =
        entry.currentTarget === undefined ? undefined : targets.get(entry.currentTarget.id);
      if (target) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.reviewPriorOpen = entry.thread.id;
        button.setAttribute('aria-label', strings.openDiscussion(target.label));
        button.textContent = summary;
        li.append(button);
      } else li.textContent = summary;
      el.priorList.append(li);
    }
    if (stale.length === 0)
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

  function renderHighlights(): void {
    renderedSelections = artifact.threads
      .map((thread) => {
        const segment = currentSegment(thread);
        const range =
          segment?.selection === undefined
            ? undefined
            : reconstructRange(segment.selection, targets);
        return segment && range
          ? { thread, segment, subject: subjectForSegment(segment), range }
          : undefined;
      })
      .filter((entry): entry is RenderedSelection => entry !== undefined)
      .sort(compareRenderedSelections);

    const registry = highlightRegistry();
    const HighlightValue = highlightConstructor();
    registry?.delete(OPEN_HIGHLIGHT);
    registry?.delete(RESOLVED_HIGHLIGHT);
    if (registry && HighlightValue) {
      const open = renderedSelections
        .filter((entry) => !entry.segment.resolved)
        .map((entry) => entry.range);
      const resolved = renderedSelections
        .filter((entry) => entry.segment.resolved)
        .map((entry) => entry.range);
      if (open.length) registry.set(OPEN_HIGHLIGHT, new HighlightValue(...open));
      if (resolved.length) registry.set(RESOLVED_HIGHLIGHT, new HighlightValue(...resolved));
    }

    markerHost.replaceChildren();
    for (const entry of renderedSelections) {
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'review-highlight-marker';
      marker.dataset.reviewHighlightMarker = entry.thread.id;
      marker.dataset.reviewThreadState = entry.segment.resolved ? 'resolved' : 'open';
      marker.setAttribute('aria-label', strings.openNote(entry.subject.label));
      marker.textContent = '●';
      markerHost.append(marker);
      positionMarker(marker, entry.range);
    }
    positionPopover();
  }

  function openPendingAction(): void {
    const pending = pressedAction ?? pendingAction;
    pressedAction = undefined;
    if (!pending) return;
    pendingAction = undefined;
    select(pending.subject);
    openPopover(
      pending.range ?? new DOMRect(pending.position.left, pending.position.top),
      el.selectionAction,
    );
  }

  function updateSelectionAction(focus: boolean): boolean {
    if (document.activeElement === el.selectionAction && pendingAction) return true;
    const candidate = captureSelection(targets);
    if (!candidate) {
      if (pendingAction?.kind === 'create') hideAction();
      return false;
    }
    const kind = threadForSubject(candidate.subject) === undefined ? 'create' : 'thread';
    pendingAction = { ...candidate, kind };
    el.selectionAction.dataset.reviewActionKind = kind;
    el.selectionAction.textContent = kind === 'create' ? strings.createNote : strings.viewThread;
    if (kind === 'thread')
      el.selectionAction.setAttribute('aria-label', strings.openNote(candidate.subject.label));
    else el.selectionAction.removeAttribute('aria-label');
    showAction(candidate.position);
    if (focus) el.selectionAction.focus({ preventScroll: true });
    return true;
  }

  function updateHighlightAction(x: number, y: number): void {
    if (!window.getSelection()?.isCollapsed) return;
    const entry = renderedSelections.find((candidate) =>
      rangeContainsViewportPoint(candidate.range, x, y),
    );
    if (!entry) {
      if (pendingAction?.kind === 'thread') hideAction();
      return;
    }
    pendingAction = {
      subject: entry.subject,
      range: entry.range,
      kind: 'thread',
      position: { left: x, top: y },
    };
    el.selectionAction.dataset.reviewActionKind = 'thread';
    el.selectionAction.textContent = strings.viewThread;
    el.selectionAction.setAttribute('aria-label', strings.openNote(entry.subject.label));
    showAction({ left: x, top: y });
  }

  function showAction(position: { readonly left: number; readonly top: number }): void {
    el.selectionAction.hidden = false;
    el.selectionAction.style.left = `${position.left}px`;
    el.selectionAction.style.top = `${position.top}px`;
  }

  function hideAction(): void {
    pendingAction = undefined;
    el.selectionAction.hidden = true;
    delete el.selectionAction.dataset.reviewActionKind;
    el.selectionAction.removeAttribute('aria-label');
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
      clearDrawerError();
      render();
    } catch (error) {
      artifact = previous;
      showDrawerError(
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
    clearDrawerError();
  }

  function syncToggle(): void {
    el.toggle.setAttribute('aria-expanded', String(el.dialog.open));
    el.toggleLabel.textContent = el.dialog.open ? strings.closeReview : strings.review;
  }

  function showDrawerError(message: string): void {
    el.drawerError.textContent = message;
    el.drawerError.hidden = false;
  }

  function clearDrawerError(): void {
    el.drawerError.textContent = '';
    el.drawerError.hidden = true;
  }

  function showPopoverError(message: string): void {
    el.popoverError.textContent = message;
    el.popoverError.hidden = false;
  }

  function clearPopoverError(): void {
    el.popoverError.textContent = '';
    el.popoverError.hidden = true;
  }

  function repositionOverlays(): void {
    if (pendingAction?.kind === 'create') updateSelectionAction(false);
    positionPopover();
    for (const entry of renderedSelections) {
      const marker = markerHost.querySelector<HTMLButtonElement>(
        `[data-review-highlight-marker="${CSS.escape(entry.thread.id)}"]`,
      );
      if (marker) positionMarker(marker, entry.range);
    }
  }

  function scheduleReposition(): void {
    if (el.popover.hidden && pendingAction === undefined && renderedSelections.length === 0) return;
    if (repositionFrame !== undefined) return;
    repositionFrame = window.requestAnimationFrame(() => {
      repositionFrame = undefined;
      repositionOverlays();
    });
  }

  function positionPopover(): void {
    if (el.popover.hidden || !popoverAnchor) return;
    const rect = popoverAnchor instanceof Range ? rangeAnchorRect(popoverAnchor) : popoverAnchor;
    const gutter = 8;
    const gap = 10;
    const width = el.popover.offsetWidth;
    const height = el.popover.offsetHeight;
    const rightFits = rect.right + gap + width <= window.innerWidth - gutter;
    const leftFits = rect.left - gap - width >= gutter;
    const left = rightFits
      ? rect.right + gap
      : leftFits
        ? rect.left - gap - width
        : Math.min(
            Math.max(rect.left + rect.width / 2 - width / 2, gutter),
            window.innerWidth - width - gutter,
          );
    const below = rect.bottom + gap;
    const top =
      rightFits || leftFits
        ? Math.min(Math.max(rect.top - gap, gutter), window.innerHeight - height - gutter)
        : below + height <= window.innerHeight - gutter
          ? below
          : Math.max(gutter, rect.top - height - gap);
    el.popover.style.left = `${left}px`;
    el.popover.style.top = `${top}px`;
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
    drawerError: find<HTMLElement>('[data-review-error]'),
    summary: find<HTMLOutputElement>('[data-review-summary]'),
    selectionAction: find<HTMLButtonElement>('[data-review-selection-action]'),
    currentSection: find<HTMLElement>('[data-review-current-section]'),
    currentList: find<HTMLOListElement>('[data-review-current-list]'),
    popover: find<HTMLElement>('[data-review-popover]'),
    popoverClose: find<HTMLButtonElement>('[data-review-popover-close]'),
    popoverError: find<HTMLElement>('[data-review-popover-error]'),
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
    map.set(target.id, { target, element, label: visibleLabel(target, element) });
  }
  return map;
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

function captureSelection(targets: ReadonlyMap<string, TargetDom>):
  | {
      readonly subject: ReviewSubject;
      readonly range: Range;
      readonly position: { left: number; top: number };
    }
  | undefined {
  const selection = window.getSelection();
  if (selection?.rangeCount !== 1 || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  if (rangeTouchesPackageControl(range)) return;
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
    const rect = rangeAnchorRect(range);
    return {
      subject: { target: start.target, selection: anchor, label: compactQuote(quote) },
      range: range.cloneRange(),
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
  return range.toString().normalize('NFC');
}

function rangeTouchesPackageControl(range: Range): boolean {
  const selector =
    'button, input, select, textarea, [role="button"], [role="textbox"], [contenteditable="true"]';
  const start =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  const end =
    range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement;
  return Boolean(
    start?.closest(selector) ||
    end?.closest(selector) ||
    range.cloneContents().querySelector(selector),
  );
}

function reconstructRange(
  anchor: ReviewSelectionAnchor,
  targets: ReadonlyMap<
    string,
    { readonly target: ReviewTargetReference; readonly element: HTMLElement }
  >,
): Range | undefined {
  const start = targets.get(anchor.start.target.id);
  const end = targets.get(anchor.end.target.id);
  if (
    !start ||
    !end ||
    JSON.stringify(start.target) !== JSON.stringify(anchor.start.target) ||
    JSON.stringify(end.target) !== JSON.stringify(anchor.end.target)
  )
    return;
  const startPoint = pointAtCodePointOffset(start.element, anchor.start.offset);
  const endPoint = pointAtCodePointOffset(end.element, anchor.end.offset);
  if (!startPoint || !endPoint) return;
  const range = document.createRange();
  try {
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
  } catch {
    return;
  }
  return !range.collapsed && selectedQuote(range) === anchor.quote ? range : undefined;
}

function rangeAnchorRect(range: Range): DOMRect {
  const rectangles = [...range.getClientRects()].filter(
    (rect) => rect.width > 0 || rect.height > 0,
  );
  return rectangles.at(-1) ?? range.getBoundingClientRect();
}

function positionMarker(marker: HTMLButtonElement, range: Range): void {
  const rect = rangeAnchorRect(range);
  marker.style.left = `${Math.min(rect.right, window.innerWidth - 4)}px`;
  marker.style.top = `${Math.min(Math.max(rect.top, 4), window.innerHeight - 4)}px`;
}

function compactQuote(value: string): string {
  const compact = value.replace(/\s+/gu, ' ').trim();
  return compact.length <= 120 ? compact : `${compact.slice(0, 117)}…`;
}

function highlightRegistry(): HighlightRegistry | undefined {
  return (CSS as typeof CSS & { readonly highlights?: HighlightRegistry }).highlights;
}

function highlightConstructor(): HighlightConstructor | undefined {
  return (globalThis as typeof globalThis & { readonly Highlight?: HighlightConstructor })
    .Highlight;
}

function compareRenderedSelections(left: RenderedSelection, right: RenderedSelection): number {
  if (left.segment.resolved !== right.segment.resolved) return left.segment.resolved ? 1 : -1;
  const length =
    Array.from(left.segment.selection?.quote ?? '').length -
    Array.from(right.segment.selection?.quote ?? '').length;
  return length || compare(left.thread.id, right.thread.id);
}

function rangeContainsViewportPoint(range: Range, x: number, y: number): boolean {
  return [...range.getClientRects()].some(
    (rect) => rect.left <= x && x <= rect.right && rect.top <= y && y <= rect.bottom,
  );
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
  return reconstructRange(anchor, targets) !== undefined;
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

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
