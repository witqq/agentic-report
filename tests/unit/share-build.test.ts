import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { BuildReportOptions } from '../../src/contracts.js';
import { buildReport } from '../../src/core/compiler.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];
interface LabelCase {
  readonly label: string;
  readonly helperPath: string;
  readonly encodedHelperPath?: string;
  readonly line: number;
  readonly sharedLabel: string;
}

const labelCases: readonly LabelCase[] = [
  {
    label: 'first.ts:10',
    helperPath: '/Users/fixture/worktree-a/src/first.ts',
    line: 10,
    sharedLabel: 'first.ts:10',
  },
  {
    label: 'src/é/file.ts:11',
    helperPath: '/Users/fixture/worktree-a/src/unicode-combining.ts',
    line: 11,
    sharedLabel: 'unicode-combining.ts:11',
  },
  {
    label: 'icons/📁/file.ts:12',
    helperPath: '/Users/fixture/worktree-a/src/unicode-symbol.ts',
    line: 12,
    sharedLabel: 'unicode-symbol.ts:12',
  },
  {
    label: 'src/(draft)/file.ts:13',
    helperPath: '/Users/fixture/worktree-a/src/punctuation.ts',
    line: 13,
    sharedLabel: 'punctuation.ts:13',
  },
  {
    label: 'location /Users/alice/private.ts:14',
    helperPath: '/workspace/later-token.ts',
    line: 14,
    sharedLabel: 'later-token.ts:14',
  },
  {
    label: 'location (/Users/alice/private-wrapped.ts:15)',
    helperPath: '/workspace/wrapped-posix.ts',
    line: 15,
    sharedLabel: 'wrapped-posix.ts:15',
  },
  {
    label: 'location [C:\\Users\\alice\\private-wrapped.ts:16]',
    helperPath: '/workspace/wrapped-windows.ts',
    line: 16,
    sharedLabel: 'wrapped-windows.ts:16',
  },
  {
    label: 'location “file:///Users/alice/private-wrapped.ts:17”',
    helperPath: '/workspace/wrapped-file.ts',
    line: 17,
    sharedLabel: 'wrapped-file.ts:17',
  },
  {
    label: 'location (~alice/private-wrapped.ts:18)',
    helperPath: '/workspace/wrapped-home.ts',
    line: 18,
    sharedLabel: 'wrapped-home.ts:18',
  },
  {
    label: 'legacy Unicode helper terminal',
    helperPath: '/workspace/файл📁.ts',
    line: 19,
    sharedLabel: 'файл📁.ts:19',
  },
  {
    label: 'wrong.ts:21',
    helperPath: '/workspace/right.ts',
    line: 21,
    sharedLabel: 'right.ts:21',
  },
  {
    label: '/Users/alice/private/second.ts:20',
    helperPath: '/workspace/second.ts',
    line: 20,
    sharedLabel: 'second.ts:20',
  },
  {
    label: 'C:/Users/alice/private/windows.ts:30',
    helperPath: '/workspace/windows.ts',
    line: 30,
    sharedLabel: 'windows.ts:30',
  },
  {
    label: '\\\\server\\share\\unc.ts:35',
    helperPath: '/workspace/unc.ts',
    line: 35,
    sharedLabel: 'unc.ts:35',
  },
  {
    label: '//server/share/posix-unc.ts:36',
    helperPath: '/workspace/posix-unc.ts',
    line: 36,
    sharedLabel: 'posix-unc.ts:36',
  },
  {
    label: '\\Users\\alice\\root-relative.ts:37',
    helperPath: '/workspace/root-relative.ts',
    line: 37,
    sharedLabel: 'root-relative.ts:37',
  },
  {
    label: 'file:///Users/alice/private/file-url.ts:40',
    helperPath: '/workspace/file-url.ts',
    line: 40,
    sharedLabel: 'file-url.ts:40',
  },
  {
    label: '~/private/home.ts:50',
    helperPath: '/workspace/home.ts',
    line: 50,
    sharedLabel: 'home.ts:50',
  },
  {
    label: '~alice/private/named-home.ts:55',
    helperPath: '/workspace/named-home.ts',
    line: 55,
    sharedLabel: 'named-home.ts:55',
  },
  {
    label: '%2FUsers%2Falice%2Fprivate%2Fencoded.ts:60',
    helperPath: '/workspace/encoded.ts',
    line: 60,
    sharedLabel: 'encoded.ts:60',
  },
  {
    label: '/unsafe/single-absolute:65',
    helperPath: '/tmp//Users/alice/single.ts',
    encodedHelperPath: '%2Ftmp%2F%2FUsers%2Falice%2Fsingle.ts',
    line: 65,
    sharedLabel: 'single.ts:65',
  },
  {
    label: '/unsafe/nested-absolute:70',
    helperPath: '/tmp/%2FUsers%2Falice%2Fsecret.ts',
    line: 70,
    sharedLabel: 'source:70',
  },
  {
    label: '/unsafe/single-control:75',
    helperPath: '/tmp/name\nprivate',
    encodedHelperPath: '%2Ftmp%2Fname%0Aprivate',
    line: 75,
    sharedLabel: 'source:75',
  },
  {
    label: '/unsafe/nested-control:80',
    helperPath: '/tmp/name%0Aprivate',
    line: 80,
    sharedLabel: 'source:80',
  },
  {
    label: '/unsafe/c1-control:82',
    helperPath: '/tmp/name\u0085private',
    encodedHelperPath: '%2Ftmp%2Fname%C2%85private',
    line: 82,
    sharedLabel: 'source:82',
  },
  {
    label: '/unsafe/trailing:90',
    helperPath: '/tmp/',
    line: 90,
    sharedLabel: 'source:90',
  },
  {
    label: '/unsafe/dot:100',
    helperPath: '/tmp/.',
    line: 100,
    sharedLabel: 'source:100',
  },
  {
    label: '/unsafe/raw-dotdot:105',
    helperPath: '/tmp/..',
    line: 105,
    sharedLabel: 'source:105',
  },
  {
    label: '/unsafe/single-dot:106',
    helperPath: '/tmp/.',
    encodedHelperPath: '%2Ftmp%2F%2E',
    line: 106,
    sharedLabel: 'source:106',
  },
  {
    label: '/unsafe/single-dotdot:107',
    helperPath: '/tmp/..',
    encodedHelperPath: '%2Ftmp%2F%2E%2E',
    line: 107,
    sharedLabel: 'source:107',
  },
  {
    label: '/unsafe/nested-dot:108',
    helperPath: '/tmp/%2E',
    line: 108,
    sharedLabel: 'source:108',
  },
  {
    label: '/unsafe/nested-dot:110',
    helperPath: '/tmp/%2E%2E',
    line: 110,
    sharedLabel: 'source:110',
  },
  {
    label: '/unsafe/malformed:120',
    helperPath: '/tmp/name%',
    line: 120,
    sharedLabel: 'source:120',
  },
  {
    label: '/unsafe/mixed:130',
    helperPath: '/tmp/C:\\Users\\alice\\mixed.ts',
    line: 130,
    sharedLabel: 'mixed.ts:130',
  },
  {
    label: '/unsafe/long:140',
    helperPath: `/tmp/${'a'.repeat(158)}`,
    line: 140,
    sharedLabel: 'source:140',
  },
  {
    label: '/unsafe/file-terminal:141',
    helperPath: '/tmp/file:secret',
    line: 141,
    sharedLabel: 'source:141',
  },
  {
    label: '/unsafe/home-terminal:142',
    helperPath: '/tmp/~alice',
    line: 142,
    sharedLabel: 'source:142',
  },
  {
    label: '/unsafe/drive-terminal:143',
    helperPath: '/tmp/C:',
    line: 143,
    sharedLabel: 'source:143',
  },
];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

