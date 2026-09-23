/**
 * Запускает встроенные видео, пока они на экране, и останавливает, когда уходят. Видео беззвучные,
 * поэтому браузер разрешает запуск без жеста. Читатель, который предпочитает меньше движения,
 * запускает видео сам кнопкой, а пауза, поставленная читателем, больше не снимается.
 */
export function installVideoAutoplay(reducedMotion: MediaQueryList): void {
  const videos = [...document.querySelectorAll<HTMLVideoElement>('video[data-video-autoplay]')];
  if (videos.length === 0 || typeof window.IntersectionObserver !== 'function') return;

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
    video.addEventListener('play', () => resumable.delete(video));
    observer.observe(video);
  }
  reducedMotion.addEventListener('change', () => {
    for (const video of videos) sync(video);
  });
}
