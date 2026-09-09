import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { authoringRegistry, PAGE_PRESETS } from '../../src/authoring/registry.js';
import { expect, test } from './fixtures.js';

const artifactUrl = (name: string): string =>
  pathToFileURL(path.resolve('test-results/e2e-generated', `${name}.html`)).href;
const publicSiteRoot = path.resolve('test-results/e2e-site');
const publicRoutes = (
  JSON.parse(await readFile(path.resolve('website/routes.json'), 'utf8')) as {
    readonly routes: readonly {
      readonly id: string;
      readonly href: string;
      readonly kind: string;
    }[];
  }
).routes.filter((route) => route.kind === 'page');
const layoutDirectiveNames = new Set(['section', 'actions', 'cards']);
const publicComponentNames = authoringRegistry.directives
  .filter(
    (directive) =>
      directive.forms.some((form: string) => form === 'container') &&
      directive.behavior.renderer === 'semantic-container' &&
      !('requiredParent' in directive.placement) &&
      !layoutDirectiveNames.has(directive.name),
  )
  .map((directive) => directive.name);

test('compact shell exposes a quiet localized icon toolbar without synthetic page identity', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(artifactUrl('public-landing'));

  await expect(page.locator('.topbar-context')).toBeHidden();
  await expect(page.locator('[data-nav-toggle] [data-package-icon="three-bars"]')).toBeVisible();
  await expect(page.locator('[data-review-toggle] [data-package-icon="comment"]')).toBeVisible();
  await expect(page.locator('.language-select [data-package-icon="language"]')).toBeVisible();
  await expect(page.locator('[data-theme-toggle] [data-package-icon="sun"]')).toBeVisible();

  const toolbar = await page.locator('.topbar').evaluate((topbar) => {
    const controls = [
      topbar.querySelector<HTMLElement>('[data-nav-toggle]'),
      topbar.querySelector<HTMLElement>('[data-review-toggle]'),
      topbar.querySelector<HTMLElement>('.language-select'),
      topbar.querySelector<HTMLElement>('[data-theme-toggle]'),
    ];
    return {
      heightShare: topbar.getBoundingClientRect().height / innerHeight,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      controls: controls.map((control) => {
        if (control === null) throw new Error('Expected every compact toolbar control.');
        const box = control.getBoundingClientRect();
        const style = getComputedStyle(control);
        return {
          width: box.width,
          height: box.height,
          borderStyle: style.borderTopStyle,
          background: style.backgroundColor,
        };
      }),
      visibleLabels: [
        ...topbar.querySelectorAll<HTMLElement>('[data-topbar-control-label]'),
      ].filter((label) => getComputedStyle(label).display !== 'none').length,
    };
  });
  expect(toolbar.heightShare).toBeLessThan(0.1);
  expect(toolbar.visibleLabels).toBe(0);
  for (const control of toolbar.controls) {
    const minimumTarget = toolbar.coarsePointer ? 44 : 40;
    expect(control.width).toBeGreaterThanOrEqual(minimumTarget);
    expect(control.height).toBeGreaterThanOrEqual(minimumTarget);
    expect(control.width).toBeLessThanOrEqual(48);
    expect(control.height).toBeLessThanOrEqual(48);
    expect(control.borderStyle).toBe('none');
    expect(control.background).toBe('rgba(0, 0, 0, 0)');
  }

  const language = page.getByRole('combobox', { name: 'Language' });
  await expect(language).toHaveAttribute('title', 'Language');
  await language.selectOption('ru');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  const localizedLanguage = page.getByRole('combobox', { name: 'Язык' });
  await expect(localizedLanguage).toHaveAttribute('title', 'Язык');
  await expect(localizedLanguage).toBeFocused();
  expect(
    await page.locator('.language-select').evaluate((control) => {
      const style = getComputedStyle(control);
      return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
    }),
  ).toBe(true);
  await expect(page.getByRole('button', { name: 'Открыть содержание' })).toHaveAttribute(
    'title',
    'Открыть содержание',
  );
  await expect(page.getByRole('button', { name: 'Ревью' })).toHaveAttribute('title', 'Ревью');
  await expect(page.getByRole('button', { name: 'Переключить цветовую тему' })).toHaveAttribute(
    'title',
    'Переключить цветовую тему',
  );
});

