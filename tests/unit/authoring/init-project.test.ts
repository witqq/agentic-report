import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, readlink, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { initProject } from '../../../src/index.js';
import { authoringRegistry, type ExampleDefinition } from '../../../src/authoring/registry.js';
import { resolveConfinedStarterRoot } from '../../../src/authoring/starter-path.js';
import { createTestWorkspace, removeTestWorkspace } from '../../helpers/workspace.js';

const originalCwd = process.cwd();
const execFileAsync = promisify(execFile);
const workspaces: string[] = [];
const fsControl = vi.hoisted(() => ({
  calls: [] as string[],
  failReadSuffix: undefined as string | undefined,
  failWriteSuffix: undefined as string | undefined,
  conflictWriteSuffix: undefined as string | undefined,
  symbolicLinkSuffix: undefined as string | undefined,
  specialFileSuffix: undefined as string | undefined,
  omitStarterEntry: false,
  reverseStarterEntries: false,
  mkdirConflictPath: undefined as string | undefined,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    lstat: async (target: Parameters<typeof actual.lstat>[0]) => {
      fsControl.calls.push('lstat');
      const ordinary = await actual.lstat(target);
      const symbolic =
        fsControl.symbolicLinkSuffix !== undefined &&
        String(target).endsWith(fsControl.symbolicLinkSuffix);
      const special =
        fsControl.specialFileSuffix !== undefined &&
        String(target).endsWith(fsControl.specialFileSuffix);
      if (!symbolic && !special) return ordinary;
      return new Proxy(ordinary, {
        get(value, property, receiver) {
          if (property === 'isSymbolicLink') return () => symbolic;
          if (special && (property === 'isFile' || property === 'isDirectory')) return () => false;
          return Reflect.get(value, property, receiver) as unknown;
        },
      });
    },
    realpath: async (...arguments_: Parameters<typeof actual.realpath>) => {
      fsControl.calls.push('realpath');
      return await actual.realpath(...arguments_);
    },
    readdir: async (...arguments_: Parameters<typeof actual.readdir>) => {
      fsControl.calls.push('readdir');
      const entries = await actual.readdir(...arguments_);
      const options = arguments_[1];
      if (
        !Array.isArray(entries) ||
        typeof options !== 'object' ||
        options === null ||
        options.withFileTypes !== true
      ) {
        return entries;
      }
      const isStarterRoot = String(arguments_[0]).endsWith(`${path.sep}examples${path.sep}basic`);
      const filtered =
        isStarterRoot && fsControl.omitStarterEntry
          ? entries.filter(
              (entry) =>
                typeof entry !== 'object' ||
                entry === null ||
                String(Reflect.get(entry, 'name')) !== 'report.md',
            )
          : [...entries];
      return isStarterRoot && fsControl.reverseStarterEntries ? filtered.reverse() : filtered;
    },
    readFile: async (...arguments_: Parameters<typeof actual.readFile>) => {
      fsControl.calls.push('readFile');
      if (
        fsControl.failReadSuffix !== undefined &&
        String(arguments_[0]).endsWith(fsControl.failReadSuffix)
      ) {
        throw Object.assign(new Error('injected starter read failure'), { code: 'EIO' });
      }
      return await actual.readFile(...arguments_);
    },
    mkdir: async (...arguments_: Parameters<typeof actual.mkdir>) => {
      fsControl.calls.push('mkdir');
      if (
        fsControl.mkdirConflictPath !== undefined &&
        path.resolve(String(arguments_[0])) === fsControl.mkdirConflictPath
      ) {
        throw Object.assign(new Error('injected destination conflict'), { code: 'EEXIST' });
      }
      return await actual.mkdir(...arguments_);
    },
    writeFile: async (...arguments_: Parameters<typeof actual.writeFile>) => {
      fsControl.calls.push('writeFile');
      const target = String(arguments_[0]);
      if (
        fsControl.conflictWriteSuffix !== undefined &&
        target.endsWith(fsControl.conflictWriteSuffix)
      ) {
        await actual.writeFile(target, 'external bytes', { flag: 'wx' });
      }
      if (fsControl.failWriteSuffix !== undefined && target.endsWith(fsControl.failWriteSuffix)) {
        throw Object.assign(new Error('injected write failure'), { code: 'EIO' });
      }
      return await actual.writeFile(...arguments_);
    },
    link: async (...arguments_: Parameters<typeof actual.link>) => {
      fsControl.calls.push('link');
      return await actual.link(...arguments_);
    },
    unlink: async (...arguments_: Parameters<typeof actual.unlink>) => {
      fsControl.calls.push('unlink');
      return await actual.unlink(...arguments_);
    },
    rmdir: async (...arguments_: Parameters<typeof actual.rmdir>) => {
      fsControl.calls.push('rmdir');
      return await actual.rmdir(...arguments_);
    },
    rm: async (...arguments_: Parameters<typeof actual.rm>) => {
      fsControl.calls.push('rm');
      return await actual.rm(...arguments_);
    },
  };
});

