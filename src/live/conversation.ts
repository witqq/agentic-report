import {
  MAX_LIVE_CONVERSATION_BYTES,
  MAX_LIVE_MESSAGES,
  MAX_LIVE_MESSAGE_TEXT,
  type LiveConversation,
  type LiveConversationMessage,
} from './contract.js';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
const identity = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 200;
interface Entry {
  message: LiveConversationMessage;
  revision: number;
  complete: boolean;
  bytes: number;
}

/** Hides protocol ordering, reconciliation races and retention from transport and presentation. */
export class LiveConversationProjection {
  private turns = new Map<string, Map<string, Entry>>();
  private revision = 0;
  private limited = false;
  private reconciling = false;
  private bytes = 2;
  private count = 0;

  constructor(
    private readonly questionForMessage: (clientId: unknown, text: string) => string | undefined,
  ) {}

  get generation(): number {
    return this.revision;
  }

  snapshot(): LiveConversation {
    return {
      messages: [...this.turns.values()].flatMap((items) =>
        [...items.values()].map((entry) => entry.message),
      ),
      limited: this.limited,
    };
  }

  item(
    turnId: unknown,
    value: unknown,
    complete: boolean,
    readAt?: number,
  ): LiveConversationMessage | undefined {
    const item = record(value);
    if (!identity(turnId) || !identity(item.id)) return;
    const role =
      item.type === 'userMessage' ? 'user' : item.type === 'agentMessage' ? 'agent' : undefined;
    if (!role) return;
    let text: string;
    if (role === 'user') {
      if (!Array.isArray(item.content)) return;
      text = item.content
        .filter(
          (part: unknown) => record(part).type === 'text' && typeof record(part).text === 'string',
        )
        .map((part: unknown) => String(record(part).text))
        .join('\n');
    } else {
      if (typeof item.text !== 'string') return;
      text = item.text;
    }
    if (!text && role === 'user') return;
    const questionId = role === 'user' ? this.questionForMessage(item.clientId, text) : undefined;
    if (text.length > MAX_LIVE_MESSAGE_TEXT) this.limited = true;
    text = text.slice(0, MAX_LIVE_MESSAGE_TEXT);
    const prior = this.turns.get(turnId)?.get(item.id);
    if (
      prior &&
      ((readAt !== undefined && prior.revision > readAt) || (prior.complete && !complete))
    )
      return;
    const message: LiveConversationMessage = {
      id: item.id,
      turnId,
      role,
      text,
      ...(questionId ? { questionId } : {}),
    };
    this.put(message, complete);
    return message;
  }

  delta(turnId: unknown, id: unknown, delta: unknown): LiveConversationMessage | undefined {
    if (!identity(turnId) || !identity(id) || typeof delta !== 'string') return;
    const prior = this.turns.get(turnId)?.get(id);
    if (!prior || prior.complete || prior.message.role === 'user') return;
    const text = (prior?.message.text ?? '') + delta;
    if (text.length > MAX_LIVE_MESSAGE_TEXT) this.limited = true;
    const message: LiveConversationMessage = {
      id,
      turnId,
      role: 'agent',
      text: text.slice(0, MAX_LIVE_MESSAGE_TEXT),
    };
    this.put(message, false);
    return message;
  }

  reconcile(value: unknown, readAt: number): void {
    const page = record(value);
    if (!Array.isArray(page.data) || page.data.length > 20)
      throw new Error('Codex returned invalid or oversized conversation history.');
    if (
      page.data.some((value: unknown) => {
        const turn = record(value);
        return !identity(turn.id) || !Array.isArray(turn.items);
      })
    )
      throw new Error('Codex returned invalid conversation history.');
    this.reconciling = true;
    const existing = this.turns;
    const pageIds = new Set(page.data.map((value: unknown) => record(value).id));
    const ordered = new Map(
      [...existing].filter(
        ([id, items]) =>
          !pageIds.has(id) && [...items.values()].every((entry) => entry.revision <= readAt),
      ),
    );
    for (const value of [...page.data].reverse()) {
      const turn = record(value);
      if (!identity(turn.id) || !Array.isArray(turn.items))
        throw new Error('Codex returned invalid conversation history.');
      // Reuse item identities, but rebuild their order from the authoritative turn.
      const previous = existing.get(turn.id) ?? new Map<string, Entry>();
      const items = turn.itemsView === 'summary' ? new Map(previous) : new Map<string, Entry>();
      ordered.set(turn.id, items);
      for (const value of turn.items) {
        const item = record(value);
        if (!identity(item.id)) continue;
        const prior = previous.get(item.id);
        if (prior) items.set(item.id, prior);
        this.turns = ordered;
        this.item(turn.id, item, turn.status === 'completed', readAt);
      }
      for (const [id, entry] of previous)
        if (!items.has(id) && entry.revision > readAt) items.set(id, entry);
    }
    for (const [id, items] of existing)
      if (!ordered.has(id) && [...items.values()].some((entry) => entry.revision > readAt))
        ordered.set(id, items);
    this.turns = ordered;
    this.reconciling = false;
    const entries = [...this.turns.values()].flatMap((items) => [...items.values()]);
    this.bytes = entries.reduce((sum, entry) => sum + entry.bytes, 2);
    this.count = entries.length;
    this.limited ||= page.nextCursor !== null && page.nextCursor !== undefined;
    this.trim();
  }

  private put(message: LiveConversationMessage, complete: boolean): void {
    let items = this.turns.get(message.turnId);
    if (!items) {
      items = new Map();
      this.turns.set(message.turnId, items);
    }
    const bytes = new TextEncoder().encode(JSON.stringify(message)).byteLength + 1;
    const prior = items.get(message.id);
    if (!this.reconciling) {
      this.bytes += bytes - (prior?.bytes ?? 0);
      if (!prior) this.count++;
    }
    items.set(message.id, { message, complete, revision: ++this.revision, bytes });
    if (!this.reconciling) this.trim();
  }

  private trim(): void {
    for (const [turnId, items] of this.turns) {
      for (const [id, entry] of items) {
        if (this.count <= MAX_LIVE_MESSAGES && this.bytes <= MAX_LIVE_CONVERSATION_BYTES) break;
        items.delete(id);
        this.count--;
        this.bytes -= entry.bytes;
        this.limited = true;
      }
      if (!items.size) this.turns.delete(turnId);
    }
  }
}
