import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { authoringRegistry } from '../../src/authoring/registry.js';
import { getAuthoringSchema } from '../../src/discovery.js';

const skillRoot = path.resolve('skills/agentic-report');

async function skillText(): Promise<string> {
  const references = await readdir(path.join(skillRoot, 'references'));
  const files = [
    path.join(skillRoot, 'SKILL.md'),
    ...references
      .filter((entry) => entry.endsWith('.md'))
      .map((entry) => path.join(skillRoot, 'references', entry)),
  ];
  const parts = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  return parts.join('\n');
}

function missing(names: readonly string[], corpus: string): readonly string[] {
  return names.filter((name) => !corpus.includes(`\`${name}\``));
}

describe('skill covers the authoring surface', () => {
  it('names every directive and every directive attribute', async () => {
    const corpus = await skillText();
    const directives = authoringRegistry.directives.map((directive) => directive.name);
    expect(missing(directives, corpus)).toEqual([]);
    const attributes = authoringRegistry.directives.flatMap((directive) =>
      directive.attributes.map((attribute) => attribute.name),
    );
    expect(missing([...new Set(attributes)], corpus)).toEqual([]);
  });

  it('names every frontmatter field and every visual token value', async () => {
    const corpus = await skillText();
    const schema = getAuthoringSchema('manifest') as {
      readonly properties?: Readonly<Record<string, unknown>>;
    };
    expect(missing(Object.keys(schema.properties ?? {}), corpus)).toEqual([]);
    const tokenValues = authoringRegistry.page.tokens.flatMap((token) =>
      token.constraint.kind === 'enum' ? [...token.constraint.values] : [],
    );
    expect(missing([...new Set(tokenValues)], corpus)).toEqual([]);
    expect(
      missing([...authoringRegistry.page.presets.map((preset) => preset.name)], corpus),
    ).toEqual([]);
    expect(missing([...authoringRegistry.page.themes], corpus)).toEqual([]);
    expect(missing([...authoringRegistry.page.layouts], corpus)).toEqual([]);
  });

  it('names every command the package exposes', async () => {
    const corpus = await skillText();
    const commands = authoringRegistry.commands.map((command) => command.id);
    expect(missing(commands, corpus)).toEqual([]);
  });
});
