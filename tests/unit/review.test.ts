import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseReviewArtifact,
  parseReviewTargetManifest,
  serializeReviewArtifact,
  validateExtensionProposal,
  type ReviewArtifact,
  type ReviewTargetManifest,
  type ReviewTargetReference,
} from '../../src/index.js';
import { bindReviewArtifact } from '../../src/review/binding.js';
import { assertReviewRequirements } from '../../src/review/contract.js';
import { createReviewTargetManifest } from '../../src/review/targets.js';

describe('versioned review protocol', () => {
  it('keeps the shipped review extension proposal accepted by the trust-boundary gate', async () => {
    const proposal = JSON.parse(
      await readFile(path.resolve('docs/product/review-workspace-extension.json'), 'utf8'),
    ) as unknown;
    expect(validateExtensionProposal(proposal)).toEqual({ accepted: true, issues: [] });
  });

  it('serializes equivalent bounded review state to canonical deterministic bytes', () => {
    const target = fixtureTarget('rt-target', `sha256:${'a'.repeat(64)}`);
    const first: ReviewArtifact = {
      contractVersion: 1,
      report: { revision: `sha256:${'b'.repeat(64)}` },
      reviewer: { name: 'Reviewer' },
      responses: [
        { id: 'response-b', kind: 'question', target, message: 'Why?' },
        { id: 'response-a', kind: 'verdict', target, verdict: 'approve' },
      ],
    };
    const second: ReviewArtifact = { ...first, responses: [...first.responses].reverse() };
    expect(serializeReviewArtifact(first)).toBe(serializeReviewArtifact(second));
    expect(parseReviewArtifact(JSON.parse(serializeReviewArtifact(first)))).toStrictEqual({
      ...first,
      responses: [...first.responses].sort((left, right) => left.id.localeCompare(right.id)),
    });
  });

  it('normalizes human text fields to NFC before canonical serialization', () => {
    const target = fixtureTarget('rt-target', `sha256:${'a'.repeat(64)}`);
    const artifact = (name: string, message: string): ReviewArtifact => ({
      contractVersion: 1,
      report: { revision: `sha256:${'b'.repeat(64)}` },
      reviewer: { name },
      pageVerdict: { verdict: 'revise', rationale: message },
      responses: [
        { id: 'response-a', kind: 'comment', target, message },
        {
          id: 'response-b',
          kind: 'checklist',
          target,
          items: [{ itemId: 'item-a', status: 'not-applicable', note: message }],
        },
      ],
    });

    const composed = serializeReviewArtifact(artifact('José', 'café'));
    const decomposed = serializeReviewArtifact(artifact('Jose\u0301', 'cafe\u0301'));
    expect(decomposed).toBe(composed);
    expect(decomposed).toContain('José');
    expect(decomposed).toContain('café');
  });

  it('rejects unsupported fields, duplicate response identities, and unexplained negative verdicts', () => {
    const target = fixtureTarget('rt-target', `sha256:${'a'.repeat(64)}`);
    expect(() =>
      parseReviewArtifact({
        contractVersion: 1,
        report: { revision: `sha256:${'b'.repeat(64)}` },
        responses: [
          { id: 'response-a', kind: 'verdict', target, verdict: 'reject' },
          { id: 'response-a', kind: 'comment', target, message: 'Duplicate' },
        ],
        executable: 'callback',
      }),
    ).toThrowError(/does not satisfy the review contract/u);
  });

  it('owns target-verdict uniqueness and page approval consistency in the shared domain', () => {
    const target = fixtureTarget('rt-target', `sha256:${'a'.repeat(64)}`);
    const base = {
      contractVersion: 1,
      report: { revision: `sha256:${'b'.repeat(64)}` },
    } as const;
    expect(() =>
      parseReviewArtifact({
        ...base,
        responses: [
          { id: 'verdict-a', kind: 'verdict', target, verdict: 'approve' },
          { id: 'verdict-b', kind: 'verdict', target, verdict: 'revise', rationale: 'Revise.' },
        ],
      }),
    ).toThrowError(/does not satisfy the review contract/u);
    expect(() =>
      serializeReviewArtifact({
        ...base,
        pageVerdict: { verdict: 'approve' },
        responses: [{ id: 'blocker-a', kind: 'blocker', target, message: 'Blocked.' }],
      }),
    ).toThrowError(/does not satisfy the review contract/u);
    expect(() =>
      serializeReviewArtifact({
        ...base,
        pageVerdict: { verdict: 'approve' },
        responses: [
          {
            id: 'verdict-a',
            kind: 'verdict',
            target,
            verdict: 'revise',
            rationale: 'Revise this block.',
          },
        ],
      }),
    ).toThrowError(/does not satisfy the review contract/u);
    expect(
      serializeReviewArtifact({
        ...base,
        pageVerdict: { verdict: 'approve' },
        responses: [{ id: 'verdict-a', kind: 'verdict', target, verdict: 'approve' }],
      }),
    ).toContain('"verdict":"approve"');
  });

  it('gates required decisions and checklist items through the shared response model', () => {
    const decision = fixtureTarget('rt-decision', `sha256:${'a'.repeat(64)}`);
    const checklist = fixtureTarget('rt-checklist', `sha256:${'b'.repeat(64)}`);
    const requirements = {
      decisions: [{ targetId: decision.id, required: true, optionIds: ['ship', 'hold'] }],
      checklists: [{ targetId: checklist.id, items: [{ itemId: 'owner', required: true }] }],
    } as const;
    const artifact = (responses: ReviewArtifact['responses']): ReviewArtifact => ({
      contractVersion: 1,
      report: { revision: `sha256:${'c'.repeat(64)}` },
      pageVerdict: { verdict: 'approve' },
      responses,
    });
    expect(() => assertReviewRequirements(artifact([]), requirements)).toThrow(
      /required decisions/u,
    );
    expect(() =>
      assertReviewRequirements(
        artifact([{ id: 'decision-a', kind: 'decision', target: decision, optionId: 'unknown' }]),
        requirements,
      ),
    ).toThrow(/unknown decision option/u);
    expect(() =>
      assertReviewRequirements(
        artifact([{ id: 'decision-a', kind: 'decision', target: checklist, optionId: 'ship' }]),
        requirements,
      ),
    ).toThrow(/does not belong/u);
    expect(() =>
      assertReviewRequirements(
        artifact([
          { id: 'decision-a', kind: 'decision', target: decision, optionId: 'ship' },
          { id: 'decision-b', kind: 'decision', target: decision, optionId: 'hold' },
        ]),
        requirements,
      ),
    ).toThrow(/more than one response/u);
    expect(() =>
      assertReviewRequirements(
        artifact([{ id: 'decision-a', kind: 'decision', target: decision, optionId: 'deferred' }]),
        requirements,
      ),
    ).toThrow(/open or deferred/u);
    expect(() =>
      assertReviewRequirements(
        artifact([{ id: 'decision-a', kind: 'decision', target: decision, optionId: 'ship' }]),
        requirements,
      ),
    ).toThrow(/checklist/u);
    expect(() =>
      assertReviewRequirements(
        artifact([
          { id: 'decision-a', kind: 'decision', target: decision, optionId: 'ship' },
          {
            id: 'checklist-a',
            kind: 'checklist',
            target: checklist,
            items: [{ itemId: 'owner', status: 'checked' }],
          },
        ]),
        requirements,
      ),
    ).not.toThrow();
  });

  it('bounds diagnostics for a hostile wide review object', () => {
    const hostile = Object.fromEntries(
      Array.from({ length: 1_000 }, (_, index) => [`unexpected-${index}`, index]),
    );
    try {
      parseReviewArtifact(hostile);
      throw new Error('Hostile review unexpectedly passed');
    } catch (error) {
      expect(error).toMatchObject({ issues: { length: 100 } });
    }
  });

  it('strictly parses target manifests and rejects identity, path, version, and width violations', () => {
    const target = fixtureTarget(
      'rt-target',
      `sha256:${'a'.repeat(64)}`,
      'directive:section:launch',
    );
    const valid: ReviewTargetManifest = {
      contractVersion: 1,
      reportRevision: `sha256:${'b'.repeat(64)}`,
      targets: [target],
    };
    expect(parseReviewTargetManifest(valid)).toStrictEqual(valid);

    for (const invalid of [
      { ...valid, contractVersion: 2 },
      { ...valid, executable: 'callback' },
      { ...valid, targets: [target, { ...target }] },
      {
        ...valid,
        targets: [
          { ...target, id: 'rt-other', source: { ...target.source, file: '../outside.md' } },
        ],
      },
      {
        ...valid,
        targets: [
          {
            ...target,
            source: { ...target.source, column: 20, endLine: target.source.line, endColumn: 3 },
          },
        ],
      },
      {
        ...valid,
        targets: Array.from({ length: 501 }, (_, index) => ({ ...target, id: `rt-${index}` })),
      },
      JSON.parse(
        '{"contractVersion":1,"reportRevision":"sha256:' +
          'b'.repeat(64) +
          '","targets":[],"__proto__":{}}',
      ) as unknown,
    ]) {
      expect(() => parseReviewTargetManifest(invalid)).toThrowError(
        /does not satisfy the review contract/u,
      );
    }

    expect(() =>
      parseReviewArtifact({
        contractVersion: 1,
        report: { revision: valid.reportRevision },
        responses: [
          {
            id: 'response-a',
            kind: 'comment',
            target: {
              ...target,
              source: { ...target.source, column: 20, endLine: target.source.line, endColumn: 3 },
            },
            message: 'Invalid range',
          },
        ],
      }),
    ).toThrowError(/does not satisfy the review contract/u);
  });

  it('changes report revision when target/public projection changes with identical source bytes', async () => {
    const sourceRoot = path.resolve('/source');
    const digests = [{ file: path.join(sourceRoot, 'report.md'), sha256: 'a'.repeat(64) }];
    const target = fixtureTarget('rt-target', `sha256:${'b'.repeat(64)}`);

    const first = await createReviewTargetManifest(sourceRoot, digests, [target]);
    const second = await createReviewTargetManifest(sourceRoot, digests, [
      { ...target, kind: 'markdown:heading' },
    ]);

    expect(second.reportRevision).not.toBe(first.reportRevision);
  });

  it('keeps the package-owned Review Workspace within its runtime boundary and byte budgets', async () => {
    const [runtime, styles, source] = await Promise.all([
      readFile(path.resolve('dist/browser/runtime.js')),
      readFile(path.resolve('dist/browser/document.css')),
      readFile(path.resolve('src/browser/review-workspace.ts'), 'utf8'),
    ]);

    expect(runtime.byteLength).toBeLessThanOrEqual(42_000);
    expect(styles.byteLength).toBeLessThanOrEqual(44_000);
    expect(source).not.toMatch(
      /\.innerHTML|localStorage|sessionStorage|\bfetch\s*\(|XMLHttpRequest|WebSocket/u,
    );
  });

  it('distinguishes changed stable targets, missing targets, and ambiguous equal fingerprints', () => {
    const priorStable = fixtureTarget(
      'rt-stable-prior',
      `sha256:${'a'.repeat(64)}`,
      'directive:section:launch',
    );
    const currentStable = {
      ...priorStable,
      id: 'rt-stable-current',
      fingerprint: `sha256:${'b'.repeat(64)}`,
    };
    const generated = fixtureTarget('rt-generated', `sha256:${'c'.repeat(64)}`);
    const priorGenerated = { ...generated, source: { ...generated.source, file: 'old.md' } };
    const duplicateOne = {
      ...priorGenerated,
      id: 'rt-duplicate-a',
      source: { ...priorGenerated.source, file: 'a.md' },
    };
    const duplicateTwo = {
      ...priorGenerated,
      id: 'rt-duplicate-b',
      source: { ...priorGenerated.source, file: 'b.md' },
    };
    const priorBound = {
      ...fixtureTarget('rt-bound', `sha256:${'1'.repeat(64)}`),
      source: { file: 'report.md', line: 10, column: 1, endLine: 10, endColumn: 8 },
    };
    const changedBound = {
      ...priorBound,
      id: 'rt-bound-current',
      fingerprint: `sha256:${'2'.repeat(64)}`,
      source: { ...priorBound.source, endColumn: priorBound.source.endColumn + 1 },
    };
    const equalTextElsewhere = {
      ...priorBound,
      id: 'rt-equal-elsewhere',
      source: { ...priorBound.source, line: 11, endLine: 11 },
    };
    const artifact: ReviewArtifact = {
      contractVersion: 1,
      report: { revision: `sha256:${'d'.repeat(64)}` },
      responses: [
        {
          id: 'bound-response',
          kind: 'comment',
          target: priorBound,
          message: 'Do not move this response.',
        },
        { id: 'stable-response', kind: 'comment', target: priorStable, message: 'Changed' },
        { id: 'ambiguous-response', kind: 'comment', target: priorGenerated, message: 'Ambiguous' },
        {
          id: 'missing-response',
          kind: 'comment',
          target: {
            ...fixtureTarget('rt-missing', `sha256:${'e'.repeat(64)}`),
            source: { file: 'missing.md', line: 1, column: 1, endLine: 1, endColumn: 8 },
          },
          message: 'Missing',
        },
      ],
    };
    const manifest: ReviewTargetManifest = {
      contractVersion: 1,
      reportRevision: `sha256:${'f'.repeat(64)}`,
      targets: [changedBound, equalTextElsewhere, currentStable, duplicateOne, duplicateTwo],
    };
    expect(bindReviewArtifact(artifact, manifest).responses.map((item) => item.binding)).toEqual([
      'changed',
      'changed',
      'ambiguous',
      'missing',
    ]);
  });
});

function fixtureTarget(id: string, fingerprint: string, stableKey?: string): ReviewTargetReference {
  return {
    id,
    kind: 'markdown:paragraph',
    fingerprint,
    ...(stableKey === undefined ? {} : { stableKey }),
    source: { file: 'report.md', line: 1, column: 1, endLine: 1, endColumn: 8 },
  };
}
