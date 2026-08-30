import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildReport } from '../../src/core/compiler.js';
import type { ReviewTargetManifest } from '../../src/review/contract.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

describe('section lead and nearby appendix definitions', () => {
  it.each(['single-file', 'directory'] as const)(
    'renders one opening lead and moves a direct-section definition into the existing appendix in %s output',
    async (format) => {
      const workspace = await trackedWorkspace(`section-prose-${format}`);
      const source = path.join(workspace, 'report.md');
      await writeFile(source, validSectionProseSource());
      const result = await buildReport({
        input: source,
        output: path.join(workspace, format === 'single-file' ? 'report.html' : 'report-directory'),
        format,
      });
      const html = await readFile(result.outputPath, 'utf8');
      const firstSection = requireRegion(
        html,
        /<section class="semantic-section"[^>]*id="first-section"[\s\S]*?<\/section>/u,
      );
      const appendix = requireRegion(
        html,
        /<aside[^>]*data-glossary-appendix=""[\s\S]*?<\/aside>/u,
      );
      const inFlow = requireRegion(html, /<nav class="semantic-contents"[\s\S]*?<\/nav>/u);
      const lead = requireRegion(firstSection, /<p[^>]*data-semantic="lead"[^>]*>[\s\S]*?<\/p>/u);
      const reviewManifest = embeddedReviewManifest(html);

      expect(firstSection.indexOf(lead)).toBeGreaterThan(firstSection.indexOf('</h2>'));
      expect(lead).toContain('class="semantic-lead"');
      expect(lead).toMatch(/data-review-target="[^"]+"/u);
      expect(lead).toContain('The opening thesis uses <span');
      expect(firstSection).not.toContain('<p class="semantic-lead"><p');
      expect(firstSection).not.toContain('class="semantic-callout"');
      expect(firstSection).not.toContain('id="glossary-nearby-2"');
      expect(firstSection).not.toContain('class="semantic-glossary"');
      expect(html).toContain(
        'href="#glossary-nearby-2" class="semantic-glossary-link" data-glossary-definition-link="">View full definition</a>',
      );
      expect(appendix).toContain('id="glossary-nearby-2"');
      expect(appendix).toContain('id="glossary-root-definition"');
      expect(appendix.indexOf('id="glossary-nearby-2"')).toBeLessThan(
        appendix.indexOf('id="glossary-root-definition"'),
      );
      expect(appendix.match(/class="semantic-glossary"/gu)).toHaveLength(2);
      expect(inFlow).toContain('<a href="#first-section">First section</a>');
      expect(inFlow).toContain('<a href="#second-section">Second section</a>');
      expect(inFlow).not.toContain('Glossary');
      expect(html.match(/data-review-target=/gu)).toHaveLength(reviewManifest.targets.length);
      const movedTarget = reviewManifest.targets.find(
        (target) => target.kind === 'directive:glossary' && target.source.line === 14,
      );
      expect(movedTarget).toBeDefined();
      expect(appendix).toContain(`data-review-target="${movedTarget?.id}"`);
      const leadTargets = reviewManifest.targets.filter(
        (target) => target.kind === 'markdown:paragraph' && target.source.line === 9,
      );
      expect(leadTargets).toHaveLength(1);
      expect(firstSection).toContain(`data-review-target="${leadTargets[0]?.id}"`);
    },
  );

  it.each([
    {
      name: 'top-level placement',
      markdown: '# Invalid\n\n:::lead\nThesis.\n:::\n',
      line: 3,
    },
    {
      name: 'non-opening placement',
      markdown:
        '# Invalid\n\n::::section{title="Section"}\nOrdinary first.\n:::lead\nLate thesis.\n:::\n::::\n',
      line: 5,
    },
    {
      name: 'second lead',
      markdown:
        '# Invalid\n\n::::section{title="Section"}\n:::lead\nFirst thesis.\n:::\n:::lead\nSecond thesis.\n:::\n::::\n',
      line: 7,
    },
    {
      name: 'multiple paragraphs',
      markdown:
        '# Invalid\n\n::::section{title="Section"}\n:::lead\nFirst paragraph.\n\nSecond paragraph.\n:::\n::::\n',
      line: 4,
    },
    {
      name: 'list content',
      markdown:
        '# Invalid\n\n::::section{title="Section"}\n:::lead\n- Not a paragraph\n:::\n::::\n',
      line: 4,
    },
    {
      name: 'empty content',
      markdown: '# Invalid\n\n::::section{title="Section"}\n:::lead\n:::\n::::\n',
      line: 4,
    },
    {
      name: 'attribute',
      markdown:
        '# Invalid\n\n::::section{title="Section"}\n:::lead{title="Manual"}\nThesis.\n:::\n::::\n',
      line: 4,
      code: 'UNKNOWN_DIRECTIVE_ATTRIBUTE',
    },
  ] as const)('rejects $name for the bounded opening lead', async (testCase) => {
    const workspace = await trackedWorkspace('invalid-lead');
    const source = path.join(workspace, 'report.md');
    await writeFile(source, testCase.markdown);
    await expect(
      buildReport({ input: source, output: path.join(workspace, 'report.html') }),
    ).rejects.toMatchObject({
      diagnostic: {
        code: 'code' in testCase ? testCase.code : 'INVALID_DIRECTIVE_PLACEMENT',
        source: { file: source, line: testCase.line, column: 1 },
      },
    });
  });

  it.each([
    {
      name: 'blockquote',
      markdown:
        '# Invalid\n\n> :::glossary{key="quoted" term="Quoted" placement="appendix"}\n> Definition.\n> :::\n',
      line: 3,
      column: 3,
    },
    {
      name: 'callout',
      markdown:
        '# Invalid\n\n::::callout{title="Parent"}\n:::glossary{key="nested" term="Nested" placement="appendix"}\nDefinition.\n:::\n::::\n',
      line: 4,
      column: 1,
    },
    {
      name: 'list item',
      markdown:
        '# Invalid\n\n- Parent\n\n  :::glossary{key="listed" term="Listed" placement="appendix"}\n  Definition.\n  :::\n',
      line: 5,
      column: 3,
    },
    {
      name: 'lead',
      markdown:
        '# Invalid\n\n:::::section{title="Section"}\n::::lead\n:::glossary{key="nested" term="Nested" placement="appendix"}\nDefinition.\n:::\n::::\n:::::\n',
      line: 5,
      column: 1,
    },
  ] as const)(
    'keeps appendix glossary invalid inside a $name',
    async ({ markdown, line, column }) => {
      const workspace = await trackedWorkspace('invalid-section-glossary');
      const source = path.join(workspace, 'report.md');
      await writeFile(source, markdown);
      await expect(
        buildReport({ input: source, output: path.join(workspace, 'report.html') }),
      ).rejects.toMatchObject({
        diagnostic: {
          code: 'INVALID_DIRECTIVE_PLACEMENT',
          source: { file: source, line, column },
        },
      });
    },
  );
});