afterEach(async () => {
  process.chdir(originalCwd);
  fsControl.calls = [];
  fsControl.failReadSuffix = undefined;
  fsControl.failWriteSuffix = undefined;
  fsControl.conflictWriteSuffix = undefined;
  fsControl.symbolicLinkSuffix = undefined;
  fsControl.specialFileSuffix = undefined;
  fsControl.omitStarterEntry = false;
  fsControl.reverseStarterEntries = false;
  fsControl.mkdirConflictPath = undefined;
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

describe('starter initialization', () => {
  it('copies the complete default starter into an absent destination deterministically', async () => {
    const workspace = await createWorkspace('init-success');
    const destination = path.join(workspace, 'project');
    fsControl.reverseStarterEntries = true;

    const result = await initProject({ destination });

    expect(result).toEqual({
      starterId: 'basic',
      starterTitle: 'Report starter',
      projectPath: destination,
      entryPath: path.join(destination, 'report.md'),
      files: ['assets/architecture.svg', 'partials/findings.md', 'report.md'],
    });
    expect(await fileBytes(destination)).toEqual(await fileBytes(path.resolve('examples/basic')));

    const mutable = result.files as string[];
    mutable.push('poison');
    await expect(
      initProject({ destination: path.join(workspace, 'second'), starter: 'basic' }),
    ).resolves.toMatchObject({
      starterId: 'basic',
      files: ['assets/architecture.svg', 'partials/findings.md', 'report.md'],
    });
    await expect(
      initProject({ destination: path.join(workspace, 'alias'), starter: 'report' }),
    ).resolves.toMatchObject({
      starterId: 'basic',
      starterTitle: 'Report starter',
    });
  });

  it('materializes every registry-owned starter as its complete deterministic tree', async () => {
    const workspace = await createWorkspace('init-starter-matrix');
    const starters = authoringRegistry.examples.filter((example) => 'starter' in example);

    expect(starters.map((starter) => starter.id)).toEqual([
      'basic',
      'research',
      'architecture',
      'tutorial',
      'dashboard',
      'landing',
    ]);
    for (const starter of starters) {
      const destination = path.join(workspace, starter.id);
      const result = await initProject({ destination, starter: starter.id });
      expect(result).toMatchObject({
        starterId: starter.id,
        starterTitle: starter.title,
        projectPath: destination,
        entryPath: path.join(destination, ...starter.entry.split('/')),
      });
      expect(result.files).toEqual(
        Object.keys(await fileBytes(path.resolve('examples', starter.path))),
      );
      expect(await fileBytes(destination)).toEqual(
        await fileBytes(path.resolve('examples', starter.path)),
      );
    }
  });

  it('rejects invalid ordinary-JavaScript option shapes before filesystem I/O', async () => {
    const workspace = await createWorkspace('init-invalid-options');
    const destination = path.join(workspace, 'project');
    const arrayWithDestination = Object.assign([], { destination });
    const functionWithDestination = Object.assign(() => undefined, { destination });
    const cases: unknown[] = [
      undefined,
      null,
      [],
      arrayWithDestination,
      functionWithDestination,
      {},
      { destination: 1 },
      { destination: '' },
      { destination: '   ' },
      { destination: 'bad\0path' },
      { destination, starter: 1 },
      { destination, starter: '../unsafe' },
      { destination, starter: 'basic/escape' },
      { destination, starter: 'basic\0suffix' },
      { destination, starter: 'a'.repeat(65) },
      { destination, starter: '' },
      { destination, starter: 'Basic' },
      { destination, unexpected: true },
      Object.create({ destination }) as unknown,
      Object.defineProperty({}, 'destination', { get: () => destination }),
      Object.defineProperty({ destination }, 'starter', {
        get: () => 'basic',
        enumerable: true,
      }),
      { destination, [Symbol('unknown')]: true },
    ];

    for (const value of cases) {
      fsControl.calls = [];
      await expect(initProject(value as never)).rejects.toMatchObject({
        diagnostic: { code: 'INIT_OPTIONS_INVALID' },
      });
      expect(fsControl.calls, String(value)).toEqual([]);
      expect(await readdir(workspace)).toEqual([]);
    }
  });

  it('uses one registry default and supports every named initializable starter', async () => {
    const workspace = await createWorkspace('init-named');
    const examples = authoringRegistry.examples as unknown as ExampleDefinition[];
    const longestStarterId = 'a'.repeat(64);
    const second: ExampleDefinition = {
      ...authoringRegistry.examples[0],
      id: longestStarterId,
      path: 'basic/partials',
      entry: 'findings.md',
      title: 'Second starter',
      starter: { default: false },
    };
    examples.unshift(second);
    try {
      await expect(
        initProject({ destination: path.join(workspace, 'default-project') }),
      ).resolves.toMatchObject({ starterId: 'basic' });
      await expect(
        initProject({
          destination: path.join(workspace, 'named-project'),
          starter: longestStarterId,
        }),
      ).resolves.toEqual({
        starterId: longestStarterId,
        starterTitle: 'Second starter',
        projectPath: path.join(workspace, 'named-project'),
        entryPath: path.join(workspace, 'named-project/findings.md'),
        files: ['findings.md'],
      });
      await expect(
        readFile(path.join(workspace, 'named-project/findings.md'), 'utf8'),
      ).resolves.toBe(await readFile(path.resolve('examples/basic/partials/findings.md'), 'utf8'));
      fsControl.calls = [];
      await expect(
        initProject({ destination: path.join(workspace, 'unknown'), starter: 'missing' }),
      ).rejects.toMatchObject({ diagnostic: { code: 'STARTER_UNKNOWN' } });
      expect(fsControl.calls).toEqual([]);
    } finally {
      examples.shift();
    }
  });

  it.each(['file', 'empty-directory', 'non-empty-directory', 'symlink'] as const)(
    'rejects an existing %s unchanged',
    async (kind) => {
      const workspace = await createWorkspace(`init-existing-${kind}`);
      const destination = path.join(workspace, 'project');
      const target = path.join(workspace, 'target');
      if (kind === 'file') await writeFile(destination, 'user bytes');
      if (kind === 'empty-directory') await mkdir(destination);
      if (kind === 'non-empty-directory') {
        await mkdir(destination);
        await writeFile(path.join(destination, 'user.txt'), 'user bytes');
      }
      if (kind === 'symlink') {
        await mkdir(target);
        await symlink(target, destination, 'dir');
      }

      const before = await snapshotPath(destination);
      await expect(initProject({ destination })).rejects.toMatchObject({
        diagnostic: { code: 'INIT_DESTINATION_EXISTS' },
      });
      expect(await snapshotPath(destination)).toEqual(before);
      if (kind === 'symlink') expect(await readdir(target)).toEqual([]);
    },
  );

  it.each(['missing', 'file', 'symlink'] as const)(
    'rejects a %s immediate parent without creating the destination',
    async (kind) => {
      const workspace = await createWorkspace(`init-parent-${kind}`);
      const parent = path.join(workspace, 'parent');
      const destination = path.join(parent, 'project');
      if (kind === 'file') await writeFile(parent, 'parent bytes');
      if (kind === 'symlink') {
        const target = path.join(workspace, 'target');
        await mkdir(target);
        await symlink(target, parent, 'dir');
      }

      await expect(initProject({ destination })).rejects.toMatchObject({
        diagnostic: {
          code: 'INIT_PARENT_INVALID',
          remediation:
            'Create or choose a writable parent directory that is not a symbolic link, then retry.',
        },
      });
      if (kind === 'missing') await expect(lstat(parent)).rejects.toMatchObject({ code: 'ENOENT' });
      if (kind === 'file') await expect(readFile(parent, 'utf8')).resolves.toBe('parent bytes');
      if (kind === 'symlink') expect((await lstat(parent)).isSymbolicLink()).toBe(true);
      await expect(lstat(destination)).rejects.toMatchObject({
        code: kind === 'file' ? 'ENOTDIR' : 'ENOENT',
      });
    },
  );

  it('supports a nested destination when its immediate parent is an ordinary directory', async () => {
    const workspace = await createWorkspace('init-nested');
    const parent = path.join(workspace, 'parent');
    const destination = path.join(parent, 'project');
    await mkdir(parent);

    await expect(initProject({ destination })).resolves.toMatchObject({ projectPath: destination });
    await expect(readFile(path.join(destination, 'report.md'), 'utf8')).resolves.toContain(
      '# Release decision report',
    );
  });

  it('maps an exclusive destination claim conflict without creating ancestors', async () => {
    const workspace = await createWorkspace('init-root-conflict');
    const destination = path.join(workspace, 'project');
    fsControl.mkdirConflictPath = destination;
    fsControl.calls = [];

    await expect(initProject({ destination })).rejects.toMatchObject({
      diagnostic: { code: 'INIT_DESTINATION_EXISTS' },
    });
    await expect(lstat(destination)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(workspace)).toEqual([]);
  });

  it('preserves a no-overwrite file conflict in the incomplete destination', async () => {
    const workspace = await createWorkspace('init-write-conflict');
    const destination = path.join(workspace, 'project');
    fsControl.conflictWriteSuffix = `${path.sep}partials${path.sep}findings.md`;
    fsControl.calls = [];

    await expect(initProject({ destination })).rejects.toMatchObject({
      diagnostic: { code: 'INIT_DESTINATION_CONFLICT' },
    });
    await expect(readFile(path.join(destination, 'partials/findings.md'), 'utf8')).resolves.toBe(
      'external bytes',
    );
  });

  it('leaves only the claimed destination incomplete after an ordinary write failure', async () => {
    const workspace = await createWorkspace('init-write-failure');
    const destination = path.join(workspace, 'project');
    fsControl.failWriteSuffix = `${path.sep}partials${path.sep}findings.md`;
    fsControl.calls = [];

    await expect(initProject({ destination })).rejects.toMatchObject({
      diagnostic: {
        code: 'INIT_PUBLICATION_FAILED',
        remediation:
          'Inspect the destination state. If an incomplete directory exists, remove it explicitly before retrying at a new path.',
      },
    });
    expect(await recursiveFilePaths(destination)).toEqual(['assets/architecture.svg']);
    expect((await readdir(workspace)).sort()).toEqual(['project']);
  });

  it('fully reads and validates the packaged tree before destination creation', async () => {
    const workspace = await createWorkspace('init-read-failure');
    const destination = path.join(workspace, 'project');
    fsControl.failReadSuffix = `${path.sep}partials${path.sep}findings.md`;
    fsControl.calls = [];

    await expect(initProject({ destination })).rejects.toMatchObject({
      diagnostic: { code: 'STARTER_READ_FAILED' },
    });
    await expect(lstat(destination)).rejects.toMatchObject({ code: 'ENOENT' });

    fsControl.failReadSuffix = undefined;
    fsControl.omitStarterEntry = true;
    fsControl.calls = [];
    await expect(initProject({ destination })).rejects.toMatchObject({
      diagnostic: { code: 'PACKAGE_STARTER_INVALID' },
    });
    await expect(lstat(destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([
    ['starter-root symlink', `${path.sep}examples${path.sep}basic`, undefined],
    ['starter-root special node', undefined, `${path.sep}examples${path.sep}basic`],
    ['tree symlink', `${path.sep}report.md`, undefined],
    ['tree special node', undefined, `${path.sep}report.md`],
  ] as const)(
    'rejects a packaged %s before destination creation',
    async (_label, symbolicSuffix, specialSuffix) => {
      const workspace = await createWorkspace('init-invalid-package-node');
      const destination = path.join(workspace, 'project');
      fsControl.symbolicLinkSuffix = symbolicSuffix;
      fsControl.specialFileSuffix = specialSuffix;
      fsControl.calls = [];

      await expect(initProject({ destination })).rejects.toMatchObject({
        diagnostic: { code: 'PACKAGE_STARTER_INVALID' },
      });
      await expect(lstat(destination)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it('owns no destination cleanup, staging, hard-link, or native rename primitive', async () => {
    const source = await readFile(path.resolve('src/authoring/init-project.ts'), 'utf8');
    expect(source).not.toMatch(/\b(?:rm|unlink|rmdir|mkdtemp|link|rename)\s*\(/u);
    expect(source).not.toMatch(/staging|rollback|inode|hard.?link/iu);
  });

  it('rejects an intermediate starter-root symlink without outside reads', async () => {
    const workspace = await createWorkspace('init-intermediate-link');
    const examplesRoot = path.join(workspace, 'examples');
    const outsideRoot = path.join(workspace, 'outside');
    await mkdir(examplesRoot);
    await mkdir(path.join(outsideRoot, 'basic'), { recursive: true });
    await writeFile(path.join(outsideRoot, 'basic/report.md'), '# outside\n');
    await symlink(outsideRoot, path.join(examplesRoot, 'nested'), 'dir');

    await expect(resolveConfinedStarterRoot(examplesRoot, 'nested/basic')).rejects.toMatchObject({
      diagnostic: { code: 'PACKAGE_STARTER_INVALID' },
    });
    await expect(readFile(path.join(outsideRoot, 'basic/report.md'), 'utf8')).resolves.toBe(
      '# outside\n',
    );
  });

  it('resolves starter bytes beside the package module instead of consumer CWD shadows', async () => {
    const workspace = await createWorkspace('init-package-root');
    const shadow = path.join(workspace, 'examples/basic');
    const destination = path.join(workspace, 'project');
    await mkdir(shadow, { recursive: true });
    await writeFile(path.join(shadow, 'report.md'), '# hostile CWD shadow\n');
    process.chdir(workspace);

    const result = await initProject({ destination });

    expect(result.files).toContain('partials/findings.md');
    expect(await readFile(result.entryPath, 'utf8')).not.toContain('hostile CWD shadow');
  });

  it('executes the built-layout package-root branch with a hostile consumer CWD shadow', async () => {
    const workspace = await createWorkspace('init-built-package-root');
    const shadow = path.join(workspace, 'examples/basic');
    const destination = path.join(workspace, 'project');
    await mkdir(shadow, { recursive: true });
    await writeFile(path.join(shadow, 'report.md'), '# hostile built CWD shadow\n');
    const builtRoot = pathToFileURL(path.resolve(originalCwd, 'dist/node/index.js')).href;
    const script = `
      import { initProject } from ${JSON.stringify(builtRoot)};
      const result = await initProject({ destination: ${JSON.stringify(destination)} });
      process.stdout.write(JSON.stringify(result));
    `;

    const execution = await execFileAsync(
      process.execPath,
      ['--input-type=module', '--eval', script],
      { cwd: workspace },
    );
    const result = JSON.parse(execution.stdout) as { readonly files: readonly string[] };

    expect(result.files).toEqual(['assets/architecture.svg', 'partials/findings.md', 'report.md']);
    expect(await fileBytes(destination)).toEqual(
      await fileBytes(path.resolve(originalCwd, 'examples/basic')),
    );
  });

  it('type-checks the exact built public initialization ABI', async () => {
    const workspace = await createWorkspace('init-public-types');
    const fixture = await readFile(
      path.resolve(originalCwd, 'tests/fixtures/public/init-project-contract.ts.txt'),
      'utf8',
    );
    await writeFile(path.join(workspace, 'contract.ts'), fixture);
    await writeFile(
      path.join(workspace, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          skipLibCheck: true,
          paths: { 'agentic-report': [path.resolve(originalCwd, 'dist/node/index.d.ts')] },
        },
        include: ['contract.ts'],
      }),
    );

    await expect(
      execFileAsync(
        process.execPath,
        [path.resolve(originalCwd, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'],
        { cwd: workspace },
      ),
    ).resolves.toMatchObject({ stderr: '' });
  });
});

async function createWorkspace(prefix: string): Promise<string> {
  const value = await createTestWorkspace(prefix);
  workspaces.push(value);
  return value;
}

async function fileBytes(root: string): Promise<Readonly<Record<string, string>>> {
  return Object.fromEntries(
    await Promise.all(
      (await recursiveFilePaths(root)).map(async (relative) => [
        relative,
        (await readFile(path.join(root, ...relative.split('/')))).toString('base64'),
      ]),
    ),
  );
}

async function recursiveFilePaths(root: string, relative = ''): Promise<string[]> {
  const entries = await readdir(path.join(root, ...relative.split('/').filter(Boolean)), {
    withFileTypes: true,
  });
  const files = await Promise.all(
    entries
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
      .map(async (entry) => {
        const child = relative === '' ? entry.name : `${relative}/${entry.name}`;
        return entry.isDirectory() ? await recursiveFilePaths(root, child) : [child];
      }),
  );
  return files.flat();
}

async function snapshotPath(target: string): Promise<unknown> {
  const targetStat = await lstat(target);
  if (targetStat.isSymbolicLink()) {
    return {
      kind: 'symlink',
      target: await readlink(target),
      identity: { dev: targetStat.dev, ino: targetStat.ino, mode: targetStat.mode },
    };
  }
  if (targetStat.isFile()) return { kind: 'file', bytes: await readFile(target, 'base64') };
  return {
    kind: 'directory',
    identity: { dev: targetStat.dev, ino: targetStat.ino, mode: targetStat.mode },
    files: await fileBytes(target),
  };
}
