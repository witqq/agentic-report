import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { BUILT_IN_THEME_NAMES } from '../../src/authoring/themes.js';
import { expect, test } from './fixtures.js';

/**
 * Система интерфейса: каждый интерактивный и подписывающий элемент — примитив `ui-*`, и один примитив
 * одного вида, размера и контекста выглядит одинаково на всей странице в каждой встроенной теме и
 * схеме. Примеры собираются с переключателем тем, поэтому страница несёт гарнитуры всех тем и тест
 * перебирает их так же, как читатель.
 */
const base = path.resolve('test-results/e2e-ui-system');
let root = base;
const PAGES = [
  'interactive-catalog',
  'response-workspace',
  'review-workspace',
  'visualization-catalog',
  'layout-document',
  'executive-brief',
] as const;
/** Страницы для проверки гарнитуры заголовков: здесь же ленты времени с длинными русскими словами. */
const HEADING_PAGES = [
  'layout-document',
  'executive-brief',
  'interactive-catalog',
  'visualization-catalog',
  'launch-readiness',
  'vendor-decision',
  'terminal-portfolio',
] as const;
type PageName = (typeof PAGES)[number] | (typeof HEADING_PAGES)[number];

const PRIMITIVES = [
  'ui-button',
  'ui-field',
  'ui-tab',
  'ui-tabs',
  'ui-row',
  'ui-switch',
  'ui-choice',
  'ui-range',
  'ui-label',
  'ui-meta',
  'ui-chip',
  'ui-title',
  'ui-item-title',
] as const;

// Каждый проект собирает свои копии: воркеры двух проектов не удаляют страницы друг у друга.
test.beforeAll(async ({ browserName }, info) => {
  root = path.join(base, `${info.project.name}-${browserName}`);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  for (const name of new Set<PageName>([...PAGES, ...HEADING_PAGES])) {
    const source = path.join(root, name);
    await cp(path.resolve('examples', name), source, { recursive: true });
    const entry = path.join(source, 'report.md');
    const text = await readFile(entry, 'utf8');
    await writeFile(entry, text.replace(/^---\n/u, '---\nthemeSwitcher: true\n'));
    await buildReport({ input: source, output: path.join(root, `${name}.html`) });
  }
});

const pageUrl = (name: PageName): string => pathToFileURL(path.join(root, `${name}.html`)).href;

