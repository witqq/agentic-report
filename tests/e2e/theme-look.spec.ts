import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { BUILT_IN_THEME_NAMES } from '../../src/authoring/themes.js';
import { expect, test } from './fixtures.js';
import { addBuiltInThemes, BUILT_IN_THEME_ATTRIBUTES } from './themes.js';

const siteRoot = path.resolve('test-results/e2e-site');
const routes = (
  JSON.parse(await readFile(path.resolve('website/routes.json'), 'utf8')) as {
    readonly routes: readonly {
      readonly id: string;
      readonly href: string;
      readonly kind: string;
    }[];
  }
).routes.filter((route) => route.kind === 'page');
const routeUrl = (href: string): string => pathToFileURL(path.join(siteRoot, href)).href;

/**
 * Шрифт, которым браузер действительно набрал текст узла, — по данным движка отрисовки. Замер идёт
 * на отдельной вкладке: инструменты разработчика, читая стили страницы с `file://`, пишут в консоль
 * свою ошибку доступа, и она не должна считаться ошибкой артефакта.
 */
async function renderedFamily(page: Page, selector: string): Promise<string> {
  const probe = await page.context().newPage();
  await probe.goto(page.url());
  const language = await page.evaluate(() => document.documentElement.lang);
  if ((await probe.locator('[data-language-select]').count()) > 0)
    await probe
      .locator('[data-language-select]')
      .selectOption(language.startsWith('ru') ? 'ru' : 'en');
  await probe.evaluate(() => document.fonts.ready);
  const session = await probe.context().newCDPSession(probe);
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  const { root } = await session.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  if (nodeId === 0) throw new Error(`Missing ${selector}`);
  const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
  await session.detach();
  await probe.close();
  const main = [...fonts].sort((left, right) => right.glyphCount - left.glyphCount)[0];
  return main?.familyName ?? '';
}

test('pages are set in the embedded families, not in whatever the reader has installed', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const cases = [
    { href: 'examples/document/index.html', heading: 'Playfair', body: 'Literata' },
    {
      href: 'examples/terminal-portfolio/index.html',
      heading: 'Martian Mono',
      body: 'JetBrains Mono',
    },
    { href: 'index.html', heading: 'Literata', body: 'Onest' },
    { href: 'examples/cinematic-story/index.html', heading: 'Cormorant Garamond', body: 'Jost' },
  ] as const;
  for (const item of cases) {
    for (const language of ['en', 'ru'] as const) {
      await page.goto(routeUrl(item.href));
      await page.locator('[data-language-select]').selectOption(language);
      await page.evaluate(() => document.fonts.ready);
      // Вариативный шрифт называется по своему начертанию («Geologica Thin Roman»): важна гарнитура.
      expect(await renderedFamily(page, 'main h1'), `${item.href}:${language}:h1`).toMatch(
        new RegExp(`^${item.heading}`, 'u'),
      );
      expect(await renderedFamily(page, 'main p'), `${item.href}:${language}:p`).toMatch(
        new RegExp(`^${item.body}`, 'u'),
      );
    }
  }
});

test('Russian headings keep their words apart at desktop and phone widths', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  test.setTimeout(5 * 60_000);
  const collapsed: string[] = [];
  for (const width of [1440, 400]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(routeUrl(route.href));
      if ((await page.locator('[data-language-select] option[value="ru"]').count()) === 0) continue;
      await page.locator('[data-language-select]').selectOption('ru');
      await page.evaluate(() => document.fonts.ready);
      const found = await page.evaluate(() => {
        const out: string[] = [];
        for (const heading of document.querySelectorAll<HTMLElement>(
          'main :is(h1, h2, h3, .semantic-section-title)',
        )) {
          if (heading.getClientRects().length === 0) continue;
          const size = Number.parseFloat(getComputedStyle(heading).fontSize);
          const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            const text = node.textContent ?? '';
            for (let index = 1; index < text.length - 1; index += 1) {
              if (text[index] !== ' ') continue;
              const range = document.createRange();
              range.setStart(node, index);
              range.setEnd(node, index + 1);
              const space = range.getBoundingClientRect();
              range.setStart(node, index + 1);
              range.setEnd(node, index + 2);
              const next = range.getBoundingClientRect();
              // Пробел в конце строки не виден: слова стоят на разных строках.
              if (space.width === 0 || Math.abs(next.top - space.top) > 1) continue;
              if (space.width < size * 0.2) {
                out.push(
                  `${text.slice(Math.max(0, index - 8), index + 8)}: ${(space.width / size).toFixed(2)}em`,
                );
              }
            }
          }
        }
        return out;
      });
      collapsed.push(...found.map((entry) => `${route.id}:${width}: ${entry}`));
    }
  }
  expect(collapsed).toEqual([]);
});

interface Stop {
  readonly color: readonly [number, number, number, number];
  readonly position: number | undefined;
}

