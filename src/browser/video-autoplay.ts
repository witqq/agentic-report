import { contentElements, type Cleanup } from './features.js';

/**
 * Запускает встроенные видео, пока они на экране, и останавливает, когда уходят. Видео беззвучные,
 * поэтому браузер разрешает запуск без жеста. Читатель, который предпочитает меньше движения,
 * запускает видео сам кнопкой, а пауза, поставленная читателем, больше не снимается.
 */
export function installVideoAutoplay(
  scope: HTMLElement,
  reducedMotion: MediaQueryList,
  strings: { readonly playVideo: string; readonly pauseVideo: string },
): Cleanup {
  const videos = contentElements<HTMLVideoElement>(scope, 'video[data-video-autoplay]');
  if (videos.length === 0 || typeof window.IntersectionObserver !== 'function')
    return () => undefined;
  const abort = new AbortController();

  const visible = new WeakSet<HTMLVideoElement>();
  // Видео, которое runtime вправе запустить: ещё не игравшее или остановленное самим runtime. Пауза
  // читателя сюда видео не возвращает. Решение принимается по этому набору, а не по событию `pause`:
  // событие приходит позже вызова `pause()`, и запуск, случившийся между ними, снял бы паузу читателя.
  const resumable = new WeakSet<HTMLVideoElement>(videos);

  const sync = (video: HTMLVideoElement): void => {
    if (reducedMotion.matches || !visible.has(video)) {
      if (!video.paused) {
        resumable.add(video);
        video.pause();
      }
      return;
    }
    // Отказ браузера запустить видео оставляет его на кнопке; ошибкой страницы это не считается.
    if (video.paused && resumable.has(video)) void video.play().catch(() => undefined);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const video = entry.target;
        if (!(video instanceof HTMLVideoElement)) continue;
        if (entry.isIntersecting) visible.add(video);
        else visible.delete(video);
        sync(video);
      }
    },
    { threshold: 0.5 },
  );
  for (const video of videos) {
    video.muted = true;
    video.addEventListener('play', () => resumable.delete(video), { signal: abort.signal });
    observer.observe(video);
  }
  // Кнопка фонового видео говорит, что она сделает: остановит идущее или запустит стоящее.
  for (const video of contentElements<HTMLVideoElement>(scope, 'video[data-video-background]')) {
    const toggle = video.closest('figure')?.querySelector<HTMLButtonElement>('[data-video-toggle]');
    if (toggle === null || toggle === undefined) continue;
    const label = (): void => {
      const text = video.paused ? strings.playVideo : strings.pauseVideo;
      toggle.textContent = text;
      toggle.setAttribute('aria-label', text);
      toggle.setAttribute('aria-pressed', String(video.paused));
    };
    video.addEventListener('play', label, { signal: abort.signal });
    video.addEventListener('pause', label, { signal: abort.signal });
    label();
  }
  reducedMotion.addEventListener(
    'change',
    () => {
      for (const video of videos) sync(video);
    },
    { signal: abort.signal },
  );
  return () => {
    abort.abort();
    observer.disconnect();
    for (const video of videos) video.pause();
  };
}
