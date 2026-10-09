import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { getAgentEnvironment } from '../config/environment.js';

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
}

/** Owns one app-server, one thread, and one turn. Files stay Codex's responsibility. */
export class LiveCodex {
  private child: ChildProcessWithoutNullStreams | undefined;
  private buffer = '';
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve: (value: RecordValue) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  private active:
    | {
        id?: string;
        resolve: () => void;
        reject: (error: Error) => void;
        onText: (text: string, itemId: string, final: boolean) => void;
      }
    | undefined;
  private closed = false;
  private failure: Error | undefined;
  private ended = new Set<string>();
  threadId: string | undefined;

  get busy(): boolean {
    return this.active !== undefined;
  }
  async readyToSend(): Promise<boolean> {
    return !this.busy;
  }

  constructor(
    private readonly options: {
      command: string;
      cwd: string;
      threadId?: string;
      onError: (message: string, terminal: boolean) => void;
    },
  ) {}

  async start(): Promise<string> {
    const child = spawn(this.options.command, ['app-server'], {
      cwd: this.options.cwd,
      env: getAgentEnvironment(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      this.buffer += chunk;
      if (this.buffer.length > 8_000_000) {
        this.fail(new Error('Codex protocol exceeded its message limit.'));
        return;
      }
      while (this.buffer.includes('\n')) {
        const index = this.buffer.indexOf('\n');
        const line = this.buffer.slice(0, index);
        this.buffer = this.buffer.slice(index + 1);
        if (!line.trim()) continue;
        try {
          this.dispatch(record(JSON.parse(line) as unknown));
        } catch {
          this.fail(new Error('Codex sent invalid protocol data.'));
        }
      }
    });
    // Drain diagnostics without putting local credentials or source text on the live transport.
    child.stderr.resume();
    child.on('error', () =>
      this.fail(new Error('Codex could not start. Install Codex and sign in before serving.')),
    );
    child.stdin.on('error', () =>
      this.fail(new Error('The connection to Codex closed; delivery may be uncertain.')),
    );
    child.on('exit', () =>
      this.fail(new Error('Codex stopped; restart the live service to reconnect.')),
    );
    await this.request('initialize', {
      clientInfo: { name: 'agentic_report', title: 'Agentic Report', version: '1.0.0' },
    });
    this.write({ method: 'initialized' });
    const result = await this.request(this.options.threadId ? 'thread/resume' : 'thread/start', {
      cwd: this.options.cwd,
      ...(this.options.threadId ? { threadId: this.options.threadId } : {}),
    });
    const id = record(result.thread).id;
    if (typeof id !== 'string' || !id)
      throw new Error('Codex did not return a conversation identity.');
    this.threadId = id;
    return id;
  }

  async send(
    text: string,
    onText: (text: string, itemId: string, final: boolean) => void,
  ): Promise<void> {
    if (this.active) throw new Error('A Codex turn is already active.');
    if (!this.threadId || this.failure || this.closed)
      throw this.failure ?? new Error('Codex is not ready.');
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const finished = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    // Install the terminal handler before turn/start: events may precede its RPC response.
    const active = { resolve, reject, onText } as NonNullable<LiveCodex['active']>;
    this.active = active;
    const started = this.request('turn/start', {
      threadId: this.threadId,
      input: [{ type: 'text', text }],
    });
    try {
      await Promise.all([
        started.then((value) => {
          const id = record(value.turn).id;
          if (typeof id === 'string') active.id = id;
        }),
        finished,
      ]);
    } catch (error) {
      if (this.active === active) this.active = undefined;
      throw error;
    }
  }

  private request(method: string, params: RecordValue): Promise<RecordValue> {
    if (this.failure || this.closed)
      return Promise.reject(this.failure ?? new Error('Codex is closed.'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.fail(
          new Error(
            `${method}: Codex did not confirm delivery; inspect the conversation before resending.`,
          ),
        );
        reject(this.failure ?? new Error('Codex request timed out.'));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ id, method, params });
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error('Codex delivery failed.'));
      }
    });
  }

  private write(value: RecordValue): void {
    if (!this.child?.stdin.writable) throw new Error('Codex transport is not writable.');
    this.child.stdin.write(`${JSON.stringify(value)}\n`);
  }

  private dispatch(frame: RecordValue): void {
    if (typeof frame.method === 'string' && frame.id !== undefined) {
      // This client cannot grant filesystem/network authority. Never leave a request hanging.
      const approvals = [
        'item/commandExecution/requestApproval',
        'item/fileChange/requestApproval',
      ];
      this.write(
        approvals.includes(frame.method)
          ? { id: frame.id, result: { decision: 'decline' } }
          : {
              id: frame.id,
              error: {
                code: -32601,
                message:
                  'This live client does not support this request. Use the Codex client to resolve it.',
              },
            },
      );
      this.options.onError(
        'Codex requested a decision this live client cannot grant. Review it in Codex; the request was declined.',
        false,
      );
      return;
    }
    if (typeof frame.id === 'number') {
      const pending = this.pending.get(frame.id);
      if (!pending) return;
      this.pending.delete(frame.id);
      clearTimeout(pending.timer);
      if (frame.error)
        pending.reject(
          new Error('Codex rejected the request. Inspect the conversation before retrying.'),
        );
      else pending.resolve(record(frame.result));
      return;
    }
    const params = record(frame.params);
    if (params.threadId !== this.threadId) return;
    const active = this.active;
    if (!active) return;
    if (
      typeof params.turnId === 'string' &&
      (this.ended.has(params.turnId) || (active.id && params.turnId !== active.id))
    )
      return;
    if (frame.method === 'turn/started') {
      const id = record(params.turn).id;
      if (typeof id === 'string' && this.ended.has(id)) return;
      if (typeof id === 'string') active.id = id;
    }
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
      const turn = record(params.turn);
      if (typeof turn.id === 'string' && this.ended.has(turn.id)) return;
      if (active.id && turn.id !== active.id) return;
      this.active = undefined;
      if (typeof turn.id === 'string') {
        this.ended.add(turn.id);
        if (this.ended.size > 8) {
          const old = this.ended.values().next().value;
          if (old) this.ended.delete(old);
        }
      }
      if (turn.status === 'completed') active.resolve();
      else
        active.reject(
          new Error(
            `Codex turn ${turn.status === 'interrupted' ? 'was interrupted' : 'failed'}. Inspect the conversation before retrying.`,
          ),
        );
    }
  }

  private fail(error: Error): void {
    if (this.failure || this.closed) return;
    this.failure = error;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    this.active?.reject(error);
    this.active = undefined;
    this.options.onError(error.message, true);
    this.child?.kill('SIGTERM');
  }

  async close(): Promise<void> {
    if (this.closed) return;
    const child = this.child;
    this.fail(new Error('Live service stopped during an active conversation.'));
    this.closed = true;
    if (!child || child.exitCode !== null || child.signalCode !== null || child.pid === undefined)
      return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 2000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill('SIGTERM');
    });
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
  }
}
