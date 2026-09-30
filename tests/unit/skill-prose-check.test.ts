/**
 * Catches a prose check that misses a catalogue pattern it claims to find, flags a clean sentence, or reads
 * what is not prose: code, attribute values, link targets, quotations. Every rule the script checks has a
 * planted sentence that must be caught and a clean one that must pass, and the table below must cover every
 * rule of `CHECKED_RULES`, so a detector added without its counterexample turns this file red.
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import {
  CHECKED_RULES,
  catalogueRules,
  checkProse,
  detectLanguage,
  markBlocking,
  parseProseSwitches,
  checkPage,
  // @ts-expect-error — модуль скилла написан на JavaScript без объявлений типов.
} from '../../skills/agentic-report/scripts/prose-check.mjs';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const run = promisify(execFile);
const script = path.resolve('skills/agentic-report/scripts/prose-check.mjs');
const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

interface Finding {
  readonly rule: string;
  readonly id: string;
  readonly message: string;
  readonly hint: string;
  readonly line: number;
  readonly weak: boolean;
  readonly blocking?: boolean;
}
type Language = 'ru' | 'en';
const check = checkProse as (source: string, language: Language) => Finding[];
const checked = CHECKED_RULES as Record<Language, string[]>;
const checkSource = checkPage as (source: string) => Promise<{
  files: Record<string, string>;
  findings: (Finding & { file: string; excerpt: string })[];
}>;

function page(language: Language, body: string): string {
  return `---\ntitle: ${language === 'ru' ? 'Проба' : 'Probe'}\nlanguage: ${language}\n---\n\n${body}\n`;
}
function rulesIn(language: Language, body: string): string[] {
  return check(page(language, body), language).map((finding) => finding.rule);
}

/** [rule, planted text that must be caught, clean text that must pass]. */
const RU: readonly (readonly [string, string, string])[] = [
  ['PR-NOT-X-BUT-Y', 'Это не просто отчёт, а инструмент.', 'Он пришёл сюда не просто так.'],
  ['PR-DASH', 'Правил ноль — и ветка играет сама.', 'Сборка — это проверка.'],
  [
    'PR-DASH',
    'Отчёт — вот что важно — готов к чтению.',
    'Лента — очередь, которую двигает навигация.',
  ],
  ['PR-SIGNS', 'Скорость > идеальности.', 'Скорость важнее идеальности.'],
  ['PR-QUESTION', 'Зачем нужен бриф? Он держит решения.', 'Бриф держит решения.'],
  ['PR-COLON-RUNUP', 'Самое интересное: агент учится сам.', 'Список покупок: хлеб, молоко.'],
  ['PR-FRAGMENTS', 'Без кода. Без настроек.', 'Страница собирается без кода и без настроек.'],
  ['PR-HR', 'Первый абзац.\n\n---\n\nВторой абзац.', 'Первый абзац.\n\nВторой абзац.'],
  ['PR-NOMINAL', 'Команда осуществляет контроль сборки.', 'Команда проверяет сборку.'],
  ['PR-COPULA', 'Бриф является основой страницы.', 'Бриф — основа страницы.'],
  ['PR-PASSIVE', 'Решение было принято вчера.', 'Владелец принял решение вчера.'],
  ['PR-FOREIGN', 'Дедлайн сдвинулся на неделю.', 'Срок сдвинулся на неделю.'],
  ['PR-CALQUE', 'Мы адресовали проблему в выпуске.', 'Мы решили проблему в выпуске.'],
  ['PR-MODEL-WORDS', 'Это ключевой шаг сборки.', 'Это первый шаг сборки.'],
  ['PR-INFLATION', 'Выпуск знаменует новую эру.', 'Выпуск вышел во вторник.'],
  [
    'PR-RIDER',
    'Сборка прошла, подчёркивая важность проверки.',
    'Сборка прошла, и проверка нашла два дефекта.',
  ],
  ['PR-SALES', 'Мощный движок собирает страницу.', 'Миграция добавляет уникальный индекс.'],
  ['PR-AUTHORITY', 'По мнению экспертов, это работает.', 'По замеру 12 сентября это работает.'],
  ['PR-TRANSITION', 'Важно отметить, что сборка быстрая.', 'Сборка быстрая.'],
  ['PR-FAUX-DEPTH', 'По сути, это очередь.', 'Это очередь.'],
  [
    'PR-TRIAD',
    'Вступление.\n\n- один\n- два\n- три\n\nСередина.\n\n1. раз\n2. два\n3. три',
    'Вступление.\n\n- один\n- два\n- три\n\nСередина.\n\n- раз\n- два',
  ],
  ['PR-FALSE-RANGE', 'Подходит всем от аналитики до продаж.', 'Работает от начала до конца.'],
  [
    'PR-REPEATED-VERB',
    'Сбербанк предлагает проверять адрес перевода. Тинькофф предлагает подтверждать операцию.',
    'Сбербанк просит проверять адрес перевода. Тинькофф присылает код подтверждения.',
  ],
  [
    'PR-HEADING-ECHO',
    '## Как устроена сборка\n\nСборка устроена как очередь задач.',
    '## Как устроена сборка\n\nКомпилятор читает источник и пишет файл.',
  ],
  ['PR-SUMMARY', 'Подводя итог, сборка работает.', 'Сборка работает за две секунды.'],
  ['PR-SYCOPHANCY', 'Отличный вопрос, спасибо за него.', 'Вопрос касается сборки.'],
  ['PR-CHAT', 'Надеюсь, это поможет.', 'Страница готова к чтению.'],
  ['PR-CHAT', 'Рынок вырос, см. turn0search3 в выдаче.', 'Рынок вырос на 3 % за год.'],
  [
    'PR-HEDGING',
    'Возможно, в некоторых случаях это, скорее всего, сработает.',
    'Возможно, это сработает.',
  ],
  ['PR-SPECULATION', 'Предположительно, сборка ускорилась.', 'Сборка ускорилась на 20 %.'],
  ['PR-FORMAT-NOISE', '## Итоги 🚀', '## Итоги'],
];

