import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { format, resolveConfig } from 'prettier';

import {
  getExtensionProposalSchema,
  getExtensionProposalTemplate,
} from '../dist/node/authoring/extension-gate.js';
import { getAuthoringSchema, getSourceContract, listExamples } from '../dist/node/discovery.js';
import type { SourceContract } from '../dist/node/discovery.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prettierOptions = (await resolveConfig(path.join(projectRoot, 'package.json'))) ?? {};
const check = process.argv.includes('--check');
const outputRoot = resolveOutputRoot();

const stale: string[] = [];

const projections = new Map<string, string>();
for (const scope of ['manifest', 'directives', 'source', 'theme'] as const) {
  projections.set(
    `docs/generated/${scope}.schema.json`,
    await serialize(getAuthoringSchema(scope)),
  );
}
projections.set('docs/generated/source-contract.json', await serialize(getSourceContract()));
projections.set(
  'docs/generated/extension-proposal.schema.json',
  await serialize(getExtensionProposalSchema()),
);
projections.set(
  'docs/generated/extension-proposal.template.json',
  await serialize(getExtensionProposalTemplate()),
);
projections.set('examples/manifest.json', await serialize(await createExampleManifest()));
projections.set(
  'skills/agentic-report/references/catalog.md',
  await formatMarkdown(
    renderSkillCatalog(getSourceContract(), getAuthoringSchema('manifest') as ManifestSchema),
  ),
);
await writeProjections(projections);
if (check && stale.length > 0) {
  throw new Error(`Generated authoring projections are stale:\n${stale.join('\n')}`);
}
process.stdout.write(
  `${check ? 'Checked' : 'Generated'} ${projections.size} authoring projections.\n`,
);