async function switchTheme(page: Page, theme: string, scheme: 'light' | 'dark'): Promise<void> {
  await page.locator('[data-theme-select]').selectOption(theme);
  await page.evaluate((value) => {
    document.documentElement.dataset.scheme = value;
  }, scheme);
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Подпись примитива — то, что должно совпадать у всех его экземпляров одного вида, размера и
 * контекста: гарнитура, кегль, насыщенность, регистр, разрядка, высота шкалы, рамка и скругление.
 * Цвет в подпись не входит: он законно меняется с состоянием (выбран, нажат, текущий).
 */
async function signatureGroups(page: Page, inject = ''): Promise<Record<string, string[]>> {
  return page.evaluate(
    ({ primitives, css }) => {
      if (css !== '') {
        const style = document.createElement('style');
        style.dataset.plantedDeviation = '';
        style.textContent = css;
        document.head.append(style);
      }
      const contexts: readonly [string, string][] = [
        ['topbar', '.topbar'],
        ['nav-dialog', '.nav-dialog'],
        ['review-popover', '.review-popover'],
        ['review-panel', '.review-panel'],
        ['slides', '.slide-controls'],
        ['code', 'pre'],
        ['contrast', ".semantic-section[data-tone='contrast']"],
        ['blueprint', ".semantic-section[data-surface='blueprint']"],
      ];
      const contextOf = (element: Element): string => {
        for (let node = element.parentElement; node !== null; node = node.parentElement) {
          const match = contexts.find(([, selector]) => node.matches(selector));
          if (match !== undefined) return match[0];
        }
        return 'page';
      };
      const groups: Record<string, string[]> = {};
      for (const primitive of primitives) {
        for (const element of document.querySelectorAll<HTMLElement>(`.${primitive}`)) {
          if (element.getClientRects().length === 0) continue;
          if (element.matches(':disabled, [aria-disabled="true"]')) continue;
          const style = getComputedStyle(element);
          const control = !['ui-label', 'ui-meta', 'ui-chip', 'ui-title', 'ui-item-title'].includes(
            primitive,
          );
          const key = [
            primitive,
            // Многострочное поле выше однострочного по замыслу: это другой вид поля.
            element.tagName === 'TEXTAREA' ? 'multiline' : '',
            element.dataset.uiVariant ?? '',
            element.dataset.uiSize ?? '',
            element.hasAttribute('data-ui-icon-only') ? 'icon' : '',
            element.hasAttribute('data-ui-toolbar') ? 'toolbar' : '',
            contextOf(element),
          ].join('|');
          const signature = [
            style.fontFamily,
            style.fontSize,
            style.fontWeight,
            style.textTransform,
            style.letterSpacing,
            // Высота шкалы есть только у элементов управления; у подписей её нет.
            control ? style.minHeight : '',
            style.borderTopStyle,
            style.borderTopLeftRadius,
          ].join(' · ');
          const group = groups[key] ?? [];
          if (!group.includes(signature)) group.push(signature);
          groups[key] = group;
        }
      }
      document.querySelector('[data-planted-deviation]')?.remove();
      return groups;
    },
    { primitives: PRIMITIVES, css: inject },
  );
}

function inconsistent(groups: Record<string, string[]>): string[] {
  return Object.entries(groups)
    .filter(([, signatures]) => signatures.length > 1)
    .map(([key, signatures]) => `${key}: ${signatures.join(' ≠ ')}`);
}

test('one primitive of one kind, size and context looks the same in every theme and scheme', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  test.setTimeout(480_000);
  const defects: string[] = [];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of PAGES) {
      await page.goto(pageUrl(name));
      for (const theme of BUILT_IN_THEME_NAMES) {
        for (const scheme of ['light', 'dark'] as const) {
          await switchTheme(page, theme, scheme);
          for (const defect of inconsistent(await signatureGroups(page)))
            defects.push(`${name}/${theme}/${scheme}/${width}: ${defect}`);
        }
      }
    }
  }
  expect(defects).toEqual([]);

  // Проверка различает: одна кнопка, набранная своим кеглем, разводит подписи своей группы.
  await page.goto(pageUrl('interactive-catalog'));
  const planted = inconsistent(
    await signatureGroups(
      page,
      '.semantic-modal .ui-button[data-ui-variant="secondary"] { font-size: 13px; }',
    ),
  );
  expect(planted.some((defect) => defect.startsWith('ui-button||secondary|md'))).toBe(true);
});

test('control heights come from the theme scale and grow only under a finger', async ({
  page,
}, info) => {
  await page.goto(pageUrl('interactive-catalog'));
  const heights = await page.evaluate(() => {
    const probe = (value: string): number => {
      const element = document.createElement('div');
      element.style.height = value;
      document.body.append(element);
      const height = element.getBoundingClientRect().height;
      element.remove();
      return height;
    };
    const measured = (selector: string): number[] =>
      [...document.querySelectorAll<HTMLElement>(selector)]
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => Number.parseFloat(getComputedStyle(element).minHeight));
    return {
      coarse: matchMedia('(pointer: coarse)').matches,
      md: probe('var(--control-height-md)'),
      sm: probe('var(--control-height-sm)'),
      themeMd: probe('var(--control-md)'),
      buttonsMd: measured('.ui-button[data-ui-size="md"]:not([data-ui-toolbar])'),
      buttonsSm: measured('.ui-button[data-ui-size="sm"]'),
      fields: measured('input.ui-field, select.ui-field'),
      tabs: measured('.ui-tab'),
    };
  });
  expect(heights.md).toBe(heights.coarse ? 44 : heights.themeMd);
  if (heights.coarse) expect(heights.sm).toBe(44);
  for (const value of [...heights.buttonsMd, ...heights.fields, ...heights.tabs])
    expect(value).toBe(heights.md);
  for (const value of heights.buttonsSm) expect(value).toBe(heights.sm);
  expect(heights.buttonsMd.length + heights.fields.length + heights.tabs.length).toBeGreaterThan(5);
  // Под мышью ширина окна высоту не меняет: узкое окно — не палец.
  if (!heights.coarse && info.project.name === 'desktop-chromium') {
    await page.setViewportSize({ width: 390, height: 844 });
    const narrow = await page.evaluate(
      () =>
        document.querySelector<HTMLElement>('.ui-button[data-ui-size="md"]:not([data-ui-toolbar])')
          ?.offsetHeight,
    );
    expect(narrow).toBe(heights.md);
  }
});

