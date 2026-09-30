/*! agentic-report script: copy */
/**
 * The one copy control of code blocks and `copyable` prose: code copies its text without glossary panels
 * and removed lines; prose copies its rendered text.
 */

import { COPY_ICON } from '../../iconography.js';
import type { PackageStrings } from '../../localization.js';
import { pageClock } from '../clock.js';
import { provideFeature } from '../features.js';
import { browserIcon } from '../icon.js';
import { asUiButton } from '../ui.js';

const clock = pageClock();

function createCopyButton(kind: 'code' | 'prose', strings: PackageStrings): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = kind === 'code' ? 'copy-code' : 'copy-prose';
  asUiButton(button, kind === 'code' ? 'quiet' : 'secondary', 'sm');
  if (kind === 'code') button.dataset.copyCode = '';
  else button.dataset.copyProse = '';
  const label = document.createElement('span');
  label.dataset.copyLabel = '';
  if (kind === 'code') label.dataset.copyCodeLabel = '';
  label.textContent = strings.copy;
  button.append(browserIcon(COPY_ICON), label);
  return button;
}

async function copyContent(
  button: HTMLButtonElement,
  currentStrings: () => PackageStrings,
): Promise<void> {
  let text: string;
  if (button.matches('[data-copy-prose]')) {
    const prose = button
      .closest<HTMLElement>('[data-copyable-prose]')
      ?.querySelector<HTMLElement>('[data-copyable-content]');
    text = prose === undefined || prose === null ? '' : renderedProseText(prose);
  } else {
    const code = button.closest('pre')?.querySelector('code');
    const copy = code?.cloneNode(true);
    if (copy instanceof HTMLElement) {
      // Удалённые строки прошлой редакции видны на странице, но в буфер уходит только новый код.
      for (const panel of copy.querySelectorAll('[data-glossary-panel], [data-edition-removed]'))
        panel.remove();
    }
    text = copy?.textContent ?? '';
  }
  const label = button.querySelector<HTMLElement>('[data-copy-label]') ?? button;
  try {
    await navigator.clipboard.writeText(text);
    label.textContent = currentStrings().copied;
  } catch {
    label.textContent = currentStrings().copyUnavailable;
  }
  clock.later(() => {
    label.textContent = currentStrings().copy;
  }, 1200);
}

function renderedProseText(content: HTMLElement): string {
  const copy = content.cloneNode(true);
  if (!(copy instanceof HTMLElement)) return '';
  for (const reference of copy.querySelectorAll<HTMLElement>('[data-glossary-reference]')) {
    const label =
      reference.querySelector<HTMLElement>('[data-glossary-trigger]')?.textContent ?? '';
    reference.replaceWith(document.createTextNode(label));
  }
  for (const generated of copy.querySelectorAll(
    '[hidden], [aria-hidden="true"], [data-edition-removed], button, input, select, textarea, output, [role="dialog"]',
  ))
    generated.remove();
  copy.style.position = 'fixed';
  copy.style.top = '0';
  copy.style.left = '-10000px';
  copy.style.width = `${content.getBoundingClientRect().width}px`;
  copy.style.pointerEvents = 'none';
  copy.setAttribute('aria-hidden', 'true');
  document.body.append(copy);
  const text = copy.innerText.replace(/\r\n?/gu, '\n').trim();
  copy.remove();
  return text;
}

provideFeature('copy', { button: createCopyButton, run: copyContent });
