import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

interface Workflow {
  readonly on?: Readonly<Record<string, unknown>>;
  readonly jobs?: Readonly<
    Record<string, { readonly steps?: readonly { readonly run?: string }[] }>
  >;
}

const root = path.resolve('.');
const file = (relative: string) => readFile(path.join(root, relative), 'utf8');
const workflow = async (name: string): Promise<Workflow> =>
  YAML.parse(await file(`.github/workflows/${name}.yml`)) as Workflow;

function runSteps(config: Workflow): string[] {
  return Object.values(config.jobs ?? {}).flatMap((job) =>
    (job.steps ?? []).flatMap((step) => (step.run === undefined ? [] : [step.run])),
  );
}

function packageBrowserCalls(source: string): string[] {
  const patterns = [
    /from ['"]@playwright\/test['"]/u,
    /\bchromium\.launch\s*\(/u,
    /\binspectCandidateArtifacts\s*\(/u,
    /['"]snapshot['"]\s*,\s*journeyPage/u,
  ];
  return patterns.filter((pattern) => pattern.test(source)).map((pattern) => pattern.source);
}

describe('browser test execution boundary', () => {
  it('runs all tests by default while CI and release keep a browser-free command', async () => {
    const metadata = JSON.parse(await file('package.json')) as {
      readonly scripts: Readonly<Record<string, string>>;
    };
    expect(metadata.scripts.test).toBe('testfold unit e2e');
    expect(metadata.scripts.pretest).toBe('pnpm pack:check');
    expect(metadata.scripts.verify).toContain('pnpm test');
    expect(metadata.scripts.verify).not.toContain('pnpm test:unit');
    expect(metadata.scripts['test:ci']).toBe('testfold unit');
    expect(metadata.scripts['verify:ci']).toContain('pnpm test:ci');
    expect(metadata.scripts['verify:ci']).toContain('pnpm pack:check');
    expect(metadata.scripts['verify:ci']).not.toMatch(/test:e2e|testfold e2e/u);
    expect(metadata.scripts['test:unit']).toBe('testfold unit');
    expect(packageBrowserCalls(await file('scripts/check-package.ts'))).toEqual([]);

    for (const name of ['ci', 'release']) {
      const commands = runSteps(await workflow(name)).join('\n');
      expect(commands, name).toContain('pnpm verify:ci');
      expect(commands, name).not.toMatch(/playwright install|pnpm test:e2e|pnpm verify\s*$/mu);
    }
  });

  it('runs installed-artifact browser checks in the nightly suite with one candidate preparation', async () => {
    const nightly = await workflow('e2e');
    expect(Object.keys(nightly.on ?? {})).toEqual(['schedule']);
    const commands = runSteps(nightly).join('\n');
    expect(commands).toContain('pnpm exec playwright install --with-deps chromium');
    expect(commands).toContain('pnpm test:e2e');
    expect(commands).not.toContain('pnpm pack:check');
    const metadata = JSON.parse(await file('package.json')) as {
      readonly scripts: Readonly<Record<string, string>>;
    };
    expect(metadata.scripts['pretest:e2e']).toBe('pnpm pack:check');
    expect(await file('tests/e2e/installed-package.spec.ts')).toContain('browserInputs');
  });

  it('detects the previous package-browser regression', () => {
    const planted = [
      "import { chromium } from '@playwright/test';",
      'await chromium.launch();',
      'await inspectCandidateArtifacts(inputs);',
      "const command = ['snapshot', journeyPage];",
    ].join('\n');
    expect(packageBrowserCalls(planted)).toHaveLength(4);
  });
});