test('every interactive element is a primitive, and hidden ones stay hidden', async ({ page }) => {
  for (const name of PAGES) {
    await page.goto(pageUrl(name));
    const found = await page.evaluate(() => {
      const bare: string[] = [];
      const primitive =
        '.ui-button, .ui-tab, .ui-row, .ui-switch, .ui-field, .ui-range, .ui-choice, .ui-tabs';
      for (const element of document.querySelectorAll(
        'button, input, select, textarea, summary, [role="tab"], [role="tablist"]',
      )) {
        if (element.matches(primitive) || element.closest('.ui-choice, label.ui-button')) continue;
        if (element.matches('[data-glossary-trigger], [data-review-highlight-marker]')) continue;
        bare.push(`${element.tagName.toLowerCase()}.${element.className}`);
      }
      const shown = [...document.querySelectorAll<HTMLElement>('[hidden]')]
        .filter((element) => getComputedStyle(element).display !== 'none')
        .map((element) => `${element.tagName.toLowerCase()}.${element.className}`);
      return { bare, shown };
    });
    expect(found.bare, name).toEqual([]);
    expect(found.shown, name).toEqual([]);
  }
});

test('a printed diagram shows the view the author chose, whichever the reader picked', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.goto(pageUrl('visualization-catalog'));
  const layouts = page.locator('.visualization-layouts').first();
  const switcher = layouts.locator('.visualization-layout-switch');
  const other = switcher.locator('[role="tab"][aria-selected="false"]').first();
  await other.click();
  await page.emulateMedia({ media: 'print' });
  const state = await layouts.evaluate((element) => ({
    switchShown: getComputedStyle(
      element.querySelector<HTMLElement>(':scope > .visualization-layout-switch') as HTMLElement,
    ).display,
    views: [...element.querySelectorAll<HTMLElement>(':scope > .visualization-layout-view')].map(
      (view) => ({
        default: view.hasAttribute('data-layout-default'),
        display: getComputedStyle(view).display,
      }),
    ),
  }));
  expect(state.switchShown).toBe('none');
  for (const view of state.views) expect(view.display === 'none').toBe(!view.default);
});

/** Относительная яркость и контраст по WCAG для цвета из `getComputedStyle`. */
const CONTRAST_HELPERS = `
  const channels = (value) => {
    const canvas = document.createElement('canvas').getContext('2d');
    canvas.fillStyle = value;
    canvas.fillRect(0, 0, 1, 1);
    return [...canvas.getImageData(0, 0, 1, 1).data];
  };
  const luminance = ([r, g, b]) => {
    const linear = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  };
  const contrast = (a, b) => {
    const [x, y] = [luminance(channels(a)), luminance(channels(b))];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
`;

