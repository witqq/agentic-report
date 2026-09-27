import { describe, expect, it } from 'vitest';

import {
  createClock,
  MANUAL_CLOCK_GLOBAL,
  type ClockHost,
  type ClockMedia,
} from '../../src/browser/clock.js';

/** Окно без браузера: настоящие функции записывают вызовы, время идёт только по `advance`. */
function fakeHost(extra: Partial<ClockHost> = {}) {
  let real = 5_000;
  const realFrames: FrameRequestCallback[] = [];
  const realTimers: Array<{ readonly callback: () => void; readonly milliseconds: number }> = [];
  const performance = { now: () => real };
  const requestAnimationFrame = (callback: FrameRequestCallback): number =>
    realFrames.push(callback);
  const cancelAnimationFrame = (): void => undefined;
  const setTimeout = (callback: () => void, milliseconds: number): number =>
    realTimers.push({ callback, milliseconds });
  const clearTimeout = (): void => undefined;
  const host: ClockHost = {
    performance,
    Date,
    requestAnimationFrame,
    cancelAnimationFrame,
    setTimeout,
    clearTimeout,
    ...extra,
  };
  return {
    host,
    originals: { now: performance.now, Date, requestAnimationFrame, setTimeout },
    realFrames,
    realTimers,
    advance: (milliseconds: number) => {
      real += milliseconds;
    },
  };
}

function manualHost() {
  return fakeHost({ [MANUAL_CLOCK_GLOBAL]: 'manual' });
}

describe('page clock', () => {
  // Ловит: обычный просмотр ведёт себя иначе, чем без часов (подменены глобальные функции, кадры или
  // отложенные вызовы уходят не в браузер).
  it('leaves the real clock untouched when nothing asked for manual time', () => {
    const fake = fakeHost();
    const clock = createClock(fake.host);
    expect(clock.mode).toBe('real');
    expect(fake.host.performance.now).toBe(fake.originals.now);
    expect(fake.host.Date).toBe(fake.originals.Date);
    expect(fake.host.requestAnimationFrame).toBe(fake.originals.requestAnimationFrame);
    expect(fake.host.__clock).toBeUndefined();
    expect(clock.now()).toBe(5_000);
    fake.advance(16);
    expect(clock.now()).toBe(5_016);
    const frame = (): void => undefined;
    clock.frame(frame);
    expect(fake.realFrames).toEqual([frame]);
    const later = (): void => undefined;
    clock.later(later, 1200);
    expect(fake.realTimers).toEqual([{ callback: later, milliseconds: 1200 }]);
  });

  // Ловит: время в ручном режиме утекает из настоящих часов, и снимок в момент t зависит от того,
  // сколько прошло до него.
  it('does not advance manual time by itself; seek sets it for performance.now and Date', () => {
    const fake = manualHost();
    const clock = createClock(fake.host);
    expect(clock.mode).toBe('manual');
    expect(clock.now()).toBe(0);
    fake.advance(10_000);
    expect(clock.now()).toBe(0);
    expect(fake.host.performance.now()).toBe(0);
    fake.host.__clock?.seek(1.25);
    expect(clock.now()).toBe(1250);
    expect(fake.host.performance.now()).toBe(1250);
    expect(fake.host.Date.now()).toBe(1250);
    expect(new fake.host.Date().getTime()).toBe(1250);
    expect(fake.host.__clock?.realNow()).toBe(15_000);
    fake.host.__clock?.seek(0.5);
    expect(clock.now()).toBe(500);
  });

  // Ловит: запрошенные кадры исполняются браузером сами (движение идёт без перемотки) или теряются.
  it('runs requested frames on seek with the clock time, once, and keeps frames they request for the next seek', () => {
    const fake = manualHost();
    const clock = createClock(fake.host);
    const seen: number[] = [];
    const step = (time: number): void => {
      seen.push(time);
      clock.frame(step);
    };
    clock.frame(step);
    const cancelled = clock.frame(() => seen.push(-1));
    clock.cancelFrame(cancelled);
    expect(fake.realFrames).toEqual([]);
    expect(seen).toEqual([]);
    fake.host.__clock?.seek(0.1);
    expect(seen).toEqual([100]);
    fake.host.__clock?.seek(0.2);
    expect(seen).toEqual([100, 200]);
  });

  // Ловит: видимые задержки (закрытие подсказки, возврат подписи) идут по настоящему времени и
  // срабатывают между снимками.
  it('fires delayed calls only when a seek reaches their time, in order, with the clock at their due time', () => {
    const fake = manualHost();
    const clock = createClock(fake.host);
    const fired: Array<[string, number]> = [];
    clock.later(() => fired.push(['late', clock.now()]), 300);
    clock.later(() => fired.push(['early', clock.now()]), 100);
    const cancelled = clock.later(() => fired.push(['cancelled', clock.now()]), 50);
    clock.cancelLater(cancelled);
    expect(fake.realTimers).toEqual([]);
    fake.host.__clock?.seek(0.2);
    expect(fired).toEqual([['early', 100]]);
    fake.host.__clock?.seek(1);
    expect(fired).toEqual([
      ['early', 100],
      ['late', 300],
    ]);
  });

  // Ловит: зарегистрированная подсистема не получает момент перемотки или получает его после отписки.
  it('calls registered subsystems with the seek time in seconds until they unregister', () => {
    const fake = manualHost();
    const clock = createClock(fake.host);
    const times: number[] = [];
    const unregister = clock.register({ at: (seconds) => times.push(seconds) });
    fake.host.__clock?.seek(2);
    fake.host.__clock?.seek(0.5);
    unregister();
    fake.host.__clock?.seek(3);
    expect(times).toEqual([2, 0.5]);
  });

  // Ловит: анимации ставятся в положение от начала страницы, а не от своего начала, и переход,
  // начатый позже, на перемотке показан уже законченным.
  it('marks animations started between seeks at the earlier clock time and positions them at the target', () => {
    const fake = manualHost();
    const calls: string[] = [];
    const media: ClockMedia = {
      mark: (time) => calls.push(`mark ${time}`),
      position: (time, seconds) => calls.push(`position ${time} ${seconds}`),
    };
    createClock(fake.host, media);
    fake.host.__clock?.seek(0.4);
    expect(calls[0]).toBe('mark 0');
    expect(calls.at(-1)).toBe('position 400 0.4');
  });

  // Ловит: страница внутри ролика agentic-screencast ставит свои часы поверх чужих или не слышит его
  // перемотку.
  it('joins an existing screencast clock through renderAt without replacing it', () => {
    const outer = { seek: () => undefined, now: () => 700, realNow: () => 0 };
    const rendered: number[] = [];
    const fake = fakeHost({ __clock: outer, renderAt: (seconds) => rendered.push(seconds) });
    fake.host.performance.now = () => 700;
    const clock = createClock(fake.host);
    expect(clock.mode).toBe('external');
    expect(fake.host.__clock).toBe(outer);
    const times: number[] = [];
    clock.register({ at: (seconds) => times.push(seconds) });
    const fired: string[] = [];
    clock.later(() => fired.push('due'), 100);
    fake.host.renderAt?.(0.75);
    expect(rendered).toEqual([0.75]);
    expect(times).toEqual([0.75]);
    expect(fired).toEqual([]);
    fake.host.renderAt?.(0.8);
    expect(fired).toEqual(['due']);
  });
});
