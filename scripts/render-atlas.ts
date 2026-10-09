import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { getSourceContract, listExamples } from '../dist/node/discovery.js';
import { inspectReport } from '../dist/node/index.js';
import { listReferenceExtensions } from '../dist/node/authoring/reference-extensions.js';

/** Index from actual parsed sources and the same contract as validation. */
export async function renderAtlas(projectRoot: string): Promise<string> {
  const contract = getSourceContract();
  const examples = await Promise.all(
    listExamples().map(async (example) => {
      const entry = path.join(projectRoot, 'examples', example.path, example.entry);
      const inspected = await inspectReport({ input: entry });
      const source = await readFile(entry, 'utf8');
      const languages = source.match(/^localizations:\n((?:[ \t].*\n)+)/mu)?.[1];
      const variants = [...(languages ?? '').matchAll(/^\s+([\w-]+):\s*(\S+)/gmu)].map((m) => ({
        language: m[1] ?? '',
        entry: m[2] ?? '',
      }));
      const companions = [];
      for (const file of await readdir(path.dirname(entry))) {
        if (
          !file.endsWith('.md') ||
          file === example.entry ||
          file === 'brief.md' ||
          variants.some((v) => v.entry === file)
        )
          continue;
        const text = await readFile(path.join(path.dirname(entry), file), 'utf8');
        if (/^---\n[\s\S]*?\ntitle:/u.test(text)) companions.push(file);
      }
      return { ...example, variants, companions, directives: inspected.observed.directives };
    }),
  );
  const esc = (s: string) => s.replaceAll('|', '\\|').replaceAll('\n', ' ');
  const lines = [
    '# Tools and examples atlas',
    '',
    'Generated from the source contract, parsed packaged examples and extension manifests by `pnpm generate:authoring`. Do not edit the tables by hand.',
    '',
    'Choose the explanation with [directing](directing.md) and [combinations](combinations.md). This atlas routes every directive to exact API and selected real examples; the full example index lists their actual parsed vocabulary; it does not prescribe their order. Run `node <installed-skill>/scripts/build-atlas.mjs --out ./atlas` to build the complete local preview gallery. Pages use the actual runtime: scroll, switch views, play scenes and inspect motion. The gallery contains static, interactive and timed material; a still artifact alone is not a motion demonstration.',
    'A separately installed skill discovers the nearest compiler installed for the current project, or the release pinned in its SKILL.md through npx. `--cli <compiler command>` selects a reviewed checkout explicitly. The compiler examples catalog supplies the actual package source paths; the skill directory need not contain package code or examples.',
    '',
    '## Choose by the creative question',
    '',
    '| Need | Useful vocabulary and examples | Further guidance |',
    '| --- | --- | --- |',
    '| Show change and causality | composition/object/cue; directed-first-edit, directed-theme-color, directed-change-event | [Actions and timing](directed-scenes.md), [combinations](combinations.md) |',
    '| Establish location and scales | spotlight, overview-detail, diagram/zoom, video; capability-tour | [Interface orientation](directed-scenes.md#establish-every-interface-before-showing-a-fragment) |',
    '| Reveal a sequence | beat, demo, section scenes, diagram draw/pulse; cinematic-story, motion-showcase, product-theatre extension | [Vocabulary](vocabulary-use.md) |',
    '| Give a result weight | count, chart count-up, mark, typing, swap, transition, appear; capability-tour, visualization-catalog | [Motion roles](combinations.md) |',
    '| Compose a substantial page | all section recipes and layout families; layout-document, layout-dashboard, layout-landing, layout-mixed | [Composition](compose.md), [art direction](art-direction.md) |',
    '| Give the reader control | tabs, filter, toggle, disclosure, modal, response, review | [Detail on demand](vocabulary-use.md#detail-on-demand) |',
    '| Add a subject-specific effect | declared effect/provider/block/island extensions | [Extension contract](extensions.md) |',
    '',
    '## Complete directive index',
    '',
    '| Directive | Purpose | Exact API | Parsed example routes |',
    '| --- | --- | --- | --- |',
  ];
  for (const [name, directive] of Object.entries(contract.directives).sort(([a], [b]) =>
    a.localeCompare(b, 'en'),
  )) {
    const routes = examples
      .filter((e) => e.directives.includes(name))
      .slice(0, 3)
      .map((e) => `[${e.id}](../../../examples/${e.path}/${e.entry})`)
      .join(', ');
    lines.push(
      `| \`${name}\` | ${esc(directive.description)} | [Fields and limits](catalog.md#${name}) | ${routes || 'See the exact API and composition reference for this supporting directive.'} |`,
    );
  }
  lines.push(
    '',
    '## Every packaged example',
    '',
    '| Example | Purpose and category | Source | Localizations | Parsed vocabulary |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const e of examples)
    lines.push(
      `| ${e.id} | ${esc(e.description)} · ${e.category}${e.subvariant ? `/${e.subvariant}` : ''} | [${e.entry}](../../../examples/${e.path}/${e.entry}) | ${e.variants.map((v) => `[${v.language}](../../../examples/${e.path}/${v.entry})`).join(', ')} | ${e.directives.map((n) => `\`${n}\``).join(', ')} |`,
    );
  lines.push(
    '',
    '### Companion sources',
    '',
    'Companion pages and edition pairs belong to their parent example; translations remain linked from their source.',
    '',
  );
  for (const e of examples)
    for (const file of e.companions)
      lines.push(`- [${e.id}/${file}](../../../examples/${e.path}/${file})`);
  lines.push(
    '',
    '## Reference extensions and all their examples',
    '',
    '| Extension | Level and purpose | Documentation and source examples |',
    '| --- | --- | --- |',
  );
  for (const e of await listReferenceExtensions(path.join(projectRoot, 'extensions'))) {
    const link = (file: string) =>
      `../../../${path.relative(projectRoot, file).split(path.sep).join('/')}`;
    lines.push(
      `| ${e.name} | ${e.kind}: ${esc(e.description)} | [README](${link(e.readme)}), ${e.examples.map((file) => `[${path.basename(file)}](${link(file)})`).join(', ')} |`,
    );
  }
  lines.push(
    '',
    '## Complete source files',
    '',
    'Original example and extension files, including companions, partials, data and media. These are implementation sources, not prescribed film structures.',
    '',
    '## Compatibility and limits',
    '',
    'Read [the catalog](catalog.md) for all page/theme fields, directive attributes, numeric limits and commands. A directive supports only its declared parents, forms and combinations. Print, script-free and reduced-motion equivalents remain available. A scroll scene needs scroll input; pointer depth and tilt need a fine pointer; a filmed composition needs the compatible narration clock. Browser frames need a real address or an illustration label. Sample facts in examples are not product evidence.',
    '',
    'The capability tour, motion showcase and catalogs demonstrate a wide vocabulary deliberately. Their dense combinations are demonstrations rather than recommended default films. Compare them with the document, incident, architecture, launch, research and answer examples to see quieter alternatives. An example source and its built interactive page are the evidence of its implementation; an old brief may describe its motion more narrowly.',
    '',
  );
  const sourceFiles: string[] = [];
  for (const directory of ['examples', 'extensions']) {
    const root = path.join(projectRoot, directory);
    for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || entry.name.startsWith('.')) continue;
      const file = path.join(entry.parentPath, entry.name);
      sourceFiles.push(path.relative(projectRoot, file).split(path.sep).join('/'));
    }
  }
  const inventory = sourceFiles.sort().map((file) => `- [${file}](../../../${file})`);
  const position = lines.indexOf('## Compatibility and limits');
  lines.splice(position, 0, ...inventory, '');
  return lines.join('\n');
}
