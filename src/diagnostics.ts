import type { Diagnostic, DiagnosticFix, SourceLocation } from './contracts.js';

const REDACTED = '[REDACTED]';
const credentialKeys = new Set([
  'accesskeyid',
  'accesstoken',
  'apikey',
  'auth',
  'authorization',
  'clientsecret',
  'credential',
  'credentials',
  'jwt',
  'password',
  'passwd',
  'refreshtoken',
  'secret',
  'sessionid',
  'sig',
  'signature',
  'token',
]);
const credentialKeySuffixes = [
  'accesskeyid',
  'accesstoken',
  'apikey',
  'authorization',
  'clientsecret',
  'credential',
  'credentials',
  'password',
  'passwd',
  'refreshtoken',
  'secret',
  'securitytoken',
  'sessionid',
  'signature',
  'token',
] as const;

export class AgenticReportError extends Error {
  public readonly diagnostic: Diagnostic;

  public constructor(diagnostic: Diagnostic, options?: ErrorOptions) {
    const sanitized = sanitizeDiagnostic(diagnostic);
    super(sanitized.message, options);
    this.name = 'AgenticReportError';
    this.diagnostic = sanitized;
  }
}

export function sanitizeDiagnostic(diagnostic: Diagnostic): Diagnostic {
  return {
    level: diagnostic.level,
    code: diagnostic.code,
    message: sanitizeText(diagnostic.message),
    remediation: sanitizeText(diagnostic.remediation),
    ...(diagnostic.source === undefined ? {} : { source: sanitizeSource(diagnostic.source) }),
    ...(diagnostic.fix === undefined ? {} : { fix: sanitizeFix(diagnostic.fix) }),
    ...(diagnostic.details === undefined
      ? {}
      : { details: sanitizeValue(diagnostic.details) as Readonly<Record<string, unknown>> }),
    ...(diagnostic.related === undefined
      ? {}
      : { related: diagnostic.related.map((entry) => sanitizeDiagnostic(entry)) }),
  };
}

export function sanitizeTransportValue<Value>(value: Value): Value {
  return sanitizeValue(value) as Value;
}

export function sanitizeTransportPath(value: string): string {
  return sanitizePathText(value);
}

export function toDiagnostic(error: unknown): Diagnostic {
  if (error instanceof AgenticReportError) return sanitizeDiagnostic(error.diagnostic);
  return {
    level: 'error',
    code: 'INTERNAL_ERROR',
    message: 'Unexpected internal failure.',
    remediation:
      'Retry with the same input; if the failure repeats, report the CLI version and run ID.',
  };
}

export function exitCodeForDiagnostic(diagnostic: Diagnostic): 1 | 2 | 3 {
  if (diagnostic.code === 'INTERNAL_ERROR') return 3;
  if (
    diagnostic.code === 'PACKAGE_ASSET_MISSING' ||
    diagnostic.code === 'INTERNAL_ASSET_REFERENCE_MISSING'
  ) {
    return 2;
  }
  return 1;
}

function sanitizeFix(fix: DiagnosticFix): DiagnosticFix {
  return {
    file: sanitizePathText(fix.file),
    start: fix.start,
    end: fix.end,
    replacement: sanitizeText(fix.replacement),
  };
}

/**
 * Whether this replacement survives transport untouched. A replacement sanitization would alter
 * carries a credential in authored bytes, and shipping the redacted form would invite a consumer to
 * write `[REDACTED]` over the author's own text, so such a fix is withheld at the source instead.
 */
export function isTransportSafeReplacement(replacement: string): boolean {
  return sanitizeText(replacement) === replacement;
}

function sanitizeSource(source: SourceLocation): SourceLocation {
  return {
    file: sanitizePathText(source.file),
    ...(source.line === undefined ? {} : { line: source.line }),
    ...(source.column === undefined ? {} : { column: source.column }),
    ...(source.endLine === undefined ? {} : { endLine: source.endLine }),
    ...(source.endColumn === undefined ? {} : { endColumn: source.endColumn }),
  };
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if (key !== undefined && isCredentialKey(key)) return REDACTED;
  if (typeof value === 'string') {
    return isPathKey(key) ? sanitizePathText(value) : sanitizeText(value);
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, key));
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, sanitizeValue(child, childKey)]),
    );
  }
  if (typeof value === 'object' && value !== null) return REDACTED;
  return value;
}

function sanitizeText(value: string): string {
  const urlsSanitized = value.replace(/https?:\/\/[^\s"'<>]+/giu, (candidate) =>
    sanitizeUrl(candidate),
  );
  return sanitizeCredentialAssignments(sanitizeUserinfoFallback(urlsSanitized));
}

function sanitizePathText(value: string): string {
  const urlsSanitized = value.replace(/https?:\/\/[^\s"'<>]+/giu, (candidate) =>
    sanitizeUrl(candidate),
  );
  return sanitizeCredentialAssignments(sanitizeUserinfoFallback(urlsSanitized), true);
}

function sanitizeUrl(candidate: string): string {
  try {
    const url = new URL(candidate);
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      if (isCredentialKey(key)) url.searchParams.set(key, REDACTED);
    }
    const fragment = url.hash.slice(1);
    if (fragment.includes('=')) {
      url.hash = sanitizeParameterText(fragment);
    }
    return url.toString().replaceAll('%5BREDACTED%5D', REDACTED);
  } catch {
    return sanitizeCredentialAssignments(sanitizeUserinfoFallback(candidate));
  }
}

function sanitizeParameterText(value: string): string {
  return value
    .split(/([&;])/u)
    .map((part) => {
      const separator = part.indexOf('=');
      if (separator < 0) return part;
      const key = part.slice(0, separator);
      return isCredentialKey(key) ? `${key}=${REDACTED}` : part;
    })
    .join('');
}

function sanitizeCredentialAssignments(value: string, pathAware = false): string {
  const pattern = pathAware
    ? /([?&#;\\/]|\b)([^?&#;=/\\\s]+)=([^&#;/\\\s]*)/gu
    : /([?&#;]|\b)([^?&#;=\s]+)=([^&#;\s]*)/gu;
  return value.replace(pattern, (match, prefix: string, key: string) =>
    isCredentialKey(key) ? `${prefix}${key}=${REDACTED}` : match,
  );
}

function sanitizeUserinfoFallback(value: string): string {
  return value.replace(/(https?:\/\/)[^/@\s]+@/giu, '$1');
}

function isCredentialKey(value: string): boolean {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Compare the original malformed key through the same bounded normalization.
  }
  const normalized = decoded.toLowerCase().replace(/[-_.\s]/gu, '');
  return (
    credentialKeys.has(normalized) ||
    credentialKeySuffixes.some((suffix) => normalized.endsWith(suffix))
  );
}

function isPathKey(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.toLowerCase().replace(/[-_.\s]/gu, '');
  return (
    normalized === 'file' ||
    normalized === 'files' ||
    normalized === 'target' ||
    normalized === 'destination' ||
    normalized.endsWith('path') ||
    normalized.endsWith('paths') ||
    normalized.endsWith('files')
  );
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
