/**
 * The film manifest that `agentic-screencast web` writes next to its encodings: `::video{from="…"}`
 * reads it and expands into the same shape an author writes by hand — the encodings as `sources` in
 * the manifest's order, a poster, and a chapters file — before the video step embeds or copies them.
 *
 * `from` names either the manifest (`<film>.web.json`) or a directory that holds exactly one. The
 * manifest is version 1; every path in it is relative to the manifest's directory and must stay under
 * the report source root, like any other local reference.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { AgenticReportError } from '../diagnostics.js';
import { resolveLocalPath } from '../source/load-source.js';

/** The manifest version this compiler reads. */
export const SCREENCAST_MANIFEST_VERSION = 1;
/** The name suffix of a film manifest inside a directory. */
export const SCREENCAST_MANIFEST_SUFFIX = '.web.json';

const relativeFile = z.string().min(1);

/**
 * Version 1 of the manifest. Only the fields the page uses are required to be well formed; the
 * measurements are typed when present so that a file of another kind does not pass as a film.
 */
const manifestSchema = z.object({
  version: z.literal(SCREENCAST_MANIFEST_VERSION),
  film: z.string().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  duration: z.number().nonnegative().optional(),
  audio: z.boolean().optional(),
  lang: z.string().min(1).optional(),
  poster: z
    .object({ jpg: relativeFile.optional(), webp: relativeFile.optional() })
    .refine((poster) => poster.jpg !== undefined || poster.webp !== undefined, {
      message: 'poster needs jpg or webp',
    }),
  sources: z
    .array(
      z.object({
        src: relativeFile,
        type: z.string().optional(),
        format: z.enum(['av1', 'vp9', 'h264']).optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        bytes: z.number().optional(),
      }),
    )
    .min(1),
  chapters: relativeFile.optional(),
  thumbnails: z.object({ sprite: relativeFile, vtt: relativeFile }).optional(),
  gif: relativeFile.optional(),
});

/** What a film manifest contributes to a video, as paths relative to the source root. */
export interface ScreencastFilm {
  /** Source-root-relative path of the manifest itself. */
  readonly manifest: string;
  readonly manifestPath: string;
  readonly sha256: string;
  /** Every encoding, in the manifest's order of preference. */
  readonly sources: readonly string[];
  /**
   * The `<source type>` the manifest gives each encoding, by its source-root-relative path. The video
   * step keeps it when the file's own track list agrees and writes the file's type when it does not.
   */
  readonly types: Readonly<Record<string, string>>;
  /** The manifest says the encodings carry an audio track. */
  readonly audio?: boolean;
  readonly poster: string;
  readonly chapters?: string;
  /** Language of the film; it names the chapters track. */
  readonly lang?: string;
}

function manifestError(message: string, remediation: string, file?: string): AgenticReportError {
  return new AgenticReportError({
    level: 'error',
    code: 'INVALID_VIDEO_MANIFEST',
    message,
    remediation,
    ...(file === undefined ? {} : { source: { file } }),
  });
}

async function statOrUndefined(
  file: string,
): Promise<Awaited<ReturnType<typeof stat>> | undefined> {
  try {
    return await stat(file);
  } catch {
    return undefined;
  }
}

