import { parseReviewTargetManifest, type ReviewTargetManifest } from '../review/contract.js';
import type { LiveSubject } from './contract.js';
import { placeSurface, visualViewportBounds } from '../browser/overlay-position.js';
import { LIVE_THEME_TOKENS, type LiveViewSettings } from './view.js';

interface ReadingState {
  target?: string;
  section?: string;
  offset: number;
  scroll: number;
  details: string[];
  scheme?: string;
  theme?: string;
  locale?: string;
  context?: {
    subject: LiveSubject;
    text: string;
    id?: string;
    pending?: { id: string; text: string; subject: LiveSubject };
    focused: boolean;
  };
}
const origin = location.protocol === 'file:' ? 'null' : location.origin;
const send = (type: string, value: unknown): void => {
  if (window.parent !== window)
    window.parent.postMessage(
      { protocol: 'agentic-report-live', type, value },
      origin === 'null' ? '*' : origin,
    );
};
const button = document.createElement('button');
button.type = 'button';
button.textContent = 'Ask agent';
button.hidden = true;
button.dataset.liveAsk = '';
button.style.cssText =
  'position:fixed;z-index:1000;padding:.5rem .8rem;min-height:2.75rem;border:1px solid var(--color-border);border-radius:var(--radius-control);background:var(--color-accent);color:var(--color-bg);font:inherit;cursor:pointer;box-shadow:var(--shadow-raised)';