test('the inverse band keeps focus, accent and links readable, and the skip link reads in every theme', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  test.setTimeout(120_000);
  await page.goto(pageUrl('interactive-catalog'));
  const defects: string[] = [];
  for (const theme of BUILT_IN_THEME_NAMES) {
    for (const scheme of ['light', 'dark'] as const) {
      await switchTheme(page, theme, scheme);
      const result = await page.evaluate(`(() => {
        ${CONTRAST_HELPERS}
        const out = [];
        const skip = getComputedStyle(document.querySelector('.skip-link'));
        if (contrast(skip.color, skip.backgroundColor) < 4.5) out.push('skip link');
        const band = document.querySelector(".semantic-section[data-tone='contrast']");
        if (band && document.documentElement.dataset.themeConsole !== 'on') {
          const style = getComputedStyle(band);
          const ground = style.backgroundColor;
          // Полоса инверсна: её фон — противоположная схема, а не фон страницы.
          const page = getComputedStyle(document.body).backgroundColor;
          if (contrast(ground, page) < 3) out.push('band is not inverse');
          const probe = (variable) => {
            const element = document.createElement('span');
            element.style.color = 'var(' + variable + ')';
            band.append(element);
            const value = getComputedStyle(element).color;
            element.remove();
            return value;
          };
          if (contrast(probe('--color-focus'), ground) < 3) out.push('focus ring in band');
          if (contrast(probe('--color-accent'), ground) < 3) out.push('accent in band');
          if (contrast(probe('--color-accent-strong'), ground) < 4.5) out.push('link in band');
          if (contrast(probe('--color-text-muted'), ground) < 4.5) out.push('caption in band');
          if (contrast(style.color, ground) < 4.5) out.push('text in band');
        }
        return out;
      })()`);
      for (const defect of result as string[]) defects.push(`${theme}/${scheme}: ${defect}`);
    }
  }
  expect(defects).toEqual([]);
});

/**
 * Разрывы слов и сдвиг вбок: во всём тексте гарнитуры заголовков — любое слово, в остальном тексте вне кода
 * — слово из одних букв. Текст гарнитуры заголовков находится по вычисленной гарнитуре, а не по тегам.
 */
async function layoutDefects(page: Page): Promise<string[]> {
  // Смена ширины и темы запускает переходы сетки: меряется устоявшаяся раскладка, а не её середина.
  // Переход начинается не сразу после смены окна: событие медиазапроса (оглавление встаёт боковой
  // колонкой) и наблюдатели размера срабатывают в следующем кадре, и под нагрузкой замер, снятый до этого
  // кадра, не видел ни одной анимации и мерил колонку, которую ещё сужает боковая панель. Поэтому ожидание
  // идёт кадрами: два кадра, затем конец анимаций, которые могут изменить геометрию, и снова, пока новых
  // нет. Анимация только прозрачности не меняет разрывы строк или границы колонок; её шестисекундное
  // мигание в terminal не должно задерживать проверку. Анимации по прокрутке идут по своей шкале и не
  // кончаются — их не ждём; восемь секунд — предохранитель от анимации, которая перезапускает себя.
  await page.evaluate(async () => {
    const frame = (): Promise<void> =>
      new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const onlyOpacity = (animation: Animation): boolean => {
      if (!(animation.effect instanceof KeyframeEffect)) return false;
      const keyframes = animation.effect.getKeyframes();
      return (
        keyframes.length > 0 &&
        keyframes.some((keyframe) => Object.hasOwn(keyframe, 'opacity')) &&
        keyframes.every((keyframe) =>
          Object.keys(keyframe).every((property) =>
            ['composite', 'computedOffset', 'easing', 'offset', 'opacity'].includes(property),
          ),
        )
      );
    };
    const deadline = performance.now() + 8000;
    for (;;) {
      await frame();
      await frame();
      const running = document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === 'running' &&
            animation.timeline instanceof DocumentTimeline &&
            animation.effect?.getComputedTiming().endTime !== Infinity &&
            !onlyOpacity(animation),
        );
      if (running.length === 0 || performance.now() > deadline) return;
      await Promise.race([
        Promise.all(running.map((animation) => animation.finished.catch(() => undefined))),
        new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - performance.now()))),
      ]);
    }
  });
  return page.evaluate(() => {
    const out: string[] = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push('page scrolls sideways');
    const probe = document.createElement('span');
    probe.style.fontFamily = 'var(--font-author-heading, var(--font-heading))';
    document.body.append(probe);
    const face = getComputedStyle(probe).fontFamily;
    probe.remove();
    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
      const texts = [...element.childNodes].filter(
        (child): child is Text => child instanceof Text && child.data.trim() !== '',
      );
      if (texts.length === 0 || element.getClientRects().length === 0) continue;
      const heading = getComputedStyle(element).fontFamily === face;
      if (!heading && element.closest('pre, code, kbd, samp, svg, .semantic-source-link')) continue;
      for (const node of texts) {
        // Короткое слово уже любой колонки: проверяются слова, которые могут не влезть в строку.
        const words = heading
          ? node.data.matchAll(/[^\s‐–—-]{5,}[‐–—-]?/gu)
          : node.data.matchAll(/\p{L}{9,}/gu);
        for (const word of words) {
          const range = document.createRange();
          range.setStart(node, word.index);
          range.setEnd(node, word.index + word[0].length);
          const lines = new Set(
            [...range.getClientRects()]
              .filter((rect) => rect.width > 0)
              .map((rect) => Math.round(rect.top)),
          );
          if (lines.size > 1) out.push(`"${word[0]}" breaks`);
        }
      }
      if (heading && element.scrollWidth > element.clientWidth + 1)
        out.push(`"${element.textContent?.trim().slice(0, 24) ?? ''}" is clipped`);
      // Заголовок не выходит за свою колонку и не наезжает на соседнюю, даже если страница вбок не едет.
      const parent = element.parentElement;
      if (heading && parent !== null && getComputedStyle(parent).overflowX === 'visible') {
        const style = getComputedStyle(parent);
        const edge =
          parent.getBoundingClientRect().right -
          Number.parseFloat(style.paddingRight) -
          Number.parseFloat(style.borderRightWidth);
        const right = element.getBoundingClientRect().right;
        if (right > edge + 2)
          out.push(
            `"${element.textContent?.trim().slice(0, 24) ?? ''}" leaves its column by ${Math.round(right - edge)}px`,
          );
      }
    }
    return out;
  });
}