test('localized landing keeps its heading and primary action in the compact opening composition', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(artifactUrl('public-landing'));

  const inspectOpening = async () =>
    await page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>('main h1');
      const action = document.querySelector<HTMLElement>(
        'main .semantic-action[data-kind="primary"]',
      );
      if (heading === null || action === null) throw new Error('Expected landing opening content.');
      return {
        headingShare: heading.getBoundingClientRect().height / innerHeight,
        actionBottom: action.getBoundingClientRect().bottom,
        viewportHeight: innerHeight,
      };
    });

  for (const opening of [
    await inspectOpening(),
    await page.getByRole('combobox', { name: 'Language' }).selectOption('ru').then(inspectOpening),
  ]) {
    expect(opening.headingShare).toBeLessThan(0.3);
    expect(opening.actionBottom).toBeLessThan(opening.viewportHeight);
  }
});

test('package-owned operations expose coherent icons without replacing their labels', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto(artifactUrl('interactive-catalog'));
  const operations = [
    ['[data-disclosure] > summary', 'arrow-down'],
    ['[data-modal-open]', 'window'],
    ['[data-modal-close]', 'x'],
    ['.semantic-popover > [data-popover-trigger]', 'info'],
    ['[data-toggle-control]', 'eye'],
    ['[data-demo-increment]', 'plus'],
    ['[data-filter] label', 'search'],
    ['[data-copy-prose]', 'copy'],
  ] as const;
  for (const [controlSelector, icon] of operations) {
    const control = page.locator(controlSelector).first();
    await expect(control, controlSelector).toBeAttached();
    await expect(control.locator(`[data-package-icon="${icon}"]`), controlSelector).toBeAttached();
    expect((await control.innerText()).trim(), controlSelector).not.toBe('');
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const compactOperation = page.locator('[data-modal-open]').first();
  const compactOperationState = await compactOperation.evaluate((control) => {
    const label = control.querySelector<HTMLElement>('.package-control-label');
    const box = control.getBoundingClientRect();
    const labelBox = label?.getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      labelWidth: labelBox?.width,
      labelHeight: labelBox?.height,
      accessibleName: control.getAttribute('aria-label'),
      tooltip: control.getAttribute('title'),
    };
  });
  expect(compactOperationState.width).toBeLessThanOrEqual(390);
  expect(compactOperationState.width).toBeGreaterThanOrEqual(44);
  expect(compactOperationState.height).toBeLessThanOrEqual(48);
  expect(compactOperationState.height).toBeGreaterThanOrEqual(44);
  expect(compactOperationState.labelWidth).toBeGreaterThan(1);
  expect(compactOperationState.labelHeight).toBeGreaterThan(1);
  expect(compactOperationState.accessibleName).not.toBe('');
  expect(compactOperationState.tooltip).toBe(compactOperationState.accessibleName);

  for (const width of [304, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const locale of ['en', 'ru']) {
      await page.locator('[data-language-select]').selectOption(locale);
      for (const selector of [
        '[data-modal-open]',
        '.semantic-popover > [data-popover-trigger]',
        '[data-toggle-control]',
      ]) {
        const control = page.locator(selector).first();
        const label = control.locator('.package-control-label');
        await expect(label).toBeVisible();
        const state = await control.evaluate((element) => {
          const text = element.querySelector<HTMLElement>('.package-control-label');
          if (text === null) throw new Error('Expected authored action label.');
          const range = document.createRange();
          range.selectNodeContents(text);
          const box = element.getBoundingClientRect();
          const textBox = range.getBoundingClientRect();
          return {
            labelWidth: text.getBoundingClientRect().width,
            unclipped: getComputedStyle(text).clipPath === 'none',
            contained:
              textBox.left >= box.left &&
              textBox.right <= box.right &&
              textBox.top >= box.top &&
              textBox.bottom <= box.bottom,
          };
        });
        expect(state.labelWidth, `${width}/${locale}/${selector}`).toBeGreaterThan(1);
        expect(state.unclipped, `${width}/${locale}/${selector}`).toBe(true);
        expect(state.contained, `${width}/${locale}/${selector}`).toBe(true);
      }
      const trigger = page.locator('[data-modal-open]').first();
      await trigger.click();
      await expect(page.locator('dialog[data-modal-dialog]')).toBeVisible();
      await page.locator('[data-modal-close]').click();
      await expect(trigger).toBeFocused();
    }
  }

  await page.goto(artifactUrl('response-workspace'));
  for (const [controlSelector, icon] of [
    ['[data-response-copy]', 'copy'],
    ['[data-response-download]', 'download'],
    ['.response-file-action', 'upload'],
    ['[data-response-order-move="up"]', 'arrow-up'],
    ['[data-response-order-move="down"]', 'arrow-down'],
  ] as const) {
    const control = page.locator(controlSelector).first();
    await expect(control, controlSelector).toBeAttached();
    await expect(control.locator(`[data-package-icon="${icon}"]`), controlSelector).toBeVisible();
    expect((await control.innerText()).trim(), controlSelector).not.toBe('');
  }
});