document.body.append(button);
let subject: LiveSubject | undefined;
const inline = document.createElement('form');
inline.dataset.liveInlineForm = '';
inline.hidden = true;
inline.setAttribute('role', 'dialog');
inline.setAttribute('aria-label', 'Ask about this passage');
const inlineLabel = document.createElement('label');
inlineLabel.textContent = 'Ask about this passage';
inlineLabel.htmlFor = 'live-inline-question';
const inlineQuote = document.createElement('blockquote');
const inlineInput = document.createElement('textarea');
inlineInput.id = 'live-inline-question';
inlineInput.dataset.liveInlineInput = '';
inlineInput.setAttribute('aria-label', 'Question about selected text');
inlineInput.placeholder = 'Ask or request a change…';
inlineInput.maxLength = 8000;
inlineInput.rows = 2;
inlineInput.required = true;
const inlineActions = document.createElement('div');
inlineActions.className = 'live-inline-actions';
const inlineNote = document.createElement('p');
inlineNote.dataset.liveInlineNote = '';
inlineNote.setAttribute('role', 'status');
const inlineClose = document.createElement('button');
inlineClose.type = 'button';
inlineClose.textContent = '×';
inlineClose.setAttribute('aria-label', 'Close question');
inlineClose.title = 'Close';
const inlineSend = document.createElement('button');
inlineSend.type = 'submit';
inlineSend.textContent = '↑';
inlineSend.dataset.liveInlineSend = '';
inlineSend.setAttribute('aria-label', 'Send question');
inlineSend.title = 'Send · Enter';
inlineActions.append(inlineNote, inlineClose, inlineSend);
inline.append(inlineLabel, inlineQuote, inlineInput, inlineActions);
document.body.append(inline);
const inlineStyles = document.createElement('style');
inlineStyles.textContent = `[data-live-inline-form]{position:fixed;z-index:1001;width:min(22rem,calc(100vw - 1rem));padding:.8rem;overflow:auto;background:var(--color-surface);color:var(--color-text);border:1px solid var(--color-border);border-radius:var(--radius-card);box-shadow:var(--shadow-raised);font: .875rem/1.5 var(--font-body)}[data-live-inline-form][hidden]{display:none}[data-live-inline-form] label{display:block;font-weight:600;margin-bottom:.4rem}[data-live-inline-form] blockquote{margin:0 0 .5rem;padding-left:.5rem;border-left:2px solid var(--color-accent);font-size:.75rem;color:var(--color-text-muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}[data-live-inline-form] textarea{width:100%;min-height:3rem;max-height:25dvh;padding:.5rem;resize:vertical;color:var(--color-text);background:var(--color-bg);border:1px solid var(--color-border);border-radius:var(--radius-control);font:inherit}[data-live-inline-form] textarea:focus-visible,[data-live-inline-form] button:focus-visible{outline:2px solid var(--color-focus);outline-offset:2px}.live-inline-actions{display:flex;align-items:center;gap:.4rem;margin-top:.4rem}.live-inline-actions p{flex:1;margin:0;font-size:.6875rem;color:var(--color-text-muted)}.live-inline-actions button{border:1px solid var(--color-border);border-radius:50%;min-width:2.25rem;min-height:2.25rem;padding:0;background:var(--color-surface);color:var(--color-text);font:inherit;cursor:pointer}.live-inline-actions button[type=submit]{background:var(--color-accent);color:var(--color-bg);border-color:var(--color-accent)}.live-inline-actions button:disabled{opacity:.45;cursor:default}`;
document.head.append(inlineStyles);
let inlineSubject: LiveSubject | undefined;
let inlineRange: Range | undefined;
let selectionRange: Range | undefined;
let inlineId: string | undefined;
let submitted: { id: string; text: string; subject: LiveSubject } | undefined;
let agentAvailable = false;
function syncInline(): void {
  const stale =
    inlineSubject?.revision !== manifest()?.reportRevision ||
    inlineSubject?.locale !== (activeRoot().dataset.localizedPageVariant === 'ru' ? 'ru' : 'en');
  inlineSend.disabled = Boolean(submitted) || stale || !agentAvailable || !inlineInput.value.trim();
  inlineNote.textContent = submitted
    ? 'Saving question…'
    : stale
      ? 'Document changed. Select the passage again; your draft is kept.'
      : !agentAvailable
        ? 'Agent unavailable. Your draft is kept.'
        : 'Enter to send · Shift+Enter for a line';
}
function positionInline(): void {
  if (inline.hidden) return;
  const target = inlineSubject
    ? activeRoot().querySelector<HTMLElement>(
        `[data-review-target="${CSS.escape(inlineSubject.start.id)}"]`,
      )
    : null;
  const viewport = visualViewportBounds();
  const bounds =
    (inlineRange?.startContainer.isConnected
      ? inlineRange.getBoundingClientRect()
      : target?.getBoundingClientRect()) ??
    new DOMRect(
      viewport.left + (viewport.right - viewport.left) / 2,
      viewport.top + (viewport.bottom - viewport.top) / 3,
      0,
      0,
    );
  inline.style.maxHeight = `${Math.max(80, viewport.bottom - viewport.top - 16)}px`;
  const position = placeSurface({
    anchor: bounds,
    surface: { width: inline.offsetWidth, height: inline.offsetHeight },
    viewport,
    gutter: 8,
    gap: 8,
    preference: 'block',
  });
  inline.style.left = `${position.left}px`;
  inline.style.top = `${position.top}px`;
}
function closeInline(): void {
  inline.hidden = true;
  const target = inlineSubject
    ? activeRoot().querySelector<HTMLElement>(
        `[data-review-target="${CSS.escape(inlineSubject.start.id)}"]`,
      )
    : null;
  if (target) {
    if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }
}
inlineClose.addEventListener('click', closeInline);
inlineInput.addEventListener('input', () => {
  inlineId = undefined;
  syncInline();
});
inline.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeInline();
    return;
  }
  if (event.target !== inlineInput) return;
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
  if (!inlineSend.disabled) inline.requestSubmit();
});
inline.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!inlineSubject || inlineSend.disabled) return;
  inlineId ??= crypto.randomUUID();
  submitted = { id: inlineId, text: inlineInput.value, subject: inlineSubject };
  send('question', { id: inlineId, text: inlineInput.value.trim(), subject: inlineSubject });
  syncInline();
});
window.addEventListener('resize', positionInline);
window.visualViewport?.addEventListener('resize', positionInline);
window.visualViewport?.addEventListener('scroll', positionInline);

