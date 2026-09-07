import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getSourceContract } from '../../src/discovery.js';
import { PAGE_MOTION_POLICY } from '../../src/page-motion.js';
import { renderMarkdown } from '../../src/render/markdown.js';

describe('purposeful motion and controls', () => {
  it('publishes closed reusable motion, action placement, and magnetic domains', () => {
    const contract = getSourceContract().directives;
    expect(contract.section?.attributes.transition).toMatchObject({
      kind: 'enum',
      default: 'none',
      values: ['none', 'reveal', 'stagger'],
    });
    expect(contract.section?.attributes.scene).toMatchObject({
      kind: 'enum',
      default: 'none',
      values: ['none', 'progress', 'sticky'],
    });
    expect(contract.section?.attributes.interaction).toMatchObject({
      kind: 'enum',
      default: 'none',
      values: ['none', 'depth', 'tilt'],
    });
    expect(contract.section?.attributes.choreography).toMatchObject({
      kind: 'enum',
      default: 'none',
      values: ['none', 'cascade'],
    });
    expect(contract.actions?.attributes.placement).toMatchObject({
      kind: 'enum',
      default: 'auto',
      values: ['auto', 'edge', 'inline', 'bottom'],
    });
    expect(contract.action?.attributes.effect).toMatchObject({
      kind: 'enum',
      default: 'none',
      values: ['none', 'magnetic'],
    });
    expect(PAGE_MOTION_POLICY).toMatchObject({
      stagger: { maximumItems: 12 },
      pointer: { finePointerOnly: true, normalMotionOnly: true },
      choreography: { maximumItems: 12, normalMotionOnly: true },
    });
  });

  it('projects the same motion and placement semantics through both output formats', async () => {
    const source = [
      '::::section{title="Motion" transition="stagger" scene="progress" interaction="none" choreography="cascade"}',
      ':::actions{placement="bottom"}',
      '::action[Continue]{href="#next" kind="primary" effect="magnetic"}',
      ':::',
      '::::',
    ].join('\n');
    for (const format of ['single-file', 'directory'] as const) {
      const result = await render(source, format);
      expect(result).toContain('data-transition="stagger"');
      expect(result).toContain('data-scene="progress"');
      expect(result).toContain('data-choreography="cascade"');
      expect(result).toContain('data-placement="bottom"');
      expect(result).toContain('data-effect="magnetic"');
      expect(result).toContain('data-package-icon="arrow-right"');
    }
  });

  it('rejects combinations with competing transform or sticky owners before rendering', async () => {
    for (const attributes of [
      'media="layers" interaction="tilt"',
      'scene="progress" interaction="depth"',
      'composition="story" scene="sticky"',
    ]) {
      await expect(
        render(`:::section{title="Conflict" ${attributes}}\nText.\n:::`, 'single-file'),
      ).rejects.toMatchObject({ diagnostic: { code: 'INVALID_DIRECTIVE_ATTRIBUTE' } });
    }
    await expect(
      render(
        ':::actions\n::action[Wrong]{href="#next" kind="quiet" effect="magnetic"}\n:::',
        'single-file',
      ),
    ).rejects.toMatchObject({
      diagnostic: {
        code: 'INVALID_DIRECTIVE_ATTRIBUTE',
        message: expect.stringContaining('primary action'),
      },
    });
  });
});

async function render(source: string, format: 'single-file' | 'directory'): Promise<string> {
  const sourceRoot = path.resolve('test-results/unit-purposeful-motion');
  const sourceFile = path.join(sourceRoot, 'report.md');
  return (
    await renderMarkdown(source, {
      sourceRoot,
      format,
      outputFilePath: path.join(
        sourceRoot,
        format === 'single-file' ? 'report.html' : 'index.html',
      ),
      sourceMap: [
        {
          generatedStart: 0,
          generatedEnd: source.length,
          sourceFile,
          sourceStart: 0,
          sourceText: source,
        },
      ],
    })
  ).html;
}
