import { z } from 'zod';
import { parseReviewTargetManifest, type ReviewTargetReference } from '../review/contract.js';

export const MAX_LIVE_STATE_BYTES = 4_000_000;
export const MAX_LIVE_REQUEST_BYTES = 32_000;
export const MAX_LIVE_QUESTIONS = 200;
export const MAX_LIVE_MESSAGES = 400;
export const MAX_LIVE_CONVERSATION_BYTES = 1_000_000;
export const MAX_LIVE_MESSAGE_TEXT = 80_000;

/** A bounded read-only projection of the existing author's conversation, never a delivery queue. */
export interface LiveConversationMessage {
  readonly id: string;
  readonly turnId: string;
  readonly role: 'user' | 'agent';
  readonly text: string;
  readonly questionId?: string;
}
export interface LiveConversation {
  readonly messages: readonly LiveConversationMessage[];
  readonly limited: boolean;
}

const target = z.unknown().transform((value, ctx): ReviewTargetReference => {
  try {
    const parsed = parseReviewTargetManifest({
      contractVersion: 2,
      reportRevision: `sha256:${'0'.repeat(64)}`,
      targets: [value],
    }).targets[0];
    if (!parsed) throw new Error('Missing target');
    return parsed;
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid document target' });
    return z.NEVER;
  }
});

export const liveSubjectSchema = z
  .object({
    revision: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    locale: z.enum(['en', 'ru']),
    quote: z.string().trim().min(1).max(8000),
    start: target,
    end: target,
  })
  .strict();
export type LiveSubject = z.infer<typeof liveSubjectSchema>;

export const liveQuestionSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/u),
    text: z.string().trim().min(1).max(8000),
    subject: liveSubjectSchema.optional(),
  })
  .strict();
export type LiveQuestionInput = z.infer<typeof liveQuestionSchema>;

export const liveCancellationSchema = liveQuestionSchema.pick({ id: true }).strict();

const questionSchema = liveQuestionSchema
  .extend({
    status: z.enum(['queued', 'sending', 'completed', 'failed', 'uncertain', 'cancelled']),
    answer: z.string().max(80_000),
    error: z.string().max(2000).optional(),
  })
  .strict();
export type LiveQuestion = z.infer<typeof questionSchema>;

export const liveStateSchema = z
  .object({
    version: z.literal(1),
    entry: z.string().min(1),
    threadId: z.string().min(1).max(200).nullable(),
    questions: z.array(questionSchema).max(MAX_LIVE_QUESTIONS),
  })
  .strict()
  .superRefine((state, ctx) => {
    if (new Set(state.questions.map((q) => q.id)).size !== state.questions.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate question identity' });
  });
export type LiveState = z.infer<typeof liveStateSchema>;

export interface LiveSnapshot {
  readonly version: 1;
  readonly document: { readonly url: string; readonly revision: string; readonly title: string };
  readonly agent: 'starting' | 'ready' | 'working' | 'offline' | 'failed';
  readonly connection?: {
    readonly mode: 'current' | 'standalone' | 'none';
    readonly threadId?: string;
  };
  readonly questions: readonly (LiveQuestion & {
    readonly binding?: 'exact' | 'changed' | 'missing' | 'ambiguous';
  })[];
  readonly conversation?: LiveConversation;
  readonly error?: string;
}

export type LiveEvent =
  | { readonly type: 'snapshot'; readonly snapshot: LiveSnapshot }
  | { readonly type: 'session-message'; readonly message: LiveConversationMessage }
  | { readonly type: 'delta'; readonly id: string; readonly text: string };

export interface ServeReportOptions {
  readonly input: string;
  /** Loopback port; zero asks the OS for an available port. */
  readonly port?: number;
  /** codex attaches this author session; standalone explicitly owns a separate agent. */
  readonly agent?: 'codex' | 'standalone' | 'none';
  readonly codexCommand?: string;
  /** Existing author identity; defaults to the current Codex environment in attach mode. */
  readonly threadId?: string;
  /** Absolute Unix control socket of the existing Codex server. */
  readonly codexSocket?: string;
}

export interface LiveReportServer {
  readonly url: string;
  readonly statePath: string;
  readonly snapshot: () => LiveSnapshot;
  readonly close: () => Promise<void>;
}