test('every public compact page keeps control groups contained without a full-width action wall', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  for (const viewport of [
    { name: 'narrow', width: 304, height: 844 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of publicRoutes) {
      await page.goto(pathToFileURL(path.join(publicSiteRoot, route.href)).href);
      const state = await page.evaluate(() => {
        const visible = (element: HTMLElement): boolean => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0;
        };
        const controls = [
          ...document.querySelectorAll<HTMLElement>(
            'button, summary, .semantic-action, .response-file-action, .review-file-action',
          ),
        ].filter(visible);
        return {
          escaped: controls
            .filter((control) => {
              const owner = control.parentElement;
              if (owner === null) return true;
              const rect = control.getBoundingClientRect();
              const ownerRect = owner.getBoundingClientRect();
              const ownerOverflow = getComputedStyle(owner).overflowX;
              if (ownerOverflow === 'auto' || ownerOverflow === 'scroll') return false;
              return rect.left < ownerRect.left - 1 || rect.right > ownerRect.right + 1;
            })
            .map((control) => control.getAttribute('aria-label') ?? control.textContent?.trim()),
          oversized: controls
            .filter(
              (control) =>
                control.tagName !== 'SUMMARY' && control.getBoundingClientRect().height > 64,
            )
            .map((control) => control.getAttribute('aria-label') ?? control.textContent?.trim()),
          actionWalls: [...document.querySelectorAll<HTMLElement>('.semantic-actions')]
            .filter(visible)
            .filter((group) => {
              const actions = [
                ...group.querySelectorAll<HTMLElement>(':scope > .semantic-action'),
              ].filter(visible);
              const forced = actions.filter((action) => {
                const clone = action.cloneNode(true);
                if (!(clone instanceof HTMLElement)) return false;
                clone.style.cssText =
                  'position:fixed;inset:auto auto -10000px -10000px;width:max-content;max-width:none;visibility:hidden';
                document.body.append(clone);
                const intrinsicWidth = clone.getBoundingClientRect().width;
                clone.remove();
                return (
                  action.getBoundingClientRect().width >= group.clientWidth * 0.9 &&
                  intrinsicWidth <= group.clientWidth * 0.9
                );
              });
              return actions.length > 1 && forced.length === actions.length;
            }).length,
        };
      });
      expect(state.escaped, `${route.id}:${viewport.name}:escaped`).toEqual([]);
      expect(state.oversized, `${route.id}:${viewport.name}:oversized`).toEqual([]);
      expect(state.actionWalls, `${route.id}:${viewport.name}:action-wall`).toBe(0);
    }
  }
});

test('localized stage heading stays readable across desktop composition widths', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  for (const viewport of [
    { width: 1200, height: 1920 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(artifactUrl('layout-mixed'));
    await page.getByRole('combobox', { name: 'Language' }).selectOption('ru');

    const geometry = await page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>('#stage > .semantic-section-title');
      const media = document.querySelector<HTMLElement>('#stage > :has(img)');
      if (heading === null || media === null)
        throw new Error('Expected localized stage and media.');
      const text = document.createRange();
      text.selectNodeContents(heading);
      const textBox = text.getBoundingClientRect();
      const mediaBox = media.getBoundingClientRect();
      return {
        textFitsHeading: heading.scrollWidth <= heading.clientWidth,
        textClearsMedia:
          textBox.bottom <= mediaBox.top ||
          textBox.top >= mediaBox.bottom ||
          textBox.right <= mediaBox.left ||
          textBox.left >= mediaBox.right,
      };
    });
    expect(geometry.textFitsHeading, String(viewport.width)).toBe(true);
    expect(geometry.textClearsMedia, String(viewport.width)).toBe(true);
  }
});

