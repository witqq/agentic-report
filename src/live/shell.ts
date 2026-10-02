import { resolveBuiltInTheme } from '../authoring/themes.js';
import { themeStylesheet } from '../render/theme-css.js';
import { liveStyles } from './shell-style.js';

const icon = (paths: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const arrow = icon('<path d="M12 19V5m-6 6 6-6 6 6"/>');
const chat = icon('<path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2Z"/>');
const settings = icon(
  '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
);
const close = icon('<path d="m6 6 12 12M6 18 18 6"/>');

/** Live controls and agent transport never enter an ordinary static artifact. */
export function renderLiveShell(script: string): string {
  const theme = resolveBuiltInTheme('neutral');
  return `<!doctype html><html lang="en" data-theme="neutral" data-scheme="system"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Live document · Agentic Report</title><style>${themeStylesheet([theme])}${liveStyles}</style></head><body>
<header class="live-header"><strong data-live-title>Agentic Report</strong><span class="live-status" data-live-status role="status">Connecting…</span><button class="live-icon live-quiet" type="button" data-live-toggle aria-label="Toggle chat" title="Chat" aria-controls="live-discussion" aria-expanded="true">${chat}</button></header>
<main class="live-layout" data-live-layout><div class="live-document" data-live-document aria-label="Document"></div>
<aside class="live-panel" id="live-discussion" aria-label="Discussion">
<div class="live-resizer" data-live-resizer role="separator" tabindex="0" aria-label="Chat width" aria-orientation="vertical" aria-valuemin="320" aria-valuemax="720" aria-valuenow="416"></div>
<div class="live-panel-header"><div class="live-panel-heading"><h1>Conversation</h1><span class="live-session" data-live-session></span></div><button class="live-icon live-quiet" type="button" data-live-settings-toggle aria-label="View settings" title="View settings" aria-expanded="false" aria-controls="live-settings">${settings}</button><button class="live-icon live-quiet" type="button" data-live-close aria-label="Read document" title="Read document">${close}</button></div>
<section class="live-settings" id="live-settings" data-live-settings hidden aria-label="View settings"><h2>Document &amp; chat</h2>
<label class="live-setting" data-live-width-setting>Chat width<input type="range" data-live-width min="320" max="720" value="416" step="8"></label>
<label class="live-setting">Appearance<select data-live-scheme><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
<label class="live-setting">Document theme<select data-live-theme><option value="">Document default</option></select></label>
<label class="live-setting">Highlight changes<input type="checkbox" data-live-highlights checked></label>
<div class="live-settings-footer"><span>Saved in this browser</span><button type="button" data-live-reset>Reset view</button></div></section>
<p class="live-error" data-live-error role="alert" hidden></p>
<div class="live-history" data-live-history aria-label="Conversation messages"><div class="live-empty" data-live-empty><strong>Let's work on this document</strong>Select a passage to ask right beside it, or send a question below. Replies and source changes appear here.</div></div>
<button class="live-new-messages" type="button" data-live-new-messages hidden>Latest messages ↓</button>
<p class="live-active" data-live-active role="status" hidden></p>
<details class="live-queue" data-live-queue open hidden><summary data-live-queue-title>Waiting questions</summary><ol data-live-queue-list></ol><p class="live-queue-note" data-live-queue-note></p></details>
<form class="live-composer" data-live-form><blockquote data-live-quote hidden></blockquote><div class="live-input-box"><textarea id="live-question" data-live-input maxlength="8000" rows="1" placeholder="Ask or request a change…" aria-label="Your question" required></textarea><button class="live-icon live-send" data-live-send type="submit" aria-label="Send question" title="Send question · Enter" disabled>${arrow}</button></div><div class="live-composer-footer"><span class="live-keyboard-hint">Enter to send · Shift+Enter for a new line</span><button class="live-quiet" type="button" data-live-clear hidden>Clear selection</button></div></form>
</aside></main><script>${script}</script></body></html>`;
}
