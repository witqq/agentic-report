import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildReport, listExamples, serializeReviewArtifact } from '../../dist/node/index.js';
import { stageSite } from '../../scripts/build-site.js';

export default async function globalSetup(): Promise<void> {
  const fixtureRoot = path.resolve('test-results/e2e-generated');
  await rm(fixtureRoot, { recursive: true, force: true });
  const source = path.join(fixtureRoot, 'architecture-source');
  const singleOutput = path.resolve('test-results/e2e-artifact/report.html');
  const directoryOutput = path.join(fixtureRoot, 'directory-artifact');
  await mkdir(source, { recursive: true });
  await writeFile(
    path.join(source, 'runtime-placement.svg'),
    [
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32" viewBox="0 0 64 32">',
      '<rect width="64" height="32" rx="4" fill="#2563eb"/>',
      '<circle cx="20" cy="16" r="6" fill="#fff"/>',
      '<path d="M30 16h18" stroke="#fff" stroke-width="4"/>',
      '</svg>',
    ].join(''),
  );
  await writeFile(
    path.join(source, 'report.md'),
    [
      '---',
      'title: Portable architecture report',
      'description: Browser behavior fixture',
      'language: en',
      '---',
      '# Architecture report',
      '## Decision branches',
      'The generated report remains readable without a server.',
      '![Runtime placement](runtime-placement.svg)',
      '### Static path',
      'Choose a self-contained output when portability is the priority.',
      'Inspect :source-link{label="src/render/directives.ts:42" href="http://127.0.0.1:7789/open?path=%2Fworkspace%2Fagentic-report%2Fsrc%2Frender%2Fdirectives.ts&line=42"}.',
      '```ts',
      "const output = 'single-file';",
      '```',
      '## Runtime evidence',
      'The package-owned runtime preserves the same interaction contract in both output formats.',
      ':::demo{title="Safe counter" start="1" step="2"}',
      'A declarative interaction powered by the package runtime.',
      ':::',
    ].join('\n'),
  );
  const representativeSources = [
    {
      name: 'tutorial',
      title: 'Code tutorial',
      markdown: [
        '# Code tutorial',
        '## Build an artifact',
        '```ts',
        "const report = await buildReport({ input: 'report.md' });",
        '```',
        ':::demo{title="Try the counter"}',
        'The demo uses a typed built-in behavior.',
        ':::',
      ],
    },
    {
      name: 'work-report',
      title: 'Weekly work report',
      markdown: [
        '# Weekly work report',
        ':::callout{title="Outcome" kind="success"}',
        'The portable artifact was delivered.',
        ':::',
        '## Completed',
        '- Research',
        '- Verification',
      ],
    },
    {
      name: 'landing',
      title: 'Portable reports for agents',
      markdown: [
        '# Portable reports for agents',
        'Compile content, not layout.',
        '::::cards',
        ':::card{title="One file"}',
        'Share one offline HTML artifact.',
        ':::',
        ':::card{title="Agent ready"}',
        'Use schemas and structured diagnostics.',
        ':::',
        '::::',
      ],
    },
  ] as const;
  const presetFixtures = ['studio', 'editorial', 'signal'] as const;
  const navigationSource = path.join(fixtureRoot, 'navigation-source');
  const reviewSource = path.join(fixtureRoot, 'review-source');
  const responseIsolationSource = path.join(fixtureRoot, 'response-isolation-source');
  const glossaryCodeSource = path.join(fixtureRoot, 'glossary-code-source');
  const diagramTourSource = path.join(fixtureRoot, 'diagram-tour-source');
  const russianChromeSource = path.join(fixtureRoot, 'russian-chrome-source');
  const russianPriorSource = path.join(fixtureRoot, 'russian-prior-source');
  const fallbackChromeSource = path.join(fixtureRoot, 'fallback-chrome-source');
  const layoutExamples = [
    'layout-document',
    'layout-dashboard',
    'layout-landing',
    'layout-mixed',
    'interactive-catalog',
    'response-workspace',
    'visualization-catalog',
    'incident-review',
    'vendor-decision',
    'launch-readiness',
  ] as const;
  const starters = listExamples().filter((example) => example.starter !== undefined);
  await mkdir(responseIsolationSource, { recursive: true });
  await writeFile(
    path.join(responseIsolationSource, 'report.md'),
    [
      '# Response isolation',
      ...['first-form', 'second-form'].flatMap((formId) => [
        `:::::response{title="${formId}" id="${formId}"}`,
        '::::question{id="shared-global" kind="single" title="Shared global choice"}',
        '::option{id="yes" label="Yes"}',
        '::option{id="no" label="No"}',
        '::::',
        '::::question{id="shared-item" kind="item-single" title="Shared item choice"}',
        '::option{id="yes" label="Yes"}',
        '::option{id="no" label="No"}',
        `::item{id="shared" label="Shared item" note="Isolation evidence for ${formId}." meta="${formId}" href="https://example.com/${formId}"}`,
        '::::',
        '::::question{id="shared-bucket" kind="bucket" title="Shared bucket assignment"}',
        '::bucket{id="do" label="Do"}',
        '::bucket{id="skip" label="Skip"}',
        `::item{id="shared" label="Shared bucket item" note="Bucket isolation evidence for ${formId}." meta="${formId}" href="https://example.com/${formId}/bucket" bucket="do"}`,
        '::::',
        '::::question{id="large-score" kind="number" title="Large decimal score" min="0" max="999999999" step="0.0001"}',
        `::item{id="shared" label="Shared numeric item" note="Decimal phase evidence for ${formId}." meta="${formId}" href="https://example.com/${formId}/number"}`,
        '::::',
        ':::::',
      ]),
    ].join('\n'),
  );
  await mkdir(russianChromeSource, { recursive: true });
  await writeFile(
    path.join(russianChromeSource, 'report.md'),
    [
      '---',
      'title: Русский интерфейс отчёта',
      'language: ru-RU',
      '---',
      '# Русский интерфейс отчёта',
      'Пакет локализует собственные элементы, но сохраняет авторский текст.',
      '## Навигация',
      '```ts',
      "const locale = 'ru';",
      '```',
      ':::filter{title="Возможности"}',
      '',
      '- Копирование кода',
      '- Поиск по списку',
      ':::',
      'Термин :term[Локус]{key="locus"} открывает пояснение.',
      ':::modal{title="Проверка модального окна"}',
      'Содержимое модального окна.',
      ':::',
      ':::popover{title="Контекстная справка"}',
      'Содержимое контекстной справки.',
      ':::',
      ':::demo{title="Счётчик" start="1" step="1"}',
      'Безопасное встроенное действие.',
      ':::',
      ':::copyable',
      'Сначала проверьте **владельца**.',
      '',
      'Откройте [план отката](https://example.com/rollback) и сверьтесь с :term[локусом]{key="locus"} перед отправкой.',
      ':::',
      '::::chart{type="bar" title="Наблюдения" description="Два наблюдения."}',
      ':::series{label="Результат"}',
      '::point{label="А" value="1234.5"}',
      '::point{label="Б" value="2"}',
      ':::',
      '::::',
      ':::diagram{title="Поток" description="Два связанных узла." type="flow"}',
      '::node{id="first" label="Первый"}',
      '::node{id="second" label="Второй"}',
      '::edge{from="first" to="second" label="переход"}',
      ':::',
      '',
      '---',
      '',
      '## Обсуждение',
      'Этот блок доступен для ревью.',
      ':::glossary{key="locus" term="Локус" placement="appendix"}',
      'Каноническое определение для проверки полного перехода.',
      ':::',
    ].join('\n'),
  );
  await mkdir(fallbackChromeSource, { recursive: true });
  await writeFile(
    path.join(fallbackChromeSource, 'report.md'),
    [
      '---',
      'title: Deterministic fallback',
      'language: und',
      '---',
      '# Deterministic fallback',
      '## First section',
      '```ts',
      'const fallback = true;',
      '```',
      '## Second section',
      'Authored content remains unchanged.',
    ].join('\n'),
  );
  for (const fixture of representativeSources) {
    const fixtureSource = path.join(fixtureRoot, `${fixture.name}-source`);
    await mkdir(fixtureSource, { recursive: true });
    await writeFile(
      path.join(fixtureSource, 'report.md'),
      ['---', `title: ${fixture.title}`, 'language: en', '---', ...fixture.markdown].join('\n'),
    );
  }
  for (const preset of presetFixtures) {
    const fixtureSource = path.join(fixtureRoot, `preset-${preset}-source`);
    await mkdir(fixtureSource, { recursive: true });
    await writeFile(
      path.join(fixtureSource, 'report.md'),
      [
        '---',
        `title: ${preset} preset fixture`,
        'language: en',
        'layout: mixed',
        'theme: system',
        `preset: ${preset}`,
        '---',
        `# ${preset} preset fixture`,
        'Identical content isolates the selected visual family from layout and source identity.',
        '::::section{title="Shared evidence track" id="evidence" width="standard" align="start" tone="soft"}',
        '::::cards',
        ':::card{title="Shared card"}',
        'The same component exposes preset typography, rhythm, measure, and geometry.',
        ':::',
        '::::',
        '::::',
      ].join('\n'),
    );
  }
  await mkdir(navigationSource, { recursive: true });
  await writeFile(
    path.join(navigationSource, 'report.md'),
    [
      '---',
      'title: Navigation runtime fixture',
      'language: en',
      'layout: document',
      'theme: light',
      'preset: studio',
      'scrollProgress: true',
      '---',
      '# Navigation runtime fixture',
      'Content before the first eligible section provides an outside hash target.',
      ':::section{title="Alpha section" id="alpha" nav="Alpha" reveal="true"}',
      '### Alpha detail',
      'The first section owns this descendant heading.',
      ...Array.from(
        { length: 14 },
        (_, index) =>
          `Alpha evidence paragraph ${index + 1} keeps the section tall enough to exercise bidirectional geometry.`,
      ),
      ':::',
      '::::section{title="Beta section" id="beta" nav="Beta" tone="soft" reveal="true"}',
      '### Beta detail',
      'The second section owns this descendant heading.',
      ':::modal{title="Beta component target"}',
      'A component inside Beta provides descendant ownership.',
      ':::',
      ...Array.from(
        { length: 14 },
        (_, index) =>
          `Beta evidence paragraph ${index + 1} keeps the section tall enough to cross the activation line.`,
      ),
      '::::',
      ':::section{title="Gamma section" id="gamma" nav="Gamma" tone="contrast"}',
      'The final section is deliberately shorter than the viewport.',
      ':::',
      '## Appendix outside navigation',
      'This valid target follows every eligible section.',
    ].join('\n\n'),
  );
  await mkdir(reviewSource, { recursive: true });
  await writeFile(
    path.join(reviewSource, 'report.md'),
    [
      '---',
      'title: Review Workspace fixture',
      'language: en',
      'layout: document',
      'theme: light',
      'preset: studio',
      '---',
      '# Review Workspace fixture',
      ':::section{title="Alpha evidence" id="alpha" nav="Alpha"}',
      'Shared evidence statement.',
      ':::',
      ':::section{title="Beta evidence" id="beta" nav="Beta" tone="soft"}',
      'Shared evidence statement.',
      ':::',
      ':::section{title="Decision summary" id="summary" nav="Summary"}',
      'The reviewer exports a local structured handoff.',
      ':::',
      ':::decision{title="Release path" id="release-path" required=true}',
      '::decision-option{id="ship" label="Ship now"}',
      '::decision-option{id="hold" label="Hold release"}',
      ':::',
      ':::checklist{title="Release gates" id="release-gates"}',
      '::check-item{id="owner" label="Owner assigned" required=true}',
      '::check-item{id="notes" label="Notes attached"}',
      ':::',
      ':::decision{title="Alternate path" id="alternate-path"}',
      '::decision-option{id="ship-alt" label="Ship now"}',
      '::decision-option{id="hold-alt" label="Hold release"}',
      ':::',
    ].join('\n\n'),
  );
  await mkdir(glossaryCodeSource, { recursive: true });
  await writeFile(
    path.join(glossaryCodeSource, 'report.md'),
    [
      '---',
      'title: Code glossary fixture',
      'language: en',
      'layout: document',
      'theme: light',
      'preset: editorial',
      '---',
      '# Code glossary fixture',
      '## Prose forms',
      'Traversal continues through :term[concepts]{key="concept"}.',
      '## Highlighted code',
      '```typescript terms="own-field,node-type"',
      '@d.def(Node) accessor child!: Node;',
      '@d.def(Node) accessor sibling!: Node;',
      '```',
      '```typescript',
      '@d.def(Node) accessor child!: Node;',
      '@d.def(Node) accessor sibling!: Node;',
      '```',
      ':::glossary{key="concept" term="concept"}',
      'Canonical prose definition.',
      ':::',
      ':::glossary{key="own-field" term="@d.def" placement="appendix"}',
      'Field ownership decorator.',
      ':::',
      ':::glossary{key="node-type" term="Node" placement="appendix"}',
      'Canonical node type.',
      ':::',
    ].join('\n'),
  );
  await mkdir(diagramTourSource, { recursive: true });
  const diagramGroups = ['source', 'compiler', 'reader'] as const;
  const diagramNodes = Array.from({ length: 18 }, (_, index) => {
    const group = diagramGroups[Math.floor(index / 6)] ?? diagramGroups[0];
    return `::node{id="step-${index + 1}" label="Step ${index + 1} detail" group="${group}" kind="${index % 3 === 0 ? 'accent' : 'neutral'}"}`;
  });
  const diagramEdges = Array.from(
    { length: 17 },
    (_, index) =>
      `::edge{from="step-${index + 1}" to="step-${index + 2}" label="handoff ${index + 1}"}`,
  );
  await writeFile(
    path.join(diagramTourSource, 'report.md'),
    [
      '---',
      'title: Code tour diagrams',
      'language: en',
      'layout: document',
      'theme: light',
      'preset: editorial',
      'tokens:',
      '  width: wide',
      '---',
      '# Code tour diagrams',
      '## Grouped flow',
      ':::diagram{title="Code tour grouped flow" description="Eighteen participants across three subsystems." type="flow"}',
      '::group{id="source" label="Authentication and authorization services"}',
      '::group{id="compiler" label="Compiler pipeline"}',
      '::group{id="reader" label="Reader artifact"}',
      ...diagramNodes,
      ...diagramEdges,
      '::edge{from="step-1" to="step-4" label="validated shortcut"}',
      '::edge{from="step-5" to="step-17" label="evidence bypass"}',
      '::edge{from="step-2" to="step-9" label="second subsystem handoff"}',
      '::edge{from="step-18" to="step-3" label="reverse feedback"}',
      ':::',
      '## Sequence',
      ':::diagram{title="Compile request sequence" description="A request crosses four participants." type="sequence"}',
      '::node{id="agent" label="Authoring agent"}',
      '::node{id="loader" label="Source loader"}',
      '::node{id="compiler" label="Compiler"}',
      '::node{id="browser" label="Browser"}',
      '::edge{from="agent" to="loader" label="load source"}',
      '::edge{from="loader" to="compiler" label="validated graph"}',
      '::edge{from="compiler" to="browser" label="write artifact"}',
      '::edge{from="browser" to="agent" label="review result"}',
      ':::',
    ].join('\n'),
  );
  await Promise.all([
    buildReport({ input: source, output: singleOutput }),
    buildReport({
      input: source,
      output: directoryOutput,
      format: 'directory',
    }),
    ...representativeSources.map((fixture) =>
      buildReport({
        input: path.join(fixtureRoot, `${fixture.name}-source`),
        output: path.join(fixtureRoot, `${fixture.name}.html`),
      }),
    ),
    ...layoutExamples.map((example) =>
      buildReport({
        input: path.resolve('examples', example),
        output: path.join(fixtureRoot, `${example}.html`),
      }),
    ),
    ...starters.map((starter) =>
      buildReport({
        input: path.resolve('examples', starter.path),
        output: path.join(fixtureRoot, `starter-${starter.id}.html`),
      }),
    ),
    ...presetFixtures.flatMap((preset) => [
      buildReport({
        input: path.join(fixtureRoot, `preset-${preset}-source`),
        output: path.join(fixtureRoot, `preset-${preset}.html`),
      }),
      buildReport({
        input: path.join(fixtureRoot, `preset-${preset}-source`),
        output: path.join(fixtureRoot, `preset-${preset}-directory`),
        format: 'directory',
      }),
    ]),
    buildReport({
      input: navigationSource,
      output: path.join(fixtureRoot, 'navigation.html'),
    }),
    buildReport({
      input: reviewSource,
      output: path.join(fixtureRoot, 'review.html'),
    }),
    buildReport({
      input: reviewSource,
      output: path.join(fixtureRoot, 'review-directory'),
      format: 'directory',
    }),
    buildReport({
      input: path.resolve('examples/response-workspace'),
      output: path.join(fixtureRoot, 'response-workspace-directory'),
      format: 'directory',
    }),
    buildReport({
      input: path.resolve('examples/interactive-catalog'),
      output: path.join(fixtureRoot, 'copyable-prose-directory'),
      format: 'directory',
    }),
    buildReport({
      input: responseIsolationSource,
      output: path.join(fixtureRoot, 'response-isolation.html'),
    }),
    buildReport({
      input: responseIsolationSource,
      output: path.join(fixtureRoot, 'response-isolation-directory'),
      format: 'directory',
    }),
    buildReport({
      input: glossaryCodeSource,
      output: path.join(fixtureRoot, 'glossary-code.html'),
    }),
    buildReport({
      input: glossaryCodeSource,
      output: path.join(fixtureRoot, 'glossary-code-directory'),
      format: 'directory',
    }),
    buildReport({
      input: diagramTourSource,
      output: path.join(fixtureRoot, 'diagram-tour.html'),
    }),
    buildReport({
      input: diagramTourSource,
      output: path.join(fixtureRoot, 'diagram-tour-directory'),
      format: 'directory',
    }),
    buildReport({
      input: russianChromeSource,
      output: path.join(fixtureRoot, 'russian-chrome.html'),
    }),
    buildReport({
      input: russianChromeSource,
      output: path.join(fixtureRoot, 'russian-chrome-directory'),
      format: 'directory',
    }),
    buildReport({
      input: fallbackChromeSource,
      output: path.join(fixtureRoot, 'fallback-chrome.html'),
    }),
    buildReport({
      input: fallbackChromeSource,
      output: path.join(fixtureRoot, 'fallback-chrome-directory'),
      format: 'directory',
    }),
    buildReport({
      input: navigationSource,
      output: path.join(fixtureRoot, 'navigation-directory'),
      format: 'directory',
    }),
    buildReport({
      input: path.resolve('examples', 'landing'),
      output: path.join(fixtureRoot, 'starter-landing-directory'),
      format: 'directory',
    }),
    buildReport({
      input: path.resolve('website', 'landing'),
      output: path.join(fixtureRoot, 'public-landing.html'),
    }),
    buildReport({
      input: path.resolve('website', 'landing'),
      output: path.join(fixtureRoot, 'public-landing-directory'),
      format: 'directory',
    }),
    buildReport({
      input: path.resolve('examples', 'visualization-catalog'),
      output: path.join(fixtureRoot, 'visualization-catalog-directory'),
      format: 'directory',
    }),
    buildReport({
      input: path.resolve('examples', 'incident-review'),
      output: path.join(fixtureRoot, 'incident-review-directory'),
      format: 'directory',
    }),
    buildReport({
      input: path.resolve('examples', 'vendor-decision'),
      output: path.join(fixtureRoot, 'vendor-decision-directory'),
      format: 'directory',
    }),
    buildReport({
      input: path.resolve('examples', 'launch-readiness'),
      output: path.join(fixtureRoot, 'launch-readiness-directory'),
      format: 'directory',
    }),
    buildReport({
      input: path.resolve('tests', 'fixtures', 'authoring', 'corpus', 'research-report'),
      output: path.join(fixtureRoot, 'research-corpus.html'),
    }),
    buildReport({
      input: path.resolve('website', 'docs'),
      output: path.join(fixtureRoot, 'human-docs-directory'),
      format: 'directory',
    }),
    buildReport({
      input: path.resolve('website', 'docs', 'agent'),
      output: path.join(fixtureRoot, 'agent-docs-directory'),
      format: 'directory',
    }),
  ]);
  await mkdir(russianPriorSource, { recursive: true });
  const russianPriorEntry = path.join(russianPriorSource, 'report.md');
  await writeFile(
    russianPriorEntry,
    await readFile(path.join(russianChromeSource, 'report.md'), 'utf8'),
  );
  const russianPriorBase = path.join(fixtureRoot, 'russian-prior-base.html');
  await buildReport({ input: russianPriorSource, output: russianPriorBase });
  const russianPriorEncoded = /<template data-review-manifest="true">([\s\S]*?)<\/template>/u.exec(
    await readFile(russianPriorBase, 'utf8'),
  )?.[1];
  if (russianPriorEncoded === undefined) throw new Error('Missing Russian prior manifest');
  const russianPriorManifest = JSON.parse(
    russianPriorEncoded
      .replaceAll('&quot;', '"')
      .replaceAll('&#x27;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&'),
  ) as {
    reportRevision: string;
    targets: Array<{
      id: string;
      kind: string;
      fingerprint: string;
      source: { file: string; line: number; column: number; endLine: number; endColumn: number };
    }>;
  };
  const russianPriorSourceText = await readFile(russianPriorEntry, 'utf8');
  const changedLine =
    russianPriorSourceText
      .split('\n')
      .indexOf('Пакет локализует собственные элементы, но сохраняет авторский текст.') + 1;
  const exactLine = russianPriorSourceText.split('\n').indexOf('## Навигация') + 1;
  const changedTarget = russianPriorManifest.targets.find(
    (target) => target.kind === 'markdown:paragraph' && target.source.line === changedLine,
  );
  const exactTarget = russianPriorManifest.targets.find(
    (target) => target.kind === 'markdown:heading' && target.source.line === exactLine,
  );
  if (changedTarget === undefined || exactTarget === undefined)
    throw new Error('Missing Russian prior targets');
  await writeFile(
    path.join(russianPriorSource, 'prior.json'),
    serializeReviewArtifact({
      contractVersion: 2,
      report: { revision: russianPriorManifest.reportRevision },
      threads: [
        {
          id: 'thread-russian-changed',
          segments: [
            {
              id: 'segment-russian-changed',
              reportRevision: russianPriorManifest.reportRevision,
              target: changedTarget,
              resolved: false,
              messages: [{ id: 'message-russian-changed', author: 'user', message: 'Изменено.' }],
            },
          ],
        },
        {
          id: 'thread-russian-exact',
          segments: [
            {
              id: 'segment-russian-exact',
              reportRevision: russianPriorManifest.reportRevision,
              target: exactTarget,
              resolved: true,
              messages: [
                { id: 'message-russian-exact', author: 'agent', message: 'Без изменений.' },
              ],
            },
          ],
        },
      ],
    }),
  );
  await writeFile(
    russianPriorEntry,
    russianPriorSourceText.replace(
      'Пакет локализует собственные элементы, но сохраняет авторский текст.',
      'Пакет локализует все собственные элементы и сохраняет авторский текст.',
    ),
  );
  await buildReport({
    input: russianPriorSource,
    output: path.join(fixtureRoot, 'russian-prior.html'),
    review: 'prior.json',
  });
  await buildReport({
    input: russianPriorSource,
    output: path.join(fixtureRoot, 'russian-prior-directory'),
    format: 'directory',
    review: 'prior.json',
  });
  const reviewHtml = await readFile(path.join(fixtureRoot, 'review.html'), 'utf8');
  const encodedManifest = /<template data-review-manifest="true">([\s\S]*?)<\/template>/u.exec(
    reviewHtml,
  )?.[1];
  if (encodedManifest === undefined) throw new Error('Missing review fixture manifest');
  const reviewManifest = JSON.parse(
    encodedManifest
      .replaceAll('&quot;', '"')
      .replaceAll('&#x27;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&'),
  ) as {
    reportRevision: string;
    targets: Array<{
      id: string;
      kind: string;
      fingerprint: string;
      source: { file: string; line: number; column: number; endLine: number; endColumn: number };
    }>;
  };
  const firstEvidenceLine =
    (await readFile(path.join(reviewSource, 'report.md'), 'utf8'))
      .split('\n')
      .indexOf('Shared evidence statement.') + 1;
  const changedParagraphTarget = reviewManifest.targets.find(
    (target) =>
      target.kind === 'markdown:paragraph' &&
      target.source.file === 'report.md' &&
      target.source.line === firstEvidenceLine,
  );
  if (changedParagraphTarget === undefined) throw new Error('Missing repeat-review target');
  await writeFile(
    path.join(reviewSource, 'prior.json'),
    serializeReviewArtifact({
      contractVersion: 2,
      report: { revision: reviewManifest.reportRevision },
      threads: [
        {
          id: 'thread-prior',
          segments: [
            {
              id: 'segment-prior',
              reportRevision: reviewManifest.reportRevision,
              target: changedParagraphTarget,
              resolved: false,
              messages: [
                { id: 'message-user', author: 'user', message: 'Revisit changed evidence.' },
                { id: 'message-agent', author: 'agent', message: 'Added supporting context.' },
              ],
            },
          ],
        },
      ],
    }),
  );
  await buildReport({
    input: reviewSource,
    output: path.join(fixtureRoot, 'review-prior.html'),
    review: 'prior.json',
  });
  await buildReport({
    input: reviewSource,
    output: path.join(fixtureRoot, 'review-prior-directory'),
    format: 'directory',
    review: 'prior.json',
  });
  const reviewEntry = path.join(reviewSource, 'report.md');
  await writeFile(
    reviewEntry,
    (await readFile(reviewEntry, 'utf8')).replace(
      'Shared evidence statement.',
      'Changed evidence statement.',
    ),
  );
  const staleBase = path.join(fixtureRoot, 'review-stale-base.html');
  await buildReport({ input: reviewSource, output: staleBase });
  const staleHtml = await readFile(staleBase, 'utf8');
  const staleEncoded = /<template data-review-manifest="true">([\s\S]*?)<\/template>/u.exec(
    staleHtml,
  )?.[1];
  if (staleEncoded === undefined) throw new Error('Missing stale review fixture manifest');
  const staleManifest = JSON.parse(
    staleEncoded
      .replaceAll('&quot;', '"')
      .replaceAll('&#x27;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&'),
  ) as typeof reviewManifest;
  const currentChangedTarget = staleManifest.targets.find(
    (target) =>
      target.kind === 'markdown:paragraph' &&
      target.source.file === 'report.md' &&
      target.source.line === firstEvidenceLine,
  );
  if (currentChangedTarget === undefined) throw new Error('Missing current changed target');
  const adversarialPrior = JSON.parse(
    await readFile(path.join(reviewSource, 'prior.json'), 'utf8'),
  );
  adversarialPrior.threads[0].segments[0].id = `segment-${currentChangedTarget.id}-1`;
  await writeFile(path.join(reviewSource, 'prior.json'), serializeReviewArtifact(adversarialPrior));
  await buildReport({
    input: reviewSource,
    output: path.join(fixtureRoot, 'review-stale.html'),
    review: 'prior.json',
  });
  await buildReport({
    input: reviewSource,
    output: path.join(fixtureRoot, 'review-stale-directory'),
    format: 'directory',
    review: 'prior.json',
  });
  const siteOutput = path.resolve('test-results/e2e-site');
  await rm(siteOutput, { recursive: true, force: true });
  await stageSite({
    output: siteOutput,
    revision: 'fd9b4b3721c5c33ca94e5df239e3480cf3b39b8e',
  });
}
