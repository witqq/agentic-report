import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildReport, listExamples } from '../../dist/node/index.js';

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
  const layoutExamples = [
    'layout-document',
    'layout-dashboard',
    'layout-landing',
    'layout-mixed',
    'interactive-catalog',
    'visualization-catalog',
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
    buildReport({
      input: path.resolve('examples', 'visualization-catalog'),
      output: path.join(fixtureRoot, 'visualization-catalog-directory'),
      format: 'directory',
    }),
  ]);
}
