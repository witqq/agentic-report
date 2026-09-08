import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';
import { afterEach, describe, expect, it } from 'vitest';

import { directiveInvocationSchema, getDirectiveSchema } from '../../src/authoring/schemas.js';
import { getSourceContract } from '../../src/discovery.js';
import { buildReport } from '../../src/index.js';
import { renderMarkdown } from '../../src/render/markdown.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

describe('declarative visual language', () => {
  it('publishes every bounded section composition family from the source contract', () => {
    const section = getSourceContract().directives.section;
    if (section === undefined) throw new Error('Missing public section directive');
    const attributes = section.attributes;

    expect(attributes.recipe).toMatchObject({
      kind: 'enum',
      default: 'none',
      values: ['none', 'hero', 'evidence', 'story', 'rail', 'metrics'],
    });

    expect(attributes.composition).toMatchObject({
      kind: 'enum',
      default: 'flow',
      values: ['flow', 'stage', 'split', 'mosaic', 'story', 'stack'],
    });
    expect(attributes.viewport).toMatchObject({
      kind: 'enum',
      default: 'adaptive',
      values: ['adaptive', 'full', 'bounded'],
    });
    expect(attributes['section-density']).toMatchObject({
      kind: 'enum',
      default: 'editorial',
      values: ['compact', 'editorial', 'immersive'],
    });
    expect(attributes.type).toMatchObject({
      kind: 'enum',
      default: 'body',
      values: ['body', 'display', 'editorial'],
    });
    expect(attributes.media).toMatchObject({
      kind: 'enum',
      default: 'natural',
      values: ['natural', 'mask', 'layers', 'gallery', 'bleed'],
    });
    expect(attributes['media-fit']).toMatchObject({
      kind: 'enum',
      default: 'natural',
      values: ['natural', 'contain', 'cover'],
    });
    expect(attributes['media-aspect']).toMatchObject({
      kind: 'enum',
      default: 'natural',
      values: ['natural', 'landscape', 'cinematic', 'portrait', 'square'],
    });
    expect(attributes.focal).toMatchObject({
      kind: 'enum',
      default: 'center',
      values: ['center', 'top', 'right', 'bottom', 'left'],
    });
    expect(attributes.surface).toMatchObject({
      kind: 'enum',
      default: 'plain',
      values: ['plain', 'mesh', 'glow', 'grain', 'grid'],
    });
    expect(section.incompatibleCombinations).toContainEqual({
      attributes: {
        composition: ['mosaic', 'stack'],
        media: ['layers', 'gallery'],
      },
      message:
        'section composition mosaic or stack cannot be combined with layered or gallery media.',
      remediation:
        'Use composition flow, stage, split, or story with layered/gallery media, or use natural, mask, or bleed media with mosaic/stack composition.',
    });
  });

  it('resolves a high-level recipe before explicit per-role overrides and diagnostics', async () => {
    const workspace = await visualWorkspace('visual-language-recipes');
    const validateDirective = new Ajv2020({ strict: false, allErrors: true }).compile(
      getDirectiveSchema(),
    );
    const hero = await render(
      ':::section{title="Opening" recipe="hero" media="mask"}\nText.\n:::',
      workspace,
      'single-file',
    );
    expect(hero.html).toContain('data-recipe="hero"');
    expect(hero.html).toContain('data-composition="stage"');
    expect(hero.html).toContain('data-viewport="full"');
    expect(hero.html).toContain('data-type="display"');
    expect(hero.html).toContain('data-media="mask"');
    expect(hero.html).toContain('data-scene="progress"');

    const conflict = {
      name: 'section',
      form: 'container',
      attributes: { title: 'Conflict', recipe: 'metrics', media: 'gallery' },
    } as const;
    expect(directiveInvocationSchema.safeParse(conflict).success).toBe(false);
    expect(validateDirective(conflict)).toBe(false);

    await expect(
      render(
        ':::section{title="Conflict" recipe="metrics" media="gallery"}\nText.\n:::',
        workspace,
        'single-file',
      ),
    ).rejects.toMatchObject({
      diagnostic: {
        code: 'INVALID_DIRECTIVE_ATTRIBUTE',
        message: expect.stringContaining('cannot be combined'),
      },
    });

    const overridden = {
      ...conflict,
      attributes: { ...conflict.attributes, composition: 'stage' },
    } as const;
    expect(directiveInvocationSchema.safeParse(overridden).success).toBe(true);
    expect(validateDirective(overridden)).toBe(true);
  });

  it('renders a linked card as one safe focus target and rejects nested links', async () => {
    const workspace = await visualWorkspace('visual-language-linked-card');
    const linked = await render(
      '::::cards\n:::card{title="Read evidence" href="#evidence"}\nPlain selectable text.\n:::\n::::',
      workspace,
      'single-file',
    );
    expect(linked.html).toContain('<a class="semantic-card"');
    expect(linked.html).toContain('href="#evidence"');
    expect(linked.html).toContain('data-linked-card=""');
    expect(linked.html).toContain('semantic-card-link-signifier');

    await expect(
      render(
        '::::cards\n:::card{title="Invalid" href="#evidence"}\n[Nested](next.html)\n:::\n::::',
        workspace,
        'single-file',
      ),
    ).rejects.toMatchObject({
      diagnostic: {
        code: 'INVALID_DIRECTIVE_PLACEMENT',
        message: expect.stringContaining('cannot contain another link'),
      },
    });
  });

  it('renders the same confined visual declaration into inline and directory artifacts', async () => {
    const workspace = await visualWorkspace('visual-language-render');
    const markdown = visualSource();
    const single = await render(markdown, workspace, 'single-file');
    const directory = await render(markdown, workspace, 'directory');

    for (const result of [single, directory]) {
      expect(result.html).toContain('data-composition="stage"');
      expect(result.html).toContain('data-viewport="full"');
      expect(result.html).toContain('data-section-density="immersive"');
      expect(result.html).toContain('data-type="display"');
      expect(result.html).toContain('data-media="mask"');
      expect(result.html).toContain('data-media-fit="cover"');
      expect(result.html).toContain('data-media-aspect="cinematic"');
      expect(result.html).toContain('data-focal="right"');
      expect(result.html).toContain('data-surface="mesh"');
      expect(result.observedResources.images).toBe(1);
    }
    expect(single.html).toContain('src="data:image/svg+xml;base64,');
    expect(directory.html).toMatch(/src="assets\/scene\.[a-f0-9]{12}\.svg"/u);
    expect(directory.resourceFiles).toHaveLength(1);
  });

  it('keeps one visual declaration reusable across supported page layouts', async () => {
    for (const layout of ['document', 'dashboard'] as const) {
      const workspace = await visualWorkspace(`visual-language-${layout}`);
      await writeFile(
        path.join(workspace, 'agentic-report.yaml'),
        `title: Cross-layout visual language\nlayout: ${layout}\n`,
      );
      await writeFile(path.join(workspace, 'report.md'), visualSource());
      const output = path.join(workspace, 'report.html');

      await buildReport({ input: workspace, output });
      const html = await readFile(output, 'utf8');
      expect(html).toContain(`data-layout="${layout}"`);
      expect(html).toContain('data-composition="stage"');
      expect(html).toContain('data-media-aspect="cinematic"');
    }
  });

  it('rejects unknown and executable presentation instead of transporting it', async () => {
    const workspace = await visualWorkspace('visual-language-reject');
    for (const rejected of [
      {
        source: ':::section{title="Unsafe" composition="canvas"}\nText.\n:::',
        code: 'INVALID_DIRECTIVE_ATTRIBUTE',
        message: 'section.composition',
      },
      {
        source: ':::section{title="Unsafe" style="position:fixed"}\nText.\n:::',
        code: 'UNKNOWN_DIRECTIVE_ATTRIBUTE',
        message: 'style',
      },
      {
        source: ':::section{title="Unsafe" onclick="run()"}\nText.\n:::',
        code: 'UNKNOWN_DIRECTIVE_ATTRIBUTE',
        message: 'onclick',
      },
    ]) {
      await expect(render(rejected.source, workspace, 'single-file')).rejects.toMatchObject({
        diagnostic: { code: rejected.code, message: expect.stringContaining(rejected.message) },
      });
    }
  });

  it('rejects conflicting card-layout owners while preserving supported cross-family composition', async () => {
    const workspace = await visualWorkspace('visual-language-combinations');
    const validateDirective = new Ajv2020({ strict: false, allErrors: true }).compile(
      getDirectiveSchema(),
    );
    for (const composition of ['mosaic', 'stack'] as const) {
      for (const media of ['layers', 'gallery'] as const) {
        const invocation = {
          name: 'section',
          form: 'container',
          attributes: { title: 'Conflict', composition, media },
        };
        expect(directiveInvocationSchema.safeParse(invocation).success).toBe(false);
        expect(validateDirective(invocation)).toBe(false);
        const source = `:::section{title="Conflict" composition="${composition}" media="${media}"}\nText.\n:::`;
        await expect(render(source, workspace, 'single-file')).rejects.toMatchObject({
          diagnostic: {
            code: 'INVALID_DIRECTIVE_ATTRIBUTE',
            message: expect.stringContaining('cannot be combined'),
          },
        });
      }
    }

    for (const [composition, media] of [
      ['split', 'layers'],
      ['stage', 'gallery'],
    ] as const) {
      const invocation = {
        name: 'section',
        form: 'container',
        attributes: { title: 'Compatible', composition, media },
      };
      expect(directiveInvocationSchema.safeParse(invocation).success).toBe(true);
      expect(validateDirective(invocation)).toBe(true);
      const html = await render(
        `:::section{title="Compatible" composition="${composition}" media="${media}"}\nText.\n:::`,
        workspace,
        'single-file',
      );
      expect(html.html).toContain(`data-composition="${composition}"`);
      expect(html.html).toContain(`data-media="${media}"`);
    }
  });
});

