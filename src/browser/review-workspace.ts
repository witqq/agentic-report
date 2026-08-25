import {
  MAX_REVIEW_FILE_BYTES,
  MAX_REVIEW_NAME_LENGTH,
  MAX_REVIEW_TEXT_LENGTH,
  REVIEW_CONTRACT_VERSION,
  ReviewContractError,
  assertReviewRequirements,
  constrainReviewText,
  parseReviewArtifact,
  parseReviewTargetManifest,
  serializeReviewArtifact,
  type ReviewArtifact,
  type ReviewChecklistResponse,
  type ReviewDecisionResponse,
  type ReviewFeedbackKind,
  type ReviewFeedbackResponse,
  type ReviewResponse,
  type ReviewTargetManifest,
  type ReviewTargetReference,
  type ReviewVerdict,
  type ReviewVerdictResponse,
} from '../review/contract.js';
import type { ResolvedReviewArtifact } from '../review/binding.js';

const REVIEW_DOWNLOAD_NAME = 'review.json';
const mobileReview = window.matchMedia('(max-width: 56.99rem)');

interface ReviewElements {
  readonly dialog: HTMLDialogElement;
  readonly toggle: HTMLButtonElement;
  readonly toggleLabel: HTMLElement;
  readonly toggleCount: HTMLElement;
  readonly close: HTMLButtonElement;
  readonly exit: HTMLButtonElement;
  readonly error: HTMLElement;
  readonly summary: HTMLOutputElement;
  readonly reviewer: HTMLInputElement;
  readonly pageVerdict: HTMLSelectElement;
  readonly pageRationale: HTMLTextAreaElement;
  readonly pageRationaleField: HTMLElement;
  readonly targetEditor: HTMLElement;
  readonly targetLabel: HTMLElement;
  readonly targetVerdict: HTMLSelectElement;
  readonly targetRationale: HTMLTextAreaElement;
  readonly targetRationaleField: HTMLElement;
  readonly feedbackKind: HTMLSelectElement;
  readonly feedbackMessage: HTMLTextAreaElement;
  readonly addFeedback: HTMLButtonElement;
  readonly cancelEdit: HTMLButtonElement;
  readonly responseList: HTMLOListElement;
  readonly empty: HTMLElement;
  readonly importInput: HTMLInputElement;
  readonly exportButton: HTMLButtonElement;
  readonly componentSection: HTMLElement;
  readonly componentList: HTMLElement;
}

interface TargetDom {
  readonly target: ReviewTargetReference;
  readonly element: HTMLElement;
  readonly control: HTMLButtonElement;
  readonly label: string;
}

export function installReviewWorkspace(): void {
  const template = document.querySelector<HTMLTemplateElement>('template[data-review-manifest]');
  const toggle = document.querySelector<HTMLButtonElement>('[data-review-toggle]');
  if (template === null || toggle === null) return;

  let manifest: ReviewTargetManifest;
  try {
    manifest = parseReviewTargetManifest(JSON.parse(template.content.textContent ?? '') as unknown);
  } catch {
    toggle.disabled = true;
    toggle.dataset.reviewUnavailable = '';
    const label = toggle.querySelector<HTMLElement>('[data-review-toggle-label]');
    if (label !== null) label.textContent = 'Review unavailable';
    return;
  }

  const elements = collectElements(toggle);
  if (elements === undefined) return;
  const targetDom = collectTargetDom(manifest);
  if (targetDom === undefined) {
    elements.toggle.disabled = true;
    elements.toggleLabel.textContent = 'Review unavailable';
    return;
  }
  const prior = readPriorReview();
  createReviewController(manifest, targetDom, elements, prior);
}

