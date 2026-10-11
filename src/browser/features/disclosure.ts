/*! agentic-report script: disclosure */
import { contentElements, provideFeature, type Cleanup } from '../features.js';

/** Print the native content, then restore each actual reader-owned instance. */
function installDisclosurePrint(scope: HTMLElement): Cleanup {
  const details = contentElements<HTMLDetailsElement>(scope, 'details[data-disclosure]');
  if (details.length === 0) return () => undefined;
  const print = window.matchMedia('print');
  const saved = new Map<HTMLDetailsElement, boolean>();
  let beforePrint = false;
  const restore = (): void => {
    for (const [element, open] of saved) element.open = open;
    saved.clear();
  };
  const sync = (): void => {
    if (!beforePrint && !print.matches) {
      restore();
      return;
    }
    for (const element of details) {
      if (!saved.has(element)) saved.set(element, element.open);
      element.open = true;
    }
  };
  const before = (): void => {
    beforePrint = true;
    sync();
  };
  const after = (): void => {
    beforePrint = false;
    sync();
  };
  print.addEventListener('change', sync);
  window.addEventListener('beforeprint', before);
  window.addEventListener('afterprint', after);
  sync();
  return () => {
    print.removeEventListener('change', sync);
    window.removeEventListener('beforeprint', before);
    window.removeEventListener('afterprint', after);
    restore();
  };
}

provideFeature('disclosurePrint', installDisclosurePrint);
