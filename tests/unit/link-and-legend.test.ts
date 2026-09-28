import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildReport } from '../../src/index.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function build(body: string) {
  const root = await createTestWorkspace('link-legend');
  workspaces.push(root);
  await writeFile(
    path.join(root, 'report.md'),
    `---\ntitle: Links\nlanguage: en\n---\n\n# Links\n\n${body}\n`,
  );
  return buildReport({ input: root, output: path.join(root, 'page.html') });
}

describe('links that lead nowhere fail the build', () => {
  it('refuses an empty target, a missing anchor, and a phone number that is not one', async () => {
    await expect(build('[empty]()')).rejects.toMatchObject({
      diagnostic: { code: 'EMPTY_LINK_TARGET', source: { line: 8 } },
    });
    await expect(build('[missing](#nowhere)')).rejects.toMatchObject({
      diagnostic: { code: 'MISSING_ANCHOR_TARGET', details: { target: '#nowhere' } },
    });
    await expect(build('[bad](tel:call-me)')).rejects.toMatchObject({
      diagnostic: { code: 'INVALID_LINK_TARGET' },
    });
  });

  it('keeps an anchor to a heading on the page and a phone or text-message link in prose', async () => {
    const result = await build(
      '[call](tel:+15551234567), [text](sms:+15551234567?body=Hi), [top](#links)',
    );
    expect(result.warnings).toEqual([]);
  });
});

describe('an emphasis without a legend entry is reported', () => {
  it('warns about a marked diagram node and a marked timeline event, and not once they are named', async () => {
    const diagram = [
      ':::diagram{title="Flow" description="Two steps."}',
      '::node{id="a" label="Start" kind="accent"}',
      '::node{id="b" label="End"}',
      '::edge{from="a" to="b"}',
      ':::',
    ];
    const timeline = [
      '::::timeline{title="Plan" description="The release plan."}',
      ':::event{date="May" title="Ship" kind="success"}',
      ':::',
      '::::',
    ];
    const warned = await build([...diagram, '', ...timeline].join('\n'));
    expect(warned.warnings.map((warning) => [warning.code, warning.message])).toEqual([
      ['LEGEND_ENTRY_MISSING', expect.stringContaining('Diagram nodes are marked accent')],
      ['LEGEND_ENTRY_MISSING', expect.stringContaining('Timeline events are marked success')],
    ]);

    const named = await build(
      [
        ...diagram.slice(0, -1),
        '::legend-item{node="accent" label="Entry point"}',
        ':::',
        '',
        ...timeline.slice(0, -1),
        '::legend-item{event="success" label="Shipped"}',
        '::::',
      ].join('\n'),
    );
    expect(named.warnings).toEqual([]);
  });
});
