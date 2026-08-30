import { describe, expect, it } from 'vitest';

import {
  renderDocument,
  type DocumentRenderOptions,
  type DocumentRuntime,
} from '../../src/render/document.js';

const baseOptions = {
  title: 'Runtime contract',
  language: 'en',
  page: {
    preset: 'studio',
    theme: 'system',
    layout: 'document',
    scrollProgress: false,
    attribution: true,
    tokens: {
      density: 'comfortable',
      font: 'sans',
      accent: 'indigo',
      width: 'standard',
      radius: 'soft',
    },
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
    for (const preset of ['studio', 'editorial', 'signal'] as const) {
      for (const layout of ['document', 'dashboard', 'landing', 'mixed'] as const) {
        for (const theme of ['system', 'light', 'dark'] as const) {
          const html = renderDocument({
            ...inlineOptions,
            page: {
              preset,
              theme,
              layout,
              tokens: {
                density: 'compact',
                font: 'serif',
                accent: 'teal',
                width: 'wide',
                radius: 'round',
              },
            },
            contentHtml:
              '<h1>Page model</h1><h2 id="section">Section</h2><p>Semantic content.</p><h2 id="next">Next</h2>',
            navigation: [
              { id: 'section', label: 'Section', depth: 2 },
              { id: 'next', label: 'Next', depth: 2 },
            ],
          });
          expect(html).toContain(`data-preset="${preset}"`);
          expect(html).toContain(`data-layout="${layout}"`);
          expect(html).toContain(`data-theme="${theme}"`);
          expect(html).toContain('data-density="compact"');
          expect(html).toContain('data-font="serif"');
          expect(html).toContain('data-accent="teal"');
          expect(html).toContain('data-width="wide"');
          expect(html).toContain('data-radius="round"');
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
      page: { ...inlineOptions.page, scrollProgress: true },
      contentHtml: '<h2 id="first">First</h2><h2 id="second">Second</h2>',
      navigation: [
        { id: 'first', label: 'First', depth: 2 },
        { id: 'second', label: 'Second', depth: 2 },
      ],
    });
    expect(html).toContain('data-scroll-progress="true"');
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

  it('renders a collision-free labelled Review Workspace only when targets exist', () => {
    const html = renderDocument({
      ...inlineOptions,
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

    expect(html).toContain('class="review-toggle"');
    expect(html).toContain('aria-controls="report-review-dialog-2"');
    expect(html).toContain(
      'class="review-dialog" id="report-review-dialog-2" aria-labelledby="report-review-dialog-title"',
    );
    expect(html).toContain('data-review-target-editor="true" hidden=""');
    expect(html).toContain('data-review-import="true"');
    expect(html).toContain('data-review-export="true"');
    expect(renderDocument(inlineOptions)).not.toContain('data-review-toggle');
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
