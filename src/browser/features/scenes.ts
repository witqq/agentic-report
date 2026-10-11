/*! agentic-report script: scenes */
/**
 * Scenes of sections: the steps scene (`scene="steps"`) whose current beat is the one crossing the middle
 * of the screen, and the scrub scene (`scene="scrub"`, `scenes.ts`) driven by the scroll through its pin.
 */

import { provideFeature } from '../features.js';
import { pageClock } from '../clock.js';
import { watchGeometry } from '../geometry-rebuild.js';
import { installScrubScenes, lightCodeLines, setBeatStates } from '../scenes.js';

/** Текущий такт — тот, что пересекает середину экрана; ему принадлежат кадр сцены и фокус схемы. */
function installStepScene(section: HTMLElement, live: 'wide' | 'narrow' | undefined): () => void {
  const beats = [...section.querySelectorAll<HTMLElement>('.semantic-beat[data-beat]')];
  const frames = [...section.querySelectorAll<HTMLElement>('img[data-scene-frame]')];
  const clear = (): void => {
    section.removeAttribute('data-scene-live');
    section.removeAttribute('data-scene-narrow');
    section.removeAttribute('data-scene-focus');
    lightCodeLines(section, undefined);
    setBeatStates(section, beats, () => false);
    for (const beat of beats) beat.removeAttribute('data-current');
    for (const frame of frames) frame.removeAttribute('data-scene-active');
    for (const lit of section.querySelectorAll('[data-lit]')) lit.removeAttribute('data-lit');
  };
  clear();
  if (live === undefined || beats.length === 0) {
    // Без движения такты стоят подряд, и каждое их состояние страницы горит: конечная картина.
    setBeatStates(section, beats, () => true);
    return clear;
  }
  section.setAttribute(live === 'wide' ? 'data-scene-live' : 'data-scene-narrow', '');
  let selected = -1;
  const select = (index: number): void => {
    if (selected === index) return;
    selected = index;
    for (const [position, beat] of beats.entries())
      beat.toggleAttribute('data-current', position === index);
    const frame = Math.min(index, frames.length - 1);
    for (const [position, image] of frames.entries())
      image.toggleAttribute('data-scene-active', position === frame);
    lightCodeLines(section, beats[index]);
    setBeatStates(section, beats, (position) => position === index);
    const focus = new Set(
      (beats[index]?.dataset.focus ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    );
    section.toggleAttribute('data-scene-focus', focus.size > 0);
    for (const node of section.querySelectorAll<SVGElement>('[data-node-id]'))
      node.toggleAttribute('data-lit', focus.has(node.dataset.nodeId ?? ''));
    for (const edge of section.querySelectorAll<SVGElement>('[data-from][data-to]'))
      edge.toggleAttribute(
        'data-lit',
        focus.has(edge.dataset.edgeId ?? '') ||
          (focus.has(edge.dataset.from ?? '') && focus.has(edge.dataset.to ?? '')),
      );
  };
  const update = (): void => {
    const middle = window.innerHeight / 2;
    let nearest = 0;
    let distance = Infinity;
    for (const [index, beat] of beats.entries()) {
      const box = beat.getBoundingClientRect();
      const away = Math.max(box.top - middle, middle - box.bottom, 0);
      if (away < distance) {
        nearest = index;
        distance = away;
      }
    }
    select(nearest);
  };
  const clock = pageClock();
  let frame = 0;
  const schedule = (): void => {
    if (frame !== 0) return;
    frame = clock.frame(() => {
      frame = 0;
      update();
    });
  };
  const unregister = clock.register({ at: update });
  const geometry = watchGeometry(schedule, { name: 'steps scene' });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
  return () => {
    unregister();
    geometry.stop();
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    if (frame !== 0) clock.cancelFrame(frame);
    clear();
  };
}

provideFeature('stepScene', installStepScene);
provideFeature('scrubScenes', installScrubScenes);
