import { lstat, open, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { GenerateSitemapOptions, GenerateSitemapResult } from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';

const SITEMAP_FILE = 'sitemap.xml';
const ROBOTS_FILE = 'robots.txt';

interface IndexedPage {
  readonly file: string;
  readonly url: string;
}

/**
 * Индекс опубликованного дерева для поисковиков. Единственный вход — canonical, который компилятор
 * сам записал в свои страницы: второго формата авторинга нет, а чужой HTML не разбирается, только
 * перечисляется как пропущенный.
 */
export async function generateSitemap(
  options: GenerateSitemapOptions,
): Promise<GenerateSitemapResult> {
  const root = await requireDirectory(options);
  const candidates = (await listFiles(root)).filter((file) => file.endsWith('.html'));
  const pages: IndexedPage[] = [];
  const skipped: string[] = [];
  const withoutUrl: string[] = [];
  for (const file of candidates) {
    const head = await readHead(path.join(root, ...file.split('/')));
    if (!isPackagePage(head)) {
      skipped.push(file);
      continue;
    }
    const canonical = canonicalHref(head);
    if (canonical === undefined) withoutUrl.push(file);
    else pages.push({ file, url: canonical });
  }
  if (withoutUrl.length > 0)
    throw new AgenticReportError({
      level: 'error',
      code: 'SITEMAP_PAGE_WITHOUT_URL',
      message: `Pages built by agentic-report have no public URL: ${withoutUrl.join(', ')}`,
      remediation:
        'Rebuild each page with url in its manifest or with --url before indexing the tree.',
      details: { files: withoutUrl },
    });
  if (pages.length === 0)
    throw new AgenticReportError({
      level: 'error',
      code: 'SITEMAP_NO_PAGES',
      message: `No page built by agentic-report was found under ${root}.`,
      remediation:
        'Point sitemap at the root of a published tree of pages built with a public URL.',
      details: { skipped },
    });

  const origin = requireSingleOrigin(pages);
  for (const page of pages) assertPathMatches(page, origin);
  const urls = [...new Set(pages.map((page) => page.url))].sort();

  const sitemapPath = path.join(root, SITEMAP_FILE);
  const robotsPath = path.join(root, ROBOTS_FILE);
  for (const target of [sitemapPath, robotsPath]) await assertAbsent(target);
  const sitemap = sitemapXml(urls);
  const robots = robotsTxt(`${origin}/${SITEMAP_FILE}`);
  await writeExclusive(sitemapPath, sitemap);
  try {
    await writeExclusive(robotsPath, robots);
  } catch (error) {
    await rm(sitemapPath, { force: true });
    throw error;
  }
  return { directory: root, sitemap: sitemapPath, robots: robotsPath, urls, skipped };
}

async function requireDirectory(options: GenerateSitemapOptions): Promise<string> {
  const value: unknown = options;
  const directory =
    typeof value === 'object' && value !== null && 'directory' in value
      ? (value as { readonly directory: unknown }).directory
      : undefined;
  if (typeof directory !== 'string' || directory.trim() === '' || directory.includes('\0'))
    throw directoryError('Sitemap options must contain a directory path.');
  const root = path.resolve(directory);
  const info = await stat(root).catch(() => undefined);
  if (info === undefined || !info.isDirectory())
    throw directoryError(`Sitemap input is not a directory: ${root}`);
  return root;
}

function directoryError(message: string): AgenticReportError {
  return new AgenticReportError({
    level: 'error',
    code: 'SITEMAP_DIRECTORY_INVALID',
    message,
    remediation: 'Pass the root directory of the published static tree.',
  });
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile()))
      throw new AgenticReportError({
        level: 'error',
        code: 'SITEMAP_SPECIAL_FILE',
        message: `The published tree contains a symbolic link or special file: ${relative}`,
        remediation: 'Index a tree of ordinary files and directories.',
        details: { file: relative },
      });
    if (entry.isDirectory()) files.push(...(await listFiles(root, absolute)));
    else files.push(relative);
  }
  return files;
}

/** Только голова: по ней страница узнаётся и из неё берётся адрес; тело может весить мегабайты. */
async function readHead(file: string): Promise<string> {
  const handle = await open(file, 'r');
  try {
    const chunks: Buffer[] = [];
    let total = 0;
    const buffer = Buffer.alloc(64 * 1024);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
      total += bytesRead;
      const text = Buffer.concat(chunks, total).toString('utf8');
      const end = text.indexOf('</head>');
      if (end >= 0) return text.slice(0, end);
    }
    return Buffer.concat(chunks, total).toString('utf8');
  } finally {
    await handle.close();
  }
}

function isPackagePage(head: string): boolean {
  return head.includes('<meta name="generator" content="agentic-report"/>');
}

function canonicalHref(head: string): string | undefined {
  const match = /<link rel="canonical" href="([^"]*)"\/>/u.exec(head);
  return match?.[1] === undefined ? undefined : unescapeAttribute(match[1]);
}

/** React экранирует значение атрибута; адрес сравнивается и записывается уже в исходном виде. */
function unescapeAttribute(value: string): string {
  return value.replace(/&(amp|quot|#x27|#39|lt|gt);/gu, (_entity, name: string) => {
    switch (name) {
      case 'amp':
        return '&';
      case 'quot':
        return '"';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      default:
        return "'";
    }
  });
}

function requireSingleOrigin(pages: readonly IndexedPage[]): string {
  const origins = [...new Set(pages.map((page) => new URL(page.url).origin))].sort();
  const [origin] = origins;
  if (origin === undefined || origins.length > 1)
    throw new AgenticReportError({
      level: 'error',
      code: 'SITEMAP_ORIGIN_MISMATCH',
      message: `Pages in one tree declare different origins: ${origins.join(', ')}`,
      remediation: 'Index each origin from its own published tree and give every page that origin.',
      details: { origins },
    });
  return origin;
}

/**
 * Корень дерева — корень origin: адрес страницы обязан совпасть с её местом в дереве, иначе в индекс
 * попал бы адрес, по которому эта страница не лежит.
 */
function assertPathMatches(page: IndexedPage, origin: string): void {
  const directoryIndex = page.file === 'index.html' || page.file.endsWith('/index.html');
  const expectedPath = `/${directoryIndex ? page.file.slice(0, -'index.html'.length) : page.file}`;
  const expected = `${origin}${encodeURI(expectedPath)}`;
  const actual = new URL(page.url);
  if (`${actual.origin}${actual.pathname}` !== expected)
    throw new AgenticReportError({
      level: 'error',
      code: 'SITEMAP_PATH_MISMATCH',
      message: `${page.file} declares ${page.url}, but the tree serves it at ${expected}.`,
      remediation:
        'Build the page with the URL of its location in the published tree, with a trailing / for a directory index.',
      details: { file: page.file, declared: page.url, expected },
    });
}

async function assertAbsent(target: string): Promise<void> {
  const existing = await lstat(target).catch(() => undefined);
  if (existing !== undefined)
    throw new AgenticReportError({
      level: 'error',
      code: 'SITEMAP_TARGET_EXISTS',
      message: `${path.basename(target)} already exists in the published tree: ${target}`,
      remediation: 'Remove the existing file deliberately or index a freshly published tree.',
      details: { target },
    });
}

async function writeExclusive(target: string, contents: string): Promise<void> {
  await writeFile(target, contents, { encoding: 'utf8', flag: 'wx' });
}

function sitemapXml(urls: readonly string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');
}

function robotsTxt(sitemapUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