/** Finds the manifest `from` names: the file itself, or the single `*.web.json` in a directory. */
async function locateManifest(
  reference: string,
  sourceRoot: string,
): Promise<{ readonly absolute: string; readonly relative: string }> {
  const target = await resolveLocalPath(sourceRoot, reference, 'ASSET_OUTSIDE_SOURCE');
  const root = await realpath(sourceRoot);
  const found = await statOrUndefined(target);
  if (found === undefined) {
    throw manifestError(
      `from names nothing: ${reference}`,
      'Point from at the <film>.web.json that `agentic-screencast web` wrote, or at the directory that holds it.',
      target,
    );
  }
  let absolute = target;
  if (found.isDirectory()) {
    const manifests = (await readdir(target, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(SCREENCAST_MANIFEST_SUFFIX))
      .map((entry) => entry.name)
      .sort();
    if (manifests.length !== 1) {
      throw manifestError(
        manifests.length === 0
          ? `The directory ${reference} holds no ${SCREENCAST_MANIFEST_SUFFIX} film manifest.`
          : `The directory ${reference} holds ${manifests.length} film manifests (${manifests.join(', ')}); from cannot choose.`,
        manifests.length === 0
          ? 'Run `agentic-screencast web` into this directory, or point from at the manifest file.'
          : `Name the film itself: from="${path.posix.join(reference, manifests[0] ?? '')}".`,
        target,
      );
    }
    absolute = path.join(target, manifests[0] ?? '');
  } else if (!target.endsWith('.json')) {
    throw manifestError(
      `from must name a ${SCREENCAST_MANIFEST_SUFFIX} film manifest or a directory with one: ${reference}`,
      'Use src="…" for a video file; from reads what `agentic-screencast web` wrote.',
      target,
    );
  }
  return { absolute, relative: path.relative(root, absolute).split(path.sep).join('/') };
}

/**
 * Resolves one path of the manifest against the manifest's directory. The result must stay under
 * the source root and name an existing file: a manifest copied without its encodings is refused here
 * with its own hint rather than as an unreadable asset.
 */
async function manifestEntry(
  entry: string,
  field: string,
  manifest: { readonly absolute: string; readonly relative: string },
  sourceRoot: string,
): Promise<string> {
  const joined = path.posix.normalize(
    path.posix.join(path.posix.dirname(manifest.relative), entry),
  );
  if (
    /^[a-z][a-z0-9+.-]*:/iu.test(entry) ||
    entry.startsWith('/') ||
    entry.includes('\\') ||
    joined === '..' ||
    joined.startsWith('../')
  ) {
    throw manifestError(
      `The film manifest ${manifest.relative} names ${field} "${entry}" outside the report source directory.`,
      'Keep the whole `agentic-screencast web` output under the report source directory; its paths are relative to the manifest.',
      manifest.absolute,
    );
  }
  const file = await resolveLocalPath(sourceRoot, joined, 'ASSET_OUTSIDE_SOURCE');
  if (!(await statOrUndefined(file))?.isFile()) {
    throw manifestError(
      `The film manifest ${manifest.relative} names ${field} "${entry}", and ${joined} is missing.`,
      'Copy the whole `agentic-screencast web` output directory, or rerun it, so every file the manifest names sits next to it.',
      manifest.absolute,
    );
  }
  return joined;
}

export async function readScreencastFilm(
  reference: string,
  sourceRoot: string,
): Promise<ScreencastFilm> {
  const manifest = await locateManifest(reference, sourceRoot);
  const bytes = await readFile(manifest.absolute);
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw manifestError(
      `The film manifest ${manifest.relative} is not JSON.`,
      'Rerun `agentic-screencast web`; the manifest is its machine-written output and is not edited by hand.',
      manifest.absolute,
    );
  }
  const version =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>).version
      : undefined;
  if (version !== SCREENCAST_MANIFEST_VERSION) {
    throw manifestError(
      `The film manifest ${manifest.relative} has version ${JSON.stringify(version)}; this agentic-report reads version ${SCREENCAST_MANIFEST_VERSION}.`,
      'Build the film with an agentic-screencast that writes manifest version 1, or update agentic-report.',
      manifest.absolute,
    );
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw manifestError(
      `The film manifest ${manifest.relative} is not a version-1 film manifest: ${issue?.path.join('.') || 'manifest'} — ${issue?.message ?? 'invalid'}.`,
      'Rerun `agentic-screencast web`; the manifest needs sources with src and a poster with jpg or webp.',
      manifest.absolute,
    );
  }
  const film = parsed.data;
  const sources: string[] = [];
  const types: Record<string, string> = {};
  for (const [index, source] of film.sources.entries()) {
    const entry = await manifestEntry(source.src, `sources[${index}]`, manifest, sourceRoot);
    sources.push(entry);
    if (source.type !== undefined) types[entry] = source.type;
  }
  // WebP is the lighter of the two frames; JPEG is there for a manifest without it.
  const posterEntry = film.poster.webp ?? film.poster.jpg ?? '';
  const poster = await manifestEntry(
    posterEntry,
    film.poster.webp === undefined ? 'poster.jpg' : 'poster.webp',
    manifest,
    sourceRoot,
  );
  const chapters =
    film.chapters === undefined
      ? undefined
      : await manifestEntry(film.chapters, 'chapters', manifest, sourceRoot);
  return {
    manifest: manifest.relative,
    manifestPath: manifest.absolute,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sources,
    types,
    ...(film.audio === undefined ? {} : { audio: film.audio }),
    poster,
    ...(chapters === undefined ? {} : { chapters }),
    ...(film.lang === undefined ? {} : { lang: film.lang }),
  };
}
