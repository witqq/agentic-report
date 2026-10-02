import { chmod, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { serveReport, type LiveReportServer, type LiveSnapshot } from '../../dist/node/live.js';
import { parseReviewTargetManifest } from '../../src/review/contract.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];
const servers: LiveReportServer[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  for (const workspace of workspaces.splice(0)) await removeTestWorkspace(workspace);
});

async function fixture(): Promise<string> {
  const root = await createTestWorkspace('live');
  workspaces.push(root);
  await writeFile(path.join(root, 'report.md'), '# A living document\n\nOriginal evidence.\n');
  return root;
}
async function start(
  root: string,
  agent: 'none' | 'standalone' = 'none',
  command?: string,
): Promise<LiveReportServer> {
  const service = await serveReport({
    input: root,
    agent,
    ...(command ? { codexCommand: command } : {}),
  });
  servers.push(service);
  return service;
}
async function waitFor(
  service: LiveReportServer,
  predicate: (value: LiveSnapshot) => boolean,
): Promise<LiveSnapshot> {
  await expect.poll(() => predicate(service.snapshot())).toBe(true);
  return service.snapshot();
}
async function submit(
  service: LiveReportServer,
  input: unknown,
  origin = service.url.slice(0, -1),
): Promise<Response> {
  return fetch(new URL('questions', service.url), {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}
async function fakeCodex(root: string): Promise<string> {
  const command = path.join(root, 'fake-codex.mjs');
  // A real JSONL peer: a file gate holds turns without guessing how long the machine takes.
  await writeFile(
    command,
    `#!/usr/bin/env node
import readline from 'node:readline';
import { existsSync, watch } from 'node:fs';
import { appendFile, writeFile } from 'node:fs/promises';
const emit = (frame) => process.stdout.write(JSON.stringify(frame)+'\\n');
let serial=0;
const pending=new Map();
readline.createInterface({input:process.stdin}).on('line', async line => {
 const frame=JSON.parse(line);
 if(!frame.method&&pending.has(frame.id)) {
  if(frame.result?.decision==='decline'||frame.error?.code===-32601)pending.get(frame.id)();
  pending.delete(frame.id);return;
 }
 if(frame.method==='initialize') emit({id:frame.id,result:{}});
 if(frame.method==='thread/start'||frame.method==='thread/resume') {
  await appendFile('peer-events.txt',frame.method+'\\n');
  emit({id:frame.id,result:{thread:{id:'thread-live'}}});
 }
 if(frame.method==='turn/start') {
  const turn='turn-'+(++serial), item='answer-'+serial;
  const text=frame.params.input[0].text;
  await appendFile('peer-events.txt','QUESTION '+text.split("Reader's question:\\n")[1]+'\\n');
  emit({id:frame.id,result:{turn:{id:turn}}});
  emit({method:'turn/started',params:{threadId:'thread-live',turn:{id:turn}}});
  emit({method:'item/agentMessage/delta',params:{threadId:'thread-live',turnId:turn,itemId:item,delta:'Draft answer'}});
  if(text.includes('hold')) await new Promise(resolve=>{
   if(existsSync('release')){resolve();return;}
   const watcher=watch('.',()=>{if(existsSync('release')){watcher.close();resolve();}});
  });
  if(text.includes('edit evidence')) await writeFile('report.md','# A living document\\n\\nExpanded evidence with an example.\\n');
  if(text.includes('approval')) await new Promise(resolve=>{pending.set('approval-1',resolve);emit({id:'approval-1',method:'item/fileChange/requestApproval',params:{threadId:'thread-live',turnId:turn}});});
  emit({method:'item/completed',params:{threadId:'thread-live',turnId:turn,item:{id:item,type:'agentMessage',text:'Final answer: '+text.split("Reader's question:\\n")[1]}}});
  emit({method:'turn/completed',params:{threadId:'thread-live',turn:{id:turn,status:'completed'}}});
  if(text.includes('exit after'))setImmediate(()=>process.exit(1));
 }
});
`,
  );
  await chmod(command, 0o755);
  return command;
}

describe('local living document', () => {
  it('offers live theme choices while preserving an explicit single theme and a topbar-free revision', async () => {
    const root = await fixture();
    await writeFile(path.join(root, 'report.md'), '---\nthemeSwitcher: false\n---\n# One theme\n');
    const service = await start(root);
    const original = service.snapshot().document.revision;
    const html = await (await fetch(new URL(service.snapshot().document.url, service.url))).text();
    expect(html).not.toMatch(/<template data-theme-catalog/u);
    await writeFile(path.join(root, 'report.md'), '---\ntopbar: false\n---\n# A scene\n');
    await waitFor(service, (s) => s.document.revision !== original && !s.error);
    const scene = service.snapshot().document.revision;
    expect(
      await (await fetch(new URL(service.snapshot().document.url, service.url))).text(),
    ).not.toMatch(/<template data-theme-catalog/u);
    await writeFile(path.join(root, 'report.md'), '# Reader theme choices\n');
    await waitFor(service, (s) => s.document.revision !== scene && !s.error);
    expect(
      await (await fetch(new URL(service.snapshot().document.url, service.url))).text(),
    ).toMatch(/<template data-theme-catalog/u);
  });

  it('keeps live bridge and manifest outside embedded island body markup', async () => {
    const root = await fixture();
    await mkdir(path.join(root, 'island'));
    await writeFile(
      path.join(root, 'island/extension.yaml'),
      'kind: island\nname: inner-page\ndescription: Local inner page.\nstaticEquivalent: A paragraph.\nentry: index.html\nassets: []\n',
    );
    await writeFile(
      path.join(root, 'island/index.html'),
      '<!doctype html><html><body><p>Inside the island.</p></body></html>',
    );
    await writeFile(
      path.join(root, 'report.md'),
      '---\nextensions: [island/extension.yaml]\n---\n# A living document\n\n:::island{name="inner-page" title="Inner page"}\nStatic evidence.\n:::\n',
    );
    const service = await start(root);
    const html = await (await fetch(new URL(service.snapshot().document.url, service.url))).text();
    expect(html).toContain('data-island-document=');
    expect(html.indexOf('data-live-manifests')).toBeGreaterThan(html.lastIndexOf('</figure>'));
    expect(html.indexOf('<script src="live-bridge.js"')).toBeGreaterThan(
      html.lastIndexOf('</figure>'),
    );
  });

  it('keeps the last good edition during invalid writes and observes new included sources', async () => {
    // A watcher that only sees the entry, or publishes failed builds, fails this journey.
    const root = await fixture();
    const service = await start(root);
    const original = service.snapshot().document;
    const shell = await fetch(service.url);
    expect(shell.status).toBe(200);
    expect(await shell.text()).toMatch(/<form[^>]*data-live-form/u);
    await writeFile(path.join(root, 'report.md'), '# Invalid\n\n:::unknown\nBroken\n:::\n');
    await waitFor(service, (s) => Boolean(s.error));
    expect(service.snapshot().document).toEqual(original);
    expect(await (await fetch(new URL(original.url, service.url))).text()).toContain(
      'Original evidence',
    );
    await mkdir(path.join(root, 'partials'));
    await writeFile(path.join(root, 'partials', 'detail.md'), 'Included evidence.\n');
    await writeFile(
      path.join(root, 'report.md'),
      '# A living document\n\n{{include: partials/detail.md}}\n',
    );
    await waitFor(service, (s) => s.document.revision !== original.revision && !s.error);
    const included = service.snapshot().document;
    await writeFile(path.join(root, 'partials', 'detail.md'), 'Revised included evidence.\n');
    await waitFor(service, (s) => s.document.revision !== included.revision);
    const html = await (await fetch(new URL(service.snapshot().document.url, service.url))).text();
    expect(html).toContain('Revised included evidence');
    expect(html).toContain('data-edition');
    expect(service.snapshot().agent).toBe('offline');
  });

  it('streams selected questions, edits original sources and reconnects to a current snapshot', async () => {
    const root = await fixture();
    const service = await start(root, 'standalone', await fakeCodex(root));
    await waitFor(service, (s) => s.agent === 'ready');
    const first = service.snapshot().document;
    const html = await (await fetch(new URL(first.url, service.url))).text();
    const encoded = /<template data-live-manifests>([^<]+)<\/template>/u.exec(html)?.[1];
    if (!encoded) throw new Error('Missing target manifest');
    const manifest = parseReviewTargetManifest(
      (
        JSON.parse(
          encoded
            .replaceAll('&quot;', '"')
            .replaceAll('&#x27;', "'")
            .replaceAll('&lt;', '<')
            .replaceAll('&gt;', '>')
            .replaceAll('&amp;', '&'),
        ) as Record<string, unknown>
      ).en,
    );
    const target = manifest.targets.find((t) => t.kind === 'markdown:paragraph');
    if (!target) throw new Error('Missing paragraph');
    const controller = new AbortController();
    const response = await fetch(new URL('events', service.url), { signal: controller.signal });
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Missing event stream');
    const firstEvent = await reader.read();
    expect(new TextDecoder().decode(firstEvent.value)).toContain('snapshot');
    const accepted = await submit(service, {
      id: 'selected',
      text: 'hold and edit evidence',
      subject: {
        revision: manifest.reportRevision,
        locale: 'en',
        quote: 'Original evidence.',
        start: target,
        end: target,
      },
    });
    expect(accepted.status).toBe(202);
    await waitFor(service, (s) => s.questions[0]?.answer === 'Draft answer');
    let stream = '';
    while (!stream.includes('Draft answer')) {
      const event = await reader.read();
      stream += new TextDecoder().decode(event.value);
    }
    expect(stream).toContain('"type":"delta"');
    controller.abort();
    await writeFile(path.join(root, 'release'), 'continue');
    await waitFor(
      service,
      (s) => s.questions[0]?.status === 'completed' && s.document.revision !== first.revision,
    );
    expect(await readFile(path.join(root, 'report.md'), 'utf8')).toContain(
      'Expanded evidence with an example',
    );
    expect(service.snapshot().questions[0]?.answer).toBe('Final answer: hold and edit evidence');
    expect(service.snapshot().questions[0]?.binding).toBe('changed');
    const again = await fetch(new URL('events', service.url));
    const nextReader = again.body?.getReader();
    if (!nextReader) throw new Error('Missing reconnect');
    expect(new TextDecoder().decode((await nextReader.read()).value)).toContain(
      'Final answer: hold and edit evidence',
    );
    await nextReader.cancel();
    expect(
      (
        await submit(service, {
          id: 'stale',
          text: 'another question',
          subject: {
            revision: manifest.reportRevision,
            locale: 'en',
            quote: 'Original evidence.',
            start: target,
            end: target,
          },
        })
      ).status,
    ).toBe(400);
  });

  it('persists FIFO questions, resumes the thread and never replays uncertain delivery', async () => {
    // Restart is the distinguishing evidence: an in-memory transcript cannot pass.
    const root = await fixture();
    const command = await fakeCodex(root);
    let service = await start(root, 'standalone', command);
    await waitFor(service, (s) => s.agent === 'ready');
    expect((await submit(service, { id: 'one', text: 'hold first' })).status).toBe(202);
    await waitFor(service, (s) => s.questions[0]?.answer === 'Draft answer');
    const second = { id: 'two', text: 'second question' };
    expect((await submit(service, second)).status).toBe(202);
    expect((await submit(service, second)).status).toBe(202);
    expect(service.snapshot().questions.map((q) => q.status)).toEqual(['sending', 'queued']);
    await service.close();
    // An abrupt stop can leave sending on disk even though graceful close normally records uncertain.
    const interruptedState = JSON.parse(await readFile(service.statePath, 'utf8')) as {
      questions: Array<{ status: string }>;
    };
    if (!interruptedState.questions[0]) throw new Error('Missing durable question');
    interruptedState.questions[0].status = 'sending';
    await writeFile(service.statePath, JSON.stringify(interruptedState));
    service = await start(root, 'standalone', command);
    await waitFor(service, (s) => s.questions[1]?.status === 'completed');
    expect(service.snapshot().questions[0]?.status).toBe('uncertain');
    expect(service.snapshot().questions[1]?.answer).toBe('Final answer: second question');
    const transcript = await readFile(path.join(root, 'peer-events.txt'), 'utf8');
    expect(transcript.match(/QUESTION hold first/gu)).toHaveLength(1);
    expect(transcript).toContain('thread/resume');
    await service.close();
    service = await start(root, 'standalone', command);
    await waitFor(service, (s) => s.agent === 'ready');
    expect(service.snapshot().questions).toHaveLength(2);
    expect(service.snapshot().questions[1]?.answer).toBe('Final answer: second question');
  });

  it('answers two queued questions in order after the first turn finishes', async () => {
    const root = await fixture();
    const service = await start(root, 'standalone', await fakeCodex(root));
    await waitFor(service, (s) => s.agent === 'ready');
    await submit(service, { id: 'first', text: 'hold first' });
    await waitFor(service, (s) => s.questions[0]?.answer === 'Draft answer');
    await submit(service, { id: 'second', text: 'second' });
    expect(service.snapshot().questions[1]?.status).toBe('queued');
    await writeFile(path.join(root, 'release'), 'go');
    await waitFor(service, (s) => s.questions[1]?.status === 'completed');
    expect(service.snapshot().questions.map((q) => q.answer)).toEqual([
      'Final answer: hold first',
      'Final answer: second',
    ]);
    expect(await readFile(path.join(root, 'peer-events.txt'), 'utf8')).toContain(
      'QUESTION hold first\nQUESTION second\n',
    );
  });

  it('never delivers refused admission and persists a recovered retry across restart', async () => {
    // A real rename refusal distinguishes durable admission from an in-memory queue.
    const root = await fixture();
    const command = await fakeCodex(root);
    let service = await start(root, 'standalone', command);
    await waitFor(service, (s) => s.agent === 'ready');
    await submit(service, { id: 'first', text: 'hold first' });
    await waitFor(service, (s) => s.questions[0]?.answer === 'Draft answer');
    const refused = { id: 'recovered', text: 'recovered question' };
    const backup = `${service.statePath}.backup`;
    await rename(service.statePath, backup);
    await mkdir(service.statePath);
    try {
      const rejected = await submit(service, refused);
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toEqual({
        error:
          'The question could not be saved and was not accepted. Check conversation storage and retry.',
      });
      expect((await submit(service, refused)).status).toBe(400);
    } finally {
      await rm(service.statePath, { recursive: true });
      await rename(backup, service.statePath);
    }
    expect(service.snapshot().questions.map((q) => q.id)).toEqual(['first']);
    await writeFile(path.join(root, 'release'), 'go');
    await waitFor(service, (s) => s.questions[0]?.status === 'completed' && s.agent === 'ready');
    await service.close();
    expect(await readFile(path.join(root, 'peer-events.txt'), 'utf8')).not.toContain(
      'QUESTION recovered question',
    );
    service = await start(root, 'standalone', command);
    await waitFor(service, (s) => s.agent === 'ready');
    expect(service.snapshot().questions.map((q) => q.id)).toEqual(['first']);
    expect((await submit(service, refused)).status).toBe(202);
    await waitFor(service, (s) => s.questions[1]?.status === 'completed');
    await service.close();
    service = await start(root, 'standalone', command);
    await waitFor(service, (s) => s.agent === 'ready');
    expect(service.snapshot().questions[1]?.answer).toBe('Final answer: recovered question');
    expect(
      (await readFile(path.join(root, 'peer-events.txt'), 'utf8')).match(
        /QUESTION recovered question/gu,
      ),
    ).toHaveLength(1);
  });

  it('recovers when a previously missing nested partial is created', async () => {
    const root = await fixture();
    await mkdir(path.join(root, 'future'));
    const service = await start(root);
    const revision = service.snapshot().document.revision;
    await writeFile(
      path.join(root, 'report.md'),
      '# A living document\n\n{{include: future/evidence.md}}\n',
    );
    await waitFor(service, (s) => Boolean(s.error));
    await writeFile(path.join(root, 'future/evidence.md'), 'Evidence now exists.\n');
    await waitFor(service, (s) => s.document.revision !== revision && !s.error);
    expect(
      await (await fetch(new URL(service.snapshot().document.url, service.url))).text(),
    ).toContain('Evidence now exists');
  });

  it('declines unsupported agent approvals without hanging the turn', async () => {
    const root = await fixture();
    const command = await fakeCodex(root);
    const service = await start(root, 'standalone', command);
    await waitFor(service, (s) => s.agent === 'ready');
    await submit(service, { id: 'approval', text: 'approval' });
    await waitFor(service, (s) => s.questions[0]?.status === 'completed');
    expect(service.snapshot().questions[0]?.answer).toBe('Final answer: approval');
  });

  it('marks the agent unavailable when its idle process exits', async () => {
    const root = await fixture();
    const service = await start(root, 'standalone', await fakeCodex(root));
    await waitFor(service, (s) => s.agent === 'ready');
    await submit(service, { id: 'exit', text: 'exit after this reply' });
    await waitFor(service, (s) => Boolean(s.error?.includes('Codex stopped')));
    expect(service.snapshot().agent).toBe('failed');
  });

  it('refuses foreign requests, oversized bodies, private paths, state aliases and duplicate hosts', async () => {
    const root = await fixture();
    const service = await start(root);
    expect(
      (await submit(service, { id: 'foreign', text: 'run a command' }, 'https://foreign.example'))
        .status,
    ).toBe(403);
    expect((await submit(service, { id: 'large', text: 'x'.repeat(40_000) })).status).toBe(400);
    expect((await fetch(new URL('.agentic-report/conversation.json', service.url))).status).toBe(
      404,
    );
    expect(
      (
        await fetch(
          new URL(
            service.snapshot().document.url.replace('index.html', '%2e%2e%2fconversation.json'),
            service.url,
          ),
        )
      ).status,
    ).toBe(404);
    await expect(serveReport({ input: root, agent: 'none' })).rejects.toThrow(
      'already being served',
    );
    const other = await fixture();
    const outside = await fixture();
    await symlink(outside, path.join(other, '.agentic-report'));
    await expect(serveReport({ input: other, agent: 'none' })).rejects.toThrow(
      'leaves the source root',
    );
    expect(service.snapshot().questions).toEqual([]);
  });
});
