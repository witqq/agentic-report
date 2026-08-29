import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  type AuthoringRegistryDefinition,
  authoringRegistry,
  type ConstraintDefinition,
  type DirectiveDefinition,
  type ExampleDefinition,
  type FieldDefinition,
  OUTPUT_CONTRACT,
  OUTPUT_FORMATS,
  PAGE_CONTRACT,
  type OutputFormatChoice,
} from '../../../src/authoring/registry.js';
import {
  authoringRegistryIntegrityIssues,
  rendererDisposition,
} from '../../../src/authoring/registry-integrity.js';

describe('authoring registry', () => {
  it('owns complete, unique, deterministically ordered authoring identities', () => {
    expect(unique(authoringRegistry.manifestFields.map((field) => field.name))).toBe(true);
    expect(unique(authoringRegistry.directives.map((directive) => directive.name))).toBe(true);
    expect(unique(authoringRegistry.capabilities.map((capability) => capability.id))).toBe(true);
    expect(unique(authoringRegistry.commands.map((command) => command.id))).toBe(true);
    expect(unique(authoringRegistry.examples.map((example) => example.id))).toBe(true);
    expect(authoringRegistry.directives.map((directive) => directive.name)).toEqual([
      'section',
      'actions',
      'action',
      'source-link',
      'callout',
      'decision',
      'decision-option',
      'checklist',
      'check-item',
      'cards',
      'card',
      'steps',
      'response',
      'question',
      'bucket',
      'option',
      'item',
      'copyable',
      'glossary',
      'term',
      'disclosure',
      'tabs',
      'tab',
      'modal',
      'popover',
      'filter',
      'toggle',
      'chart',
      'series',
      'point',
      'diagram',
      'group',
      'node',
      'edge',
      'timeline',
      'event',
      'demo',
      'asset',
      'font',
    ]);
    expect(OUTPUT_FORMATS).toEqual(['single-file', 'directory']);
    expect(authoringRegistry.output).toBe(OUTPUT_CONTRACT);
    expect(authoringRegistry.page).toBe(PAGE_CONTRACT);
    expect(authoringRegistry.visualizations.diagram).toMatchObject({
      defaultType: 'flow',
      types: ['flow', 'sequence'],
      flow: {
        nodes: { minimum: 1, maximum: 20 },
        edges: { maximum: 40 },
        selfEdges: false,
        groups: {
          ungrouped: 0,
          minimum: 2,
          maximum: 3,
          requireEveryNode: true,
          direction: 'right',
        },
      },
      sequence: {
        participants: { minimum: 2, maximum: 6 },
        messages: { minimum: 1, maximum: 40, labelRequired: true },
        groups: false,
        participantGroups: false,
        direction: 'forbidden',
        selfMessages: false,
      },
    });
    expect(authoringRegistry.source.codeFenceMetadata.terms).toMatchObject({
      syntax: 'terms="key,other-key"',
      fieldExclusivity: 'only-field',
      quoting: 'double',
      separator: ',',
      minItems: 1,
      maxItems: 20,
      uniqueItems: true,
      matching: {
        source: 'canonical-glossary-term',
        caseSensitive: true,
        occurrence: 'first',
        lineBoundary: 'reject',
        overlap: 'reject',
      },
    });
    expect(authoringRegistry.source.codeFenceMetadata.terms.itemConstraint).toBe(
      directive('glossary').attributes.find((attribute) => attribute.name === 'key')?.constraint,
    );
  });

  it('gives every directive validation, placement, behavior, security, and projection metadata', () => {
    for (const directive of authoringRegistry.directives) {
      expect(directive.forms.length).toBeGreaterThan(0);
      expect(unique(directive.forms)).toBe(true);
      expect(unique(directive.attributes.map((attribute) => attribute.name))).toBe(true);
      expect([
        'none',
        'native-disclosure',
        'glossary-reference',
        'package-owned-counter',
        'package-owned-tabs',
        'package-owned-modal',
        'package-owned-popover',
        'package-owned-filter',
        'package-owned-toggle',
        'package-owned-response',
        'package-owned-copy',
      ]).toContain(directive.behavior.runtime);
      expect(directive.security).toMatchObject({ authorCode: false, rawHtml: false });
      expect(directive.sanitizer.className).toBe(`semantic-${directive.name}`);
      expect(directive.sanitizer.properties.length).toBeGreaterThan(0);
      for (const attribute of directive.attributes) {
        expect(classifyConstraint(attribute.constraint)).toBe(attribute.constraint.kind);
        expectValidDefault(attribute);
      }
    }

    expect(directive('card').placement).toEqual({
      requiredParent: 'cards',
      preferredParent: 'cards',
    });
    expect(directive('steps').handoffs).toContain('semantic-document');
    expect(directive('asset').security.localResourceOnly).toBe(true);
    expect(directive('font').behavior.resource).toBe('font');
  });

  it('matches the complete reviewed contract golden', async () => {
    const golden = JSON.parse(
      await readFile(
        new URL('../../fixtures/authoring/registry-contract.json', import.meta.url),
        'utf8',
      ),
    ) as unknown;
    expect(authoringRegistry).toEqual(golden);
  });

  it('contains data only and exposes no executable extension surface', () => {
    const visit = (value: unknown): void => {
      expect(typeof value).not.toBe('function');
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (typeof value === 'object' && value !== null) {
        for (const item of Object.values(value)) visit(item);
      }
    };

    visit(authoringRegistry);
    expect(JSON.stringify(authoringRegistry)).not.toMatch(/dynamicImport|callback|plugin|eval/i);
  });

  it('keeps version, schema IDs, defaults, and starter identity internally coherent', () => {
    expect(authoringRegistry.contract).toMatchObject({
      major: 1,
      supportedReaderMajors: [1],
      legacySourceMajor: 1,
      schemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    });
    expect(Object.values(authoringRegistry.contract.schemaIds)).toEqual([
      'urn:agentic-report:schema:manifest:1',
      'urn:agentic-report:schema:directives:1',
      'urn:agentic-report:schema:source:1',
    ]);
    expect(
      authoringRegistry.manifestFields
        .find((field) => field.name === 'output')
        ?.fields?.map((field) => field.name),
    ).toEqual(['format', 'maxInlineBytes']);
    expect(authoringRegistry.examples.filter((example) => 'starter' in example)).toHaveLength(6);
    expect(authoringRegistry.examples[0]).toMatchObject({
      id: 'basic',
      path: 'basic',
      entry: 'report.md',
      starter: { default: true, aliases: ['report'] },
    });
    expect(authoringRegistry.capabilities).toEqual([
      {
        id: 'init',
        description: 'Initialize a packaged declarative starter without overwriting user content.',
      },
      {
        id: 'validate',
        description: 'Validate a project through the production preparation pipeline.',
      },
      {
        id: 'inspect',
        description: 'Inspect a valid project through the production preparation pipeline.',
      },
      {
        id: 'review',
        description: 'Resolve a versioned review artifact to current Markdown source locations.',
      },
    ]);
    expect(authoringRegistry.commands.map((command) => command.id)).toEqual([
      'init',
      'validate',
      'inspect',
      'review',
      'build',
      'describe',
      'schema',
      'examples',
    ]);
    expect(authoringRegistry.page).toMatchObject({
      defaultPreset: 'studio',
      defaultLayout: 'document',
      layouts: ['document', 'dashboard', 'landing', 'mixed'],
      defaultTheme: 'system',
      themes: ['system', 'light', 'dark'],
      defaultScrollProgress: false,
      motion: {
        scrollProgress: { normalMotionOnly: true },
        sectionReveal: {
          default: false,
          normalMotionOnly: true,
          durationMs: 220,
          translationPx: 12,
        },
      },
    });
    expect(authoringRegistry.page.presets.map((preset) => preset.name)).toEqual([
      'studio',
      'editorial',
      'signal',
    ]);
    expect(authoringRegistry.page.tokens.map((token) => token.name)).toEqual([
      'density',
      'font',
      'accent',
      'width',
      'radius',
    ]);
    expect(authoringRegistry.examples.map((example) => example.id)).toEqual([
      'basic',
      'research',
      'architecture',
      'tutorial',
      'dashboard',
      'landing',
      'layout-document',
      'layout-dashboard',
      'layout-landing',
      'layout-mixed',
      'interactive-catalog',
      'review-workspace',
      'response-workspace',
      'visualization-catalog',
      'incident-review',
      'vendor-decision',
      'launch-readiness',
    ]);
    expect(
      authoringRegistry.examples
        .filter((example) => 'starter' in example)
        .map((example) => example.id),
    ).toEqual(['basic', 'research', 'architecture', 'tutorial', 'dashboard', 'landing']);
  });

  it('detects each semantic integrity mutation independently', () => {
    expect(authoringRegistryIntegrityIssues(authoringRegistry)).toEqual([]);
    const { starter: _starter, ...nonStarterExample } = authoringRegistry.examples[0];
    const demo = directive('demo');
    const start = demo.attributes.find((attribute) => attribute.name === 'start');
    if (start === undefined) throw new Error('Missing demo.start registry attribute');
    const output = authoringRegistry.manifestFields.find((field) => field.name === 'output');
    if (output === undefined) throw new Error('Missing manifest.output registry field');
    expect(
      authoringRegistryIntegrityIssues(
        registryWith({
          manifestFields: [
            authoringRegistry.manifestFields[0],
            ...authoringRegistry.manifestFields,
          ],
        }),
      ),
    ).toContain('manifest field: duplicate contractVersion');
    expect(
      authoringRegistryIntegrityIssues(
        registryWith({ directives: [demo, ...authoringRegistry.directives] }),
      ),
    ).toContain('directive: duplicate demo');
    expect(
      authoringRegistryIntegrityIssues(
        registryWith({ examples: [authoringRegistry.examples[0], ...authoringRegistry.examples] }),
      ),
    ).toContain('example: duplicate basic');
    expect(
      authoringRegistryIntegrityIssues(
        registryWith({
          capabilities: [authoringRegistry.capabilities[0], ...authoringRegistry.capabilities],
        }),
      ),
    ).toContain('capability: duplicate init');

    const invalidOutput = {
      ...output,
      default: { format: 'directory', unexpected: true },
    } as const;
    expect(
      authoringRegistryIntegrityIssues(
        registryWith({
          manifestFields: authoringRegistry.manifestFields.map((field) =>
            field.name === 'output' ? invalidOutput : field,
          ) as [FieldDefinition, ...FieldDefinition[]],
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        'manifest.output: nested default keys differ from fields',
        'manifest.output.format: parent and field defaults differ',
        'manifest.output.maxInlineBytes: parent and field defaults differ',
      ]),
    );

    const invalidDemo = {
      ...demo,
      description: '',
      forms: ['container', 'container'],
      attributes: [{ ...start, default: 'not-an-integer' }],
      placement: { requiredParent: 'missing-parent' },
      sanitizer: {
        ...demo.sanitizer,
        properties: [demo.sanitizer.properties[0], demo.sanitizer.properties[0]],
      },
      handoffs: [demo.handoffs[0], demo.handoffs[0]],
    } as const;
    expect(authoringRegistryIntegrityIssues(registryWith({ directives: [invalidDemo] }))).toEqual(
      expect.arrayContaining([
        'demo: empty description',
        'demo: duplicate accepted form',
        'demo.start: default violates integer constraint',
        'demo: unknown parent missing-parent',
        'demo: duplicate sanitizer property',
        'demo: duplicate handoff',
      ]),
    );

    const missingRenderedProperty = {
      ...demo,
      sanitizer: {
        ...demo.sanitizer,
        properties: demo.sanitizer.properties.filter((property) => property !== 'dataStep'),
      },
    };
    expect(
      authoringRegistryIntegrityIssues(
        unsafeRegistryWith({
          directives: authoringRegistry.directives.map((entry) =>
            entry.name === 'demo' ? missingRenderedProperty : entry,
          ),
        }),
      ),
    ).toContain('demo: sanitizer properties differ from rendered properties');

    const unsafeRenderedProperty = {
      ...demo,
      attributes: demo.attributes.map((attribute) =>
        attribute.name === 'title' ? { ...attribute, renderProperty: '__proto__' } : attribute,
      ),
      sanitizer: {
        ...demo.sanitizer,
        properties: demo.sanitizer.properties.map((property) =>
          property === 'dataDirectiveTitle' ? '__proto__' : property,
        ),
      },
    };
    expect(
      authoringRegistryIntegrityIssues(
        unsafeRegistryWith({
          directives: authoringRegistry.directives.map((entry) =>
            entry.name === 'demo' ? unsafeRenderedProperty : entry,
          ),
        }),
      ),
    ).toContain('demo.title: unsafe rendered attribute property');

    const title = authoringRegistry.manifestFields.find((field) => field.name === 'title');
    if (title === undefined) throw new Error('Missing manifest.title registry field');
    const invalidTitle = {
      ...title,
      description: '',
      constraint: { kind: 'string', normalization: 'trim', minLength: 5, maxLength: 1 },
    } as const;
    expect(
      authoringRegistryIntegrityIssues(
        registryWith({
          manifestFields: [invalidTitle, ...authoringRegistry.manifestFields.slice(1)],
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        'manifest.title: empty description',
        'manifest.title: maximum length below minimum',
      ]),
    );

    const invalidExample = {
      ...authoringRegistry.examples[0],
      id: '../unsafe',
      title: '',
      path: '../outside',
      entry: '../entry.md',
      classes: ['duplicate', 'duplicate'],
    } as const;
    expect(authoringRegistryIntegrityIssues(registryWith({ examples: [invalidExample] }))).toEqual(
      expect.arrayContaining([
        '../unsafe: empty title',
        '../unsafe: unsafe example identity',
        '../unsafe: non-relative example path',
        '../unsafe: non-relative example entry',
        '../unsafe: duplicate showcase class',
      ]),
    );

    expect(
      authoringRegistryIntegrityIssues(
        registryWith({
          capabilities: [{ ...authoringRegistry.capabilities[0], id: 'Unsafe/Capability' }],
        }),
      ),
    ).toContain('Unsafe/Capability: unsafe capability identity');

    expect(
      authoringRegistryIntegrityIssues(
        unsafeRegistryWith({
          visualizations: {
            diagram: {
              ...authoringRegistry.visualizations.diagram,
              defaultType: 'sequence',
              types: ['flow'],
              flow: {
                ...authoringRegistry.visualizations.diagram.flow,
                nodes: { minimum: 2, maximum: 1 },
                selfEdges: true,
              },
              sequence: {
                ...authoringRegistry.visualizations.diagram.sequence,
                groups: true,
              },
            },
          },
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        'diagram contract: default type is outside the type domain',
        'diagram contract: invalid flow bounds',
        'diagram contract: unsupported flow policy',
        'diagram contract: unsupported sequence policy',
        'diagram contract: directive type domain differs from visualization contract',
      ]),
    );

    expect(
      authoringRegistryIntegrityIssues(
        unsafeRegistryWith({
          source: {
            ...authoringRegistry.source,
            codeFenceMetadata: {
              terms: {
                ...authoringRegistry.source.codeFenceMetadata.terms,
                syntax: 'terms="stale separator"',
                maxItems: 0,
                itemConstraint: {
                  ...authoringRegistry.source.codeFenceMetadata.terms.itemConstraint,
                  pattern: '[',
                },
              },
            },
          },
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        'source.codeFenceMetadata.terms: maximum below minimum',
        'source.codeFenceMetadata.terms: syntax differs from its grammar fields',
        'source.codeFenceMetadata.terms.items: invalid string pattern',
      ]),
    );
    expect(
      authoringRegistryIntegrityIssues(
        registryWith({
          examples: [nonStarterExample],
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        'example: expected at least one initializable starter',
        'example: expected exactly one default starter',
      ]),
    );
    expect(
      authoringRegistryIntegrityIssues(
        registryWith({
          examples: [
            authoringRegistry.examples[0],
            {
              ...authoringRegistry.examples[0],
              id: 'second',
              path: 'second',
              starter: { default: true, aliases: [] },
            },
          ],
        }),
      ),
    ).toContain('example: expected exactly one default starter');
    expect(
      authoringRegistryIntegrityIssues(
        registryWith({
          examples: [
            {
              ...authoringRegistry.examples[0],
              starter: { default: false, aliases: [] },
            },
          ],
        }),
      ),
    ).toEqual(['example: expected exactly one default starter']);
    expect(
      authoringRegistryIntegrityIssues(
        registryWith({
          examples: [
            authoringRegistry.examples[0],
            {
              ...authoringRegistry.examples[0],
              id: 'second',
              path: 'second',
              starter: { default: false, aliases: [] },
            },
          ],
        }),
      ),
    ).toEqual([]);
    expect(
      authoringRegistryIntegrityIssues(
        registryWith({
          examples: [
            {
              ...authoringRegistry.examples[0],
              starter: { default: true, aliases: ['../unsafe', 'basic', 'report', 'report'] },
            },
          ],
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        'basic: unsafe starter alias ../unsafe',
        'basic: starter alias conflicts with basic',
        'basic: starter alias conflicts with report',
        'basic: duplicate starter alias',
      ]),
    );
    expect(
      authoringRegistryIntegrityIssues(
        registryWith({
          examples: [
            authoringRegistry.examples[0],
            {
              ...authoringRegistry.examples[1],
              starter: { default: false, aliases: ['report'] },
            },
          ],
        }),
      ),
    ).toContain('research: starter alias conflicts with report');
    expect(
      authoringRegistryIntegrityIssues(
        registryWith({
          examples: authoringRegistry.examples.map((example) =>
            example.id === 'basic'
              ? { ...example, starter: { default: true, aliases: ['layout-document'] } }
              : example,
          ) as unknown as [ExampleDefinition, ...ExampleDefinition[]],
        }),
      ),
    ).toContain('basic: starter alias conflicts with layout-document');
  });

  it('accepts only normalized package-relative POSIX example paths', () => {
    for (const accepted of ['basic', 'nested/tutorial', 'safe..name/report.v1']) {
      expect(
        authoringRegistryIntegrityIssues(
          registryWith({ examples: [{ ...authoringRegistry.examples[0], path: accepted }] }),
        ),
      ).not.toContain('basic: non-relative example path');
    }

    for (const rejected of [
      'https://example.com/report',
      'C:\\outside',
      '\\\\server\\share',
      '\\rooted',
      '/rooted',
      '.',
      './basic',
      'nested/../outside',
      'nested//report',
      'nested/',
    ]) {
      expect(
        authoringRegistryIntegrityIssues(
          registryWith({ examples: [{ ...authoringRegistry.examples[0], path: rejected }] }),
        ),
      ).toContain('basic: non-relative example path');
    }
  });

  it('rejects output formats outside the manifest-owned closed domain', () => {
    expect(OUTPUT_FORMATS).toEqual(['single-file', 'directory']);

    const output = authoringRegistry.manifestFields.find((field) => field.name === 'output');
    if (output === undefined) throw new Error('Missing manifest.output registry field');
    const divergentOutput = {
      ...output,
      fields: output.fields?.map((field) =>
        field.name === 'format'
          ? { ...field, constraint: { kind: 'enum', values: ['single-file', 'cloud'] } }
          : field,
      ),
    } as unknown as FieldDefinition;
    expect(
      authoringRegistryIntegrityIssues(
        registryWith({
          manifestFields: authoringRegistry.manifestFields.map((field) =>
            field.name === 'output' ? divergentOutput : field,
          ) as [FieldDefinition, ...FieldDefinition[]],
        }),
      ),
    ).toContain('output format: manifest domain differs from registry domain');
  });

  it('rejects divergent output defaults and incomplete or changed runtime placement', () => {
    expect(authoringRegistryIntegrityIssues(authoringRegistry)).toEqual([]);
    expect(
      authoringRegistryIntegrityIssues(
        unsafeRegistryWith({ output: { ...authoringRegistry.output, default: 'directory' } }),
      ),
    ).toContain('output format: manifest default differs from registry output default');
    expect(
      authoringRegistryIntegrityIssues(
        unsafeRegistryWith({
          output: {
            ...authoringRegistry.output,
            runtimePlacement: { 'single-file': 'inline' },
          },
        }),
      ),
    ).toContain('output format: runtime placement keys differ from format domain');
    expect(
      authoringRegistryIntegrityIssues(
        unsafeRegistryWith({
          output: {
            ...authoringRegistry.output,
            runtimePlacement: { 'single-file': 'external', directory: 'external' },
          },
        }),
      ),
    ).toContain('output format: invalid runtime placement for single-file');
  });

  it('rejects coherently corrupted output domains and defaults', () => {
    const outputField = authoringRegistry.manifestFields.find((field) => field.name === 'output');
    if (outputField === undefined) throw new Error('Missing manifest.output registry field');
    const coherentRegistry = (
      formats: readonly string[],
      runtimePlacement: Readonly<Record<string, string>>,
      defaultFormat: string,
    ): AuthoringRegistryDefinition =>
      unsafeRegistryWith({
        output: { default: defaultFormat, formats, runtimePlacement },
        manifestFields: authoringRegistry.manifestFields.map((field) =>
          field.name === 'output'
            ? {
                ...outputField,
                default: { ...outputField.default, format: defaultFormat },
                fields: outputField.fields?.map((nested) =>
                  nested.name === 'format'
                    ? {
                        ...nested,
                        default: defaultFormat,
                        constraint: { kind: 'enum', values: formats },
                      }
                    : nested,
                ),
              }
            : field,
        ),
      });

    expect(
      authoringRegistryIntegrityIssues(
        coherentRegistry(['single-file'], { 'single-file': 'inline' }, 'single-file'),
      ),
    ).toContain('output format: registry domain differs from canonical output contract');
    expect(
      authoringRegistryIntegrityIssues(
        coherentRegistry(
          ['single-file', 'directory', 'cloud'],
          { 'single-file': 'inline', directory: 'external', cloud: 'external' },
          'single-file',
        ),
      ),
    ).toContain('output format: registry domain differs from canonical output contract');
    expect(
      authoringRegistryIntegrityIssues(
        coherentRegistry(
          ['single-file', 'directory'],
          { 'single-file': 'inline', directory: 'external' },
          'directory',
        ),
      ),
    ).toContain('output format: registry default differs from canonical output contract');
  });

  it('rejects page contract domain, default, and token projection drift', () => {
    const preset = authoringRegistry.manifestFields.find((field) => field.name === 'preset');
    const theme = authoringRegistry.manifestFields.find((field) => field.name === 'theme');
    const layout = authoringRegistry.manifestFields.find((field) => field.name === 'layout');
    const tokens = authoringRegistry.manifestFields.find((field) => field.name === 'tokens');
    if (
      preset === undefined ||
      theme === undefined ||
      layout === undefined ||
      tokens?.fields === undefined
    ) {
      throw new Error('Missing page manifest fields');
    }

    expect(
      authoringRegistryIntegrityIssues(
        unsafeRegistryWith({
          page: {
            ...authoringRegistry.page,
            presets: authoringRegistry.page.presets.slice(0, 2),
            themes: ['system', 'light'],
            layouts: ['document', 'landing'],
          },
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        'page preset: registry domain differs from canonical page contract',
        'page preset: manifest domain differs from registry domain',
        'page theme: registry domain differs from canonical page contract',
        'page theme: manifest domain differs from registry domain',
        'page layout: registry domain differs from canonical page contract',
        'page layout: manifest domain differs from registry domain',
      ]),
    );

    expect(
      authoringRegistryIntegrityIssues(
        unsafeRegistryWith({
          page: {
            ...authoringRegistry.page,
            motion: {
              ...authoringRegistry.page.motion,
              sectionReveal: {
                ...authoringRegistry.page.motion.sectionReveal,
                durationMs: authoringRegistry.page.motion.sectionReveal.durationMs + 1,
              },
            },
          },
        }),
      ),
    ).toContain('page motion: registry policy differs from canonical page contract');

    expect(
      authoringRegistryIntegrityIssues(
        registryWith({
          manifestFields: authoringRegistry.manifestFields.map((field) => {
            if (field.name === 'preset') return { ...preset, default: 'signal' };
            if (field.name === 'theme') return { ...theme, default: 'dark' };
            if (field.name === 'layout') return { ...layout, default: 'mixed' };
            return field;
          }) as [FieldDefinition, ...FieldDefinition[]],
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        'page preset: manifest default differs from registry default',
        'page theme: manifest default differs from registry default',
        'page layout: manifest default differs from registry default',
      ]),
    );

    expect(
      authoringRegistryIntegrityIssues(
        registryWith({
          manifestFields: authoringRegistry.manifestFields.filter(
            (field) => field.name !== 'tokens',
          ) as [FieldDefinition, ...FieldDefinition[]],
        }),
      ),
    ).toContain('page tokens: manifest token object is missing');

    const missingRadius = {
      ...tokens,
      fields: tokens.fields.filter((field) => field.name !== 'radius'),
    } as unknown as FieldDefinition;
    expect(
      authoringRegistryIntegrityIssues(
        registryWith({
          manifestFields: authoringRegistry.manifestFields.map((field) =>
            field.name === 'tokens' ? missingRadius : field,
          ) as [FieldDefinition, ...FieldDefinition[]],
        }),
      ),
    ).toContain('page tokens: manifest fields differ from registry token catalog');

    const divergentAccent = {
      ...tokens,
      fields: tokens.fields.map((field) =>
        field.name === 'accent'
          ? {
              ...field,
              default: 'coral',
              constraint: { kind: 'enum', values: ['indigo', 'coral'] },
            }
          : field,
      ),
    } as unknown as FieldDefinition;
    expect(
      authoringRegistryIntegrityIssues(
        registryWith({
          manifestFields: authoringRegistry.manifestFields.map((field) =>
            field.name === 'tokens' ? divergentAccent : field,
          ) as [FieldDefinition, ...FieldDefinition[]],
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        'page token accent: manifest domain differs from registry domain',
        'page token accent: manifest default differs from registry default',
      ]),
    );

    const incompleteStudio = {
      ...authoringRegistry.page.presets[0],
      tokens: {
        density: 'comfortable',
        font: 'sans',
        accent: 'indigo',
        width: 'standard',
      },
    };
    expect(
      authoringRegistryIntegrityIssues(
        unsafeRegistryWith({
          page: {
            ...authoringRegistry.page,
            presets: [
              incompleteStudio,
              authoringRegistry.page.presets[1],
              authoringRegistry.page.presets[2],
            ],
          },
        }),
      ),
    ).toContain('page preset studio: token fields differ from registry token catalog');
  });

  it('rejects structurally ambiguous fields and returns issues for malformed constraints', () => {
    const title = authoringRegistry.manifestFields.find((field) => field.name === 'title');
    const language = authoringRegistry.manifestFields.find((field) => field.name === 'language');
    if (title === undefined || language === undefined) {
      throw new Error('Missing title or language registry field');
    }

    const neither = { name: 'neither', description: 'No semantics.', required: false };
    expect(
      authoringRegistryIntegrityIssues(
        unsafeRegistryWith({ manifestFields: [neither, ...authoringRegistry.manifestFields] }),
      ),
    ).toContain('manifest.neither: expected exactly one of constraint or fields');

    const both = {
      ...title,
      fields: [
        {
          name: 'nested',
          description: 'Nested value.',
          required: false,
          constraint: { kind: 'string', normalization: 'trim', minLength: 1 },
        },
      ],
    };
    expect(
      authoringRegistryIntegrityIssues(
        unsafeRegistryWith({
          manifestFields: [both, ...authoringRegistry.manifestFields.slice(1)],
        }),
      ),
    ).toContain('manifest.title: expected exactly one of constraint or fields');

    const emptyObject = {
      name: 'emptyObject',
      description: 'Empty object.',
      required: false,
      fields: [],
    };
    expect(
      authoringRegistryIntegrityIssues(
        unsafeRegistryWith({
          manifestFields: [emptyObject, ...authoringRegistry.manifestFields],
        }),
      ),
    ).toContain('manifest.emptyObject: empty nested fields');

    const malformedLanguage = {
      ...language,
      constraint: { ...language.constraint, pattern: '[' },
    };
    const malformedLanguageIssues = authoringRegistryIntegrityIssues(
      unsafeRegistryWith({
        manifestFields: authoringRegistry.manifestFields.map((field) =>
          field.name === 'language' ? malformedLanguage : field,
        ),
        examples: [{ ...authoringRegistry.examples[0], title: '' }],
      }),
    );
    expect(malformedLanguageIssues).toEqual(
      expect.arrayContaining(['manifest.language: invalid string pattern', 'basic: empty title']),
    );

    const demo = directive('demo');
    const start = demo.attributes.find((attribute) => attribute.name === 'start');
    if (start?.constraint.kind !== 'integer') {
      throw new Error('Missing integer demo.start registry attribute');
    }
    const malformedStart = {
      ...start,
      constraint: { ...start.constraint, lexicalPattern: '[' },
    };
    const malformedStartIssues = authoringRegistryIntegrityIssues(
      unsafeRegistryWith({
        directives: authoringRegistry.directives.map((entry) =>
          entry.name === 'demo'
            ? {
                ...entry,
                attributes: entry.attributes.map((attribute) =>
                  attribute.name === 'start' ? malformedStart : attribute,
                ),
              }
            : entry,
        ),
      }),
    );
    expect(malformedStartIssues).toContain('demo.start: invalid integer lexical pattern');

    const point = directive('point');
    const value = point.attributes.find((attribute) => attribute.name === 'value');
    if (value?.constraint.kind !== 'number') {
      throw new Error('Missing number point.value registry attribute');
    }
    const malformedValue = {
      ...value,
      constraint: { ...value.constraint, multipleOf: 0 },
    };
    expect(
      authoringRegistryIntegrityIssues(
        unsafeRegistryWith({
          directives: authoringRegistry.directives.map((entry) =>
            entry.name === 'point'
              ? {
                  ...entry,
                  attributes: entry.attributes.map((attribute) =>
                    attribute.name === 'value' ? malformedValue : attribute,
                  ),
                }
              : entry,
          ),
        }),
      ),
    ).toContain('point.value: number multiple must be finite and positive');
  });

  it('classifies every trusted renderer through an exhaustive private disposition', () => {
    expect(
      authoringRegistry.directives.map((entry) => rendererDisposition(entry.behavior.renderer)),
    ).toEqual(authoringRegistry.directives.map(() => 'trusted-private-handler'));
  });
});

const structurallyCompleteRegistry: AuthoringRegistryDefinition = authoringRegistry;
void structurallyCompleteRegistry;

const supportedFormat: OutputFormatChoice = 'single-file';
void supportedFormat;
// @ts-expect-error Output formats are a closed package-owned domain.
const unsupportedFormat: OutputFormatChoice = 'cloud';
void unsupportedFormat;

// @ts-expect-error Registry fields require descriptions.
const structurallyIncompleteField: FieldDefinition = {
  name: 'missing-description',
  required: false,
  constraint: { kind: 'string', normalization: 'trim', minLength: 1 },
};
void structurallyIncompleteField;

// @ts-expect-error Scalar fields require a constraint and object fields require nested fields.
const structurallyMeaninglessField: FieldDefinition = {
  name: 'missing-semantics',
  description: 'No validation meaning.',
  required: false,
};
void structurallyMeaninglessField;

// @ts-expect-error A field cannot carry both scalar and object semantics.
const structurallyAmbiguousField: FieldDefinition = {
  name: 'ambiguous',
  description: 'Two validation meanings.',
  required: false,
  constraint: { kind: 'string', normalization: 'trim', minLength: 1 },
  fields: [
    {
      name: 'nested',
      description: 'Nested value.',
      required: false,
      constraint: { kind: 'string', normalization: 'trim', minLength: 1 },
    },
  ],
};
void structurallyAmbiguousField;

const structurallyEmptyObjectField: FieldDefinition = {
  name: 'empty-object',
  description: 'No nested semantics.',
  required: false,
  // @ts-expect-error Object fields require at least one nested field.
  fields: [],
};
void structurallyEmptyObjectField;

// @ts-expect-error Example identity requires title, description, classes, and starter metadata.
const structurallyIncompleteExample: ExampleDefinition = { id: 'incomplete', path: 'incomplete' };
void structurallyIncompleteExample;

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function directive(name: string): DirectiveDefinition {
  const result = authoringRegistry.directives.find((candidate) => candidate.name === name);
  if (result === undefined) throw new Error(`Missing directive ${name}`);
  return result;
}

function classifyConstraint(constraint: ConstraintDefinition): ConstraintDefinition['kind'] {
  switch (constraint.kind) {
    case 'string':
      return 'string';
    case 'integer':
      return 'integer';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'enum':
      return 'enum';
    default: {
      const exhaustive: never = constraint;
      return exhaustive;
    }
  }
}

function expectValidDefault(attribute: DirectiveDefinition['attributes'][number]): void {
  if (attribute.default === undefined) return;
  switch (attribute.constraint.kind) {
    case 'string':
    case 'enum':
      expect(typeof attribute.default).toBe('string');
      return;
    case 'integer':
      expect(Number.isInteger(attribute.default)).toBe(true);
      expect(attribute.default).toBeGreaterThanOrEqual(attribute.constraint.minimum ?? -Infinity);
      expect(attribute.default).toBeLessThanOrEqual(attribute.constraint.maximum ?? Infinity);
      return;
    case 'number':
      expect(typeof attribute.default).toBe('number');
      expect(Number.isFinite(attribute.default)).toBe(true);
      expect(attribute.default).toBeGreaterThanOrEqual(attribute.constraint.minimum ?? -Infinity);
      expect(attribute.default).toBeLessThanOrEqual(attribute.constraint.maximum ?? Infinity);
      return;
    case 'boolean':
      expect(typeof attribute.default).toBe('boolean');
      return;
    default: {
      assertNever(attribute.constraint);
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected registry discriminant: ${JSON.stringify(value)}`);
}

function registryWith(
  overrides: Partial<
    Pick<AuthoringRegistryDefinition, 'manifestFields' | 'directives' | 'capabilities' | 'examples'>
  >,
): AuthoringRegistryDefinition {
  return { ...authoringRegistry, ...overrides };
}

function unsafeRegistryWith(
  overrides: Readonly<Record<string, unknown>>,
): AuthoringRegistryDefinition {
  return { ...authoringRegistry, ...overrides } as unknown as AuthoringRegistryDefinition;
}
