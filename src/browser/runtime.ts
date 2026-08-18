import './document.css';

const root = document.documentElement;
const modalOpeners = new WeakMap<HTMLDialogElement, HTMLButtonElement>();

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  closePopoversOutside(target);

  const themeToggle = target.closest<HTMLButtonElement>('[data-theme-toggle]');
  if (themeToggle !== null) {
    const current = root.dataset.theme;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = current === 'system' ? (systemDark ? 'dark' : 'light') : current;
    root.dataset.theme = resolved === 'dark' ? 'light' : 'dark';
    return;
  }

  const navToggle = target.closest<HTMLButtonElement>('[data-nav-toggle]');
  if (navToggle !== null) {
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!expanded));
    document
      .querySelector<HTMLElement>('[data-navigation]')
      ?.toggleAttribute('data-open', !expanded);
    return;
  }

  if (target.closest<HTMLAnchorElement>('[data-navigation] a') !== null) {
    document.querySelector<HTMLElement>('[data-navigation]')?.removeAttribute('data-open');
    document
      .querySelector<HTMLButtonElement>('[data-nav-toggle]')
      ?.setAttribute('aria-expanded', 'false');
    return;
  }

  const tab = target.closest<HTMLButtonElement>('[data-tab]');
  if (tab !== null) {
    activateTab(tab, false);
    return;
  }

  const modalOpen = target.closest<HTMLButtonElement>('[data-modal-open]');
  if (modalOpen !== null) {
    const dialog = document.getElementById(
      modalOpen.dataset.modalOpen ?? '',
    ) as HTMLDialogElement | null;
    if (dialog !== null) {
      modalOpeners.set(dialog, modalOpen);
      dialog.showModal();
    }
    return;
  }

  const modalClose = target.closest<HTMLButtonElement>('[data-modal-close]');
  if (modalClose !== null) {
    modalClose.closest<HTMLDialogElement>('dialog')?.close();
    return;
  }

  const popoverTrigger = target.closest<HTMLElement>('[data-popover-trigger]');
  if (popoverTrigger !== null) {
    const popover = popoverTrigger.closest<HTMLElement>('[data-popover]');
    const panel = popover?.querySelector<HTMLElement>('[data-popover-panel]');
    if (panel !== undefined && panel !== null) {
      if (popover?.matches('[data-glossary-reference]') === true) {
        openPopover(popover);
      } else {
        panel.hidden = !panel.hidden;
        popoverTrigger.setAttribute('aria-expanded', String(!panel.hidden));
      }
    }
  }

  const toggle = target.closest<HTMLButtonElement>('[data-toggle-control]');
  if (toggle !== null) {
    const panel = toggle
      .closest<HTMLElement>('[data-toggle]')
      ?.querySelector<HTMLElement>('[data-toggle-panel]');
    if (panel !== undefined && panel !== null) {
      const active = toggle.getAttribute('aria-checked') !== 'true';
      toggle.setAttribute('aria-checked', String(active));
      panel.hidden = !active;
    }
    return;
  }

  const increment = target.closest<HTMLButtonElement>('[data-demo-increment]');
  if (increment !== null) {
    const demo = increment.closest<HTMLElement>('[data-demo-counter]');
    const output = demo?.querySelector<HTMLOutputElement>('[data-demo-output]');
    if (demo !== null && demo !== undefined && output !== null && output !== undefined) {
      const value = Number(output.value || output.textContent || demo.dataset.start || '0');
      const next = value + Number(demo.dataset.step ?? '1');
      output.value = String(next);
      output.textContent = String(next);
    }
    return;
  }

  const copy = target.closest<HTMLButtonElement>('[data-copy-code]');
  if (copy !== null) void copyCode(copy);
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const tab = target.closest<HTMLButtonElement>('[data-tab]');
  if (tab !== null && ['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
    const controls = tabControls(tab);
    const current = controls.indexOf(tab);
    const next =
      event.key === 'ArrowRight'
        ? controls[(current + 1) % controls.length]
        : event.key === 'ArrowLeft'
          ? controls[(current - 1 + controls.length) % controls.length]
          : event.key === 'Home'
            ? controls[0]
            : controls.at(-1);
    if (next !== undefined) {
      event.preventDefault();
      activateTab(next, true);
    }
    return;
  }
  if (event.key === 'Escape') {
    const popover = target.closest<HTMLElement>('[data-popover]');
    if (popover !== null) closePopover(popover, true);
  }
});

document.addEventListener('input', (event) => {
  if (!(event.target instanceof HTMLInputElement) || !event.target.matches('[data-filter-input]')) {
    return;
  }
  applyFilter(event.target);
});

