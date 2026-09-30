import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { readPackageStylesheet } from '../helpers/package-stylesheet.js';

/**
 * Все виды схем рисуются одним языком темы: правила схем и графиков в таблице стилей и рендереры SVG
 * не называют ни одного цвета и ни одной гарнитуры сами, а берут их из переменных темы.
 */
const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab|lch)\(/iu;

function visualizationRules(css: string): { readonly selector: string; readonly body: string }[] {
  const rules: { selector: string; body: string }[] = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
    const selector = (match[1] ?? '').trim();
    if (/visualization|semantic-diagram|semantic-chart|semantic-timeline/u.test(selector)) {
      rules.push({ selector, body: match[2] ?? '' });
    }
  }
  return rules;
}

describe('diagram style', () => {
  it('takes every diagram and chart colour and typeface from theme variables', async () => {
    const css = await readPackageStylesheet();
    const rules = visualizationRules(css);
    expect(rules.length).toBeGreaterThan(40);
    for (const rule of rules) {
      expect(rule.body, rule.selector).not.toMatch(COLOUR_LITERAL);
      for (const family of rule.body.matchAll(/font-family:\s*([^;]+);/gu)) {
        expect(family[1], rule.selector).toMatch(/^var\(--font-/u);
      }
    }
  });

  it('keeps colour literals and typefaces out of the SVG renderers', async () => {
    for (const file of [
      'src/render/diagram-svg.ts',
      'src/render/visualizations.ts',
      'src/render/flow-layout.ts',
      'src/render/flow-elk.ts',
    ]) {
      const source = await readFile(path.resolve(file), 'utf8');
      expect(source, file).not.toMatch(/['"`]#[0-9a-f]{3,8}['"`]|\brgba?\(/iu);
      expect(source, file).not.toMatch(/fontFamily|font-family/u);
    }
  });

  it('draws every edge label with one weight in flow and sequence views', async () => {
    const svg = await readFile(path.resolve('src/render/diagram-svg.ts'), 'utf8');
    const renderers = await readFile(path.resolve('src/render/visualizations.ts'), 'utf8');
    expect(svg).toMatch(/export function layoutEdgeLabel\(value: string, maximumWidth: number\)/u);
    expect(`${svg}\n${renderers}`).not.toContain('visualization-sequence-label');
  });
});
