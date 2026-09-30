#!/usr/bin/env node
// The prose check, on the agent's side of the boundary: the compiler never runs it.
//
//   node scripts/prose-check.mjs <page-source>
//
// <page-source> is what `build` accepts: a Markdown file (read with the partials it includes) or a page
// directory (every Markdown file in it except brief.md and checklist.md). Each file is checked against the
// catalogue of its language — frontmatter `language`, then a `.ru.md`/`.en.md` name, then its letters:
// references/prose-ru.md or references/prose-en.md. Prints one JSON document and exits 1 while a
// blocking finding remains. Every finding has the shape design-check's advice has — { rule, id, message,
// hint } — where `rule` is the `PR-…` id of the catalogue entry, `id` names the detector that fired, and
// `hint` is the treatment with the `craft.mjs` command that shows the rule — plus the file, line, excerpt
// and whether it blocks.
//
// The check reads authored prose only: paragraphs, list items, table cells, headings, the page title and
// description, directive labels, and the prose attributes of directives (title, description, caption,
// label, detail, note, prompt). Code blocks, inline code, other attribute values, link targets, data
// placeholders, block quotes and quoted phrases are masked before any pattern runs.
//
// A finding of a strong pattern blocks. A weak pattern (marked «weak alone» in the catalogue) blocks only in
// company: when another finding shares its paragraph. A pattern, or one place of it, is switched off in the
// page's brief.md under «Checks switched off», with its reason on the same line:
//   - PR-DASH: the page quotes a poem whose dashes are the poet's.
//   - PR-DASH report.ru.md:14: the dash stands between subject and predicate.
//
// The approach and the artifact, hard-ban and hedging expressions are ported from smixs/humanizer-ru
// scripts/lint.py (MIT License, Copyright (c) 2026 Serge Shima), whose chat-artifact expressions come from
// Vladimir-Human/humanizer-ru (MIT). The English patterns follow blader/humanizer (MIT, Siqi Chen). Unlike
// the source linter, a dash between a subject and a nominal predicate is not a finding: in Russian it is
// required punctuation (references/prose-ru.md, «О длинном тире отдельно»).

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { confinedFile, includeFile, pageSource, readPageMarkdown } from './source-files.mjs';

const skillRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Directive attributes whose values are sentences a reader reads. */
const PROSE_ATTRIBUTES = new Set([
  'title',
  'description',
  'caption',
  'label',
  'detail',
  'note',
  'prompt',
]);
/** Files in a page directory that are not the page. */
const NOT_PAGE = new Set(['brief.md', 'checklist.md']);

const L = '\\p{L}\\p{N}';
/** A phrase as whole words: no letter or digit may touch either end. */
const words = (source) => new RegExp(`(?<![${L}])(?:${source})(?![${L}])`, 'giu');
/** A stem: whole on the left, any ending on the right. */
const stems = (source) => new RegExp(`(?<![${L}])(?:${source})`, 'giu');

// ---------------------------------------------------------------------------------------------------------
// Patterns. Each names its catalogue id, whether it is weak alone, and the treatment from the catalogue.
// `re` runs over the prose of one block (a paragraph, a list item, a table row, a heading or a title);
// `sentence` runs over each sentence; `block` over the whole block object; `page` over the file.
// ---------------------------------------------------------------------------------------------------------

