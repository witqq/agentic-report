import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { parse } from '@babel/parser';
import { describe, expect, it } from 'vitest';

import { authoringRegistry } from '../../src/authoring/registry.js';

const referenceRoot = path.resolve('skills/agentic-report/references');
const execFileAsync = promisify(execFile);

function typescriptExample(markdown: string): string {
  const code = /```ts\n([\s\S]*?)\n```/u.exec(markdown)?.[1];
  if (code === undefined) throw new Error('Missing TypeScript consumer example');
  return code;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function nodes(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((node): node is Record<string, unknown> => asRecord(node) !== undefined)
    : [];
}

function sourceStatements(source: string): readonly Record<string, unknown>[] {
  return nodes(
    asRecord(parse(source, { sourceType: 'module', plugins: ['typescript'] }).program)?.body,
  );
}

function identifier(value: unknown): string | undefined {
  const record = asRecord(value);
  return typeof record?.name === 'string'
    ? record.name
    : typeof record?.value === 'string'
      ? record.value
      : undefined;
}

function rowNames(markdown: string, heading: string): string[] {
  const section = markdown.split(`## ${heading}\n`)[1]?.split('\n## ')[0];
  if (section === undefined) throw new Error(`Missing ${heading} table`);
  return [...section.matchAll(/^\|\s*`([^`]+)`\s*\|/gmu)].map((match) => match[1] ?? '');
}

function rootExports(source: string): string[] {
  return sourceStatements(source).flatMap((statement) => {
    if (statement.type !== 'ExportNamedDeclaration') return [];
    return nodes(statement.specifiers).flatMap((specifier) => identifier(specifier.exported) ?? []);
  });
}

function effectExports(source: string): string[] {
  return sourceStatements(source).flatMap((statement) => {
    if (statement.type !== 'ExportNamedDeclaration') return [];
    return identifier(asRecord(statement.declaration)?.id) ?? [];
  });
}

function interfaceMembers(source: string, interfaceName: string, prefix = ''): string[] {
  const declaration = sourceStatements(source)
    .filter((statement) => statement.type === 'ExportNamedDeclaration')
    .map((statement) => asRecord(statement.declaration))
    .find(
      (statement) =>
        statement?.type === 'TSInterfaceDeclaration' && identifier(statement.id) === interfaceName,
    );
  if (declaration === undefined) throw new Error(`Missing ${interfaceName}`);
  const visit = (members: unknown, start: string): string[] =>
    nodes(members).flatMap((member) => {
      const name = identifier(member.key);
      if (name === undefined) return [];
      const fullName = `${start}${name}`;
      const annotation = asRecord(asRecord(member.typeAnnotation)?.typeAnnotation);
      return [
        fullName,
        ...(annotation?.type === 'TSTypeLiteral' ? visit(annotation.members, `${fullName}.`) : []),
      ];
    });
  return [...new Set(visit(asRecord(declaration.body)?.body, prefix))];
}

describe('agent-facing public API guides', () => {
  it('documents exactly the root and effect entry-point exports', async () => {
    const [rootSource, effectSource, nodeGuide, effectGuide] = await Promise.all([
      readFile(path.resolve('src/index.ts'), 'utf8'),
      readFile(path.resolve('src/effect.ts'), 'utf8'),
      readFile(path.join(referenceRoot, 'node-api.md'), 'utf8'),
      readFile(path.join(referenceRoot, 'effect-api.md'), 'utf8'),
    ]);
    expect(rowNames(nodeGuide, 'Public exports').sort()).toEqual(rootExports(rootSource).sort());
    expect(rowNames(effectGuide, 'Public exports').sort()).toEqual(
      effectExports(effectSource).sort(),
    );
  });

  it('documents every public effect context and supporting interface member', async () => {
    const [source, guide] = await Promise.all([
      readFile(path.resolve('src/effect.ts'), 'utf8'),
      readFile(path.join(referenceRoot, 'effect-api.md'), 'utf8'),
    ]);
    expect(rowNames(guide, 'Context members').sort()).toEqual(
      interfaceMembers(source, 'EffectContext').sort(),
    );
    expect(rowNames(guide, 'Canvas members').sort()).toEqual(
      interfaceMembers(source, 'EffectCanvas').sort(),
    );
    const definition = [
      ...interfaceMembers(source, 'EffectDefinition', 'EffectDefinition.'),
      ...interfaceMembers(source, 'EffectController', 'EffectController.'),
    ];
    expect(rowNames(guide, 'Definition and controller members').sort()).toEqual(definition.sort());
    const geometry = [
      ...interfaceMembers(source, 'EffectCanvasOptions', 'EffectCanvasOptions.'),
      ...interfaceMembers(source, 'EffectRect', 'EffectRect.'),
      ...interfaceMembers(source, 'EffectPinned', 'EffectPinned.'),
      ...interfaceMembers(source, 'EffectObstacles', 'EffectObstacles.'),
      ...interfaceMembers(source, 'EffectLayout', 'EffectLayout.'),
    ];
    expect(rowNames(guide, 'Geometry and options members').sort()).toEqual(geometry.sort());
    const layoutRow = guide.split('\n').find((line) => line.startsWith('| `EffectLayout.mode`'));
    for (const layout of authoringRegistry.page.layouts) {
      expect(layoutRow, layout).toContain(`\`${layout}\``);
    }
  });

  it('routes both guides through the skill and the public site', async () => {
    const [skill, routesSource] = await Promise.all([
      readFile(path.resolve('skills/agentic-report/SKILL.md'), 'utf8'),
      readFile(path.resolve('website/routes.json'), 'utf8'),
    ]);
    const routes = JSON.parse(routesSource) as {
      routes: { href: string; source: string; kind: string }[];
    };
    for (const name of ['node-api', 'effect-api']) {
      expect(skill).toContain(`references/${name}.md`);
      expect(routes.routes).toContainEqual(
        expect.objectContaining({
          href: `skills/agentic-report/references/${name}.md`,
          source: `../skills/agentic-report/references/${name}.md`,
          kind: 'copy',
        }),
      );
    }
  });

  it('compiles guide examples against both published package declarations', async () => {
    const temporaryRoot = path.resolve('agent_temp_files_local');
    await mkdir(temporaryRoot, { recursive: true });
    const directory = await mkdtemp(path.join(temporaryRoot, 'skill-api-'));
    try {
      const [nodeGuide, effectGuide] = await Promise.all([
        readFile(path.join(referenceRoot, 'node-api.md'), 'utf8'),
        readFile(path.join(referenceRoot, 'effect-api.md'), 'utf8'),
      ]);
      const nodeExample = path.join(directory, 'node-example.ts');
      const effectExample = path.join(directory, 'effect-example.ts');
      await Promise.all([
        writeFile(nodeExample, typescriptExample(nodeGuide)),
        writeFile(effectExample, typescriptExample(effectGuide)),
      ]);
      try {
        await execFileAsync(process.execPath, [
          path.resolve('node_modules/typescript/bin/tsc'),
          '--noEmit',
          '--ignoreConfig',
          '--strict',
          '--skipLibCheck',
          '--module',
          'nodenext',
          '--moduleResolution',
          'nodenext',
          '--target',
          'ES2022',
          '--types',
          'node',
          nodeExample,
          effectExample,
        ]);
      } catch (error: unknown) {
        const failure = error as { stdout?: string; stderr?: string };
        throw new Error(failure.stderr || failure.stdout || String(error));
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);
});
