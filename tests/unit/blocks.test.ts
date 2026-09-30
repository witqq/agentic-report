import { copyFile, cp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parse } from '@babel/parser';
import type { Element } from 'hast';
import { afterEach, describe, expect, it } from 'vitest';

import { authoringRegistry } from '../../src/authoring/registry.js';
import { type BlockEnhancementServices, defineBlock } from '../../src/blocks/define-block.js';
import { EXAMPLE_PAGE_DATA } from '../../src/blocks/data.js';
import { BUILT_IN_BLOCKS } from '../../src/blocks/index.js';
import { packageStrings } from '../../src/localization.js';
import { pageFeature } from '../../src/page-features.js';
import { renderMarkdown } from '../../src/render/markdown.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

/**
 * The files of the directive core: the plugins that read and enhance every directive, and the
 * services they share with the blocks. A block name written in them is a branch for one block.
 */
const CORE_FILES = [
  'src/render/directives.ts',
  'src/render/section-identity.ts',
  'src/blocks/define-block.ts',
  'src/blocks/index.ts',
] as const;

/**
 * Document-wide concepts the core may name, each with the reason it is not one block's business.
 * An entry the core no longer needs fails the test, so the list cannot outlive its reason.
 */
const CORE_CONCEPTS: Readonly<Record<string, string>> = {
  section:
    'section identity is document-wide: authored and generated section ids are claimed in the directive pass and reserved by the id allocator, and glossary introductions and appendix placement are scoped by section',
  glossary:
    'the glossary is document-wide: its definitions form the index that term references, annotated code fences, the first-occurrence check and the appendix read',
  term: 'a term reference is the other half of the glossary index, and the first-occurrence check counts it as an introduction',
};

describe('block modules', () => {
  it('assembles the registry directive list from the block definitions, in block order', () => {
    // Identity, not equality: an equal copy of a definition kept in the registry would pass an
    // equality check while drifting from the block the core dispatches to.
    expect(authoringRegistry.directives).toHaveLength(BUILT_IN_BLOCKS.length);
    BUILT_IN_BLOCKS.forEach((block, index) => {
      expect(authoringRegistry.directives[index], block.name).toBe(block.definition);
      expect(block.name).toBe(block.definition.name);
    });
  });

  it('describes every block without motion, names its feature and ships validating examples', async () => {
    const workspace = await blockWorkspace();
    for (const block of BUILT_IN_BLOCKS) {
      expect(block.staticEquivalent.trim().length, block.name).toBeGreaterThan(0);
      // A block whose grammar names a package-owned controller gets it from its feature's script or
      // from the core; a feature without a script would leave the block without its controller.
      if (
        block.definition.behavior.runtime.startsWith('package-owned-') &&
        block.feature !== 'core'
      )
        expect(pageFeature(block.feature).script, block.name).toBeDefined();
      expect(block.examples.length, `${block.name} has no example`).toBeGreaterThan(0);
      for (const example of block.examples) {
        const rendered = await render(workspace, example);
        expect(rendered.observedDirectives, `${block.name} example`).toContain(block.name);
      }
    }
  });

  it('refuses an example that does not validate, which is what makes the examples evidence', async () => {
    const workspace = await blockWorkspace();
    await expect(render(workspace, ':count[no digits]\n')).rejects.toThrow(/has no digits/u);
  });

  it('hands a block its own messages in the page language', () => {
    const seen: string[] = [];
    const greeting = defineBlock<undefined, { readonly hello: string }>({
      definition: BUILT_IN_BLOCKS[0].definition,
      strings: { en: { hello: 'Hello' }, ru: { hello: 'Привет' } },
      enhance: (_element, context) => {
        seen.push(context.messages.hello);
      },
      feature: 'core',
      staticEquivalent: 'A greeting.',
    });
    const element: Element = { type: 'element', tagName: 'div', properties: {}, children: [] };
    greeting.enhance?.(element, services('ru'));
    greeting.enhance?.(element, services('en-GB'));
    expect(seen).toEqual(['Привет', 'Hello']);
  });

  it('refuses a localized default for an attribute that has no default', () => {
    expect(() =>
      defineBlock({
        definition: BUILT_IN_BLOCKS[0].definition,
        localizedDefaults: ['title'],
        feature: 'core',
        staticEquivalent: 'A section.',
      }),
    ).toThrow(/has no default/u);
  });

  it('keeps the directive core free of block names', async () => {
    const names = BUILT_IN_BLOCKS.map((block) => block.name);
    // The scan finds a planted branch: a core file that tested one block by name would fail here.
    expect(blockNameLiterals("if (node.name === 'count') return;", names)).toEqual(['count']);
    expect(blockNameLiterals('const label = `count`;', names)).toEqual(['count']);
    expect(blockNameLiterals("// 'count' in a comment is prose\n", names)).toEqual([]);

    const named = new Map<string, string[]>();
    for (const file of CORE_FILES) {
      const source = await readFile(path.resolve(file), 'utf8');
      for (const name of blockNameLiterals(source, names)) {
        named.set(name, [...(named.get(name) ?? []), file]);
      }
    }
    const unexpected = [...named.keys()].filter((name) => CORE_CONCEPTS[name] === undefined);
    expect(unexpected, 'block names used by the core').toEqual([]);
    const stale = Object.keys(CORE_CONCEPTS).filter((name) => !named.has(name));
    expect(stale, 'exceptions the core no longer needs').toEqual([]);
    for (const name of Object.keys(CORE_CONCEPTS)) expect(names).toContain(name);
  });
});