const EN: readonly (readonly [string, string, string])[] = [
  [
    'PR-NOT-X-BUT-Y',
    'This is not just a report, it is a handoff.',
    'This report hands the work over.',
  ],
  [
    'PR-CLOSER',
    'The build reads the source. It writes one file.\n\nThat is the point.\n\n## Next',
    'The build reads the source. It writes one file.\n\n## Next',
  ],
  ['PR-STAGING', "Let's dive into the details.", 'The details follow.'],
  ['PR-STRAWMAN', 'It is not merely a formatting choice.', 'Formatting follows the brief.'],
  [
    'PR-TRIAD',
    'Intro.\n\n- one\n- two\n- three\n\nMiddle.\n\n- a\n- b\n- c',
    'Intro.\n\n- one\n- two\n- three\n\nMiddle.\n\n- a\n- b',
  ],
  [
    'PR-SAME-OPENING',
    'The build reads.\n\nThe page opens.\n\nThe reader acts.',
    'The build reads.\n\nA page opens.\n\nReaders act.',
  ],
  ['PR-DASH', 'The build is fast — it caches.', 'The build ran in 2024–2026; it caches.'],
  [
    'PR-QUALIFIERS',
    'A fairly significant and somewhat unusual increase.',
    'A significant increase.',
  ],
  [
    'PR-HYPHEN-PAIRS',
    'It is agent-to-human and source-to-artifact.',
    'It carries the work from the agent to a person.',
  ],
  ['PR-PASSIVE', 'It was decided to ship on Monday.', 'The owner decided to ship on Monday.'],
  ['PR-MODEL-WORDS', 'We leverage the pipeline.', 'We use the pipeline.'],
  ['PR-INFLATION', 'The release plays a vital role.', 'The release fixes two bugs.'],
  ['PR-VAGUE-LINK', 'It is closely associated with modern practice.', 'It follows the 2024 guide.'],
  [
    'PR-RIDER',
    'The build passed, highlighting the importance of tests.',
    'The build passed, and the tests found two defects.',
  ],
  ['PR-SALES', 'A powerful engine builds the page.', 'An engine builds the page in two seconds.'],
  [
    'PR-AUTHORITY',
    'Experts agree that this works.',
    'The benchmark of 12 September shows it works.',
  ],
  ['PR-COPULA', 'The brief serves as the plan.', 'The brief is the plan.'],
  [
    'PR-FORMAT-NOISE',
    '**This whole sentence is set in bold for no reason.**',
    '**Build.** The page is built.',
  ],
  ['PR-HEADING-STYLE', '## How The Build Works Today', '## How the build works today'],
  ['PR-CODE-QUOTES', 'Run `echo “hi”` now.', 'Run `echo "hi"` now.'],
  ['PR-CHAT', 'I hope this helps.', 'The page is done.'],
  ['PR-KNOWLEDGE-LIMIT', 'As of my last update, it works.', 'As of 12 September, it works.'],
  [
    'PR-HEADING-ECHO',
    '## How the build works\n\nThe build works as a queue of tasks.',
    '## How the build works\n\nA compiler reads the source.',
  ],
  ['PR-HISTORY', 'Previously the build took a minute.', 'The build takes two seconds.'],
  ['PR-SIGNS', 'Speed > perfection.', 'Speed matters more than perfection.'],
  ['PR-QUESTION', 'Why a brief? It keeps decisions.', 'A brief keeps decisions.'],
  ['PR-COLON-RUNUP', 'The interesting part: it learns.', 'Shopping list: bread, milk.'],
  ['PR-FRAGMENTS', 'No setup. No config.', 'It needs no setup and no config.'],
  [
    'PR-HR',
    'First paragraph.\n\n***\n\nSecond paragraph.',
    'First paragraph.\n\nSecond paragraph.',
  ],
];

