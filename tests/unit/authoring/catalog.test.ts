import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { authoringRegistry, type FieldDefinition } from '../../../src/authoring/registry.js';
import { getSourceContract } from '../../../src/discovery.js';

const catalogPath = path.resolve('skills/agentic-report/references/catalog.md');

function fieldPaths(fields: readonly FieldDefinition[], prefix = ''): readonly string[] {
  return fields.flatMap((field) => {
    const name = `${prefix}${field.name}`;
    return [name, ...fieldPaths(field.fields ?? [], `${name}.`)];
  });
}

function section(markdown: string, heading: string, next: string): string {
  const start = markdown.indexOf(heading);
  const end = markdown.indexOf(next, start + heading.length);
  if (start < 0 || end < 0) throw new Error(`Missing catalog section ${heading}`);
  return markdown.slice(start, end);
}

function directiveSection(markdown: string, name: string): string {
  const heading = `### \`${name}\``;
  const start = markdown.indexOf(heading);
  if (start < 0) throw new Error(`Missing directive ${name}`);
  const next = markdown.indexOf('\n### ', start + heading.length);
  const end = next < 0 ? markdown.indexOf('\n## Visualization limits', start) : next;
  if (end < 0) throw new Error(`Unclosed directive ${name}`);
  return markdown.slice(start, end);
}

function tableRow(markdown: string, field: string): string | undefined {
  return markdown.split('\n').find((line) => /^\|\s*`([^`]+)`\s*\|/u.exec(line)?.[1] === field);
}

describe('generated agent authoring catalog', () => {
  it('teaches nested manifest fields and their accepted value constraints', async () => {
    const markdown = await readFile(catalogPath, 'utf8');
    const manifest = section(markdown, '## Frontmatter and manifest fields', '## Directives');
    const paths = fieldPaths(authoringRegistry.manifestFields);
    expect(paths.filter((field) => tableRow(manifest, field) === undefined)).toEqual([]);
    expect(tableRow(manifest, 'localizations.en')).toContain('relative-local-path');
    expect(tableRow(manifest, 'output.format')).toContain('`single-file`, `directory`');
    expect(tableRow(manifest, 'output.maxInlineBytes')).toContain('integer from 1');
    expect(tableRow(manifest, 'extensions')).toContain('1–32 items');
    expect(tableRow(manifest, 'localizations.ru')).toContain(
      'Alternate Russian Markdown entry relative to the primary source root.',
    );
  });

  it('teaches each directive attribute meaning and rejected combinations', async () => {
    const markdown = await readFile(catalogPath, 'utf8');
    const contract = getSourceContract();
    for (const [name, directive] of Object.entries(contract.directives)) {
      const block = directiveSection(markdown, name);
      for (const [attribute, definition] of Object.entries(directive.attributes)) {
        const row = tableRow(block, attribute);
        expect(row, `${name}.${attribute}`).toBeDefined();
        expect(row?.replaceAll('\\|', '|'), `${name}.${attribute}`).toContain(
          definition.description,
        );
      }
      for (const combination of directive.incompatibleCombinations ?? []) {
        expect(block, name).toContain(combination.message);
        expect(block, name).toContain(combination.remediation);
      }
    }
    expect(directiveSection(markdown, 'section')).toContain('Top-level only.');
  });

  it('states authored numeric spelling, precision and string trimming', async () => {
    const markdown = await readFile(catalogPath, 'utf8');
    expect(tableRow(directiveSection(markdown, 'video'), 'start')).toContain(
      'spelling `^\\d{1,4}(?:\\.\\d{1,2})?$`',
    );
    expect(tableRow(directiveSection(markdown, 'spotlight'), 'zoom')).toContain(
      'spelling `^[1-4](?:\\.\\d)?$`',
    );
    expect(tableRow(directiveSection(markdown, 'point'), 'value')).toContain('step 0.0001');
    expect(tableRow(directiveSection(markdown, 'video'), 'caption')).toContain('trimmed');
  });

  it('projects capabilities, theme schema discovery and local video', async () => {
    const markdown = await readFile(catalogPath, 'utf8');
    const contract = getSourceContract();
    expect(contract.source.resources).toContain('local video');
    expect(markdown).toContain('## Capabilities');
    for (const [name, description] of Object.entries(contract.capabilities)) {
      expect(markdown).toContain(`"${name}": "${description}"`);
    }
    expect(contract.commands.schema).toContain('theme JSON Schema');
    expect(markdown).toContain(
      '"schema": "Return manifest, directive, complete source, or theme JSON Schema."',
    );
  });
});
