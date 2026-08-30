import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { parse } from '@babel/parser';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import * as publicApi from '../../src/index.js';
import {
  getAuthoringSchema,
  getExtensionProposalSchema,
  getExtensionProposalTemplate,
  getSourceContract,
  listExamples,
  sourceContract,
  validateExtensionProposal,
} from '../../src/index.js';
import { authoringRegistry } from '../../src/authoring/registry.js';
import { parseReportManifest } from '../../src/authoring/schemas.js';

const execFileAsync = promisify(execFile);
type PublicPageKeys = keyof ReturnType<typeof getSourceContract>['page'];
type ExpectedPublicPageKeys = keyof typeof authoringRegistry.page | 'tokenResolution';
type SameKeys<Left, Right> = [Left] extends [Right]
  ? [Right] extends [Left]
    ? true
    : false
  : false;
const publicPageKeysAreExact: SameKeys<PublicPageKeys, ExpectedPublicPageKeys> = true;

describe('agent discovery contract', () => {
  it('projects all public contract identities and format-derived runtime placement', () => {
    const contract = getSourceContract();
    const demo = contract.directives.demo;
    if (demo === undefined) throw new Error('Missing demo discovery projection');
    expect(Object.keys(contract.directives)).toEqual(
      authoringRegistry.directives.map((directive) => directive.name),
    );
    expect(contract.source).toEqual(authoringRegistry.source);
    expect(contract.outputs).toEqual({
      default: 'single-file',
      formats: ['single-file', 'directory'],
      runtimePlacement: { 'single-file': 'inline', directory: 'external' },
    });
    expect(contract.page).toMatchObject({
      defaultPreset: authoringRegistry.page.defaultPreset,
      presets: authoringRegistry.page.presets,
      defaultLayout: authoringRegistry.page.defaultLayout,
      layouts: authoringRegistry.page.layouts,
      defaultTheme: authoringRegistry.page.defaultTheme,
      themes: authoringRegistry.page.themes,
      defaultScrollProgress: authoringRegistry.page.defaultScrollProgress,
      defaultAttribution: authoringRegistry.page.defaultAttribution,
      motion: authoringRegistry.page.motion,
      tokenResolution: {
        defaultsFrom: 'selected-preset',
        precedence: ['selected-preset', 'explicit-tokens'],
      },
    });
    expect(publicPageKeysAreExact).toBe(true);
    expect(Object.keys(contract.page).sort()).toEqual(
      [...Object.keys(authoringRegistry.page), 'tokenResolution'].sort(),
    );
    expect(contract.page.tokens).toEqual(
      authoringRegistry.page.tokens.map((token) => ({
        ...token,
        defaultVisibility: 'normalization-only',
      })),
    );
    expect(
      contract.page.tokens.every(
        (token) => 'default' in token && token.defaultVisibility === 'normalization-only',
      ),
    ).toBe(true);
    expect(contract.capabilities).toEqual(
      Object.fromEntries(
        authoringRegistry.capabilities.map((capability) => [capability.id, capability.description]),
      ),
    );
    expect(contract.commands.init).toBe(contract.capabilities.init);
    expect(demo.runtime).toBe('package-owned-counter');
    expect(demo).not.toHaveProperty('fallback');
  });

  it('keeps discovered token defaults conditional on the selected preset', () => {
    const contract = getSourceContract();
    const expectedByPreset = Object.fromEntries(
      contract.page.presets.map((preset) => [preset.name, preset.tokens]),
    );

    for (const preset of ['editorial', 'signal'] as const) {
      const discoveredDefaults = Object.fromEntries(
        contract.page.tokens.flatMap((token) => {
          const candidate = token as unknown as Readonly<Record<string, unknown>>;
          return candidate.defaultVisibility === 'published' && 'default' in candidate
            ? [[token.name, candidate.default]]
            : [];
        }),
      );
      const materialized =
        Object.keys(discoveredDefaults).length === 0
          ? { preset }
          : { preset, tokens: discoveredDefaults };

      expect(parseReportManifest(materialized).tokens).toEqual(expectedByPreset[preset]);
      expect(
        parseReportManifest({ ...materialized, tokens: { ...discoveredDefaults, radius: 'round' } })
          .tokens,
      ).toEqual({ ...expectedByPreset[preset], radius: 'round' });
    }
  });

  it('returns defensive deterministic schema, contract and example values', () => {
    for (const scope of ['manifest', 'directives', 'source'] as const) {
      const first = getAuthoringSchema(scope);
      const second = getAuthoringSchema(scope);
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
      expect(first.$id).toBe(authoringRegistry.contract.schemaIds[scope]);
      (first as Record<string, unknown>).mutated = true;
      expect(getAuthoringSchema(scope)).not.toHaveProperty('mutated');
    }
    const firstContract = getSourceContract() as unknown as Record<string, unknown>;
    firstContract.mutated = true;
    expect(getSourceContract()).not.toHaveProperty('mutated');
    const mutableNestedContract = getSourceContract();
    (mutableNestedContract.commands as Record<string, string>).build = 'poison';
    (mutableNestedContract.capabilities as Record<string, string>).init = 'poison';
    (mutableNestedContract.page.layouts as unknown as string[])[0] = 'poison';
    expect(getSourceContract().commands.build).toBe(
      'Compile a source into a default or share-safe static artifact.',
    );
    expect(getSourceContract().commands.init).toBe(
      'Initialize a packaged declarative starter without overwriting user content.',
    );
    expect(getSourceContract().capabilities.init).toBe(
      'Initialize a packaged declarative starter without overwriting user content.',
    );
    expect(getSourceContract().page.layouts[0]).toBe('document');
    expect(Object.isFrozen(sourceContract)).toBe(true);
    expect(Object.isFrozen(sourceContract.commands)).toBe(true);
    expect(Object.isFrozen(sourceContract.capabilities)).toBe(true);
    expect(Object.isFrozen(sourceContract.page.tokens)).toBe(true);
    expect(Object.isFrozen(sourceContract.directives.demo)).toBe(true);
    expect(() => {
      (sourceContract.commands as Record<string, string>).build = 'poison';
    }).toThrow(TypeError);
    expect(getSourceContract().commands.build).toBe(
      'Compile a source into a default or share-safe static artifact.',
    );
    expect(authoringRegistry.source.entry).toBe(
      'Markdown file or directory containing report.md/index.md',
    );
    expect(listExamples()).toEqual(authoringRegistry.examples);
    expect(listExamples()[0]).toMatchObject({
      id: 'basic',
      path: 'basic',
      entry: 'report.md',
      starter: { default: true, aliases: ['report'] },
    });
  });

  it('keeps generated projections byte-equal to pure API values', async () => {
    for (const scope of ['manifest', 'directives', 'source'] as const) {
      const generated = JSON.parse(
        await readFile(
          new URL(`../../docs/generated/${scope}.schema.json`, import.meta.url),
          'utf8',
        ),
      ) as unknown;
      expect(generated).toEqual(getAuthoringSchema(scope));
    }
    expect(
      JSON.parse(
        await readFile(
          new URL('../../docs/generated/source-contract.json', import.meta.url),
          'utf8',
        ),
      ),
    ).toEqual(getSourceContract());
    const manifest = JSON.parse(
      await readFile(new URL('../../examples/manifest.json', import.meta.url), 'utf8'),
    ) as {
      readonly examples: readonly {
        readonly path: string;
        readonly files: readonly { readonly path: string; readonly sha256: string }[];
      }[];
    };
    expect(manifest.examples).toHaveLength(listExamples().length);
    const expectedExample = listExamples()[0];
    if (expectedExample === undefined) throw new Error('Missing basic example projection');
    expect(manifest.examples[0]).toMatchObject(expectedExample);
    for (const example of manifest.examples) {
      for (const file of example.files) {
        const bytes = await readFile(path.resolve('examples', example.path, file.path));
        expect(file.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      }
    }
  });

  it('generates deterministically and detects a stale disposable projection', async () => {
    const script = path.resolve('scripts/generate-authoring.ts');
    const maintainedContractPath = path.resolve('docs/generated/source-contract.json');
    const maintainedContract = await readFile(maintainedContractPath, 'utf8');
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-report-projections-'));
    try {
      for (const relativePath of generatedProjectionPaths) {
        const target = path.join(outputRoot, relativePath);
        await mkdir(path.dirname(target), { recursive: true });
        await cp(path.resolve(relativePath), target);
      }
      const arguments_ = [
        '--experimental-strip-types',
        script,
        '--check',
        '--output-root',
        outputRoot,
      ];
      await expect(execFileAsync(process.execPath, arguments_)).resolves.toMatchObject({
        stdout: expect.stringContaining('Checked 9 authoring projections.'),
      });
      const target = path.join(outputRoot, 'docs/generated/source-contract.json');
      const original = await readFile(target, 'utf8');
      await writeFile(target, `${original.trimEnd()} \n`);
      await expect(execFileAsync(process.execPath, arguments_)).rejects.toThrow(
        /source-contract\.json/u,
      );
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
    await expect(readFile(maintainedContractPath, 'utf8')).resolves.toBe(maintainedContract);
  });

  it('rejects incomplete or unsafe extension proposals and accepts a complete bounded record', () => {
    const schema = getExtensionProposalSchema();
    const template = {
      ...getExtensionProposalTemplate(),
      id: 'bounded-extension',
      summary: 'A bounded declarative extension with complete evidence.',
    };
    const ajvValidate = new Ajv2020({ strict: true, allErrors: true, ownProperties: true }).compile(
      schema,
    );
    expect(validateExtensionProposal(template)).toEqual({ accepted: true, issues: [] });
    expect(ajvValidate(template)).toBe(true);
    expect(validateExtensionProposal({ ...template, evidence: {} })).toMatchObject({
      accepted: false,
      issues: expect.arrayContaining([expect.stringContaining('sourceGrammar')]),
    });
    expect(ajvValidate({ ...template, evidence: {} })).toBe(false);
    expect(validateExtensionProposal({ ...template, plugin: 'dynamic-import' })).toMatchObject({
      accepted: false,
      issues: expect.arrayContaining(['proposal.plugin is not allowed']),
    });
    expect(ajvValidate({ ...template, plugin: 'dynamic-import' })).toBe(false);

    for (const [key, unsafeValue] of Object.entries({
      authorCode: 'allowed',
      callbacks: 'allowed',
      eval: 'allowed',
      dynamicImports: 'allowed',
      networkAccess: 'allowed',
      confinement: 'unrestricted',
      offline: 'optional',
      deterministicSerialization: 'optional',
      cspCompatible: 'optional',
      packageOwnedRuntime: 'optional',
    })) {
      const unsafe = {
        ...template,
        trustBoundary: { ...template.trustBoundary, [key]: unsafeValue },
      };
      expect(validateExtensionProposal(unsafe).accepted, key).toBe(false);
      expect(ajvValidate(unsafe), key).toBe(false);
    }

    const missingRuntimeBoundary = {
      ...template,
      trustBoundary: Object.fromEntries(
        Object.entries(template.trustBoundary).filter(([key]) => key !== 'packageOwnedRuntime'),
      ),
    };
    expect(validateExtensionProposal(missingRuntimeBoundary)).toMatchObject({
      accepted: false,
      issues: expect.arrayContaining(['trustBoundary.packageOwnedRuntime is required']),
    });
    expect(ajvValidate(missingRuntimeBoundary)).toBe(false);

    for (const evidence of [
      { ...template.evidence, cspAndRuntime: 'too short' },
      Object.fromEntries(
        Object.entries(template.evidence).filter(([key]) => key !== 'cspAndRuntime'),
      ),
    ]) {
      const unsafe = { ...template, evidence };
      expect(validateExtensionProposal(unsafe)).toMatchObject({
        accepted: false,
        issues: expect.arrayContaining([
          'evidence.cspAndRuntime must contain at least 20 characters',
        ]),
      });
      expect(ajvValidate(unsafe)).toBe(false);
    }

    for (const [summary, accepted] of [
      ['  12345678901234567890  ', true],
      [' '.repeat(20), false],
      ['😀'.repeat(10), false],
      ['😀'.repeat(20), true],
    ] as const) {
      expect(validateExtensionProposal({ ...template, summary }).accepted).toBe(accepted);
      expect(ajvValidate({ ...template, summary })).toBe(accepted);
    }

    for (const inherited of [
      Object.create(template) as unknown,
      { ...template, trustBoundary: Object.create(template.trustBoundary) as unknown },
      { ...template, evidence: Object.create(template.evidence) as unknown },
    ]) {
      expect(validateExtensionProposal(inherited).accepted).toBe(false);
      expect(ajvValidate(inherited)).toBe(false);
      expect(validateExtensionProposal(JSON.parse(JSON.stringify(inherited))).accepted).toBe(false);
    }
    const roundTrip = JSON.parse(JSON.stringify(template)) as unknown;
    expect(validateExtensionProposal(roundTrip)).toEqual({ accepted: true, issues: [] });
    expect(ajvValidate(roundTrip)).toBe(true);
  });

  it('keeps the generated extension schema and complete template executable', async () => {
    const generatedSchema = JSON.parse(
      await readFile(
        new URL('../../docs/generated/extension-proposal.schema.json', import.meta.url),
        'utf8',
      ),
    ) as Record<string, unknown>;
    const generatedTemplate = JSON.parse(
      await readFile(
        new URL('../../docs/generated/extension-proposal.template.json', import.meta.url),
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(generatedSchema).toEqual(getExtensionProposalSchema());
    const ajvValidate = new Ajv2020({ strict: true, allErrors: true, ownProperties: true }).compile(
      generatedSchema,
    );
    expect(validateExtensionProposal(generatedTemplate)).toEqual({ accepted: true, issues: [] });
    expect(ajvValidate(generatedTemplate)).toBe(true);

    const incomplete = { ...generatedTemplate, evidence: {} };
    expect(validateExtensionProposal(incomplete).accepted).toBe(false);
    expect(ajvValidate(incomplete)).toBe(false);
  });

  it('keeps the root API and product source free of public executable extension surfaces', async () => {
    const indexSource = await readFile(new URL('../../src/index.ts', import.meta.url), 'utf8');
    const productSources = await readTypeScriptSources(path.resolve('src'));
    expect(indexSource).not.toMatch(/Zod|ReportManifestSchema|ReportManifestInputSchema/u);
    const expectedExports = [
      'AgenticReportError',
      'EXTENSION_PROPOSAL_CONTRACT_VERSION',
      'REVIEW_CONTRACT_VERSION',
      'buildReport',
      'getAuthoringSchema',
      'getExtensionProposalSchema',
      'getExtensionProposalTemplate',
      'getSourceContract',
      'initProject',
      'inspectReport',
      'inspectReview',
      'listExamples',
      'parseReviewArtifact',
      'parseReviewTargetManifest',
      'serializeReviewArtifact',
      'sourceContract',
      'validateExtensionProposal',
      'validateReport',
    ];
    expect(publicExportIssues(Object.keys(publicApi), expectedExports)).toEqual([]);
    expect(
      publicExportIssues([...Object.keys(publicApi), 'registerPlugin'], expectedExports),
    ).toEqual(['unexpected public value export: registerPlugin']);
    const rootDeclarationPath = path.resolve('dist/node/index.d.ts');
    const rootDeclaration = await readFile(rootDeclarationPath, 'utf8');
    const expectedDeclarationInventory = {
      types: [
        'BuildReportOptions',
        'BuildReportResult',
        'Diagnostic',
        'DirectiveName',
        'ExampleContract',
        'ExtensionProposal',
        'ExtensionProposalValidation',
        'ExtensionTrustBoundary',
        'InitProjectOptions',
        'InitProjectResult',
        'InspectReportOptions',
        'InspectReportResult',
        'InspectReviewOptions',
        'InspectReviewResult',
        'OutputFormat',
        'ReportManifest',
        'ReportManifestInput',
        'ReviewArtifact',
        'ReviewBinding',
        'ReviewMessage',
        'ReviewTargetManifest',
        'ReviewTargetReference',
        'ReviewThread',
        'ReviewThreadSegment',
        'SchemaScope',
        'SourceContract',
        'ValidateReportOptions',
        'ValidateReportResult',
      ],
      values: expectedExports,
    };
    expect(inspectRootDeclaration(rootDeclaration, expectedDeclarationInventory)).toEqual({
      ...expectedDeclarationInventory,
      issues: [],
    });
    for (const unsupported of [
      `export type * from './extension-plugin.js';`,
      `export * from './extension-plugin.js';`,
      `export * as extensions from './extension-plugin.js';`,
      `export default interface Plugin { handler(): void }`,
      `export { Plugin as Extension } from './extension-plugin.js';`,
    ]) {
      expect(
        inspectRootDeclaration(`${rootDeclaration}\n${unsupported}`, expectedDeclarationInventory)
          .issues,
        unsupported,
      ).not.toEqual([]);
    }
    const publicDeclarations = await readReachableDeclarations(rootDeclarationPath);
    expect(callbackDeclarationIssues(publicDeclarations)).toEqual([]);
    expect(callbackDeclarationIssues(['export interface Plugin { handler(): void }'])).toEqual([
      'forbidden public plugin/callback declaration',
    ]);
    for (const unsafeDeclaration of [
      'export interface SourceContract { execute(input: string): void }',
      'export interface SourceContract { "execute"(input: string): void }',
      'export interface SourceContract { 0(input: string): void }',
      'export interface ExtensionPoint { run(): void }',
      'export interface ExtensionPoint { run?<Value>(input: Value): void }',
      'export interface CallableContract { (input: string): void }',
      'export type ExtensionPoint = { run: () => void }',
      'export type ExtensionPoint = Base & { nested: { execute: () => void } }',
      `import type { ExternalHandler } from 'external-package';
       export interface SourceContract { execute: ExternalHandler }`,
      `import type * as External from 'external-package';
       export interface SourceContract { execute: External.Handler }`,
      `export interface SourceContract {
         execute: import('external-package').Handler;
       }`,
      `import type * as External from 'external-package';
       export interface SourceContract extends External.Handler {}`,
    ]) {
      expect(callbackDeclarationIssues([unsafeDeclaration]), unsafeDeclaration).toEqual([
        'forbidden public plugin/callback declaration',
      ]);
    }
    expect(
      callbackDeclarationIssues([
        `export interface LiteralData { "execute": string; 0: number }
         export declare class IntentionalError { constructor(message: string); }`,
        `declare namespace Local { interface Data { readonly value: string } }
         export interface SourceContract { readonly data: Local.Data }`,
      ]),
    ).toEqual([]);
    expect(executableSourceIssues(productSources)).toEqual([]);
    for (const unsafe of [
      'eval /* gap */ (code)',
      'eval?.(code)',
      '(0, eval)(code)',
      'globalThis.eval(code)',
      'window.eval(code)',
      'self.eval(code)',
      'global.eval(code)',
      "globalThis['eval'](code)",
      "window['eval'](code)",
      "self?.['eval'](code)",
      '(globalThis).eval(code)',
      'Function(code)()',
      'new Function(code)()',
      'globalThis.Function(code)()',
      'self.Function(code)()',
      "globalThis['Function'](code)()",
      'import /* gap */ (id)',
      `\`prefix ${'${'}eval(code)} suffix\``,
      `\`prefix ${'${'}Function(code)()} suffix\``,
      `\`prefix ${'${'}import(id)} suffix\``,
      'const execute = eval; execute(code)',
      'const construct = Function; construct(code)()',
      'const { eval: execute } = globalThis; execute(code)',
      'const { Function: construct } = window; construct(code)()',
      'const { "eval": execute } = globalThis; execute(code)',
      'const { ["Function"]: construct } = window; construct(code)()',
      'const root = globalThis; root.eval(code)',
      'const root = (globalThis); root.eval(code)',
      'const first = window; const second = first; second.Function(code)()',
      '(eval as unknown as (value: string) => unknown)(code)',
      '(globalThis as typeof globalThis).eval(code)',
      'globalThis!.Function(code)()',
      'globalThis[`eval`](code)',
      'const { [`Function`]: construct } = globalThis; construct(code)()',
      'let root = ordinary; root = globalThis; root.eval(code)',
      'let root = ordinary; { root = globalThis; } root.eval(code)',
      'let execute; ({ "eval": execute } = globalThis); execute(code)',
      'let root = globalThis; function reset() { root = ordinary; } root.eval(code)',
      'let root = globalThis; if (condition) root = ordinary; root.eval(code)',
      'let root; function execute() { root.eval(code); } root = globalThis; execute()',
      'function execute() { root.eval(code); } let root = globalThis; execute()',
      `let first, second;
       function execute() { second.eval(code); }
       first = globalThis;
       second = first;
       execute();`,
      `let first, second;
       function execute() { second(code); }
       ({ eval: first } = globalThis);
       [second] = [first];
       execute();`,
      'const root = condition ? globalThis : ordinary; root.eval(code)',
      'let root; root = condition ? ordinary : globalThis; root.eval(code)',
      'let root = globalThis; for (; condition; root = ordinary) { root.eval(code); }',
      'let root = globalThis; do { root.eval(code); } while ((root = ordinary, false));',
      `let root = ordinary;
       do { root.eval('safe'); } while ((root = globalThis, condition));`,
      `for (const root of [globalThis]) { root.eval(code); }`,
      `const [root] = [globalThis]; root.eval(code);`,
      `const { value: root } = { value: globalThis }; root.eval(code);`,
      `let root; [root] = [globalThis]; root.eval(code);`,
      `let root; ({ value: root } = { value: globalThis }); root.eval(code);`,
      `const roots = [globalThis]; for (const root of roots) { root.eval(code); }`,
      `let root = globalThis;
       switch (choice) {
         case 0: root = ordinary; break;
         case 1: root.eval(code); break;
       }`,
      `let root = globalThis;
       try { risky(); root = ordinary; }
       catch { root.eval(code); }`,
      `let root = ordinary;
       switch (choice) {
         case 0: root = globalThis;
         case 1: root.eval(code); break;
       }`,
      `let root = ordinary;
       try { root = globalThis; risky(); }
       catch { root.eval(code); }`,
      '(globalThis satisfies typeof globalThis).eval(code)',
    ]) {
      expect(executableSourceIssues([unsafe]), unsafe).not.toEqual([]);
    }
    expect(
      executableSourceIssues([
        `const text = ${JSON.stringify('eval(code) and import(id)')}; // new Function(code)`,
        '`raw eval(code) and import(id) text`',
        String.raw`const expression = /eval\(|import\(/u;`,
        `const ordinary = { eval: (value: string) => value, Function: 'value' };
         ordinary.eval('safe');
         const { eval: execute } = ordinary;
         execute('safe');`,
        `function inspect(window: { eval(value: string): string }) {
           return window.eval('safe');
         }
         const ordinaryObject = { Function: 'safe' };
         const { Function } = ordinaryObject;
         console.log(Function);
         function inspectGlobal(globalThis: { eval(value: string): string }) {
           return globalThis.eval('safe');
         }
         const templateObject = { [\`eval\`]: (value: string) => value };
         templateObject[\`eval\`]('safe');
         let local = globalThis;
         local = ordinary;
         local.eval('safe');
         let captured = ordinary;
         function inspectCaptured() { captured.eval('safe'); }
         inspectCaptured();
         let initialized = globalThis;
         for (initialized = ordinary; condition;) {}
         initialized.eval('safe');
         let tested = globalThis;
         while ((tested = ordinary, condition)) {}
         tested.eval('safe');
         let outer = ordinary;
         { let outer = globalThis; console.log(outer); }
         function inspectOuter() { outer.eval('safe'); }
         inspectOuter();
         const [ordinaryElement] = [ordinary];
         ordinaryElement.eval('safe');
         const { value: ordinaryProperty } = { value: ordinary };
         ordinaryProperty.eval('safe');
         const mixed = [ordinary, globalThis];
         const [safeMixed] = mixed;
         safeMixed.eval('safe');
         let broken = ordinary;
         switch (choice) {
           case 0: broken = globalThis; break;
           case 1: broken.eval('safe'); break;
         }
         let completed = globalThis;
         try { completed = ordinary; } finally { observe(); }
         completed.eval('safe');`,
      ]),
    ).toEqual([]);
  });
});

const generatedProjectionPaths = [
  'docs/generated/manifest.schema.json',
  'docs/generated/directives.schema.json',
  'docs/generated/source.schema.json',
  'docs/generated/source-contract.json',
  'docs/generated/extension-proposal.schema.json',
  'docs/generated/extension-proposal.template.json',
  'examples/manifest.json',
  'tests/fixtures/authoring/registry-contract.json',
  'tests/fixtures/authoring/schema-projections.json',
] as const;

async function readTypeScriptSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const values = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return await readTypeScriptSources(target);
      return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')
        ? [await readFile(target, 'utf8')]
        : [];
    }),
  );
  return values.flat();
}

