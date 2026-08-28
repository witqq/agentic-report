import { describe, expect, it } from 'vitest';

import {
  extractNavigation,
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
  });

  it('renders exactly the required external runtime alternative', () => {
    const html = renderDocument(externalOptions);
    expect(html).toContain('<script src="assets/runtime.hash.js" defer=""></script>');
    expect(html).not.toContain('<script>');
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

  it('uses at least two explicit or legacy H2 targets and keeps subordinate H3 out of primary navigation', () => {
    expect(
      extractNavigation(
        '<h1 id="page">Page</h1><section class="semantic-section" data-nav="Proof" data-semantic="section" id="proof" aria-labelledby="proof-title">\n<h2 id="proof-title">Long proof heading</h2><h3 id="detail">Detail</h3></section><section class="semantic-section" data-semantic="section" id="next" aria-labelledby="next-title"><h2 id="next-title">Next section</h2></section>',
      ),
    ).toEqual([
      { depth: 2, id: 'proof', label: 'Proof' },
      { depth: 2, id: 'next', label: 'Next section' },
    ]);
    expect(
      extractNavigation(
        '<h1 id="page">Page</h1><h2 id="legacy">Legacy section</h2><h3 id="detail">Detail</h3>',
      ),
    ).toEqual([]);
    expect(
      extractNavigation(
        '<h2 id="legacy">Legacy section</h2><h3 id="detail">Detail</h3><h2 id="glossary" data-navigation-exclude="">Glossary</h2><h2 id="next">Next section</h2>',
      ),
    ).toEqual([
      { depth: 2, id: 'legacy', label: 'Legacy section' },
      { depth: 2, id: 'next', label: 'Next section' },
    ]);
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
