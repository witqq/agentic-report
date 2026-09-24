import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

import type { BuildReportOptions } from '../../src/contracts.js';
import { buildReport } from '../../src/core/compiler.js';
import { inspectReport, validateReport } from '../../src/core/analyze-report.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

const CRAWLER_LIMIT = 2_097_152;

/** Маленький настоящий PNG: превью должно быть картинкой, а не байтами с нужным расширением. */
function png(): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const pixels = Buffer.from([0, 255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0, 0]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function source(files: Readonly<Record<string, string | Buffer>>): Promise<string> {
  const workspace = await createTestWorkspace('public-page');
  workspaces.push(workspace);
  const root = path.join(workspace, 'source');
  await mkdir(root);
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(path.join(root, name), contents);
  }
  return root;
}

function frontmatter(fields: Readonly<Record<string, string>>, body = '# Public page\n\nHello.\n') {
  return `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')}\n---\n\n${body}`;
}

/** Метаданные головы страницы ровно в том виде, в каком их прочтёт краулер: из записанного файла. */
function publicHead(html: string): string[] {
  const head = html.slice(0, html.indexOf('</head>'));
  return [
    ...head.matchAll(
      /<(?:link rel="canonical"[^>]*|meta (?:property|name)="(?:og:|twitter:)[^"]*"[^>]*)>/gu,
    ),
  ].map((match) => match[0]);
}

async function build(root: string, options: Partial<BuildReportOptions> = {}) {
  const output = path.join(path.dirname(root), options.format === 'directory' ? 'out' : 'out.html');
  const result = await buildReport({ input: root, output, ...options });
  return { result, html: await readFile(result.outputPath, 'utf8'), output };
}

