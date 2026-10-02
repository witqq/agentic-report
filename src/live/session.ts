import WebSocket from 'ws';
import type { LiveAgent } from './agent.js';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : {};

/** An observer/input client of an already loaded session. It never owns the agent process. */
export class LiveCodexSession implements LiveAgent {
  private socket: WebSocket | undefined;
  private nextId = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: RecordValue) => void;
      reject: (cause: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private active:
    | {
        id?: string;
        buffered: RecordValue[];
        bytes: number;
        onText: (text: string, itemId: string, final: boolean) => void;
        resolve: () => void;
        reject: (cause: Error) => void;
      }
    | undefined;
  private closed = false;
  private failure: Error | undefined;
  private refreshing: Promise<boolean> | undefined;
  private poll: NodeJS.Timeout | undefined;
  private working = true;
  get busy(): boolean {
    return this.working;
  }

  constructor(
    private readonly options: {
      socketPath: string;
      threadId: string;
      onAvailability: (available: boolean) => void;
      onError: (message: string, terminal: boolean) => void;
    },
  ) {}

  async start(): Promise<string> {
    const socket = new WebSocket(`ws+unix://${this.options.socketPath}:/rpc`, {
      perMessageDeflate: false,
      maxPayload: 8_000_000,
    });
    this.socket = socket;
    socket.on('message', (data) => {
      try {
        this.dispatch(record(JSON.parse(data.toString()) as unknown));
      } catch {
        this.fail(new Error('The current Codex session sent invalid protocol data.'));
      }
    });
    socket.on('error', () =>
      this.fail(new Error('The current Codex control connection is unavailable.')),
    );
    socket.on('close', () =>
      this.fail(new Error('The current Codex session disconnected; delivery may be uncertain.')),
    );
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.terminate();
        reject(new Error('The current Codex control connection timed out.'));
      }, 5000);
      const cleanup = (): void => {
        clearTimeout(timer);
        socket.off('error', failed);
        socket.off('close', failed);
      };
      const failed = (): void => {
        cleanup();
        reject(new Error('The current Codex control connection is unavailable.'));
      };
      socket.once('error', failed);
      socket.once('close', failed);
      socket.once('open', () => {
        cleanup();
        resolve();
      });
    });
    await this.request('initialize', {
      clientInfo: { name: 'agentic_report_live', version: '1.0.0' },
    });
    this.write({ method: 'initialized' });
    await this.readStatus();
    const result = await this.request('thread/resume', {
      threadId: this.options.threadId,
      excludeTurns: true,
    });
    if (record(result.thread).id !== this.options.threadId)
      throw new Error('Codex returned a different session; no question was sent.');
    // Recheck after subscription: external work may have changed between read and rejoin.
    await this.readStatus();
    if (this.closed || this.failure)
      throw this.failure ?? new Error('The reader closed while attaching to Codex.');
    this.poll = setInterval(() => {
      void this.readyToSend().catch(() => {});
    }, 1000);
    return this.options.threadId;
  }

  readyToSend(): Promise<boolean> {
    if (!this.refreshing)
      this.refreshing = this.readStatus().finally(() => {
        this.refreshing = undefined;
      });
    return this.refreshing;
  }

  private async readStatus(): Promise<boolean> {
    try {
      const result = await this.request('thread/read', {
        threadId: this.options.threadId,
        includeTurns: false,
      });
      const thread = record(result.thread);
      if (thread.id !== this.options.threadId)
        throw new Error('Codex returned a different session; no question was sent.');
      const status = record(thread.status).type;
      if (thread.canAcceptDirectInput !== true || (status !== 'active' && status !== 'idle'))
        throw new Error(
          'Open a writable author conversation in Codex before attaching the document.',
        );
      this.availability(status === 'idle');
      return status === 'idle';
    } catch (cause) {
      this.fail(
        cause instanceof Error ? cause : new Error('The current Codex session is unavailable.'),
      );
      throw this.failure;
    }
  }

  private availability(available: boolean): void {
    if (this.working === !available) return;
    this.working = !available;
    this.options.onAvailability(available);
  }

  async send(
    text: string,
    onText: (text: string, itemId: string, final: boolean) => void,
  ): Promise<void> {
    if (this.active || this.closed || this.failure)
      throw this.failure ?? new Error('The current session cannot accept another reader turn.');
    let resolve!: () => void;
    let reject!: (cause: Error) => void;
    const finished = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const active = { buffered: [], bytes: 0, onText, resolve, reject } as NonNullable<
      LiveCodexSession['active']
    >;
    this.active = active;
    try {
      await Promise.all([
        this.request('turn/start', {
          threadId: this.options.threadId,
          input: [{ type: 'text', text }],
        }).then((result) => {
          const id = record(result.turn).id;
          if (typeof id !== 'string' || !id)
            throw new Error('Codex did not confirm the reader turn identity.');
          active.id = id;
          const frames = active.buffered;
          active.buffered = [];
          for (const frame of frames) this.turnEvent(frame);
        }),
        finished,
      ]);
    } finally {
      if (this.active === active) this.active = undefined;
    }
  }

  private dispatch(frame: RecordValue): void {
    // Server requests belong to the original client. An observer must never race its decisions.
    if (typeof frame.method === 'string' && frame.id !== undefined) return;
    if (typeof frame.id === 'number') {
      const pending = this.pending.get(frame.id);
      if (!pending) return;
      this.pending.delete(frame.id);
      clearTimeout(pending.timer);
      if (frame.error)
        pending.reject(
          new Error(
            'Codex rejected the session request. Inspect the conversation before retrying.',
          ),
        );
      else pending.resolve(record(frame.result));
      return;
    }
    const params = record(frame.params);
    if (params.threadId !== this.options.threadId) return;
    if (frame.method === 'thread/status/changed') {
      const status = record(params.status).type;
      if (status === 'idle' || status === 'active') this.availability(status === 'idle');
      else this.fail(new Error('The author conversation is no longer available in Codex.'));
    }
    if (['thread/closed', 'thread/archived', 'thread/deleted'].includes(String(frame.method)))
      this.fail(new Error('The author conversation closed in Codex.'));
    if (frame.method === 'turn/completed') void this.readyToSend().catch(() => {});
    const active = this.active;
    if (!active) return;
    if (!active.id) {
      active.bytes += Buffer.byteLength(JSON.stringify(frame));
      if (active.bytes > 8_000_000) {
        this.fail(new Error('The reader turn exceeded its protocol buffer limit.'));
        return;
      }
      active.buffered.push(frame);
    } else this.turnEvent(frame);
  }

  private turnEvent(frame: RecordValue): void {
    const params = record(frame.params),
      active = this.active;
    if (!active?.id || params.threadId !== this.options.threadId) return;
    const turnId = frame.method === 'turn/completed' ? record(params.turn).id : params.turnId;
    if (turnId !== active.id) return;
    if (
      frame.method === 'item/agentMessage/delta' &&
      typeof params.delta === 'string' &&
      typeof params.itemId === 'string'
    )
      active.onText(params.delta, params.itemId, false);
    if (frame.method === 'item/completed') {
      const item = record(params.item);
      if (
        item.type === 'agentMessage' &&
        typeof item.text === 'string' &&
        typeof item.id === 'string'
      )
        active.onText(item.text, item.id, true);
    }
    if (frame.method === 'turn/completed') {
      this.active = undefined;
      if (record(params.turn).status === 'completed') active.resolve();
      else
        active.reject(
          new Error(
            'The reader turn did not complete. Inspect this conversation before resending.',
          ),
        );
    }
  }

  private request(method: string, params: RecordValue): Promise<RecordValue> {
    if (this.closed || this.failure)
      return Promise.reject(this.failure ?? new Error('The session connection is closed.'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(
          new Error('Codex did not confirm the session request; delivery may be uncertain.'),
        );
      }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ id, method, params });
      } catch {
        this.fail(new Error('The current Codex connection closed; delivery may be uncertain.'));
      }
    });
  }

  private write(frame: RecordValue): void {
    if (this.socket?.readyState !== WebSocket.OPEN)
      throw new Error('The current session connection is not open.');
    this.socket.send(JSON.stringify(frame), (cause) => {
      if (cause)
        this.fail(new Error('The current Codex connection closed; delivery may be uncertain.'));
    });
  }

  private fail(cause: Error): void {
    if (this.failure || this.closed) return;
    this.failure = cause;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(cause);
    }
    this.pending.clear();
    this.active?.reject(cause);
    this.active = undefined;
    this.options.onError(cause.message, true);
    clearInterval(this.poll);
    this.socket?.terminate();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.fail(new Error('The reader disconnected during a turn; the author session continues.'));
    this.closed = true;
    clearInterval(this.poll);
    this.socket?.terminate();
  }
}