test('story media remains inside its section when the authored prose is shorter than the media', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(artifactUrl('vendor-decision'));

  const geometry = await page.evaluate(() => {
    const story = document.querySelector<HTMLElement>('#gates');
    const next = document.querySelector<HTMLElement>('#evidence');
    const mediaOwner = story?.querySelector<HTMLElement>(':scope > :has(img)');
    if (story === null || next === null || mediaOwner === undefined || mediaOwner === null) {
      throw new Error('Expected adjacent story, media, and evidence sections.');
    }
    story.dataset.viewport = 'adaptive';
    story.dataset.surface = 'plain';
    for (const child of story.children) {
      if (
        child !== story.firstElementChild &&
        child !== mediaOwner &&
        child instanceof HTMLElement
      ) {
        child.hidden = true;
      }
    }
    const storyBox = story.getBoundingClientRect();
    const mediaBox = mediaOwner.getBoundingClientRect();
    const nextBox = next.getBoundingClientRect();
    return {
      storyBottom: storyBox.bottom,
      mediaBottom: mediaBox.bottom,
      nextTop: nextBox.top,
    };
  });
  expect(geometry.storyBottom).toBeGreaterThanOrEqual(geometry.mediaBottom);
  expect(geometry.nextTop).toBeGreaterThan(geometry.storyBottom);
});

test('the shared shell uses desktop space while prose keeps a readable measure', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  for (const width of [1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(artifactUrl('layout-mixed'));
    const geometry = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>('.report-shell');
      const prose = document.querySelector<HTMLElement>('main article > p');
      if (shell === null || prose === null) throw new Error('Expected shell and prose.');
      const readableMeasure = document.createElement('span');
      readableMeasure.style.cssText =
        'position:fixed;display:block;visibility:hidden;width:78ch;font:inherit;pointer-events:none';
      document.body.append(readableMeasure);
      const maximumProseWidth = readableMeasure.getBoundingClientRect().width;
      readableMeasure.remove();
      return {
        shellShare: shell.getBoundingClientRect().width / innerWidth,
        proseWidth: prose.getBoundingClientRect().width,
        maximumProseWidth,
        rootOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    expect(geometry.shellShare, String(width)).toBeGreaterThan(width === 1440 ? 0.82 : 0.72);
    expect(geometry.proseWidth, String(width)).toBeLessThanOrEqual(geometry.maximumProseWidth + 1);
    expect(geometry.rootOverflow, String(width)).toBe(false);
  }

  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(artifactUrl('layout-mixed'));
  const expandedContentWidth = await page
    .locator('.report-content')
    .evaluate((element) => element.getBoundingClientRect().width);
  await page.locator('[data-nav-toggle]').click();
  const collapsed = await page.evaluate(() => ({
    contentWidth:
      document.querySelector<HTMLElement>('.report-content')?.getBoundingClientRect().width ?? 0,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    collapsed: document.documentElement.hasAttribute('data-nav-collapsed'),
  }));
  expect(collapsed.collapsed).toBe(true);
  expect(collapsed.contentWidth).toBeGreaterThan(expandedContentWidth);
  expect(collapsed.overflow).toBe(false);

  for (const width of [304, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(artifactUrl('starter-basic'));
    const compact = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      headingShare:
        (document.querySelector<HTMLElement>('.semantic-section-title')?.getBoundingClientRect()
          .height ?? innerHeight) / innerHeight,
      largestControl: Math.max(
        ...[...document.querySelectorAll<HTMLElement>('button, .semantic-action')].map(
          (control) => control.getBoundingClientRect().height,
        ),
      ),
    }));
    expect(compact.overflow, String(width)).toBe(false);
    expect(compact.headingShare, String(width)).toBeLessThan(0.32);
    expect(compact.largestControl, String(width)).toBeLessThanOrEqual(56);
  }
});

