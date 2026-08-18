export type LocalReferenceNormalization =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: 'invalid-uri' | 'invalid-relative-path' };

export function normalizePackageRelativePosixReference(
  authoredValue: string,
): LocalReferenceNormalization {
  const trimmed = authoredValue.trim();
  if (/%2f/iu.test(trimmed)) {
    return { ok: false, reason: 'invalid-relative-path' };
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return { ok: false, reason: 'invalid-uri' };
  }
  return isPackageRelativePosixPath(decoded)
    ? { ok: true, value: decoded }
    : { ok: false, reason: 'invalid-relative-path' };
}

export function isNormalizedPackageRelativePosixPath(value: string): boolean {
  return normalizePackageRelativePosixReference(value).ok;
}

export function isPackageRelativePosixPath(value: string): boolean {
  if (value.length === 0 || value.includes('\\') || containsAsciiControl(value)) {
    return false;
  }
  if (value.startsWith('/') || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)) return false;
  const segments = value.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function containsAsciiControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}