function createReviewController(
  manifest: ReviewTargetManifest,
  targets: ReadonlyMap<string, TargetDom>,
  elements: ReviewElements,
  prior:
    { readonly artifact: ReviewArtifact; readonly resolved: ResolvedReviewArtifact } | undefined,
): void {
  let artifact =
    prior?.resolved.reportStatus === 'exact'
      ? parseReviewArtifact(prior.artifact)
      : emptyArtifact(manifest.reportRevision);
  let active = false;
  let selectedTargetId: string | undefined;
  let editingResponseId: string | undefined;
  let panelOpener: HTMLButtonElement = elements.toggle;
  let limitErrorElement: HTMLInputElement | HTMLTextAreaElement | undefined;
  const requirements = manifest.requirements ?? { decisions: [], checklists: [] };

  installCodePointLimit(elements.reviewer, MAX_REVIEW_NAME_LENGTH, 'Reviewer name');
  for (const textarea of [
    elements.pageRationale,
    elements.targetRationale,
    elements.feedbackMessage,
  ]) {
    installCodePointLimit(textarea, MAX_REVIEW_TEXT_LENGTH, 'Review text');
  }

  elements.toggle.addEventListener('click', () => {
    if (!active) {
      activateReview();
      openPanel(elements.toggle);
    } else if (elements.dialog.open) {
      exitReview();
    } else {
      openPanel(elements.toggle);
    }
  });
  elements.close.addEventListener('click', () => closePanel());
  elements.exit.addEventListener('click', () => exitReview());
  elements.dialog.addEventListener('click', (event) => {
    if (event.target === elements.dialog && mobileReview.matches) closePanel();
  });
  elements.dialog.addEventListener('close', () => {
    document.documentElement.removeAttribute('data-review-open');
    syncToggle();
    panelOpener.focus({ preventScroll: true });
  });
  mobileReview.addEventListener('change', () => {
    if (!elements.dialog.open) return;
    elements.dialog.close();
    queueMicrotask(() => openPanel(panelOpener));
  });

  for (const item of targets.values()) {
    item.control.addEventListener('click', () => {
      selectTarget(item.target.id);
      openPanel(item.control);
    });
  }

  elements.reviewer.addEventListener('input', () => {
    const name = normalizeText(elements.reviewer.value);
    const { reviewer: _reviewer, ...withoutReviewer } = artifact;
    artifact = name.length === 0 ? withoutReviewer : { ...withoutReviewer, reviewer: { name } };
    renderSummary();
  });
  elements.pageVerdict.addEventListener('change', () => {
    const verdict = reviewVerdict(elements.pageVerdict.value);
    const rationale = normalizeText(elements.pageRationale.value);
    const { pageVerdict: _pageVerdict, ...withoutPageVerdict } = artifact;
    artifact =
      verdict === undefined
        ? withoutPageVerdict
        : {
            ...withoutPageVerdict,
            pageVerdict: { verdict, ...(rationale.length === 0 ? {} : { rationale }) },
          };
    render();
  });
  elements.pageRationale.addEventListener('input', () => {
    const verdict = artifact.pageVerdict?.verdict;
    if (verdict === undefined) return;
    const rationale = normalizeText(elements.pageRationale.value);
    artifact = {
      ...artifact,
      pageVerdict: { verdict, ...(rationale.length === 0 ? {} : { rationale }) },
    };
    renderSummary();
  });
  elements.targetVerdict.addEventListener('change', () => updateTargetVerdict(true));
  elements.targetRationale.addEventListener('input', () => updateTargetVerdict(false));
  elements.addFeedback.addEventListener('click', () => saveFeedback());
  elements.cancelEdit.addEventListener('click', () => clearFeedbackEditor());
  elements.responseList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const edit = target.closest<HTMLButtonElement>('[data-review-response-edit]');
    if (edit !== null) editFeedback(edit.dataset.reviewResponseEdit ?? '');
    const remove = target.closest<HTMLButtonElement>('[data-review-response-remove]');
    if (remove !== null) removeResponse(remove.dataset.reviewResponseRemove ?? '');
  });
  elements.importInput.addEventListener('change', () => void importReview());
  elements.exportButton.addEventListener('click', () => exportReview());
  elements.componentList.addEventListener('change', (event) => updateComponent(event));
  elements.componentList.addEventListener('input', (event) => updateComponent(event));

  render();

  function activateReview(): void {
    active = true;
    document.documentElement.dataset.reviewActive = '';
    for (const item of targets.values()) item.control.hidden = false;
    syncToggle();
  }

  function exitReview(): void {
    active = false;
    selectedTargetId = undefined;
    editingResponseId = undefined;
    document.documentElement.removeAttribute('data-review-active');
    for (const item of targets.values()) {
      item.control.hidden = true;
      item.element.removeAttribute('data-review-selected');
    }
    panelOpener = elements.toggle;
    if (elements.dialog.open) elements.dialog.close();
    else syncToggle();
  }

  function openPanel(opener: HTMLButtonElement): void {
    panelOpener = opener;
    if (!active) activateReview();
    if (!elements.dialog.open) {
      if (mobileReview.matches) elements.dialog.showModal();
      else elements.dialog.show();
    }
    document.documentElement.dataset.reviewOpen = '';
    syncToggle();
    const focusTarget =
      selectedTargetId === undefined ? elements.reviewer : elements.feedbackMessage;
    focusTarget.focus({ preventScroll: true });
  }

  function closePanel(): void {
    if (elements.dialog.open) elements.dialog.close();
  }

  function selectTarget(targetId: string): void {
    selectedTargetId = targetId;
    clearFeedbackEditor();
    for (const item of targets.values()) {
      item.element.toggleAttribute('data-review-selected', item.target.id === targetId);
    }
    renderTargetEditor();
  }

  function updateTargetVerdict(renderAll: boolean): void {
    const selected = selectedTarget();
    if (selected === undefined) return;
    const verdict = reviewVerdict(elements.targetVerdict.value);
    const withoutVerdict = artifact.responses.filter(
      (response) => !(response.kind === 'verdict' && response.target.id === selected.id),
    );
    if (verdict === undefined) artifact = { ...artifact, responses: withoutVerdict };
    else {
      const rationale = normalizeText(elements.targetRationale.value);
      const response: ReviewVerdictResponse = {
        id: `verdict-${selected.id}`,
        kind: 'verdict',
        target: selected,
        verdict,
        ...(rationale.length === 0 ? {} : { rationale }),
      };
      artifact = { ...artifact, responses: [...withoutVerdict, response] };
    }
    if (renderAll) render();
    else {
      renderResponses();
      renderSummary();
      syncTargetControls();
    }
  }

  function saveFeedback(): void {
    const selected = selectedTarget();
    if (selected === undefined) return;
    const message = normalizeText(elements.feedbackMessage.value);
    if (message.length === 0) {
      showError('Enter feedback before adding it.');
      elements.feedbackMessage.focus();
      return;
    }
    const kind = feedbackKind(elements.feedbackKind.value);
    const response: ReviewFeedbackResponse = {
      id: feedbackId(selected.id, kind, message),
      kind,
      target: selected,
      message,
    };
    const retained = artifact.responses.filter((candidate) => candidate.id !== editingResponseId);
    if (retained.some((candidate) => candidate.id === response.id)) {
      showError('This feedback already exists for the selected block.');
      return;
    }
    artifact = { ...artifact, responses: [...retained, response] };
    clearFeedbackEditor();
    clearError();
    render();
  }

  function editFeedback(responseId: string): void {
    const response = artifact.responses.find(
      (candidate): candidate is ReviewFeedbackResponse =>
        candidate.id === responseId && isFeedback(candidate),
    );
    if (response === undefined) return;
    selectTarget(response.target.id);
    editingResponseId = response.id;
    elements.feedbackKind.value = response.kind;
    elements.feedbackMessage.value = response.message;
    elements.addFeedback.textContent = 'Save feedback';
    elements.cancelEdit.hidden = false;
    openPanel(targets.get(response.target.id)?.control ?? elements.toggle);
  }

  function removeResponse(responseId: string): void {
    artifact = {
      ...artifact,
      responses: artifact.responses.filter((response) => response.id !== responseId),
    };
    if (editingResponseId === responseId) clearFeedbackEditor();
    render();
  }

  function clearFeedbackEditor(): void {
    editingResponseId = undefined;
    elements.feedbackKind.value = 'comment';
    elements.feedbackMessage.value = '';
    elements.addFeedback.textContent = 'Add feedback';
    elements.cancelEdit.hidden = true;
  }

  async function importReview(): Promise<void> {
    const file = elements.importInput.files?.[0];
    elements.importInput.value = '';
    if (file === undefined) return;
    if (file.size > MAX_REVIEW_FILE_BYTES) {
      showError(`Review files must be no larger than ${MAX_REVIEW_FILE_BYTES} bytes.`);
      return;
    }
    try {
      const imported = parseReviewArtifact(JSON.parse(await file.text()) as unknown);
      if (imported.report.revision !== manifest.reportRevision) {
        showError('This review belongs to a different report revision.');
        return;
      }
      validateImportedTargets(imported, manifest);
      assertReviewRequirements(imported, requirements);
      artifact = imported;
      selectedTargetId = undefined;
      clearFeedbackEditor();
      clearError();
      render();
    } catch (error) {
      showError(reviewErrorMessage(error, 'Review import failed.'));
    }
  }

  function exportReview(): void {
    try {
      const serialized = serializeReviewArtifact(artifact);
      assertReviewRequirements(artifact, requirements);
      const url = URL.createObjectURL(
        new Blob([serialized], { type: 'application/json;charset=utf-8' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = REVIEW_DOWNLOAD_NAME;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      clearError();
    } catch (error) {
      showError(reviewErrorMessage(error, 'Review export failed.'));
    }
  }

  function render(): void {
    elements.reviewer.value = artifact.reviewer?.name ?? '';
    elements.pageVerdict.value = artifact.pageVerdict?.verdict ?? '';
    elements.pageRationale.value = artifact.pageVerdict?.rationale ?? '';
    elements.pageRationaleField.hidden = !requiresRationale(artifact.pageVerdict?.verdict);
    renderTargetEditor();
    renderResponses();
    renderComponents();
    renderSummary();
    syncTargetControls();
  }

  function renderTargetEditor(): void {
    const selected = selectedTarget();
    elements.targetEditor.hidden = selected === undefined;
    if (selected === undefined) return;
    const item = targets.get(selected.id);
    elements.targetLabel.textContent = targetLabel(item);
    const verdict = artifact.responses.find(
      (response): response is ReviewVerdictResponse =>
        response.kind === 'verdict' && response.target.id === selected.id,
    );
    elements.targetVerdict.value = verdict?.verdict ?? '';
    elements.targetRationale.value = verdict?.rationale ?? '';
    elements.targetRationaleField.hidden = !requiresRationale(verdict?.verdict);
  }

  function renderResponses(): void {
    elements.responseList.replaceChildren();
    const ordered = [...artifact.responses].sort((left, right) => compare(left.id, right.id));
    elements.empty.hidden = ordered.length > 0;
    for (const response of ordered) {
      const item = document.createElement('li');
      item.className = 'review-response';
      const body = document.createElement('div');
      const kind = document.createElement('span');
      kind.className = 'review-response-kind';
      kind.textContent = `${responseLabel(response)} · ${targetLabel(targets.get(response.target.id))}`;
      const text = document.createElement('p');
      text.textContent = responseText(response);
      body.append(kind, text);
      const actions = document.createElement('div');
      actions.className = 'review-response-actions';
      if (isFeedback(response)) {
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.textContent = 'Edit';
        edit.dataset.reviewResponseEdit = response.id;
        actions.append(edit);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.dataset.reviewResponseRemove = response.id;
      actions.append(remove);
      item.append(body, actions);
      elements.responseList.append(item);
    }
    if (prior?.resolved.reportStatus === 'stale') {
      for (const priorResponse of prior.resolved.responses) {
        const item = document.createElement('li');
        item.className = 'review-response';
        item.textContent = `Prior · ${priorResponse.binding} · ${responseLabel(priorResponse.response)} · ${responseText(priorResponse.response)}`;
        elements.responseList.append(item);
      }
      elements.empty.hidden = false;
    }
  }

  function renderSummary(): void {
    const feedback = artifact.responses.filter(isFeedback).length;
    const verdicts = artifact.responses.filter((response) => response.kind === 'verdict').length;
    const blockers = artifact.responses.filter(
      (response) =>
        response.kind === 'blocker' ||
        (response.kind === 'verdict' && response.verdict !== 'approve'),
    ).length;
    const decisions = artifact.responses.filter((response) => response.kind === 'decision').length;
    const checklists = artifact.responses.filter(
      (response) => response.kind === 'checklist',
    ).length;
    elements.summary.textContent = `${feedback} feedback · ${verdicts} block verdicts · ${blockers} blocking · ${decisions} decisions · ${checklists} checklists`;
    elements.toggleCount.hidden = artifact.responses.length === 0;
    elements.toggleCount.textContent = String(artifact.responses.length);
  }

  function renderComponents(): void {
    elements.componentSection.hidden =
      requirements.decisions.length === 0 && requirements.checklists.length === 0;
    elements.componentList.replaceChildren();
    for (const decision of requirements.decisions) {
      const response = artifact.responses.find(
        (candidate): candidate is ReviewDecisionResponse =>
          candidate.kind === 'decision' && candidate.target.id === decision.targetId,
      );
      const field = document.createElement('fieldset');
      field.className = 'review-component';
      const legend = document.createElement('legend');
      legend.textContent = `${decision.title ?? 'Decision'}${decision.required ? ' · required' : ' · optional'}`;
      field.append(legend);
      const select = document.createElement('select');
      select.dataset.reviewDecision = decision.targetId;
      const decisionTitle = decision.title ?? 'Decision';
      select.setAttribute('aria-label', `${decisionTitle} decision state`);
      appendOption(select, '', 'Unanswered');
      appendOption(select, 'open', 'Open');
      appendOption(select, 'deferred', 'Deferred');
      for (const optionId of decision.optionIds) {
        appendOption(select, optionId, decision.optionLabels?.[optionId] ?? optionId);
      }
      select.value = response?.optionId ?? '';
      field.append(select);
      const rationale = document.createElement('textarea');
      rationale.dataset.reviewDecisionRationale = decision.targetId;
      rationale.placeholder = 'Optional rationale';
      rationale.setAttribute('aria-label', `${decisionTitle} decision rationale`);
      rationale.value = response?.rationale ?? '';
      installCodePointLimit(rationale, MAX_REVIEW_TEXT_LENGTH, 'Decision rationale');
      field.append(rationale);
      elements.componentList.append(field);
    }
    for (const checklist of requirements.checklists) {
      const response = artifact.responses.find(
        (candidate): candidate is ReviewChecklistResponse =>
          candidate.kind === 'checklist' && candidate.target.id === checklist.targetId,
      );
      const field = document.createElement('fieldset');
      field.className = 'review-component';
      const legend = document.createElement('legend');
      legend.textContent = checklist.title ?? 'Checklist';
      field.append(legend);
      for (const item of checklist.items) {
        const row = document.createElement('label');
        const itemLabel = item.label ?? item.itemId;
        row.textContent = `${itemLabel}${item.required ? ' · required' : ' · optional'}`;
        const select = document.createElement('select');
        select.dataset.reviewChecklist = checklist.targetId;
        select.dataset.reviewChecklistItem = item.itemId;
        select.setAttribute(
          'aria-label',
          `${itemLabel} checklist status${item.required ? ' (required)' : ' (optional)'}`,
        );
        appendOption(select, 'unchecked', 'Unchecked');
        appendOption(select, 'checked', 'Checked');
        appendOption(select, 'not-applicable', 'Not applicable');
        const current = response?.items.find((candidate) => candidate.itemId === item.itemId);
        select.value = current?.status ?? 'unchecked';
        const note = document.createElement('textarea');
        note.dataset.reviewChecklistNote = checklist.targetId;
        note.dataset.reviewChecklistItem = item.itemId;
        note.placeholder = 'Note (required for not applicable)';
        note.setAttribute('aria-label', `${itemLabel} checklist note`);
        note.value = current?.note ?? '';
        installCodePointLimit(note, MAX_REVIEW_TEXT_LENGTH, 'Checklist note');
        row.append(select, note);
        field.append(row);
      }
      elements.componentList.append(field);
    }
  }

  function updateComponent(event: Event): void {
    const element = event.target;
    if (!(element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) return;
    const decisionId = element.dataset.reviewDecision ?? element.dataset.reviewDecisionRationale;
    if (decisionId !== undefined) {
      const select = elements.componentList.querySelector<HTMLSelectElement>(
        `[data-review-decision="${CSS.escape(decisionId)}"]`,
      );
      const rationale = elements.componentList.querySelector<HTMLTextAreaElement>(
        `[data-review-decision-rationale="${CSS.escape(decisionId)}"]`,
      );
      const retained = artifact.responses.filter(
        (candidate) => !(candidate.kind === 'decision' && candidate.target.id === decisionId),
      );
      if (select?.value === '') artifact = { ...artifact, responses: retained };
      else {
        const target = manifestTarget(manifest, decisionId);
        if (target !== undefined)
          artifact = {
            ...artifact,
            responses: [
              ...retained,
              {
                id: `decision-${decisionId}`,
                kind: 'decision',
                target,
                optionId: select?.value ?? 'open',
                ...(normalizeText(rationale?.value ?? '') === ''
                  ? {}
                  : { rationale: normalizeText(rationale?.value ?? '') }),
              },
            ],
          };
      }
      renderSummary();
      return;
    }
    const checklistId = element.dataset.reviewChecklist ?? element.dataset.reviewChecklistNote;
    if (checklistId === undefined) return;
    const requirement = requirements.checklists.find((item) => item.targetId === checklistId);
    const target = manifestTarget(manifest, checklistId);
    if (requirement === undefined || target === undefined) return;
    const items = requirement.items.map((item) => {
      const status = elements.componentList.querySelector<HTMLSelectElement>(
        `[data-review-checklist="${CSS.escape(checklistId)}"][data-review-checklist-item="${CSS.escape(item.itemId)}"]`,
      )?.value as 'checked' | 'unchecked' | 'not-applicable';
      const note = normalizeText(
        elements.componentList.querySelector<HTMLTextAreaElement>(
          `[data-review-checklist-note="${CSS.escape(checklistId)}"][data-review-checklist-item="${CSS.escape(item.itemId)}"]`,
        )?.value ?? '',
      );
      return { itemId: item.itemId, status, ...(note === '' ? {} : { note }) };
    });
    artifact = {
      ...artifact,
      responses: [
        ...artifact.responses.filter(
          (candidate) => !(candidate.kind === 'checklist' && candidate.target.id === checklistId),
        ),
        { id: `checklist-${checklistId}`, kind: 'checklist', target, items },
      ],
    };
    renderSummary();
  }

  function syncTargetControls(): void {
    for (const item of targets.values()) {
      const count = artifact.responses.filter(
        (response) => response.target.id === item.target.id,
      ).length;
      item.control.textContent = count === 0 ? 'Review block' : `Review block · ${count}`;
      item.control.setAttribute('aria-label', `${item.control.textContent}: ${targetLabel(item)}`);
    }
  }

  function syncToggle(): void {
    elements.toggle.setAttribute('aria-expanded', String(elements.dialog.open));
    elements.toggleLabel.textContent = !active
      ? 'Review'
      : elements.dialog.open
        ? 'Exit review'
        : 'Open review';
  }

  function selectedTarget(): ReviewTargetReference | undefined {
    return selectedTargetId === undefined ? undefined : manifestTarget(manifest, selectedTargetId);
  }

  function installCodePointLimit(
    element: HTMLInputElement | HTMLTextAreaElement,
    limit: number,
    label: string,
  ): void {
    element.addEventListener('input', () => {
      const constrained = constrainReviewText(element.value, limit);
      if (constrained.truncated) {
        element.value = constrained.input;
        limitErrorElement = element;
        showError(`${label} is limited to ${limit} Unicode characters.`, false);
      } else {
        if (element.value !== constrained.input) element.value = constrained.input;
        if (limitErrorElement === element) {
          limitErrorElement = undefined;
          clearError();
        }
      }
    });
  }

  function showError(message: string, moveFocus = true): void {
    if (moveFocus) limitErrorElement = undefined;
    elements.error.hidden = false;
    elements.error.textContent = message;
    elements.error.tabIndex = -1;
    document.documentElement.dataset.reviewInvalid = '';
    if (moveFocus) {
      elements.error.focus();
      elements.error.scrollIntoView({ block: 'start' });
    }
  }

  function clearError(): void {
    limitErrorElement = undefined;
    elements.error.hidden = true;
    elements.error.textContent = '';
    document.documentElement.removeAttribute('data-review-invalid');
  }
}

function readPriorReview():
  { readonly artifact: ReviewArtifact; readonly resolved: ResolvedReviewArtifact } | undefined {
  const template = document.querySelector<HTMLTemplateElement>('template[data-prior-review]');
  if (template === null) return undefined;
  try {
    return JSON.parse(template.content.textContent ?? '') as {
      readonly artifact: ReviewArtifact;
      readonly resolved: ResolvedReviewArtifact;
    };
  } catch {
    return undefined;
  }
}

function collectElements(toggle: HTMLButtonElement): ReviewElements | undefined {
  const dialog = document.querySelector<HTMLDialogElement>('[data-review-dialog]');
  const values = {
    dialog,
    toggle,
    toggleLabel: toggle.querySelector<HTMLElement>('[data-review-toggle-label]'),
    toggleCount: toggle.querySelector<HTMLElement>('[data-review-toggle-count]'),
    close: document.querySelector<HTMLButtonElement>('[data-review-close]'),
    exit: document.querySelector<HTMLButtonElement>('[data-review-exit]'),
    error: document.querySelector<HTMLElement>('[data-review-error]'),
    summary: document.querySelector<HTMLOutputElement>('[data-review-summary]'),
    reviewer: document.querySelector<HTMLInputElement>('[data-reviewer-name]'),
    pageVerdict: document.querySelector<HTMLSelectElement>('[data-review-page-verdict]'),
    pageRationale: document.querySelector<HTMLTextAreaElement>('[data-review-page-rationale]'),
    pageRationaleField: document.querySelector<HTMLElement>('[data-review-page-rationale-field]'),
    targetEditor: document.querySelector<HTMLElement>('[data-review-target-editor]'),
    targetLabel: document.querySelector<HTMLElement>('[data-review-target-label]'),
    targetVerdict: document.querySelector<HTMLSelectElement>('[data-review-target-verdict]'),
    targetRationale: document.querySelector<HTMLTextAreaElement>('[data-review-target-rationale]'),
    targetRationaleField: document.querySelector<HTMLElement>(
      '[data-review-target-rationale-field]',
    ),
    feedbackKind: document.querySelector<HTMLSelectElement>('[data-review-feedback-kind]'),
    feedbackMessage: document.querySelector<HTMLTextAreaElement>('[data-review-feedback-message]'),
    addFeedback: document.querySelector<HTMLButtonElement>('[data-review-add-feedback]'),
    cancelEdit: document.querySelector<HTMLButtonElement>('[data-review-cancel-edit]'),
    responseList: document.querySelector<HTMLOListElement>('[data-review-response-list]'),
    empty: document.querySelector<HTMLElement>('[data-review-empty]'),
    importInput: document.querySelector<HTMLInputElement>('[data-review-import]'),
    exportButton: document.querySelector<HTMLButtonElement>('[data-review-export]'),
    componentSection: document.querySelector<HTMLElement>('[data-review-components]'),
    componentList: document.querySelector<HTMLElement>('[data-review-component-list]'),
  };
  return Object.values(values).some((value) => value === null)
    ? undefined
    : (values as ReviewElements);
}

function appendOption(select: HTMLSelectElement, value: string, label: string): void {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.append(option);
}

function collectTargetDom(
  manifest: ReviewTargetManifest,
): ReadonlyMap<string, TargetDom> | undefined {
  const elements = new Map(
    [...document.querySelectorAll<HTMLElement>('[data-review-target]')].map((element) => [
      element.dataset.reviewTarget ?? '',
      element,
    ]),
  );
  const labels = new Map(
    [...elements].map(([id, element]) => [
      id,
      visibleTargetLabel(manifestTarget(manifest, id), element),
    ]),
  );
  const targets = new Map<string, TargetDom>();
  for (const target of manifest.targets) {
    const element = elements.get(target.id);
    if (element === undefined || targets.has(target.id)) return undefined;
    element.classList.add('review-target');
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'review-target-control';
    control.hidden = true;
    control.dataset.reviewTargetControl = target.id;
    control.textContent = 'Review block';
    element.before(control);
    targets.set(target.id, {
      target,
      element,
      control,
      label: labels.get(target.id) ?? target.kind,
    });
  }
  return targets.size === manifest.targets.length ? targets : undefined;
}

function emptyArtifact(reportRevision: string): ReviewArtifact {
  return {
    contractVersion: REVIEW_CONTRACT_VERSION,
    report: { revision: reportRevision },
    responses: [],
  };
}

function validateImportedTargets(artifact: ReviewArtifact, manifest: ReviewTargetManifest): void {
  for (const response of artifact.responses) {
    const current = manifestTarget(manifest, response.target.id);
    if (current === undefined || !sameTarget(current, response.target)) {
      throw new Error(
        'Imported review contains a target that is not part of this report revision.',
      );
    }
  }
}

function reviewErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ReviewContractError) return error.issues[0]?.message ?? error.message;
  return error instanceof Error ? error.message : fallback;
}

function manifestTarget(
  manifest: ReviewTargetManifest,
  targetId: string,
): ReviewTargetReference | undefined {
  return manifest.targets.find((target) => target.id === targetId);
}

function sameTarget(left: ReviewTargetReference, right: ReviewTargetReference): boolean {
  return (
    left.id === right.id &&
    left.kind === right.kind &&
    left.fingerprint === right.fingerprint &&
    left.stableKey === right.stableKey &&
    left.source.file === right.source.file &&
    left.source.line === right.source.line &&
    left.source.column === right.source.column &&
    left.source.endLine === right.source.endLine &&
    left.source.endColumn === right.source.endColumn
  );
}

function reviewVerdict(value: string | undefined): ReviewVerdict | undefined {
  return value === 'approve' || value === 'revise' || value === 'reject' ? value : undefined;
}

function feedbackKind(value: string): ReviewFeedbackKind {
  return value === 'question' || value === 'change-request' || value === 'blocker'
    ? value
    : 'comment';
}

function requiresRationale(verdict: ReviewVerdict | undefined): boolean {
  return verdict === 'revise' || verdict === 'reject';
}

function isFeedback(response: ReviewResponse): response is ReviewFeedbackResponse {
  return (
    response.kind === 'comment' ||
    response.kind === 'question' ||
    response.kind === 'change-request' ||
    response.kind === 'blocker'
  );
}

function feedbackId(targetId: string, kind: ReviewFeedbackKind, message: string): string {
  return `feedback-${fnv1a64(`${targetId}\0${kind}\0${normalizeText(message)}`)}`;
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function normalizeText(value: string): string {
  return value.trim().normalize('NFC');
}

function targetLabel(item: TargetDom | undefined): string {
  return item?.label ?? 'Unknown review target';
}

function visibleTargetLabel(
  target: ReviewTargetReference | undefined,
  element: HTMLElement,
): string {
  const kind = (target?.kind ?? 'review target')
    .replace(/^(?:markdown|directive):/u, '')
    .replaceAll('-', ' ');
  const excerpt = (element.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 80);
  return excerpt.length === 0 ? kind : `${kind}: ${excerpt}`;
}

function responseLabel(response: ReviewResponse): string {
  if (response.kind === 'verdict') return `Block verdict · ${response.verdict}`;
  if (response.kind === 'decision') return 'Decision';
  if (response.kind === 'checklist') return 'Checklist';
  return response.kind.replace('-', ' ');
}

function responseText(response: ReviewResponse): string {
  if (isFeedback(response)) return response.message;
  if (response.kind === 'verdict') return response.rationale ?? response.verdict;
  if (response.kind === 'decision') return response.rationale ?? response.optionId;
  return `${response.items.length} checklist responses`;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
