import { describe, expect, it } from 'vitest';
import { LiveConversationProjection } from '../../dist/node/live/conversation.js';
import {
  MAX_LIVE_CONVERSATION_BYTES,
  MAX_LIVE_MESSAGES,
  MAX_LIVE_MESSAGE_TEXT,
} from '../../dist/node/live/contract.js';

describe('live conversation projection', () => {
  it('keeps newer streaming text and interleaved user identity when an older history read completes', () => {
    const projection = new LiveConversationProjection(() => undefined);
    projection.item(
      'turn',
      { type: 'userMessage', id: 'user', content: [{ type: 'text', text: 'Question' }] },
      true,
    );
    projection.item('turn', { type: 'agentMessage', id: 'answer', text: 'First' }, false);
    const readAt = projection.generation;
    projection.delta('turn', 'answer', ' latest');
    projection.item(
      'turn',
      { type: 'userMessage', id: 'steering', content: [{ type: 'text', text: 'Clarification' }] },
      true,
    );
    projection.reconcile(
      {
        data: [
          {
            id: 'turn',
            status: 'inProgress',
            items: [
              { type: 'userMessage', id: 'user', content: [{ type: 'text', text: 'Question' }] },
              { type: 'agentMessage', id: 'answer', text: 'First' },
            ],
          },
        ],
        nextCursor: null,
      },
      readAt,
    );
    expect(projection.snapshot().messages.map((m) => [m.id, m.text])).toEqual([
      ['user', 'Question'],
      ['answer', 'First latest'],
      ['steering', 'Clarification'],
    ]);
    projection.item(
      'turn',
      { type: 'agentMessage', id: 'answer', text: 'Final authoritative answer' },
      true,
    );
    projection.delta('turn', 'answer', 'late duplicate delta');
    expect(projection.snapshot().messages[1]?.text).toBe('Final authoritative answer');
  });

  it('uses full item order instead of arrival order and ignores tool, reasoning and asset contents', () => {
    const projection = new LiveConversationProjection(() => undefined);
    projection.item('new', { type: 'agentMessage', id: 'answer', text: 'New answer' }, true);
    projection.reconcile(
      {
        data: [
          {
            id: 'new',
            status: 'completed',
            items: [
              {
                type: 'userMessage',
                id: 'new-user',
                content: [
                  { type: 'localImage', path: 'PRIVATE PATH' },
                  { type: 'text', text: 'New request' },
                ],
              },
              { type: 'reasoning', id: 'reasoning', content: ['SECRET'] },
              { type: 'commandExecution', id: 'tool', aggregatedOutput: 'SECRET' },
              { type: 'agentMessage', id: 'answer', text: 'New answer' },
            ],
          },
          {
            id: 'old',
            status: 'completed',
            items: [
              {
                type: 'userMessage',
                id: 'old-user',
                content: [{ type: 'text', text: 'Old request' }],
              },
            ],
          },
        ],
        nextCursor: null,
      },
      projection.generation,
    );
    expect(projection.snapshot().messages.map((m) => m.text)).toEqual([
      'Old request',
      'New request',
      'New answer',
    ]);
    expect(JSON.stringify(projection.snapshot())).not.toContain('SECRET');
    expect(JSON.stringify(projection.snapshot())).not.toContain('PRIVATE PATH');
  });

  it('bounds retained text, bytes and message count while disclosing omitted history', () => {
    const projection = new LiveConversationProjection(() => undefined);
    projection.reconcile(
      {
        data: [
          {
            id: 'turn',
            status: 'completed',
            items: Array.from({ length: 600 }, (_, index) => ({
              type: 'userMessage',
              id: `user-${index}`,
              content: [{ type: 'text', text: `Message ${index}` }],
            })),
          },
        ],
        nextCursor: 'older',
      },
      0,
    );
    expect(projection.snapshot().messages).toHaveLength(MAX_LIVE_MESSAGES);
    expect(projection.snapshot().messages[0]?.text).toBe('Message 200');
    for (let index = 0; index < 20; index++)
      projection.item(
        'large',
        {
          type: 'userMessage',
          id: `large-${index}`,
          content: [{ type: 'text', text: 'ы'.repeat(100_000) }],
        },
        true,
      );
    expect(projection.snapshot().messages.at(-1)?.text.length).toBe(MAX_LIVE_MESSAGE_TEXT);
    expect(Buffer.byteLength(JSON.stringify(projection.snapshot().messages))).toBeLessThanOrEqual(
      MAX_LIVE_CONVERSATION_BYTES,
    );
    expect(projection.snapshot().messages.length).toBeLessThan(MAX_LIVE_MESSAGES);
    expect(projection.snapshot().limited).toBe(true);
  });

  it('rejects malformed and oversized pages without replacing the known conversation', () => {
    const projection = new LiveConversationProjection(() => undefined);
    projection.item(
      'known',
      { type: 'userMessage', id: 'user', content: [{ type: 'text', text: 'Retained' }] },
      true,
    );
    const before = projection.snapshot();
    expect(() =>
      projection.reconcile(
        { data: [{ id: 'valid', items: [] }, { id: 'bad' }] },
        projection.generation,
      ),
    ).toThrow('invalid conversation');
    expect(() =>
      projection.reconcile(
        { data: Array.from({ length: 21 }, (_, index) => ({ id: `turn-${index}`, items: [] })) },
        projection.generation,
      ),
    ).toThrow('oversized');
    expect(projection.snapshot()).toEqual(before);
  });
});
