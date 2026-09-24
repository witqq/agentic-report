export type PublicUrlNormalization =
  | { readonly ok: true; readonly value: string }
  | {
      readonly ok: false;
      readonly reason: 'not-absolute' | 'scheme' | 'credentials' | 'fragment';
    };

/**
 * Публичный адрес страницы: абсолютный `http(s)` без учётных данных и фрагмента, в каноническом
 * виде `URL.href`. Его пишут в canonical и OpenGraph, поэтому ни ссылка на раздел, ни чужая схема,
 * ни пароль в адресе туда попасть не могут; сам адрес пакет никогда не запрашивает.
 */
export function normalizePublicUrl(authoredValue: string): PublicUrlNormalization {
  let parsed: URL;
  try {
    parsed = new URL(authoredValue.trim());
  } catch {
    return { ok: false, reason: 'not-absolute' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: 'scheme' };
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return { ok: false, reason: 'credentials' };
  }
  if (parsed.hash !== '' || authoredValue.includes('#')) {
    return { ok: false, reason: 'fragment' };
  }
  return { ok: true, value: parsed.href };
}

export function isPublicUrl(value: string): boolean {
  return normalizePublicUrl(value).ok;
}

export function publicUrlProblem(
  reason: Extract<PublicUrlNormalization, { ok: false }>['reason'],
): string {
  switch (reason) {
    case 'not-absolute':
      return 'Public URL must be an absolute http(s) URL.';
    case 'scheme':
      return 'Public URL must use the http or https scheme.';
    case 'credentials':
      return 'Public URL must not carry a user name or password.';
    case 'fragment':
      return 'Public URL must not carry a #fragment.';
  }
}
