import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { validateExtensionProposal } from '../../src/authoring/extension-gate.js';
import { buildReport } from '../../src/core/compiler.js';
import {
  RESPONSE_CONTRACT_VERSION,
  ResponseContractError,
  parseResponseArtifact,
  parseResponseFormManifest,
  serializeResponseArtifact,
  type ResponseArtifact,
} from '../../src/response/contract.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

const manifest = parseResponseFormManifest({
  contractVersion: RESPONSE_CONTRACT_VERSION,
  id: 'triage',
  title: 'Triage',
  revision: `sha256:${'a'.repeat(64)}`,
  questions: [
    {
      id: 'scope',
      kind: 'bucket',
      title: 'Scope',
      buckets: [
        { id: 'do', label: 'Do' },
        { id: 'skip', label: 'Skip' },
      ],
      options: [],
      items: [
        {
          id: 'a',
          label: 'A',
          note: 'First explanation',
          meta: 'Issue A',
          href: 'https://example.com/a',
          bucket: 'do',
          comment: true,
        },
        {
          id: 'b',
          label: 'B',
          note: 'Second explanation',
          meta: 'Issue B',
          href: 'https://example.com/b',
          comment: false,
        },
      ],
    },
    {
      id: 'summary',
      kind: 'text',
      title: 'Summary',
      buckets: [],
      options: [],
      items: [],
    },
  ],
});

const artifact: ResponseArtifact = {
  contractVersion: RESPONSE_CONTRACT_VERSION,
  form: { id: manifest.id, revision: manifest.revision },
  answers: [
    {
      id: 'scope',
      kind: 'bucket',
      answered: false,
      value: [
        { itemId: 'a', bucketId: 'do' },
        { itemId: 'b', bucketId: null },
      ],
    },
    { id: 'summary', kind: 'text', answered: true, value: 'Ship after verification.' },
  ],
  comments: [{ questionId: 'scope', itemId: 'a', text: 'Keep this separate.' }],
};