function publicExportIssues(actual: readonly string[], expected: readonly string[]): string[] {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return [
    ...actual
      .filter((name) => !expectedSet.has(name))
      .sort()
      .map((name) => `unexpected public value export: ${name}`),
    ...expected
      .filter((name) => !actualSet.has(name))
      .sort()
      .map((name) => `missing public value export: ${name}`),
  ];
}

function executableSourceIssues(sources: readonly string[]): string[] {
  const issues: string[] = [];
  for (const source of sources) {
    analyzeExecutableNode(parseTypeScript(source, false), createExecutionScope(null), issues);
  }
  return [...new Set(issues)];
}

interface AstNode {
  readonly type: string;
  readonly [key: string]: unknown;
}

function parseTypeScript(source: string, declaration: boolean): AstNode {
  const result = parse(source, {
    sourceType: 'module',
    createParenthesizedExpressions: true,
    plugins: [['typescript', { dts: declaration }], 'jsx'],
  });
  return result.program as unknown as AstNode;
}

function asAstNode(value: unknown): AstNode | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const type = Reflect.get(value, 'type');
  return typeof type === 'string' ? (value as AstNode) : undefined;
}

function astChildren(node: AstNode): AstNode[] {
  const children: AstNode[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'extra', 'errors', 'comments', 'tokens'].includes(key)) continue;
    const child = asAstNode(value);
    if (child !== undefined) children.push(child);
    else if (Array.isArray(value)) {
      for (const entry of value) {
        const arrayChild = asAstNode(entry);
        if (arrayChild !== undefined) children.push(arrayChild);
      }
    }
  }
  return children;
}