function activeRoot(): HTMLElement {
  return (
    document.querySelector<HTMLElement>('.localized-page-variant:not([hidden])') ?? document.body
  );
}
function manifest(): ReviewTargetManifest | undefined {
  const template = document.querySelector<HTMLTemplateElement>('template[data-live-manifests]');
  try {
    return template
      ? parseReviewTargetManifest(
          (JSON.parse(template.content.textContent ?? '') as Record<string, unknown>)[
            activeRoot().dataset.localizedPageVariant === 'ru' ? 'ru' : 'en'
          ],
        )
      : undefined;
  } catch {
    return undefined;
  }
}

function capture(): void {
  button.hidden = true;
  subject = undefined;
  const selection = window.getSelection();
  if (selection?.rangeCount !== 1 || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const element = (node: Node): Element | null =>
    node instanceof Element ? node : node.parentElement;
  const startElement = element(range.startContainer);
  const endElement = element(range.endContainer);
  if (
    startElement?.closest('button,textarea,input,select,[data-edition-removed]') ||
    endElement?.closest('button,textarea,input,select,[data-edition-removed]')
  )
    return;
  const startId = startElement?.closest<HTMLElement>('[data-review-target]')?.dataset.reviewTarget;
  const endId = endElement?.closest<HTMLElement>('[data-review-target]')?.dataset.reviewTarget;
  const inventory = manifest();
  const start = inventory?.targets.find((t) => t.id === startId);
  const end = inventory?.targets.find((t) => t.id === endId);
  const quote = selection.toString().trim();
  if (!start || !end || !inventory || !quote || quote.length > 8000) return;
  subject = {
    revision: inventory.reportRevision,
    locale: activeRoot().dataset.localizedPageVariant === 'ru' ? 'ru' : 'en',
    quote,
    start,
    end,
  };
  selectionRange = range.cloneRange();
  const bounds = range.getBoundingClientRect();
  if (bounds.bottom < 0 || bounds.top > innerHeight) return;
  button.hidden = false;
  button.style.left = `${Math.max(8, Math.min(innerWidth - button.offsetWidth - 8, bounds.left))}px`;
  button.style.top = `${Math.max(8, Math.min(innerHeight - button.offsetHeight - 8, bounds.bottom + 8))}px`;
}
document.addEventListener('selectionchange', capture);
window.addEventListener(
  'scroll',
  () => {
    button.hidden = true;
    positionInline();
  },
  { passive: true },
);
button.addEventListener('pointerdown', (event) => event.preventDefault());
button.addEventListener('click', () => {
  if (subject) {
    inlineSubject = subject;
    inlineRange = selectionRange;
    inlineId = undefined;
    inlineQuote.textContent = subject.quote;
    inline.hidden = false;
    syncInline();
    positionInline();
    inlineInput.focus({ preventScroll: true });
  }
  button.hidden = true;
});

function reading(): ReadingState {
  const locale = activeRoot().dataset.localizedPageVariant;
  const target = [...activeRoot().querySelectorAll<HTMLElement>('[data-review-target]')].find(
    (el) => !el.querySelector('[data-review-target]') && el.getBoundingClientRect().bottom > 80,
  );
  const section = target?.closest<HTMLElement>('section[id]');
  return {
    ...(target?.dataset.reviewTarget ? { target: target.dataset.reviewTarget } : {}),
    ...(section?.id ? { section: section.id } : {}),
    offset: target?.getBoundingClientRect().top ?? 0,
    scroll: scrollY,
    details: [...activeRoot().querySelectorAll<HTMLDetailsElement>('details[open]')]
      .map(
        (el) =>
          el.id || el.closest<HTMLElement>('[data-review-target]')?.dataset.reviewTarget || '',
      )
      .filter(Boolean),
    ...(document.documentElement.dataset.scheme
      ? { scheme: document.documentElement.dataset.scheme }
      : {}),
    ...(document.documentElement.dataset.theme
      ? { theme: document.documentElement.dataset.theme }
      : {}),
    ...(locale ? { locale } : {}),
    ...(!inline.hidden && inlineSubject
      ? {
          context: {
            subject: inlineSubject,
            text: inlineInput.value,
            ...(inlineId ? { id: inlineId } : {}),
            ...(submitted ? { pending: submitted } : {}),
            focused: document.hasFocus() && document.activeElement === inlineInput,
          },
        }
      : {}),
  };
}

async function restore(state: ReadingState): Promise<void> {
  // Restoring a frame is not a new reader preference. Its temporary defaults must not overwrite the panel.
  applyingSettings = true;
  const root = document.documentElement;
  if (state.scheme) root.dataset.scheme = state.scheme;
  const themes = document.querySelector<HTMLSelectElement>('[data-theme-select]');
  if (state.theme && themes && [...themes.options].some((o) => o.value === state.theme)) {
    themes.value = state.theme;
    themes.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const locales = document.querySelector<HTMLSelectElement>('[data-language-select]');
  if (state.locale && locales && [...locales.options].some((o) => o.value === state.locale)) {
    locales.value = state.locale;
    locales.dispatchEvent(new Event('change', { bubbles: true }));
  }
  for (const item of state.details) {
    const el =
      document.getElementById(item) ??
      activeRoot().querySelector(`[data-review-target="${CSS.escape(item)}"]`);
    if (el instanceof HTMLDetailsElement) el.open = true;
    else
      el?.querySelectorAll('details').forEach((detail) => {
        detail.open = true;
      });
  }
  await document.fonts.ready;
  requestAnimationFrame(() => {
    const target = state.target
      ? activeRoot().querySelector<HTMLElement>(
          `[data-review-target="${CSS.escape(state.target)}"]`,
        )
      : null;
    const section = state.section ? document.getElementById(state.section) : null;
    window.scrollTo({
      top: target
        ? target.getBoundingClientRect().top + scrollY - state.offset
        : section
          ? section.getBoundingClientRect().top + scrollY - 80
          : state.scroll,
      behavior: 'instant',
    });
    applyingSettings = false;
    send('restored', null);
    theme();
    if (state.context) {
      inlineSubject = state.context.subject;
      inlineInput.value = state.context.text;
      inlineId = state.context.id;
      inlineQuote.textContent = inlineSubject.quote;
      inline.hidden = false;
      submitted = state.context.pending;
      syncInline();
      positionInline();
      if (state.context.focused) inlineInput.focus({ preventScroll: true });
      if (submitted)
        send('question-rejoin', {
          id: submitted.id,
          text: submitted.text.trim(),
          subject: submitted.subject,
        });
    }
  });
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window.parent || event.origin !== origin) return;
  const data = event.data as { protocol?: string; type?: string; value?: unknown };
  if (data.protocol !== 'agentic-report-live') return;
  if (data.type === 'agent-state') {
    agentAvailable = ['ready', 'working', 'starting'].includes(String(data.value));
    button.disabled = !agentAvailable;
    syncInline();
  }
  if (data.type === 'capture') send('reading', reading());
  if (data.type === 'restore' && typeof data.value === 'object' && data.value)
    void restore(data.value as ReadingState);
  if (data.type === 'question-result' && typeof data.value === 'object' && data.value) {
    const result = data.value as { id?: string; accepted?: boolean; error?: string };
    if (result.id === submitted?.id && submitted) {
      const sent = submitted;
      submitted = undefined;
      if (result.accepted) {
        if (inlineInput.value === sent.text && inlineSubject === sent.subject) {
          inlineInput.value = '';
          inlineId = undefined;
          inline.hidden = true;
        }
        syncInline();
      } else {
        syncInline();
        inlineNote.textContent = result.error ?? 'Question was not accepted. Your draft is kept.';
      }
    }
  }
  if (data.type === 'view-settings' && typeof data.value === 'object' && data.value)
    applySettings(data.value as LiveViewSettings);
  if (data.type === 'view-reset') {
    applyingSettings = true;
    for (const [name, value] of originalAppearance)
      document.documentElement.setAttribute(name, value);
    const select = document.querySelector<HTMLSelectElement>('[data-theme-select]');
    if (select) {
      select.value = document.documentElement.dataset.theme ?? '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    applyingSettings = false;
    viewSettings = { highlights: true };
    applySettings(viewSettings);
  }
  if (data.type === 'focus' && typeof data.value === 'string') {
    const target = activeRoot().querySelector<HTMLElement>(
      `[data-review-target="${CSS.escape(data.value)}"]`,
    );
    target?.scrollIntoView({
      block: 'center',
      behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth',
    });
  }
});

function theme(): void {
  const styles = getComputedStyle(document.documentElement);
  send(
    'theme',
    Object.fromEntries(LIVE_THEME_TOKENS.map((token) => [token, styles.getPropertyValue(token)])),
  );
  sendView();
}
const originalAppearance = [...document.documentElement.attributes]
  .filter((a) => a.name.startsWith('data-theme') || a.name === 'data-scheme')
  .map((a) => [a.name, a.value] as const);
let viewSettings: LiveViewSettings = { highlights: true };
let applyingSettings = false;
function themeCatalog(): Record<string, Record<string, string>> {
  try {
    return JSON.parse(
      document.querySelector<HTMLTemplateElement>('template[data-theme-catalog]')?.content
        .textContent ?? '{}',
    ) as Record<string, Record<string, string>>;
  } catch {
    return {};
  }
}
function sendView(user = false): void {
  send('view', {
    scheme: document.documentElement.dataset.scheme,
    schemes: document.documentElement.dataset.themeSchemes,
    theme: document.documentElement.dataset.theme,
    highlights: activeRoot().dataset.editionLayer !== 'off',
    themes: Object.keys(themeCatalog()),
    user,
  });
}
function applySettings(settings: LiveViewSettings): void {
  viewSettings = settings;
  applyingSettings = true;
  if (settings.scheme && ['system', 'light', 'dark'].includes(settings.scheme))
    document.documentElement.dataset.scheme = settings.scheme;
  const attributes = settings.theme ? themeCatalog()[settings.theme] : undefined;
  if (!settings.theme) {
    for (const [name, value] of originalAppearance)
      if (name.startsWith('data-theme')) document.documentElement.setAttribute(name, value);
    for (const select of document.querySelectorAll<HTMLSelectElement>('[data-theme-select]'))
      select.value = document.documentElement.dataset.theme ?? '';
  }
  if (attributes) {
    for (const [name, value] of Object.entries(attributes))
      if (name.startsWith('data-theme')) document.documentElement.setAttribute(name, value);
    for (const select of document.querySelectorAll<HTMLSelectElement>('[data-theme-select]'))
      select.value = settings.theme ?? '';
  }
  activeRoot().dataset.editionLayer = settings.highlights ? 'on' : 'off';
  activeRoot()
    .querySelector('[data-edition-layer-toggle]')
    ?.setAttribute('aria-checked', String(settings.highlights));
  applyingSettings = false;
  theme();
}
document.addEventListener('click', (event) => {
  if (applyingSettings || !(event.target instanceof Element)) return;
  if (event.target.closest('[data-edition-layer-toggle], [data-scheme-toggle]')) sendView(true);
});
document.addEventListener('change', (event) => {
  if (applyingSettings || !(event.target instanceof Element)) return;
  if (event.target.matches('[data-language-select]')) {
    applySettings(viewSettings);
    syncInline();
    positionInline();
  }
  if (event.target.matches('[data-theme-select]')) sendView(true);
});
new MutationObserver(theme).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme', 'data-scheme'],
});
matchMedia('(prefers-color-scheme:dark)').addEventListener('change', theme);
void document.fonts.ready.then(() => {
  theme();
  send('ready', null);
});