describe('share-safe build profile', () => {
  it.each(['single-file', 'directory'] as const)(
    'neutralizes only source-link path carriers in %s output and reports the exact count',
    async (format) => {
      const workspace = await createTestWorkspace(`share-${format}`);
      workspaces.push(workspace);
      const source = path.join(workspace, 'report.md');
      const markdown = [
        '# Share handoff',
        '',
        ...labelCases.flatMap((fixture, index) => [
          `Location ${index + 1}: :source-link{label="${fixture.label}" href="${helperUrl(fixture.helperPath, fixture.line, fixture.encodedHelperPath)}"}.`,
          '',
        ]),
        '',
        'Ordinary prose keeps /Users/fixture/authored-note and an [external link](https://example.com/source).',
      ].join('\n');
      await writeFile(source, markdown);
      const sourceHash = sha256(await readFile(source));
      const defaultOutput = path.join(
        workspace,
        format === 'single-file' ? 'default.html' : 'default-artifact',
      );
      const shareOutput = path.join(
        workspace,
        format === 'single-file' ? 'share.html' : 'share-artifact',
      );

      const normal =
        format === 'directory'
          ? await buildReport({ input: source, output: defaultOutput, format })
          : undefined;
      const shared = await buildReport({
        input: source,
        output: shareOutput,
        format,
        share: true,
      });
      const normalHtml =
        normal === undefined ? undefined : await readFile(normal.outputPath, 'utf8');
      const shareHtml = await readFile(shared.outputPath, 'utf8');

      if (normal !== undefined && normalHtml !== undefined) {
        expect(normal).toMatchObject({ share: false, neutralizedSourceLinks: 0 });
        expect(normalHtml.match(/<a class="semantic-source-link"/gu)).toHaveLength(
          labelCases.length,
        );
      }

      expect(shared).toMatchObject({
        share: true,
        neutralizedSourceLinks: labelCases.length,
      });
      expect(shareHtml.match(/<span class="semantic-source-link"/gu)).toHaveLength(
        labelCases.length,
      );
      expect(shareHtml.match(/data-source-link-neutralized=""/gu)).toHaveLength(labelCases.length);
      expect(shareHtml).not.toContain('<a class="semantic-source-link"');
      expect(shareHtml).not.toContain('127.0.0.1:7789/open');
      for (const fixture of labelCases) {
        if (normalHtml !== undefined) {
          expect(normalHtml).toContain(`>${fixture.label}</a>`);
          expect(normalHtml).toContain(
            fixture.encodedHelperPath ?? encodeURIComponent(fixture.helperPath),
          );
        }
        expect(shareHtml).toContain(`>${fixture.sharedLabel}</span>`);
        expect(shareHtml).not.toContain(
          fixture.encodedHelperPath ?? encodeURIComponent(fixture.helperPath),
        );
        expect(shareHtml).not.toContain(fixture.helperPath);
        if (fixture.label !== fixture.sharedLabel) expect(shareHtml).not.toContain(fixture.label);
      }
      expect(shareHtml).toContain('/Users/fixture/authored-note');
      expect(shareHtml).toContain('href="https://example.com/source"');
      expect(sha256(await readFile(source))).toBe(sourceHash);
    },
  );

  it('rejects a non-boolean ESM share option before source reads or output mutation', async () => {
    const workspace = await createTestWorkspace('share-invalid');
    workspaces.push(workspace);
    const output = path.join(workspace, 'sentinel.html');
    await writeFile(output, 'authoritative output\n');
    const invalid = {
      input: path.join(workspace, 'missing.md'),
      output,
      share: 'yes',
    } as unknown as BuildReportOptions;

    await expect(buildReport(invalid)).rejects.toMatchObject({
      diagnostic: { code: 'BUILD_SHARE_INVALID' },
    });
    await expect(readFile(output, 'utf8')).resolves.toBe('authoritative output\n');
  });
});

function helperUrl(sourcePath: string, line: number, encodedPath?: string): string {
  return `http://127.0.0.1:7789/open?path=${encodedPath ?? encodeURIComponent(sourcePath)}&line=${line}`;
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
