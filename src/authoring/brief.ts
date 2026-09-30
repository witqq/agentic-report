import { PAGE_CATEGORIES, type PageCategoryId } from './registry.js';

/**
 * Заготовка брифа стартера. Бриф — первый шаг работы агента: он отвечает на каждое измерение
 * категории до того, как писать страницу, и записывает, откуда взят ответ. Файл лежит рядом с
 * исходником и в сборку не входит.
 */
export const BRIEF_FILE = 'brief.md';

/** Откуда взят ответ на измерение. */
export const BRIEF_SOURCES = ['request', 'asked', 'inferred'] as const;

export function renderBriefTemplate(categoryId: PageCategoryId): string {
  const category = PAGE_CATEGORIES.find((candidate) => candidate.id === categoryId);
  if (category === undefined) throw new Error(`Unknown page category ${categoryId}.`);
  const rows = category.dimensions.map((dimension) => {
    const question =
      dimension.id === 'subvariant'
        ? `${dimension.question} ${category.subvariants.map((value) => `\`${value}\``).join(', ')}.`
        : dimension.question;
    return `| \`${dimension.id}\` | ${question} | | |`;
  });
  return [
    `# Brief: ${category.title.toLowerCase()} page`,
    '',
    `Category: \`${category.id}\`. ${category.purpose}`,
    '',
    'Answer every dimension before writing the page. Ask the person only what you cannot derive from the request or the material; derive the rest and say how. Source is where the answer came from: `request` (stated in the request), `asked` (the person answered a question), `inferred` (derived from the material — name it).',
    '',
    'The category is a recommendation, not a limit: any directive, mode or effect of another category may appear on this page when the reader needs it.',
    '',
    '| Dimension | Question | Answer | Source |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    '## Media',
    '',
    'One row per file under `assets/`: where it came from and under which licence. Origin is `build-screenshot`, `screencast`, `diagram`, `photo`, `drawn`, `placeholder` (a stand-in for real material still to come, marked as such on the page), or `generated` with its reason in Source.',
    '',
    '| File | Origin | Source | Licence |',
    '| --- | --- | --- | --- |',
    '',
    '## Unresolved content facts',
    '',
    'One line per fact the page needs but nobody gave: a placeholder link, a missing number, a date to confirm.',
    '',
    '## Checks switched off',
    '',
    'One line per check deliberately switched off for this page, with its reason: `- DR-RULE: reason` for a design check, `- PR-RULE: reason` or `- PR-RULE file.md:line: reason` for a prose rule.',
    '',
  ].join('\n');
}

/** Идентификаторы измерений в таблице брифа, в порядке строк. */
export function briefDimensionIds(markdown: string): string[] {
  const ids: string[] = [];
  for (const line of markdown.split('\n')) {
    const match = /^\|\s*`([a-z][a-z0-9-]*)`\s*\|/u.exec(line);
    if (match?.[1] !== undefined) ids.push(match[1]);
  }
  return ids;
}
