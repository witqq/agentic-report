import type { Element } from 'hast';

import type {
  DirectiveAttributeDefinition,
  DirectiveDefinition,
} from '../authoring/directive-contract.js';
import { type PackageLocale, resolvePackageLocale } from '../localization.js';
import { attributeRenderProperty, enumAttribute } from './definitions.js';
import {
  type BlockEnhancementContext,
  type BlockValidationContext,
  type BlockVerdict,
  defineBlock,
} from './define-block.js';
import { hastRawText, takeStringProperty } from './hast.js';
import type { DirectiveNode } from './mdast.js';

/**
 * Number agreement and dates, settled when the page builds so the text on the page is final and
 * copies as the reader sees it. `plural` joins a number with the noun form `Intl.PluralRules` picks for
 * the page language; `time` writes a date or a moment in a declared time zone with
 * `Intl.DateTimeFormat`. Both follow the language of the variant being built, English or Russian;
 * another language tag gets the English rules, as the package catalogue does.
 */

/** How many noun forms each package language needs, in the order the author writes them. */
export const PLURAL_FORMS: Readonly<Record<PackageLocale, readonly string[]>> = {
  en: ['one', 'other'],
  ru: ['one', 'few', 'many'],
};

/** A plain decimal number: what JSON writes and what `Intl.PluralRules` reads without guessing. */
const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u;
/** `2026-09-25`, `2026-09-25T01:17`, `2026-09-25 01:17:30`, optionally with `Z` or `+03:00`. */
const MOMENT =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?)?$/u;
/** The no-break space the page puts between a number and its noun, as typography-ru asks. */
const NO_BREAK_SPACE = '\u00a0';

function label(node: DirectiveNode): string {
  return (node.children ?? [])
    .map((child) => String((child as { value?: unknown }).value ?? ''))
    .join('')
    .trim();
}

function forms(value: unknown): readonly string[] {
  return String(value ?? '')
    .split('|')
    .map((form) => form.trim());
}

// --- plural -----------------------------------------------------------------------------------

function pluralDefinition(): DirectiveDefinition {
  const attributes = [
    {
      name: 'forms',
      description:
        'Noun forms separated by |: English one|other (file|files), Russian one|few|many (файл|файла|файлов).',
      required: true,
      constraint: { kind: 'string', normalization: 'trim', minLength: 3, maxLength: 200 },
      renderProperty: attributeRenderProperty('forms'),
      invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
    },
  ] as const satisfies readonly DirectiveAttributeDefinition[];
  return {
    name: 'plural',
    description:
      'A number with its noun in the form the page language requires, settled when the page builds: :plural[5]{forms="file|files"} → 5 files.',
    forms: ['text'],
    attributes,
    children: 'label-or-generated-label',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'span',
      className: 'semantic-plural',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

function validatePlural(node: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const values = context.attributes(node);
  if (values === undefined) return 'refused';
  const locale = resolvePackageLocale(context.page.language);
  const needed = PLURAL_FORMS[locale];
  const written = forms(values.forms);
  let verdict: BlockVerdict = 'accepted';
  if (!NUMBER.test(label(node))) {
    context.report(
      context.violation(
        node,
        'INVALID_DIRECTIVE_ATTRIBUTE',
        `plural agrees a noun with a number, and its label ${JSON.stringify(label(node))} is not a plain number.`,
        'Write the number as the label, such as :plural[12]{forms="…"}; digits and one decimal point, no grouping.',
      ),
    );
    verdict = 'refused';
  }
  if (written.length !== needed.length || written.some((form) => form === '')) {
    context.report(
      context.violation(
        node,
        'INVALID_DIRECTIVE_ATTRIBUTE',
        `plural on a ${locale === 'ru' ? 'Russian' : 'English'} page needs ${needed.length} noun forms (${needed.join('|')}), and forms has ${written.length}.`,
        locale === 'ru'
          ? 'Write three forms for 1, 2 and 5: forms="файл|файла|файлов".'
          : 'Write two forms for 1 and many: forms="file|files".',
      ),
    );
    verdict = 'refused';
  }
  return verdict;
}

/** The noun form for a number in a package language: Russian fractions take the «few» form. */
export function pluralForm(value: number, locale: PackageLocale, nouns: readonly string[]): string {
  const category = new Intl.PluralRules(locale).select(value);
  const order = PLURAL_FORMS[locale];
  const index = order.indexOf(category === 'other' && locale === 'ru' ? 'few' : category);
  return nouns[index === -1 ? order.length - 1 : index] ?? nouns.at(-1) ?? '';
}

function enhancePlural(node: Element, context: BlockEnhancementContext): void {
  const nouns = forms(takeStringProperty(node, 'dataForms'));
  const locale = resolvePackageLocale(context.language);
  const value = Number(hastRawText(node).trim());
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format(value);
  node.children = [
    { type: 'text', value: `${number}${NO_BREAK_SPACE}${pluralForm(value, locale, nouns)}` },
  ];
}

export const plural = defineBlock({
  definition: pluralDefinition(),
  validate: validatePlural,
  enhance: enhancePlural,
  styles: 'package',
  staticEquivalent: 'Plain text: the number and its noun, settled when the page builds.',
  examples: ['The review found :plural[3]{forms="finding|findings"} in two files.\n'],
});

// --- time -------------------------------------------------------------------------------------

export interface ParsedMoment {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  /** Absent for a date without a time. */
  readonly time?: {
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
    /** Minutes east of UTC when the moment is written with `Z` or an offset. */
    readonly offset?: number;
  };
}

/** Reads `2026-09-25`, `2026-09-25T01:17`, `2026-09-25 01:17:30+03:00`; nothing for anything else. */
export function parseMoment(text: string): ParsedMoment | undefined {
  const match = MOMENT.exec(text.trim());
  if (match === null) return undefined;
  const [, year, month, day, hour, minute, second, zone] = match;
  const date = { year: Number(year), month: Number(month), day: Number(day) };
  const check = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (
    check.getUTCFullYear() !== date.year ||
    check.getUTCMonth() !== date.month - 1 ||
    check.getUTCDate() !== date.day
  )
    return undefined;
  if (hour === undefined || minute === undefined) return date;
  const time = { hour: Number(hour), minute: Number(minute), second: Number(second ?? '0') };
  if (time.hour > 23 || time.minute > 59 || time.second > 59) return undefined;
  if (zone === undefined) return { ...date, time };
  const offset =
    zone === 'Z'
      ? 0
      : (zone.startsWith('-') ? -1 : 1) *
        (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)));
  return { ...date, time: { ...time, offset } };
}

