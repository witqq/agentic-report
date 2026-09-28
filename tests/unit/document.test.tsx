import { describe, expect, it } from 'vitest';

import {
  BUILT_IN_THEME_NAMES,
  resolveBuiltInTheme,
  type BuiltInThemeName,
} from '../../src/authoring/themes.js';
import {
  renderDocument,
  type DocumentRenderOptions,
  type DocumentRuntime,
} from '../../src/render/document.js';

const baseOptions = {
  title: 'Runtime contract',
  language: 'en',
  page: {
    theme: resolveBuiltInTheme('midnight'),
    switchableThemes: [],
    scheme: 'system',
    layout: 'document',
    progress: 'none',
    opening: 'center',
    attribution: true,
    review: false,
    schemeToggle: true,
    motion: 'expressive',
  },
  contentHtml: '<h1>Runtime contract</h1>',
  navigation: [],
  contentSecurityPolicy: "default-src 'none'",
  styles: { inline: ':root{}' },
  reviewManifest: {
    contractVersion: 1,
    reportRevision: `sha256:${'a'.repeat(64)}`,
    targets: [],
  },
} as const satisfies Omit<DocumentRenderOptions, 'runtime'>;

describe('renderDocument runtime boundary', () => {
  it('renders exactly the required inline runtime alternative', () => {
    const html = renderDocument(inlineOptions);
    expect(html).toContain('<script>globalThis.started=true;</script>');
    expect(html).not.toContain('<script src=');
    expect(html).toContain('class="report-shell" data-has-navigation="false"');
  });

  it('renders exactly the required external runtime alternative', () => {
    const html = renderDocument(externalOptions);
    expect(html).toContain('<script src="assets/runtime.hash.js" defer=""></script>');
    expect(html).not.toContain('<script>');
  });

  it('renders package attribution by default and omits only the package footer on opt-out', () => {
    const attributed = renderDocument(inlineOptions);
    expect(attributed).toContain(
      '<footer class="report-attribution" data-report-attribution="true"><a href="https://agentic-report.witqq.dev/">Made with Agentic Report</a></footer>',
    );
    const optedOut = renderDocument({
      ...inlineOptions,
      page: { ...inlineOptions.page, attribution: false },
      contentHtml: '<p><a href="https://example.com/authored">Made with Agentic Report</a></p>',
    });
    expect(optedOut).not.toContain('data-report-attribution');
    expect(optedOut).toContain(
      '<a href="https://example.com/authored">Made with Agentic Report</a>',
    );
  });

  it('uses the input language for complete package chrome and falls back to English', () => {
    const localized = renderDocument({
      ...inlineOptions,
      language: 'ru-RU',
      page: { ...inlineOptions.page, review: true },
      contentHtml:
        '<p data-review-target="rt-target">Содержимое</p><h2 id="a">А</h2><h2 id="b">Б</h2>',
      navigation: [
        { id: 'a', label: 'А', depth: 2 },
        { id: 'b', label: 'Б', depth: 2 },
      ],
      reviewManifest: {
        contractVersion: 1,
        reportRevision: `sha256:${'b'.repeat(64)}`,
        targets: [
          {
            id: 'rt-target',
            kind: 'markdown:paragraph',
            fingerprint: `sha256:${'c'.repeat(64)}`,
            source: { file: 'report.md', line: 1, column: 1, endLine: 1, endColumn: 10 },
          },
        ],
      },
    });
    expect(localized).toContain('data-package-locale="ru"');
    expect(localized).toContain('Перейти к содержимому');
    expect(localized).toContain('aria-label="Содержание документа"');
    expect(localized).toContain('Пространство ревью');
    expect(localized).not.toContain('Skip to content');
    expect(localized).not.toContain('Review workspace');

    const fallback = renderDocument({ ...inlineOptions, language: 'de-DE' });
    expect(fallback).toContain('data-package-locale="en"');
    expect(fallback).toContain('Skip to content');
    expect(fallback).not.toContain('Перейти к содержимому');
  });

  it('projects every validated layout and theme through one semantic page shell', () => {
    for (const themeName of [
      'midnight',
      'calm-paper',
      'terminal',
    ] as const satisfies readonly BuiltInThemeName[]) {
      for (const layout of ['document', 'dashboard', 'landing', 'mixed'] as const) {
        for (const scheme of ['system', 'light', 'dark'] as const) {
          const theme = resolveBuiltInTheme(themeName);
          const html = renderDocument({
            ...inlineOptions,
            page: { ...inlineOptions.page, theme, scheme, layout },
            contentHtml:
              '<h1>Page model</h1><h2 id="section">Section</h2><p>Semantic content.</p><h2 id="next">Next</h2>',
            navigation: [
              { id: 'section', label: 'Section', depth: 2 },
              { id: 'next', label: 'Next', depth: 2 },
            ],
          });
          expect(html).toContain(`data-theme="${themeName}"`);
          expect(html).toContain(`data-layout="${layout}"`);
          expect(html).toContain(`data-scheme="${scheme}"`);
          // Приёмы темы приходят атрибутами корня из её данных, а не из имени темы.
          expect(html).toContain(`data-theme-topbar="${theme.chrome.topbar}"`);
          expect(html).toContain(`data-theme-landing="${theme.chrome.landing}"`);
          expect(html).toContain(
            `data-theme-heading-prefix="${theme.ornaments.headingPrefix === '' ? 'none' : 'on'}"`,
          );
          expect(html).toContain('<main id="report-content" class="report-content">');
          expect(html).toContain('aria-label="Document contents" data-navigation="true"');
        }
      }
    }
  });

  it('allocates collision-free shell IDs around authored heading IDs', () => {
    const html = renderDocument({
      ...inlineOptions,
      contentHtml:
        '<h2 id="report-content">Content collision</h2><h2 id="report-navigation">Navigation collision</h2>',
      navigation: [
        { id: 'report-content', label: 'Content collision', depth: 2 },
        { id: 'report-navigation', label: 'Navigation collision', depth: 2 },
      ],
    });

    expect(html).toContain('<main id="report-content-2" class="report-content">');
    expect(html).toContain(
      '<aside class="sidebar" id="report-navigation-host" data-nav-desktop-host="true">',
    );
    expect(html).toContain(
      '<nav id="report-navigation-2" aria-label="Document contents" data-navigation="true">',
    );
    expect(html).toContain('aria-controls="report-navigation-2"');
    expect(html).toContain('href="#report-content-2"');
    expect(html.match(/id="report-content"/gu)).toHaveLength(1);
    expect(html.match(/id="report-navigation"/gu)).toHaveLength(1);
  });

  it('renders one current navigation set, native mobile dialog, and optional progress intent', () => {
    const html = renderDocument({
      ...inlineOptions,
      page: { ...inlineOptions.page, progress: 'chapters' },
      contentHtml: '<h2 id="first">First</h2><h2 id="second">Second</h2>',
      navigation: [
        { id: 'first', label: 'First', depth: 2 },
        { id: 'second', label: 'Second', depth: 2 },
      ],
    });
    expect(html).toContain('data-progress="chapters"');
    expect(html).toContain('class="report-shell" data-has-navigation="true"');
    expect(html).toContain('aria-label="Hide contents"');
    expect(html).toContain('data-nav-dialog="true"');
    expect(html).toContain('data-nav-close="true"');
    expect(html).toContain('data-package-icon="three-bars"');
    expect(html).toContain('data-package-icon="sun"');
    expect(html).toContain('data-package-icon="x"');
    expect(html.match(/class="package-icon"/gu)).toHaveLength(3);
    expect(html.match(/aria-hidden="true"/gu)).toHaveLength(3);
    expect(html).not.toContain('autofocus=""');
    expect(html.match(/aria-current="location"/gu)).toHaveLength(1);
    expect(html.match(/data-navigation="true"/gu)).toHaveLength(1);
  });

  it('renders a collision-free labelled Review Workspace only when it is requested', () => {
    const html = renderDocument({
      ...inlineOptions,
      page: { ...inlineOptions.page, review: true },
      contentHtml: '<p id="report-review-dialog" data-review-target="rt-target">Review target</p>',
      reviewManifest: {
        contractVersion: 1,
        reportRevision: `sha256:${'b'.repeat(64)}`,
        targets: [
          {
            id: 'rt-target',
            kind: 'markdown:paragraph',
            fingerprint: `sha256:${'c'.repeat(64)}`,
            source: { file: 'report.md', line: 1, column: 1, endLine: 1, endColumn: 14 },
          },
        ],
      },
    });

    expect(html).toContain('class="review-toggle ui-button"');
    expect(html).toContain('data-package-icon="comment"');
    expect(html).toContain('aria-label="Review"');
    expect(html).toContain('aria-controls="report-review-dialog-2"');
    expect(html).toContain(
      'class="review-dialog" id="report-review-dialog-2" aria-labelledby="report-review-dialog-title"',
    );
    expect(html).toContain(
      'class="review-popover ui-panel" id="report-review-popover" role="dialog"',
    );
    expect(html).toContain('data-review-popover-close="true"');
    expect(html).toContain('data-review-import="true"');
    expect(html).toContain('data-review-export="true"');
    expect(html).toContain('data-review-selection-action-label="true"');
    expect(html).toContain('data-package-icon="pencil"');
    expect(html).not.toContain('data-review-exit');
    expect(html).not.toContain('data-review-target-editor');
    expect(renderDocument(inlineOptions)).not.toContain('data-review-toggle');
  });

  it('offers the theme selector only on request and keeps the scheme control separable', () => {
    const plain = renderDocument(inlineOptions);
    expect(plain).not.toContain('data-theme-select');
    expect(plain).not.toContain('<template data-theme-catalog');
    expect(plain).toContain('class="scheme-toggle ui-button"');

    const switchable = renderDocument({
      ...inlineOptions,
      page: {
        ...inlineOptions.page,
        switchableThemes: BUILT_IN_THEME_NAMES.map(resolveBuiltInTheme),
      },
    });
    expect(switchable).toContain('data-theme-select');
    expect(switchable).toContain('data-package-icon="palette"');
    // Каталог несёт тему вместе с её приёмами оболочки: без них смена дала бы смешанный вид.
    const catalog = /<template data-theme-catalog="true">(.*?)<\/template>/su.exec(switchable)?.[1];
    expect(catalog).toBeDefined();
    const parsed = JSON.parse((catalog ?? '{}').replaceAll('&quot;', '"')) as Record<
      string,
      Record<string, string>
    >;
    expect(Object.keys(parsed)).toEqual([...BUILT_IN_THEME_NAMES]);
    expect(parsed.terminal).toMatchObject({
      'data-theme': 'terminal',
      'data-theme-heading-prefix': 'on',
      'data-theme-title-cursor': 'on',
      'data-theme-linked-card': 'edge',
    });

    const withoutScheme = renderDocument({
      ...inlineOptions,
      page: { ...inlineOptions.page, schemeToggle: false },
    });
    expect(withoutScheme).not.toContain('class="scheme-toggle ui-button"');
    expect(withoutScheme).not.toContain('data-scheme-toggle');
  });

  it('keeps the review workspace out of an ordinary page even when targets exist', () => {
    const withTargets = {
      ...inlineOptions,
      contentHtml: '<p data-review-target="rt-target">Review target</p>',
      reviewManifest: {
        contractVersion: 1,
        reportRevision: `sha256:${'b'.repeat(64)}`,
        targets: [
          {
            id: 'rt-target',
            kind: 'markdown:paragraph',
            fingerprint: `sha256:${'c'.repeat(64)}`,
            source: { file: 'report.md', line: 1, column: 1, endLine: 1, endColumn: 14 },
          },
        ],
      },
    } as const satisfies DocumentRenderOptions;
    const defaulted = renderDocument(withTargets);
    expect(defaulted).not.toContain('class="review-toggle ui-button"');
    expect(defaulted).not.toContain('<template data-review-manifest');
    const requested = renderDocument({
      ...withTargets,
      page: { ...withTargets.page, review: true },
    });
    expect(requested).toContain('class="review-toggle ui-button"');
    expect(requested).toContain('<template data-review-manifest');
  });
});

const inlineRuntime: DocumentRuntime = { inline: 'runtime' };
const externalRuntime: DocumentRuntime = { src: 'assets/runtime.js' };
void inlineRuntime;
void externalRuntime;

const inlineOptions: DocumentRenderOptions = {
  ...baseOptions,
  runtime: { inline: 'globalThis.started=true;' },
};
const externalOptions: DocumentRenderOptions = {
  ...baseOptions,
  runtime: { src: 'assets/runtime.hash.js' },
};

// @ts-expect-error Every renderer call requires the runtime property.
const missingRuntimeOptions: DocumentRenderOptions = { ...baseOptions };
void missingRuntimeOptions;
// @ts-expect-error The renderer cannot accept an empty runtime choice.
const emptyRuntimeOptions: DocumentRenderOptions = { ...baseOptions, runtime: {} };
void emptyRuntimeOptions;
// @ts-expect-error The renderer cannot execute both runtime alternatives.
const duplicateRuntimeOptions: DocumentRenderOptions = {
  ...baseOptions,
  runtime: { inline: 'runtime', src: 'assets/runtime.js' },
};
void duplicateRuntimeOptions;
