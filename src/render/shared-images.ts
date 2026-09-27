/**
 * Повторяющиеся медиа одного файла встраиваются один раз.
 *
 * В одном файле картинка, ролик и постер — data URL, и каждое их появление несёт все байты заново:
 * картинка, показанная в первом экране и снова в галерее, да ещё в обеих языковых версиях, весит
 * вчетверо, ролик в двух режимах — вдвое. Здесь каждый data URL, встреченный в `src` или `poster` больше
 * одного раза, уходит в общий блок данных, а его появления получают ссылку `data-shared-src` или
 * `data-shared-poster`; рантайм подставляет медиа при загрузке и в каждую вставленную позже разметку
 * (смена языка). Медиа, встреченное один раз, остаётся на месте.
 */
export interface SharedImages {
  readonly html: string;
  /** Байты, которые убраны повторами: столько же меньше весит файл. */
  readonly savedBytes: number;
}

export const SHARED_IMAGES_ELEMENT_ID = 'agentic-shared-images';

const MEDIA_SOURCE = /\s(src|poster)="(data:(?:image|video|audio)\/[^"]+)"/gu;

export function shareRepeatedImages(html: string): SharedImages {
  const counts = new Map<string, number>();
  for (const match of html.matchAll(MEDIA_SOURCE)) {
    const url = match[2] ?? '';
    counts.set(url, (counts.get(url) ?? 0) + 1);
  }
  const ids = new Map<string, string>();
  for (const [url, count] of counts) if (count > 1) ids.set(url, `i${ids.size + 1}`);
  if (ids.size === 0) return { html, savedBytes: 0 };

  let savedBytes = 0;
  const replaced = html.replace(MEDIA_SOURCE, (whole, attribute: string, url: string) => {
    const id = ids.get(url);
    if (id === undefined) return whole;
    savedBytes += Buffer.byteLength(url);
    return ` data-shared-${attribute}="${id}"`;
  });
  const table = Object.fromEntries([...ids].map(([url, id]) => [id, url]));
  const block = `<script type="application/json" id="${SHARED_IMAGES_ELEMENT_ID}">${JSON.stringify(table)}</script>`;
  // Блок стоит в начале `body`: встроенный рантайм выполняется, как только разобран, и блок уже должен
  // быть в документе.
  const bodyOpen = /<body\b[^>]*>/u.exec(replaced);
  const at = bodyOpen === null ? 0 : bodyOpen.index + bodyOpen[0].length;
  const withBlock = `${replaced.slice(0, at)}${block}${replaced.slice(at)}`;
  // Каждое медиа остаётся в файле ровно один раз — в блоке данных.
  const kept = [...ids.keys()].reduce((sum, url) => sum + Buffer.byteLength(url), 0);
  return { html: withBlock, savedBytes: savedBytes - kept };
}
