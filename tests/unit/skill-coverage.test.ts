/**
 * Catches a capability the agent cannot learn about: a directive, attribute value, manifest field, theme
 * value, recipe, category or command that the product accepts but the hand-written skill never names.
 *
 * The corpus excludes `references/catalog.md`: it is generated from the same registry, so counting it
 * would make every check pass by construction. Commands and flags are read from `src/cli.ts`, not from the
 * registry, so a command added only to the CLI is caught too. The last test plants a missing name and
 * proves the check turns red on it.
 *
 * Closed value lists (attribute values, font families) and the theme field list are taught by generated
 * output — the catalogue that `SKILL.md` links and `agentic-report schema --scope theme` that `themes.md`
 * names; the things the agent chooses between are taught by hand.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  authoringRegistry,
  PAGE_CATEGORIES,
  SECTION_RECIPE_NAMES,
} from '../../src/authoring/registry.js';
import { getAuthoringSchema } from '../../src/discovery.js';

const skillRoot = path.resolve('skills/agentic-report');
/** Files generated from the registry; they cannot prove the skill teaches anything. */
const GENERATED = new Set(['catalog.md']);

async function skillText(): Promise<string> {
  const references = await readdir(path.join(skillRoot, 'references'));
  const files = [
    path.join(skillRoot, 'SKILL.md'),
    ...references
      .filter((entry) => entry.endsWith('.md') && !GENERATED.has(entry))
      .map((entry) => path.join(skillRoot, 'references', entry)),
  ];
  const parts = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  return parts.join('\n');
}

/** A name counts as taught when the skill writes it as code: `name`, `name=…`, `name{`, `:name`. */
function taught(name: string, text: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`\`[^\`\n]*(?<![\\w-])${escaped}(?![\\w-])[^\`\n]*\``, 'u').test(text);
}

function missing(names: Iterable<string>, corpus: string): readonly string[] {
  return [...new Set(names)].filter((name) => !taught(name, corpus));
}

/**
 * Units of the skill in which a directive and its attribute count as named together: a paragraph or list
 * outside code, a table row read with its header row, or one line of a fenced example (where the whole
 * line is code, so the line is wrapped in backticks for the same test).
 */