/** Whether `Intl` knows the IANA time zone name. */
export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Minutes east of UTC of `zone` at the instant `utc`. */
function zoneOffset(utc: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(utc));
  const part = (type: string): number =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? '0');
  const wall = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return Math.round((wall - utc) / 60_000);
}

/** The instant of a moment with a time: its own offset, or the wall clock of `zone`. */
export function momentInstant(moment: ParsedMoment, zone: string): number {
  const { time } = moment;
  if (time === undefined) throw new Error('A date without a time has no instant.');
  const wall = Date.UTC(
    moment.year,
    moment.month - 1,
    moment.day,
    time.hour,
    time.minute,
    time.second,
  );
  if (time.offset !== undefined) return wall - time.offset * 60_000;
  // The zone offset depends on the instant; two rounds settle it across a daylight-saving change.
  let instant = wall - zoneOffset(wall, zone) * 60_000;
  instant = wall - zoneOffset(instant, zone) * 60_000;
  return instant;
}

export type MomentDisplay = 'date' | 'time' | 'datetime';

/** A date or a moment as page text in the package language, with the zone named for a time. */
export function formatMoment(
  moment: ParsedMoment,
  zone: string | undefined,
  display: MomentDisplay,
  locale: PackageLocale,
): { readonly text: string; readonly datetime: string } {
  if (moment.time === undefined || zone === undefined) {
    const date = new Date(Date.UTC(moment.year, moment.month - 1, moment.day));
    const text = new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
    const pad = (value: number): string => String(value).padStart(2, '0');
    return { text, datetime: `${moment.year}-${pad(moment.month)}-${pad(moment.day)}` };
  }
  const instant = momentInstant(moment, zone);
  const text = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    ...(display === 'time' ? {} : { day: 'numeric', month: 'long', year: 'numeric' }),
    ...(display === 'date'
      ? {}
      : { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' as const }),
  }).format(new Date(instant));
  return { text, datetime: new Date(instant).toISOString().replace(/\.000Z$/u, 'Z') };
}

/**
 * The shared reading of a moment and its zone, for `time` and for the date of `source`. Reports what
 * is wrong at the node and answers whether the pair is usable.
 */
