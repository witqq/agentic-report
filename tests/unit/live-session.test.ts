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
  const identity = {
    id: 'author-thread',
    writable: true,
    loaded: true,
    hold: false,
    holdHandshake: false,
    holdStatus: false,
    waitingStatus: 0,
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
