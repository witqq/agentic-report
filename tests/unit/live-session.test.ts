import { createServer } from 'node:http';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import { serveReport, type LiveReportServer, type LiveSnapshot } from '../../dist/node/live.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

interface Frame {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
}
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function control(): Promise<{
  root: string;
  socketPath: string;
  frames: Frame[];
  turns: Array<{ id: string; items: Record<string, unknown>[] }>;
  notify(method: string, params: Record<string, unknown>): void;
  idle(): void;
  disconnect(): void;
  releaseStatus(): void;
  identity: {
    id: string;
    writable: boolean;
    loaded: boolean;
    hold: boolean;
    holdHandshake: boolean;
    holdStatus: boolean;
    waitingStatus: number;
    invalidHistory: boolean;
  };
}> {
  const root = await createTestWorkspace('session');
  cleanups.push(() => removeTestWorkspace(root));
  await writeFile(path.join(root, 'report.md'), '# Author document\n\nOriginal evidence.\n');
  const socketPath = path.join(root, 'rpc.sock');
  const server = createServer();
  const ws = new WebSocketServer({ server, path: '/rpc' });
  const clients = new Set<WebSocket>();
  const frames: Frame[] = [];
  const turns: Array<{ id: string; items: Record<string, unknown>[] }> = [];
  const identity = {
    id: 'author-thread',
    writable: true,
    loaded: true,
    hold: false,
    holdHandshake: false,
    holdStatus: false,
    waitingStatus: 0,
    invalidHistory: false,
  };
  const statusReplies: Array<() => void> = [];
  let busy = true;
  let serial = 0;
  const emit = (client: WebSocket, frame: Frame): void => {
    client.send(JSON.stringify(frame));
  };
  const notify = (method: string, params: Record<string, unknown>): void => {
    for (const client of clients) emit(client, { method, params });
  };
  const idle = (): void => {
    busy = false;
    notify('turn/completed', {
      threadId: 'author-thread',
      turn: { id: 'external-turn', status: 'completed' },
    });
    notify('thread/status/changed', { threadId: 'author-thread', status: { type: 'idle' } });
  };
  ws.on('connection', (client) => {
    clients.add(client);
    client.on('close', () => clients.delete(client));
    client.on('message', (bytes) => {
      const frame = JSON.parse(bytes.toString()) as Frame;
      frames.push(frame);
      const rpcId = frame.id;
      if (rpcId === undefined) return;
      const result = (value: unknown): void => emit(client, { id: rpcId, result: value });
      if (frame.method === 'initialize' && !identity.holdHandshake) result({});
      if (frame.method === 'thread/turns/list')
        result({
          data: identity.invalidHistory
            ? [{ id: 'invalid' }]
            : turns
                .slice(-Number(frame.params?.limit ?? 20))
                .reverse()
                .map((turn) => ({
                  ...turn,
                  items:
                    frame.params?.itemsView === 'summary'
                      ? [
                          turn.items.find((item) => item.type === 'userMessage'),
                          [...turn.items].reverse().find((item) => item.type === 'agentMessage'),
                        ].filter((item) => item !== undefined)
                      : turn.items,
                })),
          nextCursor: null,
        });
      if (frame.method === 'thread/items/list') {
        const turn = turns.find((turn) => turn.id === frame.params?.turnId);
        const offset = Number(frame.params?.cursor ?? 0);
        const descending = [...(turn?.items ?? [])].reverse();
        const limit = Number(frame.params?.limit ?? 20);
        result({
          data: descending
            .slice(offset, offset + limit)
            .map((item) => ({ turnId: turn?.id, item })),
          nextCursor: offset + limit < descending.length ? String(offset + limit) : null,
        });
      }
      if (frame.method === 'thread/read' || frame.method === 'thread/resume') {
        const reply = (): void =>
          result({
            thread: {
              id: identity.id,
              canAcceptDirectInput: identity.writable,
              status: { type: !identity.loaded ? 'notLoaded' : busy ? 'active' : 'idle' },
            },
          });
        if (frame.method === 'thread/read' && identity.holdStatus) {
          statusReplies.push(reply);
          identity.waitingStatus++;
        } else reply();
      }
      if (frame.method !== 'turn/start') return;
      const id = `reader-${++serial}`;
      const text = ((frame.params?.input ?? []) as Array<{ text: string }>)[0]?.text ?? '';
      const question = text.split("Reader's question:\n")[1];
      if (!question) throw new Error('The reader turn has no question prompt.');
      busy = true;
      const user = {
        type: 'userMessage',
        id: `user-${id}`,
        clientId: frame.params?.clientUserMessageId ?? null,
        content: [{ type: 'text', text }],
      };
      const turn: { id: string; items: Record<string, unknown>[] } = { id, items: [user] };
      turns.push(turn);
      notify('item/completed', { threadId: 'author-thread', turnId: id, item: user });
      notify('thread/status/changed', { threadId: 'author-thread', status: { type: 'active' } });
      // Unrelated turns must not become ownership just because turn/start is awaiting acknowledgement.
      emit(client, {
        method: 'turn/started',
        params: { threadId: 'author-thread', turn: { id: 'external-turn' } },
      });
      emit(client, {
        method: 'item/agentMessage/delta',
        params: {
          threadId: 'author-thread',
          turnId: 'external-turn',
          itemId: 'foreign',
          delta: 'PRIVATE OUTSIDE TEXT',
        },
      });
      emit(client, {
        method: 'item/agentMessage/delta',
        params: {
          threadId: 'other-thread',
          turnId: id,
          itemId: 'foreign',
          delta: 'PRIVATE OTHER THREAD',
        },
      });
      emit(client, {
        id: 'approval-original',
        method: 'item/fileChange/requestApproval',
        params: { threadId: 'author-thread', turnId: id, itemId: 'original' },
      });
      emit(client, {
        method: 'item/started',
        params: {
          threadId: 'author-thread',
          turnId: id,
          item: { type: 'agentMessage', id: 'answer', text: '' },
        },
      });
      emit(client, {
        method: 'item/agentMessage/delta',
        params: { threadId: 'author-thread', turnId: id, itemId: 'answer', delta: 'Reader draft' },
      });
      if (identity.hold) {
        result({ turn: { id } });
        return;
      }
      // Complete before the RPC response to distinguish exact buffered ownership from event inference.
      emit(client, {
        method: 'item/completed',
        params: {
          threadId: 'author-thread',
          turnId: id,
          item: { type: 'agentMessage', id: 'answer', text: `Reader answer: ${question}` },
        },
      });
      turn.items.push({ type: 'agentMessage', id: 'answer', text: `Reader answer: ${question}` });
      emit(client, {
        method: 'turn/completed',
        params: { threadId: 'author-thread', turn: { id, status: 'completed' } },
      });
      busy = false;
      notify('thread/status/changed', { threadId: 'author-thread', status: { type: 'idle' } });
      result({ turn: { id } });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
  const disconnect = (): void => {
    for (const client of clients) client.terminate();
  };
  cleanups.push(async () => {
    disconnect();
    await new Promise<void>((resolve) => ws.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return {
    root,
    socketPath,
    frames,
    turns,
    notify,
    idle,
    disconnect,
    identity,
    releaseStatus: () => {
      identity.holdStatus = false;
      for (const reply of statusReplies.splice(0)) reply();
      identity.waitingStatus = 0;
    },
  };
}

async function start(peer: Awaited<ReturnType<typeof control>>): Promise<LiveReportServer> {
  const service = await serveReport({
    input: peer.root,
    codexSocket: peer.socketPath,
    threadId: 'author-thread',
  });
  cleanups.push(() => service.close());
  return service;
}
async function wait(
  service: LiveReportServer,
  predicate: (value: LiveSnapshot) => boolean,
): Promise<void> {
  await expect.poll(() => predicate(service.snapshot())).toBe(true);
}
const submit = (service: LiveReportServer, id: string, text: string): Promise<Response> =>
  fetch(new URL('questions', service.url), {
    method: 'POST',
    headers: { Origin: service.url.slice(0, -1), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, text }),
  });

describe('current Codex living document', () => {
  it('mirrors terminal steering and subsequent streaming while the acknowledged browser turn is still active', async () => {
    const peer = await control();
    peer.identity.hold = true;
    peer.idle();
    const service = await start(peer);
    await wait(service, (s) => s.agent === 'ready');
    await submit(service, 'active-browser', 'Active browser request');
    await wait(service, (s) => s.questions[0]?.answer === 'Reader draft');
    expect(service.snapshot().questions[0]?.status).toBe('sending');
    const steering = {
      type: 'userMessage',
      id: 'active-steering',
      clientId: 'terminal-input',
      content: [{ type: 'text', text: 'Clarification during the reply' }],
    };
    peer.notify('item/completed', {
      threadId: 'author-thread',
      turnId: 'reader-1',
      item: steering,
    });
    peer.notify('item/started', {
      threadId: 'author-thread',
      turnId: 'reader-1',
      item: { type: 'agentMessage', id: 'after-steering', text: '' },
    });
    peer.notify('item/agentMessage/delta', {
      threadId: 'author-thread',
      turnId: 'reader-1',
      itemId: 'after-steering',
      delta: 'Stream after clarification',
    });
    await expect
      .poll(() => service.snapshot().conversation?.messages.map((m) => m.text))
      .toEqual([
        'Active browser request',
        'Reader draft',
        'Clarification during the reply',
        'Stream after clarification',
      ]);
    expect(service.snapshot().questions[0]?.status).toBe('sending');
    const turn = peer.turns[0];
    if (!turn) throw new Error('Missing active browser turn');
    turn.items.push({ type: 'agentMessage', id: 'answer', text: 'First final reply' }, steering, {
      type: 'agentMessage',
      id: 'after-steering',
      text: 'Final clarified reply',
    });
    for (const item of turn.items.slice(1))
      peer.notify('item/completed', { threadId: 'author-thread', turnId: turn.id, item });
    peer.notify('turn/completed', {
      threadId: 'author-thread',
      turn: { id: turn.id, status: 'completed' },
    });
    peer.idle();
    await wait(service, (s) => s.questions[0]?.status === 'completed');
    expect(service.snapshot().questions[0]?.answer).toBe(
      'First final reply\n\nFinal clarified reply',
    );
    expect(service.snapshot().conversation?.messages.map((m) => m.text)).toEqual([
      'Active browser request',
      'First final reply',
      'Clarification during the reply',
      'Final clarified reply',
    ]);
    expect(peer.frames.filter((f) => f.method === 'turn/start')).toHaveLength(1);
  });
  it('loads intervening messages through small item pages instead of one full tool-heavy turn', async () => {
    const peer = await control();
    const user = (id: string, text: string): Record<string, unknown> => ({
      type: 'userMessage',
      id,
      clientId: id,
      content: [{ type: 'text', text }],
    });
    peer.turns.push({
      id: 'long-turn',
      items: [
        user('first', 'Original terminal request'),
        ...Array.from({ length: 75 }, (_, index) => ({
          type: 'commandExecution',
          id: `before-${index}`,
          aggregatedOutput: 'TOOL LOG',
        })),
        { type: 'agentMessage', id: 'middle-answer', text: 'First answer' },
        user('steer', 'Clarification in the middle'),
        ...Array.from({ length: 75 }, (_, index) => ({
          type: 'commandExecution',
          id: `after-${index}`,
          aggregatedOutput: 'TOOL LOG',
        })),
        { type: 'agentMessage', id: 'final-answer', text: 'Second answer' },
      ],
    });
    peer.idle();
    const service = await start(peer);
    await wait(service, (s) => s.agent === 'ready');
    expect(service.snapshot().conversation?.messages.map((m) => m.text)).toEqual([
      'Original terminal request',
      'First answer',
      'Clarification in the middle',
      'Second answer',
    ]);
    expect(peer.frames.filter((f) => f.method === 'thread/items/list').length).toBeGreaterThan(1);
    expect(
      peer.frames
        .filter((f) => f.method === 'thread/items/list')
        .every((f) => f.params?.limit === 20 && f.params?.threadId === 'author-thread'),
    ).toBe(true);
    expect(
      peer.frames
        .filter((f) => f.method === 'thread/turns/list')
        .every((f) => f.params?.itemsView === 'summary'),
    ).toBe(true);
    expect(peer.frames.some((f) => f.method === 'turn/start')).toBe(false);
  });
  it('keeps browser delivery available when history is malformed and clears the warning after synchronization recovers', async () => {
    const peer = await control();
    peer.identity.invalidHistory = true;
    peer.idle();
    const service = await start(peer);
    await wait(service, (s) => s.agent === 'ready');
    expect(service.snapshot().error).toContain('history could not synchronize');
    peer.identity.invalidHistory = false;
    expect((await submit(service, 'after-history-error', 'Keep delivery available')).status).toBe(
      202,
    );
    await wait(service, (s) => s.questions[0]?.status === 'completed' && !s.error);
    expect(service.snapshot().conversation?.messages[0]?.text).toBe('Keep delivery available');
    expect(peer.frames.filter((f) => f.method === 'turn/start')).toHaveLength(1);
  });
  it('mirrors terminal input between agent replies without resending it or duplicating browser questions', async () => {
    const peer = await control();
    const user = (id: string, text: string): Record<string, unknown> => ({
      type: 'userMessage',
      id,
      clientId: id,
      content: [{ type: 'text', text }],
    });
    peer.turns.push({
      id: 'existing',
      items: [
        user('terminal-first', 'From terminal'),
        { type: 'agentMessage', id: 'existing-answer', text: 'Initial answer' },
      ],
    });
    peer.idle();
    const service = await start(peer);
    const conversation = (): Array<{
      id: string;
      role: string;
      text: string;
      questionId?: string;
    }> =>
      (
        service.snapshot() as unknown as {
          conversation?: {
            messages: Array<{ id: string; role: string; text: string; questionId?: string }>;
          };
        }
      ).conversation?.messages ?? [];
    await expect
      .poll(() => conversation().map((m) => m.text))
      .toEqual(['From terminal', 'Initial answer']);
    await submit(service, 'browser', 'From browser');
    await wait(service, (s) => s.questions[0]?.status === 'completed');
    const terminal = user('terminal-steer', 'My clarification');
    peer.notify('item/completed', {
      threadId: 'author-thread',
      turnId: 'reader-1',
      item: terminal,
    });
    peer.notify('item/completed', {
      threadId: 'author-thread',
      turnId: 'reader-1',
      item: terminal,
    });
    peer.notify('item/completed', {
      threadId: 'other-thread',
      turnId: 'reader-1',
      item: user('private', 'FOREIGN SECRET'),
    });
    peer.notify('item/completed', {
      threadId: 'author-thread',
      turnId: 'reader-1',
      item: { type: 'commandExecution', id: 'tool', aggregatedOutput: 'TOOL SECRET' },
    });
    peer.notify('item/completed', {
      threadId: 'author-thread',
      turnId: 'reader-1',
      item: { type: 'agentMessage', id: 'clarified-answer', text: 'Clarified answer' },
    });
    await expect
      .poll(() => conversation().map((m) => m.text))
      .toEqual([
        'From terminal',
        'Initial answer',
        'From browser',
        'Reader answer: From browser',
        'My clarification',
        'Clarified answer',
      ]);
    expect(conversation().filter((m) => m.questionId === 'browser')).toHaveLength(1);
    expect(peer.frames.filter((f) => f.method === 'turn/start')).toHaveLength(1);
    expect(peer.frames.find((f) => f.method === 'turn/start')?.params?.clientUserMessageId).toBe(
      'agentic-report:browser',
    );
    peer.turns[1]?.items.push(terminal, {
      type: 'agentMessage',
      id: 'clarified-answer',
      text: 'Clarified answer',
    });
    // Reconstruct the same protocol identities after reader restart; there is still one delivery.
    await service.close();
    const again = await start(peer);
    await wait(again, (s) => s.agent === 'ready');
    expect(again.snapshot().conversation?.messages.map((m) => m.text)).toEqual([
      'From terminal',
      'Initial answer',
      'From browser',
      'Reader answer: From browser',
      'My clarification',
      'Clarified answer',
    ]);
    expect(peer.frames.filter((f) => f.method === 'turn/start')).toHaveLength(1);
  });

  it('reconciles saved legacy browser prompts by exact unique content and preserves terminal input with identical text', async () => {
    const peer = await control();
    peer.idle();
    let service = await start(peer);
    await wait(service, (s) => s.agent === 'ready');
    await submit(service, 'legacy', 'A legacy browser question');
    await wait(service, (s) => s.questions[0]?.status === 'completed');
    await service.close();
    const turn = peer.turns[0];
    if (!turn) throw new Error('Missing admitted turn');
    const original = turn.items[0];
    if (!original) throw new Error('Missing original user message');
    original.clientId = null;
    turn.items.push({ ...original, id: 'manual-copy', clientId: 'terminal-client' });
    service = await start(peer);
    await wait(service, (s) => s.agent === 'ready');
    expect(
      service.snapshot().conversation?.messages.filter((m) => m.questionId === 'legacy'),
    ).toHaveLength(1);
    const manual = service.snapshot().conversation?.messages.find((m) => m.id === 'manual-copy');
    expect(manual?.questionId).toBeUndefined();
    expect(manual?.text).toContain("Reader's question:");
    expect(peer.frames.filter((f) => f.method === 'turn/start')).toHaveLength(1);
  });
  const cancel = (
    service: LiveReportServer,
    id: string,
    origin = service.url.slice(0, -1),
  ): Promise<Response> =>
    fetch(new URL('questions/cancel', service.url), {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });

  it('cancels durably while delivery readiness is pending and never sends cancelled work after restart', async () => {
    const peer = await control();
    let service = await start(peer);
    await wait(service, (s) => s.agent === 'working');
    await submit(service, 'cancelled', 'do not send this');
    await submit(service, 'second', 'keep second');
    await submit(service, 'third', 'keep third');
    peer.identity.holdStatus = true;
    peer.idle();
    await expect.poll(() => peer.identity.waitingStatus).toBeGreaterThan(0);
    expect((await cancel(service, 'second', 'https://foreign.invalid')).status).toBe(403);
    expect((await cancel(service, 'missing')).status).toBe(404);
    expect((await cancel(service, 'cancelled')).status).toBe(200);
    expect((await cancel(service, 'cancelled')).status).toBe(200);
    peer.releaseStatus();
    await wait(service, (s) => s.questions[2]?.status === 'completed');
    expect(service.snapshot().questions.map((q) => q.status)).toEqual([
      'cancelled',
      'completed',
      'completed',
    ]);
    expect((await cancel(service, 'third')).status).toBe(409);
    expect(service.snapshot().questions.map((q) => q.answer)).toEqual([
      '',
      'Reader answer: keep second',
      'Reader answer: keep third',
    ]);
    await service.close();
    service = await start(peer);
    await wait(service, (s) => s.agent === 'ready');
    expect(service.snapshot().questions[0]?.status).toBe('cancelled');
    expect(peer.frames.filter((f) => f.method === 'turn/start')).toHaveLength(2);
  });

  it('refuses active cancellation and leaves queued work intact when cancellation cannot persist', async () => {
    const peer = await control();
    peer.identity.hold = true;
    peer.idle();
    const service = await start(peer);
    await wait(service, (s) => s.agent === 'ready');
    await submit(service, 'active', 'active question');
    await wait(service, (s) => s.questions[0]?.answer === 'Reader draft');
    await submit(service, 'waiting', 'waiting question');
    expect((await cancel(service, 'active')).status).toBe(409);
    const backup = `${service.statePath}.backup`;
    await rename(service.statePath, backup);
    await mkdir(service.statePath);
    try {
      const refused = await cancel(service, 'waiting');
      expect(refused.status).toBe(400);
      expect(await refused.json()).toEqual({
        error:
          'The cancellation could not be saved. The question is still waiting. Check conversation storage and retry.',
      });
      expect(service.snapshot().questions[1]?.status).toBe('queued');
    } finally {
      await rm(service.statePath, { recursive: true });
      await rename(backup, service.statePath);
    }
    expect((await cancel(service, 'waiting')).status).toBe(200);
    expect(service.snapshot().questions[0]?.status).toBe('sending');
    expect(peer.frames.some((f) => f.method === 'turn/interrupt')).toBe(false);
  });

  it('persists author identity before accepting a queued question during startup', async () => {
    const peer = await control();
    peer.identity.holdHandshake = true;
    let service = await start(peer);
    await expect.poll(() => peer.frames.some((f) => f.method === 'initialize')).toBe(true);
    expect((await submit(service, 'startup', 'queued before connecting')).status).toBe(202);
    expect(service.snapshot().questions[0]?.status).toBe('queued');
    await service.close();
    peer.identity.holdHandshake = false;
    peer.idle();
    service = await start(peer);
    await wait(service, (s) => s.questions[0]?.status === 'completed');
    expect(service.snapshot().questions[0]?.answer).toBe('Reader answer: queued before connecting');
    expect(peer.frames.filter((f) => f.method === 'turn/start')).toHaveLength(1);
  });

  it('waits for the existing conversation, sends FIFO to that identity and isolates pre-ack turns', async () => {
    const peer = await control();
    const service = await start(peer);
    await wait(service, (s) => s.agent === 'working');
    expect(service.snapshot().connection).toEqual({ mode: 'current', threadId: 'author-thread' });
    expect((await submit(service, 'first', 'first question')).status).toBe(202);
    expect((await submit(service, 'second', 'second question')).status).toBe(202);
    expect(service.snapshot().questions.map((q) => q.status)).toEqual(['queued', 'queued']);
    expect(
      peer.frames.some(
        (f) =>
          f.method === 'turn/start' || f.method === 'turn/steer' || f.method === 'thread/start',
      ),
    ).toBe(false);
    peer.idle();
    await wait(service, (s) => s.questions[1]?.status === 'completed');
    expect(service.snapshot().questions.map((q) => q.answer)).toEqual([
      'Reader answer: first question',
      'Reader answer: second question',
    ]);
    const starts = peer.frames.filter((f) => f.method === 'turn/start');
    expect(starts).toHaveLength(2);
    expect(starts.every((f) => f.params?.threadId === 'author-thread')).toBe(true);
    expect(
      peer.frames
        .filter((f) => f.method === 'thread/resume')
        .every(
          (f) =>
            JSON.stringify(f.params) ===
            JSON.stringify({ threadId: 'author-thread', excludeTurns: true }),
        ),
    ).toBe(true);
    await service.close();
    expect(peer.frames.some((f) => f.id === 'approval-original' && !f.method)).toBe(false);
    expect(
      peer.frames.some((f) =>
        ['turn/steer', 'turn/interrupt', 'thread/start', 'shutdown'].includes(f.method ?? ''),
      ),
    ).toBe(false);
    // The same control server survives reader shutdown, and restart restores its same conversation.
    const again = await start(peer);
    await wait(again, (s) => s.agent === 'ready');
    expect(again.snapshot().questions[1]?.answer).toBe('Reader answer: second question');
    expect(peer.frames.filter((f) => f.method === 'turn/start')).toHaveLength(2);
  });

  it('fails closed for another, unloaded or read-only session without creating an agent', async () => {
    for (const failure of ['identity', 'loaded', 'writable'] as const) {
      const peer = await control();
      if (failure === 'identity') peer.identity.id = 'wrong-thread';
      else peer.identity[failure] = false;
      const service = await start(peer);
      await wait(service, (s) => s.agent === 'failed');
      expect((await submit(service, 'refused', 'do not deliver')).status).toBe(400);
      expect(
        peer.frames.some((f) => f.method === 'turn/start' || f.method === 'thread/start'),
      ).toBe(false);
    }
  });

  it('refuses missing identity and populated conversation transfer before connecting', async () => {
    const peer = await control();
    await expect(
      serveReport({ input: peer.root, threadId: '', codexSocket: peer.socketPath }),
    ).rejects.toThrow('Start serve from your Codex conversation');
    peer.idle();
    const service = await start(peer);
    await wait(service, (s) => s.agent === 'ready');
    await submit(service, 'existing', 'existing question');
    await wait(service, (s) => s.questions[0]?.status === 'completed');
    await service.close();
    await expect(
      serveReport({ input: peer.root, threadId: 'different-author', codexSocket: peer.socketPath }),
    ).rejects.toThrow('different Codex session');
    const persisted = JSON.parse(await readFile(service.statePath, 'utf8')) as { threadId: string };
    expect(persisted.threadId).toBe('author-thread');
  });

  it('keeps uncertain delivery on disconnect without terminating the shared server or replaying', async () => {
    const peer = await control();
    peer.idle();
    peer.identity.hold = true;
    let service = await start(peer);
    await wait(service, (s) => s.agent === 'ready');
    await submit(service, 'interrupted', 'held question');
    await wait(service, (s) => s.questions[0]?.answer === 'Reader draft');
    peer.disconnect();
    await wait(service, (s) => s.questions[0]?.status === 'uncertain' && s.agent === 'failed');
    await service.close();
    peer.idle();
    service = await start(peer);
    await wait(service, (s) => s.agent === 'ready');
    expect(service.snapshot().questions[0]?.status).toBe('uncertain');
    expect(peer.frames.filter((f) => f.method === 'turn/start')).toHaveLength(1);
  });
});