export function checkMoment(
  node: DirectiveNode,
  context: BlockValidationContext,
  text: string,
  zone: string | undefined,
  what: string,
): ParsedMoment | undefined {
  const moment = parseMoment(text);
  if (moment === undefined) {
    context.report(
      context.violation(
        node,
        'INVALID_DIRECTIVE_ATTRIBUTE',
        `${what} ${JSON.stringify(text)} is not a date (2026-09-25) or a date and time (2026-09-25T01:17).`,
        'Write the date as YYYY-MM-DD, and a time as YYYY-MM-DDTHH:MM, optionally with Z or an offset such as +03:00.',
      ),
    );
    return undefined;
  }
  if (zone !== undefined && !isTimeZone(zone)) {
    context.report(
      context.violation(
        node,
        'INVALID_DIRECTIVE_ATTRIBUTE',
        `zone ${JSON.stringify(zone)} is not a time zone name.`,
        'Use an IANA time zone name such as Europe/Moscow, America/New_York or UTC.',
      ),
    );
    return undefined;
  }
  if (moment.time !== undefined && zone === undefined) {
    context.report(
      context.violation(
        node,
        'INVALID_DIRECTIVE_ATTRIBUTE',
        `${what} ${JSON.stringify(text)} has a time, and no zone says where that time was read.`,
        'Add zone="Europe/Moscow" (any IANA name): the page writes the time in that zone and names it.',
      ),
    );
    return undefined;
  }
  return moment;
}

function zoneAttribute(): DirectiveAttributeDefinition {
  return {
    name: 'zone',
    description:
      'IANA time zone the time is shown in and named by, such as Europe/Moscow; required when the value has a time.',
    required: false,
    constraint: {
      kind: 'string',
      normalization: 'trim',
      minLength: 1,
      maxLength: 64,
      pattern: '^[A-Za-z][A-Za-z0-9_+/-]{0,63}$',
    },
    renderProperty: attributeRenderProperty('zone'),
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

function timeDefinition(): DirectiveDefinition {
  const attributes = [
    zoneAttribute(),
    enumAttribute(
      'show',
      'What of the moment the page writes: auto (the date, and the time when one is written), date, time or datetime.',
      ['auto', 'date', 'time', 'datetime'],
      'auto',
    ),
  ] as const satisfies readonly DirectiveAttributeDefinition[];
  return {
    name: 'time',
    description:
      'A date or a moment written in the page language and, for a time, in a declared time zone, settled when the page builds: :time[2026-09-25T01:17]{zone="Europe/Moscow"}.',
    forms: ['text'],
    attributes,
    children: 'label-or-generated-label',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'span',
      className: 'semantic-time',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

function validateTime(node: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const values = context.attributes(node);
  if (values === undefined) return 'refused';
  const zone = typeof values.zone === 'string' ? values.zone : undefined;
  const moment = checkMoment(node, context, label(node), zone, 'time');
  if (moment === undefined) return 'refused';
  if (moment.time === undefined && (values.show === 'time' || values.show === 'datetime')) {
    context.report(
      context.violation(
        node,
        'INVALID_DIRECTIVE_ATTRIBUTE',
        `show="${String(values.show)}" needs a time, and ${JSON.stringify(label(node))} is a date.`,
        'Write the time in the label (2026-09-25T01:17) or use show="date".',
      ),
    );
    return 'refused';
  }
  return 'accepted';
}

export function momentDisplay(show: string | undefined, moment: ParsedMoment): MomentDisplay {
  if (show === 'date' || show === 'time' || show === 'datetime') return show;
  return moment.time === undefined ? 'date' : 'datetime';
}

function enhanceTime(node: Element, context: BlockEnhancementContext): void {
  const zone = takeStringProperty(node, 'dataZone');
  const show = takeStringProperty(node, 'dataShow');
  const moment = parseMoment(hastRawText(node).trim());
  if (moment === undefined) return;
  const { text, datetime } = formatMoment(
    moment,
    zone,
    momentDisplay(show, moment),
    resolvePackageLocale(context.language),
  );
  node.tagName = 'time';
  node.properties.dateTime = datetime;
  node.children = [{ type: 'text', value: text }];
}

export const time = defineBlock({
  definition: timeDefinition(),
  validate: validateTime,
  enhance: enhanceTime,
  styles: 'package',
  staticEquivalent:
    'Plain text in a time element: the date or moment as the page language writes it, with its zone.',
  examples: [
    'The export was taken :time[2026-09-25T01:17]{zone="Europe/Moscow"} and covers :time[2026-09-24].\n',
  ],
});
