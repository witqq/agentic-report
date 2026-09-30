/*! agentic-report script: demo */
/**
 * The playable demo (`:::demo`): the scene plays its beats by time or by scroll, and the counter demo adds
 * its step on each press.
 */

import { pageClock, progressOverride } from '../clock.js';
import { type Cleanup, provideFeature } from '../features.js';
import { pace, timed } from '../technique-timing.js';

const clock = pageClock();
const root = document.documentElement;

// ——— Проигрываемая сцена demo ———

function lightFocus(scope: HTMLElement, ids: ReadonlySet<string>): void {
  scope.toggleAttribute('data-demo-focus', ids.size > 0);
  for (const node of scope.querySelectorAll<SVGElement>('[data-node-id]'))
    node.toggleAttribute('data-lit', ids.has(node.dataset.nodeId ?? ''));
  for (const edge of scope.querySelectorAll<SVGElement>('[data-from][data-to]'))
    edge.toggleAttribute(
      'data-lit',
      ids.has(edge.dataset.edgeId ?? '') ||
        (ids.has(edge.dataset.from ?? '') && ids.has(edge.dataset.to ?? '')),
    );
}

/**
 * Сцена по времени играет такты по очереди, по `seconds` на такт, и останавливается на конечном кадре;
 * запускается, когда показалась, встаёт на паузу, когда ушла с экрана, и начинается заново, когда её
 * вкладку открыли снова. Сцена по прокрутке закреплена, пока читатель проходит её такты: текущий такт —
 * доля пройденного пути.
 */
function installDemoScene(demo: HTMLElement): Cleanup {
  const beats = [...demo.querySelectorAll<HTMLElement>('[data-demo-beat]')];
  const stage = demo.querySelector<HTMLElement>('[data-demo-stage]');
  const frameElement = demo.querySelector<HTMLElement>('[data-demo-frame]');
  const controls = demo.querySelector<HTMLElement>('[data-demo-controls]');
  const toggle = demo.querySelector<HTMLButtonElement>('[data-demo-toggle]');
  const position = demo.querySelector<HTMLElement>('[data-demo-position]');
  const count = beats.length;
  const clear = (): void => {
    demo.removeAttribute('data-demo-live');
    demo.removeAttribute('data-demo-state');
    demo.removeAttribute('data-demo-index');
    for (const beat of beats) {
      beat.removeAttribute('data-demo-state');
      beat.removeAttribute('data-current');
    }
    if (stage !== null) lightFocus(stage, new Set());
    if (controls !== null) controls.hidden = true;
    if (position !== null) position.textContent = `${count} / ${count}`;
  };
  if (count === 0 || stage === null || frameElement === null) return clear;
  demo.setAttribute('data-demo-live', '');

  const select = (index: number): void => {
    demo.dataset.demoIndex = String(index);
    for (const [at, beat] of beats.entries()) {
      beat.dataset.demoState = at < index ? 'passed' : at === index ? 'current' : 'next';
      beat.toggleAttribute('data-current', at === index);
    }
    lightFocus(
      stage,
      new Set(
        (beats[index]?.dataset.focus ?? '')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    );
    if (position !== null) position.textContent = `${index + 1} / ${count}`;
  };

  if (demo.dataset.play === 'scroll') {
    const paint = (): void => {
      const box = demo.getBoundingClientRect();
      const line = Number.parseFloat(getComputedStyle(root).getPropertyValue('--topbar-clearance'));
      const travel = Math.max(1, box.height - frameElement.getBoundingClientRect().height);
      const progress =
        progressOverride(demo) ??
        Math.min(1, Math.max(0, ((Number.isFinite(line) ? line : 72) - box.top) / travel));
      demo.style.setProperty('--demo-progress', progress.toFixed(4));
      select(Math.min(count - 1, Math.floor(progress * count)));
    };
    let frame = 0;
    const schedule = (): void => {
      if (frame === 0)
        frame = clock.frame(() => {
          frame = 0;
          paint();
        });
    };
    const unregister = clock.register({ at: paint });
    document.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    paint();
    return () => {
      unregister();
      document.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame !== 0) clock.cancelFrame(frame);
      demo.style.removeProperty('--demo-progress');
      clear();
    };
  }

  // По времени.
  const beatMs = (): number => Number(demo.dataset.seconds ?? '3') * 1000 * pace();
  let state: 'waiting' | 'playing' | 'paused' | 'ended' = 'waiting';
  let startedAt = 0;
  let offset = 0;
  let pausedByReader = false;
  const label = (): void => {
    if (toggle === null) return;
    const text =
      state === 'playing'
        ? demo.dataset.labelPause
        : state === 'ended'
          ? demo.dataset.labelReplay
          : demo.dataset.labelPlay;
    // Кнопка называет то, что сделает: у переключателя с меняющейся подписью нет состояния «нажата».
    toggle.textContent = text ?? '';
  };
  const render = (now: number): boolean => {
    const total = beatMs() * count;
    let elapsed = state === 'playing' ? now - startedAt : offset;
    if (state === 'playing' && elapsed >= total) {
      state = 'ended';
      offset = total;
      elapsed = total;
    }
    select(Math.min(count - 1, Math.floor(Math.max(0, elapsed) / beatMs())));
    demo.dataset.demoState = state;
    label();
    return state === 'playing';
  };
  const run = timed(render);
  const play = (): void => {
    if (state === 'ended') offset = 0;
    startedAt = clock.now() - offset;
    state = 'playing';
    render(clock.now());
    run.start();
  };
  const pause = (): void => {
    if (state !== 'playing') return;
    offset = clock.now() - startedAt;
    state = 'paused';
    render(clock.now());
  };
  const reset = (): void => {
    state = 'waiting';
    offset = 0;
    render(clock.now());
  };
  const onToggle = (): void => {
    if (state === 'playing') {
      pausedByReader = true;
      pause();
    } else {
      pausedByReader = false;
      play();
    }
  };
  toggle?.addEventListener('click', onToggle);
  if (controls !== null) controls.hidden = false;
  render(clock.now());
  let observer: IntersectionObserver | undefined;
  if (typeof window.IntersectionObserver === 'function') {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (state === 'waiting' || (state === 'paused' && !pausedByReader)) play();
          } else if (demo.closest('[hidden]') !== null) {
            // Вкладку сценария закрыли: открытая снова, она играет с начала.
            pausedByReader = false;
            reset();
          } else pause();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(demo);
  }
  return () => {
    observer?.disconnect();
    toggle?.removeEventListener('click', onToggle);
    run.stop();
    if (toggle !== null) {
      toggle.textContent = demo.dataset.labelPlay ?? '';
    }
    clear();
  };
}

function increment(button: HTMLButtonElement): void {
  const demo = button.closest<HTMLElement>('[data-demo-counter]');
  const output = demo?.querySelector<HTMLOutputElement>('[data-demo-output]');
  if (demo !== null && demo !== undefined && output !== null && output !== undefined) {
    const value = Number(output.value || output.textContent || demo.dataset.start || '0');
    const next = value + Number(demo.dataset.step ?? '1');
    output.value = String(next);
    output.textContent = String(next);
  }
}

provideFeature('demo', { increment, scene: installDemoScene });