type BindingKind =
  | 'global-object'
  | 'maybe-global-object'
  | 'forbidden-function'
  | 'maybe-forbidden-function'
  | 'ordinary';

interface ExecutionScope {
  readonly parent: ExecutionScope | null;
  readonly bindings: Map<string, BindingKind>;
  readonly potentialBindings: Map<string, BindingKind>;
  readonly structuredBindings: Map<string, StructuredValue>;
  readonly potentialStructuredBindings: Map<string, StructuredValue>;
}

interface StructuredValue {
  readonly kind: BindingKind;
  readonly properties?: ReadonlyMap<string, StructuredValue>;
  readonly elements?: readonly StructuredValue[];
}

function createExecutionScope(parent: ExecutionScope | null): ExecutionScope {
  return {
    parent,
    bindings: new Map(),
    potentialBindings: new Map(),
    structuredBindings: new Map(),
    potentialStructuredBindings: new Map(),
  };
}

function snapshotExecutionScope(scope: ExecutionScope): ExecutionScope {
  const snapshot = createExecutionScope(null);
  const chain: ExecutionScope[] = [];
  for (let current: ExecutionScope | null = scope; current !== null; current = current.parent) {
    chain.unshift(current);
  }
  for (const current of chain) {
    for (const [name, kind] of current.bindings) snapshot.bindings.set(name, kind);
    for (const [name, value] of current.structuredBindings) {
      snapshot.structuredBindings.set(name, value);
    }
    for (const [name, value] of current.potentialStructuredBindings) {
      snapshot.potentialStructuredBindings.set(name, value);
    }
    for (const [name, kind] of current.potentialBindings) {
      snapshot.potentialBindings.set(name, kind);
    }
  }
  return snapshot;
}