test('semantic component roles remain readable across every preset and theme identity', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto(artifactUrl('review-workspace'));
  const samples = await page.evaluate((presets) => {
    const themes = ['light', 'dark', 'system'];
    const root = document.documentElement;
    const parse = (value: string): [number, number, number] => {
      const channels = value
        .match(/[\d.]+/gu)
        ?.slice(0, 3)
        .map(Number);
      if (channels === undefined || channels.length !== 3)
        throw new Error(`Unparsed color: ${value}`);
      return (
        value.startsWith('color(srgb') ? channels.map((channel) => channel * 255) : channels
      ) as [number, number, number];
    };
    const luminance = (color: [number, number, number]): number => {
      const channels = color.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return (
        0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0)
      );
    };
    const ratio = (foreground: string, background: string): number => {
      const first = luminance(parse(foreground));
      const second = luminance(parse(background));
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const fixture = document.createElement('section');
    fixture.className = 'semantic-checklist';
    const label = document.createElement('span');
    label.className = 'semantic-check-item';
    label.textContent = 'Readable checklist item';
    const control = document.createElement('button');
    control.textContent = 'Control';
    const current = document.createElement('button');
    current.setAttribute('aria-selected', 'true');
    current.textContent = 'Current';
    const section = document.createElement('section');
    section.className = 'semantic-section';
    section.dataset.tone = 'soft';
    const sectionText = document.createElement('p');
    sectionText.textContent = 'Readable section';
    section.append(sectionText);
    const inverse = document.createElement('section');
    inverse.className = 'semantic-section';
    inverse.dataset.tone = 'contrast';
    const inverseText = document.createElement('p');
    inverseText.textContent = 'Readable inverse';
    inverse.append(inverseText);
    const muted = document.createElement('span');
    muted.style.cssText = 'background:var(--role-muted-bg);color:var(--role-muted-fg)';
    muted.textContent = 'Readable muted';
    fixture.append(label, control, current, muted);
    document.body.append(section, inverse, fixture);
    const results: Array<{
      id: string;
      page: number;
      section: number;
      component: number;
      control: number;
      current: number;
      muted: number;
      inverse: number;
    }> = [];
    for (const preset of presets) {
      for (const theme of themes) {
        root.dataset.preset = preset.name;
        Object.assign(root.dataset, preset.tokens);
        root.dataset.theme = theme;
        const surface = getComputedStyle(fixture);
        const controlStyle = getComputedStyle(control);
        const currentStyle = getComputedStyle(current);
        const pageStyle = getComputedStyle(document.body);
        const sectionStyle = getComputedStyle(section);
        const mutedStyle = getComputedStyle(muted);
        const inverseStyle = getComputedStyle(inverse);
        results.push({
          id: `${preset.name}/${theme}`,
          page: ratio(pageStyle.color, pageStyle.backgroundColor),
          section: ratio(getComputedStyle(sectionText).color, sectionStyle.backgroundColor),
          component: ratio(getComputedStyle(label).color, surface.backgroundColor),
          control: ratio(controlStyle.color, controlStyle.backgroundColor),
          current: ratio(currentStyle.color, currentStyle.backgroundColor),
          muted: ratio(mutedStyle.color, mutedStyle.backgroundColor),
          inverse: ratio(getComputedStyle(inverseText).color, inverseStyle.backgroundColor),
        });
      }
    }
    section.remove();
    inverse.remove();
    fixture.remove();
    return results;
  }, PAGE_PRESETS);
  for (const sample of samples) {
    expect(sample.page, `${sample.id} page`).toBeGreaterThanOrEqual(4.5);
    expect(sample.section, `${sample.id} section`).toBeGreaterThanOrEqual(4.5);
    expect(sample.component, `${sample.id} component`).toBeGreaterThanOrEqual(4.5);
    expect(sample.control, `${sample.id} control`).toBeGreaterThanOrEqual(4.5);
    expect(sample.current, `${sample.id} current`).toBeGreaterThanOrEqual(3);
    expect(sample.muted, `${sample.id} muted`).toBeGreaterThanOrEqual(4.5);
    expect(sample.inverse, `${sample.id} inverse`).toBeGreaterThanOrEqual(4.5);
  }
});

