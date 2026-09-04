import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { bindReviewArtifact } from '../../src/review/binding.js';
import {
  MAX_REVIEW_TEXT_LENGTH,
  REVIEW_CONTRACT_VERSION,
  ReviewContractError,
  parseReviewArtifact,
  parseReviewTargetManifest,
  serializeReviewArtifact,
  type ReviewArtifact,
  type ReviewTargetReference,
  type ReviewThread,
} from '../../src/review/contract.js';

const target: ReviewTargetReference = {
  id: 'target-a',
  kind: 'markdown:paragraph',
  fingerprint: `sha256:${'a'.repeat(64)}`,
  source: { file: 'report.md', line: 2, column: 1, endLine: 2, endColumn: 10 },
};
const revision = `sha256:${'b'.repeat(64)}`;

function artifact(overrides: Partial<ReviewArtifact> = {}): ReviewArtifact {
  return {
    contractVersion: REVIEW_CONTRACT_VERSION,
    report: { revision },
    threads: [
      {
        id: 'thread-a',
        segments: [
          {
            id: 'segment-a',
            reportRevision: revision,
            target,
            resolved: false,
            messages: [
              { id: 'message-a-1', author: 'user', message: 'Please explain this.' },
              { id: 'message-a-2', author: 'agent', message: 'Added an explanation.' },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function baseThread(): ReviewThread {
  const value = artifact().threads[0];
  if (value === undefined) throw new Error('Missing base thread fixture.');
  return value;
}
function baseSegment() {
  const value = baseThread().segments[0];
  if (value === undefined) throw new Error('Missing base segment fixture.');
  return value;
}

describe('review thread protocol v3', () => {
  it('parses and serializes ordered discussion threads deterministically', () => {
    const value = artifact();
    expect(parseReviewArtifact(value)).toEqual(value);
    expect(serializeReviewArtifact(value)).toBe(serializeReviewArtifact(value));
    expect(parseReviewArtifact(JSON.parse(serializeReviewArtifact(value)))).toEqual(value);
    expect(JSON.parse(serializeReviewArtifact(value)).threads[0].segments[0].messages).toEqual(
      value.threads[0]?.segments[0]?.messages,
    );
  });

  it('sorts threads but preserves semantic message order', () => {
    const second = {
      ...baseThread(),
      id: 'thread-z',
      segments: [{ ...baseSegment(), target: { ...target, id: 'target-z' } }],
    };
    const first = { ...baseThread(), id: 'thread-a' };
    const parsed = JSON.parse(serializeReviewArtifact(artifact({ threads: [second, first] })));
    expect(parsed.threads.map((item: { id: string }) => item.id)).toEqual(['thread-a', 'thread-z']);
    expect(
      parsed.threads[1].segments[0].messages.map((item: { author: string }) => item.author),
    ).toEqual(['user', 'agent']);
  });

  it('rejects every version-1 shape and a v2 payload mislabelled as v1 at the version boundary', () => {
    for (const value of [
      { contractVersion: 1, report: { revision }, responses: [] },
      {
        contractVersion: 1,
        report: { revision },
        pageVerdict: { verdict: 'approve' },
        responses: [],
      },
      { ...artifact(), contractVersion: 1 },
    ]) {
      try {
        parseReviewArtifact(value);
        throw new Error('Expected version rejection.');
      } catch (error) {
        expect(error).toBeInstanceOf(ReviewContractError);
        expect((error as ReviewContractError).unsupportedVersion).toBe(true);
      }
    }
  });

  it('rejects formal fields, duplicate targets/messages, empty threads and hostile text', () => {
    expect(() =>
      parseReviewArtifact({ ...artifact(), pageVerdict: { verdict: 'approve' } }),
    ).toThrow();
    expect(() =>
      parseReviewArtifact(artifact({ threads: [baseThread(), baseThread()] })),
    ).toThrow();
    expect(() =>
      parseReviewArtifact(artifact({ threads: [{ ...baseThread(), segments: [] }] })),
    ).toThrow();
    expect(() =>
      parseReviewArtifact(
        artifact({
          threads: [
            {
              ...baseThread(),
              segments: [
                baseSegment(),
                {
                  ...baseSegment(),
                  id: 'segment-b',
                  reportRevision: `sha256:${'c'.repeat(64)}`,
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow();
    expect(() =>
      parseReviewArtifact(
        artifact({
          threads: [
            {
              ...baseThread(),
              segments: [
                {
                  ...baseSegment(),
                  messages: [
                    {
                      id: 'message-a',
                      author: 'user',
                      message: 'x'.repeat(MAX_REVIEW_TEXT_LENGTH + 1),
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow();
  });

  it('normalizes human messages to NFC', () => {
    const value = artifact({
      threads: [
        {
          ...baseThread(),
          segments: [
            {
              ...baseSegment(),
              messages: [{ id: 'message-a', author: 'user', message: ' cafe\u0301 ' }],
            },
          ],
        },
      ],
    });
    expect(parseReviewArtifact(value).threads[0]?.segments[0]?.messages[0]?.message).toBe('café');
  });

  it('upgrades legacy version-2 whole-block threads without inventing a selection', () => {
    const legacy = { ...artifact(), contractVersion: 2 };
    const parsed = parseReviewArtifact(legacy);
    expect(parsed.contractVersion).toBe(3);
    expect(parsed.threads[0]?.segments[0]?.selection).toBeUndefined();
    expect(JSON.parse(serializeReviewArtifact(parsed)).contractVersion).toBe(3);
  });

  it('validates exact Unicode selection boundaries and binds both endpoint targets', () => {
    const endTarget = {
      ...target,
      id: 'target-b',
      fingerprint: `sha256:${'c'.repeat(64)}`,
      source: { ...target.source, line: 3, endLine: 3 },
    };
    const value = artifact({
      threads: [
        {
          ...baseThread(),
          segments: [
            {
              ...baseSegment(),
              selection: {
                start: { target, offset: 2 },
                end: { target: endTarget, offset: 4 },
                quote: 'fé → next',
              },
            },
          ],
        },
      ],
    });
    expect(parseReviewArtifact(value).threads[0]?.segments[0]?.selection).toEqual(
      value.threads[0]?.segments[0]?.selection,
    );
    expect(() => parseReviewArtifact({ ...value, contractVersion: 2 })).toThrow();
    expect(() =>
      parseReviewArtifact({
        ...value,
        threads: [
          {
            ...baseThread(),
            segments: [
              {
                ...baseSegment(),
                selection: {
                  start: { target, offset: 5 },
                  end: { target, offset: 2 },
                  quote: 'bad',
                },
              },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseReviewArtifact({
        ...value,
        threads: [
          {
            ...baseThread(),
            segments: [
              {
                ...baseSegment(),
                selection: {
                  start: { target, offset: -1 },
                  end: { target, offset: 1 },
                  quote: 'x',
                  extra: true,
                },
              },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseReviewArtifact({
        ...value,
        threads: [
          {
            ...baseThread(),
            segments: [
              {
                ...baseSegment(),
                selection: {
                  start: { target, offset: 0 },
                  end: { target, offset: MAX_REVIEW_TEXT_LENGTH + 1 },
                  quote: 'x'.repeat(MAX_REVIEW_TEXT_LENGTH + 1),
                },
              },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseReviewArtifact({
        ...value,
        threads: [
          {
            ...baseThread(),
            segments: [
              {
                ...baseSegment(),
                selection: {
                  start: { target: endTarget, offset: 0 },
                  end: { target: endTarget, offset: 1 },
                  quote: 'x',
                },
              },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(
      bindReviewArtifact(value, {
        contractVersion: 2,
        reportRevision: `sha256:${'d'.repeat(64)}`,
        targets: [target, { ...endTarget, fingerprint: `sha256:${'e'.repeat(64)}` }],
      }).threads[0]?.binding,
    ).toBe('changed');
  });

  it('strictly parses version-2 manifests without review requirements', () => {
    const manifest = { contractVersion: 2, reportRevision: revision, targets: [target] };
    expect(parseReviewTargetManifest(manifest)).toEqual(manifest);
    expect(() => parseReviewTargetManifest({ ...manifest, requirements: {} })).toThrow();
    expect(() => parseReviewTargetManifest({ ...manifest, contractVersion: 1 })).toThrow();
  });

  it('binds complete threads and resolution across exact, changed, missing and ambiguous targets', () => {
    const exact = bindReviewArtifact(artifact(), {
      contractVersion: 2,
      reportRevision: revision,
      targets: [target],
    });
    expect(exact.threads[0]).toMatchObject({
      binding: 'exact',
      thread: { segments: [{ resolved: false }] },
    });
    const staleRevision = `sha256:${'c'.repeat(64)}`;
    const changed = bindReviewArtifact(artifact(), {
      contractVersion: 2,
      reportRevision: staleRevision,
      targets: [{ ...target, fingerprint: `sha256:${'d'.repeat(64)}` }],
    });
    expect(changed.threads[0]?.binding).toBe('changed');
    expect(
      bindReviewArtifact(artifact(), {
        contractVersion: 2,
        reportRevision: staleRevision,
        targets: [],
      }).threads[0]?.binding,
    ).toBe('missing');
    const ambiguousTarget = { ...target, id: 'target-b' };
    expect(
      bindReviewArtifact(artifact(), {
        contractVersion: 2,
        reportRevision: staleRevision,
        targets: [target, ambiguousTarget],
      }).threads[0]?.binding,
    ).toBe('ambiguous');
  });

  it('keeps the browser runtime free of formal approval vocabulary', async () => {
    const source = await readFile('src/browser/review-workspace.ts', 'utf8');
    for (const removed of [
      'pageVerdict',
      'targetVerdict',
      'assertReviewRequirements',
      'ReviewDecisionResponse',
      'ReviewChecklistResponse',
    ])
      expect(source).not.toContain(removed);
    expect(source).toContain('toggleResolved');
    expect(source).toContain('data-review-thread-messages');
    expect(source).not.toContain('data-review-active');
    expect(source).not.toContain('data-review-target-control');
    expect(source).not.toContain('data-review-exit');
  });
});