function snapshotForClosure(scope: ExecutionScope): ExecutionScope {
  const snapshot = snapshotExecutionScope(scope);
  for (const [name, potential] of snapshot.potentialBindings) {
    const current = snapshot.bindings.get(name) ?? 'ordinary';
    snapshot.bindings.set(name, mergeBindingKinds(current, potential));
    const currentValue = snapshot.structuredBindings.get(name) ?? scalarValue(current);
    const potentialValue = snapshot.potentialStructuredBindings.get(name) ?? scalarValue(potential);
    snapshot.structuredBindings.set(name, mergeStructuredValues(currentValue, potentialValue));
  }
  return snapshot;
}

function mergeBindingKinds(left: BindingKind, right: BindingKind): BindingKind {
  if (left === right) return left;
  if (
    left === 'forbidden-function' ||
    left === 'maybe-forbidden-function' ||
    right === 'forbidden-function' ||
    right === 'maybe-forbidden-function'
  ) {
    return 'maybe-forbidden-function';
  }
  if (
    left === 'global-object' ||
    left === 'maybe-global-object' ||
    right === 'global-object' ||
    right === 'maybe-global-object'
  ) {
    return 'maybe-global-object';
  }
  return 'ordinary';
}

function assignVisibleBinding(scope: ExecutionScope, name: string, kind: BindingKind): void {
  for (let current: ExecutionScope | null = scope; current !== null; current = current.parent) {
    if (current.bindings.has(name)) {
      current.bindings.set(name, kind);
      return;
    }
  }
  scope.bindings.set(name, kind);
}

function mergeExecutionScopes(
  target: ExecutionScope,
  left: ExecutionScope,
  right: ExecutionScope,
): void {
  const names = new Set([...left.bindings.keys(), ...right.bindings.keys()]);
  for (const name of names) {
    const leftKind = left.bindings.get(name) ?? 'ordinary';
    const rightKind = right.bindings.get(name) ?? 'ordinary';
    assignVisibleBinding(target, name, mergeBindingKinds(leftKind, rightKind));
    const leftValue = left.structuredBindings.get(name);
    const rightValue = right.structuredBindings.get(name);
    if (leftValue !== undefined && rightValue !== undefined) {
      target.structuredBindings.set(name, mergeStructuredValues(leftValue, rightValue));
    } else {
      target.structuredBindings.delete(name);
    }
  }
}

function executionScopeSignature(scope: ExecutionScope): string {
  return JSON.stringify([
    [...scope.bindings.entries()].sort(([left], [right]) => left.localeCompare(right)),
    [...scope.structuredBindings.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => [name, serializeStructuredValue(value)]),
  ]);
}

function analyzeLoopFixedPoint(
  entry: ExecutionScope,
  analyzeIteration: (iteration: ExecutionScope) => void,
): ExecutionScope {
  let reached = snapshotExecutionScope(entry);
  while (true) {
    const iteration = snapshotExecutionScope(reached);
    analyzeIteration(iteration);
    const next = snapshotExecutionScope(reached);
    mergeExecutionScopes(next, reached, iteration);
    if (executionScopeSignature(next) === executionScopeSignature(reached)) return next;
    reached = next;
  }
}

function resolveBinding(scope: ExecutionScope, name: string): BindingKind {
  for (let current: ExecutionScope | null = scope; current !== null; current = current.parent) {
    const binding = current.bindings.get(name);
    if (binding !== undefined) return binding;
  }
  if (['globalThis', 'window', 'self', 'global'].includes(name)) return 'global-object';
  if (name === 'eval' || name === 'Function') return 'forbidden-function';
  return 'ordinary';
}

function identifierName(node: AstNode | undefined): string | undefined {
  return node?.type === 'Identifier' && typeof node.name === 'string' ? node.name : undefined;
}

function unwrapExpression(node: AstNode | undefined): AstNode | undefined {
  if (node === undefined) return undefined;
  if (
    [
      'ParenthesizedExpression',
      'TSAsExpression',
      'TSTypeAssertion',
      'TSNonNullExpression',
      'TSSatisfiesExpression',
      'TSInstantiationExpression',
    ].includes(node.type)
  ) {
    return unwrapExpression(asAstNode(node.expression));
  }
  return node;
}

