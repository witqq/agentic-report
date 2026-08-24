import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildReport, listExamples } from '../../dist/node/index.js';
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
  const layoutExamples = [
    'layout-document',
    'layout-dashboard',
    'layout-landing',
    'layout-mixed',
    'interactive-catalog',
    'visualization-catalog',
    'incident-review',
    'vendor-decision',
    'launch-readiness',
  ] as const;
  const starters = listExamples().filter((example) => example.starter !== undefined);
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
    ].join('\n\n'),
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
  const siteOutput = path.resolve('test-results/e2e-site');
  await rm(siteOutput, { recursive: true, force: true });
  await stageSite({
    output: siteOutput,
    revision: 'fd9b4b3721c5c33ca94e5df239e3480cf3b39b8e',
  });
}