async function visualWorkspace(prefix: string): Promise<string> {
  const workspace = await createTestWorkspace(prefix);
  workspaces.push(workspace);
  await mkdir(path.join(workspace, 'assets'), { recursive: true });
  await writeFile(
    path.join(workspace, 'assets', 'scene.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect width="160" height="90" fill="#3657d6"/></svg>',
  );
  return workspace;
}

function visualSource(): string {
  return [
    '# Visual language',
    ':::section{title="Spatial evidence" composition="stage" viewport="full" section-density="immersive" type="display" media="mask" media-fit="cover" media-aspect="cinematic" focal="right" surface="mesh"}',
    'A portable scene keeps its semantic reading order.',
    '![Bounded local scene](assets/scene.svg)',
    ':::',
  ].join('\n');
}

async function render(markdown: string, sourceRoot: string, format: 'single-file' | 'directory') {
  const sourceFile = path.join(sourceRoot, 'report.md');
  return renderMarkdown(markdown, {
    sourceRoot,
    format,
    outputFilePath: path.join(sourceRoot, format === 'single-file' ? 'report.html' : 'index.html'),
    sourceMap: [
      {
        generatedStart: 0,
        generatedEnd: markdown.length,
        sourceFile,
        sourceStart: 0,
        sourceText: markdown,
      },
    ],
  });
}