function staticPropertyName(node: AstNode | undefined): string | undefined {
  if (node === undefined) return undefined;
  if (node.type === 'Identifier' && typeof node.name === 'string') return node.name;
  if (node.type === 'StringLiteral' && typeof node.value === 'string') return node.value;
  if (node.type === 'NumericLiteral' && typeof node.value === 'number') return String(node.value);
  if (
    node.type === 'TemplateLiteral' &&
    Array.isArray(node.expressions) &&
    node.expressions.length === 0 &&
    Array.isArray(node.quasis) &&
    node.quasis.length === 1
  ) {
    const value = asAstNode(node.quasis[0])?.value;
    if (typeof value === 'object' && value !== null) {
      const cooked = Reflect.get(value, 'cooked');
      return typeof cooked === 'string' ? cooked : undefined;
    }
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = staticPropertyName(asAstNode(node.left));
    const right = staticPropertyName(asAstNode(node.right));
    return left === undefined || right === undefined ? undefined : `${left}${right}`;
  }
  return undefined;
}

function scalarValue(kind: BindingKind): StructuredValue {
  return { kind };
}

function serializeStructuredValue(value: StructuredValue): unknown {
  return {
    kind: value.kind,
    properties:
      value.properties === undefined
        ? undefined
        : [...value.properties.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([name, child]) => [name, serializeStructuredValue(child)]),
    elements: value.elements?.map(serializeStructuredValue),
  };
}

function mergeStructuredValues(left: StructuredValue, right: StructuredValue): StructuredValue {
  const properties = new Map<string, StructuredValue>();
  if (left.properties !== undefined && right.properties !== undefined) {
    for (const name of new Set([...left.properties.keys(), ...right.properties.keys()])) {
      const leftValue = left.properties.get(name) ?? scalarValue('ordinary');
      const rightValue = right.properties.get(name) ?? scalarValue('ordinary');
      properties.set(name, mergeStructuredValues(leftValue, rightValue));
    }
  }
  const elements =
    left.elements !== undefined && right.elements !== undefined
      ? Array.from({ length: Math.max(left.elements.length, right.elements.length) }, (_, index) =>
          mergeStructuredValues(
            left.elements?.[index] ?? scalarValue('ordinary'),
            right.elements?.[index] ?? scalarValue('ordinary'),
          ),
        )
      : undefined;
  return {
    kind: mergeBindingKinds(left.kind, right.kind),
    ...(properties.size === 0 ? {} : { properties }),
    ...(elements === undefined ? {} : { elements }),
  };
}

function resolveStructuredBinding(
  scope: ExecutionScope,
  name: string,
): StructuredValue | undefined {
  for (let current: ExecutionScope | null = scope; current !== null; current = current.parent) {
    if (current.bindings.has(name)) {
      return (
        current.structuredBindings.get(name) ??
        scalarValue(current.bindings.get(name) ?? 'ordinary')
      );
    }
  }
  return undefined;
}

function resolveStructuredExpression(
  node: AstNode | undefined,
  scope: ExecutionScope,
): StructuredValue {
  const expression = unwrapExpression(node);
  if (expression === undefined) return scalarValue('ordinary');
  const name = identifierName(expression);
  if (name !== undefined) {
    return resolveStructuredBinding(scope, name) ?? scalarValue(resolveBinding(scope, name));
  }
  if (expression.type === 'SequenceExpression' && Array.isArray(expression.expressions)) {
    return resolveStructuredExpression(asAstNode(expression.expressions.at(-1)), scope);
  }
  if (expression.type === 'ConditionalExpression' || expression.type === 'LogicalExpression') {
    return mergeStructuredValues(
      resolveStructuredExpression(asAstNode(expression.consequent ?? expression.left), scope),
      resolveStructuredExpression(asAstNode(expression.alternate ?? expression.right), scope),
    );
  }
  if (expression.type === 'ArrayExpression' && Array.isArray(expression.elements)) {
    return {
      kind: 'ordinary',
      elements: expression.elements.map((element) =>
        resolveStructuredExpression(asAstNode(element), scope),
      ),
    };
  }
  if (expression.type === 'ObjectExpression' && Array.isArray(expression.properties)) {
    const properties = new Map<string, StructuredValue>();
    for (const value of expression.properties) {
      const property = asAstNode(value);
      if (property?.type !== 'ObjectProperty') continue;
      const key = staticPropertyName(asAstNode(property.key));
      if (key !== undefined) {
        properties.set(key, resolveStructuredExpression(asAstNode(property.value), scope));
      }
    }
    return { kind: 'ordinary', properties };
  }
  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    const objectValue = resolveStructuredExpression(asAstNode(expression.object), scope);
    const property = staticPropertyName(asAstNode(expression.property));
    const precise = property === undefined ? undefined : objectValue.properties?.get(property);
    if (precise !== undefined) return precise;
    return scalarValue(
      (objectValue.kind === 'global-object' || objectValue.kind === 'maybe-global-object') &&
        (property === 'eval' || property === 'Function')
        ? 'forbidden-function'
        : 'ordinary',
    );
  }
  return scalarValue('ordinary');
}

function resolveExpression(node: AstNode | undefined, scope: ExecutionScope): BindingKind {
  return resolveStructuredExpression(node, scope).kind;
}

function resolvePotentialStructuredExpression(
  node: AstNode | undefined,
  scope: ExecutionScope,
): StructuredValue {
  const expression = unwrapExpression(node);
  if (expression === undefined) return scalarValue('ordinary');
  const name = identifierName(expression);
  if (name !== undefined) {
    for (let current: ExecutionScope | null = scope; current !== null; current = current.parent) {
      if (!current.bindings.has(name)) continue;
      return mergeStructuredValues(
        current.structuredBindings.get(name) ??
          scalarValue(current.bindings.get(name) ?? 'ordinary'),
        current.potentialStructuredBindings.get(name) ??
          scalarValue(current.potentialBindings.get(name) ?? 'ordinary'),
      );
    }
    return scalarValue(resolveBinding(scope, name));
  }
  if (expression.type === 'SequenceExpression' && Array.isArray(expression.expressions)) {
    return resolvePotentialStructuredExpression(asAstNode(expression.expressions.at(-1)), scope);
  }
  if (expression.type === 'ConditionalExpression' || expression.type === 'LogicalExpression') {
    return mergeStructuredValues(
      resolvePotentialStructuredExpression(
        asAstNode(expression.consequent ?? expression.left),
        scope,
      ),
      resolvePotentialStructuredExpression(
        asAstNode(expression.alternate ?? expression.right),
        scope,
      ),
    );
  }
  if (expression.type === 'ArrayExpression' && Array.isArray(expression.elements)) {
    return {
      kind: 'ordinary',
      elements: expression.elements.map((element) =>
        resolvePotentialStructuredExpression(asAstNode(element), scope),
      ),
    };
  }
  if (expression.type === 'ObjectExpression' && Array.isArray(expression.properties)) {
    const properties = new Map<string, StructuredValue>();
    for (const value of expression.properties) {
      const property = asAstNode(value);
      if (property?.type !== 'ObjectProperty') continue;
      const key = staticPropertyName(asAstNode(property.key));
      if (key !== undefined) {
        properties.set(key, resolvePotentialStructuredExpression(asAstNode(property.value), scope));
      }
    }
    return { kind: 'ordinary', properties };
  }
  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    const objectValue = resolvePotentialStructuredExpression(asAstNode(expression.object), scope);
    const property = staticPropertyName(asAstNode(expression.property));
    const precise = property === undefined ? undefined : objectValue.properties?.get(property);
    if (precise !== undefined) return precise;
    return scalarValue(
      (objectValue.kind === 'global-object' || objectValue.kind === 'maybe-global-object') &&
        (property === 'eval' || property === 'Function')
        ? 'forbidden-function'
        : 'ordinary',
    );
  }
  return resolveStructuredExpression(expression, scope);
}

function resolvePotentialExpression(node: AstNode | undefined, scope: ExecutionScope): BindingKind {
  return resolvePotentialStructuredExpression(node, scope).kind;
}

