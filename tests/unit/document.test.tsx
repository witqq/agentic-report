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
    theme: 'system',
    layout: 'document',
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
    for (const layout of ['document', 'dashboard', 'landing', 'mixed'] as const) {
      for (const theme of ['system', 'light', 'dark'] as const) {
        const html = renderDocument({
          ...inlineOptions,
          page: {
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
          contentHtml: '<h1>Page model</h1><h2 id="section">Section</h2><p>Semantic content.</p>',
          navigation: [{ id: 'section', label: 'Section', depth: 2 }],
        });
        expect(html).toContain(`data-layout="${layout}"`);
        expect(html).toContain(`data-theme="${theme}"`);
        expect(html).toContain('data-density="compact"');
        expect(html).toContain('data-font="serif"');
        expect(html).toContain('data-accent="teal"');
        expect(html).toContain('data-width="wide"');
        expect(html).toContain('data-radius="round"');
        expect(html).toContain('<main id="report-content" class="report-content">');
        expect(html).toContain('<nav aria-label="Document contents">');
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
      '<aside class="sidebar" id="report-navigation-2" data-navigation="true">',
    );
    expect(html).toContain('aria-controls="report-navigation-2"');
    expect(html).toContain('href="#report-content-2"');
    expect(html.match(/id="report-content"/gu)).toHaveLength(1);
    expect(html.match(/id="report-navigation"/gu)).toHaveLength(1);
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