const MATH_SIGNS = /[≈≥≤≠±⇒←→]|(?<=\s)[=><&+](?=\s)|(?<=\d)\+(?!\d)|(?<![\p{L}])vs\.?(?![\p{L}])/gu;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
/** Chat-bot copy-paste artifacts (humanizer-ru class A); run over the raw line without code. */
const ARTIFACTS =
  /:contentReference\[oaicite:\d+\]|oai_citation:\d+‡|\boaicite:\d+|\bturn\d+(?:search|file|fetch|image|news|video|ref)\d+|citeturn|utm_source=(?:chatgpt|copilot)\.com|referrer=grok\.com|grok_card:\/\/|\[cite_start\]|\[cite:\s*\d+|\[span_\d+\]|【\d+†[^】]*】|\]\(sandbox:\/mnt\/data\/|<\/?think>|ppl-ai-file-upload|INSERT_SOURCE_URL|PASTE_\w+_URL_HERE|\b20\d\d-XX-XX\b/gu;
// U+2060 (word joiner) is not listed: typography may use it to keep a range such as «25–34» on one line.
const ZERO_WIDTH = /[\u200B\u200C\uFEFF]/gu;

const RU_SOFTENERS = [
  'возможно',
  'вероятно',
  'по-видимому',
  'как правило',
  'в некоторых случаях',
  'скорее всего',
  'при определённых условиях',
  'обычно',
  'в зависимости от',
  'в большинстве случаев',
  'потенциально',
];
const RU_VERB_SUFFIX = /(ует|яет|ает|еет|ит|ат|ят|ют|ал|ял|ил|ел|ся|сь|ть)$/u;
const RU_TIME_WORDS =
  /^(начала|конца|утра|вечера|ночи|обеда|полуночи|полудня|сих|того|тех|этого|последнего|первого)$/u;

function sentencesOf(text) {
  return text
    .split(/(?<=[.!?…])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[\p{L}]/u.test(sentence));
}

function wordCount(text) {
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
}

function spacedDashes(text) {
  return [...text.matchAll(/(?<=\s)[—–](?=\s)|(?<=\p{L})—(?=\p{L})/gu)];
}

function ruVerbStems(sentence) {
  const found = new Set();
  for (const word of sentence.toLowerCase().match(/[а-яё]{5,}/gu) ?? []) {
    if (RU_VERB_SUFFIX.test(word)) {
      const stem = word.replace(RU_VERB_SUFFIX, '').slice(0, 6);
      if (stem.length >= 4) found.add(stem);
    }
  }
  return found;
}

function contentStems(text, minimum) {
  return new Set(
    (text.toLowerCase().match(/[\p{L}]+/gu) ?? [])
      .filter((word) => word.length >= minimum)
      .map((word) => word.slice(0, 5)),
  );
}

/** A heading retold by the first sentence under it: most of its content words come back. */
function headingRetold(heading, sentence) {
  const head = contentStems(heading, 4);
  if (head.size < 2) return false;
  const body = contentStems(sentence, 4);
  const shared = [...head].filter((stem) => body.has(stem)).length;
  return shared / head.size >= 0.75;
}

function stackedFragments(sentences, leaders) {
  for (let index = 0; index + 1 < sentences.length; index += 1) {
    const [first, second] = [sentences[index], sentences[index + 1]];
    const a = /^[\p{L}]+/u.exec(first)?.[0]?.toLowerCase();
    const b = /^[\p{L}]+/u.exec(second)?.[0]?.toLowerCase();
    if (
      a !== undefined &&
      a === b &&
      leaders.test(a) &&
      wordCount(first) <= 5 &&
      wordCount(second) <= 5
    )
      return `${first} ${second}`;
  }
  for (let index = 0; index + 2 < sentences.length; index += 1) {
    const run = sentences.slice(index, index + 3);
    if (run.every((sentence) => wordCount(sentence) <= 3 && /[.!]$/u.test(sentence)))
      return run.join(' ');
  }
  return undefined;
}

/** A question the paragraph answers itself: a sentence ending in «?» with more text after it. */
function answeredQuestion(text) {
  const sentences = sentencesOf(text);
  const index = sentences.findIndex((sentence) => /\?["»”]?$/u.test(sentence));
  return index !== -1 && index < sentences.length - 1 ? sentences[index] : undefined;
}

function boldSentence(raw) {
  for (const match of raw.matchAll(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/gu)) {
    const inner = match[1] ?? match[2] ?? '';
    if (wordCount(inner) >= 6) return match[0];
  }
  return undefined;
}

const RU = [
  // Жёсткие запреты.
  {
    rule: 'PR-NOT-X-BUT-Y',
    id: 'ru.not-x-but-y',
    name: 'негативный параллелизм',
    re: /[Нн]е только(?![\p{L}])[^.!?\n]{1,80}?(?<![\p{L}])(?:но|а)\s+\S|[Нн]е просто (?!так(?![\p{L}]))[^.!?\n]{1,80}?(?:,\s*(?:а|но)\s+\S|(?:,|\s--?|\s—|\s–)\s*это\s+\S)|[Нн]е просто (?!так(?![\p{L}]))[^.!?\n]{1,40}[.!?]\s+Это\s+\S|[Рр]ечь идёт не только|(?<![\p{L}])[Нн]ет [^,.!?\n]{1,40}, нет /gu,
    fix: 'Скажи утверждение прямо, двумя простыми предложениями; «как X, так и Y» — та же фигура.',
  },
  {
    rule: 'PR-DASH',
    id: 'ru.dash',
    name: 'тире вместо точки, запятой или двоеточия',
    sentence(sentence) {
      const dashes = spacedDashes(sentence);
      if (dashes.length >= 2) return 'парное тире вместо запятых';
      return undefined;
    },
    re: /(?<=\s)[—–]\s+(?:и|а|но|ведь|потому|поэтому|так что|значит|то есть|зато|иначе|причём|вот)(?![\p{L}])/gu,
    fix: 'Поставь точку, запятую или двоеточие по смыслу. Тире между подлежащим и именным сказуемым остаётся: это знак, а не слоп.',
  },
  {
    rule: 'PR-SIGNS',
    id: 'ru.signs',
    name: 'математические и кодовые знаки в прозе',
    re: MATH_SIGNS,
    fix: 'Напиши словами: «больше», «равно», «против», «и»; код — в обратных кавычках.',
  },
  {
    rule: 'PR-QUESTION',
    id: 'ru.question',
    name: 'риторический вопрос',
    kinds: ['paragraph'],
    block: (block) => answeredQuestion(block.text),
    fix: 'Замени вопрос ответом: скажи то, что вопрос подводил.',
  },
  {
    rule: 'PR-COLON-RUNUP',
    id: 'ru.colon-runup',
    name: 'двоеточие-подводка',
    re: /(?:[Сс]амое (?:интересное|главное|важное)|[Лл]учшая часть|[Гг]лавная деталь|[Фф]ишка в том|[Дд]еталь, которая [^:\n]{0,35}|[Ии]тог прост|[Сс]екрет прост)\s*:/gu,
    fix: 'Убери подводку и начни с того, что за двоеточием.',
  },
  {
    rule: 'PR-FRAGMENTS',
    id: 'ru.fragments',
    name: 'стопка рубленых фрагментов',
    block: (block) =>
      stackedFragments(
        sentencesOf(block.text),
        /^(без|ноль|ни|никаких|никакого|никакой|только|просто)$/u,
      ),
    fix: 'Собери фрагменты в одно предложение с глаголом.',
  },
  {
    rule: 'PR-HR',
    id: 'ru.hr',
    name: 'горизонтальный разделитель',
    hr: true,
    fix: 'Удали разделитель: границы задают заголовки и главы.',
  },
  // Признаки.
  {
    rule: 'PR-NOMINAL',
    id: 'ru.nominal',
    name: 'отглагольные существительные и канцелярит',
    re: stems(
      'осуществл|(?:провод|провед|произв[оеё]д)[а-яё]* (?:работ|анализ|оценк|проверк|настройк|мониторинг)|оказ[а-яё]* (?:влияние|помощь|поддержку|содействие)|принима[а-яё]* участие|име(?:ет|ют|л|ло|ли) место|в целях|посредством|путём|в данн(?:ом|ой|ых)(?![а-яё])|данн(?:ый|ая)(?![а-яё])|вышеуказанн|нижеследующ|вышеизложенн',
    ),
    fix: 'Замени глаголом: «проводить проверку» → «проверять»; «данный» → «этот».',
  },
  {
    rule: 'PR-COPULA',
    id: 'ru.copula',
    name: 'избегание «это» и «есть»',
    re: stems(
      'явля(?:ется|ются|лся|лась|лось|лись)|представля(?:ет|ют|л|ла|ли) собой|выступа(?:ет|ют) в (?:роли|качестве)|служ(?:ит|ат) основой',
    ),
    fix: 'Скажи «это», «есть» или поставь тире между подлежащим и сказуемым.',
  },
  {
    rule: 'PR-PASSIVE',
    id: 'ru.passive',
    name: 'пассив без действующего лица',
    weak: true,
    re: words('(?:был|была|было|были)\\s+[а-яё]+(?:ан|ян|ен|ён|т)(?:а|о|ы)?'),
    fix: 'Назови, кто сделал: «команда приняла решение».',
  },
  {
    rule: 'PR-FOREIGN',
    id: 'ru.foreign',
    name: 'иностранное слово вместо русского',
    re: stems(
      'имплемент|дедлайн|фидб[еэ]к|(?:за)?апрув|юзкейс|юзер(?!ск)|челлендж|инсайт|ивент|скоуп|коллаборац|пофикс|ресёрч|ресерч',
    ),
    fix: 'Возьми русское слово: «реализовать», «срок», «отзыв», «согласовать».',
  },
  {
    rule: 'PR-CALQUE',
    id: 'ru.calque',
    name: 'калькированная сочетаемость',
    re: stems(
      'адресова[а-яё]* (?:проблем|вопрос|задач)|достав[а-яё]* ценност|дела[а-яё]* смысл|на (?:ежедневной|регулярной|постоянной) основе|в конце дня|сдела[а-яё]* разницу',
    ),
    fix: 'Скажи по-русски: «решить проблему», «приносить пользу», «ежедневно».',
  },
  {
    rule: 'PR-MODEL-WORDS',
    id: 'ru.model-words',
    name: 'словарь модели',
    re: stems(
      'ключев|демонстрир|способств|в рамках|важнейш|неуклонно|критически важн|всеобъемлющ|многогранн|бесшовн|комплексн',
    ),
    fix: 'Удали слово или поставь на его место факт: чем именно важно.',
  },
  {
    rule: 'PR-INFLATION',
    id: 'ru.inflation',
    name: 'раздувание значимости',
    re: stems(
      'знаменует|важн(?:ый|ым|ого) (?:этап|шаг|рубеж)|нов(?:ую|ой|ая) эр|на новый уровень|вех(?:а|у|ой|и)(?![а-яё])|переломн|беспрецедентн|игра[а-яё]* (?:ключевую|важную|решающую|значительную|центральную) роль|трудно переоценить|сложно переоценить',
    ),
    fix: 'Скажи, что произошло, без оценки.',
  },
  {
    rule: 'PR-RIDER',
    id: 'ru.rider',
    name: 'поверхностный анализ хвостом',
    re: /,\s*(?:подчёркивая|демонстрируя|отражая|иллюстрируя|подтверждая|знаменуя|символизируя|свидетельствуя|открывая (?:путь|новые))(?![\p{L}])/giu,
    fix: 'Удали хвост с деепричастием: он не добавляет факта.',
  },
  {
    rule: 'PR-SALES',
    id: 'ru.sales',
    name: 'рекламный язык',
    re: stems(
      'мощн|элегантн|потрясающ|удобн|уникальн[а-яё]*(?![а-яё])(?!\\s+(?:индекс|ключ|идентификатор|ограничени|значени|им[яеи]))|инновацион|передов|революцион|впечатляющ|невероятн|превосходн|первоклассн|лучш[а-яё]* в своём классе',
    ),
    fix: 'Опиши, что делает вещь, а не какая она; отчёт описывает, а не продаёт.',
  },
  {
    rule: 'PR-AUTHORITY',
    id: 'ru.authority',
    name: 'размытая атрибуция',
    re: stems(
      'по мнению (?:экспертов|специалистов|аналитиков)|(?:эксперты|аналитики|исследователи|специалисты|учёные) (?:считают|отмечают|утверждают|говорят|доказали|сходятся)|исследования показывают|многие считают|принято считать|как известно|не секрет, что|ни для кого не секрет',
    ),
    fix: 'Назови источник, который можно открыть, или убери утверждение.',
  },
  {
    rule: 'PR-TRANSITION',
    id: 'ru.transition',
    name: 'шаблонный переход',
    re: stems(
      'важно отметить|стоит отметить|стоит подчеркнуть|следует (?:подчеркнуть|отметить)|необходимо (?:учитывать|отметить)|стоит обратить внимание|нельзя не (?:упомянуть|отметить)|также стоит|ещё один аспект',
    ),
    fix: 'Удали переход и скажи сам факт.',
  },
  {
    rule: 'PR-TRANSITION',
    id: 'ru.transition-glue',
    name: 'шаблонный переход',
    weak: true,
    re: words('кроме того|более того|в свою очередь'),
    fix: 'Свяжи мысли смыслом, а не склейкой; часто склейку можно просто удалить.',
  },
  {
    rule: 'PR-FAUX-DEPTH',
    id: 'ru.faux-depth',
    name: 'псевдоглубина',
    re: stems(
      'по сути|если копнуть глубже|глубинн|настоящий вопрос в том|в конечном (?:счёте|итоге)|все упускают|никто не говорит о',
    ),
    fix: 'Удали оборот; если за ним есть мысль, скажи её прямо.',
  },
  {
    rule: 'PR-FAUX-DEPTH',
    id: 'ru.faux-depth-weak',
    name: 'псевдоглубина',
    weak: true,
    re: words('на самом деле'),
    fix: 'Удали оборот: он обещает разоблачение, которого нет.',
  },
  {
    rule: 'PR-TRIAD',
    id: 'ru.lists-of-three',
    name: 'правило трёх',
    weak: true,
    page: 'lists-of-three',
    fix: 'Посчитай пункты по смыслу: один, два или четыре — сколько есть.',
  },
  {
    rule: 'PR-FALSE-RANGE',
    id: 'ru.false-range',
    name: 'ложный диапазон',
    weak: true,
    block(block) {
      for (const match of block.text.matchAll(
        /(?<![\p{L}])от\s+([а-яё]+)\s+до\s+([а-яё]+)(?![\p{L}])/giu,
      )) {
        if (!RU_TIME_WORDS.test(match[1].toLowerCase()) && !RU_TIME_WORDS.test(match[2]))
          return match[0];
      }
      return undefined;
    },
    fix: 'Перечисли, что действительно входит, или назови одно.',
  },
  {
    rule: 'PR-REPEATED-VERB',
    id: 'ru.repeated-verb',
    name: 'повтор глагола в соседних предложениях',
    weak: true,
    block(block) {
      const sentences = sentencesOf(block.text);
      for (let index = 0; index + 1 < sentences.length; index += 1) {
        const shared = [...ruVerbStems(sentences[index])].filter((stem) =>
          ruVerbStems(sentences[index + 1]).has(stem),
        );
        if (shared.length > 0) return `«${shared[0]}…»: ${sentences[index + 1]}`;
      }
      return undefined;
    },
    fix: 'Смени глагол по смыслу или объедини предложения.',
  },
  {
    rule: 'PR-HEADING-ECHO',
    id: 'ru.heading-echo',
    name: 'заголовок пересказан первой строкой',
    weak: true,
    firstUnderHeading: headingRetold,
    fix: 'Начни с того, чего в заголовке нет.',
  },
  {
    rule: 'PR-SUMMARY',
    id: 'ru.summary',
    name: 'резюмирующее заключение',
    re: stems('подводя итог|в заключение|резюмируя|таким образом, можно сделать вывод'),
    heading: /^заключение$/iu,
    fix: 'Удали резюме и закончи последним конкретным предложением.',
  },
  {
    rule: 'PR-SYCOPHANCY',
    id: 'ru.sycophancy',
    name: 'подобострастие',
    re: stems(
      '(?:отличный|хороший|прекрасный|замечательный) вопрос|вы абсолютно правы|вы совершенно правы',
    ),
    fix: 'Удали: страница не отвечает собеседнику.',
  },
  {
    rule: 'PR-CHAT',
    id: 'ru.chat',
    name: 'артефакт чат-бота',
    re: stems(
      'надеюсь, (?:это|было) (?:поможет|полезно)|дайте знать|буду рад помочь|обращайтесь|если у вас (?:остались|возникнут) вопросы|вот (?:обновлённ|исправленн|переписанн)',
    ),
    artifacts: true,
    fix: 'Удали остаток чата; сноски и метки чат-бота замени ссылкой на источник.',
  },
  {
    rule: 'PR-HEDGING',
    id: 'ru.hedging-cascade',
    name: 'хеджирование',
    sentence(sentence) {
      const low = sentence.toLowerCase();
      const hits = RU_SOFTENERS.reduce((sum, word) => sum + low.split(word).length - 1, 0);
      return hits >= 3 ? `${hits} смягчения в одном предложении` : undefined;
    },
    fix: 'Оставь одно смягчение там, где неопределённость настоящая, или скажи прямо.',
  },
  {
    rule: 'PR-HEDGING',
    id: 'ru.hedging',
    name: 'хеджирование',
    weak: true,
    re: stems('в определённой степени|в некотором роде|в какой-то мере'),
    fix: 'Убери оговорку или назови, в какой именно мере.',
  },
  {
    rule: 'PR-SPECULATION',
    id: 'ru.speculation',
    name: 'спекулятивное заполнение',
    weak: true,
    re: stems('предположительно|по всей видимости|широко не задокументирован'),
    fix: 'Проверь по источнику; догадку подавай как догадку или убери.',
  },
  {
    rule: 'PR-FORMAT-NOISE',
    id: 'ru.format-noise',
    name: 'эмодзи и формат-шум',
    headingEmoji: true,
    boldSentence: true,
    fix: 'Убери эмодзи из заголовка; жирным выделяй слово-подлежащее, а не предложение.',
  },
  {
    rule: 'PR-FORMAT-NOISE',
    id: 'ru.format-noise-weak',
    name: 'эмодзи и формат-шум',
    weak: true,
    bodyEmoji: true,
    zeroWidth: true,
    page: 'bold-density',
    fix: 'Убери эмодзи, невидимые символы и лишний жирный.',
  },
];

const EN_QUALIFIERS =
  'fairly|somewhat|rather|quite|relatively|slightly|pretty|very|really|extremely|highly|incredibly';

const EN = [
  {
    rule: 'PR-NOT-X-BUT-Y',
    id: 'en.not-x-but-y',
    name: 'not X but Y',
    sentence(sentence) {
      if (
        /\b(?:not|n't) (?:just|only|merely|simply)\b.{1,80}?(?:\bbut\b|[,;—–] ?(?:it|this|they|that)(?:'s| is| are)\b)/iu.test(
          sentence,
        ) ||
        /\bmore than (?:just )?an? \b.{1,40}?[,;—–] ?(?:it|this)(?:'s| is)\b/iu.test(sentence) ||
        /\bnot (?:just|only|merely) an? [\w-]+\.$/iu.test(sentence)
      )
        return sentence;
      return undefined;
    },
    fix: 'State the claim directly; "both X and Y" with the same contrast is the same tell.',
  },
  {
    rule: 'PR-CLOSER',
    id: 'en.closer',
    name: 'one-line closer',
    weak: true,
    closer: true,
    fix: 'Delete it and end on the last concrete sentence.',
  },
  {
    rule: 'PR-STAGING',
    id: 'en.staging',
    name: 'staged run-up',
    re: /\blet'?s (?:dive|delve|explore|unpack|walk through|take a (?:closer )?look|break (?:it|this|that) down)\b|\bhere'?s what you need to know\b|\bwithout further ado\b|\bin this (?:section|article|page), (?:we|you)(?:'ll| will)\b/giu,
    fix: 'Start with what it means.',
  },
  {
    rule: 'PR-STRAWMAN',
    id: 'en.strawman',
    name: 'arguing with no one',
    sentence(sentence) {
      if (/\bbut\b/iu.test(sentence)) return undefined;
      return /\b(?:it|this|that)(?:'s| is| was)(?: not|n't) (?:merely|just|simply|only) (?:an?|about)\b/iu.test(
        sentence,
      )
        ? sentence
        : undefined;
    },
    fix: 'Nobody said it was; say what it is.',
  },
  {
    rule: 'PR-TRIAD',
    id: 'en.lists-of-three',
    name: 'forced triads',
    weak: true,
    page: 'lists-of-three',
    fix: 'Count the items by meaning: one, two or four, as many as there are.',
  },
  {
    rule: 'PR-SAME-OPENING',
    id: 'en.same-opening',
    name: 'repeated sentence openings',
    weak: true,
    page: 'repeated-openings',
    fix: 'Vary how paragraphs begin; start with the subject that matters to each.',
  },
  {
    rule: 'PR-DASH',
    id: 'en.dash',
    name: 'dash as the universal connector',
    re: /—|(?<=\s)(?:–|--)(?=\s)/gu,
    fix: 'Use a comma, a full stop, or rewrite the clause.',
  },
  {
    rule: 'PR-QUALIFIERS',
    id: 'en.qualifiers',
    name: 'stacked qualifiers',
    weak: true,
    re: new RegExp(
      `\\b(?:${EN_QUALIFIERS})\\s+(?:(?:${EN_QUALIFIERS})\\b|[\\w-]+\\s*(?:,|and)\\s+(?:${EN_QUALIFIERS})\\b)`,
      'giu',
    ),
    fix: 'Pick one qualifier or none.',
  },
  {
    rule: 'PR-HYPHEN-PAIRS',
    id: 'en.hyphen-pairs',
    name: 'hyphenated pairs everywhere',
    weak: true,
    block(block) {
      const pairs = block.text.match(/\b[\w]+-to-[\w]+\b/giu) ?? [];
      return pairs.length >= 2 ? pairs.join(', ') : undefined;
    },
    fix: 'Say the relation in words once; keep one compound at most.',
  },
  {
    rule: 'PR-PASSIVE',
    id: 'en.passive',
    name: 'passive voice with no subject',
    re: /\bit (?:was|has been|is) (?:decided|determined|agreed|found|noted|believed|recommended|felt)\b|\bmistakes were made\b/giu,
    fix: 'Name who decided.',
  },
  {
    rule: 'PR-MODEL-WORDS',
    id: 'en.model-words',
    name: 'overused model vocabulary',
    re: /\b(?:delv(?:e|es|ed|ing)|leverag(?:e|es|ed|ing)|robust(?:ly)?|seamless(?:ly)?|pivotal|underscor(?:e|es|ed|ing)|testament|landscape|realm|tapestry|crucial(?:ly)?|comprehensive(?:ly)?|foster(?:s|ed|ing)?|intricate|multifaceted|vibrant)\b/giu,
    fix: 'Delete the word or put the fact in its place.',
  },
  {
    rule: 'PR-INFLATION',
    id: 'en.inflation',
    name: 'inflated significance',
    re: /\b(?:pivotal|significant|major|key|important) (?:milestone|moment|turning point)\b|\bmarks? a (?:new|significant|major|pivotal)\b|\bplays? an? (?:vital|crucial|pivotal|key|significant|central) role\b|\bgame[- ]chang\w*|\bparadigm shift\b|\bnew era\b/giu,
    fix: 'Say what happened.',
  },
  {
    rule: 'PR-VAGUE-LINK',
    id: 'en.vague-link',
    name: 'vague connection',
    re: /\bclosely (?:associated|linked|tied|connected|related) (?:with|to)\b/giu,
    fix: 'Name the connection or drop it.',
  },
  {
    rule: 'PR-RIDER',
    id: 'en.rider',
    name: 'shallow -ing rider',
    re: /,\s+(?:highlighting|underscoring|emphasi[sz]ing|showcasing|reflecting|demonstrating|illustrating|signal(?:l)?ing|cementing|solidifying|paving the way|contributing to|fostering)\b/giu,
    fix: 'Delete the rider; it adds no fact.',
  },
  {
    rule: 'PR-SALES',
    id: 'en.sales',
    name: 'sales language',
    re: /\b(?:powerful|elegant(?:ly)?|best-in-class|cutting-edge|state-of-the-art|world-class|revolutionary|stunning|breathtaking|effortless(?:ly)?|blazing(?:ly)?[- ]fast|next-generation|groundbreaking|unparalleled)\b/giu,
    fix: 'Describe what it does; a report describes, it does not sell.',
  },
  {
    rule: 'PR-AUTHORITY',
    id: 'en.authority',
    name: 'borrowed authority',
    re: /\b(?:experts|analysts|researchers|scientists|observers|critics) (?:agree|say|believe|note|argue|suggest)\b|\b(?:studies|research|reports) (?:show|shows|suggest|suggests|indicate|indicates)\b|\bmany (?:believe|argue|say)\b|\bit is (?:widely|generally|commonly) (?:believed|known|accepted|agreed)\b/giu,
    fix: 'Name a source the reader can open, or drop the claim.',
  },
  {
    rule: 'PR-COPULA',
    id: 'en.copula',
    name: 'avoiding is, are, has',
    re: /\b(?:serves?|served|serving) as\b|\bstands as\b|\bfunctions as\b/giu,
    fix: 'Use the plain verb: is, are, has.',
  },
  {
    rule: 'PR-COPULA',
    id: 'en.copula-weak',
    name: 'avoiding is, are, has',
    weak: true,
    re: /\b(?:represents|constitutes)\b/giu,
    fix: 'Use the plain verb: is, are, has.',
  },
  {
    rule: 'PR-FORMAT-NOISE',
    id: 'en.bold-sentence',
    name: 'bold as decoration',
    boldSentence: true,
    fix: 'Bold the first words of an item when they are its subject, never a whole sentence.',
  },
  {
    rule: 'PR-FORMAT-NOISE',
    id: 'en.bold-density',
    name: 'bold as decoration',
    weak: true,
    page: 'bold-density',
    fix: 'Bold far less: about one span per 200 words.',
  },
  {
    rule: 'PR-HEADING-STYLE',
    id: 'en.heading-style',
    name: 'decorative heading',
    titleCase: true,
    headingEmoji: true,
    fix: 'Sentence case, no emoji; name the question the section answers.',
  },
  {
    rule: 'PR-CODE-QUOTES',
    id: 'en.code-quotes',
    name: 'curly quotes in code',
    curlyCode: true,
    fix: 'Use straight quotes inside code, identifiers and commands.',
  },
  {
    rule: 'PR-CHAT',
    id: 'en.chat',
    name: 'chatbot residue',
    re: /\bI hope this helps\b|(?:^|[.!?]\s+)(?:Certainly|Of course|Absolutely|Sure)!|\bgreat question\b|\bhere (?:is|are) the [\w\s]{0,30}you (?:asked|requested) for\b|\blet me know if\b|\bfeel free to\b|\bhappy to help\b|\bas an AI\b/giu,
    artifacts: true,
    fix: 'Delete the chat residue; replace a chat-bot citation mark with a link to the source.',
  },
  {
    rule: 'PR-CHAT',
    id: 'en.invisible',
    name: 'chatbot residue',
    weak: true,
    zeroWidth: true,
    bodyEmoji: true,
    fix: 'Remove invisible characters and emoji from the prose.',
  },
  {
    rule: 'PR-KNOWLEDGE-LIMIT',
    id: 'en.knowledge-limit',
    name: 'knowledge-limit disclaimer',
    re: /\bas of my (?:last|latest) (?:update|training|knowledge)\b|\bknowledge cut-?off\b|\bI (?:don't|do not|cannot|can't) (?:have access|browse)\b/giu,
    fix: 'State what the source says.',
  },
  {
    rule: 'PR-HEADING-ECHO',
    id: 'en.heading-echo',
    name: 'heading repeated in the first sentence',
    weak: true,
    firstUnderHeading: headingRetold,
    fix: 'Start with what the heading does not say.',
  },
  {
    rule: 'PR-HISTORY',
    id: 'en.history',
    name: 'writing about the previous version',
    weak: true,
    re: /\bpreviously\b|\bused to\b|\bno longer\b|\b(?:in|from) the (?:old|previous|earlier) version\b|\bwas (?:changed|renamed|replaced|moved) to\b/giu,
    fix: 'Describe the current state; history belongs in a document that was asked for.',
  },
  {
    rule: 'PR-SIGNS',
    id: 'en.signs',
    name: 'math and code signs in prose',
    re: MATH_SIGNS,
    fix: 'Write the word: "more than", "equals", "versus", "and"; code goes in backticks.',
  },
  {
    rule: 'PR-QUESTION',
    id: 'en.question',
    name: 'rhetorical question',
    kinds: ['paragraph'],
    block: (block) => answeredQuestion(block.text),
    fix: 'Replace the question with its answer.',
  },
  {
    rule: 'PR-COLON-RUNUP',
    id: 'en.colon-runup',
    name: 'colon run-up',
    re: /\b(?:the (?:interesting|best|key|important|real|surprising) (?:part|thing|bit)|here'?s the (?:thing|kicker|catch|twist)|the (?:catch|kicker|twist|bottom line)|one detail that changes everything)\s*:/giu,
    fix: 'Drop the run-up and start with what follows the colon.',
  },
  {
    rule: 'PR-FRAGMENTS',
    id: 'en.fragments',
    name: 'stacked fragments',
    block: (block) =>
      stackedFragments(sentencesOf(block.text), /^(no|zero|just|only|not|never|without)$/u),
    fix: 'Join the fragments into one sentence with a verb.',
  },
  {
    rule: 'PR-HR',
    id: 'en.hr',
    name: 'horizontal rule between paragraphs',
    hr: true,
    fix: 'Delete the rule; headings and chapters mark the boundaries.',
  },
];

export const PATTERNS = { ru: RU, en: EN };

/** The `PR-…` rules the script finds, by language, in catalogue order. */
export const CHECKED_RULES = {
  ru: [...new Set(RU.map((pattern) => pattern.rule))],
  en: [...new Set(EN.map((pattern) => pattern.rule))],
};

/**
 * Every `PR-…` rule the prose catalogues define, taken from them as they are now: an entry is a list item
 * of prose-ru.md or prose-en.md that starts with its id in backticks. Maps each id to its entry lines.
 */
export function catalogueRules(ruText, enText) {
  const rules = new Map();
  for (const [language, text] of [
    ['ru', ruText],
    ['en', enText],
  ]) {
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      const id = /^(?:[-*]|\d+\.)\s+`(PR-[A-Z-]+)`/u.exec(line)?.[1];
      if (id === undefined) return;
      const entry = [line];
      for (let next = index + 1; next < lines.length && /^\s{2,}\S/u.test(lines[next]); next += 1)
        entry.push(lines[next].trim());
      if (!rules.has(id)) rules.set(id, {});
      rules.get(id)[language] = entry.join(' ');
    });
  }
  return rules;
}

// ---------------------------------------------------------------------------------------------------------
// Reading the prose out of a page source.
// ---------------------------------------------------------------------------------------------------------

const blank = (text) => text.replace(/[^\n]/gu, ' ');

/** Masks everything on one line that is not prose, keeping columns. */
export function maskInline(line) {
  const code = [];
  let text = line.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/gu, (match, _ticks, inner) => {
    code.push(inner);
    return blank(match);
  });
  text = text.replace(/\{\{[\s\S]*?\}\}/gu, blank);
  text = text.replace(/<https?:[^>\s]*>|https?:\/\/[^\s)\]]+/gu, blank);
  text = text.replace(/\]\([^)]*\)/gu, (match) => ` ${blank(match.slice(1))}`);
  // Attribute blocks keep only the values of prose attributes.
  text = text.replace(/\{[^{}\n]*\}/gu, (block) => {
    let kept = blank(block);
    for (const match of block.matchAll(/([a-z][a-z0-9-]*)="([^"]*)"/gu)) {
      if (!PROSE_ATTRIBUTES.has(match[1])) continue;
      const start = (match.index ?? 0) + match[1].length + 2;
      kept = `${kept.slice(0, start)}${match[2]}${kept.slice(start + match[2].length)}`;
    }
    return kept;
  });
  // The steps of a mini process are separated by «>» by its syntax, not written as a sign in prose.
  text = text.replace(/(?<![\p{L}\p{N}:]):process\[[^\]\n]*\]/gu, (label) =>
    label.replace(/>/gu, ' '),
  );
  text = text.replace(/(?<![\p{L}\p{N}:])(:{1,})[a-z][a-z0-9-]*(?=[[{])/gu, blank);
  text = text.replace(/\\(?=\S)/gu, ' ').replace(/[[\]]/gu, ' ');
  // Quoted phrases are the phrase discussed, not used.
  text = text.replace(/«[^«»\n]*»|„[^„“\n]*“|“[^“”\n]*”|"[^"\n]*"/gu, blank);
  return { text, code };
}

function frontmatterEnd(lines) {
  if (lines[0]?.trim() !== '---') return 0;
  for (let index = 1; index < lines.length; index += 1)
    if (lines[index].trim() === '---') return index + 1;
  return 0;
}

/**
 * Splits a Markdown source into prose blocks: {kind, text, raw, lines: [{offset, line}], heading}.
 * Also returns the page-level facts: horizontal rules, list sizes, inline code, the frontmatter language.
 */
export function readProse(source) {
  const lines = source.replace(/^\uFEFF/u, '').split(/\r?\n/u);
  const blocks = [];
  const rules = [];
  const listSizes = [];
  const inlineCode = [];
  const artifacts = [];
  let language;
  let current;
  let lastHeading;
  let list;

  const close = () => {
    if (current !== undefined && /[\p{L}]/u.test(current.text)) blocks.push(current);
    current = undefined;
  };
  const closeList = () => {
    if (list !== undefined) listSizes.push({ size: list.size, line: list.line });
    list = undefined;
  };
  const start = (kind, lineNumber, text, raw) => {
    close();
    current = {
      kind,
      text,
      raw,
      lines: [{ offset: 0, line: lineNumber }],
      heading: kind === 'paragraph' || kind === 'list' ? lastHeading : undefined,
    };
    lastHeading = undefined;
  };
  const append = (lineNumber, text, raw) => {
    current.lines.push({ offset: current.text.length + 1, line: lineNumber });
    current.text += ` ${text}`;
    current.raw += ` ${raw}`;
  };
  const single = (kind, lineNumber, text, raw) => {
    start(kind, lineNumber, text, raw);
    close();
  };

  const end = frontmatterEnd(lines);
  for (let index = 1; index < end - 1; index += 1) {
    const match = /^(title|description|language):\s*(.*)$/u.exec(lines[index]);
    if (match === null) continue;
    const value = match[2].trim().replace(/^(['"])(.*)\1$/u, '$2');
    if (match[1] === 'language') language = value.toLowerCase();
    else single('title', index + 1, value, value);
  }

  let fence;
  for (let index = end; index < lines.length; index += 1) {
    const raw = lines[index];
    const lineNumber = index + 1;
    const marker = /^\s*(`{3,}|~{3,})/u.exec(raw)?.[1];
    if (fence !== undefined) {
      if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length)
        fence = undefined;
      continue;
    }
    if (marker !== undefined) {
      close();
      closeList();
      fence = marker;
      continue;
    }
    for (const match of raw
      .replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/gu, blank)
      .matchAll(ARTIFACTS))
      artifacts.push({ line: lineNumber, match: match[0] });
    const invisible = raw.match(ZERO_WIDTH)?.[0];
    if (invisible !== undefined)
      artifacts.push({
        line: lineNumber,
        zeroWidth: `U+${invisible.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
      });

    if (raw.trim() === '') {
      close();
      continue;
    }
    if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(raw)) {
      close();
      closeList();
      rules.push(lineNumber);
      continue;
    }
    const { text, code } = maskInline(raw);
    inlineCode.push(...code.map((inner) => ({ line: lineNumber, code: inner })));
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/u.exec(raw);
    if (heading !== null) {
      closeList();
      const masked = text.replace(/^\s*#+/u, (hashes) => blank(hashes));
      single('heading', lineNumber, masked, raw);
      lastHeading = masked.trim();
      continue;
    }
    if (/^\s*:{2,}/u.test(raw)) {
      closeList();
      close();
      // A directive line: its label and prose attributes are prose of their own.
      const title = /\btitle="([^"]*)"/u.exec(raw)?.[1];
      const label = /^\s*:{2,}[a-z][a-z0-9-]*\[([^\]]*)\]/u.exec(raw)?.[1];
      for (const match of raw.matchAll(/([a-z][a-z0-9-]*)="([^"]*)"/gu))
        if (PROSE_ATTRIBUTES.has(match[1]) && match[1] !== 'title')
          single('title', lineNumber, maskInline(match[2]).text, match[2]);
      if (label !== undefined) single('paragraph', lineNumber, maskInline(label).text, label);
      if (title !== undefined) {
        const masked = maskInline(title).text;
        single('heading', lineNumber, masked, title);
        if (/^\s*:{2,}section\b/u.test(raw)) lastHeading = masked.trim();
      }
      continue;
    }
    if (/^\s*\{\{\s*include:/u.test(raw)) {
      close();
      continue;
    }
    if (/^\s*>/u.test(raw)) {
      close();
      continue;
    }
    if (/^\s*\|/u.test(raw)) {
      closeList();
      if (/^\s*\|[\s:|-]+\|\s*$/u.test(raw)) continue;
      single('table', lineNumber, text.replace(/\|/gu, ' '), raw);
      continue;
    }
    const item = /^(\s*)(?:[-*+]|\d+[.)])(?:\s+\[[ xX]\])?\s+/u.exec(raw);
    if (item !== null) {
      const indent = item[1].length;
      if (list === undefined) list = { indent, size: 0, line: lineNumber };
      if (indent === list.indent) list.size += 1;
      start('list', lineNumber, `${blank(item[0])}${text.slice(item[0].length)}`, raw);
      continue;
    }
    if (current !== undefined && (current.kind === 'paragraph' || current.kind === 'list')) {
      append(lineNumber, text, raw);
      continue;
    }
    if (list !== undefined && !/^\s/u.test(raw)) closeList();
    start('paragraph', lineNumber, text, raw);
  }
  close();
  closeList();
  return { blocks, rules, listSizes, inlineCode, artifacts, language };
}

/** The line of an offset in a block. */
function lineAt(block, offset) {
  let line = block.lines[0].line;
  for (const entry of block.lines) if (entry.offset <= offset) line = entry.line;
  return line;
}

function excerpt(text, index, length) {
  const from = Math.max(0, index - 30);
  const to = Math.min(text.length, index + length + 30);
  return text.slice(from, to).replace(/\s+/gu, ' ').trim();
}

export function detectLanguage(source, fileName = '') {
  const declared = readProse(source).language;
  if (declared === 'ru' || declared === 'en') return declared;
  if (declared?.startsWith('ru')) return 'ru';
  if (declared?.startsWith('en')) return 'en';
  if (/\.ru\.md$/iu.test(fileName)) return 'ru';
  if (/\.en\.md$/iu.test(fileName)) return 'en';
  const cyrillic = (source.match(/[а-яё]/giu) ?? []).length;
  const latin = (source.match(/[a-z]/giu) ?? []).length;
  return cyrillic > latin * 0.5 ? 'ru' : 'en';
}

/**
 * Finds the catalogue patterns in one Markdown source. Pure: no file system.
 * @returns {{ rule: string, id: string, message: string, hint: string, weak: boolean, line: number,
 *             excerpt: string, block: number | null }[]}
 */
export function checkProse(source, language) {
  const patterns = PATTERNS[language];
  if (patterns === undefined) throw new Error(`No prose catalogue for language "${language}".`);
  const { blocks, rules, listSizes, inlineCode, artifacts } = readProse(source);
  const findings = [];
  const add = (pattern, line, match, context, block) =>
    findings.push({
      rule: pattern.rule,
      id: `prose-check/${pattern.id}`,
      message: `${pattern.name}: «${match.replace(/\s+/gu, ' ').trim().slice(0, 120)}»`,
      hint: `${pattern.fix} ${language === 'ru' ? 'Правило' : 'The rule'}: node scripts/craft.mjs ${pattern.rule}.`,
      weak: pattern.weak === true,
      line,
      excerpt: context.replace(/\s+/gu, ' ').trim().slice(0, 160),
      block,
    });

  blocks.forEach((block, blockIndex) => {
    const sentences = [];
    let cursor = 0;
    for (const sentence of sentencesOf(block.text)) {
      const at = block.text.indexOf(sentence, cursor);
      sentences.push({ sentence, at: at === -1 ? cursor : at });
      if (at !== -1) cursor = at + sentence.length;
    }
    for (const pattern of patterns) {
      if (pattern.kinds !== undefined && !pattern.kinds.includes(block.kind)) continue;
      if (pattern.re !== undefined) {
        pattern.re.lastIndex = 0;
        for (const match of block.text.matchAll(pattern.re)) {
          const index = match.index ?? 0;
          add(
            pattern,
            lineAt(block, index),
            match[0],
            excerpt(block.text, index, match[0].length),
            blockIndex,
          );
        }
      }
      if (pattern.sentence !== undefined) {
        for (const { sentence, at } of sentences) {
          const found = pattern.sentence(sentence);
          if (found !== undefined) add(pattern, lineAt(block, at), found, sentence, blockIndex);
        }
      }
      if (pattern.block !== undefined) {
        const found = pattern.block(block);
        if (found !== undefined)
          add(pattern, block.lines[0].line, found, block.text.slice(0, 160), blockIndex);
      }
      if (pattern.firstUnderHeading !== undefined && block.heading !== undefined) {
        const first = sentences[0]?.sentence;
        if (first !== undefined && pattern.firstUnderHeading(block.heading, first))
          add(pattern, block.lines[0].line, block.heading, first, blockIndex);
      }
      if (
        pattern.heading !== undefined &&
        block.kind === 'heading' &&
        pattern.heading.test(block.text.trim())
      )
        add(pattern, block.lines[0].line, block.text.trim(), block.text, blockIndex);
      if (pattern.headingEmoji === true && block.kind === 'heading') {
        const match = block.text.match(EMOJI);
        if (match !== null) add(pattern, block.lines[0].line, match[0], block.text, blockIndex);
      }
      if (pattern.bodyEmoji === true && block.kind !== 'heading') {
        const match = block.text.match(EMOJI);
        if (match !== null) add(pattern, block.lines[0].line, match[0], block.text, blockIndex);
      }
      if (pattern.boldSentence === true) {
        const found = boldSentence(block.raw);
        if (found !== undefined) add(pattern, block.lines[0].line, found, found, blockIndex);
      }
      if (pattern.titleCase === true && block.kind === 'heading') {
        const tokens = block.text.trim().split(/\s+/u);
        const long = tokens.filter((token) => /^[\p{L}]{4,}/u.test(token));
        if (
          tokens.length >= 4 &&
          long.length >= 3 &&
          long.every((token) => /^\p{Lu}\p{Ll}/u.test(token))
        )
          add(pattern, block.lines[0].line, block.text.trim(), block.text, blockIndex);
      }
    }
  });

  // Page-level patterns.
  for (const pattern of patterns) {
    if (pattern.hr === true)
      for (const line of rules) add(pattern, line, '---', 'a horizontal rule', null);
    if (pattern.page === 'lists-of-three' && listSizes.length >= 2) {
      if (listSizes.every((list) => list.size === 3))
        add(
          pattern,
          listSizes[0].line,
          `${listSizes.length} lists`,
          'every list has exactly three items',
          null,
        );
    }
    if (pattern.page === 'bold-density') {
      const total = blocks.reduce((sum, block) => sum + wordCount(block.text), 0);
      const bold = blocks.reduce(
        (sum, block) => sum + (block.raw.match(/\*\*[^*\n]+\*\*/gu) ?? []).length,
        0,
      );
      if (total >= 200 && bold > total / 200 + 1)
        add(pattern, 1, `${bold} bold spans`, `${bold} bold spans in ${total} words`, null);
    }
    if (pattern.page === 'repeated-openings') {
      const paragraphs = blocks.filter((block) => block.kind === 'paragraph');
      for (let index = 0; index + 2 < paragraphs.length; index += 1) {
        const first = paragraphs
          .slice(index, index + 3)
          .map((block) => /[\p{L}]+/u.exec(block.text)?.[0]?.toLowerCase());
        if (first[0] !== undefined && first.every((word) => word === first[0])) {
          add(
            pattern,
            paragraphs[index].lines[0].line,
            first[0],
            `three paragraphs in a row start with "${first[0]}"`,
            null,
          );
          break;
        }
      }
    }
    if (pattern.closer === true) {
      for (let index = 1; index < blocks.length; index += 1) {
        const [previous, block, next] = [blocks[index - 1], blocks[index], blocks[index + 1]];
        if (block.kind !== 'paragraph' || previous.kind !== 'paragraph') continue;
        if (next !== undefined && next.kind !== 'heading') continue;
        const sentences = sentencesOf(block.text);
        if (sentences.length === 1 && wordCount(block.text) <= 8)
          add(pattern, block.lines[0].line, block.text.trim(), block.text, index);
      }
    }
    if (pattern.curlyCode === true)
      for (const { line, code } of inlineCode)
        if (/[“”‘’]/u.test(code)) add(pattern, line, code, `\`${code}\``, null);
    if (pattern.artifacts === true)
      for (const entry of artifacts)
        if (entry.match !== undefined) add(pattern, entry.line, entry.match, entry.match, null);
    if (pattern.zeroWidth === true)
      for (const entry of artifacts)
        if (entry.zeroWidth !== undefined)
          add(pattern, entry.line, entry.zeroWidth, 'an invisible character', null);
  }

  // One finding per id and place.
  const seen = new Set();
  return findings
    .filter((finding) => {
      const key = `${finding.id}:${finding.line}:${finding.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

/** A weak finding blocks only when another finding shares its block. */
export function markBlocking(findings) {
  return findings.map((finding) => {
    if (!finding.weak) return { ...finding, blocking: true };
    const company =
      finding.block !== null &&
      findings.some(
        (other) =>
          other !== finding && other.block === finding.block && other.rule !== finding.rule,
      );
    return { ...finding, blocking: company };
  });
}

/**
 * Reads prose switch-offs from the brief's «Checks switched off» section:
 * `- PR-DASH: reason` for the pattern, `- PR-DASH report.md:14: reason` for one place.
 */
export function parseProseSwitches(briefText, knownRules) {
  const switchedOff = [];
  const rejected = [];
  if (typeof briefText !== 'string') return { switchedOff, rejected };
  let inside = false;
  for (const line of briefText.split(/\r?\n/u)) {
    if (/^#{1,6}\s/u.test(line)) {
      inside = /^#{1,6}\s+Checks switched off\s*$/iu.test(line);
      continue;
    }
    if (!inside) continue;
    const match =
      /^\s*[-*]\s+`?(PR-[A-Z-]+)`?(?:\s+`?([^\s:`]+):(\d+)`?)?\s*(?:[:—–-]\s*(.*))?$/u.exec(line);
    if (match === null) continue;
    const [, rule, file, lineNumber, reasonText] = match;
    const reason = (reasonText ?? '').trim();
    if (!knownRules.has(rule))
      rejected.push({ rule, problem: 'not a rule of the prose catalogues' });
    else if (reason.length === 0) rejected.push({ rule, problem: 'no reason given' });
    else
      switchedOff.push({
        rule,
        ...(file === undefined ? {} : { file, line: Number(lineNumber) }),
        reason,
      });
  }
  return { switchedOff, rejected };
}

// ---------------------------------------------------------------------------------------------------------
// The page on disk.
// ---------------------------------------------------------------------------------------------------------

async function markdownIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => {
      const relative = path.relative(directory, file);
      return (
        !NOT_PAGE.has(relative) &&
        !relative.split(path.sep).some((part) => part === 'node_modules' || part.startsWith('.'))
      );
    })
    .sort();
}

async function withIncludes(file, directory, seen = new Set()) {
  const canonical = await confinedFile(file, directory, { markdown: true });
  if (canonical === undefined || seen.has(canonical)) return [];
  seen.add(canonical);
  const text = await readPageMarkdown(canonical, directory);
  const found = [canonical];
  for (const match of text.matchAll(/\{\{\s*include:\s*([^}\s]+)\s*\}\}/gu))
    found.push(...(await withIncludes(includeFile(match[1], directory), directory, seen)));
  return found;
}

/** The files of a page source and the directory its brief lives in. */
export async function pageFiles(source) {
  const { resolved, directory, isDirectory } = await pageSource(source);
  const seen = new Set();
  const files = [];
  for (const file of isDirectory ? await markdownIn(directory) : [resolved])
    files.push(...(await withIncludes(file, directory, seen)));
  return { directory, files };
}

export async function knownRules() {
  const [ru, en] = await Promise.all([
    readFile(path.join(skillRoot, 'references', 'prose-ru.md'), 'utf8'),
    readFile(path.join(skillRoot, 'references', 'prose-en.md'), 'utf8'),
  ]);
  return catalogueRules(ru, en);
}

export async function checkPage(source) {
  const { directory, files } = await pageFiles(source);
  if (files.length === 0) throw new Error(`No Markdown page source found at ${source}.`);
  const rules = await knownRules();
  const briefPath = path.join(directory, 'brief.md');
  const briefText = await readPageMarkdown(briefPath, directory, { optional: true });
  const { switchedOff, rejected } = parseProseSwitches(briefText, rules);
  const findings = [];
  const languages = {};
  for (const file of files) {
    const text = await readPageMarkdown(file, directory);
    const relative = path.relative(directory, file).split(path.sep).join('/');
    const language = detectLanguage(text, file);
    languages[relative] = language;
    for (const finding of markBlocking(checkProse(text, language))) {
      const off = switchedOff.find(
        (entry) =>
          entry.rule === finding.rule &&
          (entry.file === undefined || (entry.file === relative && entry.line === finding.line)),
      );
      if (off !== undefined) continue;
      const { rule, id, message, hint, weak, blocking, line, excerpt } = finding;
      findings.push({ rule, id, message, hint, file: relative, line, excerpt, weak, blocking });
    }
  }
  const blocking = findings.filter((finding) => finding.blocking).length;
  return {
    page: directory,
    brief: briefText === undefined ? null : briefPath,
    files: languages,
    verdict: blocking === 0 ? 'pass' : 'fail',
    blocking,
    findings,
    switchedOff,
    rejectedSwitches: rejected,
  };
}

async function main(argv) {
  const source = argv.find((argument) => !argument.startsWith('--'));
  if (source === undefined) throw new Error('Usage: prose-check.mjs <page-source>');
  const result = await checkPage(source);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.blocking > 0) process.exitCode = 1;
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