test('layout check ignores opacity-only motion but waits for moving text', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.goto(pageUrl('layout-document'));
  expect(await layoutDefects(page)).toEqual([]);
  await page.evaluate(() => {
    const parent = document.createElement('div');
    parent.id = 'layout-motion-proof';
    parent.style.cssText = 'position:fixed;left:0;top:0;width:220px;overflow:visible';
    const heading = document.createElement('h2');
    heading.textContent = 'Proof';
    heading.style.cssText =
      'width:180px;margin:0;font-family:var(--font-author-heading,var(--font-heading));font-size:16px;white-space:nowrap';
    parent.append(heading);
    document.body.append(parent);
    heading.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 6000, fill: 'forwards' });
    heading.animate([{ transform: 'translateX(-70px)' }, { transform: 'translateX(80px)' }], {
      duration: 250,
      fill: 'forwards',
    });
  });
  const defects = await layoutDefects(page);
  const state = await page.locator('#layout-motion-proof h2').evaluate((heading) => {
    const animations = heading.getAnimations();
    const forProperty = (property: string): Animation | undefined =>
      animations.find(
        (animation) =>
          animation.effect instanceof KeyframeEffect &&
          animation.effect.getKeyframes().some((keyframe) => Object.hasOwn(keyframe, property)),
      );
    return {
      opacity: forProperty('opacity')?.playState,
      transform: forProperty('transform')?.playState,
    };
  });
  expect(
    defects.some((defect) => defect.includes('Proof') && defect.includes('leaves its column')),
  ).toBe(true);
  expect(state).toEqual({ opacity: 'running', transform: 'finished' });
});

test('no word breaks or sideways page in any theme, heading face or card text', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  test.setTimeout(900_000);
  const defects: string[] = [];
  for (const name of HEADING_PAGES) {
    await page.goto(pageUrl(name));
    for (const language of ['en', 'ru'] as const) {
      await page.locator('[data-language-select]').selectOption(language);
      for (const theme of BUILT_IN_THEME_NAMES) {
        // Узкие ширины — во всех темах; широкая — в темах с самыми широкими гарнитурами заголовков.
        const widths = ['noir', 'synthwave', 'terminal'].includes(theme)
          ? [304, 390, 1440]
          : [304, 390];
        for (const width of widths) {
          await page.setViewportSize({ width, height: 900 });
          await switchTheme(page, theme, theme === 'terminal' ? 'dark' : 'light');
          for (const defect of await layoutDefects(page))
            defects.push(`${name}/${language}/${theme}/${width}: ${defect}`);
        }
      }
    }
  }
  expect(defects).toEqual([]);
});

