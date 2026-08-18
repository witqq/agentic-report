import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { format, resolveConfig } from 'prettier';

import {
  getExtensionProposalSchema,
  getExtensionProposalTemplate,
} from '../dist/node/authoring/extension-gate.js';
import { authoringRegistry } from '../dist/node/authoring/registry.js';
import { projectAuthoringSchemas } from '../dist/node/authoring/schemas.js';
import { getAuthoringSchema, getSourceContract, listExamples } from '../dist/node/discovery.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prettierOptions = (await resolveConfig(path.join(projectRoot, 'package.json'))) ?? {};
const check = process.argv.includes('--check');
const outputRoot = resolveOutputRoot();

const projections = new Map<string, string>();
for (const scope of ['manifest', 'directives', 'source'] as const) {
  projections.set(
    `docs/generated/${scope}.schema.json`,
    await serialize(getAuthoringSchema(scope)),
  );
}
projections.set('docs/generated/source-contract.json', await serialize(getSourceContract()));
projections.set(
  'docs/generated/extension-proposal.schema.json',
  await serialize(getExtensionProposalSchema()),
);
projections.set(
  'docs/generated/extension-proposal.template.json',
  await serialize(getExtensionProposalTemplate()),
);
projections.set('examples/manifest.json', await serialize(await createExampleManifest()));
projections.set(
  'tests/fixtures/authoring/registry-contract.json',
  await serialize(authoringRegistry),
);
projections.set(
  'tests/fixtures/authoring/schema-projections.json',
  await serialize(projectAuthoringSchemas(authoringRegistry)),
);

const stale: string[] = [];
for (const [relativePath, content] of projections) {
  const target = path.join(outputRoot, relativePath);
  const current = await readFile(target, 'utf8').catch(() => undefined);
  if (current === content) continue;
  stale.push(relativePath);
  if (!check) {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}
if (check && stale.length > 0) {
  throw new Error(`Generated authoring projections are stale:\n${stale.join('\n')}`);
}
process.stdout.write(
  `${check ? 'Checked' : 'Generated'} ${projections.size} authoring projections.\n`,
);

async function createExampleManifest() {
  const examples = [];
  for (const example of listExamples()) {
    const directory = path.join(projectRoot, 'examples', example.path);
    const files = await recursiveFiles(directory);
    examples.push({
      ...example,
      files: await Promise.all(
        files.map(async (file) => ({
          path: path.relative(directory, file).split(path.sep).join('/'),
          sha256: createHash('sha256')
            .update(await readFile(file))
            .digest('hex'),
        })),
      ),
    });
  }
  const showcaseContract = JSON.parse(
    await readFile(path.join(projectRoot, 'examples/showcase-contract.json'), 'utf8'),
  ) as { readonly requiredShowcaseClasses?: unknown };
  if (
    !Array.isArray(showcaseContract.requiredShowcaseClasses) ||
    !showcaseContract.requiredShowcaseClasses.every((value) => typeof value === 'string')
  ) {
    throw new Error('Showcase contract must declare requiredShowcaseClasses as strings.');
  }
  const coveredClasses = new Set(examples.flatMap((example) => example.classes));
  const missingShowcaseClasses = showcaseContract.requiredShowcaseClasses.filter(
    (value) => !coveredClasses.has(value),
  );
  return {
    contractVersion: getSourceContract().contractVersion,
    showcaseContract: 'showcase-contract.json',
    examples,
    status: missingShowcaseClasses.length === 0 ? 'complete' : 'incomplete',
    missingShowcaseClasses,
  };
}

async function recursiveFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))
      .map(async (entry) => {
        const target = path.join(directory, entry.name);
        return entry.isDirectory() ? await recursiveFiles(target) : [target];
      }),
  );
  return files.flat();
}

async function serialize(value: unknown): Promise<string> {
  return await format(JSON.stringify(value), { ...prettierOptions, parser: 'json' });
}

function resolveOutputRoot(): string {
  const optionIndex = process.argv.indexOf('--output-root');
  if (optionIndex === -1) return projectRoot;
  const candidate = process.argv[optionIndex + 1];
  if (candidate === undefined || candidate.startsWith('--')) {
    throw new Error('--output-root requires a directory path');
  }
  return path.resolve(candidate);
}
