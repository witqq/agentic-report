/**
 * Схема на узкой дорожке. Схема ужимается до ширины дорожки, пока её самый мелкий текст (пояснение узла,
 * 12.5 px) остаётся не мельче 11 px на экране; дальше она не мельчает, а меняет представление:
 *
 * - последовательность становится списком шагов «от → к: сообщение», собранным при сборке из тех же
 *   данных, а картинка остаётся в просмотре во весь экран;
 * - флоу показывает свой узкий вид сверху вниз — это решает переключатель видов в рантайме страницы.
 *
 * На телефоне «Схема словами» открыта с самого начала, кроме последовательности, уже показанной списком:
 * её слова и есть этот список.
 */

/**
 * Доля естественной ширины, мельче которой схема не ужимается: самый мелкий текст схемы — пояснение узла
 * (`NODE_DETAIL_FONT_SIZE`, 12.5 px) — остаётся не мельче 11 px на экране с запасом на округление.
 */
export const DIAGRAM_READABLE_SCALE = 0.9;

/** Ширина, с которой страница считается телефонной, — та же, что у правил телефона в стилях. */
const PHONE = '(width <= 620px)';

/**
 * Ширина содержимого рамки рисунка в дорожке фигуры: дорожка плюс выход рамки к краям экрана (отрицательные
 * поля на телефоне) без её полей и линии. Считается по стилям, а не по размеру рамки: скрытая рамка
 * последовательности, показанной списком, размера не имеет.
 */
export function frameContentWidth(track: HTMLElement, frame: Element | null): number {
  if (frame === null) return track.clientWidth;
  const style = getComputedStyle(frame);
  const inset = [
    style.marginLeft,
    style.marginRight,
    style.paddingLeft,
    style.paddingRight,
    style.borderLeftWidth,
    style.borderRightWidth,
  ]
    .map((value) => Number.parseFloat(value) || 0)
    .reduce((sum, value) => sum + value, 0);
  return track.clientWidth - inset;
}

function fitSequence(figure: HTMLElement): void {
  const frame = figure.querySelector<HTMLElement>(':scope > .visualization-frame');
  const list = figure.querySelector<HTMLElement>(':scope > [data-sequence-list]');
  const svg = frame?.querySelector('svg.visualization-sequence');
  if (frame === null || list === null || svg === null || svg === undefined) return;
  const available = frameContentWidth(figure, frame);
  if (available <= 0) return;
  const natural = Number(svg.getAttribute('width') ?? 0);
  const asList = natural * DIAGRAM_READABLE_SCALE > available;
  frame.hidden = asList;
  list.hidden = !asList;
  figure.dataset.diagramForm = asList ? 'list' : 'drawing';
}

export function installDiagramForms(page: HTMLElement): () => void {
  const sequences = [
    ...page.querySelectorAll<HTMLElement>('figure[data-diagram-type="sequence"]'),
  ].filter((figure) => figure.querySelector('[data-sequence-list]') !== null);
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) if (entry.target instanceof HTMLElement) fitSequence(entry.target);
  });
  for (const figure of sequences) {
    fitSequence(figure);
    observer.observe(figure);
  }
  if (window.matchMedia(PHONE).matches) {
    for (const transcript of page.querySelectorAll<HTMLDetailsElement>(
      'details.visualization-transcript',
    )) {
      if (transcript.closest('[data-diagram-form="list"]') !== null) continue;
      transcript.open = true;
    }
  }
  return () => observer.disconnect();
}