/** Хроматичность цвета: C в OKLCH. Нейтральный серый даёт почти ноль. */
function oklchChroma([red, green, blue]: readonly [number, number, number, number]): number {
  const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [linear(red), linear(green), linear(blue)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return Math.hypot(a, bb);
}

/** Радиальные градиенты вычисленного `background-image` с их точками цвета. */
function radialGradients(image: string): readonly Stop[][] {
  const gradients: Stop[][] = [];
  let index = image.indexOf('radial-gradient(');
  while (index >= 0) {
    let depth = 0;
    let end = index;
    for (; end < image.length; end += 1) {
      if (image[end] === '(') depth += 1;
      if (image[end] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = image.slice(index + 'radial-gradient('.length, end);
    const parts: string[] = [];
    let current = '';
    depth = 0;
    for (const character of body) {
      if (character === '(') depth += 1;
      if (character === ')') depth -= 1;
      if (character === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
      } else current += character;
    }
    parts.push(current.trim());
    const stops = parts
      .map((part): Stop | undefined => {
        const colour = /(rgba?\([^)]*\)|color\(srgb[^)]*\))/u.exec(part)?.[1];
        if (colour === undefined) return undefined;
        const numbers = colour.match(/[\d.]+/gu)?.map(Number) ?? [];
        const scale = colour.startsWith('color(') ? 255 : 1;
        const rgba: [number, number, number, number] = [
          (numbers[0] ?? 0) * scale,
          (numbers[1] ?? 0) * scale,
          (numbers[2] ?? 0) * scale,
          numbers[3] ?? 1,
        ];
        const position = /(-?[\d.]+)px\s*$/u.exec(part.replace(colour, '').trim())?.[1];
        return { color: rgba, position: position === undefined ? undefined : Number(position) };
      })
      .filter((stop): stop is Stop => stop !== undefined);
    gradients.push(stops);
    index = image.indexOf('radial-gradient(', end);
  }
  return gradients;
}

test('no built-in theme draws a blurred or coloured blob behind the page or its sections', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const root = path.resolve('test-results/e2e-theme-look');
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, 'surfaces'), { recursive: true });
  // Каждая поверхность секции, включая `blueprint`: пятно, нарисованное пропущенной поверхностью, иначе
  // прошло бы мимо проверки.
  const sections = ['plain', 'tint', 'grain', 'grid', 'blueprint']
    .flatMap((surface) =>
      ['plain', 'soft', 'accent', 'contrast'].map(
        (tone) =>
          `::::::section{title="${surface} ${tone}" id="${surface}-${tone}" surface="${surface}" tone="${tone}"}\nText.\n::::::\n`,
      ),
    )
    .join('\n');
  await writeFile(
    path.join(root, 'surfaces', 'report.md'),
    `---\ntitle: Surfaces\n---\n\n# Surfaces\n\n${sections}`,
  );
  const output = path.join(root, 'surfaces.html');
  await buildReport({ input: path.join(root, 'surfaces'), output });
  await page.goto(pathToFileURL(output).href);
  await addBuiltInThemes(page);

  const defects: string[] = [];
  for (const theme of BUILT_IN_THEME_ATTRIBUTES) {
    for (const scheme of ['light', 'dark'] as const) {
      const layers = await page.evaluate(
        ({ attributes, value }) => {
          for (const [name, attribute] of Object.entries(attributes))
            document.documentElement.setAttribute(name, attribute);
          document.documentElement.dataset.scheme = value;
          const out: { id: string; image: string; filter: string }[] = [
            {
              id: 'body',
              image: getComputedStyle(document.body).backgroundImage,
              filter: getComputedStyle(document.body).filter,
            },
          ];
          for (const section of document.querySelectorAll<HTMLElement>('.semantic-section')) {
            const before = getComputedStyle(section, '::before');
            out.push({ id: section.id, image: before.backgroundImage, filter: before.filter });
          }
          return out;
        },
        { attributes: theme.attributes, value: scheme },
      );
      for (const layer of layers) {
        const id = `${theme.name}/${scheme}/${layer.id}`;
        if (layer.filter !== 'none' && layer.filter.includes('blur')) defects.push(`${id}: blur`);
        for (const stops of radialGradients(layer.image)) {
          const opaque = stops.filter((stop) => stop.color[3] > 0);
          const last = opaque.at(-1);
          if (last === undefined) continue;
          const fine = last.position !== undefined && last.position <= 2;
          if (!fine || opaque.some((stop) => oklchChroma(stop.color) > 0.03)) {
            defects.push(`${id}: radial stop ${String(last.position)}px`);
          }
        }
      }
    }
  }
  expect(BUILT_IN_THEME_ATTRIBUTES.map((theme) => theme.name)).toEqual([...BUILT_IN_THEME_NAMES]);
  expect(defects).toEqual([]);
});

test('an author font with the heading role sets headings and section titles, not body text', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const root = path.resolve('test-results/e2e-theme-look/heading-font');
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  await copyFile(
    path.resolve('src/fonts/geologica/geologica-latin-wght-normal.woff2'),
    path.join(root, 'head.woff2'),
  );
  await writeFile(
    path.join(root, 'report.md'),
    [
      '---',
      'title: Heading font',
      'theme: blueprint',
      '---',
      '',
      '# Heading font',
      '',
      '::font{src="head.woff2" family="Author Head" role="heading"}',
      '',
      'Body paragraph.',
      '',
      '::::::section{title="Section title" id="one"}',
      'Section text.',
      '::::::',
      '',
      '::::::section{title="Second title" id="two"}',
      'More text.',
      '::::::',
      '',
    ].join('\n'),
  );
  const output = path.join(root, '..', 'heading-font.html');
  await buildReport({ input: root, output });
  await page.goto(pathToFileURL(output).href);
  await page.evaluate(() => document.fonts.ready);
  const families = await page.evaluate(() => ({
    h1: getComputedStyle(document.querySelector('main h1') as Element).fontFamily,
    title: getComputedStyle(document.querySelector('.semantic-section-title') as Element)
      .fontFamily,
    body: getComputedStyle(document.querySelector('main p') as Element).fontFamily,
  }));
  expect(families.h1).toMatch(/^"Author Head"/u);
  expect(families.title).toMatch(/^"Author Head"/u);
  expect(families.body).toContain('Fira Sans');
  expect(families.body).not.toContain('Author Head');
  expect(await renderedFamily(page, 'main h1')).toMatch(/^Geologica/u);
});