async function writeProjections(files: ReadonlyMap<string, string>): Promise<void> {
  for (const [relativePath, content] of files) {
    const target = path.join(outputRoot, relativePath);
    const current = await readFile(target, 'utf8').catch(() => undefined);
    if (current === content) continue;
    stale.push(relativePath);
    if (!check) {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
  }
}

async function formatMarkdown(markdown: string): Promise<string> {
  return format(markdown, { ...prettierOptions, parser: 'markdown' });
}

/**
 * Полный перечень авторской поверхности внутри скилла. Собирается из того же контракта, которым
 * работают проверки, поэтому расходиться с ними не может: расхождение ловит `--check`.
 */
interface ManifestSchema {
  readonly properties?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

function renderSkillCatalog(contract: SourceContract, manifest: ManifestSchema): string {
  const lines: string[] = [
    '# Authoring catalog',
    '',
    'Generated from the package contract by `pnpm generate:authoring`. Do not edit by hand: a stale copy',
    'fails `pnpm check:authoring`. Every list here is closed, so a name missing from it is not accepted by',
    'the compiler either.',
    '',
    `Contract version: ${contract.contractVersion}.`,
    '',
    '## Source syntax',
    '',
    '| Form | Written as |',
    '| --- | --- |',
  ];
  for (const [name, value] of Object.entries(contract.source.directiveSyntax)) {
    lines.push(`| ${name} | ${inlineCode(String(value))} |`);
  }
  lines.push(`| partial | ${inlineCode(contract.source.partialSyntax)} |`, '');

  lines.push(
    '## Page metadata',
    '',
    `Default theme \`${contract.page.defaultTheme}\`, default scheme \`${contract.page.defaultScheme}\`, default layout \`${contract.page.defaultLayout}\`.`,
    '',
    '| Built-in theme | Intent | Palette |',
    '| --- | --- | --- |',
  );
  for (const theme of contract.page.themes) {
    lines.push(`| \`${theme.name}\` | ${theme.description} | ${theme.palette} |`);
  }
  lines.push(
    '',
    `Schemes: ${contract.page.schemes.map((scheme: string) => `\`${scheme}\``).join(', ')}. Layouts: ${contract.page.layouts
      .map((layout: string) => `\`${layout}\``)
      .join(', ')}.`,
    '',
    '## Theme fields',
    '',
    '`theme` takes a built-in theme name, a relative path to a theme file (' +
      contract.page.themeFileExtensions.map((extension: string) => `\`${extension}\``).join(', ') +
      '), or a theme object in the frontmatter. A theme file and a theme object share these fields; every field is optional and anything left out comes from `extends`, which defaults to the default theme. Resolution order: ' +
      contract.page.theme.resolution.join(', ') +
      '.',
    '',
    '| Field | Values | Meaning |',
    '| --- | --- | --- |',
  );
  for (const [field, definition] of flattenFields(contract.page.theme.fields, '')) {
    lines.push(
      `| \`${field}\` | ${describeConstraint(definition.constraint)} | ${definition.description} |`,
    );
  }
  lines.push(
    '',
    `Named accents: ${Object.keys(contract.page.theme.accents)
      .map((accent) => `\`${accent}\``)
      .join(', ')}. Font families: ${Object.keys(contract.page.theme.fontFamilies)
      .map((family) => `\`${family}\``)
      .join(', ')}.`,
    '',
    'The build refuses a theme whose colours fail these contrast pairs in any scheme it draws:',
    '',
    '| Foreground | Background | Minimum | Used for |',
    '| --- | --- | --- | --- |',
  );
  for (const pair of contract.page.theme.contrast) {
    lines.push(
      `| \`${pair.foreground}\` | \`${pair.background}\` | ${pair.minimum}:1 | ${pair.use} |`,
    );
  }
  lines.push(
    '',
    '## Frontmatter and manifest fields',
    '',
    'Every accepted field; anything else is refused as an unknown field.',
    '',
    '| Field | Type | Default | Meaning |',
    '| --- | --- | --- | --- |',
  );
  for (const [field, definition] of Object.entries(manifest.properties ?? {})) {
    const type =
      typeof definition.type === 'string'
        ? definition.type
        : Array.isArray(definition.oneOf)
          ? 'string or object'
          : 'object';
    const fallback = 'default' in definition ? `\`${JSON.stringify(definition.default)}\`` : '—';
    const meaning = typeof definition.description === 'string' ? definition.description : '';
    lines.push(`| \`${field}\` | ${type} | ${fallback} | ${meaning} |`);
  }
  lines.push(
    '',
    '## Directives',
    '',
    `${Object.keys(contract.directives).length} directives are accepted.`,
    '',
  );
  for (const name of Object.keys(contract.directives).sort()) {
    const directive = contract.directives[name];
    if (directive === undefined) continue;
    lines.push(`### \`${name}\``, '', directive.description, '');
    const facts = [`Forms: ${directive.forms.join(', ')}.`];
    if (directive.children !== undefined) facts.push(`Children: ${String(directive.children)}.`);
    const parent = (directive.placement as { requiredParent?: string | readonly string[] })
      .requiredParent;
    if (parent !== undefined)
      facts.push(
        `Required parent: ${[parent]
          .flat()
          .map((name) => `\`${name}\``)
          .join(' or ')}.`,
      );
    lines.push(facts.join(' '), '');
    const attributes = Object.entries(directive.attributes ?? {});
    if (attributes.length > 0) {
      lines.push('| Attribute | Values | Required | Default |', '| --- | --- | --- | --- |');
      for (const [attribute, rawDefinition] of attributes) {
        const definition = rawDefinition as { required?: boolean; default?: unknown };
        lines.push(
          `| \`${attribute}\` | ${describeConstraint(definition)} | ${definition.required === true ? 'yes' : 'no'} | ${
            'default' in definition ? `\`${String(definition.default)}\`` : '—'
          } |`,
        );
      }
      lines.push('');
    }
  }

  lines.push(
    '## Visualization limits',
    '',
    '```json',
    JSON.stringify(contract.visualizations, undefined, 2),
    '```',
    '',
    '## Output formats',
    '',
    '```json',
    JSON.stringify(contract.outputs, undefined, 2),
    '```',
    '',
    '## Commands',
    '',
    '```json',
    JSON.stringify(contract.commands, undefined, 2),
    '```',
    '',
    '## Rules checked for you',
    '',
  );
  for (const rule of contract.authoredRules) {
    lines.push(`- ${typeof rule === 'string' ? rule : JSON.stringify(rule)}`);
  }
  lines.push('', '## Safety boundary', '');
  for (const item of contract.safety) {
    lines.push(`- ${typeof item === 'string' ? item : JSON.stringify(item)}`);
  }
  lines.push('');
  return lines.join('\n');
}

interface ContractField {
  readonly name: string;
  readonly description: string;
  readonly constraint?: unknown;
  readonly fields?: readonly ContractField[];
}