document.addEventListener('pointerover', (event) => {
  if (!(event.target instanceof Element)) return;
  const glossary = event.target.closest<HTMLElement>('[data-glossary-reference]');
  if (glossary !== null) openPopover(glossary);
});

document.addEventListener('pointerout', (event) => {
  if (!(event.target instanceof Element)) return;
  const glossary = event.target.closest<HTMLElement>('[data-glossary-reference]');
  if (
    glossary !== null &&
    !(event.relatedTarget instanceof Node && glossary.contains(event.relatedTarget)) &&
    !glossary.contains(document.activeElement)
  ) {
    closePopover(glossary, false);
  }
});

document.addEventListener('focusin', (event) => {
  if (!(event.target instanceof Element)) return;
  const glossary = event.target.closest<HTMLElement>('[data-glossary-reference]');
  if (glossary !== null) openPopover(glossary);
});

document.addEventListener('focusout', (event) => {
  if (!(event.target instanceof Element)) return;
  const glossary = event.target.closest<HTMLElement>('[data-glossary-reference]');
  if (
    glossary !== null &&
    !(event.relatedTarget instanceof Node && glossary.contains(event.relatedTarget)) &&
    !glossary.matches(':hover')
  ) {
    closePopover(glossary, false);
  }
});

document.addEventListener(
  'close',
  (event) => {
    if (event.target instanceof HTMLDialogElement) modalOpeners.get(event.target)?.focus();
  },
  true,
);

for (const input of document.querySelectorAll<HTMLInputElement>('[data-filter-input]')) {
  applyFilter(input);
}

for (const block of document.querySelectorAll<HTMLElement>('pre')) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy-code';
  button.dataset.copyCode = '';
  button.textContent = 'Copy';
  block.append(button);
}

function activateTab(control: HTMLButtonElement, moveFocus: boolean): void {
  const tabs = control.closest<HTMLElement>('[data-tabs]');
  if (tabs === null) return;
  const controls = tabControls(control);
  const panels = [...tabs.children].filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.matches('[data-tab-panel]'),
  );
  for (const candidate of controls) {
    const selected = candidate === control;
    candidate.setAttribute('aria-selected', String(selected));
    candidate.tabIndex = selected ? 0 : -1;
    const panel = panels.find((item) => item.id === candidate.getAttribute('aria-controls'));
    if (panel !== undefined) panel.hidden = !selected;
  }
  if (moveFocus) control.focus();
}

function tabControls(control: HTMLButtonElement): HTMLButtonElement[] {
  const tabs = control.closest<HTMLElement>('[data-tabs]');
  const tabList = tabs?.querySelector<HTMLElement>(':scope > [role="tablist"]');
  return tabList === undefined || tabList === null
    ? []
    : [...tabList.querySelectorAll<HTMLButtonElement>('[data-tab]')];
}

function closePopoversOutside(target: Element): void {
  for (const popover of document.querySelectorAll<HTMLElement>('[data-popover]')) {
    if (!popover.contains(target)) closePopover(popover, false);
  }
}

function openPopover(popover: HTMLElement): void {
  const trigger = popover.querySelector<HTMLElement>('[data-popover-trigger]');
  const panel = popover.querySelector<HTMLElement>('[data-popover-panel]');
  if (trigger === null || panel === null || !panel.hidden) return;
  panel.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
}

function closePopover(popover: HTMLElement, restoreFocus: boolean): void {
  const trigger = popover.querySelector<HTMLElement>('[data-popover-trigger]');
  const panel = popover.querySelector<HTMLElement>('[data-popover-panel]');
  if (trigger === null || panel === null || panel.hidden) return;
  panel.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
  if (restoreFocus) trigger.focus();
}

function applyFilter(input: HTMLInputElement): void {
  const filter = input.closest<HTMLElement>('[data-filter]');
  if (filter === null) return;
  const output = filter.querySelector<HTMLOutputElement>('[data-filter-count]');
  const items = [...filter.querySelectorAll<HTMLLIElement>(':scope > ul > li, :scope > ol > li')];
  const query = input.value.trim().toLocaleLowerCase();
  let visible = 0;
  for (const item of items) {
    item.hidden = !item.textContent?.toLocaleLowerCase().includes(query);
    if (!item.hidden) visible += 1;
  }
  if (output !== null) output.textContent = `${visible} ${visible === 1 ? 'item' : 'items'}`;
}

async function copyCode(button: HTMLButtonElement): Promise<void> {
  const text = button.closest('pre')?.querySelector('code')?.textContent ?? '';
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Copy unavailable';
  }
  window.setTimeout(() => {
    button.textContent = 'Copy';
  }, 1200);
}