/** Свои темы на основе calm-paper с самой широкой встроенной гарнитурой заголовков, строчными и прописными. */
const WIDE_THEMES = [
  { name: 'wide-lower', typography: '' },
  { name: 'wide-caps', typography: '  typography:\n    displayCase: uppercase\n' },
] as const;

test('an own theme with the widest heading face is protected on every example', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  test.setTimeout(1_200_000);
  const examples = (await readdir(path.resolve('examples'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const defects: string[] = [];
  for (const theme of WIDE_THEMES) {
    for (const name of examples) {
      const source = path.join(root, 'wide-theme', theme.name, name);
      await cp(path.resolve('examples', name), source, { recursive: true });
      const file = path.join(source, 'report.md');
      const text = await readFile(file, 'utf8');
      // Тема своя: без ручной поправки кегля, гарнитура заголовков — Unbounded, самая широкая в наборе.
      await writeFile(
        file,
        text
          .replace(/^theme:.*\n(?: {2}.*\n)*/mu, '')
          .replace(
            /^---\n/u,
            `---\ntheme:\n  extends: calm-paper\n  name: ${theme.name}\n  description: The widest heading face on calm paper.\n  fonts:\n    heading: unbounded\n${theme.typography}`,
          ),
      );
      const output = path.join(root, 'wide-theme', theme.name, `${name}.html`);
      await buildReport({ input: source, output });
      await page.goto(pathToFileURL(output).href);
      const languages =
        (await page.locator('[data-language-select]').count()) > 0 ? ['en', 'ru'] : ['en'];
      for (const language of languages) {
        if (languages.length > 1)
          await page.locator('[data-language-select]').selectOption(language);
        // Телефоны, планшет, десктоп и вертикальный монитор: колонку сужают оглавление и первый экран.
        for (const [width, height] of [
          [304, 900],
          [390, 900],
          [1024, 900],
          [1440, 900],
          [1080, 1920],
        ] as const) {
          await page.setViewportSize({ width, height });
          await page.evaluate(() => document.fonts.ready);
          for (const defect of await layoutDefects(page))
            defects.push(`${theme.name}/${name}/${language}/${width}: ${defect}`);
        }
      }
    }
  }
  expect(defects).toEqual([]);
});

test('a heading font the author brings gets the widest letter width, not the theme one', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  const source = path.join(root, 'author-heading-font');
  await rm(source, { recursive: true, force: true });
  await mkdir(path.join(source, 'assets'), { recursive: true });
  // Шрифт автора — широкий файл Unbounded: пакет его не мерил и обязан взять наибольшую ширину буквы.
  await cp(
    path.resolve('src/fonts/unbounded/unbounded-cyrillic-wght-normal.woff2'),
    path.join(source, 'assets', 'wide.woff2'),
  );
  await writeFile(
    path.join(source, 'report.md'),
    [
      '---',
      'language: ru',
      'theme: calm-paper',
      '---',
      '',
      '::font{src="assets/wide.woff2" family="Wide Author" role="heading"}',
      '',
      '# Распределённость проверяется',
      '',
      ':::section{title="Интерфейсных решений" type="display"}',
      'Текст главы.',
      ':::',
      '',
    ].join('\n'),
  );
  const output = path.join(root, 'author-heading-font.html');
  await buildReport({ input: source, output });
  await page.goto(pathToFileURL(output).href);
  for (const width of [304, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    const advance = await page
      .locator('h1')
      .evaluate((heading) =>
        getComputedStyle(heading).getPropertyValue('--display-advance-author').trim(),
      );
    expect(advance, `${width}`).toBe('1');
    expect(await layoutDefects(page), `${width}`).toEqual([]);
  }
});

test('figures are numbered in a row wherever the layout puts them', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  const source = path.join(root, 'figure-numbers');
  await rm(source, { recursive: true, force: true });
  await cp(path.resolve('examples/terminal-portfolio'), source, { recursive: true });
  const chart = (title: string): string =>
    [
      `:::::chart{type="bar" title="${title}" description="A figure placed for numbering." x-label="Step" y-label="Count"}`,
      '::::series{label="Count"}',
      '::point{label="One" value="1"}',
      '::point{label="Two" value="2"}',
      '::::',
      ':::::',
      '',
    ].join('\n');
  const file = path.join(source, 'report.md');
  const text = await readFile(file, 'utf8');
  // Первый рисунок попадает в текстовую колонку первого экрана — контейнер по ширине, — второй идёт после.
  await writeFile(
    file,
    text
      .replace(
        '::::::section{title="Operator profile"',
        `${chart('Opening figure')}::::::section{title="Operator profile"`,
      )
      .replace(
        '::::::section{title="Operating log"',
        `${chart('Later figure')}::::::section{title="Operating log"`,
      ),
  );
  const output = path.join(root, 'figure-numbers.html');
  await buildReport({ input: source, output });
  await page.goto(pathToFileURL(output).href);
  const numbers = await page
    .locator('.visualization-caption')
    .evaluateAll((captions) =>
      captions
        .filter((caption) => caption.getClientRects().length > 0)
        .map((caption) => getComputedStyle(caption, '::before').content),
    );
  expect(numbers.length).toBeGreaterThanOrEqual(3);
  // Номер — текст, который читатель видит в подписи; доступное имя у него пустое («/ ""»).
  expect(numbers.slice(0, 3)).toEqual(['"// fig.01" / ""', '"// fig.02" / ""', '"// fig.03" / ""']);
  expect(
    await page.locator('.page-opening-copy .visualization-caption').count(),
    'the first figure must sit in the opening column',
  ).toBe(1);
});

test('a chapter has the same number in its heading, the contents block and the navigation', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  const source = path.join(root, 'chapter-numbers');
  await rm(source, { recursive: true, force: true });
  // Витрина с секцией первого экрана (`place="opening"`) и блоком оглавления в тексте.
  await cp(path.resolve('examples/landing'), source, { recursive: true });
  const output = path.join(root, 'chapter-numbers.html');
  await buildReport({ input: source, output });
  await page.goto(pathToFileURL(output).href);
  for (const language of ['en', 'ru'] as const) {
    await page.locator('[data-language-select]').selectOption(language);
    const found = await page.evaluate(() => {
      const out: string[] = [];
      const number = (id: string): string | null => {
        const heading = document.getElementById(id)?.querySelector(':scope > h2');
        if (!(heading instanceof HTMLElement) || heading.getClientRects().length === 0) return null;
        // Номер, который видит читатель над заголовком главы (там, где он показан).
        const shown = getComputedStyle(heading, '::before').content;
        if (heading.dataset.chapterNumber === undefined) out.push(`${id}: heading has no number`);
        else if (!shown.includes(heading.dataset.chapterNumber))
          out.push(
            `${id}: heading shows ${shown} but carries ${heading.dataset.chapterNumber ?? ''}`,
          );
        return heading.dataset.chapterNumber ?? null;
      };
      const lists = [
        ...document.querySelectorAll<HTMLElement>(
          '[data-in-flow-contents] ol, [data-navigation] ol',
        ),
      ].filter((list) => list.getClientRects().length > 0 || list.closest('[data-navigation]'));
      for (const list of lists) {
        const links = [...list.querySelectorAll<HTMLAnchorElement>(':scope > li > a')];
        links.forEach((link, index) => {
          const id = link.getAttribute('href')?.slice(1) ?? '';
          const expected = String(index + 1).padStart(2, '0');
          const actual = number(id);
          if (actual !== null && actual !== expected)
            out.push(`${id}: list item ${expected}, heading ${actual}`);
        });
      }
      return { out, lists: lists.length };
    });
    expect(found.lists, language).toBeGreaterThanOrEqual(2);
    expect(found.out, language).toEqual([]);
  }
});