describe('prose check', () => {
  for (const [language, cases] of [
    ['ru', RU],
    ['en', EN],
  ] as const) {
    it(`has a planted and a clean case for every ${language} rule it checks`, () => {
      expect([...new Set(cases.map(([rule]) => rule))].sort()).toEqual(
        [...checked[language]].sort(),
      );
    });
    for (const [rule, planted, clean] of cases) {
      it(`${language}: finds ${rule} in «${planted.split('\n')[0]}» and not in the clean text`, () => {
        expect(rulesIn(language, planted)).toContain(rule);
        expect(rulesIn(language, clean)).not.toContain(rule);
      });
    }
  }

  it('names every rule it checks in the catalogues, in the shared finding shape', async () => {
    const rules = catalogueRules(
      await readFile('skills/agentic-report/references/prose-ru.md', 'utf8'),
      await readFile('skills/agentic-report/references/prose-en.md', 'utf8'),
    ) as Map<string, { ru?: string; en?: string }>;
    for (const language of ['ru', 'en'] as const)
      for (const rule of checked[language]) {
        expect(rules.has(rule), rule).toBe(true);
        expect(rules.get(rule)?.[language], `${rule} in prose-${language}.md`).toBeDefined();
      }
    const [finding] = check(page('ru', 'Это ключевой шаг.'), 'ru');
    expect(Object.keys(finding ?? {}).slice(0, 4)).toEqual(['rule', 'id', 'message', 'hint']);
    expect(finding?.id).toBe('prose-check/ru.model-words');
    expect(finding?.hint).toContain('node scripts/craft.mjs PR-MODEL-WORDS');
    expect(finding?.line).toBe(6);
  });

  it('reads prose only: code, other attribute values, link targets, quotations and block quotes are skipped', () => {
    const planted = 'не просто X, а Y — и ключевой';
    const body = [
      `Код \`${planted}\` в строке.`,
      '',
      '```sh',
      `echo "${planted}"`,
      '```',
      '',
      `::::section{title="Итоги" id="${planted}" kind="${planted}"}`,
      '',
      `Ссылка [на отчёт](https://example.com/${encodeURIComponent(planted)}) и слово «${planted}» в кавычках.`,
      '',
      `> ${planted}`,
      '',
      '::::',
    ].join('\n');
    expect(rulesIn('ru', body)).toEqual([]);
    // A prose attribute is prose: a title is read.
    expect(rulesIn('ru', '::::section{title="Мощный движок" id="a"}\n\nТекст.\n\n::::')).toEqual([
      'PR-SALES',
    ]);
    // So are a directive label and the page title in the frontmatter.
    expect(rulesIn('ru', '::asset[Скачать ключевой файл]{src="assets/a.svg"}')).toEqual([
      'PR-MODEL-WORDS',
    ]);
    // The «>» between the steps of a mini process is its syntax, and a sign in the prose around it is not.
    expect(
      rulesIn('en', 'The run is at :process[Plan > Build > Ship]{current="Build"} now.'),
    ).toEqual([]);
    expect(
      rulesIn('en', 'Speed > perfection, says :process[Plan > Ship]{current="Plan"}.'),
    ).toEqual(['PR-SIGNS']);
  });

  it('lets a weak pattern block only in company', () => {
    const alone = markBlocking(check(page('ru', 'Решение было принято вчера.'), 'ru')) as Finding[];
    expect(alone.map((finding) => [finding.rule, finding.blocking])).toEqual([
      ['PR-PASSIVE', false],
    ]);
    const company = markBlocking(
      check(page('ru', 'Ключевое решение было принято вчера.'), 'ru'),
    ) as Finding[];
    expect(company.every((finding) => finding.blocking)).toBe(true);
  });

  it('names the invisible character it found and leaves a word joiner to typography', () => {
    const found = check(page('ru', 'Текст с\u200Bневидимым символом.'), 'ru');
    expect(found.map((finding) => finding.message)).toEqual(['эмодзи и формат-шум: «U+200B»']);
    expect(check(page('ru', 'Доля от 25–\u206034 % пикселей.'), 'ru')).toEqual([]);
  });

  it('tells the language of a file by its frontmatter, then its name, then its letters', () => {
    expect(detectLanguage('---\nlanguage: ru\n---\n\nText.')).toBe('ru');
    expect(detectLanguage('Text.', 'partials/findings.ru.md')).toBe('ru');
    expect(detectLanguage('Сборка читает источник.')).toBe('ru');
    expect(detectLanguage('The build reads the source.')).toBe('en');
  });

  it('reads switch-offs with a reason from the brief and refuses the rest', () => {
    const known = new Map([['PR-DASH', {}]]);
    const brief =
      '## Checks switched off\n\n- DR-SURFACES: surfaces on purpose.\n- PR-DASH report.ru.md:9: subject and predicate.\n- PR-DASH: a poem.\n- PR-UNKNOWN: why not.\n- PR-DASH\n';
    expect(parseProseSwitches(brief, known)).toEqual({
      switchedOff: [
        { rule: 'PR-DASH', file: 'report.ru.md', line: 9, reason: 'subject and predicate.' },
        { rule: 'PR-DASH', reason: 'a poem.' },
      ],
      rejected: [
        { rule: 'PR-UNKNOWN', problem: 'not a rule of the prose catalogues' },
        { rule: 'PR-DASH', problem: 'no reason given' },
      ],
    });
  });

  it('runs over a page directory with its partials, honours the brief, and exits 1 while a finding blocks', async () => {
    const root = await createTestWorkspace('skill-prose-check');
    workspaces.push(root);
    await writeFile(
      path.join(root, 'report.md'),
      '---\ntitle: Probe\nlanguage: ru\n---\n\n# Проба\n\nСборка читает источник.\n\n{{include: partial.ru.md}}\n',
    );
    await writeFile(path.join(root, 'partial.ru.md'), 'Правил ноль — и ветка играет сама.\n');
    await writeFile(path.join(root, 'checklist.md'), '- [ ] Мощный пункт чеклиста\n');
    const exit = async (): Promise<{ code: number; result: { findings: Finding[] } }> => {
      try {
        const { stdout } = await run(process.execPath, [script, root]);
        return { code: 0, result: JSON.parse(stdout) };
      } catch (error) {
        const failed = error as { code: number; stdout: string };
        return { code: failed.code, result: JSON.parse(failed.stdout) };
      }
    };
    const first = await exit();
    expect(first.code).toBe(1);
    expect(
      first.result.findings.map(
        (finding) =>
          `${finding.rule} ${(finding as unknown as { file: string }).file}:${finding.line}`,
      ),
    ).toEqual(['PR-DASH partial.ru.md:1']);

    await writeFile(
      path.join(root, 'brief.md'),
      '## Checks switched off\n\n- PR-DASH partial.ru.md:1: цитата из письма владельца.\n',
    );
    const second = await exit();
    expect(second.code).toBe(0);
    expect(second.result.findings).toEqual([]);
  });

  it('refuses lexical include escapes without serializing outside prose, for a file or a directory', async () => {
    // Catches private sibling text entering JSON findings before the compiler can refuse the include.
    const root = await createTestWorkspace('prose-include-escape');
    workspaces.push(root);
    const sourceRoot = path.join(root, 'page');
    await mkdir(sourceRoot);
    const outside = path.join(root, 'private.md');
    const marker = 'PRIVATE_INCLUDE_CANARY';
    await writeFile(outside, `We leverage ${marker}.\n`);
    const entry = path.join(sourceRoot, 'report.md');
    for (const reference of ['../private.md', '%2e%2e/private.md', outside]) {
      await writeFile(entry, page('en', `{{include: ${reference}}}`));
      for (const source of [entry, sourceRoot]) {
        await expect(checkSource(source)).rejects.toThrow(/page source directory/u);
        const failure = await run(process.execPath, [script, source]).catch(
          (error: { code: number; stdout: string; stderr: string }) => error,
        );
        expect('code' in failure ? failure.code : 0).toBe(2);
        expect(failure.stdout).toBe('');
        expect(failure.stderr).not.toContain(marker);
      }
    }
  });

  it('refuses include file and ancestor symlinks that point outside the canonical page root', async () => {
    // Lexical containment alone accepts both names; realpath must refuse them before reading content.
    const root = await createTestWorkspace('prose-include-symlink');
    workspaces.push(root);
    const sourceRoot = path.join(root, 'page');
    const outside = path.join(root, 'private');
    await mkdir(sourceRoot);
    await mkdir(outside);
    await writeFile(path.join(outside, 'private.md'), 'We leverage PRIVATE_SYMLINK_CANARY.\n');
    await symlink(path.join(outside, 'private.md'), path.join(sourceRoot, 'linked.md'));
    await symlink(outside, path.join(sourceRoot, 'linked-directory'), 'dir');
    const entry = path.join(sourceRoot, 'report.md');
    for (const reference of ['linked.md', 'linked-directory/private.md']) {
      await writeFile(entry, page('en', `{{include: ${reference}}}`));
      for (const source of [entry, sourceRoot])
        await expect(checkSource(source)).rejects.toThrow(/through a symbolic link/u);
    }
    await writeFile(entry, page('en', 'The page is ready.'));
    await symlink(path.join(outside, 'private.md'), path.join(sourceRoot, 'brief.md'));
    await expect(checkSource(entry)).rejects.toThrow(/through a symbolic link/u);
  });

  it('refuses non-Markdown include contents even through a Markdown symlink alias', async () => {
    // The compiler never reads a non-Markdown partial; the prose check must not serialize its secrets.
    const root = await createTestWorkspace('prose-include-type');
    workspaces.push(root);
    const entry = path.join(root, 'report.md');
    await writeFile(path.join(root, 'private.txt'), 'We leverage PRIVATE_TYPE_CANARY.\n');
    await writeFile(path.join(root, '.env'), 'We leverage PRIVATE_TYPE_CANARY.\n');
    await symlink(path.join(root, 'private.txt'), path.join(root, 'alias.md'));
    for (const reference of ['private.txt', '.env', 'alias.md']) {
      await writeFile(entry, page('en', `{{include: ${reference}}}`));
      for (const source of [entry, root]) {
        await expect(checkSource(source)).rejects.toThrow(/only Markdown files/u);
        const failure = await run(process.execPath, [script, source]).catch(
          (error: { code: number; stdout: string; stderr: string }) => error,
        );
        expect('code' in failure ? failure.code : 0).toBe(2);
        expect(failure.stdout).toBe('');
        expect(failure.stderr).not.toContain('PRIVATE_TYPE_CANARY');
      }
    }
  });

  it('reads nested includes from the source root, permits confined aliases and deduplicates cycles', async () => {
    // Catches resolving a nested include relative to its partial, and a confinement fix that drops valid files.
    const root = await createTestWorkspace('prose-include-local');
    workspaces.push(root);
    await mkdir(path.join(root, 'partials'));
    const entry = path.join(root, 'report.md');
    await writeFile(entry, page('en', '{{include: partials/first.md}}'));
    await writeFile(
      path.join(root, 'partials', 'first.md'),
      '{{include: partials/second%20part.md}}\n{{include: alias.md}}\n',
    );
    await writeFile(
      path.join(root, 'partials', 'second part.md'),
      'We leverage the pipeline.\n{{include: report.md}}\n',
    );
    await symlink(path.join(root, 'partials', 'second part.md'), path.join(root, 'alias.md'));
    for (const source of [entry, root]) {
      const result = await checkSource(source);
      expect(Object.keys(result.files).sort()).toEqual([
        'partials/first.md',
        'partials/second part.md',
        'report.md',
      ]);
      expect(result.findings.map(({ file }) => file)).toEqual(['partials/second part.md']);
    }
  });
});
