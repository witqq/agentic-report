import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';
import matter from 'gray-matter';
import { afterEach, describe, expect, it } from 'vitest';
import type { Element, Root } from 'hast';
import rehypeSanitize from 'rehype-sanitize';
import remarkDirective from 'remark-directive';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import {
  type AuthoringRegistryDefinition,
  authoringRegistry,
  type DirectiveAttributeDefinition,
  type DirectiveDefinition,
  type DirectiveForm,
  type FieldDefinition,
} from '../../../src/authoring/registry.js';
import { authoringRegistryIntegrityIssues } from '../../../src/authoring/registry-integrity.js';
import { isNormalizedPackageRelativePosixPath } from '../../../src/authoring/local-reference.js';
import { interpretDirectiveAttributes } from '../../../src/authoring/schemas.js';
import { buildReport } from '../../../src/core/compiler.js';
import { AgenticReportError } from '../../../src/diagnostics.js';
import { getAuthoringSchema, getSourceContract } from '../../../src/discovery.js';
import { parseCodeTermMetadata } from '../../../src/render/directives.js';
import { projectSemanticSanitizeSchema, renderMarkdown } from '../../../src/render/markdown.js';
import { createTestWorkspace, removeTestWorkspace } from '../../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

describe('registry-driven semantic directives', () => {
  it('renders every registered directive and permitted form with registry defaults', async () => {
    const workspace = await trackedWorkspace('directive-renderers');
    await writeFile(path.join(workspace, 'data.json'), '{"local":true}\n');
    await writeFile(path.join(workspace, 'reader.woff'), 'package-owned-font-bytes');
    const markdown = [
      '# Registry renderers',
      '::contents',
      '::::section{title="Semantic section" id="semantic-section" nav="Section" width="wide" align="center" tone="accent" reveal="true"}',
      ':::lead',
      'Opening thesis.',
      ':::',
      'Section body.',
      ':::actions',
      '::action[Primary action]{href="#semantic-section" kind="primary"}',
      ':::',
      '::::',
      ':source-link{label="src/render/directives.ts:42" href="http://127.0.0.1:7789/open?path=%2Fworkspace%2Fagentic-report%2Fsrc%2Frender%2Fdirectives.ts&line=42"}',
      ':::callout{title="  Notice  "}',
      'Callout body.',
      ':::',
      ':::decision{title="Decision"}',
      'Decision body.',
      ':::',
      ':::decision{title="Typed decision" id="typed" required=true}',
      '::decision-option{id="yes" label="Yes"}',
      '::decision-option{id="no" label="No"}',
      ':::',
      ':::checklist{title="Typed checklist" id="checklist"}',
      '::check-item{id="gate" label="Gate complete" required=true}',
      ':::',
      ':::::response{title="Response" id="response"}',
      '::::question{id="scope" kind="bucket" title="Scope"}',
      '::bucket{id="do" label="Do"}',
      '::bucket{id="skip" label="Skip"}',
      '::item{id="task" label="Task" note="Explanation" meta="Issue 1" href="https://example.com/1" bucket="do" comment=true}',
      '::::',
      '::::question{id="choice" kind="item-single" title="Choice"}',
      '::option{id="yes" label="Yes"}',
      '::option{id="no" label="No"}',
      '::item{id="finding" label="Finding" note="Explanation" meta="Review 1" href="https://example.com/reviews/1"}',
      '::::',
      ':::::',
      '::::cards{title="Options"}',
      ':::card{title="One"}',
      'Card body.',
      ':::',
      '::::',
      ':::steps{title="Procedure"}',
      '1. First',
      '2. Second',
      ':::',
      ':::copyable',
      'Copyable prose body.',
      ':::',
      '::term{key="release-packet"}',
      ':::glossary{key="release-packet" term="Release packet"}',
      'A reusable definition.',
      ':::',
      ':::disclosure{title="Details"}',
      'Disclosure body.',
      ':::',
      '::::tabs{title="Views"}',
      ':::tab{label="Summary"}',
      'Tab body.',
      ':::',
      '::::',
      ':::modal{title="Checklist"}',
      'Modal body.',
      ':::',
      ':::popover{title="Context"}',
      'Popover body.',
      ':::',
      ':::filter{title="Find items"}',
      '- Alpha',
      '- Beta',
      ':::',
      ':::toggle{label="Show evidence"}',
      'Toggle body.',
      ':::',
      '::::chart{title="Build trend" description="Builds rise over time." type="line" x-label="Week" y-label="Builds"}',
      ':::series{label="Builds"}',
      '::point{label="W1" value="2.5"}',
      ':::',
      '::::',
      ':::diagram{title="Flow" description="Source becomes output." direction="right"}',
      '::group{id="input" label="Input"}',
      '::group{id="result" label="Result"}',
      '::node{id="source" label="Source" group="input" kind="accent"}',
      '::node{id="output" label="Output" group="result" kind="success"}',
      '::edge{from="source" to="output" label="compile"}',
      ':::',
      '::::timeline{title="Delivery" description="Two delivery phases."}',
      ':::event{date="Now" title="Build" kind="accent"}',
      'Event body.',
      ':::',
      '::::',
      ':::demo{title="Counter"}',
      'Static counter value.',
      ':::',
      ':asset[Named download]{src="data.json"}',
      '::asset{src="data.json"}',
      '::font{src="reader.woff" family="Reader Sans"}',
    ].join('\n');

    const rendered = await render(markdown, workspace);

    for (const directive of authoringRegistry.directives as readonly DirectiveDefinition[]) {
      expect(rendered.html, directive.name).toMatch(
        new RegExp(`class="[^"]*${directive.sanitizer.className}(?:\\s|")`, 'u'),
      );
    }
    expect(rendered.html).toContain('data-kind="info"');
    expect(rendered.html).toContain('data-start="0"');
    expect(rendered.html).toContain('data-step="1"');
    expect(rendered.html).toContain('>Notice</p>');
    expect(rendered.html).toContain('>Named download</a>');
    expect(rendered.html).toContain('>Download data.json</a>');
    expect(rendered.html).toContain('data:application/json;base64,');
    expect(rendered.fontCss).toContain('font-family:"Reader Sans"');
  });

  it('renders labelled top-level sections and safe ordinary action links', async () => {
    const workspace = await trackedWorkspace('section-actions');
    const rendered = await render(
      [
        '# Explicit structure',
        '::::section{title="Proof" id="proof" nav="Short proof" width="wide" align="center" tone="accent" reveal="true"}',
        'A package-owned section body.',
        ':::actions',
        '::action[Start here]{href="#proof" kind="primary"}',
        '::action[Read the guide]{href="../docs/guide.html" kind="secondary"}',
        '::action[HTTP mirror]{href="http://example.com/mirror" kind="quiet"}',
        '::action[Project home]{href="https://example.com/project" kind="quiet"}',
        '::action[Email owner]{href="mailto:owner@example.com" kind="quiet"}',
        ':::',
        '::::',
        ':::section{title="Proof" width="reading" align="start" tone="soft"}',
        'A repeated title receives a deterministic generated suffix.',
        ':::',
      ].join('\n'),
      workspace,
    );

    expect(rendered.html).toMatch(
      /<section class="semantic-section"[^>]*data-nav="Short proof"[^>]*data-width="wide"[^>]*data-align="center"[^>]*data-tone="accent"[^>]*data-reveal="true"[^>]*data-semantic="section"[^>]*id="proof"[^>]*aria-labelledby="proof-title">/u,
    );
    expect(rendered.html).toContain(
      '<h2 id="proof-title" class="semantic-section-title">Proof</h2>',
    );
    expect(rendered.html).toContain('id="proof-2" aria-labelledby="proof-2-title"');
    expect(rendered.html).toMatch(/data-reveal="false" data-semantic="section"[^>]*id="proof-2"/u);
    expect(rendered.html).toMatch(
      /<a class="semantic-action" data-kind="primary" data-semantic="action" href="#proof"><svg class="package-icon" data-package-icon="arrow-right"[^>]*>.*<\/svg>Start here<\/a>/u,
    );
    expect(rendered.html).toMatch(
      /data-package-icon="arrow-right"[^>]*>.*<\/svg>Read the guide<\/a>/u,
    );
    expect(rendered.html).toMatch(
      /data-package-icon="arrow-right"[^>]*>.*<\/svg>HTTP mirror<\/a>/u,
    );
    expect(rendered.html).toMatch(/href="\.\.\/docs\/guide\.html">.*Read the guide<\/a>/u);
    expect(rendered.html).toMatch(/href="http:\/\/example\.com\/mirror">.*HTTP mirror<\/a>/u);
    expect(rendered.html).toMatch(/href="https:\/\/example\.com\/project">.*Project home<\/a>/u);
    expect(rendered.html).toMatch(/href="mailto:owner@example\.com">.*Email owner<\/a>/u);
    expect(rendered.html).not.toMatch(/onclick|<script|javascript:/u);
  });

  it('rejects section and action structure or targets outside the closed contract', async () => {
    const workspace = await trackedWorkspace('section-action-negatives');
    const cases = [
      {
        label: 'duplicate section id',
        source:
          ':::section{title="One" id="same"}\nBody.\n:::\n:::section{title="Two" id="same"}\nBody.\n:::',
        code: 'DUPLICATE_SECTION_ID',
      },
      {
        label: 'nested section',
        source: '::::callout\n:::section{title="Nested"}\nBody.\n:::\n::::',
        code: 'INVALID_DIRECTIVE_PLACEMENT',
      },
      {
        label: 'unsafe section id',
        source: ':::section{title="Unsafe" id="Bad ID"}\nBody.\n:::',
        code: 'INVALID_DIRECTIVE_ATTRIBUTE',
      },
      {
        label: 'action outside group',
        source: '::action[Outside]{href="#target"}',
        code: 'INVALID_DIRECTIVE_PLACEMENT',
      },
      {
        label: 'missing action label',
        source: ':::actions\n::action{href="#target"}\n:::',
        code: 'DIRECTIVE_LABEL_REQUIRED',
      },
      {
        label: 'prose inside actions',
        source: ':::actions\nProse.\n::action[Valid]{href="#target"}\n:::',
        code: 'INVALID_DIRECTIVE_PLACEMENT',
      },
      {
        label: 'executable action target',
        source: ':::actions\n::action[Unsafe]{href="javascript:alert(1)"}\n:::',
        code: 'INVALID_DIRECTIVE_LINK',
      },
      {
        label: 'local-file action target',
        source: ':::actions\n::action[Unsafe]{href="file:///tmp/private"}\n:::',
        code: 'INVALID_DIRECTIVE_LINK',
      },
      {
        label: 'data action target',
        source: ':::actions\n::action[Unsafe]{href="data:text/html,private"}\n:::',
        code: 'INVALID_DIRECTIVE_LINK',
      },
      {
        label: 'root-absolute action target',
        source: ':::actions\n::action[Unsafe]{href="/private/report.html"}\n:::',
        code: 'INVALID_DIRECTIVE_LINK',
      },
      {
        label: 'protocol-relative action target',
        source: ':::actions\n::action[Unsafe]{href="//example.com/path"}\n:::',
        code: 'INVALID_DIRECTIVE_LINK',
      },
      {
        label: 'backslash action target',
        source: ':::actions\n::action[Unsafe]{href="docs\\\\private.html"}\n:::',
        code: 'INVALID_DIRECTIVE_LINK',
      },
    ] as const;

    for (const testCase of cases) {
      await expect(
        render(`# Invalid\n${testCase.source}\n`, workspace),
        testCase.label,
      ).rejects.toMatchObject({ diagnostic: { code: testCase.code } });
    }
  });

  it('renders bounded source links in a protected browsing context and rejects non-helper targets', async () => {
    const workspace = await trackedWorkspace('source-link');
    const href =
      'http://127.0.0.1:7789/open?path=%2Fworkspace%2Fagentic-report%2Fsrc%2Frender%2Fdirectives.ts&line=42';
    const rendered = await render(
      `# Source location\nOpen :source-link{label="src/render/directives.ts:42" href="${href}"} in the editor.\n`,
      workspace,
    );

    expect(rendered.html).toContain('class="semantic-source-link"');
    expect(rendered.html).toContain('data-semantic="source-link"');
    expect(rendered.html).toContain(`href="${href.replace('&', '&#x26;')}"`);
    expect(rendered.html).toContain('target="_blank"');
    expect(rendered.html).toContain('rel="noopener noreferrer"');
    expect(rendered.html).toContain('data-source-link=""');
    expect(rendered.html).toContain('data-package-icon="arrow-right"');
    expect(rendered.html).toContain('src/render/directives.ts:42</a>');
    expect(rendered.html).not.toContain('/workspace/agentic-report/src/render/directives.ts</a>');

    const maximumPortHref = href.replace(':7789/', ':65535/');
    const maximumPort = await render(
      `# Maximum port\n:source-link{label="file.ts:42" href="${maximumPortHref}"}\n`,
      workspace,
    );
    expect(maximumPort.html).toContain(`href="${maximumPortHref.replace('&', '&#x26;')}"`);

    const invalidTargets = [
      'https://127.0.0.1:7789/open?path=%2Fworkspace%2Ffile.ts&line=42',
      'http://localhost:7789/open?path=%2Fworkspace%2Ffile.ts&line=42',
      'http://192.0.2.1:7789/open?path=%2Fworkspace%2Ffile.ts&line=42',
      'http://127.0.0.1:65536/open?path=%2Fworkspace%2Ffile.ts&line=42',
      'http://127.0.0.1:7789/open?path=relative%2Ffile.ts&line=42',
      'http://127.0.0.1:7789/open?path=%2Fworkspace%2Ffile.ts&line=0',
      'http://127.0.0.1:7789/open?path=%2Fworkspace%2Ffile.ts',
      'javascript:alert(1)',
    ] as const;
    for (const target of invalidTargets) {
      await expect(
        render(`# Invalid\n:source-link{label="file.ts:42" href="${target}"}\n`, workspace),
        target,
      ).rejects.toMatchObject({ diagnostic: { code: 'INVALID_SOURCE_LINK' } });
    }
    await expect(
      render(`# Invalid\n:source-link{href="${href}"}\n`, workspace),
    ).rejects.toMatchObject({ diagnostic: { code: 'DIRECTIVE_ATTRIBUTE_REQUIRED' } });
    await expect(
      render(
        `# Invalid\n:source-link[not allowed]{label="file.ts:42" href="${href}"}\n`,
        workspace,
      ),
    ).rejects.toMatchObject({ diagnostic: { code: 'INVALID_DIRECTIVE_PLACEMENT' } });
  });

  it('reserves explicit section ids and allocates every generated document id page-wide', async () => {
    const workspace = await trackedWorkspace('section-id-allocation');
    await expect(
      render('# Shared\n\n:::section{title="Collision" id="shared"}\nBody.\n:::\n', workspace),
    ).rejects.toMatchObject({
      diagnostic: {
        code: 'DUPLICATE_SECTION_ID',
        source: {
          file: path.join(workspace, 'report.md'),
          line: 3,
          column: 1,
          endLine: 5,
          endColumn: 4,
        },
      },
    });

    const cases = [
      {
        label: 'explicit section before component',
        source:
          '# Page\n\n:::section{title="Reserved" id="modal-1"}\nBody.\n:::\n\n:::modal{title="Dialog"}\nBody.\n:::',
        sectionId: 'modal-1',
        componentId: 'modal-1-2',
      },
      {
        label: 'component before explicit section',
        source:
          '# Page\n\n:::modal{title="Dialog"}\nBody.\n:::\n\n:::section{title="Reserved" id="modal-1"}\nBody.\n:::',
        sectionId: 'modal-1',
        componentId: 'modal-1-2',
      },
      {
        label: 'generated section before component',
        source:
          '# Page\n\n:::section{title="Modal 1"}\nBody.\n:::\n\n:::modal{title="Dialog"}\nBody.\n:::',
        sectionId: 'modal-1',
        componentId: 'modal-1-2',
      },
      {
        label: 'component before generated section',
        source:
          '# Page\n\n:::modal{title="Dialog"}\nBody.\n:::\n\n:::section{title="Modal 1"}\nBody.\n:::',
        sectionId: 'modal-1-2',
        componentId: 'modal-1',
      },
    ] as const;

    for (const testCase of cases) {
      const rendered = await render(testCase.source, workspace);
      const ids = [...rendered.html.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
      expect(new Set(ids).size, testCase.label).toBe(ids.length);
      expect(rendered.html, testCase.label).toMatch(
        new RegExp(
          `<section class="semantic-section"[^>]*data-width="standard"[^>]*data-align="start"[^>]*data-tone="plain"[^>]*data-reveal="false"[^>]*data-semantic="section"[^>]*id="${testCase.sectionId}"`,
          'u',
        ),
      );
      expect(rendered.html, testCase.label).toContain(`<dialog id="${testCase.componentId}"`);
      expect(rendered.html, testCase.label).toContain(
        `aria-labelledby="${testCase.componentId}-title"`,
      );
    }

    const headingCollision = await render(
      '# Shared\n\n:::section{title="Shared"}\nGenerated identity remains stable by suffixing.\n:::\n',
      workspace,
    );
    expect(headingCollision.html).toContain('id="shared-2" aria-labelledby="shared-2-title"');

    const orderings = [
      '# Page\n\n:::section{title="Target"}\nGenerated first.\n:::\n\n:::section{title="Explicit" id="target"}\nExplicit second.\n:::',
      '# Page\n\n:::section{title="Explicit" id="target"}\nExplicit first.\n:::\n\n:::section{title="Target"}\nGenerated second.\n:::',
    ];
    for (const source of orderings) {
      const rendered = await render(source, workspace);
      expect(rendered.html).toContain(
        'id="target" aria-labelledby="target-title"><h2 id="target-title" class="semantic-section-title">Explicit</h2>',
      );
      expect(rendered.html).toContain(
        'id="target-2" aria-labelledby="target-2-title"><h2 id="target-2-title" class="semantic-section-title">Target</h2>',
      );
    }
  });

  it('interprets every registered attribute constraint, default and rendered property', () => {
    for (const directive of authoringRegistry.directives as readonly DirectiveDefinition[]) {
      const requiredInput = Object.fromEntries(
        directive.attributes
          .filter((attribute) => attribute.required)
          .map((attribute) => [attribute.name, validAttributeValue(attribute)]),
      );
      const defaults = interpretDirectiveAttributes(directive, requiredInput);
      expect(defaults.ok, directive.name).toBe(true);
      if (!defaults.ok) continue;
      for (const attribute of directive.attributes) {
        const value = defaults.values[attribute.name];
        if ('default' in attribute && attribute.default !== undefined) {
          expect(value).toBe(attribute.default);
        }
        if (attribute.required) expect(value).toBeDefined();

        const accepted = interpretDirectiveAttributes(directive, {
          ...requiredInput,
          [attribute.name]: validAttributeValue(attribute),
        });
        expect(accepted.ok, `${directive.name}.${attribute.name}`).toBe(true);

        const rejected = interpretDirectiveAttributes(directive, {
          ...requiredInput,
          [attribute.name]: invalidAttributeValue(attribute),
        });
        expect(rejected).toMatchObject({
          ok: false,
          reason: 'invalid',
          attribute: { name: attribute.name, renderProperty: attribute.renderProperty },
        });
      }
    }
  });

  it('projects every permitted form and explicit or default attribute into sanitized output', async () => {
    const workspace = await trackedWorkspace('directive-projection-matrix');
    await writeFile(path.join(workspace, 'local file.bin'), 'local-resource');

    for (const directive of authoringRegistry.directives as readonly DirectiveDefinition[]) {
      for (const form of directive.forms) {
        for (const attribute of directive.attributes) {
          const value = renderedAttributeValue(attribute);
          const markdown = directiveInvocation(directive, form, { [attribute.name]: value });
          const rendered = await render(`# Projection\n${markdown}\n`, workspace);
          assertRenderedAttribute(rendered, directive, attribute, value);
        }

        for (const attribute of directive.attributes.filter(
          (candidate) => candidate.default !== undefined,
        )) {
          const rendered = await render(
            `# Default projection\n${directiveInvocation(directive, form)}\n`,
            workspace,
          );
          assertRenderedAttribute(rendered, directive, attribute, attribute.default);
        }
      }
    }
  });

  it('rejects every unregistered directive form through the generic form interpreter', async () => {
    const workspace = await trackedWorkspace('directive-form-matrix');
    const forms = ['container', 'leaf', 'text'] as const;
    for (const directive of authoringRegistry.directives) {
      const attributes = directive.attributes
        .filter((attribute) => attribute.required)
        .map((attribute) => `${attribute.name}=${JSON.stringify(validAttributeValue(attribute))}`)
        .join(' ');
      for (const form of forms.filter(
        (candidate) => !(directive.forms as readonly string[]).includes(candidate),
      )) {
        const suffix = attributes.length === 0 ? '' : `{${attributes}}`;
        const invocation =
          form === 'container'
            ? `:::${directive.name}${suffix}\nBody\n:::`
            : form === 'text'
              ? `:${directive.name}[Label]${suffix}`
              : `::${directive.name}${suffix}`;
        await expect(
          render(`# Form matrix\n${invocation}\n`, workspace),
          `${directive.name}/${form}`,
        ).rejects.toMatchObject({ diagnostic: { code: 'INVALID_DIRECTIVE_FORM' } });
      }
    }
  });

  it('renders deterministic semantic interaction structure and documented initial state', async () => {
    const workspace = await trackedWorkspace('directive-interactions');
    const rendered = await render(
      [
        '# Interactions',
        'A :term[Authored alias]{key="shared-concept"} appears inside prose.',
        '::term{key="shared-concept"}',
        ':::glossary{key="shared-concept" term="Shared concept"}',
        'Definition body.',
        ':::',
        ':::disclosure{title="Native details" open="true"}',
        'Visible initially.',
        ':::',
        '::::tabs{title="First group"}',
        ':::tab{label="One"}',
        'First panel.',
        ':::',
        ':::tab{label="Two"}',
        'Second panel.',
        ':::',
        '::::',
        '::::tabs{title="Second group"}',
        ':::tab{label="Alpha"}',
        'Independent panel.',
        ':::',
        '::::',
        ':::modal{title="Review" trigger="Open review"}',
        'Dialog body.',
        ':::',
        ':::popover{title="Context" trigger="Show context"}',
        'Popover body.',
        ':::',
        ':::filter{title="Find" placeholder="Search entries"}',
        '- Alpha',
        '- Beta',
        ':::',
        ':::toggle{title="Evidence" label="Show evidence" default="on"}',
        'Visible toggle body.',
        ':::',
      ].join('\n'),
      workspace,
    );

    expect(rendered.html).toContain('data-term-reference="shared-concept" data-popover=""');
    expect(rendered.html).toContain('>Authored alias</button>');
    expect(rendered.html.match(/>Shared concept<\/button>/gu)).toHaveLength(1);
    expect(rendered.html.match(/>Shared concept<\/span>/gu)).toHaveLength(2);
    expect(rendered.html).toContain(
      '<button type="button" aria-controls="glossary-reference-1" aria-expanded="false"',
    );
    expect(rendered.html).toContain(
      'id="glossary-reference-1" role="dialog" aria-labelledby="glossary-reference-1-title"',
    );
    expect(rendered.html).toContain(
      '<button type="button" aria-controls="glossary-reference-2" aria-expanded="false"',
    );
    expect(rendered.html).toContain(
      'id="glossary-reference-2" role="dialog" aria-labelledby="glossary-reference-2-title"',
    );
    expect(rendered.html).toContain(
      '<span class="semantic-glossary-explanation">Definition body.</span>',
    );
    expect(rendered.html).toContain(
      '<a href="#glossary-shared-concept" class="semantic-glossary-link" data-glossary-definition-link="">View full definition</a>',
    );
    expect(rendered.html).toContain('id="glossary-shared-concept"');
    expect(rendered.html).toMatch(/<details[^>]*data-disclosure=""[^>]*open/u);
    expect(rendered.html).toContain('<summary class="semantic-disclosure-summary">Native details');
    expect(rendered.html).toContain('id="tabs-1-tab-1"');
    expect(rendered.html).toContain('id="tabs-2-tab-1"');
    expect(rendered.html).toContain('aria-selected="true" tabindex="0"');
    expect(rendered.html).toContain('aria-selected="false" tabindex="-1"');
    expect(rendered.html).toContain('<dialog id="modal-3"');
    expect(rendered.html).toContain('id="popover-4" role="dialog"');
    expect(rendered.html).toContain('placeholder="Search entries"');
    expect(rendered.html).toContain('role="switch" aria-checked="true"');
    expect(rendered.html).not.toMatch(/onclick|onkeydown|<script/u);
  });

  it('preserves authored term forms and annotates first highlighted code occurrences in an appendix-backed glossary', async () => {
    const workspace = await trackedWorkspace('directive-code-glossary');
    const rendered = await render(
      [
        '# Code glossary',
        'Traversal continues through :term[concepts]{key="concept"}.',
        '## Code',
        '```typescript terms="own-field,node-type"',
        '@d.def(Node) accessor child!: Node;',
        '@d.def(Node) accessor sibling!: Node;',
        '<script>globalThis.executed = true;</script>',
        '```',
        '## Detail',
        'Definitions follow outside the primary route.',
        ':::glossary{key="concept" term="concept"}',
        'Canonical prose definition.',
        ':::',
        ':::glossary{key="own-field" term="@d.def" placement="appendix"}',
        'Field ownership decorator.',
        ':::',
        ':::glossary{key="node-type" term="Node" placement="appendix"}',
        'Canonical node type.',
        ':::',
      ].join('\n'),
      workspace,
    );

    expect(rendered.html).toContain('>concepts</button>');
    expect(rendered.html).toContain('>concept</span>');
    expect(rendered.html.match(/data-term-reference="own-field"/gu)).toHaveLength(1);
    expect(rendered.html.match(/data-term-reference="node-type"/gu)).toHaveLength(1);
    expect(rendered.html.match(/class="semantic-term semantic-code-term"/gu)).toHaveLength(2);
    expect(rendered.html).toMatch(
      /data-term-reference="own-field"[\s\S]*?<button[^>]*>[\s\S]*?--shiki-light/u,
    );
    expect(rendered.html).toMatch(
      /data-term-reference="own-field"[\s\S]*?<button[^>]*>[\s\S]*?--shiki-dark/u,
    );
    expect(rendered.html).toContain('&#x3C;');
    expect(rendered.html).toContain('globalThis.executed');
    expect(rendered.html).not.toContain('<script>globalThis.executed = true;</script>');
    expect(rendered.html).toContain(
      '<aside id="glossary-appendix" class="semantic-glossary-appendix"',
    );
    expect(rendered.html).toContain('data-navigation-exclude=""');
    expect(rendered.html.indexOf('id="glossary-own-field"')).toBeGreaterThan(
      rendered.html.indexOf('data-glossary-appendix=""'),
    );
    expect(rendered.html.indexOf('id="glossary-node-type"')).toBeGreaterThan(
      rendered.html.indexOf('id="glossary-own-field"'),
    );
    expect(rendered.html).toContain('href="#glossary-own-field"');
    expect(rendered.observedDirectives).toContain('term');
    expect(rendered.reviewTargets.filter((target) => target.kind === 'markdown:code')).toHaveLength(
      1,
    );
    const movedDefinitionTarget = rendered.reviewTargets.find(
      (target) => target.kind === 'directive:glossary' && target.source.line === 14,
    )?.id;
    expect(movedDefinitionTarget).toBeTypeOf('string');
    expect(rendered.html).toContain(`data-review-target="${movedDefinitionTarget}"`);
    expect(rendered.html.match(/data-review-target=/gu)).toHaveLength(
      rendered.reviewTargets.length,
    );
  });

  it('rejects malformed, unresolved, missing and overlapping code term metadata at the code block', async () => {
    const workspace = await trackedWorkspace('directive-code-glossary-errors');
    const cases = [
      {
        name: 'malformed metadata',
        code: 'INVALID_CODE_TERM_METADATA',
        source: '```ts terms=own-field\n@d.def(Node)\n```',
        definitions: ':::glossary{key="own-field" term="@d.def"}\nDefinition.\n:::',
      },
      {
        name: 'metadata mixed with another field',
        code: 'INVALID_CODE_TERM_METADATA',
        source: '```ts terms="own-field" title="Code"\n@d.def(Node)\n```',
        definitions: ':::glossary{key="own-field" term="@d.def"}\nDefinition.\n:::',
      },
      {
        name: 'duplicate key',
        code: 'INVALID_CODE_TERM_METADATA',
        source: '```ts terms="own-field,own-field"\n@d.def(Node)\n```',
        definitions: ':::glossary{key="own-field" term="@d.def"}\nDefinition.\n:::',
      },
      {
        name: 'unknown key',
        code: 'UNKNOWN_GLOSSARY_TERM',
        source: '```ts terms="unknown"\n@d.def(Node)\n```',
        definitions: ':::glossary{key="own-field" term="@d.def"}\nDefinition.\n:::',
      },
      {
        name: 'canonical text missing',
        code: 'CODE_TERM_NOT_FOUND',
        source: '```ts terms="own-field"\nplain code\n```',
        definitions: ':::glossary{key="own-field" term="@d.def"}\nDefinition.\n:::',
      },
      {
        name: 'overlapping canonical terms',
        code: 'OVERLAPPING_CODE_TERMS',
        source: '```ts terms="decorator,member"\n@d.def(Node)\n```',
        definitions: [
          ':::glossary{key="decorator" term="@d.def"}',
          'Definition.',
          ':::',
          ':::glossary{key="member" term="def"}',
          'Definition.',
          ':::',
        ].join('\n'),
      },
    ] as const;
    for (const testCase of cases) {
      await expect(
        render(`# Invalid code terms\n${testCase.source}\n${testCase.definitions}\n`, workspace),
        testCase.name,
      ).rejects.toMatchObject({
        diagnostic: {
          code: testCase.code,
          source: { file: path.join(workspace, 'report.md'), line: 2, column: 1 },
        },
      });
    }
  });

  it('bounds the closed code term metadata grammar without interpreting unrelated fence metadata', () => {
    const contract = authoringRegistry.source.codeFenceMetadata.terms;
    const maximumKeys = Array.from(
      { length: contract.maxItems },
      (_, index) => `term-${index + 1}`,
    );
    expect(parseCodeTermMetadata(`terms="${maximumKeys.join(contract.separator)}"`)).toEqual({
      kind: 'valid',
      keys: maximumKeys,
    });
    expect(
      parseCodeTermMetadata(
        `terms="${[...maximumKeys, `term-${contract.maxItems + 1}`].join(contract.separator)}"`,
      ),
    ).toMatchObject({ kind: 'invalid' });
    expect(parseCodeTermMetadata('terms=""')).toMatchObject({ kind: 'invalid' });
    expect(parseCodeTermMetadata('terms="Uppercase"')).toMatchObject({ kind: 'invalid' });
    expect(parseCodeTermMetadata('title="terms remain ordinary text"')).toEqual({ kind: 'none' });
    expect(getSourceContract().source.codeFenceMetadata.terms).toEqual(contract);
    expect(contract.itemConstraint).toEqual(
      authoringRegistry.directives
        .find((directive) => directive.name === 'glossary')
        ?.attributes.find((attribute) => attribute.name === 'key')?.constraint,
    );
  });

  it('rejects appendix extraction from a nested authored container', async () => {
    const workspace = await trackedWorkspace('directive-glossary-nested-appendix');
    await expect(
      render(
        [
          '# Nested appendix',
          '::::callout{title="Parent"}',
          ':::glossary{key="nested" term="Nested" placement="appendix"}',
          'Definition.',
          ':::',
          '::::',
        ].join('\n'),
        workspace,
      ),
    ).rejects.toMatchObject({
      diagnostic: {
        code: 'INVALID_DIRECTIVE_PLACEMENT',
        source: { file: path.join(workspace, 'report.md'), line: 3, column: 1 },
      },
    });
  });

  it('maps code term metadata failures to the authored partial range', async () => {
    const workspace = await trackedWorkspace('directive-code-glossary-partial');
    const partialFile = path.join(workspace, 'partials', 'code.md');
    const markdown = '```ts terms="unknown"\n@d.def(Node)\n```';
    await expect(
      renderMarkdown(markdown, {
        sourceRoot: workspace,
        format: 'single-file',
        sourceMap: [
          {
            generatedStart: 0,
            generatedEnd: markdown.length,
            sourceFile: partialFile,
            sourceStart: 0,
            sourceText: markdown,
          },
        ],
      }),
    ).rejects.toMatchObject({
      diagnostic: {
        code: 'UNKNOWN_GLOSSARY_TERM',
        source: { file: partialFile, line: 1, column: 1, endLine: 3, endColumn: 4 },
        details: { key: 'unknown' },
      },
    });
  });

  it('validates visualization records and emits deterministic accessible markup', async () => {
    const workspace = await trackedWorkspace('directive-visualizations');
    const source = [
      '# Visuals',
      '::::chart{title="Trend" description="Two aligned series." type="line"}',
      ':::series{label="One"}',
      '::point{label="A" value="1.5"}',
      '::point{label="B" value="2"}',
      ':::',
      ':::series{label="Two"}',
      '::point{label="A" value="2.5"}',
      '::point{label="B" value="3"}',
      ':::',
      '::::',
      ':::diagram{title="Flow" description="A validated edge."}',
      '::node{id="a" label="A"}',
      '::node{id="b" label="B" kind="success"}',
      '::edge{from="a" to="b" label="next"}',
      ':::',
      '::::timeline{title="Path" description="One phase."}',
      ':::event{date="Now" title="Ship" kind="accent"}',
      'Verified detail.',
      ':::',
      '::::',
    ].join('\n');
    const first = await render(source, workspace);
    const second = await render(source, workspace);
    expect(second.html).toBe(first.html);
    expect(first.html).toContain(
      'role="img" aria-labelledby="visual-1-title" aria-describedby="visual-1-description"',
    );
    expect(first.html).toContain(
      'Two aligned series. Data: One, A: 1.5; One, B: 2; Two, A: 2.5; Two, B: 3.',
    );
    expect(first.html).toContain('data-node-id="a"');
    expect(first.html).toContain(
      'A validated edge. Groups: none. Nodes: a: A; b: B. Connections: a to b: next.',
    );
    expect(first.html).not.toMatch(/class="semantic-(?:point|node)[^"]*"[^>]*role=/u);
    expect(first.html).toContain('class="semantic-event visualization-timeline-event');
    expect(first.html.match(/class="semantic-series"/gu)).toHaveLength(2);
    expect(first.html).toContain('</span>One</li>');
    expect(first.html).toContain('</span>Two</li>');
    expect(first.html).not.toContain('</span>A</li>');
    expect(first.html).not.toMatch(/<canvas|<script|javascript:/u);

    const rightDiagram = await render(
      '# Right\n:::diagram{title="Right" description="Horizontal nodes." direction="right"}\n::node{id="a" label="A"}\n::node{id="b" label="B"}\n:::\n',
      workspace,
    );
    const downDiagram = await render(
      '# Down\n:::diagram{title="Down" description="Vertical nodes." direction="down"}\n::node{id="a" label="A"}\n::node{id="b" label="B"}\n:::\n',
      workspace,
    );
    expect(diagramNodePosition(rightDiagram.html, 'b')).toEqual({ x: 270, y: 38 });
    expect(diagramNodePosition(downDiagram.html, 'b')).toEqual({ x: 50, y: 160 });

    const precise = await render(
      '# Precise\n::::chart{title="Precise" description="Small distinct values." type="line"}\n:::series{label="Metric"}\n::point{label="A" value="0.0001"}\n::point{label="B" value="0.0002"}\n:::\n::::\n',
      workspace,
    );
    expect(precise.html).toContain(
      'Small distinct values. Data: Metric, A: 0.0001; Metric, B: 0.0002.',
    );
    expect(precise.html).toContain('>0.00005</text>');

    const longEdgeLabel = '12345678901234567890🛰 complete connection meaning';
    const labelledDiagram = await render(
      `# Labelled\n:::diagram{title="Labelled" description="Complete edge data."}\n::node{id="a" label="A"}\n::node{id="b" label="B"}\n::edge{from="a" to="b" label="${longEdgeLabel}"}\n:::\n`,
      workspace,
    );
    expect(labelledDiagram.html).toContain(
      `Complete edge data. Groups: none. Nodes: a: A; b: B. Connections: a to b: ${longEdgeLabel}.`,
    );
    expect(labelledDiagram.html).toContain('>12345678901234567890🛰…</text>');
    expect(labelledDiagram.html).not.toContain('\uFFFD');

    const escaped = await render(
      [
        '# Escaped',
        '::::chart{title="Safe &lt;title&gt;" description="No &lt;script&gt; element." type="line"}',
        ':::series{label="Series &quot; onclick=&quot;run()"}',
        '::point{label="&lt;img src=x onerror=run()&gt;" value="1"}',
        ':::',
        '::::',
      ].join('\n'),
      workspace,
    );
    expect(escaped.html).toContain('Safe &#x3C;title>');
    expect(escaped.html).toContain(
      'Data: Series " onclick="run(), &#x3C;img src=x onerror=run()>: 1.',
    );
    expect(escaped.html).not.toMatch(/<script>|onclick="run\(\)"/u);

    const repeatedSeries = (count: number): string[] =>
      Array.from({ length: count }, (_, index) => [
        `:::series{label="Series ${index + 1}"}`,
        `::point{label="A" value="${index + 1}"}`,
        ':::',
      ]).flat();
    const repeatedPoints = (count: number): string[] =>
      Array.from(
        { length: count },
        (_, index) => `::point{label="Point ${index + 1}" value="${index + 1}"}`,
      );
    const repeatedNodes = (count: number): string[] =>
      Array.from(
        { length: count },
        (_, index) => `::node{id="node-${index + 1}" label="Node ${index + 1}"}`,
      );
    const repeatedEdges = (count: number): string[] =>
      Array.from(
        { length: count },
        (_, index) => `::edge{from="a" to="b" label="Edge ${index + 1}"}`,
      );
    const repeatedEvents = (count: number): string[] =>
      Array.from({ length: count }, (_, index) => [
        `:::event{date="Phase ${index + 1}" title="Event ${index + 1}"}`,
        'Detail.',
        ':::',
      ]).flat();
    const invalidVisualizations = [
      {
        name: 'misaligned chart labels',
        line: 6,
        source: [
          '::::chart{title="Mismatch" description="Mismatched labels."}',
          ':::series{label="One"}',
          '::point{label="A" value="1"}',
          ':::',
          ':::series{label="Two"}',
          '::point{label="B" value="2"}',
          ':::',
          '::::',
        ],
      },
      {
        name: 'duplicate chart labels',
        line: 3,
        source: [
          '::::chart{title="Duplicates" description="Repeated category."}',
          ':::series{label="One"}',
          '::point{label="A" value="1"}',
          '::point{label="A" value="2"}',
          ':::',
          '::::',
        ],
      },
      {
        name: 'chart without series',
        line: 2,
        source: [':::chart{title="Empty" description="No series."}', ':::'],
      },
      {
        name: 'chart above the series limit',
        line: 2,
        source: [
          '::::chart{title="Crowded" description="Too many series."}',
          ...repeatedSeries(7),
          '::::',
        ],
      },
      {
        name: 'series without points',
        line: 3,
        source: [
          '::::chart{title="Empty series" description="No points."}',
          ':::series{label="One"}',
          ':::',
          '::::',
        ],
      },
      {
        name: 'series above the point limit',
        line: 3,
        source: [
          '::::chart{title="Crowded series" description="Too many points."}',
          ':::series{label="One"}',
          ...repeatedPoints(13),
          ':::',
          '::::',
        ],
      },
      {
        name: 'pie with multiple series',
        line: 2,
        source: [
          '::::chart{title="Split pie" description="Too many series." type="pie"}',
          ...repeatedSeries(2),
          '::::',
        ],
      },
      {
        name: 'negative pie value',
        line: 3,
        source: [
          '::::chart{title="Pie" description="Negative slice." type="pie"}',
          ':::series{label="Share"}',
          '::point{label="A" value="-1"}',
          ':::',
          '::::',
        ],
      },
      {
        name: 'all-zero pie',
        line: 3,
        source: [
          '::::chart{title="Pie" description="Zero total." type="pie"}',
          ':::series{label="Share"}',
          '::point{label="A" value="0"}',
          '::point{label="B" value="0"}',
          ':::',
          '::::',
        ],
      },
      {
        name: 'prose directly in a chart',
        line: 2,
        source: [':::chart{title="Prose" description="Invalid child."}', 'Text.', ':::'],
      },
      {
        name: 'prose directly in a series',
        line: 3,
        source: [
          '::::chart{title="Prose" description="Invalid series child."}',
          ':::series{label="One"}',
          'Text.',
          ':::',
          '::::',
        ],
      },
      {
        name: 'diagram without nodes',
        line: 2,
        source: [':::diagram{title="Empty" description="No nodes."}', ':::'],
      },
      {
        name: 'diagram above the node limit',
        line: 2,
        source: [
          ':::diagram{title="Crowded" description="Too many nodes."}',
          ...repeatedNodes(21),
          ':::',
        ],
      },
      {
        name: 'diagram above the edge limit',
        line: 2,
        source: [
          ':::diagram{title="Crowded" description="Too many edges."}',
          '::node{id="a" label="A"}',
          '::node{id="b" label="B"}',
          ...repeatedEdges(41),
          ':::',
        ],
      },
      {
        name: 'duplicate diagram ids',
        line: 2,
        source: [
          ':::diagram{title="Duplicates" description="Repeated ids."}',
          '::node{id="same" label="One"}',
          '::node{id="same" label="Two"}',
          ':::',
        ],
      },
      {
        name: 'unknown diagram endpoint',
        line: 4,
        source: [
          ':::diagram{title="Broken" description="Unknown target."}',
          '::node{id="a" label="A"}',
          '::edge{from="a" to="missing"}',
          ':::',
        ],
      },
      {
        name: 'diagram self-edge',
        line: 4,
        source: [
          ':::diagram{title="Loop" description="Self edge."}',
          '::node{id="a" label="A"}',
          '::edge{from="a" to="a"}',
          ':::',
        ],
      },
      {
        name: 'grouped flow with only one group',
        line: 2,
        source: [
          ':::diagram{title="One group" description="Unsupported group count."}',
          '::group{id="only" label="Only"}',
          '::node{id="a" label="A" group="only"}',
          ':::',
        ],
      },
      {
        name: 'grouped flow above the group limit',
        line: 2,
        source: [
          ':::diagram{title="Four groups" description="Unsupported group count."}',
          '::group{id="one" label="One"}',
          '::group{id="two" label="Two"}',
          '::group{id="three" label="Three"}',
          '::group{id="four" label="Four"}',
          '::node{id="a" label="A" group="one"}',
          ':::',
        ],
      },
      {
        name: 'grouped flow with duplicate group ids',
        line: 2,
        source: [
          ':::diagram{title="Duplicate groups" description="Group ids are unique."}',
          '::group{id="same" label="One"}',
          '::group{id="same" label="Two"}',
          '::node{id="a" label="A" group="same"}',
          ':::',
        ],
      },
      {
        name: 'grouped flow with unsupported down direction',
        line: 2,
        source: [
          ':::diagram{title="Grouped down" description="Columns are rightward." direction="down"}',
          '::group{id="one" label="One"}',
          '::group{id="two" label="Two"}',
          '::node{id="a" label="A" group="one"}',
          '::node{id="b" label="B" group="two"}',
          ':::',
        ],
      },
      {
        name: 'grouped flow with an unassigned node',
        line: 5,
        source: [
          ':::diagram{title="Unassigned" description="Every node needs membership."}',
          '::group{id="one" label="One"}',
          '::group{id="two" label="Two"}',
          '::node{id="a" label="A"}',
          ':::',
        ],
      },
      {
        name: 'grouped flow with an unknown group',
        line: 5,
        source: [
          ':::diagram{title="Unknown group" description="Missing membership target."}',
          '::group{id="one" label="One"}',
          '::group{id="two" label="Two"}',
          '::node{id="a" label="A" group="missing"}',
          ':::',
        ],
      },
      {
        name: 'grouped flow with an empty group',
        line: 4,
        source: [
          ':::diagram{title="Empty group" description="Every group needs a member."}',
          '::group{id="one" label="One"}',
          '::group{id="two" label="Two"}',
          '::node{id="a" label="A" group="one"}',
          ':::',
        ],
      },
      {
        name: 'sequence with flow direction',
        line: 2,
        source: [
          ':::diagram{title="Sequence" description="Direction is inapplicable." type="sequence" direction="down"}',
          '::node{id="a" label="A"}',
          '::node{id="b" label="B"}',
          '::edge{from="a" to="b" label="call"}',
          ':::',
        ],
      },
      {
        name: 'sequence with explicit right direction',
        line: 2,
        source: [
          ':::diagram{title="Sequence" description="Any explicit direction is inapplicable." type="sequence" direction="right"}',
          '::node{id="a" label="A"}',
          '::node{id="b" label="B"}',
          '::edge{from="a" to="b" label="call"}',
          ':::',
        ],
      },
      {
        name: 'sequence below the participant minimum',
        line: 2,
        source: [
          ':::diagram{title="Sequence" description="One participant is insufficient." type="sequence"}',
          '::node{id="a" label="A"}',
          ':::',
        ],
      },
      {
        name: 'sequence below the message minimum',
        line: 2,
        source: [
          ':::diagram{title="Sequence" description="A message is required." type="sequence"}',
          '::node{id="a" label="A"}',
          '::node{id="b" label="B"}',
          ':::',
        ],
      },
      {
        name: 'sequence with a group record',
        line: 3,
        source: [
          ':::diagram{title="Sequence" description="Groups are flow-only." type="sequence"}',
          '::group{id="flow" label="Flow group"}',
          '::node{id="a" label="A"}',
          '::node{id="b" label="B"}',
          '::edge{from="a" to="b" label="call"}',
          ':::',
        ],
      },
      {
        name: 'sequence participant with group membership',
        line: 3,
        source: [
          ':::diagram{title="Sequence" description="Membership is flow-only." type="sequence"}',
          '::node{id="a" label="A" group="flow"}',
          '::node{id="b" label="B"}',
          '::edge{from="a" to="b" label="call"}',
          ':::',
        ],
      },
      {
        name: 'sequence self-message',
        line: 5,
        source: [
          ':::diagram{title="Sequence" description="Self messages are unsupported." type="sequence"}',
          '::node{id="a" label="A"}',
          '::node{id="b" label="B"}',
          '::edge{from="a" to="a" label="recursive call"}',
          ':::',
        ],
      },
      {
        name: 'sequence without a message label',
        line: 5,
        source: [
          ':::diagram{title="Sequence" description="Labels are required." type="sequence"}',
          '::node{id="a" label="A"}',
          '::node{id="b" label="B"}',
          '::edge{from="a" to="b"}',
          ':::',
        ],
      },
      {
        name: 'sequence above the participant limit',
        line: 2,
        source: [
          ':::diagram{title="Sequence" description="Too many participants." type="sequence"}',
          ...repeatedNodes(7),
          '::edge{from="node-1" to="node-2" label="call"}',
          ':::',
        ],
      },
      {
        name: 'sequence above the message limit',
        line: 2,
        source: [
          ':::diagram{title="Sequence" description="Too many messages." type="sequence"}',
          '::node{id="a" label="A"}',
          '::node{id="b" label="B"}',
          ...repeatedEdges(41),
          ':::',
        ],
      },
      {
        name: 'prose directly in a diagram',
        line: 2,
        source: [':::diagram{title="Prose" description="Invalid child."}', 'Text.', ':::'],
      },
      {
        name: 'timeline without events',
        line: 2,
        source: [':::timeline{title="Empty" description="No events."}', ':::'],
      },
      {
        name: 'timeline above the event limit',
        line: 2,
        source: [
          '::::timeline{title="Crowded" description="Too many events."}',
          ...repeatedEvents(21),
          '::::',
        ],
      },
      {
        name: 'prose directly in a timeline',
        line: 2,
        source: [':::timeline{title="Prose" description="Invalid child."}', 'Text.', ':::'],
      },
    ] as const;
    for (const testCase of invalidVisualizations) {
      await expect(
        render(`# Invalid\n${testCase.source.join('\n')}\n`, workspace),
        testCase.name,
      ).rejects.toMatchObject({
        diagnostic: {
          code: 'INVALID_VISUALIZATION_DATA',
          source: {
            file: path.join(workspace, 'report.md'),
            line: testCase.line,
            column: 1,
          },
        },
      });
    }
    await expect(
      render(
        '# Invalid number\n::::chart{title="Trend" description="Bad numeric token."}\n:::series{label="One"}\n::point{label="A" value="NaN"}\n:::\n::::\n',
        workspace,
      ),
    ).rejects.toMatchObject({ diagnostic: { code: 'INVALID_DIRECTIVE_ATTRIBUTE' } });
  });

  it('renders bounded grouped flows and ordered sequence diagrams with complete accessible data', async () => {
    const workspace = await trackedWorkspace('directive-large-diagrams');
    const groupIds = ['source', 'compiler', 'reader'] as const;
    const groupedNodes = Array.from({ length: 18 }, (_, index) => {
      const group = groupIds[Math.floor(index / 6)] ?? groupIds[0];
      return `::node{id="step-${index + 1}" label="Step ${index + 1} detail" group="${group}" kind="${index % 3 === 0 ? 'accent' : 'neutral'}"}`;
    });
    const groupedEdges = Array.from(
      { length: 17 },
      (_, index) =>
        `::edge{from="step-${index + 1}" to="step-${index + 2}" label="handoff ${index + 1}"}`,
    );
    const groupedSource = [
      '# Grouped flow',
      ':::diagram{title="Code tour flow" description="Eighteen participants across three subsystems." type="flow"}',
      '::group{id="source" label="Authentication and authorization services"}',
      '::group{id="compiler" label="Compiler pipeline"}',
      '::group{id="reader" label="Reader artifact"}',
      ...groupedNodes,
      ...groupedEdges,
      '::edge{from="step-1" to="step-4" label="validated shortcut"}',
      '::edge{from="step-5" to="step-17" label="evidence bypass"}',
      '::edge{from="step-2" to="step-9" label="second subsystem handoff"}',
      '::edge{from="step-18" to="step-3" label="reverse feedback"}',
      ':::',
    ].join('\n');
    const firstGrouped = await render(groupedSource, workspace);
    const secondGrouped = await render(groupedSource, workspace);
    expect(secondGrouped.html).toBe(firstGrouped.html);
    expect(firstGrouped.html).toContain('data-diagram-type="flow"');
    expect(firstGrouped.html.match(/data-group-id=/gu)).toHaveLength(3);
    expect(firstGrouped.html.match(/data-node-id=/gu)).toHaveLength(18);
    expect(firstGrouped.html.match(/visualization-group-edge/gu)).toHaveLength(2);
    expect(firstGrouped.html.match(/visualization-group-internal-edge/gu)).toHaveLength(1);
    expect(firstGrouped.html.match(/visualization-group-outer-edge/gu)).toHaveLength(3);
    expect(firstGrouped.html).toContain(
      'Groups: source: Authentication and authorization services (step-1, step-2, step-3, step-4, step-5, step-6); compiler: Compiler pipeline (step-7, step-8, step-9, step-10, step-11, step-12); reader: Reader artifact (step-13, step-14, step-15, step-16, step-17, step-18).',
    );
    expect(firstGrouped.html).toContain('>Authentication and</text>');
    expect(firstGrouped.html).toContain('>authorization services</text>');
    expect(firstGrouped.html).toContain('viewBox="0 0 816 772"');

    const sequenceSource = [
      '# Sequence',
      ':::diagram{title="Compile request" description="A request crosses four participants." type="sequence"}',
      '::node{id="agent" label="Authoring agent"}',
      '::node{id="loader" label="Source loader"}',
      '::node{id="compiler" label="Compiler"}',
      '::node{id="browser" label="Browser"}',
      '::edge{from="agent" to="loader" label="load source"}',
      '::edge{from="loader" to="compiler" label="validated graph"}',
      '::edge{from="compiler" to="browser" label="write artifact"}',
      '::edge{from="browser" to="agent" label="review result"}',
      ':::',
    ].join('\n');
    const firstSequence = await render(sequenceSource, workspace);
    const secondSequence = await render(sequenceSource, workspace);
    expect(secondSequence.html).toBe(firstSequence.html);
    expect(firstSequence.html).toContain('data-diagram-type="sequence"');
    expect(firstSequence.html.match(/data-participant=/gu)).toHaveLength(4);
    expect(firstSequence.html.match(/data-message-order=/gu)).toHaveLength(4);
    expect(firstSequence.html).toContain(
      'Messages in order: 1. agent to loader: load source; 2. loader to compiler: validated graph; 3. compiler to browser: write artifact; 4. browser to agent: review result.',
    );

    const maximumFlow = await render(
      [
        '# Maximum flow',
        ':::diagram{title="Maximum flow" description="Twenty nodes remain supported."}',
        ...Array.from(
          { length: 20 },
          (_, index) => `::node{id="maximum-${index + 1}" label="Maximum ${index + 1}"}`,
        ),
        ':::',
      ].join('\n'),
      workspace,
    );
    expect(maximumFlow.html.match(/data-node-id="maximum-/gu)).toHaveLength(20);

    const maximumFlowEdges = await render(
      [
        '# Maximum flow edges',
        ':::diagram{title="Maximum edges" description="Forty flow edges remain supported."}',
        '::node{id="edge-a" label="A"}',
        '::node{id="edge-b" label="B"}',
        ...Array.from(
          { length: 40 },
          (_, index) => `::edge{from="edge-a" to="edge-b" label="Flow edge ${index + 1}"}`,
        ),
        ':::',
      ].join('\n'),
      workspace,
    );
    expect(maximumFlowEdges.html.match(/data-edge=/gu)).toHaveLength(40);

    const minimumSequence = await render(
      [
        '# Minimum sequence',
        ':::diagram{title="Minimum sequence" description="Two participants and one message." type="sequence"}',
        '::node{id="minimum-a" label="A"}',
        '::node{id="minimum-b" label="B"}',
        '::edge{from="minimum-a" to="minimum-b" label="Only message"}',
        ':::',
      ].join('\n'),
      workspace,
    );
    expect(minimumSequence.html.match(/data-participant=/gu)).toHaveLength(2);
    expect(minimumSequence.html.match(/data-message-order=/gu)).toHaveLength(1);

    const maximumSequence = await render(
      [
        '# Maximum sequence',
        ':::diagram{title="Maximum sequence" description="Six participants and forty messages." type="sequence"}',
        ...Array.from(
          { length: 6 },
          (_, index) => `::node{id="participant-${index + 1}" label="Participant ${index + 1}"}`,
        ),
        ...Array.from(
          { length: 40 },
          (_, index) =>
            `::edge{from="participant-${(index % 6) + 1}" to="participant-${((index + 1) % 6) + 1}" label="Message ${index + 1}"}`,
        ),
        ':::',
      ].join('\n'),
      workspace,
    );
    expect(maximumSequence.html.match(/data-message-order=/gu)).toHaveLength(40);
  });

  it('requires every registered glossary occurrence to use a reference without flagging excluded contexts', async () => {
    const workspace = await trackedWorkspace('directive-glossary');
    const accepted = await render(
      [
        '# Glossary',
        'A :term[Bounded runtime]{key="bounded-runtime"} reference is allowed in prose.',
        '`Bounded runtime` is allowed in inline code.',
        '```text',
        'Bounded runtime is allowed in a code block.',
        '```',
        ':::glossary{key="bounded-runtime" term="Bounded runtime"}',
        'The definition body is excluded from occurrence checks.',
        ':::',
      ].join('\n'),
      workspace,
    );
    expect(accepted.html).toContain('data-term-reference="bounded-runtime"');

    await expect(
      render(
        [
          '# Predictable inflection boundary',
          'Unmarked bounded runtimes are not claimed as morphologically checked.',
          ':::glossary{key="bounded-runtime" term="bounded runtime"}',
          'Definition.',
          ':::',
        ].join('\n'),
        workspace,
      ),
    ).resolves.toMatchObject({ html: expect.stringContaining('bounded runtimes') });

    await expect(
      render(
        [
          '# Glossary',
          ':::glossary{key="bounded-runtime" term="Bounded runtime"}',
          'Definition.',
          ':::',
          'A Bounded runtime occurrence is not marked.',
        ].join('\n'),
        workspace,
      ),
    ).rejects.toMatchObject({
      diagnostic: {
        code: 'UNMARKED_GLOSSARY_TERM',
        remediation: 'Replace this occurrence with :term[Bounded runtime]{key="bounded-runtime"}.',
        source: { file: path.join(workspace, 'report.md'), line: 5, column: 3 },
        details: { key: 'bounded-runtime' },
      },
    });
  });

  it('rejects glossary terms split by inline Markdown and emits applicable bracket-safe remediation', async () => {
    const workspace = await trackedWorkspace('directive-glossary-inline-formatting');
    const splitSource = [
      '# Glossary',
      'A Decision **packet** is not marked.',
      ':::glossary{key="decision-packet" term="Decision packet"}',
      'Definition.',
      ':::',
    ].join('\n');
    await expect(render(splitSource, workspace)).rejects.toMatchObject({
      diagnostic: {
        code: 'UNMARKED_GLOSSARY_TERM',
        remediation: 'Replace this occurrence with :term[Decision packet]{key="decision-packet"}.',
        source: {
          file: path.join(workspace, 'report.md'),
          line: 2,
          column: 3,
          endLine: 2,
          endColumn: 22,
        },
      },
    });
    const repairedSplit = await render(
      splitSource.replace('Decision **packet**', ':term[Decision packet]{key="decision-packet"}'),
      workspace,
    );
    expect(repairedSplit.html).toContain('data-term-reference="decision-packet"');
    expect(repairedSplit.html).toContain('>Decision packet</button>');

    const softBreakSource = [
      '# Glossary',
      'A Decision',
      'packet is not marked across a soft line break.',
      ':::glossary{key="decision-packet" term="Decision packet"}',
      'Definition.',
      ':::',
    ].join('\n');
    await expect(render(softBreakSource, workspace)).rejects.toMatchObject({
      diagnostic: {
        code: 'UNMARKED_GLOSSARY_TERM',
        remediation: 'Replace this occurrence with :term[Decision packet]{key="decision-packet"}.',
        source: {
          file: path.join(workspace, 'report.md'),
          line: 2,
          column: 3,
          endLine: 3,
          endColumn: 7,
        },
      },
    });

    const hardBreakSource = [
      '# Glossary',
      'A Decision  ',
      'packet is not marked across a hard line break.',
      ':::glossary{key="decision-packet" term="Decision packet"}',
      'Definition.',
      ':::',
    ].join('\n');
    await expect(render(hardBreakSource, workspace)).rejects.toMatchObject({
      diagnostic: {
        code: 'UNMARKED_GLOSSARY_TERM',
        remediation: 'Replace this occurrence with :term[Decision packet]{key="decision-packet"}.',
        source: {
          file: path.join(workspace, 'report.md'),
          line: 2,
          column: 3,
          endLine: 3,
          endColumn: 7,
        },
      },
    });
    const repairedHardBreak = await render(
      hardBreakSource.replace(
        'Decision  \npacket',
        ':term[Decision packet]{key="decision-packet"}',
      ),
      workspace,
    );
    expect(repairedHardBreak.html).toContain('>Decision packet</button>');

    for (const sourceWithDecodedPrefix of [
      {
        source: 'Lead &amp; Decision packet is not marked.',
        column: 12,
        endColumn: 27,
      },
      {
        source: 'Lead \\* Decision packet is not marked.',
        column: 9,
        endColumn: 24,
      },
    ]) {
      const encodedSource = [
        '# Glossary',
        sourceWithDecodedPrefix.source,
        ':::glossary{key="decision-packet" term="Decision packet"}',
        'Definition.',
        ':::',
      ].join('\n');
      await expect(render(encodedSource, workspace)).rejects.toMatchObject({
        diagnostic: {
          code: 'UNMARKED_GLOSSARY_TERM',
          source: {
            file: path.join(workspace, 'report.md'),
            line: 2,
            column: sourceWithDecodedPrefix.column,
            endLine: 2,
            endColumn: sourceWithDecodedPrefix.endColumn,
          },
        },
      });
      const repairedEncoded = await render(
        encodedSource.replace('Decision packet', ':term[Decision packet]{key="decision-packet"}'),
        workspace,
      );
      expect(repairedEncoded.html).toContain('>Decision packet</button>');
    }

    const bracketedSource = [
      '# Glossary',
      'A Phase [beta] occurrence is not marked.',
      ':::glossary{key="phase-beta" term="Phase [beta]"}',
      'Definition.',
      ':::',
    ].join('\n');
    await expect(render(bracketedSource, workspace)).rejects.toMatchObject({
      diagnostic: {
        code: 'UNMARKED_GLOSSARY_TERM',
        remediation: 'Replace this occurrence with :term[Phase \\[beta\\]]{key="phase-beta"}.',
      },
    });

    const repaired = await render(
      bracketedSource.replace('Phase [beta]', ':term[Phase \\[beta\\]]{key="phase-beta"}'),
      workspace,
    );
    expect(repaired.html).toContain('data-term-reference="phase-beta"');
    expect(repaired.html).toContain('>Phase [beta]</button>');

    const formattedSuffixSource = [
      '# Glossary',
      'A Decision **packet details** remain visible.',
      ':::glossary{key="decision-packet" term="Decision packet"}',
      'Definition.',
      ':::',
    ].join('\n');
    await expect(render(formattedSuffixSource, workspace)).rejects.toMatchObject({
      diagnostic: {
        code: 'UNMARKED_GLOSSARY_TERM',
        remediation:
          'Replace this occurrence with :term[Decision packet]{key="decision-packet"} details.',
        source: {
          file: path.join(workspace, 'report.md'),
          line: 2,
          column: 3,
          endLine: 2,
          endColumn: 30,
        },
      },
    });
    const repairedSuffix = await render(
      formattedSuffixSource.replace(
        'Decision **packet details**',
        ':term[Decision packet]{key="decision-packet"} details',
      ),
      workspace,
    );
    expect(repairedSuffix.html).toContain('>Decision packet</button>');
    expect(repairedSuffix.html).toContain('details remain visible.</p>');

    const linkedSource = [
      '# Glossary',
      'A [Decision packet details](https://example.com) link is not a term reference.',
      ':::glossary{key="decision-packet" term="Decision packet"}',
      'Definition.',
      ':::',
    ].join('\n');
    await expect(render(linkedSource, workspace)).rejects.toMatchObject({
      diagnostic: {
        code: 'UNMARKED_GLOSSARY_TERM',
        remediation:
          'Replace this occurrence with :term[Decision packet]{key="decision-packet"} details.',
        source: { file: path.join(workspace, 'report.md'), line: 2, column: 3 },
      },
    });
    const repairedLink = await render(
      linkedSource.replace(
        '[Decision packet details](https://example.com)',
        ':term[Decision packet]{key="decision-packet"} details',
      ),
      workspace,
    );
    expect(repairedLink.html).toContain('>Decision packet</button>');
    expect(repairedLink.html).toContain('details link is not a term reference.</p>');
    expect(repairedLink.html).not.toContain('https://example.com');
  });

  it('applies compiler remediation across literal and atomic character-reference mappings', async () => {
    const workspace = await trackedWorkspace('directive-glossary-character-references');
    const cases = [
      {
        name: 'unknown',
        source: [
          '# Glossary',
          'An &bogus; occurrence is not marked.',
          ':::glossary{key="bogus" term="bogus"}',
          'Definition.',
          ':::',
        ].join('\n'),
        expectedSource: { line: 2, column: 5, endLine: 2, endColumn: 10 },
        expectedReplacement: ':term[bogus]{key="bogus"}',
        expectedRepairedOccurrence: 'An &:term[bogus]{key="bogus"}; occurrence is not marked.',
        expectedHtml: ['>bogus</button>', '; occurrence is not marked.'],
      },
      {
        name: 'multi-character',
        source: [
          '# Glossary',
          'A &NotEqualTilde; occurrence is not marked.',
          ':::glossary{key="not-equal" term="≂"}',
          'Definition.',
          ':::',
        ].join('\n'),
        expectedSource: { line: 2, column: 3, endLine: 2, endColumn: 18 },
        expectedReplacement: ':term[≂]{key="not-equal"}̸',
        expectedRepairedOccurrence: 'A :term[≂]{key="not-equal"}̸ occurrence is not marked.',
        expectedHtml: ['>≂</button>', '̸ occurrence is not marked.'],
      },
    ] as const;

    for (const testCase of cases) {
      const sourceFile = path.join(workspace, 'report.md');
      const outputFile = path.join(workspace, `${testCase.name}.html`);
      await writeFile(sourceFile, testCase.source);
      let failure: AgenticReportError | undefined;
      try {
        await buildReport({ input: workspace, output: outputFile });
      } catch (error) {
        if (!(error instanceof AgenticReportError)) throw error;
        failure = error;
      }
      expect(failure?.diagnostic).toMatchObject({
        code: 'UNMARKED_GLOSSARY_TERM',
        source: { file: sourceFile, ...testCase.expectedSource },
        remediation: `Replace this occurrence with ${testCase.expectedReplacement}.`,
      });
      if (failure === undefined) throw new Error('Expected an unmarked glossary diagnostic.');

      const repaired = applyDiagnosticRemediation(testCase.source, failure);
      expect(repaired).toContain(testCase.expectedRepairedOccurrence);
      await writeFile(sourceFile, repaired);
      await buildReport({ input: workspace, output: outputFile });
      const html = await readFile(outputFile, 'utf8');
      for (const expected of testCase.expectedHtml) expect(html).toContain(expected);
    }
  });

  it('maps an unmarked glossary occurrence in an expanded partial to its authored range', async () => {
    const workspace = await trackedWorkspace('directive-glossary-partial');
    await mkdir(path.join(workspace, 'partials'));
    const partialPath = path.join(workspace, 'partials', 'finding.md');
    await writeFile(
      partialPath,
      ['Partial introduction.', 'A Bounded runtime occurrence is not marked.'].join('\n'),
    );
    await writeFile(
      path.join(workspace, 'report.md'),
      [
        '# Partial glossary',
        ':::glossary{key="bounded-runtime" term="Bounded runtime"}',
        'Definition.',
        ':::',
        '{{include: partials/finding.md}}',
      ].join('\n'),
    );

    await expect(
      buildReport({ input: workspace, output: path.join(workspace, 'artifact.html') }),
    ).rejects.toMatchObject({
      diagnostic: {
        code: 'UNMARKED_GLOSSARY_TERM',
        source: { file: partialPath, line: 2, column: 3 },
        details: { key: 'bounded-runtime' },
      },
    });
  });

  it('rejects duplicate glossary definitions and unresolved references at authored ranges', async () => {
    const workspace = await trackedWorkspace('directive-glossary-errors');
    await expect(
      render(
        [
          '# Duplicate',
          ':::glossary{key="one" term="Canonical term"}',
          'First.',
          ':::',
          ':::glossary{key="two" term="Canonical term"}',
          'Second.',
          ':::',
        ].join('\n'),
        workspace,
      ),
    ).rejects.toMatchObject({
      diagnostic: {
        code: 'DUPLICATE_GLOSSARY_DEFINITION',
        source: { file: path.join(workspace, 'report.md'), line: 5, column: 1 },
      },
    });
    await expect(
      render('# Missing\n::term{key="unknown-term"}\n', workspace),
    ).rejects.toMatchObject({
      diagnostic: {
        code: 'UNKNOWN_GLOSSARY_TERM',
        source: { file: path.join(workspace, 'report.md'), line: 2, column: 1 },
      },
    });
  });

  it('preserves directive diagnostics for names, forms, attributes, paths and placement', async () => {
    const workspace = await trackedWorkspace('directive-negatives');
    const cases = [
      ['unknown name', ':::unknown\nBody\n:::', 'UNSUPPORTED_DIRECTIVE'],
      ['wrong form', '::callout', 'INVALID_DIRECTIVE_FORM'],
      [
        'unknown attribute',
        ':::demo{title="Counter" onclick="run"}\nBody\n:::',
        'UNKNOWN_DIRECTIVE_ATTRIBUTE',
      ],
      [
        'prototype-like attribute',
        ':::callout{constructor="pollute"}\nBody\n:::',
        'UNKNOWN_DIRECTIVE_ATTRIBUTE',
      ],
      ['required attribute', '::asset', 'DIRECTIVE_ATTRIBUTE_REQUIRED'],
      ['invalid token', ':::callout{kind="Warning"}\nBody\n:::', 'INVALID_DIRECTIVE_ATTRIBUTE'],
      ['invalid integer', ':::demo{start="1000000"}\nBody\n:::', 'INVALID_DIRECTIVE_ATTRIBUTE'],
      ['remote path', '::asset{src="https://example.invalid/file"}', 'INVALID_DIRECTIVE_PATH'],
      ['parent traversal', '::asset{src="../file"}', 'INVALID_DIRECTIVE_PATH'],
      ['invalid family', '::font{src="font.woff" family="Bad;Family"}', 'INVALID_FONT_FAMILY'],
      ['card outside cards', ':::card\nBody\n:::', 'INVALID_DIRECTIVE_PLACEMENT'],
      [
        'non-card directive in cards',
        '::::cards\n:::callout\nBody\n:::\n::::',
        'INVALID_DIRECTIVE_PLACEMENT',
        3,
      ],
      [
        'non-tab directive in tabs',
        '::::tabs\n:::callout\nBody\n:::\n::::',
        'INVALID_DIRECTIVE_PLACEMENT',
        3,
      ],
    ] as const;

    for (const [label, markdown, code, expectedLine = 2] of cases) {
      await expect(render(`# Report\n${markdown}\n`, workspace), label).rejects.toMatchObject({
        diagnostic: {
          code,
          source: { file: path.join(workspace, 'report.md'), line: expectedLine, column: 1 },
        },
      });
    }
    for (const attribute of ['__proto__', 'prototype', 'constructor']) {
      for (const spelling of [attribute, `${attribute}="pollute"`]) {
        await expect(
          render(`# Report\n:::callout{${spelling}}\nSafe body.\n:::\n`, workspace),
          spelling,
        ).rejects.toMatchObject({
          diagnostic: {
            code: 'UNKNOWN_DIRECTIVE_ATTRIBUTE',
            source: { file: path.join(workspace, 'report.md'), line: 2, column: 1 },
          },
        });
      }
    }
    await expect(
      render('# Report\n:::callout{title}\nSafe body.\n:::\n', workspace),
    ).rejects.toMatchObject({ diagnostic: { code: 'INVALID_DIRECTIVE_ATTRIBUTE' } });
    await expect(render('# Report\n::asset{src}\n', workspace)).rejects.toMatchObject({
      diagnostic: { code: 'INVALID_DIRECTIVE_PATH' },
    });
    for (const titleAttribute of [
      'title="Safe constructor=value prototype=shape __proto__=token"',
      "title='Safe constructor=value prototype=shape __proto__=token'",
    ]) {
      const accepted = await render(
        `# Report\n:::callout{${titleAttribute}}\nSafe body.\n:::\n`,
        workspace,
      );
      expect(accepted.html).toContain(
        '>Safe constructor=value prototype=shape __proto__=token</p>',
      );
    }
    await writeFile(path.join(workspace, 'label.bin'), 'label-resource');
    const labelControl = await render(
      '# Report\n:asset[Safe {constructor=value} label]{src="label.bin"}\n',
      workspace,
    );
    expect(labelControl.html).toContain('Safe {constructor=value} label</a>');
    for (const label of [
      'Safe \\] {constructor=value} label',
      'Safe \\[nested\\] {prototype=value} label',
    ]) {
      const escapedLabel = await render(`# Report\n:asset[${label}]{src="label.bin"}\n`, workspace);
      expect(escapedLabel.html).toContain('class="semantic-asset"');
      expect(escapedLabel.html).toContain('{');
      expect(escapedLabel.html).toContain('label</a>');
    }
    const multilineKnown = await render(
      '# Report\n:asset[Multiline]{\nsrc="label.bin"\n}\n',
      workspace,
    );
    expect(multilineKnown.html).toContain('>Multiline</a>');
    for (const protectedAttribute of [
      '__proto__',
      '__proto__="pollute"',
      'prototype',
      'prototype="pollute"',
      'constructor',
      'constructor="pollute"',
    ]) {
      await expect(
        render(
          `# Report\n:asset[Multiline]{\nsrc="label.bin"\n${protectedAttribute}\n}\n`,
          workspace,
        ),
        `multiline ${protectedAttribute}`,
      ).rejects.toMatchObject({
        diagnostic: {
          code: 'UNKNOWN_DIRECTIVE_ATTRIBUTE',
          source: { file: path.join(workspace, 'report.md'), line: 2, column: 1 },
        },
      });
    }
    expect(
      (Object.prototype as unknown as Readonly<Record<string, unknown>>).polluted,
    ).toBeUndefined();
  });

  it('enforces every registry-declared direct parent for valid, absent and wrong parents', async () => {
    const workspace = await trackedWorkspace('directive-parent-matrix');
    const required = (authoringRegistry.directives as readonly DirectiveDefinition[]).filter(
      (directive) => directive.placement.requiredParent !== undefined,
    );
    expect(required.length).toBeGreaterThan(0);

    for (const directive of required) {
      const requiredParent = directive.placement.requiredParent;
      if (requiredParent === undefined) throw new Error('Required parent disappeared');
      const valid = ['series', 'point', 'group', 'node', 'edge', 'event'].includes(directive.name)
        ? visualizationInvocation(directive.name, {})
        : nestedDirectiveInvocation(requiredParent, directive.name);
      expect((await render(`# Valid parent\n${valid}\n`, workspace)).html).toMatch(
        new RegExp(`class="[^"]*${directive.sanitizer.className}(?:\\s|")`, 'u'),
      );

      await expect(
        render(`# Missing parent\n${bareDirectiveInvocation(directive)}\n`, workspace),
      ).rejects.toMatchObject({ diagnostic: { code: 'INVALID_DIRECTIVE_PLACEMENT' } });

      const wrongParent = (authoringRegistry.directives as readonly DirectiveDefinition[]).find(
        (candidate) =>
          candidate.forms.includes('container') &&
          candidate.name !== requiredParent &&
          candidate.name !== directive.name,
      );
      if (wrongParent === undefined)
        throw new Error(`No wrong parent fixture for ${directive.name}`);
      await expect(
        render(
          `# Wrong parent\n${nestedDirectiveInvocation(wrongParent.name, directive.name)}\n`,
          workspace,
        ),
      ).rejects.toMatchObject({ diagnostic: { code: 'INVALID_DIRECTIVE_PLACEMENT' } });
    }
  });

  it('rejects ambiguous typed review component identities and keeps legacy decisions static', async () => {
    const workspace = await trackedWorkspace('typed-review-components');
    const legacy = await render(
      '# Legacy\n\n:::decision{title="Static"}\nMarkdown only.\n:::',
      workspace,
    );
    expect(legacy.html).toContain('class="semantic-decision"');
    expect(legacy.html).not.toContain('semantic-decision-option');
    await expect(
      render(
        '# Missing id\n\n:::decision{title="Typed"}\n::decision-option{id="one" label="One"}\n:::',
        workspace,
      ),
    ).rejects.toMatchObject({ diagnostic: { code: 'INVALID_DIRECTIVE_ATTRIBUTE' } });
    await expect(
      render(
        '# Duplicate\n\n:::checklist{title="Gates" id="gates"}\n::check-item{id="same" label="One"}\n::check-item{id="same" label="Two"}\n:::',
        workspace,
      ),
    ).rejects.toMatchObject({ diagnostic: { code: 'INVALID_DIRECTIVE_ATTRIBUTE' } });
    for (const mixed of [
      ':::decision{title="Typed" id="typed"}\nMarkdown is not allowed here.\n::decision-option{id="one" label="One"}\n:::',
      ':::checklist{title="Gates" id="gates"}\nMarkdown is not allowed here.\n::check-item{id="one" label="One"}\n:::',
    ]) {
      await expect(render(`# Mixed\n\n${mixed}`, workspace)).rejects.toMatchObject({
        diagnostic: { code: 'INVALID_DIRECTIVE_PLACEMENT' },
      });
    }
    await mkdir(path.join(workspace, 'partials'), { recursive: true });
    const partial = path.join(workspace, 'partials', 'mixed.md');
    await writeFile(
      partial,
      ':::decision{title="Typed" id="typed"}\nMixed partial prose.\n::decision-option{id="one" label="One"}\n:::\n',
    );
    await writeFile(
      path.join(workspace, 'report.md'),
      '---\ntitle: Mixed partial\n---\n# Mixed partial\n{{include: partials/mixed.md}}\n',
    );
    await expect(
      buildReport({ input: workspace, output: path.join(workspace, 'out.html') }),
    ).rejects.toMatchObject({
      diagnostic: {
        code: 'INVALID_DIRECTIVE_PLACEMENT',
        source: { file: partial },
      },
    });
    const excessive = Array.from(
      { length: 501 },
      (_, index) => `::decision-option{id="option-${index}" label="Option ${index}"}`,
    ).join('\n');
    await expect(
      render(
        `# Limit\n\n:::decision{title="Too many" id="too-many"}\n${excessive}\n:::`,
        workspace,
      ),
    ).rejects.toMatchObject({ diagnostic: { code: 'INVALID_DIRECTIVE_PLACEMENT' } });
  });

  it('maps invalid placement in an expanded partial to the authored partial range', async () => {
    const workspace = await trackedWorkspace('directive-partial-placement');
    await mkdir(path.join(workspace, 'partials'));
    const partialPath = path.join(workspace, 'partials', 'card.md');
    await writeFile(partialPath, 'Intro.\n:::card\nOutside cards.\n:::\n');
    await writeFile(
      path.join(workspace, 'report.md'),
      '# Placement\n{{include: partials/card.md}}\n',
    );

    await expect(
      buildReport({ input: workspace, output: path.join(workspace, 'artifact.html') }),
    ).rejects.toMatchObject({
      diagnostic: {
        code: 'INVALID_DIRECTIVE_PLACEMENT',
        source: { file: partialPath, line: 2, column: 1 },
      },
    });
  });

  it('derives exact sanitizer tags, classes and properties from the registry', async () => {
    const schema = projectSemanticSanitizeSchema(authoringRegistry);
    for (const directive of authoringRegistry.directives) {
      expect(schema.tagNames).toContain(directive.sanitizer.tagName);
      const definitions = schema.attributes?.[directive.sanitizer.tagName] ?? [];
      const classDefinition = definitions.find(
        (definition) => Array.isArray(definition) && definition[0] === 'className',
      );
      expect(classDefinition).toBeDefined();
      const classRules = Array.isArray(classDefinition) ? classDefinition.slice(1) : [];
      expect(
        classRules.some(
          (rule) => rule instanceof RegExp && rule.test(directive.sanitizer.className),
        ),
        directive.name,
      ).toBe(true);
      for (const property of directive.sanitizer.properties) {
        expect(definitions, `${directive.name}.${property}`).toContain(property);
      }
    }
    expect(schema.tagNames).not.toContain('button');
    expect(schema.tagNames).not.toContain('output');

    const workspace = await trackedWorkspace('directive-sanitize');
    const rendered = await render(
      [
        '# Sanitizer',
        '',
        '<section class="semantic-demo" data-demo-counter onclick="run()">hostile</section>',
        '',
        ':::callout{title="Safe"}',
        '',
        '<img src="missing.png" onerror="run()">',
        '',
        '<script>run()</script>',
        '',
        'Trusted Markdown.',
        ':::',
      ].join('\n'),
      workspace,
    );
    expect(rendered.html).toContain('class="semantic-callout"');
    expect(rendered.html).toContain('Trusted Markdown.');
    expect(rendered.html).not.toContain('onclick');
    expect(rendered.html).not.toContain('onerror');
    expect(rendered.html).not.toContain('<script');
    expect(rendered.html).not.toContain('hostile');
  });

  it('removes undeclared semantic HAST at the actual sanitizer boundary', async () => {
    const schema = projectSemanticSanitizeSchema(authoringRegistry);
    const declaredProperty = 'dataKind';
    const declaredNodes = (authoringRegistry.directives as readonly DirectiveDefinition[]).map(
      (directive) =>
        element(
          directive.sanitizer.tagName,
          {
            className: [directive.sanitizer.className],
            ...Object.fromEntries(
              directive.sanitizer.properties.map((property) => [property, property]),
            ),
          },
          `declared-${directive.name}`,
        ),
    );
    const tree: Root = {
      type: 'root',
      children: [
        ...declaredNodes,
        element('aside', {
          className: ['semantic-callout'],
          dataSemantic: 'callout',
          [declaredProperty]: 'warning',
          dataUnknown: 'remove-me',
          onClick: 'remove-me',
          dataStart: 'cross-tag-remove',
        }),
        element('section', { className: ['semantic-not-registered'], dataSemantic: 'callout' }),
        element('custom-semantic', {
          className: ['semantic-callout'],
          dataSemantic: 'callout',
        }),
      ],
    };
    const sanitized = (await unified().use(rehypeSanitize, schema).run(tree)) as Root;
    const elements = sanitized.children.filter(
      (child): child is Element => child.type === 'element',
    );
    for (const directive of authoringRegistry.directives as readonly DirectiveDefinition[]) {
      const declared = elements.find(
        (elementNode) =>
          elementNode.children[0]?.type === 'text' &&
          elementNode.children[0].value === `declared-${directive.name}`,
      );
      expect(declared, directive.name).toBeDefined();
      expect(declared?.properties.className, directive.name).toEqual([
        directive.sanitizer.className,
      ]);
      for (const property of directive.sanitizer.properties) {
        expect(declared?.properties, `${directive.name}.${property}`).toHaveProperty(property);
      }
    }
    const callout = elements.find(
      (elementNode) =>
        elementNode.tagName === 'aside' &&
        elementNode.children[0]?.type === 'text' &&
        elementNode.children[0].value === 'aside',
    );
    expect(callout?.properties).toMatchObject({
      className: ['semantic-callout'],
      dataSemantic: 'callout',
      dataKind: 'warning',
    });
    expect(callout?.properties).not.toHaveProperty('dataUnknown');
    expect(callout?.properties).not.toHaveProperty('onClick');
    expect(callout?.properties).not.toHaveProperty('dataStart');
    expect(
      elements.some((elementNode) =>
        (elementNode.properties.className as string[] | undefined)?.includes(
          'semantic-not-registered',
        ),
      ),
    ).toBe(false);
    expect(elements.some((elementNode) => elementNode.tagName === 'custom-semantic')).toBe(false);
  });

  it('fails registry integrity when a renderer property is missing from sanitizer metadata', () => {
    const demo = authoringRegistry.directives.find((directive) => directive.name === 'demo');
    if (demo === undefined) throw new Error('Missing demo registry entry');
    const mutated = {
      ...authoringRegistry,
      directives: authoringRegistry.directives.map((directive) =>
        directive.name === 'demo'
          ? {
              ...directive,
              sanitizer: {
                ...directive.sanitizer,
                properties: directive.sanitizer.properties.filter(
                  (property) => property !== 'dataStep',
                ),
              },
            }
          : directive,
      ),
    };
    expect(
      authoringRegistryIntegrityIssues(mutated as unknown as AuthoringRegistryDefinition),
    ).toContain('demo: sanitizer properties differ from rendered properties');
  });
});

describe('six-class declarative registry corpus', () => {
  it('builds every source class in both supported output formats', async () => {
    const outputRoot = await trackedWorkspace('registry-corpus-output');
    const corpusRoot = path.resolve('tests/fixtures/authoring/corpus');
    const classes = [
      'research-report',
      'architecture-report',
      'tutorial',
      'work-report',
      'landing-page',
      'offline-private-report',
    ] as const;
    const directiveForms = new Set<string>();
    const directiveAttributes = new Set<string>();
    const requiredPlacements = new Set<string>();
    const manifestPaths = new Set<string>();
    const compiledCorpusHtml: string[] = [];
    const publicContract = getSourceContract();
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    ajv.addKeyword({
      keyword: 'x-agentic-report-contract',
      schemaType: 'object',
      valid: true,
    });
    ajv.addFormat('relative-local-path', {
      type: 'string',
      validate: isNormalizedPackageRelativePosixPath,
    });
    const validateDirective = ajv.compile(getAuthoringSchema('directives'));
    const validateSource = ajv.compile(getAuthoringSchema('source'));

    for (const corpusClass of classes) {
      const input = path.join(corpusRoot, corpusClass);
      const source = await readFile(path.join(input, 'report.md'), 'utf8');
      const inventory = inventoryCorpusSource(source);
      const publicDirectives = inventory.directives.map((item) => {
        const contract = publicContract.directives[item.name];
        if (contract === undefined) throw new Error(`Missing public directive ${item.name}`);
        expect(contract.forms, `${corpusClass}/${item.name}/form`).toContain(item.form);
        for (const attribute of item.attributes) {
          expect(
            Object.keys(contract.attributes),
            `${corpusClass}/${item.name}/${attribute}`,
          ).toContain(attribute);
        }
        if (item.parent !== undefined) {
          expect(contract.placement.requiredParent, `${corpusClass}/${item.name}/placement`).toBe(
            item.parent,
          );
        }
        const projected = {
          name: item.name,
          form: item.form,
          attributes: Object.fromEntries(
            Object.entries(item.attributeValues).map(([name, value]) => [
              name,
              contract.attributes[name]?.kind === 'integer' ||
              contract.attributes[name]?.kind === 'number'
                ? Number(value)
                : contract.attributes[name]?.kind === 'boolean'
                  ? value === 'true'
                  : value,
            ]),
          ),
        };
        expect(validateDirective(projected), `${corpusClass}/${item.name}`).toBe(true);
        return projected;
      });
      expect(
        validateSource({
          manifest: matter(source).data,
          markdown: matter(source).content,
          directives: publicDirectives,
        }),
        `${corpusClass}/public-source-schema: ${JSON.stringify(validateSource.errors)}`,
      ).toBe(true);
      for (const item of inventory.directives) {
        directiveForms.add(`${item.name}/${item.form}`);
        for (const attribute of item.attributes) {
          directiveAttributes.add(`${item.name}.${attribute}`);
        }
        if (item.parent !== undefined) requiredPlacements.add(`${item.name}<-${item.parent}`);
      }
      for (const manifestPath of inventory.manifestPaths) manifestPaths.add(manifestPath);

      for (const format of publicContract.outputs.formats) {
        const suffix = format;
        const output = path.join(
          outputRoot,
          format === 'single-file' ? `${corpusClass}-${suffix}.html` : `${corpusClass}-${suffix}`,
        );
        const result = await buildReport({ input, output, format });
        const html = await readFile(
          format === 'single-file' ? output : path.join(output, 'index.html'),
          'utf8',
        );
        expect(result.format).toBe(format);
        expect(html, `${corpusClass}/${suffix}`).toContain(`Corpus class: ${corpusClass}`);
        if (format === 'single-file') {
          compiledCorpusHtml.push(html);
        }
      }
    }

    expect([...directiveForms].sort()).toEqual(
      Object.entries(publicContract.directives)
        .flatMap(([name, directive]) => directive.forms.map((form) => `${name}/${form}`))
        .sort(),
    );
    expect([...directiveAttributes].sort()).toEqual(
      Object.entries(publicContract.directives)
        .flatMap(([name, directive]) =>
          Object.keys(directive.attributes).map((attribute) => `${name}.${attribute}`),
        )
        .filter((value, index, values) => values.indexOf(value) === index)
        .sort(),
    );
    expect([...requiredPlacements].sort()).toEqual(
      Object.entries(publicContract.directives)
        .filter(([, directive]) => directive.placement.requiredParent !== undefined)
        .map(([name, directive]) => `${name}<-${directive.placement.requiredParent}`)
        .sort(),
    );
    expect([...manifestPaths].sort()).toEqual(registryManifestPaths().sort());

    const allHtml = compiledCorpusHtml.join('\n');
    for (const directive of authoringRegistry.directives) {
      expect(allHtml, directive.name).toMatch(
        new RegExp(`class="[^"]*${directive.sanitizer.className}(?:\\s|")`, 'u'),
      );
    }
    expect(allHtml).toContain('data-kind="success"');
    expect(allHtml).toContain('data-start="2"');
    expect(allHtml).toContain('data-step="3"');
    expect(allHtml).toContain('>Open retained data</a>');
    expect(allHtml).toContain('>Download private-data.json</a>');
    expect(allHtml).toContain('font-family:"Private Reader"');
    expect(allHtml).toContain('<table ');
    expect(allHtml).toContain('<th>Задача</th>');
  });
});

async function render(markdown: string, sourceRoot: string) {
  const sourceFile = path.join(sourceRoot, 'report.md');
  return renderMarkdown(markdown, {
    sourceRoot,
    format: 'single-file',
    outputFilePath: path.join(sourceRoot, 'artifact.html'),
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

function applyDiagnosticRemediation(source: string, error: AgenticReportError): string {
  const location = error.diagnostic.source;
  if (
    location?.line === undefined ||
    location.column === undefined ||
    location.endLine === undefined ||
    location.endColumn === undefined
  ) {
    throw new Error('Diagnostic remediation requires a complete authored range.');
  }
  const prefix = 'Replace this occurrence with ';
  const remediation = error.diagnostic.remediation;
  if (!remediation.startsWith(prefix) || !remediation.endsWith('.')) {
    throw new Error(`Unexpected remediation format: ${remediation}`);
  }
  const replacement = remediation.slice(prefix.length, -1);
  const start = sourceOffsetAt(source, location.line, location.column);
  const end = sourceOffsetAt(source, location.endLine, location.endColumn);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

function sourceOffsetAt(source: string, line: number, column: number): number {
  let offset = 0;
  for (let currentLine = 1; currentLine < line; currentLine += 1) {
    const newline = source.indexOf('\n', offset);
    if (newline === -1) throw new Error(`Line ${line} is outside the source.`);
    offset = newline + 1;
  }
  return offset + column - 1;
}

function diagramNodePosition(html: string, id: string): Readonly<{ x: number; y: number }> {
  const match = html.match(
    new RegExp(`data-node-id="${id}"[^>]*><rect x="([^"]+)" y="([^"]+)"`, 'u'),
  );
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error(`Missing rendered diagram node: ${id}`);
  }
  return { x: Number(match[1]), y: Number(match[2]) };
}

function validAttributeValue(attribute: DirectiveAttributeDefinition): string {
  if (attribute.constraint.kind === 'boolean') return 'true';
  if (attribute.constraint.kind === 'integer') return '2';
  if (attribute.constraint.kind === 'number') return '2.5';
  if (
    attribute.constraint.kind === 'string' &&
    attribute.constraint.format === 'relative-local-path'
  ) {
    return 'local%20file.bin';
  }
  if (attribute.name === 'kind' && attribute.constraint.kind === 'string') return 'warning';
  if (attribute.constraint.kind === 'enum') return attribute.constraint.values.at(-1) ?? '';
  if (attribute.name === 'family') return 'Reader Sans';
  if (attribute.invalidDiagnostic === 'INVALID_SOURCE_LINK') {
    return 'http://127.0.0.1:7789/open?path=%2Fworkspace%2Ffile.ts&line=42';
  }
  if (attribute.name === 'href') return '#valid-target';
  if (['key', 'id', 'group', 'from', 'to', 'bucket'].includes(attribute.name)) return 'valid-key';
  return 'Valid title';
}

function renderedAttributeValue(attribute: DirectiveAttributeDefinition): string {
  if (attribute.constraint.kind === 'boolean') return 'true';
  if (attribute.constraint.kind === 'integer') return '-999999';
  if (attribute.constraint.kind === 'number') return '2.5';
  if (
    attribute.constraint.kind === 'string' &&
    attribute.constraint.format === 'relative-local-path'
  ) {
    return 'local%20file.bin';
  }
  if (attribute.name === 'kind' && attribute.constraint.kind === 'string') return 'warning';
  if (attribute.constraint.kind === 'enum') return attribute.constraint.values.at(-1) ?? '';
  if (attribute.name === 'family') return 'Reader Sans';
  if (attribute.invalidDiagnostic === 'INVALID_SOURCE_LINK') {
    return 'http://127.0.0.1:7789/open?path=%2Fworkspace%2Ffile.ts&line=42';
  }
  if (attribute.name === 'href') return '#valid-target';
  if (['key', 'id', 'group', 'from', 'to', 'bucket'].includes(attribute.name)) return 'valid-key';
  return 'T';
}

function directiveInvocation(
  directive: DirectiveDefinition,
  form: DirectiveForm,
  overrides: Readonly<Record<string, string>> = {},
): string {
  if (['response', 'question', 'bucket', 'option', 'item'].includes(directive.name)) {
    return responseInvocation(directive.name, overrides);
  }
  if (
    ['chart', 'series', 'point', 'diagram', 'group', 'node', 'edge', 'timeline', 'event'].includes(
      directive.name,
    )
  ) {
    return visualizationInvocation(directive.name, overrides);
  }
  const attributes = Object.fromEntries(
    directive.attributes
      .filter((attribute) => attribute.required)
      .map((attribute) => [attribute.name, renderedAttributeValue(attribute)]),
  );
  Object.assign(attributes, overrides);
  const serialized = Object.entries(attributes)
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join(' ');
  const suffix = serialized.length === 0 ? '' : `{${serialized}}`;
  if (directive.name === 'actions') {
    return `:::actions${suffix}\n::action[Projection label]{href="#target"}\n:::`;
  }
  if (directive.name === 'checklist') {
    return `:::checklist${suffix}\n::check-item{id="gate" label="Gate"}\n:::`;
  }
  if (directive.name === 'source-link') return `:source-link${suffix}`;
  const invocation =
    form === 'container'
      ? `:::${directive.name}${suffix}\nBody\n:::`
      : form === 'text'
        ? `:${directive.name}[Projection label]${suffix}`
        : directive.name === 'action'
          ? `::action[Projection label]${suffix}`
          : `::${directive.name}${suffix}`;
  const requiredParent = directive.placement.requiredParent;
  const placed =
    requiredParent === undefined
      ? invocation
      : nestedDirectiveInvocation(requiredParent, directive.name, invocation);
  if (directive.name !== 'term') return placed;
  const key = attributes.key ?? 'valid-key';
  return `${placed}\n:::glossary{key=${JSON.stringify(key)} term="Canonical concept"}\nDefinition.\n:::`;
}

function responseInvocation(target: string, overrides: Readonly<Record<string, string>>): string {
  const attributes = (name: string, fixed: Readonly<Record<string, string>> = {}): string => {
    const contract = (authoringRegistry.directives as readonly DirectiveDefinition[]).find(
      (candidate) => candidate.name === name,
    );
    if (!contract) throw new Error(`Missing response directive contract: ${name}`);
    const values = Object.fromEntries(
      contract.attributes
        .filter(
          (attribute) => attribute.required || (name === target && attribute.name in overrides),
        )
        .map((attribute) => [attribute.name, renderedAttributeValue(attribute)]),
    );
    Object.assign(values, fixed, name === target ? overrides : {});
    return Object.entries(values)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ');
  };
  const targetAttribute = Object.keys(overrides)[0];
  const questionKind =
    target === 'question' && targetAttribute === 'kind'
      ? (overrides.kind ?? 'bucket')
      : target === 'question' && ['min', 'max', 'step'].includes(targetAttribute ?? '')
        ? 'number'
        : target === 'option'
          ? 'item-single'
          : 'bucket';
  const questionFixed: Record<string, string> = {
    id: 'question',
    kind: questionKind,
    title: 'Question',
  };
  if (questionKind === 'number') Object.assign(questionFixed, { min: '1', max: '5' });
  const children =
    questionKind === 'text' || questionKind === 'single'
      ? questionKind === 'single'
        ? [
            `::option{${attributes('option', { id: 'yes', label: 'Yes' })}}`,
            '::option{id="no" label="No"}',
          ]
        : []
      : questionKind === 'item-single' || questionKind === 'item-multi'
        ? [
            `::option{${attributes('option', { id: 'yes', label: 'Yes' })}}`,
            '::option{id="no" label="No"}',
            `::item{${attributes('item', { id: 'item', label: 'Item' })}}`,
          ]
        : questionKind === 'bucket'
          ? [
              `::bucket{${attributes('bucket', { id: 'valid-key', label: 'Do' })}}`,
              '::bucket{id="second" label="Skip"}',
              `::item{${attributes('item', { id: 'item', label: 'Item' })}}`,
            ]
          : [`::item{${attributes('item', { id: 'item', label: 'Item' })}}`];
  return [
    `:::::response{${attributes('response', { id: 'response', title: 'Response' })}}`,
    `::::question{${attributes('question', questionFixed)}}`,
    ...children,
    '::::',
    ':::::',
  ].join('\n');
}

function visualizationInvocation(
  target: string,
  overrides: Readonly<Record<string, string>>,
): string {
  const attributes = (name: string, fixed: Readonly<Record<string, string>> = {}): string => {
    const contract = (authoringRegistry.directives as readonly DirectiveDefinition[]).find(
      (candidate) => candidate.name === name,
    );
    if (contract === undefined) throw new Error(`Missing directive contract: ${name}`);
    const values = Object.fromEntries(
      contract.attributes
        .filter(
          (attribute) => attribute.required || (name === target && attribute.name in overrides),
        )
        .map((attribute) => [attribute.name, renderedAttributeValue(attribute)]),
    );
    Object.assign(values, fixed, name === target ? overrides : {});
    return Object.entries(values)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ');
  };
  if (target === 'chart' || target === 'series' || target === 'point') {
    return [
      `:::::chart{${attributes('chart')}}`,
      `::::series{${attributes('series')}}`,
      `::point{${attributes('point')}}`,
      '::::',
      ':::::',
    ].join('\n');
  }
  if (target === 'diagram') {
    if (overrides.type === 'sequence') {
      return [
        `:::diagram{${attributes('diagram')}}`,
        `::node{${attributes('node', { id: 'valid-key' })}}`,
        `::node{${attributes('node', { id: 'second-key' })}}`,
        `::edge{${attributes('edge', { from: 'valid-key', to: 'second-key', label: 'Message' })}}`,
        ':::',
      ].join('\n');
    }
    return [
      `:::diagram{${attributes('diagram')}}`,
      `::node{${attributes('node', { id: 'valid-key' })}}`,
      ':::',
    ].join('\n');
  }
  if (target === 'group') {
    return [
      `:::diagram{${attributes('diagram')}}`,
      `::group{${attributes('group', { id: 'valid-key' })}}`,
      '::group{id="second-key" label="Second"}',
      `::node{${attributes('node', { id: 'node-one', group: 'valid-key' })}}`,
      '::node{id="node-two" label="Second node" group="second-key"}',
      ':::',
    ].join('\n');
  }
  if (target === 'node') {
    if ('group' in overrides) {
      return [
        `:::diagram{${attributes('diagram')}}`,
        `::group{${attributes('group', { id: 'valid-key', label: 'First' })}}`,
        '::group{id="second-key" label="Second"}',
        `::node{${attributes('node', { id: 'node-one' })}}`,
        '::node{id="node-two" label="Second node" group="second-key"}',
        ':::',
      ].join('\n');
    }
    return [
      `:::diagram{${attributes('diagram')}}`,
      `::node{${attributes('node', { id: 'valid-key' })}}`,
      ':::',
    ].join('\n');
  }
  if (target === 'edge') {
    const targetAttribute = Object.keys(overrides)[0];
    const edgeFixed =
      targetAttribute === 'to'
        ? { from: 'second-key', to: 'valid-key' }
        : { from: 'valid-key', to: 'second-key' };
    return [
      `:::diagram{${attributes('diagram')}}`,
      `::node{${attributes('node', { id: 'valid-key' })}}`,
      `::node{${attributes('node', { id: 'second-key' })}}`,
      `::edge{${attributes('edge', edgeFixed)}}`,
      ':::',
    ].join('\n');
  }
  return [
    `::::timeline{${attributes('timeline')}}`,
    `:::event{${attributes('event')}}`,
    'Event body.',
    ':::',
    '::::',
  ].join('\n');
}

function nestedDirectiveInvocation(
  parent: string,
  child: string,
  childInvocation?: string,
): string {
  if (
    (parent === 'response' && child === 'question') ||
    (parent === 'question' && ['bucket', 'option', 'item'].includes(child))
  ) {
    return responseInvocation(child, {});
  }
  const contract = (name: string): DirectiveDefinition => {
    const found = (authoringRegistry.directives as readonly DirectiveDefinition[]).find(
      (candidate) => candidate.name === name,
    );
    if (found === undefined) throw new Error(`Missing directive contract: ${name}`);
    return found;
  };
  const parentContract = contract(parent);
  const childContract = contract(child);
  const attributes = (contract: DirectiveDefinition): string => {
    const serialized = contract.attributes
      .filter((attribute) => attribute.required)
      .map((attribute) => `${attribute.name}=${JSON.stringify(renderedAttributeValue(attribute))}`)
      .join(' ');
    return serialized.length === 0 ? '' : `{${serialized}}`;
  };
  const invocation =
    childInvocation ?? bareDirectiveInvocation(childContract, attributes(childContract));
  const parentAttributes =
    parent === 'decision' && child === 'decision-option'
      ? '{id="typed-decision"}'
      : attributes(parentContract);
  return `::::${parent}${parentAttributes}\n${invocation}\n::::`;
}

function bareDirectiveInvocation(directive: DirectiveDefinition, suffix?: string): string {
  const serialized =
    suffix ??
    directive.attributes
      .filter((attribute) => attribute.required)
      .map((attribute) => `${attribute.name}=${JSON.stringify(renderedAttributeValue(attribute))}`)
      .join(' ');
  const attributes =
    serialized.length === 0 ? '' : serialized.startsWith('{') ? serialized : `{${serialized}}`;
  if (directive.name === 'actions') {
    return `:::actions${attributes}\n::action[Label]{href="#target"}\n:::`;
  }
  if (directive.name === 'source-link') return `:source-link${attributes}`;
  if (directive.forms.includes('container')) return `:::${directive.name}${attributes}\nBody\n:::`;
  if (directive.forms.includes('leaf')) {
    return directive.name === 'action'
      ? `::action[Label]${attributes}`
      : `::${directive.name}${attributes}`;
  }
  return `:${directive.name}[Label]${attributes}`;
}

function assertRenderedAttribute(
  rendered: Awaited<ReturnType<typeof render>>,
  directive: DirectiveDefinition,
  attribute: DirectiveAttributeDefinition,
  expected: string | number | boolean | undefined,
): void {
  if (expected === undefined) throw new Error(`Missing expected value for ${directive.name}`);
  const serialized = String(expected);
  if (
    ['chart', 'series', 'point', 'diagram', 'group', 'node', 'edge', 'timeline', 'event'].includes(
      directive.name,
    )
  ) {
    const visualExpectation: Readonly<Record<string, string>> = {
      'chart.type': `data-chart-type="${serialized}"`,
      'diagram.type': `data-diagram-type="${serialized}"`,
      'diagram.direction': `data-diagram-direction="${serialized}"`,
      'group.id': `data-group-id="${serialized}"`,
      'node.id': `data-node-id="${serialized}"`,
      'node.group': `data-group="${serialized}"`,
      'node.kind': `visualization-node-${serialized}`,
      'edge.from': `data-from="${serialized}"`,
      'edge.to': `data-to="${serialized}"`,
      'event.kind': `visualization-event-${serialized}`,
    };
    expect(rendered.html, `${directive.name}.${attribute.name}`).toContain(
      visualExpectation[`${directive.name}.${attribute.name}`] ?? serialized,
    );
    return;
  }
  if (directive.name === 'glossary' && attribute.name === 'key') {
    expect(rendered.html).toContain(`id="glossary-${serialized}"`);
    return;
  }
  if (directive.name === 'glossary' && attribute.name === 'term') {
    expect(rendered.html).toContain(`>${serialized}</h3>`);
    return;
  }
  if (directive.name === 'glossary' && attribute.name === 'placement') {
    if (serialized === 'appendix') expect(rendered.html).toContain('data-glossary-appendix=""');
    else expect(rendered.html).not.toContain('data-glossary-appendix=""');
    expect(rendered.html).not.toContain('data-placement=');
    return;
  }
  if (directive.name === 'term' && attribute.name === 'key') {
    expect(rendered.html).toContain(`data-term-reference="${serialized}"`);
    return;
  }
  if (directive.name === 'section' && attribute.name === 'id') {
    expect(rendered.html).toContain(`id="${serialized}"`);
    return;
  }
  if (directive.name === 'action' && attribute.name === 'href') {
    expect(rendered.html).toContain(`href="${serialized}"`);
    expect(rendered.html).not.toContain('data-href=');
    return;
  }
  if (directive.name === 'source-link' && attribute.name === 'href') {
    expect(rendered.html).toContain('class="semantic-source-link"');
    expect(rendered.html).toContain('target="_blank"');
    expect(rendered.html).toContain('rel="noopener noreferrer"');
    expect(rendered.html).not.toContain('data-href=');
    return;
  }
  if (directive.name === 'source-link' && attribute.name === 'label') {
    expect(rendered.html).toContain(`>${serialized}</a>`);
    return;
  }
  if (attribute.name === 'open') {
    expect(rendered.html).toContain('<details class="semantic-disclosure"');
    if (serialized === 'true') expect(rendered.html).toContain(' open');
    else expect(rendered.html).not.toContain(' open');
    return;
  }
  if (attribute.name === 'label') {
    if (['decision-option', 'check-item', 'bucket', 'option', 'item'].includes(directive.name)) {
      expect(rendered.html).toContain(`data-label="${serialized}"`);
      return;
    }
    expect(rendered.html).toContain(`>${serialized}</button>`);
    return;
  }
  if (attribute.name === 'trigger') {
    expect(rendered.html).toContain(`>${serialized}</button>`);
    return;
  }
  if (attribute.name === 'placeholder') {
    expect(rendered.html).toContain(`placeholder="${serialized}"`);
    return;
  }
  if (attribute.name === 'default') {
    expect(rendered.html).toContain(`aria-checked="${serialized === 'on' ? 'true' : 'false'}"`);
    return;
  }
  switch (attribute.renderProperty) {
    case 'dataDirectiveTitle':
      expect(rendered.html, `${directive.name}.${attribute.name}`).toContain(`>${serialized}<`);
      return;
    case 'dataLocalAsset':
      expect(rendered.html, `${directive.name}.${attribute.name}`).toContain(
        'href="data:application/octet-stream;base64,',
      );
      return;
    case 'dataFontSource':
      expect(rendered.fontCss, `${directive.name}.${attribute.name}`).toContain(
        'src:url("data:application/octet-stream;base64,',
      );
      return;
    case 'dataFontFamily':
      expect(rendered.fontCss, `${directive.name}.${attribute.name}`).toContain(
        `font-family:"${serialized}"`,
      );
      return;
    case 'dataStart':
      expect(rendered.html, `${directive.name}.${attribute.name}`).toContain(
        `data-start="${serialized}"`,
      );
      expect(rendered.html, `${directive.name}.${attribute.name}`).toContain(
        `>${serialized}</output>`,
      );
      return;
    default: {
      const htmlName = attribute.renderProperty.replace(
        /[A-Z]/gu,
        (letter) => `-${letter.toLowerCase()}`,
      );
      expect(rendered.html, `${directive.name}.${attribute.name}`).toContain(
        `${htmlName}="${serialized}"`,
      );
    }
  }
}

function element(tagName: string, properties: Element['properties'], text = tagName): Element {
  return {
    type: 'element',
    tagName,
    properties,
    children: [{ type: 'text', value: text }],
  };
}

interface CorpusDirectiveInventory {
  readonly name: string;
  readonly form: DirectiveForm;
  readonly attributes: readonly string[];
  readonly attributeValues: Readonly<Record<string, string>>;
  readonly parent?: string;
}

function inventoryCorpusSource(source: string): {
  readonly directives: readonly CorpusDirectiveInventory[];
  readonly manifestPaths: readonly string[];
} {
  const parsed = matter(source);
  const tree = unified().use(remarkParse).use(remarkDirective).parse(parsed.content);
  const directives: CorpusDirectiveInventory[] = [];
  visit(tree, (node, _index, parent) => {
    if (!isTestDirectiveNode(node)) return;
    const form = testDirectiveForm(node.type);
    if (form === undefined) return;
    directives.push({
      name: node.name,
      form,
      attributes: Object.keys(node.attributes ?? {}),
      attributeValues: Object.fromEntries(
        Object.entries(node.attributes ?? {}).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      ),
      ...(isTestDirectiveNode(parent) ? { parent: parent.name } : {}),
    });
  });
  return { directives, manifestPaths: recordPaths(parsed.data) };
}

function isTestDirectiveNode(value: unknown): value is {
  readonly type: string;
  readonly name: string;
  readonly attributes?: Readonly<Record<string, string | null>>;
} {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { readonly type?: unknown; readonly name?: unknown };
  return (
    typeof candidate.type === 'string' &&
    candidate.type.endsWith('Directive') &&
    typeof candidate.name === 'string'
  );
}

function testDirectiveForm(type: string): DirectiveForm | undefined {
  return (
    {
      containerDirective: 'container',
      leafDirective: 'leaf',
      textDirective: 'text',
    } as Readonly<Record<string, DirectiveForm>>
  )[type];
}

function recordPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([name, child]) => {
    const pathName = prefix.length === 0 ? name : `${prefix}.${name}`;
    return [pathName, ...recordPaths(child, pathName)];
  });
}

function registryManifestPaths(): string[] {
  const paths: string[] = [];
  const collect = (fields: readonly FieldDefinition[], prefix = ''): void => {
    for (const field of fields) {
      const pathName = prefix.length === 0 ? field.name : `${prefix}.${field.name}`;
      paths.push(pathName);
      if (field.fields !== undefined) collect(field.fields, pathName);
    }
  };
  collect(authoringRegistry.manifestFields as readonly FieldDefinition[]);
  return paths;
}

function invalidAttributeValue(attribute: DirectiveAttributeDefinition): string {
  if (attribute.constraint.kind === 'boolean') return 'yes';
  if (attribute.constraint.kind === 'integer') return '1.5';
  if (attribute.constraint.kind === 'number') return 'NaN';
  if (
    attribute.constraint.kind === 'string' &&
    attribute.constraint.format === 'relative-local-path'
  ) {
    return '../outside.bin';
  }
  if (attribute.name === 'kind') return 'Warning';
  if (attribute.name === 'family') return 'Bad;Family';
  if (attribute.name === 'href') return 'javascript:alert(1)';
  if (attribute.constraint.kind === 'enum') return 'unsupported';
  if (attribute.name === 'key') return 'Invalid Key';
  return ' ';
}

async function trackedWorkspace(prefix: string): Promise<string> {
  const workspace = await createTestWorkspace(prefix);
  workspaces.push(workspace);
  return workspace;
}
