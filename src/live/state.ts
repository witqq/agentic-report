import { lstat, open, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { liveStateSchema, MAX_LIVE_STATE_BYTES, type LiveState } from './contract.js';

/** Atomic, serialized durable state. A torn write never replaces the last accepted conversation. */
export class LiveStateStore {
  private chain = Promise.resolve();
  constructor(readonly file: string) {}

  async load(entry: string): Promise<LiveState> {
    try {
      const info = await lstat(this.file);
      if (!info.isFile() || info.isSymbolicLink())
        throw new Error('Live state must be an ordinary local file.');
      const handle = await open(this.file, 'r');
      try {
        if ((await handle.stat()).size > MAX_LIVE_STATE_BYTES)
          throw new Error('Live conversation exceeds its size limit.');
        const state = liveStateSchema.parse(JSON.parse(await handle.readFile('utf8')) as unknown);
        if (state.entry !== entry) throw new Error('Live state belongs to another document.');
        return {
          ...state,
          questions: state.questions.map((q) =>
            q.status === 'sending'
              ? {
                  ...q,
                  status: 'uncertain',
                  error:
                    'The service stopped before delivery was confirmed. Inspect the Codex conversation before resending.',
                }
              : q,
          ),
        };
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return { version: 1, entry, threadId: null, questions: [] };
      throw error;
    }
  }

  save(state: LiveState): Promise<void> {
    const bytes = `${JSON.stringify(liveStateSchema.parse(state))}\n`;
    if (Buffer.byteLength(bytes) > MAX_LIVE_STATE_BYTES)
      return Promise.reject(new Error('Live conversation exceeds its size limit.'));
    const job = this.chain.then(async () => {
      const temp = path.join(path.dirname(this.file), `.state-${randomUUID()}.tmp`);
      try {
        await writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
        await rename(temp, this.file);
      } finally {
        await rm(temp, { force: true });
      }
    });
    this.chain = job.catch(() => {});
    return job;
  }
}