/** Вложенные поля темы плоским списком с путём через точку: так их пишет автор. */
function flattenFields(
  fields: readonly ContractField[],
  prefix: string,
): readonly (readonly [string, ContractField])[] {
  return fields.flatMap((field) => {
    const name = `${prefix}${field.name}`;
    if (field.fields === undefined) return [[name, field] as const];
    if (name === 'colors.light' || name === 'colors.dark') {
      return [
        [
          `${name}.<role>`,
          {
            name: `${name}.<role>`,
            description: `${field.description} Roles: ${field.fields.map((role) => `\`${role.name}\``).join(', ')}.`,
            constraint: field.fields[0]?.constraint,
          },
        ] as const,
      ];
    }
    return flattenFields(field.fields, `${name}.`);
  });
}

function inlineCode(value: string): string {
  return `\`${value.replaceAll('\n', ' ⏎ ').replaceAll('|', '\\|')}\``;
}

function describeConstraint(definition: unknown): string {
  const record = definition as {
    kind?: string;
    values?: readonly string[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
  };
  if (record.kind === 'enum' && record.values !== undefined) {
    return record.values.map((value) => `\`${value}\``).join(', ');
  }
  if (record.kind === 'boolean') return 'true or false';
  if (record.kind === 'integer' || record.kind === 'number') {
    const bounds: string[] = [];
    if (record.minimum !== undefined) bounds.push(`from ${record.minimum}`);
    if (record.maximum !== undefined) bounds.push(`to ${record.maximum}`);
    return `${record.kind}${bounds.length === 0 ? '' : ` ${bounds.join(' ')}`}`;
  }
  if (
    record.kind === 'string' &&
    (record as { pattern?: string }).pattern?.includes('#[0-9a-fA-F]')
  ) {
    return '`#rgb`, `#rrggbb`, `#rrggbbaa` or `transparent`';
  }
  if (record.kind === 'string') {
    const bounds: string[] = [];
    if (record.minLength !== undefined) bounds.push(`min ${record.minLength}`);
    if (record.maxLength !== undefined) bounds.push(`max ${record.maxLength}`);
    return `text${bounds.length === 0 ? '' : ` (${bounds.join(', ')})`}`;
  }
  return record.kind ?? 'value';
}

async function createExampleManifest() {
  const examples = [];
  for (const example of listExamples()) {
    const directory = path.join(projectRoot, 'examples', example.path);
    const files = await recursiveFiles(directory);
    examples.push({
      ...example,
      files: await Promise.all(
        files.map(async (file) => ({
          path: path.relative(directory, file).split(path.sep).join('/'),
          sha256: createHash('sha256')
            .update(await readFile(file))
            .digest('hex'),
        })),
      ),
    });
  }
  const showcaseContract = JSON.parse(
    await readFile(path.join(projectRoot, 'examples/showcase-contract.json'), 'utf8'),
  ) as { readonly requiredShowcaseClasses?: unknown };
  if (
    !Array.isArray(showcaseContract.requiredShowcaseClasses) ||
    !showcaseContract.requiredShowcaseClasses.every((value) => typeof value === 'string')
  ) {
    throw new Error('Showcase contract must declare requiredShowcaseClasses as strings.');
  }
  const coveredClasses = new Set(examples.flatMap((example) => example.classes));
  const missingShowcaseClasses = showcaseContract.requiredShowcaseClasses.filter(
    (value) => !coveredClasses.has(value),
  );
  return {
    contractVersion: getSourceContract().contractVersion,
    showcaseContract: 'showcase-contract.json',
    examples,
    status: missingShowcaseClasses.length === 0 ? 'complete' : 'incomplete',
    missingShowcaseClasses,
  };
}

async function recursiveFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))
      .map(async (entry) => {
        const target = path.join(directory, entry.name);
        return entry.isDirectory() ? await recursiveFiles(target) : [target];
      }),
  );
  return files.flat();
}

async function serialize(value: unknown): Promise<string> {
  return await format(JSON.stringify(value), { ...prettierOptions, parser: 'json' });
}

function resolveOutputRoot(): string {
  const optionIndex = process.argv.indexOf('--output-root');
  if (optionIndex === -1) return projectRoot;
  const candidate = process.argv[optionIndex + 1];
  if (candidate === undefined || candidate.startsWith('--')) {
    throw new Error('--output-root requires a directory path');
  }
  return path.resolve(candidate);
}