test('every registered public component stays contained and readable in real generated pages', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 390, height: 844 });
  const seen = new Set<string>();
  const containmentDefects: string[] = [];
  const contrastDefects: string[] = [];

  for (const route of publicRoutes) {
    await page.goto(pathToFileURL(path.join(publicSiteRoot, route.href)).href);
    const observations = await page.evaluate(
      ({ componentNames, presets }) => {
        const parseColor = (value: string): [number, number, number, number] => {
          const channels = value.match(/[\d.]+/gu)?.map(Number);
          if (channels === undefined || channels.length < 3) {
            throw new Error(`Unparsed color: ${value}`);
          }
          const scale = value.startsWith('color(srgb') ? 255 : 1;
          return [
            (channels[0] ?? 0) * scale,
            (channels[1] ?? 0) * scale,
            (channels[2] ?? 0) * scale,
            channels[3] ?? 1,
          ];
        };
        const luminance = (color: readonly number[]): number => {
          const channels = color.slice(0, 3).map((channel) => {
            const value = (channel ?? 0) / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
          return (
            0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0)
          );
        };
        const contrast = (foreground: string, background: string): number => {
          const first = luminance(parseColor(foreground));
          const second = luminance(parseColor(background));
          return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
        };
        const effectiveBackground = (element: HTMLElement): string => {
          let current: HTMLElement | null = element;
          while (current !== null) {
            const background = getComputedStyle(current).backgroundColor;
            if (parseColor(background)[3] > 0.98) return background;
            current = current.parentElement;
          }
          return getComputedStyle(document.body).backgroundColor;
        };
        const isVisible = (element: HTMLElement): boolean => {
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0;
        };
        const roots = [...document.querySelectorAll<HTMLElement>('[data-semantic]')].filter(
          (element) => componentNames.includes(element.dataset.semantic ?? ''),
        );
        const results: Array<{
          component: string;
          identity: string;
          minimumContrast: number;
          contained: boolean;
        }> = [];
        for (const preset of presets) {
          for (const theme of ['light', 'dark']) {
            document.documentElement.dataset.preset = preset.name;
            Object.assign(document.documentElement.dataset, preset.tokens);
            document.documentElement.dataset.theme = theme;
            for (const root of roots) {
              const name = root.dataset.semantic ?? '';
              const rootBox = root.getBoundingClientRect();
              const contentBox = document
                .querySelector<HTMLElement>('.report-content')
                ?.getBoundingClientRect();
              const textOwners = [
                root,
                ...root.querySelectorAll<HTMLElement>(
                  'p, li, dt, dd, label, summary, button, input, select, textarea, .semantic-title',
                ),
              ].filter(
                (element) =>
                  isVisible(element) &&
                  (element.matches('input, select, textarea') ||
                    (element.textContent?.trim().length ?? 0) > 0),
              );
              const ratios = textOwners.map((element) => {
                const style = getComputedStyle(element);
                return contrast(style.color, effectiveBackground(element));
              });
              results.push({
                component: name,
                identity: `${preset.name}/${theme}`,
                minimumContrast: Math.min(...ratios),
                contained:
                  contentBox !== undefined &&
                  rootBox.left >= Math.max(0, contentBox.left) - 1 &&
                  rootBox.right <= Math.min(innerWidth, contentBox.right) + 1 &&
                  root.scrollWidth <= root.clientWidth + 1,
              });
            }
          }
        }
        return results;
      },
      { componentNames: publicComponentNames, presets: PAGE_PRESETS },
    );

    for (const observation of observations) {
      seen.add(observation.component);
      const identity = `${route.id}:${observation.component}:${observation.identity}`;
      if (!observation.contained) containmentDefects.push(identity);
      if (observation.minimumContrast < 3) {
        contrastDefects.push(`${identity}:${observation.minimumContrast.toFixed(2)}`);
      }
    }
  }

  expect(containmentDefects, 'contained components').toEqual([]);
  expect(contrastDefects, 'readable components').toEqual([]);
  expect([...seen].sort()).toEqual([...publicComponentNames].sort());
});

