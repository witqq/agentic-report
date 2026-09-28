/**
 * Catches a counted claim in the user and agent documentation that the product no longer makes true:
 * «four layouts» after `slides` became the fifth, «six starters» when the registry holds five, «nine
 * recipes» after a tenth is registered. The documents below are prose copies of registry facts, and a
 * count written in prose does not change when the registry does. Every phrase that puts a number — a
 * digit or an English number word from one to twenty — before one of the counted nouns is compared with
 * the number the code holds. A run that matched no claim is red: a check that found nothing proved
 * nothing.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { authoringRegistry, SECTION_RECIPE_NAMES } from '../../src/authoring/registry.js';

const DOCUMENTS = [
  'README.md',
  'docs/AGENT-REFERENCE.md',
  'docs/product/source-contract.md',
  'docs/ARCHITECTURE.md',
  'website/docs/agent/index.md',
  'website/docs/report.md',
  'website/llms.txt',
] as const;

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

/** Registry-owned sets a document may count, each with the plural nouns that name it. */
async function countedFacts(): Promise<readonly { noun: RegExp; name: string; count: number }[]> {
  const cli = await readFile(path.resolve('src/cli.ts'), 'utf8');
  const commands = [...cli.matchAll(/\.command\('([a-z-]+)'\)/gu)].map((match) => match[1]);
  return [
    { name: 'layouts', noun: /^layouts$/u, count: authoringRegistry.page.layouts.length },
    { name: 'themes', noun: /^themes$/u, count: authoringRegistry.page.themes.length },
    {
      name: 'recipes',
      noun: /^recipes$/u,
      // `none` is the absence of a recipe, not a recipe a document would count.
      count: SECTION_RECIPE_NAMES.filter((name) => name !== 'none').length,
    },
    {
      name: 'starters',
      noun: /^(?:starters|starter trees)$/u,
      count: authoringRegistry.examples.filter((example) => 'starter' in example).length,
    },
    { name: 'categories', noun: /^categories$/u, count: authoringRegistry.page.categories.length },
    { name: 'directives', noun: /^directives$/u, count: authoringRegistry.directives.length },
    { name: 'commands', noun: /^commands$/u, count: commands.length },
    { name: 'output formats', noun: /^formats$/u, count: authoringRegistry.output.formats.length },
  ];
}

interface Claim {
  readonly file: string;
  readonly line: number;
  readonly phrase: string;
  readonly stated: number;
  readonly fact: string;
  readonly actual: number;
}

/** Words that end a noun phrase: «eleven come from the themes» is not a count of themes. */
const FUNCTION_WORDS = 'the|a|an|of|and|or|from|in|into|to|with|for|by|on|at|as|is|are|come|comes';
const NUMERAL = `\\d{1,3}|${Object.keys(NUMBER_WORDS).join('|')}`;

/**
 * A number, up to three modifier words (`responsive`, `page`, `` `init` ``, `package-owned`), then a
 * counted noun. A modifier is never another number or a function word, so «one of five standard
 * categories» reads as five and «eight of the eleven come from the themes» reads as nothing. Singular nouns are left alone: «each is one recipe» counts nothing.
 */
const CLAIM = new RegExp(
  `\\b(${NUMERAL})\\s+((?:(?!(?:${FUNCTION_WORDS}|${NUMERAL})\\s)(?:[a-z][a-z-]*|\`[^\`\\s]+\`)\\s+){0,3}?)` +
    '(layouts|themes|recipes|starter trees|starters|categories|directives|commands|formats)\\b',
  'giu',
);

/**
 * Phrases that count a named part of a set rather than the whole set, keyed by `<file>: <phrase>`, with
 * the part they mean. A phrase not listed here is read as a count of the whole set.
 */
const SUBSET_PHRASES: Readonly<Record<string, string>> = {
  'README.md: two commands': 'the `init` and `build` pair of the source-install block above it',
  'website/llms.txt: two commands': 'the `init` and `build` pair printed above it',
  'docs/AGENT-REFERENCE.md: two directives':
    '`diff` and `findings`, the directives of a code review',
};

async function claimsIn(
  file: string,
  text: string,
  usedSubsets: Set<string> = new Set(),
): Promise<Claim[]> {
  const facts = await countedFacts();
  const claims: Claim[] = [];
  const lines = text.split('\n');
  lines.forEach((content, index) => {
    // A phrase may wrap across two lines of a paragraph.
    const window = `${content} ${lines[index + 1] ?? ''}`;
    for (const match of window.matchAll(CLAIM)) {
      if ((match.index ?? 0) >= content.length) continue;
      const numeral = (match[1] ?? '').toLowerCase();
      const noun = (match[3] ?? '').toLowerCase();
      const fact = facts.find((candidate) => candidate.noun.test(noun));
      const phrase = match[0].replace(/\s+/gu, ' ');
      if (fact === undefined) continue;
      if (`${file}: ${phrase}` in SUBSET_PHRASES) {
        usedSubsets.add(`${file}: ${phrase}`);
        continue;
      }
      claims.push({
        file,
        line: index + 1,
        phrase,
        stated: NUMBER_WORDS[numeral] ?? Number(numeral),
        fact: fact.name,
        actual: fact.count,
      });
    }
  });
  return claims;
}

function falseClaims(claims: readonly Claim[]): string[] {
  return claims
    .filter((claim) => claim.stated !== claim.actual)
    .map(
      (claim) =>
        `${claim.file}:${claim.line} «${claim.phrase}» — the registry holds ${claim.actual} ${claim.fact}`,
    );
}

describe('counted claims in the documentation', () => {
  it('match the registry and the CLI', async () => {
    const claims: Claim[] = [];
    const usedSubsets = new Set<string>();
    for (const file of DOCUMENTS) {
      const text = await readFile(path.resolve(file), 'utf8');
      claims.push(...(await claimsIn(file, text, usedSubsets)));
    }
    expect(claims.length, 'no counted claim was found, so nothing was checked').toBeGreaterThan(0);
    expect(falseClaims(claims)).toEqual([]);
    // An exception that no longer matches would silently excuse the next wrong count at that phrase.
    expect(Object.keys(SUBSET_PHRASES).filter((key) => !usedSubsets.has(key))).toEqual([]);
  });

  it('turns red on a planted wrong count', async () => {
    const planted = await claimsIn(
      'planted.md',
      'The package owns four responsive page layouts, eleven built-in themes, and six\nstarters.',
    );
    expect(planted.map((claim) => claim.fact)).toEqual(['layouts', 'themes', 'starters']);
    expect(falseClaims(planted)).toEqual([
      'planted.md:1 «four responsive page layouts» — the registry holds 6 layouts',
      'planted.md:1 «six starters» — the registry holds 5 starters',
    ]);
  });
});