describe('public page metadata', () => {
  it('publishes canonical, locale and absolute image metadata for a bilingual directory page', async () => {
    const root = await source({
      'report.md': frontmatter({
        title: 'Public page',
        description: 'A page for search engines.',
        language: 'en',
        localizations: '\n  ru: report.ru.md',
        url: 'https://example.com/docs/',
        image: 'preview.png',
      }),
      'report.ru.md': frontmatter(
        { title: 'Публичная страница', language: 'ru' },
        '# Публичная\n\nПривет.\n',
      ),
      'preview.png': png(),
    });

    const { result, html, output } = await build(root, { format: 'directory' });

    const image = html.match(/og:image" content="https:\/\/example\.com\/docs\/(assets\/[^"]+)"/u);
    expect(image?.[1]).toMatch(/^assets\/preview\.[0-9a-f]{12}\.png$/u);
    // Адрес картинки обязан указывать на файл, который сборка действительно положила рядом.
    expect(await readFile(path.join(output, image?.[1] ?? ''))).toEqual(png());
    expect(publicHead(html)).toEqual([
      '<link rel="canonical" href="https://example.com/docs/"/>',
      '<meta property="og:type" content="website"/>',
      '<meta property="og:url" content="https://example.com/docs/"/>',
      '<meta property="og:title" content="Public page"/>',
      '<meta property="og:description" content="A page for search engines."/>',
      '<meta property="og:locale" content="en_US"/>',
      '<meta property="og:locale:alternate" content="ru_RU"/>',
      `<meta property="og:image" content="https://example.com/docs/${image?.[1] ?? ''}"/>`,
      '<meta name="twitter:card" content="summary_large_image"/>',
      `<meta name="twitter:image" content="https://example.com/docs/${image?.[1] ?? ''}"/>`,
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('omits the image from a single-file page and says why, keeping the rest of the metadata', async () => {
    const root = await source({
      'report.md': frontmatter({
        title: 'Public page',
        language: 'en',
        url: 'https://example.com/',
        image: 'preview.png',
      }),
      'preview.png': png(),
    });

    const { result, html } = await build(root);

    expect(publicHead(html)).toEqual([
      '<link rel="canonical" href="https://example.com/"/>',
      '<meta property="og:type" content="website"/>',
      '<meta property="og:url" content="https://example.com/"/>',
      '<meta property="og:title" content="Public page"/>',
      '<meta property="og:description" content="Public page"/>',
      '<meta property="og:locale" content="en_US"/>',
      '<meta name="twitter:card" content="summary"/>',
    ]);
    expect(result.warnings.map((warning) => warning.code)).toEqual(['SOCIAL_IMAGE_NOT_PUBLISHED']);
  });

  it('writes no public metadata without a URL and warns that a declared image cannot be published', async () => {
    const root = await source({
      'report.md': frontmatter({ title: 'Local page', language: 'en', image: 'preview.png' }),
      'preview.png': png(),
    });

    const { result, html, output } = await build(root, { format: 'directory' });

    expect(publicHead(html)).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).toEqual(['SOCIAL_IMAGE_NOT_PUBLISHED']);
    // Неопубликованное превью не кладётся в вывод: оно никому не нужно без адреса.
    expect(
      (await readdir(path.join(output, 'assets'))).some((name) => name.startsWith('preview.')),
    ).toBe(false);
  });

  it('maps two-letter region subtags mechanically and leaves numeric-region, region-less unknown and undetermined tags without og:locale', async () => {
    const localeOf = async (language: string): Promise<string[]> => {
      const root = await source({
        'report.md': frontmatter({ title: 'Page', language, url: 'https://example.com/' }),
      });
      const { html } = await build(root);
      return publicHead(html).filter((tag) => tag.includes('og:locale'));
    };

    expect(await localeOf('pt-BR')).toEqual(['<meta property="og:locale" content="pt_BR"/>']);
    expect(await localeOf('ru')).toEqual(['<meta property="og:locale" content="ru_RU"/>']);
    expect(await localeOf('de')).toEqual([]);
    expect(await localeOf('es-419')).toEqual([]);
    expect(await localeOf('und')).toEqual([]);
  });

  it('lets the build option URL override the manifest URL', async () => {
    const root = await source({
      'report.md': frontmatter({ title: 'Page', language: 'en', url: 'https://example.com/old/' }),
    });

    const { html } = await build(root, { url: 'https://example.org/new/' });

    expect(publicHead(html)[0]).toBe('<link rel="canonical" href="https://example.org/new/"/>');
  });

  it.each([
    ['a relative path', 'docs/page/'],
    ['an executable scheme', 'javascript:alert(1)'],
    ['a non-http scheme', 'ftp://example.com/'],
    ['credentials', 'https://user:secret@example.com/'],
    ['a fragment', 'https://example.com/#top'],
  ])('refuses a manifest URL with %s at its authored field', async (_label, url) => {
    const root = await source({
      'report.md': frontmatter({ title: 'Page', language: 'en', url: JSON.stringify(url) }),
    });

    await expect(build(root)).rejects.toMatchObject({
      diagnostic: {
        code: 'INVALID_MANIFEST',
        source: { file: path.join(root, 'report.md'), line: 4 },
      },
    });
  });

  it('refuses an invalid URL option before reading the source', async () => {
    const root = await source({ 'report.md': frontmatter({ title: 'Page', language: 'en' }) });

    await expect(build(root, { url: 'https://example.com/#top' })).rejects.toMatchObject({
      diagnostic: { code: 'PUBLIC_URL_INVALID' },
    });
    await expect(validateReport({ input: root, url: '/relative' })).rejects.toMatchObject({
      diagnostic: { code: 'PUBLIC_URL_INVALID' },
    });
  });

  it.each([
    ['a vector image', 'preview.svg', 'INVALID_SOCIAL_IMAGE'],
    ['a missing file', 'missing.png', 'INVALID_SOCIAL_IMAGE'],
    ['a path outside the source', '../preview.png', 'INVALID_MANIFEST'],
  ])('refuses %s as the social image at its authored field', async (_label, image, code) => {
    const root = await source({
      'report.md': frontmatter({ title: 'Page', language: 'en', image }),
      'preview.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    });

    // Автор правит строку манифеста, поэтому диагностика указывает на неё, а не на файл картинки.
    await expect(validateReport({ input: root })).rejects.toMatchObject({
      diagnostic: { code, source: { file: path.join(root, 'report.md'), line: 4 } },
    });
  });

  it.each([
    ['url', 'https://example.com/ru/'],
    ['image', 'preview.png'],
  ])('keeps %s owned by the primary entry', async (field, value) => {
    const root = await source({
      'report.md': frontmatter({
        title: 'Page',
        language: 'en',
        localizations: '\n  ru: report.ru.md',
      }),
      'report.ru.md': frontmatter({ title: 'Страница', language: 'ru', [field]: value }),
      'preview.png': png(),
    });

    await expect(build(root)).rejects.toMatchObject({
      diagnostic: { code: 'INVALID_LOCALIZATION' },
    });
  });

  it('reports the social image in the inspected source inventory', async () => {
    const root = await source({
      'report.md': frontmatter({ title: 'Page', language: 'en', image: 'preview.png' }),
      'preview.png': png(),
    });

    const inspected = await inspectReport({ input: root, format: 'directory' });

    expect(inspected.sourceFiles).toEqual(['preview.png', 'report.md']);
  });
});

describe('crawler byte limit', () => {
  /**
   * Размер страницы подгоняется измерением, а не заложенной константой разметки: иначе любое
   * изменение оболочки сдвинуло бы границу, и пара «ровно предел / на байт больше» проверяла бы
   * что-то другое.
   */
  async function pageOfExactly(bytes: number, url: string | undefined) {
    const fields = {
      title: 'Large',
      language: 'en',
      ...(url === undefined ? {} : { url }),
    };
    let padding = bytes - 20_000;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const root = await source({
        'report.md': frontmatter(fields, `# Large\n\n${'x'.repeat(padding)}\n`),
      });
      const { result } = await build(root);
      if (result.bytes === bytes) return result;
      padding += bytes - result.bytes;
    }
    throw new Error(`Could not size a page to exactly ${bytes} bytes.`);
  }

  // Шесть сборок страниц по два мегабайта — около пяти секунд работы; бюджет задан от замера с
  // запасом на параллельную нагрузку, а не от неявных пяти секунд Vitest.
  it(
    'warns only above the limit and only for a page with a public URL',
    { timeout: 30_000 },
    async () => {
      const atLimit = await pageOfExactly(CRAWLER_LIMIT, 'https://example.com/');
      const overLimit = await pageOfExactly(CRAWLER_LIMIT + 1, 'https://example.com/');
      const localOverLimit = await pageOfExactly(CRAWLER_LIMIT + 1, undefined);

      expect(atLimit.warnings.map((warning) => warning.code)).toEqual([]);
      expect(overLimit.warnings).toMatchObject([
        {
          code: 'PUBLIC_PAGE_OVER_CRAWLER_LIMIT',
          details: { htmlBytes: CRAWLER_LIMIT + 1, limit: CRAWLER_LIMIT },
        },
      ]);
      expect(localOverLimit.warnings.map((warning) => warning.code)).toEqual([]);
    },
  );
});
