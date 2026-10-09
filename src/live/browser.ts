import {
  MAX_LIVE_QUESTIONS,
  liveQuestionSchema,
  type LiveEvent,
  type LiveSnapshot,
  type LiveSubject,
  type LiveConversationMessage,
} from './contract.js';
import { renderMessage } from './message.js';
import { LIVE_THEME_TOKENS, type LiveViewSettings } from './view.js';

function find<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error('Live reader is incomplete.');
  return node;
}
const doc = find('[data-live-document]');
const layout = find('[data-live-layout]');
const panel = find('[id="live-discussion"]');
const title = find('[data-live-title]');
const status = find('[data-live-status]');
const session = find('[data-live-session]');
const history = find('[data-live-history]');
const historyNote = find('[data-live-history-note]');
const empty = find('[data-live-empty]');
const input = find<HTMLTextAreaElement>('[data-live-input]');
const form = find<HTMLFormElement>('[data-live-form]');
const sendButton = find<HTMLButtonElement>('[data-live-send]');
const quote = find('[data-live-quote]');
const clear = find<HTMLButtonElement>('[data-live-clear]');
const error = find('[data-live-error]');
const toggle = find<HTMLButtonElement>('[data-live-toggle]');
const queue = find<HTMLDetailsElement>('[data-live-queue]');
const queueList = find('[data-live-queue-list]');
const active = find('[data-live-active]');
const latest = find<HTMLButtonElement>('[data-live-new-messages]');
const settings = find('[data-live-settings]');
const settingsToggle = find<HTMLButtonElement>('[data-live-settings-toggle]');
const widthInput = find<HTMLInputElement>('[data-live-width]');
const resizer = find('[data-live-resizer]');
const schemeInput = find<HTMLSelectElement>('[data-live-scheme]');
const themeInput = find<HTMLSelectElement>('[data-live-theme]');
const highlightsInput = find<HTMLInputElement>('[data-live-highlights]');
let current: LiveSnapshot | undefined;
let subject: LiveSubject | undefined;
let frame: HTMLIFrameElement | undefined;
let pending: HTMLIFrameElement | undefined;
let reading: unknown;
let latestUrl: string | undefined;
let sending = false;
let requestId: string | undefined;
let requestError: string | undefined;
const mobile = matchMedia('(max-width:52rem)');
const origin = location.protocol === 'file:' ? 'null' : location.origin;
const preferencesKey = 'agentic-report.live.view';
let width = 416;
let view: LiveViewSettings = { highlights: true };
try {
  const saved = JSON.parse(localStorage.getItem(preferencesKey) ?? '{}') as Record<string, unknown>;
  if (typeof saved.width === 'number' && Number.isFinite(saved.width))
    width = Math.max(320, Math.min(720, saved.width));
  view = {
    highlights: typeof saved.highlights === 'boolean' ? saved.highlights : true,
    ...(saved.scheme === 'system' || saved.scheme === 'light' || saved.scheme === 'dark'
      ? { scheme: saved.scheme }
      : {}),
    ...(typeof saved.theme === 'string' && saved.theme.length <= 100 ? { theme: saved.theme } : {}),
  };
} catch {
  /* Browser storage is optional; the reader still works. */
}
function saveView(): void {
  try {
    localStorage.setItem(preferencesKey, JSON.stringify({ width, ...view }));
  } catch {
    /* Private browsing and denied storage do not disable controls. */
  }
}
function message(target: HTMLIFrameElement, type: string, value?: unknown): void {
  target.contentWindow?.postMessage(
    { protocol: 'agentic-report-live', type, value },
    origin === 'null' ? '*' : origin,
  );
}
function applyView(): void {
  if (frame) {
    message(frame, 'view-settings', view);
    message(frame, 'agent-state', current?.agent);
  }
  highlightsInput.checked = view.highlights;
}
function setWidth(value: number, save = true): void {
  const maximum = mobile.matches ? 720 : Math.max(320, Math.min(720, innerWidth - 352));
  width = Math.max(320, Math.min(720, value));
  const visibleWidth = Math.min(maximum, width);
  document.documentElement.style.setProperty('--live-panel-width', `${visibleWidth}px`);
  widthInput.max = String(maximum);
  widthInput.value = String(visibleWidth);
  resizer.setAttribute('aria-valuemax', String(maximum));
  resizer.setAttribute('aria-valuenow', String(Math.round(visibleWidth)));
  if (save) saveView();
}
setWidth(width, false);
widthInput.addEventListener('input', () => setWidth(Number(widthInput.value)));
resizer.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  setWidth(
    event.key === 'Home'
      ? 320
      : event.key === 'End'
        ? 720
        : Number(widthInput.value) + (event.key === 'ArrowLeft' ? 16 : -16),
  );
});
let drag: { x: number; width: number; pointer: number } | undefined;
resizer.addEventListener('pointerdown', (event) => {
  if (mobile.matches) return;
  drag = { x: event.clientX, width: Number(widthInput.value), pointer: event.pointerId };
  resizer.setPointerCapture(event.pointerId);
  event.preventDefault();
});
resizer.addEventListener('pointermove', (event) => {
  if (drag?.pointer === event.pointerId) setWidth(drag.width + drag.x - event.clientX);
});
resizer.addEventListener('lostpointercapture', () => {
  drag = undefined;
});
resizer.addEventListener('pointerup', () => {
  drag = undefined;
});
window.addEventListener('resize', () => setWidth(width, false));
settingsToggle.addEventListener('click', () => {
  settings.hidden = !settings.hidden;
  settingsToggle.setAttribute('aria-expanded', String(!settings.hidden));
});
schemeInput.addEventListener('change', () => {
  const scheme = schemeInput.value;
  if (scheme !== 'system' && scheme !== 'light' && scheme !== 'dark') return;
  view = { ...view, scheme };
  saveView();
  applyView();
});
themeInput.addEventListener('change', () => {
  const { theme: _theme, ...rest } = view;
  view = themeInput.value ? { ...rest, theme: themeInput.value } : rest;
  saveView();
  applyView();
});
highlightsInput.addEventListener('change', () => {
  view = { ...view, highlights: highlightsInput.checked };
  saveView();
  applyView();
});
find('[data-live-reset]').addEventListener('click', () => {
  view = { highlights: true };
  setWidth(416);
  if (frame) message(frame, 'view-reset');
  applyView();
});
function showDiscussion(show: boolean): void {
  panel.toggleAttribute('data-collapsed', !show);
  layout.toggleAttribute('data-chat-hidden', !show);
  toggle.setAttribute('aria-expanded', String(show));
}
showDiscussion(!mobile.matches);
toggle.addEventListener('click', () => showDiscussion(panel.hasAttribute('data-collapsed')));
find('[data-live-close]').addEventListener('click', () => {
  showDiscussion(false);
  frame?.focus();
});
function setSubject(value?: LiveSubject): void {
  subject = value;
  quote.hidden = !value;
  clear.hidden = !value;
  quote.textContent = value?.quote ?? '';
  requestId = undefined;
}
clear.addEventListener('click', () => setSubject());
function canSend(): boolean {
  return Boolean(current && ['ready', 'working', 'starting'].includes(current.agent));
}
function syncComposer(): void {
  sendButton.disabled = sending || !canSend() || !input.value.trim();
  input.style.height = 'auto';
  input.style.height = `${Math.min(160, Math.max(40, input.scrollHeight))}px`;
}
input.addEventListener('input', () => {
  requestId = undefined;
  syncComposer();
});
input.addEventListener('keydown', (event) => {
  if (
    event.key !== 'Enter' ||
    event.shiftKey ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.isComposing
  )
    return;
  event.preventDefault();
  if (!sendButton.disabled) form.requestSubmit();
});
function loadDocument(url: string): void {
  if (pending) pending.remove();
  const next = document.createElement('iframe');
  next.title = 'Live document';
  next.dataset.pending = '';
  next.setAttribute('aria-hidden', 'true');
  next.src = url;
  pending = next;
  doc.append(next);
}
interface QuestionElements {
  article: HTMLElement;
  badge: HTMLElement;
  quote: HTMLQuoteElement;
  quoteButton: HTMLButtonElement;
  binding: HTMLElement;
  text: HTMLElement;
  answer: HTMLElement;
  response: HTMLElement;
  system: HTMLElement;
  answerText?: string;
}
const messages = new Map<string, QuestionElements>();
const sessionMessages = new Map<
  string,
  { article: HTMLElement; text: HTMLElement; value: string }