function units(corpus: string): readonly string[] {
  const found: string[] = [];
  let paragraph: string[] = [];
  let header: string | undefined;
  let fenced = false;
  const close = (): void => {
    if (paragraph.length > 0) found.push(paragraph.join('\n'));
    paragraph = [];
  };
  for (const line of corpus.split('\n')) {
    const row = line.trimStart().startsWith('|');
    if (!row) header = undefined;
    if (/^\s*(```|~~~)/u.test(line)) {
      close();
      fenced = !fenced;
    } else if (fenced) found.push(`\`${line.replaceAll('`', '')}\``);
    else if (row) {
      close();
      if (header === undefined) header = line;
      else if (!/^\s*\|[\s:|-]+\|\s*$/u.test(line)) found.push(`${header}\n${line}`);
    } else if (line.trim() === '' || line.startsWith('#')) close();
    else paragraph.push(line);
  }
  close();
  return found;
}

/** An attribute carried by more directives than this is generic (`title`, `id`, `label`) and taught once. */
const SPECIFIC_ATTRIBUTE_LIMIT = 6;

/**
 * Pairs `directive attribute` whose attribute is specific (carried by few directives) and that no unit of
 * the skill names together: the agent cannot tell which directive takes it.
 */
function unpaired(
  directives: readonly {
    readonly name: string;
    readonly attributes: readonly { readonly name: string }[];
  }[],
  corpus: string,
): readonly string[] {
  const carriers = new Map<string, number>();
  for (const directive of directives)
    for (const attribute of directive.attributes)
      carriers.set(attribute.name, (carriers.get(attribute.name) ?? 0) + 1);
  const all = units(corpus);
  return directives.flatMap((directive) =>
    directive.attributes
      .filter((attribute) => (carriers.get(attribute.name) ?? 0) <= SPECIFIC_ATTRIBUTE_LIMIT)
      .filter(
        (attribute) =>
          !all.some((unit) => taught(directive.name, unit) && taught(attribute.name, unit)),
      )
      .map((attribute) => `${directive.name} ${attribute.name}`),
  );
}

/** Commands and flags of a Commander program source: `.command('x')`, `.option(`/`.requiredOption(` over lines. */
function parseCli(source: string): { commands: string[]; flags: string[] } {
  const commands = [...source.matchAll(/\.command\(\s*'([a-z-]+)/gu)].map(
    (match) => match[1] ?? '',
  );
  const flags = [
    ...source.matchAll(/\.(?:option|requiredOption)\(\s*'(?:-\w, )?(--[a-z-]+)/gu),
  ].map((match) => match[1] ?? '');
  return { commands, flags };
}

async function cliSurface(): Promise<{ commands: string[]; flags: string[] }> {
  return parseCli(await readFile(path.resolve('src/cli.ts'), 'utf8'));
}

describe('hand-written skill covers the authoring surface', () => {
  it('names every directive and attribute, and links the catalogue for their values', async () => {
    const corpus = await skillText();
    const directives = authoringRegistry.directives;
    expect
      .soft(
        missing(
          directives.map((directive) => directive.name),
          corpus,
        ),
      )
      .toEqual([]);
    expect
      .soft(
        missing(
          directives.flatMap((directive) =>
            directive.attributes.map((attribute) => attribute.name),
          ),
          corpus,
        ),
      )
      .toEqual([]);
    // Each specific attribute is named in the same paragraph, table row or example line as its directive.
    expect.soft(unpaired(directives, corpus)).toEqual([]);
    const skill = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8');
    expect(skill).toContain('references/catalog.md');
  });

  it('names every manifest field, built-in theme, recipe and page category', async () => {
    const corpus = await skillText();
    const schema = getAuthoringSchema('manifest') as {
      readonly properties?: Readonly<Record<string, unknown>>;
    };
    expect.soft(missing(Object.keys(schema.properties ?? {}), corpus)).toEqual([]);
    const themes = await readFile(path.join(skillRoot, 'references/themes.md'), 'utf8');
    expect.soft(themes).toContain('schema --scope theme');
    expect
      .soft(
        missing(
          authoringRegistry.page.themes.map((theme) => theme.name),
          corpus,
        ),
      )
      .toEqual([]);
    expect.soft(missing(authoringRegistry.page.schemes, corpus)).toEqual([]);
    expect.soft(missing(authoringRegistry.page.layouts, corpus)).toEqual([]);
    expect.soft(missing(SECTION_RECIPE_NAMES, corpus)).toEqual([]);
    expect
      .soft(
        missing(
          PAGE_CATEGORIES.map((category) => category.id),
          corpus,
        ),
      )
      .toEqual([]);
  });

  it('names every command and flag the CLI defines', async () => {
    const corpus = await skillText();
    const { commands, flags } = await cliSurface();
    expect(commands.length).toBeGreaterThan(5);
    expect.soft(missing(commands, corpus)).toEqual([]);
    expect.soft(missing(flags, corpus)).toEqual([]);
  });

  it('turns red on a name the skill never writes and ignores prose mentions', () => {
    const corpus = 'Use `stage` for the opening. The word planted appears only in prose.';
    expect(missing(['stage', 'planted', 'stag'], corpus)).toEqual(['planted', 'stag']);
  });

  it('turns red on a planted directive attribute named only beside another directive', () => {
    // A synthetic registry: `status` belongs to `card` and `node`; the corpus names it only with `card`.
    const registry = [
      { name: 'card', attributes: [{ name: 'status' }, { name: 'title' }] },
      { name: 'node', attributes: [{ name: 'status' }] },
    ];
    const corpus = [
      '| Block | Parts |',
      '| ----- | ----- |',
      '| `card` | `status` shows the state |',
      '',
      'A `node` is a box.',
      '',
      '```markdown',
      '::card{title="A"}',
      '```',
    ].join('\n');
    expect(unpaired(registry, corpus)).toEqual(['node status']);
    expect(
      unpaired(registry, `${corpus}\n\n\`\`\`markdown\n::node{status="done"}\n\`\`\`\n`),
    ).toEqual([]);
  });

  it('reads required and multi-line options of a planted command', async () => {
    const source = [
      "program.command('plant').requiredOption('--out <directory>', 'Where')",
      '  .option(',
      "    '--planted-flag',",
      "    'A flag written over lines',",
      '  )',
      "  .option('-q, --quiet', 'Quiet');",
    ].join('\n');
    const planted = parseCli(source);
    expect(planted).toEqual({ commands: ['plant'], flags: ['--out', '--planted-flag', '--quiet'] });
    expect(missing(planted.flags, 'Pass `--out` and `--quiet`.')).toEqual(['--planted-flag']);
    // The real CLI: the multi-line and required options are read too.
    const { flags } = await cliSurface();
    expect(flags).toEqual(expect.arrayContaining(['--colors', '--measure', '--out']));
    expect(flags).not.toContain('--built-in');
  });
});