function bindPattern(
  pattern: AstNode | undefined,
  sourceKind: BindingKind,
  scope: ExecutionScope,
  issues: string[],
  updateExisting = false,
  sourceValue: StructuredValue = scalarValue(sourceKind),
): void {
  if (pattern === undefined) return;
  const name = identifierName(pattern);
  if (name !== undefined) {
    let target = scope;
    if (updateExisting) {
      for (let current: ExecutionScope | null = scope; current !== null; current = current.parent) {
        if (current.bindings.has(name)) {
          target = current;
          break;
        }
      }
    }
    target.bindings.set(name, sourceKind);
    if (sourceValue.properties !== undefined || sourceValue.elements !== undefined) {
      target.structuredBindings.set(name, sourceValue);
    } else {
      target.structuredBindings.delete(name);
    }
    return;
  }
  if (pattern.type === 'AssignmentPattern') {
    bindPattern(asAstNode(pattern.left), sourceKind, scope, issues, updateExisting, sourceValue);
    return;
  }
  if (pattern.type === 'RestElement') {
    bindPattern(asAstNode(pattern.argument), 'ordinary', scope, issues, updateExisting);
    return;
  }
  if (pattern.type === 'ObjectPattern' && Array.isArray(pattern.properties)) {
    for (const value of pattern.properties) {
      const property = asAstNode(value);
      if (property?.type === 'RestElement') {
        bindPattern(asAstNode(property.argument), 'ordinary', scope, issues, updateExisting);
        continue;
      }
      if (property?.type !== 'ObjectProperty') continue;
      const key = staticPropertyName(asAstNode(property.key));
      const preciseValue = key === undefined ? undefined : sourceValue.properties?.get(key);
      const propertyKind =
        preciseValue?.kind ??
        ((sourceKind === 'global-object' || sourceKind === 'maybe-global-object') &&
        (key === 'eval' || key === 'Function')
          ? 'forbidden-function'
          : 'ordinary');
      if (propertyKind === 'forbidden-function') issues.push(`forbidden global ${key} reference`);
      bindPattern(
        asAstNode(property.value),
        propertyKind,
        scope,
        issues,
        updateExisting,
        preciseValue ?? scalarValue(propertyKind),
      );
    }
    return;
  }
  if (pattern.type === 'ArrayPattern' && Array.isArray(pattern.elements)) {
    for (const [index, value] of pattern.elements.entries()) {
      const elementValue = sourceValue.elements?.[index] ?? scalarValue('ordinary');
      bindPattern(asAstNode(value), elementValue.kind, scope, issues, updateExisting, elementValue);
    }
  }
}

function predeclareStatements(node: AstNode, scope: ExecutionScope): void {
  const body = Array.isArray(node.body) ? node.body : [];
  for (const value of body) {
    const statement = asAstNode(value);
    if (statement?.type === 'VariableDeclaration' && Array.isArray(statement.declarations)) {
      for (const declaration of statement.declarations) {
        bindPattern(asAstNode(asAstNode(declaration)?.id), 'ordinary', scope, []);
      }
    } else if (
      statement !== undefined &&
      ['FunctionDeclaration', 'ClassDeclaration'].includes(statement.type)
    ) {
      const name = identifierName(asAstNode(statement.id));
      if (name !== undefined) scope.bindings.set(name, 'ordinary');
    } else if (statement?.type === 'ImportDeclaration' && Array.isArray(statement.specifiers)) {
      for (const specifier of statement.specifiers) {
        const name = identifierName(asAstNode(asAstNode(specifier)?.local));
        if (name !== undefined) scope.bindings.set(name, 'ordinary');
      }
    }
  }
}

function recordPotentialBinding(scope: ExecutionScope, name: string, value: StructuredValue): void {
  const kind = value.kind;
  for (let current: ExecutionScope | null = scope; current !== null; current = current.parent) {
    if (current.bindings.has(name)) {
      const existing =
        current.potentialBindings.get(name) ?? current.bindings.get(name) ?? 'ordinary';
      current.potentialBindings.set(name, mergeBindingKinds(existing, kind));
      const existingValue =
        current.potentialStructuredBindings.get(name) ??
        current.structuredBindings.get(name) ??
        scalarValue(current.bindings.get(name) ?? 'ordinary');
      current.potentialStructuredBindings.set(name, mergeStructuredValues(existingValue, value));
      return;
    }
  }
  const existing = scope.potentialBindings.get(name) ?? 'ordinary';
  scope.potentialBindings.set(name, mergeBindingKinds(existing, kind));
  const existingValue = scope.potentialStructuredBindings.get(name) ?? scalarValue('ordinary');
  scope.potentialStructuredBindings.set(name, mergeStructuredValues(existingValue, value));
}

function recordPotentialPattern(
  pattern: AstNode | undefined,
  sourceKind: BindingKind,
  scope: ExecutionScope,
  sourceValue: StructuredValue = scalarValue(sourceKind),
): void {
  if (pattern === undefined) return;
  const name = identifierName(pattern);
  if (name !== undefined) {
    recordPotentialBinding(scope, name, sourceValue);
    return;
  }
  if (pattern.type === 'AssignmentPattern') {
    recordPotentialPattern(asAstNode(pattern.left), sourceKind, scope, sourceValue);
    return;
  }
  if (pattern.type === 'ObjectPattern' && Array.isArray(pattern.properties)) {
    for (const value of pattern.properties) {
      const property = asAstNode(value);
      if (property?.type !== 'ObjectProperty') continue;
      const key = staticPropertyName(asAstNode(property.key));
      const preciseValue = key === undefined ? undefined : sourceValue.properties?.get(key);
      const kind =
        preciseValue?.kind ??
        ((sourceKind === 'global-object' || sourceKind === 'maybe-global-object') &&
        (key === 'eval' || key === 'Function')
          ? 'forbidden-function'
          : 'ordinary');
      recordPotentialPattern(
        asAstNode(property.value),
        kind,
        scope,
        preciseValue ?? scalarValue(kind),
      );
    }
    return;
  }
  if (pattern.type === 'ArrayPattern' && Array.isArray(pattern.elements)) {
    for (const [index, value] of pattern.elements.entries()) {
      const element = sourceValue.elements?.[index] ?? scalarValue(sourceKind);
      recordPotentialPattern(asAstNode(value), element.kind, scope, element);
    }
  }
}

function collectPotentialBindings(node: AstNode, scope: ExecutionScope): void {
  let previous = '';
  while (previous !== potentialScopeSignature(scope)) {
    previous = potentialScopeSignature(scope);
    collectPotentialBindingPass(node, scope, true);
  }
}