>();
const messageKey = (item: LiveConversationMessage): string => `${item.turnId}:${item.id}`;
function projectedQuestions(snapshot: LiveSnapshot): Set<string> {
  return new Set(
    snapshot.conversation?.messages.flatMap((item) => (item.questionId ? [item.questionId] : [])) ??
      [],
  );
}
function renderConversation(snapshot: LiveSnapshot): void {
  const projected = projectedQuestions(snapshot);
  const wanted = new Set<string>();
  const ordered: HTMLElement[] = [];
  for (const q of snapshot.questions)
    if (!projected.has(q.id) && q.status !== 'queued' && q.status !== 'sending') {
      const node = messages.get(q.id)?.article;
      if (node) ordered.push(node);
    }
  const represented = new Set<string>();
  for (const item of snapshot.conversation?.messages ?? []) {
    const q = item.questionId ? messages.get(item.questionId) : undefined;
    if (q && item.questionId) {
      if (!represented.has(item.questionId)) ordered.push(q.article);
      represented.add(item.questionId);
      continue;
    }
    const key = messageKey(item);
    wanted.add(key);
    let node = sessionMessages.get(key);
    if (!node) {
      const article = document.createElement('article');
      article.className = 'live-question';
      article.dataset.messageId = key;
      const bubble = document.createElement('div');
      bubble.className = `live-message ${item.role === 'user' ? 'live-user' : 'live-answer'}`;
      bubble.dataset.liveRole = item.role;
      const meta = document.createElement('div');
      meta.className = 'live-message-meta';
      const role = document.createElement('span');
      role.className = 'live-role';
      role.textContent = item.role === 'user' ? 'You' : 'Agent';
      meta.append(role);
      const text = document.createElement(item.role === 'user' ? 'p' : 'div');
      text.className = item.role === 'user' ? 'live-text' : 'live-markdown';
      bubble.append(meta, text);
      article.append(bubble);
      node = { article, text, value: '' };
      sessionMessages.set(key, node);
    }
    if (node.value !== item.text) {
      if (item.role === 'user') node.text.textContent = item.text;
      else renderMessage(node.text, item.text);
      node.value = item.text;
    }
    ordered.push(node.article);
  }
  for (const q of snapshot.questions)
    if (!projected.has(q.id) && (q.status === 'queued' || q.status === 'sending')) {
      const node = messages.get(q.id)?.article;
      if (node) ordered.push(node);
    }
  for (const [id, node] of sessionMessages)
    if (!wanted.has(id)) {
      node.article.remove();
      sessionMessages.delete(id);
    }
  let previous: Element = empty;
  for (const article of ordered) {
    if (previous.nextElementSibling !== article)
      history.insertBefore(article, previous.nextSibling);
    previous = article;
  }
}
const cancelButtons = new Map<string, HTMLButtonElement>();
const cancelling = new Set<string>();
function atEnd(): boolean {
  return history.scrollHeight - history.scrollTop - history.clientHeight < 72;
}
function scrollLatest(): void {
  history.scrollTop = history.scrollHeight;
  latest.hidden = true;
}
latest.addEventListener('click', scrollLatest);
history.addEventListener('scroll', () => {
  if (atEnd()) latest.hidden = true;
});
function createQuestion(id: string): QuestionElements {
  const article = document.createElement('article');
  article.className = 'live-question';
  article.dataset.questionId = id;
  const user = document.createElement('div');
  user.className = 'live-message live-user';
  user.dataset.liveRole = 'user';
  const meta = document.createElement('div');
  meta.className = 'live-message-meta';
  const role = document.createElement('span');
  role.className = 'live-role';
  role.textContent = 'You';
  const badge = document.createElement('span');
  badge.className = 'live-badge';
  meta.append(role, badge);
  const block = document.createElement('blockquote');
  block.hidden = true;
  const quoteButton = document.createElement('button');
  quoteButton.type = 'button';
  quoteButton.className = 'live-quote-text';
  quoteButton.addEventListener('click', () => {
    const q = current?.questions.find((item) => item.id === id);
    if (frame && q?.binding === 'exact' && q.subject) message(frame, 'focus', q.subject.start.id);
    if (mobile.matches) showDiscussion(false);
  });
  block.append(quoteButton);
  const binding = document.createElement('span');
  binding.className = 'live-context-tag';
  const text = document.createElement('p');
  text.className = 'live-text';
  user.append(meta, block, binding, text);
  const answer = document.createElement('div');
  answer.className = 'live-message live-answer';
  answer.dataset.liveRole = 'agent';
  const agentMeta = document.createElement('div');
  agentMeta.className = 'live-message-meta';
  const agentRole = document.createElement('span');
  agentRole.className = 'live-role';
  agentRole.textContent = 'Agent';
  agentMeta.append(agentRole);
  const response = document.createElement('div');
  response.className = 'live-markdown';
  response.dataset.liveAnswer = id;
  answer.append(agentMeta, response);
  const system = document.createElement('p');
  system.className = 'live-system';
  system.dataset.liveRole = 'system';
  system.hidden = true;
  article.append(user, answer, system);
  history.append(article);
  const item = {
    article,
    badge,
    quote: block,
    quoteButton,
    binding,
    text,
    answer,
    response,
    system,
  };
  messages.set(id, item);
  return item;
}
async function responseError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return new Error(typeof body.error === 'string' ? body.error : 'Request was not accepted.');
  } catch {
    return new Error('Request could not be confirmed.');
  }
}
function showError(cause: unknown): void {
  error.hidden = false;
  error.textContent =
    cause instanceof Error
      ? cause.message
      : 'Delivery could not be confirmed. Retry keeps the same question identity.';
  requestError = error.textContent;
}
async function cancelQuestion(id: string): Promise<void> {
  if (cancelling.has(id)) return;
  cancelling.add(id);
  requestError = undefined;
  const button = cancelButtons.get(id);
  if (button) button.disabled = true;
  try {
    const response = await fetch('/questions/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) throw await responseError(response);
  } catch (cause) {
    showError(cause);
  } finally {
    cancelling.delete(id);
    if (button?.isConnected) button.disabled = false;
  }
}
function renderQueue(snapshot: LiveSnapshot): void {
  const waiting = snapshot.questions.filter((q) => q.status === 'queued');
  const running = snapshot.questions.find((q) => q.status === 'sending');
  active.hidden = !running;
  active.textContent = running ? 'Agent is answering your question…' : '';
  queue.hidden = !waiting.length;
  find('[data-live-queue-title]').textContent =
    `${waiting.length} waiting ${waiting.length === 1 ? 'question' : 'questions'}`;
  find('[data-live-queue-note]').textContent = running
    ? 'Sent in order after this reply.'
    : snapshot.agent === 'working'
      ? 'The author is busy. Questions wait for this conversation.'
      : snapshot.agent === 'failed'
        ? 'Connection unavailable. Waiting questions remain saved.'
        : 'Questions are sent in order.';
  const wanted = new Set(waiting.map((q) => q.id));
  let removedFocus = false;
  for (const [id, button] of cancelButtons)
    if (!wanted.has(id)) {
      removedFocus ||= document.activeElement === button;
      button.closest('li')?.remove();
      cancelButtons.delete(id);
    }
  waiting.forEach((q, index) => {
    let button = cancelButtons.get(q.id);
    let item = button?.closest('li');
    if (!button || !item) {
      item = document.createElement('li');
      item.dataset.queuedId = q.id;
      const number = document.createElement('span');
      number.className = 'live-queue-number';
      const text = document.createElement('span');
      text.className = 'live-queue-text';
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'live-icon live-quiet';
      button.textContent = '×';
      button.addEventListener('click', () => {
        void cancelQuestion(q.id);
      });
      item.append(number, text, button);
      queueList.append(item);
      cancelButtons.set(q.id, button);
    }
    const number = item.querySelector('.live-queue-number');
    if (number) number.textContent = String(index + 1);
    const text = item.querySelector('.live-queue-text');
    if (text) {
      text.textContent = q.text;
      text.setAttribute('title', q.text);
    }
    button.setAttribute('aria-label', `Cancel waiting question ${index + 1}`);
    button.title = 'Cancel waiting question';
    button.disabled = cancelling.has(q.id);
  });
  if (removedFocus) (queueList.querySelector<HTMLButtonElement>('button') ?? input).focus();
}
function render(snapshot: LiveSnapshot): void {
  const follow = atEnd();
  const previousMessageCount = messages.size + sessionMessages.size;
  const anchor = follow
    ? undefined
    : [...history.children].find(
        (node) => node.getBoundingClientRect().bottom > history.getBoundingClientRect().top,
      );
  const anchorTop = anchor?.getBoundingClientRect().top;
  current = snapshot;
  title.textContent = snapshot.document.title;
  document.title = `${snapshot.document.title} · Live`;
  session.textContent =
    snapshot.connection?.mode === 'current'
      ? 'Current Codex conversation'
      : snapshot.connection?.mode === 'standalone'
        ? 'Separate Codex conversation'
        : 'Source watcher';
  session.title = snapshot.connection?.threadId ?? '';
  status.dataset.agent = snapshot.agent;
  status.textContent = {
    starting: 'Connecting…',
    ready: 'Connected',
    working: snapshot.questions.some((q) => q.status === 'sending')
      ? 'Replying…'
      : 'Author is busy',
    offline: 'Watching sources',
    failed: 'Disconnected',
  }[snapshot.agent];
  error.hidden = !snapshot.error && !requestError;
  error.textContent = snapshot.error ?? requestError ?? '';
  syncComposer();
  if (frame) message(frame, 'agent-state', snapshot.agent);
  if (snapshot.document.url !== latestUrl) {
    latestUrl = snapshot.document.url;
    if (frame) message(frame, 'capture');
    else loadDocument(latestUrl);
  }
  empty.hidden = Boolean(snapshot.questions.length || snapshot.conversation?.messages.length);
  historyNote.hidden = !snapshot.conversation?.limited;
  const projected = projectedQuestions(snapshot);
  for (const q of snapshot.questions) {
    const item = messages.get(q.id) ?? createQuestion(q.id);
    item.badge.textContent = {
      queued: 'Waiting',
      sending: 'Sending',
      completed: '',
      failed: 'Failed',
      uncertain: 'Unconfirmed',
      cancelled: 'Cancelled',
    }[q.status];
    item.badge.dataset.state = q.status;
    item.text.textContent = q.text;
    item.quote.hidden = !q.subject;
    item.quoteButton.textContent = q.subject?.quote ?? '';
    item.quoteButton.disabled = q.binding !== 'exact';
    item.binding.textContent =
      q.subject && q.binding !== 'exact' ? `Selected text: ${q.binding ?? 'historical'}` : '';
    item.binding.hidden = !item.binding.textContent;
    item.answer.hidden = projected.has(q.id) || (!q.answer && q.status !== 'sending');
    const response = q.answer || (q.status === 'sending' ? 'Working on it…' : '');
    if (item.answerText !== response) {
      renderMessage(item.response, response);
      item.answerText = response;
    }
    item.system.hidden = !q.error && q.status !== 'cancelled' && q.status !== 'uncertain';
    item.system.textContent =
      q.error ??
      (q.status === 'cancelled'
        ? 'Cancelled before sending.'
        : q.status === 'uncertain'
          ? 'Delivery is unconfirmed. Check this Codex conversation before resending.'
          : '');
    item.system.toggleAttribute('data-error', Boolean(q.error));
  }
  renderConversation(snapshot);
  renderQueue(snapshot);
  if (follow) scrollLatest();
  else {
    if (anchor?.isConnected && anchorTop !== undefined)
      history.scrollTop += anchor.getBoundingClientRect().top - anchorTop;
    if (messages.size + sessionMessages.size > previousMessageCount) latest.hidden = false;
  }
}
const admissions = new Map<
  string,
  { fingerprint: string; state: 'pending' | 'accepted' | 'failed'; promise: Promise<void> }
>();
async function submitQuestion(value: unknown): Promise<void> {
  const question = liveQuestionSchema.parse(value);
  if (!canSend()) throw new Error('The agent is unavailable. Your draft has not been sent.');
  const fingerprint = JSON.stringify(question);
  const prior = admissions.get(question.id);
  if (prior && prior.fingerprint !== fingerprint)
    throw new Error('Question identity already belongs to another draft.');
  if (prior && prior.state !== 'failed') return prior.promise;
  if (!prior && admissions.size >= MAX_LIVE_QUESTIONS) {
    const retired = [...admissions].find(([, item]) => item.state !== 'pending');
    if (retired) admissions.delete(retired[0]);
    else throw new Error('Too many questions await confirmation. Wait before sending another.');
  }
  const admission = {
    fingerprint,
    state: 'pending' as 'pending' | 'accepted' | 'failed',
    promise: Promise.resolve(),
  };
  admission.promise = (async () => {
    try {
      const response = await fetch('/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: fingerprint,
      });
      if (!response.ok) throw await responseError(response);
      admission.state = 'accepted';
    } catch (cause) {
      admission.state = 'failed';
      throw cause;
    }
  })();
  admissions.set(question.id, admission);
  return admission.promise;
}
window.addEventListener('message', (event: MessageEvent) => {
  if (
    event.origin !== origin ||
    ![frame?.contentWindow, pending?.contentWindow].includes(event.source as Window)
  )
    return;
  const data = event.data as { protocol?: string; type?: string; value?: unknown };
  if (data.protocol !== 'agentic-report-live') return;
  if (data.type === 'selection' && event.source === frame?.contentWindow) {
    setSubject(data.value as LiveSubject);
    showDiscussion(true);
    input.focus();
  }
  if (
    data.type === 'question-rejoin' &&
    event.source === frame?.contentWindow &&
    frame &&
    typeof data.value === 'object' &&
    data.value
  ) {
    const parsed = liveQuestionSchema.safeParse(data.value);
    if (!parsed.success) return;
    const { id } = parsed.data;
    const sender = frame;
    const admission = admissions.get(id);
    const saved = current?.questions.find((q) => q.id === id);
    const fingerprint = JSON.stringify(parsed.data);
    if (
      (admission && admission.fingerprint !== fingerprint) ||
      (saved &&
        (saved.text !== parsed.data.text ||
          JSON.stringify(saved.subject) !== JSON.stringify(parsed.data.subject)))
    ) {
      message(sender, 'question-result', {
        id,
        accepted: false,
        error: 'Question identity belongs to a different draft.',
      });
      return;
    }
    if (saved) message(sender, 'question-result', { id, accepted: true });
    else if (admission)
      void admission.promise
        .then(() => {
          message(sender, 'question-result', { id, accepted: true });
        })
        .catch((cause: unknown) => {
          message(sender, 'question-result', {
            id,
            accepted: false,
            error: cause instanceof Error ? cause.message : 'Check the chat before resending.',
          });
        });
    else
      message(sender, 'question-result', {
        id,
        accepted: false,
        error: 'Delivery is unconfirmed. Check the chat before resending.',
      });
  }
  if (data.type === 'question' && event.source === frame?.contentWindow && frame) {
    const sender = frame;
    const parsed = liveQuestionSchema.safeParse(data.value);
    if (!parsed.success) return;
    void submitQuestion(parsed.data)
      .then(() => {
        message(sender, 'question-result', { id: parsed.data.id, accepted: true });
        showDiscussion(true);
        scrollLatest();
      })
      .catch((cause: unknown) => {
        message(sender, 'question-result', {
          id: parsed.data.id,
          accepted: false,
          error: cause instanceof Error ? cause.message : 'Question was not accepted.',
        });
      });
  }
  if (data.type === 'reading' && event.source === frame?.contentWindow) {
    reading = data.value;
    if (latestUrl) loadDocument(latestUrl);
  }
  if (data.type === 'ready' && event.source === pending?.contentWindow) {
    if (reading && pending) message(pending, 'restore', reading);
    else commitDocument();
  }
  if (data.type === 'restored' && event.source === pending?.contentWindow) commitDocument();
  if (data.type === 'theme' && typeof data.value === 'object' && data.value) {
    for (const [key, value] of Object.entries(data.value))
      if (LIVE_THEME_TOKENS.some((token) => token === key) && typeof value === 'string')
        document.documentElement.style.setProperty(key, value);
  }
  if (data.type === 'view' && typeof data.value === 'object' && data.value) {
    const state = data.value as {
      scheme?: string;
      schemes?: string;
      theme?: string;
      highlights?: boolean;
      themes?: string[];
      user?: boolean;
    };
    if (Array.isArray(state.themes)) {
      themeInput.disabled = state.themes.length === 0;
      themeInput.title = state.themes.length
        ? 'Choose a document theme'
        : 'This document has one theme.';
      const chosen = themeInput.value;
      themeInput.replaceChildren(new Option('Document default', ''));
      for (const name of state.themes)
        if (typeof name === 'string') themeInput.add(new Option(name, name));
      themeInput.value = view.theme ?? chosen;
    }
    schemeInput.disabled = state.schemes === 'dark';
    schemeInput.title = schemeInput.disabled
      ? 'This theme uses dark appearance.'
      : 'Choose appearance';
    if (schemeInput.disabled) schemeInput.value = 'dark';
    else if (state.scheme && ['system', 'light', 'dark'].includes(state.scheme))
      schemeInput.value = state.scheme;
    document.documentElement.dataset.scheme = schemeInput.value;
    if (typeof state.highlights === 'boolean') highlightsInput.checked = state.highlights;
    if (state.user && typeof state.highlights === 'boolean') {
      const scheme = state.scheme;
      view = {
        highlights: state.highlights,
        ...(scheme === 'system' || scheme === 'light' || scheme === 'dark' ? { scheme } : {}),
        ...(typeof state.theme === 'string' ? { theme: state.theme } : {}),
      };
      themeInput.value = view.theme ?? '';
      saveView();
    }
  }
});
function commitDocument(): void {
  if (!pending) return;
  frame?.remove();
  frame = pending;
  pending = undefined;
  frame.removeAttribute('data-pending');
  frame.removeAttribute('aria-hidden');
  applyView();
  doc.classList.remove('live-updated');
  requestAnimationFrame(() => doc.classList.add('live-updated'));
}
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (sending || !input.value.trim() || !current) return;
  sending = true;
  requestError = undefined;
  syncComposer();
  requestId ??= crypto.randomUUID();
  const id = requestId,
    draft = input.value,
    selectedSubject = subject;
  void submitQuestion({
    id,
    text: draft.trim(),
    ...(selectedSubject ? { subject: selectedSubject } : {}),
  })
    .then(() => {
      if (input.value === draft && subject === selectedSubject) {
        input.value = '';
        requestId = undefined;
        setSubject();
      }
    })
    .catch(showError)
    .finally(() => {
      sending = false;
      syncComposer();
    });
});
const events = new EventSource('/events');
events.onmessage = (event: MessageEvent<string>) => {
  const data = JSON.parse(event.data) as LiveEvent;
  if (data.type === 'snapshot') render(data.snapshot);
  else if (data.type === 'session-message') {
    if (!current?.conversation) return;
    const follow = atEnd();
    const key = messageKey(data.message);
    render({
      ...current,
      conversation: {
        ...current.conversation,
        messages: current.conversation.messages.map((item) =>
          messageKey(item) === key ? data.message : item,
        ),
      },
    });
    if (!follow) latest.hidden = false;
  } else {
    const item = messages.get(data.id);
    if (!item) return;
    if (current && projectedQuestions(current).has(data.id)) return;
    const follow = atEnd();
    item.answer.hidden = false;
    renderMessage(item.response, data.text);
    item.answerText = data.text;
    if (follow) scrollLatest();
    else latest.hidden = false;
  }
};
events.onerror = () => {
  status.textContent = 'Reconnecting…';
  status.dataset.agent = 'starting';
};
window.addEventListener('pagehide', () => events.close());
