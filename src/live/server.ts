import { createHash, randomUUID } from 'node:crypto';
import { watch, type FSWatcher } from 'node:fs';
import {
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { lookup } from 'mime-types';
import { prepareReport, type PreparedReport } from '../core/prepare-report.js';
import { AgenticReportError, sanitizeDiagnostic, toDiagnostic } from '../diagnostics.js';
import { loadSource } from '../source/load-source.js';
import { bindReviewArtifact } from '../review/binding.js';
import { LiveCodex } from './codex.js';
import { LiveCodexSession } from './session.js';
import type { LiveAgent } from './agent.js';
import { getCodexSessionEnvironment } from '../config/environment.js';
import { LiveStateStore } from './state.js';
import { renderLiveShell } from './shell.js';
import {
  liveQuestionSchema,
  liveCancellationSchema,
  MAX_LIVE_QUESTIONS,
  MAX_LIVE_REQUEST_BYTES,
  type LiveEvent,
  type LiveQuestionInput,
  type LiveReportServer,
  type LiveSnapshot,
  type LiveState,
  type LiveConversation,
  type ServeReportOptions,
} from './contract.js';

interface Edition {
  id: string;
  directory: string;
  prepared: PreparedReport;
  files: Set<string>;
}

function error(message: string): AgenticReportError {
  return new AgenticReportError({
    level: 'error',
    code: 'LIVE_SERVICE_FAILED',
    message,
    remediation:
      'Check the source and live-state directory, and install/sign in to Codex when using the agent.',
  });
}

function inside(root: string, value: string): boolean {
  const relative = path.relative(root, value);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function appendToBody(html: string, markup: string): string {
  // Island documents may carry literal body tags inside an attribute. The outer renderer closes last.
  const end = html.lastIndexOf('</body>');
  if (end < 0) throw error('The generated document has no body.');
  return html.slice(0, end) + markup + html.slice(end);
}

/** Explicit hosting edge. Static compiler and artifacts do not acquire network behavior. */
export async function serveReport(options: ServeReportOptions): Promise<LiveReportServer> {
  if (
    !Number.isInteger(options.port ?? 0) ||
    (options.port ?? 0) < 0 ||
    (options.port ?? 0) > 65535
  )
    throw error('The live port must be an integer from 0 to 65535.');
  const mode = options.agent ?? 'codex';
  if (!['codex', 'standalone', 'none'].includes(mode))
    throw error('Choose codex, standalone or none as the live agent.');
  if (mode !== 'codex' && options.codexSocket !== undefined)
    throw error('A control socket attaches to an existing session; select codex mode.');
  const environment = mode === 'codex' ? getCodexSessionEnvironment() : undefined;
  const attachedThread = (options.threadId ?? environment?.threadId)?.trim();
  const socketPath = options.codexSocket ?? environment?.socketPath;
  let attachment: { readonly threadId: string; readonly socketPath: string } | undefined;
  if (mode === 'codex') {
    if (!attachedThread || attachedThread.length > 200)
      throw error(
        'Start serve from your Codex conversation, or provide --thread for an already loaded session.',
      );
    if (
      !socketPath ||
      !path.isAbsolute(socketPath) ||
      /[:?#]/u.test(socketPath) ||
      socketPath.includes('\0')
    )
      throw error('The Codex control socket must be an absolute Unix socket path.');
    if (options.codexCommand !== undefined)
      throw error('A Codex executable starts a separate agent; select standalone explicitly.');
    attachment = { threadId: attachedThread, socketPath };
  }
  const source = await loadSource(options.input);
  const root = await realpath(source.sourceRoot);
  const stateRoot = path.join(root, '.agentic-report');
  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
  if (!inside(root, await realpath(stateRoot)))
    throw error('The live-state directory leaves the source root.');
  const directory = path.join(
    stateRoot,
    `live-${createHash('sha256').update(source.entryPath).digest('hex').slice(0, 12)}`,
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (!inside(stateRoot, await realpath(directory)))
    throw error('The live-state directory is not confined.');
  const lockPath = path.join(directory, 'owner.lock');
  let lock: Awaited<ReturnType<typeof open>>;
  try {
    lock = await open(lockPath, 'wx', 0o600);
    await lock.writeFile(`${JSON.stringify({ pid: process.pid })}\n`);
  } catch {
    throw error(
      'This document is already being served, or a previous process left owner.lock. Check that process before removing the lock.',
    );
  }
  const store = new LiveStateStore(path.join(directory, 'conversation.json'));
  let state: LiveState;
  try {
    state = await store.load(source.entryPath);
    if (mode === 'codex' && state.questions.length && state.threadId !== attachedThread)
      throw error(
        'This document conversation belongs to a different Codex session. Use its existing session or a fresh document workspace.',
      );
    if (
      mode === 'standalone' &&
      state.questions.length &&
      options.threadId !== undefined &&
      options.threadId !== state.threadId
    )
      throw error('This saved conversation cannot be transferred to a different Codex thread.');
    // Persist the destination intent before startup admission, even if the handshake later fails.
    if (attachment) state.threadId = attachment.threadId;
    await store.save(state);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && /^(?:\.edition-)?[a-f0-9-]{36}$/u.test(entry.name))
        await rm(path.join(directory, entry.name), { recursive: true });
    }
  } catch (cause) {
    await lock.close();
    await rm(lockPath);
    throw cause;
  }
  const editions = new Map<string, Edition>();
  let edition: Edition | undefined;
  let agent: LiveSnapshot['agent'] = mode === 'none' ? 'offline' : 'starting';
  let serviceError: string | undefined;
  let buildError: string | undefined;
  let historyError: string | undefined;
  let closing = false;
  let rebuilding = false;
  let changed = 0;
  let debounce: NodeJS.Timeout | undefined;
  let rebuildTask: Promise<void> = Promise.resolve();
  const watchers = new Map<string, FSWatcher>();
  const listeners = new Set<ServerResponse>();
  let codex: LiveAgent | undefined;
  let processing: Promise<void> | undefined;
  let acceptance = Promise.resolve();
  let persistence = Promise.resolve();
  let url = '';
  let conversation: LiveConversation | undefined;

  // Capture each state write only after the preceding admission has committed to memory.
  // This prevents completion/thread writes from overwriting a newly persisted question.
  function persist(operation: () => Promise<void>): Promise<void> {
    const job = persistence.then(operation);
    persistence = job.catch(() => {});
    return job;
  }

  const snapshot = (): LiveSnapshot => {
    if (!edition) throw error('The live document has no successful edition.');
    const activeEdition = edition;
    const activeThread = mode === 'none' ? undefined : (attachment?.threadId ?? state.threadId);
    return {
      version: 1,
      document: {
        url: `/editions/${edition.id}/index.html`,
        revision: edition.prepared.reviewManifest.reportRevision,
        title: edition.prepared.source.manifest.title ?? 'Live document',
      },
      agent,
      connection: {
        mode: mode === 'codex' ? 'current' : mode,
        ...(activeThread ? { threadId: activeThread } : {}),
      },
      questions: state.questions.map((question) => {
        if (!question.subject) return { ...question };
        const selectedSubject = question.subject;
        const manifest = activeEdition.prepared.variants.find(
          (v) => v.locale === selectedSubject.locale,
        )?.reviewManifest;
        if (!manifest) return { ...question, binding: 'missing' as const };
        const binding =
          bindReviewArtifact(
            {
              contractVersion: 3,
              report: { revision: question.subject.revision },
              threads: [
                {
                  id: question.id,
                  segments: [
                    {
                      id: question.id,
                      reportRevision: question.subject.revision,
                      target: question.subject.start,
                      resolved: false,
                      messages: [],
                    },
                  ],
                },
              ],
            },
            manifest,
          ).threads[0]?.binding ?? 'missing';
        const endBinding =
          bindReviewArtifact(
            {
              contractVersion: 3,
              report: { revision: question.subject.revision },
              threads: [
                {
                  id: question.id,
                  segments: [
                    {
                      id: question.id,
                      reportRevision: question.subject.revision,
                      target: question.subject.end,
                      resolved: false,
                      messages: [],
                    },
                  ],
                },
              ],
            },
            manifest,
          ).threads[0]?.binding ?? 'missing';
        const aggregate =
          (['ambiguous', 'missing', 'changed', 'exact'] as const).find((v) =>
            [binding, endBinding].includes(v),
          ) ?? 'missing';
        return { ...question, binding: aggregate };
      }),
      ...(conversation ? { conversation } : {}),
      ...(serviceError || buildError || historyError
        ? { error: [buildError, serviceError, historyError].filter(Boolean).join('\n') }
        : {}),
    };
  };
  const publish = (event: LiveEvent): void => {
    const bytes = `data: ${JSON.stringify(event)}\n\n`;
    for (const listener of listeners)
      if (!listener.write(bytes)) {
        listeners.delete(listener);
        listener.end();
      }
  };
  const announce = (): void => {
    if (edition && !closing) publish({ type: 'snapshot', snapshot: snapshot() });
  };
  const setError = (message: string): void => {
    serviceError = message.slice(0, 2000);
    announce();
  };

  const browserCode = async (name: 'browser' | 'bridge'): Promise<string> => {
    const output = await build({
      entryPoints: [fileURLToPath(new URL(`./${name}.js`, import.meta.url))],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      minify: true,
      logLevel: 'silent',
    });
    const script = output.outputFiles[0];
    if (!script) throw error('The live browser bundle is missing.');
    return script.text.replaceAll('</script', '<\\/script');
  };
  let shell: string;
  let shellScriptHash: string;
  let bridge: string;
  const server = createServer((request, response) => {
    void route(request, response).catch(() => {
      if (!response.headersSent) json(response, 500, { error: 'The live request failed.' });
      else response.end();
    });
  });

  function changedSource(file?: string): void {
    if (closing || (file && inside(stateRoot, file))) return;
    changed++;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      rebuildTask = rebuildTask.then(rebuild);
      void rebuildTask.catch((cause: unknown) =>
        setError(sanitizeDiagnostic(toDiagnostic(cause)).message),
      );
    }, 120);
  }

  async function observe(files: readonly string[]): Promise<void> {
    const parents = new Set([root, ...files.map((f) => path.dirname(f))]);
    for (const parent of parents) {
      let canonical: string;
      try {
        canonical = await realpath(parent);
      } catch {
        continue;
      }
      if (!inside(root, canonical) || inside(stateRoot, canonical) || watchers.has(canonical))
        continue;
      const watcher = watch(canonical, (_kind, file) =>
        changedSource(file ? path.join(canonical, file.toString()) : undefined),
      );
      watcher.on('error', () =>
        setError('Source observation stopped for a document directory. Restart the live service.'),
      );
      watchers.set(canonical, watcher);
    }
  }

  async function rebuild(): Promise<void> {
    if (rebuilding || closing) return;
    rebuilding = true;
    try {
      let observed: number;
      do {
        observed = changed;
        const currentSource = await loadSource(source.entryPath);
        const prepared = await prepareReport({
          input: source.entryPath,
          format: 'directory',
          // Live readers can choose themes without changing sources. Explicit author choices win.
          manifestDefaults: currentSource.manifest.topbar ? { themeSwitcher: true } : {},
          ...(edition ? { since: path.join(edition.directory, 'index.html') } : {}),
        });
        await observe([...prepared.source.sourceFiles, ...prepared.resourceSourceFiles]);
        if (closing) return;
        if (observed !== changed) continue;
        // Revision describes source bytes, independent of the baked previous-edition layer.
        if (
          edition?.prepared.reviewManifest.reportRevision === prepared.reviewManifest.reportRevision
        ) {
          buildError = undefined;
          announce();
          return;
        }
        const id = randomUUID();
        const staging = path.join(directory, `.edition-${id}`);
        const output = path.join(directory, id);
        await mkdir(staging, { mode: 0o700 });
        const files = new Set(['index.html']);
        try {
          for (const resource of prepared.resourceFiles) {
            files.add(resource.relativePath);
            const target = path.join(staging, resource.relativePath);
            await mkdir(path.dirname(target), { recursive: true });
            await writeFile(target, resource.bytes);
          }
          let html = prepared.html;
          const liveManifests = Object.fromEntries(
            prepared.variants.map((variant) => [variant.locale, variant.reviewManifest]),
          );
          html = appendToBody(
            html,
            `<template data-live-manifests>${JSON.stringify(liveManifests).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</template>`,
          );
          if (!html.includes('data-edition-record'))
            html = appendToBody(
              html,
              prepared.variants
                .map(
                  (v) =>
                    `<template data-edition-record>${JSON.stringify(v.editionRecord).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</template>`,
                )
                .join(''),
            );
          // Directory script-src already allows package scripts from this origin. The page itself has no network channel.
          files.add('live-bridge.js');
          await writeFile(path.join(staging, 'live-bridge.js'), bridge);
          html = appendToBody(html, '<script src="live-bridge.js" defer></script>');
          await writeFile(path.join(staging, 'index.html'), html);
          if (observed !== changed || closing) {
            await rm(staging, { recursive: true });
            continue;
          }
          await rename(staging, output);
        } catch (cause) {
          await rm(staging, { recursive: true, force: true });
          throw cause;
        }
        edition = { id, directory: output, prepared, files };
        editions.set(id, edition);
        buildError = undefined;
        announce();
        while (editions.size > 20) {
          const old = editions.keys().next().value;
          if (!old) break;
          const retired = editions.get(old);
          if (!retired) break;
          editions.delete(old);
          await rm(retired.directory, { recursive: true, force: true });
        }
      } while (observed !== changed && !closing);
    } catch (cause) {
      const raw = toDiagnostic(cause);
      const diagnostic = sanitizeDiagnostic(raw);
      const failedPath =
        typeof raw.details?.target === 'string' ? raw.details.target : raw.source?.file;
      if (failedPath && inside(root, path.resolve(failedPath))) {
        let parent = path.dirname(path.resolve(failedPath));
        while (inside(root, parent)) {
          try {
            await stat(parent);
            await observe([path.join(parent, 'missing')]);
            break;
          } catch {
            parent = path.dirname(parent);
          }
        }
      }
      if (!edition) throw cause;
      buildError = `The document could not rebuild. The last successful edition remains visible. ${diagnostic.message}`;
      announce();
    } finally {
      rebuilding = false;
    }
  }

  function questionPrompt(question: LiveQuestionInput): string {
    return (
      `You are helping the reader of an Agentic Report document. The authored entry is ${source.entryPath}. Answer the reader in this conversation; when asked to expand or edit, change the original declarative Markdown/data/assets in this source root. Do not edit .agentic-report or generated HTML. File changes are observed and rebuilt automatically. Do not commit, publish or deploy. Preserve unrelated content. Read applicable project instructions.\n` +
      (question.subject
        ? `The reader selected this historical rendered quote in locale ${question.subject.locale}, revision ${question.subject.revision}:\n${question.subject.quote}\nIts source starts in ${question.subject.start.source.file}:${question.subject.start.source.line} and ends in ${question.subject.end.source.file}:${question.subject.end.source.endLine}. These rendered selection offsets are not Markdown edit offsets. Re-read the current source before editing.\n`
        : '') +
      `\nReader's question:\n${question.text}`
    );
  }

  function drain(): void {
    if (processing || !codex || agent !== 'ready' || closing) return;
    const client = codex;
    processing = (async () => {
      while (!closing && agent === 'ready') {
        const question = state.questions.find((q) => q.status === 'queued');
        if (!question) break;
        if (!(await client.readyToSend())) {
          agent = 'working';
          announce();
          break;
        }
        // Claim and cancellation share admission's order. A cancelled waiter cannot be sent later.
        let claimed = false;
        const claim = acceptance.then(async () => {
          if (closing || question.status !== 'queued') return;
          await persist(async () => {
            await store.save({
              ...state,
              questions: state.questions.map((q) =>
                q === question ? { ...q, status: 'sending', answer: '' } : q,
              ),
            });
            question.status = 'sending';
            question.answer = '';
            claimed = true;
          });
        });
        acceptance = claim.catch(() => {});
        await claim;
        if (!claimed) continue;
        agent = 'working';
        announce();
        const parts = new Map<string, string>();
        try {
          await client.send(
            questionPrompt(question),
            (text, itemId, final) => {
              parts.set(itemId, (final ? text : (parts.get(itemId) ?? '') + text).slice(0, 80_000));
              question.answer = [...parts.values()].join('\n\n').slice(0, 80_000);
              publish({ type: 'delta', id: question.id, text: question.answer });
            },
            `agentic-report:${question.id}`,
          );
          question.status = 'completed';
          agent = 'ready';
        } catch (cause) {
          question.status = 'uncertain';
          question.error =
            cause instanceof Error ? cause.message.slice(0, 2000) : 'Codex delivery failed.';
          agent = 'failed';
        }
        await persist(() => store.save(state));
        announce();
        changedSource();
      }
    })()
      .catch(() => {
        agent = 'failed';
        setError(
          'The conversation could not be saved. Restart after checking the state directory.',
        );
      })
      .finally(() => {
        processing = undefined;
        if (agent === 'ready' && state.questions.some((q) => q.status === 'queued')) drain();
      });
  }

  async function accept(input: unknown): Promise<void> {
    const question = liveQuestionSchema.parse(input);
    const prior = state.questions.find((q) => q.id === question.id);
    if (prior) {
      if (
        prior.text !== question.text ||
        JSON.stringify(prior.subject) !== JSON.stringify(question.subject)
      )
        throw error('Question identity was already used.');
      return;
    }
    if (agent === 'offline' || agent === 'failed' || closing)
      throw error('Codex is unavailable; the question was not sent.');
    if (state.questions.length >= MAX_LIVE_QUESTIONS)
      throw error(
        'This conversation is full. Archive its state before starting a new conversation.',
      );
    if (question.subject) {
      const selectedSubject = question.subject;
      const manifest = edition?.prepared.variants.find(
        (v) => v.locale === selectedSubject.locale,
      )?.reviewManifest;
      if (
        !manifest ||
        question.subject.revision !== manifest.reportRevision ||
        [question.subject.start, question.subject.end].some(
          (t) => !manifest.targets.some((current) => JSON.stringify(current) === JSON.stringify(t)),
        )
      )
        throw error(
          'The selected text belongs to a different edition. Select it again in the current document.',
        );
    }
    try {
      await persist(async () => {
        const admitted = { ...question, status: 'queued' as const, answer: '' };
        await store.save({ ...state, questions: [...state.questions, admitted] });
        state.questions.push(admitted);
      });
    } catch {
      throw error(
        'The question could not be saved and was not accepted. Check conversation storage and retry.',
      );
    }
    announce();
    drain();
  }

  async function cancel(input: unknown): Promise<number> {
    const { id } = liveCancellationSchema.parse(input);
    const question = state.questions.find((q) => q.id === id);
    if (!question) return 404;
    if (question.status === 'cancelled') return 200;
    if (question.status !== 'queued') return 409;
    try {
      await persist(async () => {
        await store.save({
          ...state,
          questions: state.questions.map((q) =>
            q === question ? { ...q, status: 'cancelled' } : q,
          ),
        });
        question.status = 'cancelled';
      });
    } catch {
      throw error(
        'The cancellation could not be saved. The question is still waiting. Check conversation storage and retry.',
      );
    }
    announce();
    return 200;
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (closing) {
      json(res, 503, { error: 'The live service is stopping.' });
      return;
    }
    if (
      req.headers.host !== new URL(url).host ||
      (req.headers.origin !== undefined && req.headers.origin !== url.slice(0, -1))
    ) {
      json(res, 403, { error: 'This request is not from the live document.' });
      return;
    }
    const pathname = new URL(req.url ?? '/', url).pathname;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': `default-src 'none'; script-src '${shellScriptHash}'; style-src 'unsafe-inline'; connect-src 'self'; frame-src 'self'; img-src data:; font-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
      });
      res.end(shell);
      return;
    }
    if (req.method === 'GET' && pathname === '/snapshot') {
      json(res, 200, snapshot());
      return;
    }
    if (req.method === 'GET' && pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
      listeners.add(res);
      res.write(`data: ${JSON.stringify({ type: 'snapshot', snapshot: snapshot() })}\n\n`);
      const ping = setInterval(() => {
        if (!res.write(': heartbeat\n\n')) res.end();
      }, 15_000);
      res.on('close', () => {
        clearInterval(ping);
        listeners.delete(res);
      });
      return;
    }
    if (req.method === 'POST' && (pathname === '/questions' || pathname === '/questions/cancel')) {
      if (
        req.headers.origin !== url.slice(0, -1) ||
        !req.headers['content-type']?.startsWith('application/json')
      ) {
        json(res, 403, { error: 'Questions require a same-origin JSON request.' });
        return;
      }
      try {
        const input: unknown = JSON.parse(await body(req));
        if (pathname === '/questions/cancel') {
          const cancelled = acceptance.then(() => cancel(input));
          acceptance = cancelled.then(
            () => {},
            () => {},
          );
          const status = await cancelled;
          json(
            res,
            status,
            status === 200
              ? { status: 'cancelled' }
              : {
                  error:
                    status === 404
                      ? 'Question not found.'
                      : 'Only waiting questions can be cancelled.',
                },
          );
          return;
        }
        const accepted = acceptance.then(() => accept(input));
        acceptance = accepted.catch(() => {});
        await accepted;
        json(res, 202, { status: 'accepted' });
      } catch (cause) {
        json(res, 400, {
          error:
            cause instanceof AgenticReportError
              ? cause.diagnostic.message
              : 'Invalid or oversized question.',
        });
      }
      return;
    }
    if (req.method === 'GET' && pathname.startsWith('/editions/')) {
      const segments = pathname.split('/');
      const selected = editions.get(segments[2] ?? '');
      let file: string;
      try {
        file = decodeURIComponent(segments.slice(3).join('/'));
      } catch {
        json(res, 400, { error: 'Invalid resource path.' });
        return;
      }
      if (
        !selected?.files.has(file) ||
        !inside(selected.directory, path.resolve(selected.directory, file))
      ) {
        json(res, 404, { error: 'Document resource not found.' });
        return;
      }
      const target = path.join(selected.directory, file);
      if (!inside(selected.directory, await realpath(target))) {
        json(res, 404, { error: 'Document resource not found.' });
        return;
      }
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
      res.writeHead(200, { 'Content-Type': lookup(file) || 'application/octet-stream' });
      res.end(await readFile(target));
      return;
    }
    json(res, 404, { error: 'Live route not found.' });
  }

  let closeTask: Promise<void> | undefined;
  function close(): Promise<void> {
    closeTask ??= (async () => {
      closing = true;
      clearTimeout(debounce);
      for (const watcher of watchers.values()) watcher.close();
      for (const response of listeners) response.end();
      listeners.clear();
      await acceptance;
      await codex?.close();
      await processing;
      await rebuildTask;
      server.closeAllConnections();
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
      await lock.close();
      await rm(lockPath, { force: true });
    })();
    return closeTask;
  }

  try {
    [shell, bridge] = await Promise.all([
      browserCode('browser').then((script) => {
        shellScriptHash = `sha256-${createHash('sha256').update(script).digest('base64')}`;
        return renderLiveShell(script);
      }),
      browserCode('bridge'),
    ]);
    await observe(source.sourceFiles);
    await rebuild();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port ?? 0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw error('The live listener has no address.');
    url = `http://127.0.0.1:${address.port}/`;
    if (mode !== 'none') {
      const requestedThread = options.threadId ?? state.threadId;
      const onError = (message: string, terminal: boolean): void => {
        if (closing) return;
        if (attachment && !terminal) {
          historyError = message.slice(0, 2000);
          announce();
          return;
        }
        if (terminal) agent = 'failed';
        setError(message);
      };
      codex = attachment
        ? new LiveCodexSession({
            ...attachment,
            onError,
            questionForMessage: (clientId, text) => {
              const eligible = state.questions.filter(
                (q) => q.status !== 'queued' && q.status !== 'cancelled',
              );
              if (typeof clientId === 'string')
                return eligible.find(
                  (q) => clientId === `agentic-report:${q.id}` && questionPrompt(q) === text,
                )?.id;
              // Old reader turns have no client identity. Never hide an ambiguous or unrelated prompt.
              const matches = eligible.filter((q) => questionPrompt(q) === text);
              return matches.length === 1 ? matches[0]?.id : undefined;
            },
            onConversation: (next, changed) => {
              if (closing) return;
              if (!changed) historyError = undefined;
              const normalize = (
                item: (typeof next.messages)[number],
              ): (typeof next.messages)[number] => {
                const q = item.questionId
                  ? state.questions.find((q) => q.id === item.questionId)
                  : undefined;
                return q ? { ...item, text: q.text } : item;
              };
              const unchangedOrder =
                conversation?.limited === next.limited &&
                conversation.messages.length === next.messages.length &&
                conversation.messages.every(
                  (item, index) =>
                    item.id === next.messages[index]?.id &&
                    item.turnId === next.messages[index]?.turnId,
                );
              conversation = { ...next, messages: next.messages.map(normalize) };
              if (changed && unchangedOrder)
                publish({ type: 'session-message', message: normalize(changed) });
              else announce();
            },
            onAvailability: (available) => {
              if (closing || processing || agent === 'starting' || agent === 'failed') return;
              agent = available ? 'ready' : 'working';
              announce();
              if (available) drain();
            },
          })
        : new LiveCodex({
            command: options.codexCommand ?? 'codex',
            cwd: root,
            ...(requestedThread ? { threadId: requestedThread } : {}),
            onError,
          });
      void codex
        .start()
        .then(async (threadId) => {
          state.threadId = threadId;
          await persist(() => store.save(state));
          if (!closing) {
            agent = codex?.busy ? 'working' : 'ready';
            announce();
            drain();
          }
        })
        .catch(async () => {
          agent = 'failed';
          setError(
            mode === 'codex'
              ? 'Could not attach to the author conversation. Keep it open and check --thread/--codex-socket; no separate agent was started.'
              : 'Codex could not connect. Install/sign in to Codex and restart the live service.',
          );
          await codex?.close();
        });
    }
    return { url, statePath: store.file, snapshot, close };
  } catch (cause) {
    await close();
    throw cause;
  }
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    bytes += data.length;
    if (bytes > MAX_LIVE_REQUEST_BYTES) throw new Error('Question too large.');
    chunks.push(data);
  }
  return Buffer.concat(chunks).toString('utf8');
}