function potentialScopeSignature(scope: ExecutionScope): string {
  const chain: Array<readonly [string, BindingKind]> = [];
  for (let current: ExecutionScope | null = scope; current !== null; current = current.parent) {
    chain.push(...[...current.potentialBindings.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }
  return JSON.stringify(chain);
}

function collectPotentialBindingPass(node: AstNode, scope: ExecutionScope, root: boolean): void {
  if (
    [
      'FunctionDeclaration',
      'FunctionExpression',
      'ArrowFunctionExpression',
      'ObjectMethod',
      'ClassMethod',
      'ClassPrivateMethod',
    ].includes(node.type)
  ) {
    return;
  }
  if (!root && node.type === 'BlockStatement') {
    const blockScope = createExecutionScope(scope);
    predeclareStatements(node, blockScope);
    collectPotentialBindings(node, blockScope);
    return;
  }
  if (node.type === 'VariableDeclarator') {
    recordPotentialPattern(
      asAstNode(node.id),
      resolvePotentialExpression(asAstNode(node.init), scope),
      scope,
    );
  } else if (node.type === 'AssignmentExpression') {
    recordPotentialPattern(
      asAstNode(node.left),
      resolvePotentialExpression(asAstNode(node.right), scope),
      scope,
    );
  }
  for (const child of astChildren(node)) collectPotentialBindingPass(child, scope, false);
}

function resolveIterableElementKind(
  iterable: AstNode | undefined,
  scope: ExecutionScope,
): BindingKind {
  const expression = unwrapExpression(iterable);
  const value = resolveStructuredExpression(expression, scope);
  if (value.elements === undefined) return 'ordinary';
  return value.elements.map((element) => element.kind).reduce(mergeBindingKinds, 'ordinary');
}

function bindIterationTarget(
  left: AstNode | undefined,
  elementKind: BindingKind,
  scope: ExecutionScope,
  issues: string[],
): void {
  if (left?.type === 'VariableDeclaration' && Array.isArray(left.declarations)) {
    for (const value of left.declarations) {
      bindPattern(asAstNode(asAstNode(value)?.id), elementKind, scope, issues);
    }
    return;
  }
  bindPattern(left, elementKind, scope, issues, true);
}

function statementTerminatesCase(node: AstNode): boolean {
  return ['BreakStatement', 'ReturnStatement', 'ThrowStatement'].includes(node.type);
}

function mayThrowBeforeCompletion(node: AstNode): boolean {
  if (
    [
      'CallExpression',
      'NewExpression',
      'ThrowStatement',
      'AwaitExpression',
      'YieldExpression',
      'TaggedTemplateExpression',
    ].includes(node.type)
  ) {
    return true;
  }
  if (
    [
      'FunctionDeclaration',
      'FunctionExpression',
      'ArrowFunctionExpression',
      'ObjectMethod',
      'ClassMethod',
      'ClassPrivateMethod',
    ].includes(node.type)
  ) {
    return false;
  }
  return astChildren(node).some(mayThrowBeforeCompletion);
}

function mergeScopeList(scopes: readonly ExecutionScope[]): ExecutionScope | undefined {
  const first = scopes[0];
  if (first === undefined) return undefined;
  const merged = snapshotExecutionScope(first);
  for (const scope of scopes.slice(1)) mergeExecutionScopes(merged, merged, scope);
  return merged;
}

function analyzeExecutableNode(node: AstNode, scope: ExecutionScope, issues: string[]): void {
  if (
    [
      'TSAsExpression',
      'TSTypeAssertion',
      'TSNonNullExpression',
      'TSSatisfiesExpression',
      'TSInstantiationExpression',
    ].includes(node.type)
  ) {
    const expression = asAstNode(node.expression);
    if (expression !== undefined) analyzeExecutableNode(expression, scope, issues);
    return;
  }
  if (node.type.startsWith('TS')) return;
  if (node.type === 'Program' || node.type === 'BlockStatement') {
    const blockScope = node.type === 'Program' ? scope : createExecutionScope(scope);
    predeclareStatements(node, blockScope);
    collectPotentialBindings(node, blockScope);
    for (const child of astChildren(node)) analyzeExecutableNode(child, blockScope, issues);
    return;
  }
  if (
    [
      'FunctionDeclaration',
      'FunctionExpression',
      'ArrowFunctionExpression',
      'ObjectMethod',
      'ClassMethod',
      'ClassPrivateMethod',
    ].includes(node.type)
  ) {
    const functionScope = snapshotForClosure(scope);
    if (Array.isArray(node.params)) {
      for (const parameter of node.params) {
        bindPattern(asAstNode(parameter), 'ordinary', functionScope, issues);
      }
    }
    const body = asAstNode(node.body);
    if (body !== undefined) analyzeExecutableNode(body, functionScope, issues);
    return;
  }
  if (node.type === 'IfStatement') {
    const test = asAstNode(node.test);
    if (test !== undefined) analyzeExecutableNode(test, scope, issues);
    const before = snapshotExecutionScope(scope);
    const consequentScope = snapshotExecutionScope(scope);
    const consequent = asAstNode(node.consequent);
    if (consequent !== undefined) analyzeExecutableNode(consequent, consequentScope, issues);
    const alternateScope = snapshotExecutionScope(before);
    const alternate = asAstNode(node.alternate);
    if (alternate !== undefined) analyzeExecutableNode(alternate, alternateScope, issues);
    mergeExecutionScopes(scope, consequentScope, alternateScope);
    return;
  }
  if (node.type === 'ConditionalExpression') {
    const test = asAstNode(node.test);
    if (test !== undefined) analyzeExecutableNode(test, scope, issues);
    const consequentScope = snapshotExecutionScope(scope);
    const alternateScope = snapshotExecutionScope(scope);
    const consequent = asAstNode(node.consequent);
    const alternate = asAstNode(node.alternate);
    if (consequent !== undefined) analyzeExecutableNode(consequent, consequentScope, issues);
    if (alternate !== undefined) analyzeExecutableNode(alternate, alternateScope, issues);
    mergeExecutionScopes(scope, consequentScope, alternateScope);
    return;
  }
  if (node.type === 'ForStatement') {
    const init = asAstNode(node.init);
    if (init !== undefined) analyzeExecutableNode(init, scope, issues);
    const test = asAstNode(node.test);
    if (test !== undefined) analyzeExecutableNode(test, scope, issues);
    const body = asAstNode(node.body);
    const update = asAstNode(node.update);
    const reached = analyzeLoopFixedPoint(scope, (iteration) => {
      if (body !== undefined) analyzeExecutableNode(body, iteration, issues);
      if (update !== undefined) analyzeExecutableNode(update, iteration, issues);
      if (test !== undefined) analyzeExecutableNode(test, iteration, issues);
    });
    mergeExecutionScopes(scope, scope, reached);
    return;
  }
  if (node.type === 'DoWhileStatement') {
    const body = asAstNode(node.body);
    if (body !== undefined) analyzeExecutableNode(body, scope, issues);
    const test = asAstNode(node.test);
    if (test !== undefined) analyzeExecutableNode(test, scope, issues);
    const reached = analyzeLoopFixedPoint(scope, (iteration) => {
      if (body !== undefined) analyzeExecutableNode(body, iteration, issues);
      if (test !== undefined) analyzeExecutableNode(test, iteration, issues);
    });
    mergeExecutionScopes(scope, scope, reached);
    return;
  }
  if (node.type === 'WhileStatement') {
    const test = asAstNode(node.test);
    const body = asAstNode(node.body);
    if (test !== undefined) analyzeExecutableNode(test, scope, issues);
    const reached = analyzeLoopFixedPoint(scope, (iteration) => {
      if (body !== undefined) analyzeExecutableNode(body, iteration, issues);
      if (test !== undefined) analyzeExecutableNode(test, iteration, issues);
    });
    mergeExecutionScopes(scope, scope, reached);
    return;
  }
  if (node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
    const right = asAstNode(node.right);
    if (right !== undefined) analyzeExecutableNode(right, scope, issues);
    const before = snapshotExecutionScope(scope);
    const left = asAstNode(node.left);
    const body = asAstNode(node.body);
    const elementKind =
      node.type === 'ForOfStatement' ? resolveIterableElementKind(right, scope) : 'ordinary';
    const reached = analyzeLoopFixedPoint(scope, (iteration) => {
      bindIterationTarget(left, elementKind, iteration, issues);
      if (body !== undefined) analyzeExecutableNode(body, iteration, issues);
    });
    mergeExecutionScopes(scope, before, reached);
    return;
  }
  if (node.type === 'SwitchStatement') {
    const discriminant = asAstNode(node.discriminant);
    if (discriminant !== undefined) analyzeExecutableNode(discriminant, scope, issues);
    const before = snapshotExecutionScope(scope);
    const exits: ExecutionScope[] = [];
    let hasDefault = false;
    if (Array.isArray(node.cases)) {
      const cases = node.cases.map(asAstNode).filter((value) => value?.type === 'SwitchCase');
      for (const [startIndex, entryCase] of cases.entries()) {
        const branch = snapshotExecutionScope(before);
        const test = asAstNode(entryCase?.test);
        if (test === undefined) hasDefault = true;
        else analyzeExecutableNode(test, branch, issues);
        let terminated = false;
        for (const switchCase of cases.slice(startIndex)) {
          if (Array.isArray(switchCase?.consequent)) {
            for (const statement of switchCase.consequent) {
              const child = asAstNode(statement);
              if (child === undefined) continue;
              analyzeExecutableNode(child, branch, issues);
              if (statementTerminatesCase(child)) {
                terminated = true;
                break;
              }
            }
          }
          if (terminated) break;
        }
        exits.push(branch);
      }
    }
    if (!hasDefault) exits.push(before);
    const merged = mergeScopeList(exits);
    if (merged !== undefined) mergeExecutionScopes(scope, merged, merged);
    return;
  }
  if (node.type === 'TryStatement') {
    const before = snapshotExecutionScope(scope);
    const normal = snapshotExecutionScope(before);
    const catchEntries: ExecutionScope[] = [];
    const block = asAstNode(node.block);
    if (block?.type === 'BlockStatement' && Array.isArray(block.body)) {
      for (const statement of block.body) {
        const child = asAstNode(statement);
        if (child === undefined) continue;
        if (mayThrowBeforeCompletion(child)) catchEntries.push(snapshotExecutionScope(normal));
        analyzeExecutableNode(child, normal, issues);
      }
    } else if (block !== undefined) {
      if (mayThrowBeforeCompletion(block)) catchEntries.push(snapshotExecutionScope(normal));
      analyzeExecutableNode(block, normal, issues);
    }
    const exits = [normal];
    const handler = asAstNode(node.handler);
    const catchEntry = mergeScopeList(catchEntries);
    if (handler !== undefined && catchEntry !== undefined) {
      analyzeExecutableNode(handler, catchEntry, issues);
      exits.push(catchEntry);
    }
    const merged = mergeScopeList(exits);
    if (merged !== undefined) mergeExecutionScopes(scope, merged, merged);
    const finalizer = asAstNode(node.finalizer);
    if (finalizer !== undefined) analyzeExecutableNode(finalizer, scope, issues);
    return;
  }
  if (node.type === 'VariableDeclarator') {
    const init = asAstNode(node.init);
    const value = resolveStructuredExpression(init, scope);
    const kind = value.kind;
    if (kind === 'forbidden-function' || kind === 'maybe-forbidden-function') {
      issues.push('forbidden eval/Function reference');
    }
    if (init !== undefined) analyzeExecutableNode(init, scope, issues);
    bindPattern(asAstNode(node.id), kind, scope, issues, false, value);
    return;
  }
  if (node.type === 'AssignmentExpression') {
    const right = asAstNode(node.right);
    const value = resolveStructuredExpression(right, scope);
    const kind = value.kind;
    if (kind === 'forbidden-function' || kind === 'maybe-forbidden-function') {
      issues.push('forbidden eval/Function reference');
    }
    if (right !== undefined) analyzeExecutableNode(right, scope, issues);
    bindPattern(asAstNode(node.left), kind, scope, issues, true, value);
    return;
  }
  if (node.type === 'CatchClause') {
    const catchScope = createExecutionScope(scope);
    bindPattern(asAstNode(node.param), 'ordinary', catchScope, issues);
    const body = asAstNode(node.body);
    if (body !== undefined) analyzeExecutableNode(body, catchScope, issues);
    return;
  }
  if (node.type === 'ImportExpression') {
    issues.push('forbidden dynamic import');
    return;
  }
  if (node.type === 'CallExpression' && asAstNode(node.callee)?.type === 'Import') {
    issues.push('forbidden dynamic import');
    return;
  }
  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    if (resolveExpression(node, scope) === 'forbidden-function') {
      const property = staticPropertyName(asAstNode(node.property));
      issues.push(`forbidden global ${property ?? 'eval/Function'} reference`);
    }
    const object = asAstNode(node.object);
    if (object !== undefined) analyzeExecutableNode(object, scope, issues);
    if (node.computed === true) {
      const property = asAstNode(node.property);
      if (property !== undefined) analyzeExecutableNode(property, scope, issues);
    }
    return;
  }
  if (node.type === 'ObjectProperty') {
    const value = asAstNode(node.value);
    if (value !== undefined) analyzeExecutableNode(value, scope, issues);
    return;
  }
  if (node.type === 'Identifier') {
    const name = identifierName(node);
    const kind = name === undefined ? 'ordinary' : resolveBinding(scope, name);
    if (
      name !== undefined &&
      (kind === 'forbidden-function' || kind === 'maybe-forbidden-function')
    ) {
      issues.push(`forbidden ${name} reference`);
    }
    return;
  }
  for (const child of astChildren(node)) analyzeExecutableNode(child, scope, issues);
}

interface DeclarationInventory {
  readonly types: readonly string[];
  readonly values: readonly string[];
}

function inspectRootDeclaration(
  source: string,
  expected: DeclarationInventory,
): DeclarationInventory & { readonly issues: readonly string[] } {
  const types = new Set<string>();
  const values = new Set<string>();
  const issues: string[] = [];
  for (const line of source.split('\n').map((candidate) => candidate.trim())) {
    if (!line.startsWith('export ')) continue;
    const match = /^export\s+(type\s+)?\{([^}]*)\}\s+from\s+(['"])[^'"]+\3;$/u.exec(line);
    if (match === null) {
      issues.push(`unsupported root declaration export: ${line}`);
      continue;
    }
    const groupIsType = match[1] !== undefined;
    for (const raw of (match[2] ?? '').split(',')) {
      const entry = raw.trim();
      if (entry.length === 0) continue;
      const entryIsType = groupIsType || entry.startsWith('type ');
      const exported = entry.replace(/^type\s+/u, '');
      const parts = exported.split(/\s+as\s+/u);
      const name = parts[1] ?? parts[0];
      if (name !== undefined) (entryIsType ? types : values).add(name);
    }
  }
  const inventory = { types: [...types].sort(), values: [...values].sort() };
  if (JSON.stringify(inventory.types) !== JSON.stringify(expected.types)) {
    issues.push('root type export inventory differs');
  }
  if (JSON.stringify(inventory.values) !== JSON.stringify(expected.values)) {
    issues.push('root value export inventory differs');
  }
  return { ...inventory, issues };
}

async function readReachableDeclarations(root: string): Promise<string[]> {
  const pending = [root];
  const visited = new Set<string>();
  const sources: string[] = [];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    const source = await readFile(current, 'utf8');
    sources.push(source);
    for (const match of source.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*)(['"])(\.[^'"]+)\1/gu)) {
      const reference = match[2];
      if (reference === undefined) continue;
      const declaration = path.resolve(path.dirname(current), reference.replace(/\.js$/u, '.d.ts'));
      if (!visited.has(declaration)) pending.push(declaration);
    }
  }
  return sources;
}

function callbackDeclarationIssues(sources: readonly string[]): string[] {
  const namedBoundary = sources.some((source) => /\b(?:Plugin|Callback)\b/u.test(source));
  const functionBearingContract = sources.some((source) => {
    const program = parseTypeScript(source, true);
    const externalTypes = new Set<string>();
    for (const child of astChildren(program)) {
      if (child.type !== 'ImportDeclaration') continue;
      const packageName = asAstNode(child.source)?.value;
      if (typeof packageName !== 'string' || packageName.startsWith('.')) continue;
      if (!Array.isArray(child.specifiers)) continue;
      for (const specifier of child.specifiers) {
        const name = identifierName(asAstNode(asAstNode(specifier)?.local));
        if (name !== undefined) externalTypes.add(name);
      }
    }
    for (const node of allAstNodes(program)) {
      if (
        (node.type === 'TSInterfaceDeclaration' || node.type === 'TSTypeAliasDeclaration') &&
        containsCallableType(node, externalTypes)
      ) {
        return true;
      }
    }
    return false;
  });
  return namedBoundary || functionBearingContract
    ? ['forbidden public plugin/callback declaration']
    : [];
}

function allAstNodes(root: AstNode): AstNode[] {
  const nodes: AstNode[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    nodes.push(node);
    pending.push(...astChildren(node));
  }
  return nodes;
}

function containsCallableType(root: AstNode, externalTypes: ReadonlySet<string>): boolean {
  const callableNodes = new Set([
    'TSMethodSignature',
    'TSCallSignatureDeclaration',
    'TSConstructSignatureDeclaration',
    'TSFunctionType',
    'TSConstructorType',
  ]);
  return allAstNodes(root).some((node) => {
    if (callableNodes.has(node.type)) return true;
    if (node.type === 'TSTypeReference') {
      const name = entityNameRoot(asAstNode(node.typeName));
      return name !== undefined && externalTypes.has(name);
    }
    if (node.type === 'TSExpressionWithTypeArguments' || node.type === 'TSInterfaceHeritage') {
      const name = entityNameRoot(asAstNode(node.expression));
      return name !== undefined && externalTypes.has(name);
    }
    if (node.type === 'TSImportType') {
      const argument = asAstNode(node.argument);
      return argument?.type === 'StringLiteral' && typeof argument.value === 'string'
        ? !argument.value.startsWith('.')
        : true;
    }
    return false;
  });
}

function entityNameRoot(node: AstNode | undefined): string | undefined {
  if (node === undefined) return undefined;
  const direct = identifierName(node);
  if (direct !== undefined) return direct;
  if (node.type === 'TSQualifiedName') return entityNameRoot(asAstNode(node.left));
  if (node.type === 'MemberExpression') return entityNameRoot(asAstNode(node.object));
  return undefined;
}
