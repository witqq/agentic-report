/*! agentic-report script: diagram */
/**
 * Flow and sequence diagrams: the view that fits its frame (`createDiagramFitController`), the compiled
 * list of a sequence too narrow for its track (`diagram-forms.ts`), and diagram drawing, pulses and the
 * zoom camera (`diagram-motion.ts`, which installs itself when the page loads).
 */

import '../diagram-motion.js';
import { pageClock } from '../clock.js';
import {
  DIAGRAM_READABLE_SCALE,
  frameContentWidth,
  installDiagramForms,
} from '../diagram-forms.js';
import { type Destroyable, provideFeature } from '../features.js';
import { activateTab } from '../tab-panels.js';

const clock = pageClock();

/**
 * Page CSS never draws a diagram smaller than this share of its natural width; the rest scrolls. At this
 * scale the smallest diagram text, a 12.5px node detail, still renders at 11px.
 */
const DIAGRAM_MINIMUM_SCALE = DIAGRAM_READABLE_SCALE;
/** Keys with which a reader selects a tab; other keys only pass through the tab list. */
const TAB_SELECTION_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ']);

/**
 * Shows, until the reader picks a view, a diagram view that fits its frame when the authored one would have
 * to scroll: a flow drawn left to right on a phone is replaced by its top-down view. The authored view stays
 * the one printed and one tab away; a reader's choice is never overridden. When no view fits, the frame
 * first opens scrolled to the start of the flow, so the first look is not its cut middle.
 */
function createDiagramFitController(page: HTMLElement): Destroyable | undefined {
  const switchers = [...page.querySelectorAll<HTMLElement>('.visualization-layouts[data-tabs]')];
  if (switchers.length === 0) return undefined;
  const chosen = new WeakSet<HTMLElement>();
  const abort = new AbortController();
  const widthOf = (svg: Element | null): number => Number(svg?.getAttribute('width') ?? 0);
  const fullDrawing = (panel: HTMLElement): SVGSVGElement | null =>
    panel.querySelector('svg.visualization-diagram:not([data-diagram-compact])');
  const compactDrawing = (panel: HTMLElement): SVGSVGElement | null =>
    panel.querySelector('svg[data-diagram-compact]');
  /** The drawing a panel shows in `available` pixels: its narrow top-down view when the full one does not fit. */
  const shownDrawing = (panel: HTMLElement, available: number): SVGSVGElement | null => {
    const full = fullDrawing(panel);
    const compact = compactDrawing(panel);
    return compact !== null && widthOf(full) * DIAGRAM_MINIMUM_SCALE > available ? compact : full;
  };
  const naturalWidth = (panel: HTMLElement, available = Number.POSITIVE_INFINITY): number =>
    widthOf(shownDrawing(panel, available));
  /** Every panel shows the drawing that fits; the narrow view is a form of `down`, not a reader choice. */
  const applyForms = (panels: readonly HTMLElement[], available: number): void => {
    for (const panel of panels) {
      const full = fullDrawing(panel);
      const compact = compactDrawing(panel);
      if (full === null || compact === null) continue;
      const narrow = shownDrawing(panel, available) === compact;
      full.toggleAttribute('hidden', narrow);
      compact.toggleAttribute('hidden', !narrow);
      panel.dataset.diagramForm = narrow ? 'compact' : 'full';
    }
  };
  const revealed = new WeakSet<HTMLElement>();
  const revealFlowStart = (switcher: HTMLElement): void => {
    const frame = switcher.querySelector<HTMLElement>(
      ':scope > [data-tab-panel]:not([hidden]) .visualization-frame',
    );
    if (frame === null || revealed.has(frame) || frame.scrollWidth <= frame.clientWidth + 1) return;
    // Начало потока — все узлы без входящей прямой связи, а не только первый слой: у потока с двумя
    // источниками второй может лежать в другом слое, и центр одного прятал другой за краем.
    const entered = new Set(
      [...frame.querySelectorAll<SVGElement>('[data-to]:not([data-draw-phase="backward"])')].map(
        (edge) => edge.dataset.to ?? '',
      ),
    );
    const starts = [...frame.querySelectorAll<SVGGElement>('[data-node-id]')]
      .filter((node) => !entered.has(node.dataset.nodeId ?? ''))
      .map((node) => node.getBoundingClientRect());
    if (starts.length === 0) return;
    revealed.add(frame);
    const left = Math.min(...starts.map((box) => box.left));
    const right = Math.max(...starts.map((box) => box.right));
    const frameLeft = frame.getBoundingClientRect().left;
    // Начало потока, которое шире рамки (несколько узлов первого слоя вида сверху вниз), открывается
    // с левого края: центр такого слоя прячет его первые узлы за краем.
    frame.scrollLeft +=
      right - left <= frame.clientWidth
        ? (left + right) / 2 - frameLeft - frame.clientWidth / 2
        : left - frameLeft - 8;
  };
  const fitView = (switcher: HTMLElement): void => {
    const panels = [...switcher.children].filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.matches('[data-tab-panel]'),
    );
    const available = frameContentWidth(
      switcher,
      switcher.querySelector('[data-tab-panel] .visualization-frame'),
    );
    if (switcher.clientWidth <= 0) return;
    applyForms(panels, available);
    if (chosen.has(switcher)) return;
    const authored = panels.find((panel) => panel.hasAttribute('data-layout-default'));
    if (authored === undefined) return;
    const fits = (panel: HTMLElement): boolean =>
      naturalWidth(panel, available) * DIAGRAM_MINIMUM_SCALE <= available;
    const fitting = panels.filter(fits);
    const target = fits(authored)
      ? authored
      : (fitting.sort(
          (left, right) => naturalWidth(right, available) - naturalWidth(left, available),
        )[0] ??
        [...panels].sort(
          (left, right) => naturalWidth(left, available) - naturalWidth(right, available),
        )[0]);
    if (target?.hidden) {
      const control = switcher.querySelector<HTMLButtonElement>(
        `[data-tab][aria-controls="${CSS.escape(target.id)}"]`,
      );
      if (control !== null) activateTab(control, false);
    }
    revealFlowStart(switcher);
  };
  const markChosen = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[data-tab]') === null) return;
    if (event instanceof KeyboardEvent && !TAB_SELECTION_KEYS.has(event.key)) return;
    const switcher = target.closest<HTMLElement>('.visualization-layouts[data-tabs]');
    if (switcher === null) return;
    chosen.add(switcher);
    // The delegated tab handler shows the chosen view after this listener; reveal its start then.
    clock.frame(() => revealFlowStart(switcher));
  };
  for (const switcher of switchers) {
    switcher.addEventListener('click', markChosen, { signal: abort.signal });
    switcher.addEventListener('keydown', markChosen, { signal: abort.signal });
  }
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) if (entry.target instanceof HTMLElement) fitView(entry.target);
  });
  for (const switcher of switchers) observer.observe(switcher);
  return {
    destroy: () => {
      abort.abort();
      observer.disconnect();
    },
  };
}

provideFeature('diagramFit', createDiagramFitController);
provideFeature('diagramForms', installDiagramForms);