/** Every string literal of a source that equals a registered block name, in source order. */
function blockNameLiterals(source: string, names: readonly string[]): string[] {
  const known = new Set(names);
  const found: string[] = [];
  const pending: unknown[] = [
    parse(source, { sourceType: 'module', plugins: ['typescript'], errorRecovery: true }).program,
  ];
  while (pending.length > 0) {
    const node = pending.pop();
    if (Array.isArray(node)) {
      pending.push(...[...node].reverse());
      continue;
    }
    if (typeof node !== 'object' || node === null || !('type' in node)) continue;
    const literal = literalValue(node as { readonly type: unknown });
    if (literal !== undefined && known.has(literal)) found.push(literal);
    for (const [key, value] of Object.entries(node).reverse()) {
      if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
      if (typeof value === 'object' && value !== null) pending.push(value);
    }
  }
  return found;
}

function literalValue(node: { readonly type: unknown }): string | undefined {
  if (node.type === 'StringLiteral') return (node as unknown as { readonly value: string }).value;
  if (node.type === 'TemplateLiteral') {
    const template = node as unknown as {
      readonly expressions: readonly unknown[];
      readonly quasis: readonly { readonly value: { readonly cooked: string | null } }[];
    };
    if (template.expressions.length === 0) return template.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

async function blockWorkspace(): Promise<string> {
  const workspace = await createTestWorkspace('blocks');
  workspaces.push(workspace);
  await writeFile(path.join(workspace, 'data.json'), '{"local":true}\n');
  await writeFile(path.join(workspace, 'reader.woff'), 'package-owned-font-bytes');
  await copyFile(
    path.resolve('tests/fixtures/video/playback.webm'),
    path.join(workspace, 'clip.webm'),
  );
  for (const image of ['clip-poster.png', 'before.png', 'after.png']) {
    await copyFile(path.resolve('tests/fixtures/video/poster.png'), path.join(workspace, image));
  }
  // The film the video example names with from: an agentic-screencast web output directory.
  await cp(path.resolve('tests/fixtures/video/film'), path.join(workspace, 'film'), {
    recursive: true,
  });
  return workspace;
}

function render(workspace: string, markdown: string) {
  const sourceFile = path.join(workspace, 'report.md');
  return renderMarkdown(markdown, {
    sourceRoot: workspace,
    format: 'single-file',
    outputFilePath: path.join(workspace, 'artifact.html'),
    sourceMap: [
      {
        generatedStart: 0,
        generatedEnd: markdown.length,
        sourceFile,
        sourceStart: 0,
        sourceText: markdown,
      },
    ],
    // Every example page declares the same data file, so the data blocks' examples can read it.
    data: {
      files: [
        {
          name: 'run',
          file: path.join(workspace, 'run.json'),
          text: JSON.stringify(EXAMPLE_PAGE_DATA),
          value: EXAMPLE_PAGE_DATA,
        },
      ],
    },
  });
}

function services(language: string): BlockEnhancementServices {
  return {
    strings: packageStrings(language),
    language,
    layout: undefined,
    share: false,
    allocateId: (base) => base,
    nextInstance: () => 1,
    noteNeutralizedSourceLink: () => undefined,
  };
}