async function trackedWorkspace(name: string): Promise<string> {
  const workspace = await createTestWorkspace(name);
  workspaces.push(workspace);
  return workspace;
}

function requireRegion(html: string, pattern: RegExp): string {
  const match = pattern.exec(html)?.[0];
  if (match === undefined) throw new Error(`Missing expected HTML region: ${String(pattern)}`);
  return match;
}

function embeddedReviewManifest(html: string): ReviewTargetManifest {
  const encoded = /<template data-review-manifest="true">([\s\S]*?)<\/template>/u.exec(html)?.[1];
  if (encoded === undefined) throw new Error('Missing embedded review manifest.');
  return JSON.parse(
    encoded
      .replaceAll('&quot;', '"')
      .replaceAll('&#x27;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&'),
  ) as ReviewTargetManifest;
}

function validSectionProseSource(): string {
  return [
    '# Section prose',
    '',
    '## Glossary nearby',
    '',
    '::contents',
    '',
    '::::section{title="First section" id="first-section" nav="First"}',
    ':::lead',
    'The opening thesis uses :term[nearby language]{key="nearby"} without becoming a callout.',
    ':::',
    '',
    'Ordinary section prose remains in place.',
    '',
    ':::glossary{key="nearby" term="Nearby definition" placement="appendix"}',
    'The complete nearby definition is authored beside the section explanation.',
    ':::',
    '::::',
    '',
    ':::section{title="Second section" id="second-section" nav="Second"}',
    'Second section body.',
    ':::',
    '',
    ':::glossary{key="root-definition" term="Root definition" placement="appendix"}',
    'The existing root form remains valid.',
    ':::',
  ].join('\n');
}