describe('response workspace contract', () => {
  it('preserves explicit untouched defaults and canonical sparse comments', () => {
    const serialized = serializeResponseArtifact(artifact, manifest);
    expect(serialized).toBe(`${JSON.stringify(artifact)}\n`);
    expect(parseResponseArtifact(JSON.parse(serialized) as unknown, manifest)).toEqual(artifact);
    expect(JSON.parse(serialized).answers[0]).toMatchObject({ answered: false });
    expect(JSON.parse(serialized).comments).toEqual([
      { questionId: 'scope', itemId: 'a', text: 'Keep this separate.' },
    ]);
  });

  it('rejects foreign revisions, unknown values, comments and prototype-like records', () => {
    expect(() =>
      parseResponseArtifact(
        { ...artifact, form: { ...artifact.form, revision: `sha256:${'b'.repeat(64)}` } },
        manifest,
      ),
    ).toThrow(ResponseContractError);
    expect(() =>
      parseResponseArtifact(
        {
          ...artifact,
          answers: [
            {
              ...artifact.answers[0],
              value: [
                { itemId: 'a', bucketId: 'unknown' },
                { itemId: 'b', bucketId: null },
              ],
            },
            artifact.answers[1],
          ],
        },
        manifest,
      ),
    ).toThrow(ResponseContractError);
    expect(() =>
      parseResponseArtifact(
        { ...artifact, comments: [{ questionId: 'scope', itemId: 'b', text: 'Forbidden.' }] },
        manifest,
      ),
    ).toThrow(ResponseContractError);
    const hostile = Object.create({ inherited: true }) as Record<string, unknown>;
    Object.assign(hostile, artifact);
    expect(() => parseResponseArtifact(hostile, manifest)).toThrow(ResponseContractError);
  });

  it('rejects numeric values outside the authored range or step domain', () => {
    const numericManifest = parseResponseFormManifest({
      contractVersion: RESPONSE_CONTRACT_VERSION,
      id: 'scores',
      title: 'Scores',
      revision: `sha256:${'c'.repeat(64)}`,
      questions: [
        {
          id: 'confidence',
          kind: 'number',
          title: 'Confidence',
          minimum: 1,
          maximum: 5,
          step: 1,
          buckets: [],
          options: [],
          items: [
            {
              id: 'evidence',
              label: 'Evidence',
              note: 'Evidence strength.',
              meta: '1 to 5',
              href: 'https://example.com/evidence',
              comment: false,
            },
          ],
        },
      ],
    });
    const numericArtifact = (value: number) => ({
      contractVersion: RESPONSE_CONTRACT_VERSION,
      form: { id: numericManifest.id, revision: numericManifest.revision },
      answers: [
        {
          id: 'confidence',
          kind: 'number',
          answered: true,
          value: [{ itemId: 'evidence', value }],
        },
      ],
      comments: [],
    });
    expect(() => parseResponseArtifact(numericArtifact(6), numericManifest)).toThrow(
      ResponseContractError,
    );
    expect(() => parseResponseArtifact(numericArtifact(3.5), numericManifest)).toThrow(
      ResponseContractError,
    );
    expect(parseResponseArtifact(numericArtifact(5), numericManifest).answers[0]?.value).toEqual([
      { itemId: 'evidence', value: 5 },
    ]);

    const decimalManifest = parseResponseFormManifest({
      ...numericManifest,
      id: 'decimal-scores',
      revision: `sha256:${'d'.repeat(64)}`,
      questions: [
        {
          ...numericManifest.questions[0],
          minimum: 0,
          maximum: 999_999_999,
          step: 0.0001,
        },
      ],
    });
    const decimalArtifact = (value: number) => ({
      ...numericArtifact(value),
      form: { id: decimalManifest.id, revision: decimalManifest.revision },
    });
    expect(
      parseResponseArtifact(decimalArtifact(100_000_000.0022), decimalManifest).answers[0]?.value,
    ).toEqual([{ itemId: 'evidence', value: 100_000_000.0022 }]);
    expect(() =>
      parseResponseArtifact(decimalArtifact(100_000_000.00225), decimalManifest),
    ).toThrow(ResponseContractError);
  });

  it('builds every response kind into one inert revision-bound workspace', async () => {
    const workspace = await createTestWorkspace('response-build');
    workspaces.push(workspace);
    const output = path.join(workspace, 'response.html');
    await buildReport({ input: path.resolve('examples/response-workspace'), output });
    const html = await readFile(output, 'utf8');
    expect(html).toContain('data-response-workspace');
    expect(html).toContain('data-response-manifest');
    expect(html).toContain('"kind":"bucket"');
    expect(html).toContain('"kind":"item-single"');
    expect(html).toContain('"kind":"item-multi"');
    expect(html).toContain('"kind":"single"');
    expect(html).toContain('"kind":"order"');
    expect(html).toContain('"kind":"number"');
    expect(html).toContain('"kind":"text"');
    expect(html).toMatch(/"revision":"sha256:[a-f0-9]{64}"/u);
    expect(html).not.toMatch(
      /class="semantic-(?:question|bucket|option|item)"[^>]*data-review-target/u,
    );
  });

  it('rejects kind-incompatible domains with source-mapped diagnostics', async () => {
    const workspace = await createTestWorkspace('response-invalid');
    workspaces.push(workspace);
    const detail = 'note="Explanation" meta="Issue 1" href="https://example.com/1"';
    const cases = [
      [
        'text with an item',
        '::::question{id="text" kind="text" title="Text"}\n' +
          `::item{id="forbidden" label="Must not exist" ${detail}}\n::::`,
      ],
      [
        'bucket with one domain value',
        '::::question{id="bucket" kind="bucket" title="Bucket"}\n' +
          '::bucket{id="only" label="Only"}\n' +
          `::item{id="item" label="Item" ${detail}}\n::::`,
      ],
      [
        'single choice with one option',
        '::::question{id="choice" kind="item-single" title="Choice"}\n' +
          '::option{id="only" label="Only"}\n' +
          `::item{id="item" label="Item" ${detail}}\n::::`,
      ],
      [
        'inverted numeric range',
        '::::question{id="number" kind="number" title="Number" min="5" max="1"}\n' +
          `::item{id="item" label="Item" ${detail}}\n::::`,
      ],
      [
        'duplicate item identity',
        '::::question{id="order" kind="order" title="Order"}\n' +
          `::item{id="same" label="One" ${detail}}\n` +
          `::item{id="same" label="Two" ${detail}}\n::::`,
      ],
    ] as const;
    for (const [label, question] of cases) {
      await writeFile(
        path.join(workspace, 'report.md'),
        [
          '# Invalid response',
          ':::::response{title="Invalid" id="invalid"}',
          question,
          ':::::',
        ].join('\n'),
      );
      await expect(
        buildReport({ input: workspace, output: path.join(workspace, 'out.html') }),
        label,
      ).rejects.toMatchObject({
        diagnostic: {
          code: 'INVALID_RESPONSE_DATA',
          source: { file: path.join(workspace, 'report.md') },
        },
      });
    }
  });

  it('ships an accepted trust-boundary proposal for the response workspace', async () => {
    const proposal = JSON.parse(
      await readFile(path.resolve('docs/product/response-workspace-extension.json'), 'utf8'),
    ) as unknown;
    expect(validateExtensionProposal(proposal)).toEqual({ accepted: true, issues: [] });
  });

  it('compiles the documented response workspace example', async () => {
    const workspace = await createTestWorkspace('response-doc-example');
    workspaces.push(workspace);
    const reference = await readFile(path.resolve('docs/AGENT-REFERENCE.md'), 'utf8');
    const section = reference.split('## Collect a structured reader response\n', 2)[1];
    const example = section?.match(/```md\n([\s\S]*?)\n```/u)?.[1];
    expect(example).toBeTruthy();
    await writeFile(path.join(workspace, 'report.md'), `# Documented response\n${example}\n`);
    await expect(
      buildReport({ input: workspace, output: path.join(workspace, 'documented.html') }),
    ).resolves.toMatchObject({ format: 'single-file' });
  });

  it('bounds the number of independent response workspaces per document', async () => {
    const workspace = await createTestWorkspace('response-form-limit');
    workspaces.push(workspace);
    const form = (index: number) =>
      [
        `::::response{title="Response ${index}" id="response-${index}"}`,
        `:::question{id="text-${index}" kind="text" title="Text ${index}"}`,
        ':::',
        '::::',
      ].join('\n');
    const source = (count: number) =>
      ['# Bounded responses', ...Array.from({ length: count }, (_, index) => form(index + 1))].join(
        '\n',
      );
    await writeFile(path.join(workspace, 'report.md'), source(20));
    await expect(
      buildReport({ input: workspace, output: path.join(workspace, 'maximum.html') }),
    ).resolves.toMatchObject({ format: 'single-file' });
    await writeFile(path.join(workspace, 'report.md'), source(21));
    await expect(
      buildReport({ input: workspace, output: path.join(workspace, 'excessive.html') }),
    ).rejects.toMatchObject({
      diagnostic: {
        code: 'INVALID_RESPONSE_DATA',
        source: { file: path.join(workspace, 'report.md') },
      },
    });
  });
});