test('visualization kinds retain distinct visible signals inside contextual surfaces', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto(
    pathToFileURL(path.join(publicSiteRoot, 'examples/visualization-catalog/index.html')).href,
  );
  const states = await page.evaluate((presets) => {
    const diagram = document.querySelector<HTMLElement>('.semantic-diagram');
    const timeline = document.querySelector<HTMLElement>('.semantic-timeline');
    if (diagram === null || timeline === null) throw new Error('Expected public visualizations.');
    const nodes = [...diagram.querySelectorAll<SVGElement>('.visualization-node')];
    const events = [...timeline.querySelectorAll<HTMLElement>('.visualization-timeline-event')];
    const observations = [];
    for (const preset of presets) {
      for (const theme of ['light', 'dark']) {
        document.documentElement.dataset.preset = preset.name;
        Object.assign(document.documentElement.dataset, preset.tokens);
        document.documentElement.dataset.theme = theme;
        for (const tone of ['plain', 'accent', 'contrast']) {
          for (const visualization of [diagram, timeline]) {
            const section = visualization.closest<HTMLElement>('.semantic-section');
            if (section === null) throw new Error('Expected owning section.');
            section.dataset.tone = tone;
          }
          const nodeSignals = new Map<string, string>();
          for (const node of nodes) {
            const kind = [...node.classList].find((name) => name.startsWith('visualization-node-'));
            if (kind === undefined) throw new Error('Expected node kind.');
            const style = getComputedStyle(node);
            nodeSignals.set(kind, `${style.fill}/${style.stroke}`);
          }
          const eventSignals = new Map<string, string>();
          for (const event of events) {
            const kind = [...event.classList].find((name) =>
              name.startsWith('visualization-event-'),
            );
            if (kind === undefined) throw new Error('Expected event kind.');
            eventSignals.set(kind, getComputedStyle(event, '::before').backgroundColor);
          }
          observations.push({
            identity: `${preset.name}/${theme}/${tone}`,
            nodeKinds: nodeSignals.size,
            nodesDistinctFromNeutral: [...nodeSignals].every(
              ([kind, signal]) =>
                kind === 'visualization-node-neutral' ||
                signal !== nodeSignals.get('visualization-node-neutral'),
            ),
            eventKinds: eventSignals.size,
            eventSignals: new Set(eventSignals.values()).size,
          });
        }
      }
    }
    return observations;
  }, PAGE_PRESETS);
  for (const state of states) {
    expect(state.nodeKinds, state.identity).toBeGreaterThan(1);
    expect(state.nodesDistinctFromNeutral, state.identity).toBe(true);
    expect(state.eventKinds, state.identity).toBeGreaterThan(1);
    expect(state.eventSignals, state.identity).toBe(state.eventKinds);
  }
});

test('linked and informational cards are distinct before hover and linked cards stay one target', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto(artifactUrl('starter-basic'));
  const linked = page.locator('.semantic-card[data-linked-card]');
  const plain = page.locator('.semantic-card:not([data-linked-card])').first();
  await expect(linked).toHaveCount(1);
  await expect(linked.locator('a')).toHaveCount(0);
  await expect(linked.locator('[data-package-icon="arrow-right"]')).toBeVisible();
  await linked.focus();
  await expect(linked).toBeFocused();
  const affordance = await Promise.all([
    linked.evaluate((card) => getComputedStyle(card).borderTopColor),
    plain.evaluate((card) => getComputedStyle(card).borderTopColor),
  ]);
  expect(affordance[0]).not.toBe(affordance[1]);
});

test('Terminal and Cinematic identities add structural treatment beyond a palette', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto(artifactUrl('starter-basic'));
  const effects = await page.evaluate(() => {
    const root = document.documentElement;
    const heading = document.querySelector<HTMLElement>('.semantic-section-title');
    const hero = document.querySelector<HTMLElement>('.semantic-section[data-recipe="hero"]');
    if (heading === null || hero === null)
      throw new Error('Expected recipe-backed starter section.');
    root.dataset.preset = 'terminal';
    const terminal = {
      prompt: getComputedStyle(heading, '::before').content,
      cursorAnimation: getComputedStyle(heading, '::after').animationName,
      background: getComputedStyle(document.body).backgroundImage,
    };
    root.dataset.preset = 'cinematic';
    const cinematic = {
      shadow: getComputedStyle(hero).boxShadow,
      background: getComputedStyle(document.body).backgroundImage,
    };
    return { terminal, cinematic };
  });
  expect(effects.terminal.prompt).toContain('>');
  expect(effects.terminal.cursorAnimation).toBe('agentic-cursor');
  expect(effects.terminal.background).toContain('repeating-linear-gradient');
  expect(effects.cinematic.shadow).not.toBe('none');
  expect(effects.cinematic.background).toContain('radial-gradient');
});
