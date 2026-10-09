import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { inspectReport } from '../../src/core/analyze-report.js';
import { loadSource } from '../../src/source/load-source.js';
import { inspectMarkdownVocabulary } from '../../src/render/markdown.js';
import { createProviderCache } from '../../src/extensions/provider.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

// Raw directive regexes, primary-only scans and skipping the data/extension phases all disagree here.
it('atlas vocabulary matches inspect across confined includes, localizations, data and extension expansion', async () => {
  const root = await createTestWorkspace('atlas-vocabulary');
  try {
    await mkdir(path.join(root, 'extensions'), { recursive: true });
    await cp(
      path.resolve('tests/fixtures/extensions/page/extensions/metric-card'),
      path.join(root, 'extensions/metric-card'),
      { recursive: true },
    );
    const files = {
      'report.md': `---
title: Vocabulary
language: en
localizations: { ru: report.ru.md }
data: [rows.json]
extensions: [extensions/metric-card/extension.yaml]
---
{{include: first.md}}

:::each{in="rows.items" as="row"}
::metric-card{title="{{row.title}}" value="{{row.value}}"}
:::

::::each{in="rows.empty" as="unused"}
:::spotlight{title="Never expanded"}
Ignored template
:::
::::

\`\`\`md
:::chart{title="Not a directive"}
::point{label="Not parsed" value="1"}
:::
\`\`\`
`,
      'report.ru.md': `---
title: Словарь
language: ru
---
:::disclosure{title="Перевод"}
Подробности.
:::
`,
      'first.md': '{{include: second.md}}\n',
      'second.md': ':::callout{title="Included"}\nNested source evidence.\n:::\n',
      'rows.json': JSON.stringify({ items: [{ title: 'Metric', value: '1' }], empty: [] }),
    };
    for (const [file, contents] of Object.entries(files))
      await writeFile(path.join(root, file), contents);
    const source = await loadSource(root);
    const providerCache = createProviderCache();
    const variants = await Promise.all(
      [source, ...source.localizations].map((variant) =>
        inspectMarkdownVocabulary(variant.markdown, {
          sourceRoot: source.sourceRoot,
          sourceMap: variant.sourceMap,
          format: 'single-file',
          language: variant.manifest.language,
          layout: variant.manifest.layout,
          motion: variant.manifest.motion,
          ...(variant.data === undefined ? {} : { data: variant.data }),
          ...(source.extensions === undefined
            ? {}
            : { extensions: { declared: source.extensions.extensions, providerCache } }),
        }),
      ),
    );
    const fast = [...new Set(variants.flat())];
    expect(fast).toEqual((await inspectReport({ input: root })).observed.directives);
    expect(fast).toEqual(expect.arrayContaining(['callout', 'each', 'disclosure']));
    expect(fast).not.toContain('chart');
    expect(fast).not.toContain('point');
    expect(fast).not.toContain('spotlight');
    expect(source.sourceFiles).toContain(path.join(root, 'second.md'));
  } finally {
    await removeTestWorkspace(root);
  }
});
