let sharedImages: Readonly<Record<string, string>> | undefined;

/**
 * Картинка, встреченная в одном файле несколько раз, встроена один раз в общий блок данных; её появления
 * несут только ссылку `data-shared-src` (`src/render/shared-images.ts`). Здесь ссылка становится `src` —
 * при загрузке страницы и в каждой разметке, вставленной позже.
 */
export function hydrateSharedImages(scope: ParentNode): void {
  const media = scope.querySelectorAll<HTMLElement>(
    '[data-shared-src], [data-shared-poster], [data-shared-dark-src], [data-shared-dark-poster]',
  );
  if (media.length === 0) return;
  sharedImages ??= JSON.parse(
    document.getElementById('agentic-shared-images')?.textContent ?? '{}',
  ) as Record<string, string>;
  const reload = new Set<HTMLMediaElement>();
  for (const element of media) {
    const src = sharedImages[element.dataset.sharedSrc ?? ''];
    if (src !== undefined) {
      element.setAttribute('src', src);
      delete element.dataset.sharedSrc;
      // Источник ролика выбирается при загрузке: после подстановки ролик выбирает заново.
      const video = element.closest('video, audio');
      if (video instanceof HTMLMediaElement && element.tagName === 'SOURCE') reload.add(video);
    }
    const poster = sharedImages[element.dataset.sharedPoster ?? ''];
    if (poster !== undefined) {
      element.setAttribute('poster', poster);
      delete element.dataset.sharedPoster;
    }
    // Dark variants (`scheme-media.ts`) are shared the same way.
    const darkSrc = sharedImages[element.dataset.sharedDarkSrc ?? ''];
    if (darkSrc !== undefined) {
      element.dataset.darkSrc = darkSrc;
      delete element.dataset.sharedDarkSrc;
    }
    const darkPoster = sharedImages[element.dataset.sharedDarkPoster ?? ''];
    if (darkPoster !== undefined) {
      element.dataset.darkPoster = darkPoster;
      delete element.dataset.sharedDarkPoster;
    }
  }
  for (const video of reload) video.load();
}
