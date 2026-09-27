/**
 * Остров (`kind: island`) — чужое приложение на странице, которое пакет не пытается понять, а
 * изолирует. Автор пишет `:::island{name hydrate height}` с Markdown внутри; тело — статичный
 * эквивалент, его видят печать, читатель без скриптов и читатель до загрузки. Когда скрипты идут,
 * контроллер страницы (`src/browser/islands.ts`) ставит `<iframe sandbox="allow-scripts" srcdoc>`:
 * документ острова собран здесь, при сборке, со всеми ресурсами внутри и своей политикой
 * `default-src 'none'` — у острова нет сети и нет доступа к странице (непрозрачный источник).
 *
 * Документ `srcdoc` наследует политику безопасности страницы, поэтому каждый скрипт острова должен
 * быть разрешён и там: хеши его скриптов собираются в `IslandCollector` и попадают в CSP страницы —
 * только страницы, где остров стоит.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Element } from 'hast';
import { lookup as lookupMime } from 'mime-types';

import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import { titleAttribute } from '../blocks/definitions.js';
import { type Block, defineBlock } from '../blocks/define-block.js';
import { hastText, stringProperty, takeStringProperty } from '../blocks/hast.js';
import { AgenticReportError } from '../diagnostics.js';
import { ISLAND_DIRECTIVE } from './load.js';
import type { IslandExtension } from './types.js';

export const ISLAND_HYDRATION = ['load', 'idle', 'visible', 'none'] as const;
export const ISLAND_PROTOCOL = 'agentic-report-island';
export const ISLAND_PROTOCOL_VERSION = 1;

/** Что сборка страницы узнаёт об островах: хеши скриптов для CSP, использования и вес документов. */
export interface IslandCollector {
  readonly scriptHashes: Set<string>;
  readonly uses: Map<string, number>;
  readonly bytes: Map<string, number>;
}

export function createIslandCollector(): IslandCollector {
  return { scriptHashes: new Set(), uses: new Map(), bytes: new Map() };
}

/**
 * Мост острова: первый скрипт каждого документа острова. Он принимает сообщения страницы (`init`,
 * `theme`, `renderAt`, `resize`), кладёт токены темы переменными CSS на корень документа острова,
 * сам сообщает высоту содержимого и `ready`, а коду острова даёт `window.agenticReportIsland.on(type, cb)`.
 */
export const ISLAND_BRIDGE = `(()=>{const P=${JSON.stringify(ISLAND_PROTOCOL)},V=${ISLAND_PROTOCOL_VERSION},h=new Map(),post=m=>parent.postMessage(Object.assign({protocol:P,version:V},m),"*"),r=document.documentElement,apply=m=>{if(m.tokens)for(const[k,v]of Object.entries(m.tokens))r.style.setProperty(k,String(v));if(m.scheme)r.dataset.scheme=m.scheme;if(m.language)r.lang=m.language;if(typeof m.reducedMotion==="boolean")r.dataset.reducedMotion=String(m.reducedMotion)};let last=-1;const measure=()=>{const px=Math.ceil(r.getBoundingClientRect().height);if(px!==last){last=px;post({type:"height",px})}};addEventListener("message",e=>{if(e.source!==parent)return;const m=e.data;if(!m||m.protocol!==P||m.version!==V)return;if(m.type==="init"||m.type==="theme")apply(m);for(const f of h.get(m.type)||[])f(m)});window.agenticReportIsland={on(t,f){const l=h.get(t)||[];l.push(f);h.set(t,l)},height(px){post({type:"height",px})}};addEventListener("DOMContentLoaded",()=>{new ResizeObserver(measure).observe(r);measure();post({type:"ready"})})})();`;

/**
 * Стили острова на странице — только там, где остров есть. Живой остров прячет статичное тело на
 * экране; печать всегда показывает тело и никогда — рамку.
 */
export const ISLAND_STYLES = [
  '.semantic-island-frame{display:block;inline-size:100%;block-size:var(--island-height,auto);min-block-size:4rem;border:0;background:transparent;color-scheme:normal}',
  '.semantic-island[data-island-state="live"]>.semantic-island-static{display:none}',
  '@media print{.semantic-island-frame{display:none!important}.semantic-island>.semantic-island-static{display:block!important}}',
].join('\n');

const HEIGHT_PATTERN = '^(?:[1-9][0-9]{0,3}(?:\\.[0-9]{1,3})?)(?:px|rem|em|vh|svh|dvh|lh)$';

function islandDefinition(names: readonly [string, ...string[]]): DirectiveDefinition {
  return {
    name: ISLAND_DIRECTIVE,
    description:
      'A sandboxed application declared by a page island extension; its Markdown body is the static equivalent shown in print, without scripts and before it loads.',
    forms: ['container'],
    attributes: [
      {
        name: 'name',
        description: 'The island extension to run.',
        required: true,
        constraint: { kind: 'enum', values: names },
        renderProperty: 'dataIslandName',
        invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
      },
      {
        name: 'hydrate',
        description:
          'When the island starts: at load, when the browser is idle, when it scrolls into view, or never (static body only).',
        required: false,
        default: 'visible',
        constraint: { kind: 'enum', values: ISLAND_HYDRATION },
        renderProperty: 'dataHydrate',
        invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
      },
      {
        name: 'height',
        description:
          'Fixed frame height such as 28rem or 420px; without it the frame follows the height the island reports.',
        required: false,
        constraint: {
          kind: 'string',
          normalization: 'trim',
          minLength: 1,
          maxLength: 16,
          pattern: HEIGHT_PATTERN,
        },
        renderProperty: 'dataIslandHeight',
        invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
      },
      titleAttribute,
    ],
    children: 'markdown',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'figure',
      className: 'semantic-island',
      properties: [
        'dataSemantic',
        'dataDirectiveTitle',
        'dataIslandName',
        'dataHydrate',
        'dataIslandHeight',
      ],
    },
    security: { authorCode: true, rawHtml: false, localResourceOnly: true },
    handoffs: ['semantic-document'],
  };
}

/**
 * Блок `island` страницы с островами. Он существует только в словаре такой страницы: у страницы без
 * островов директивы нет вовсе, и её вывод не меняется.
 */
export function islandBlock(
  islands: ReadonlyMap<string, IslandExtension>,
  collector: IslandCollector,
): Block {
  const [first, ...rest] = [...islands.keys()];
  if (first === undefined) throw new Error('An island block needs at least one island.');
  const documents = new Map<string, Promise<IslandDocument>>();
  return defineBlock<IslandDocument | undefined>({
    definition: islandDefinition([first, ...rest]),
    validate: (node, context) => {
      const body = (node.children ?? []).filter(
        (child) =>
          !(
            typeof child === 'object' &&
            child !== null &&
            'data' in child &&
            (child as { data?: { directiveLabel?: boolean } }).data?.directiveLabel === true
          ),
      );
      if (body.length > 0) return 'accepted';
      context.report(
        context.violation(
          node,
          'EXTENSION_ISLAND_STATIC_REQUIRED',
          'An island needs a Markdown body: it is what print, readers without scripts and readers before it loads see.',
          'Write the static equivalent inside the island directive: the numbers, a table or an image of the result.',
        ),
      );
      return 'refused';
    },
    prepare: async (element) => {
      const name = stringProperty(element, 'dataIslandName');
      const island = name === undefined ? undefined : islands.get(name);
      if (island === undefined) return undefined;
      collector.uses.set(island.name, (collector.uses.get(island.name) ?? 0) + 1);
      if (stringProperty(element, 'dataHydrate') === 'none') return undefined;
      let prepared = documents.get(island.name);
      if (prepared === undefined) {
        prepared = buildIslandDocument(island);
        documents.set(island.name, prepared);
      }
      const document = await prepared;
      for (const hash of document.scriptHashes) collector.scriptHashes.add(hash);
      collector.bytes.set(island.name, Buffer.byteLength(document.html));
      return document;
    },
    enhance: (element, _context, prepared) => {
      const title = takeStringProperty(element, 'dataDirectiveTitle');
      const height = stringProperty(element, 'dataIslandHeight');
      element.properties.className = ['semantic-island'];
      if (prepared !== undefined) element.properties.dataIslandDocument = prepared.html;
      if (height !== undefined) element.properties.style = `--island-height:${height}`;
      const body: Element = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['semantic-island-static'], dataIslandStatic: '' },
        children: element.children,
      };
      element.children = [
        body,
        ...(title === undefined
          ? []
          : [
              {
                type: 'element' as const,
                tagName: 'figcaption',
                properties: { className: ['semantic-island-caption'] },
                children: [{ type: 'text' as const, value: title }],
              },
            ]),
      ];
      if (title === undefined && hastText(body) === '') element.properties.ariaHidden = 'true';
    },
    styles: 'package',
    staticEquivalent:
      'The Markdown body of the directive, shown in print, without scripts and before the island loads.',
  });
}

interface IslandDocument {
  readonly html: string;
  readonly scriptHashes: readonly string[];
}

const SCRIPT_WITH_SOURCE =
  /<script\b([^>]*?)\ssrc\s*=\s*(["'])([^"']*)\2([^>]*)>\s*<\/script\s*>/giu;
const STYLESHEET_LINK = /<link\b[^>]*>/giu;
const RAW_TEXT_ELEMENT = /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/giu;
const RAW_TEXT_PLACEHOLDER = /\uE000island-raw-(\d+)\uE000/gu;
const REFERENCE_ATTRIBUTE = /\s(src|href|poster|srcset|action|data)\s*=\s*(["'])([^"']*)\2/giu;
const CSS_URL = /url\(\s*(["']?)([^"')]+)\1\s*\)/giu;
const EVENT_HANDLER = /<[a-z][^>]*\son[a-z]+\s*=/iu;

/** Тело `<script>` или `<style>` документа острова: разметочные правила его не читают и не меняют. */
interface RawText {
  readonly kind: 'script' | 'style';
  body: string;
  /** Стили из самого входа: их `url(...)` ещё не встроены. */
  readonly pendingCss: boolean;
}

/**
 * Документ острова: вход с ресурсами внутри. Скрипт с `src` становится встроенным, таблица стилей —
 * элементом `<style>`, картинки и шрифты — `data:`. Ссылка на то, чего нет в `assets`, и адрес в сети —
 * отказ: у острова нет сети, и сборка говорит об этом раньше, чем читатель увидит пустую рамку.
 *
 * Ссылки и обработчики событий ищутся только в разметке: тела `<script>` и `<style>` (и встроенных, и
 * вставленных из файлов) на это время подменены метками, иначе `innerHTML = '<img src="a.png">'` или
 * `const src = "x"` в коде острова читались бы как ссылки и переписывались.
 */
async function buildIslandDocument(island: IslandExtension): Promise<IslandDocument> {
  const entryDirectory = path.dirname(island.entry);
  const declared = new Set(island.assets);
  const raw: RawText[] = [];
  const hold = (text: RawText): string => `\uE000island-raw-${raw.push(text) - 1}\uE000`;
  let html = (await readFile(island.entry, 'utf8')).replace(
    RAW_TEXT_ELEMENT,
    (whole, tag: string, attributes: string, body: string) =>
      body.trim() === ''
        ? whole
        : `<${tag}${attributes}>${hold({
            kind: tag.toLowerCase() === 'style' ? 'style' : 'script',
            body,
            pendingCss: tag.toLowerCase() === 'style',
          })}</${tag}>`,
  );
  if (EVENT_HANDLER.test(html))
    throw islandError(
      island,
      'EXTENSION_ISLAND_INVALID',
      'The island entry uses an inline event handler attribute such as onclick; the island policy runs only its own scripts.',
      'Attach listeners from a script with addEventListener.',
    );
  const asset = async (reference: string): Promise<string> => {
    const resolved = path.resolve(entryDirectory, reference.split(/[?#]/u, 1)[0] ?? '');
    if (!declared.has(resolved))
      throw islandError(
        island,
        'EXTENSION_ISLAND_REFERENCE',
        `The island entry references ${reference}, which is not one of its declared assets.`,
        /^[a-z][a-z0-9+.-]*:/iu.test(reference)
          ? 'An island has no network: download the resource and list it in assets.'
          : 'List the file in the assets of the island manifest.',
      );
    return resolved;
  };
  for (const match of [...html.matchAll(SCRIPT_WITH_SOURCE)]) {
    const file = await asset(match[3] ?? '');
    const code = escapeScript(await readFile(file, 'utf8'));
    const type = /\stype\s*=\s*(["'])module\1/iu.test(`${match[1] ?? ''}${match[4] ?? ''}`)
      ? ' type="module"'
      : '';
    const held = hold({ kind: 'script', body: code, pendingCss: false });
    html = html.replace(match[0], () => `<script${type}>${held}</script>`);
  }
  for (const match of [...html.matchAll(STYLESHEET_LINK)]) {
    const tag = match[0];
    if (!/\srel\s*=\s*(["']?)stylesheet\1/iu.test(tag)) continue;
    const href = /\shref\s*=\s*(["'])([^"']*)\1/iu.exec(tag)?.[2];
    if (href === undefined) continue;
    const file = await asset(href);
    const css = await inlineCssUrls(
      await readFile(file, 'utf8'),
      path.dirname(file),
      island,
      declared,
    );
    const held = hold({
      kind: 'style',
      body: css.replace(/<\/style/giu, '<\\/style'),
      pendingCss: false,
    });
    html = html.replace(tag, () => `<style>${held}</style>`);
  }
  for (const text of raw)
    if (text.pendingCss)
      text.body = await inlineCssUrls(text.body, entryDirectory, island, declared);
  const references: Array<{ whole: string; attribute: string; quote: string; value: string }> = [];
  for (const match of html.matchAll(REFERENCE_ATTRIBUTE))
    references.push({
      whole: match[0],
      attribute: match[1] ?? '',
      quote: match[2] ?? '"',
      value: match[3] ?? '',
    });
  for (const reference of references) {
    const value = reference.value.trim();
    if (value === '' || value.startsWith('#') || /^data:/iu.test(value)) continue;
    const file = await asset(value);
    const url = await dataUrl(file);
    html = html.replace(
      reference.whole,
      () => ` ${reference.attribute}=${reference.quote}${url}${reference.quote}`,
    );
  }
  const scripts: string[] = [];
  html = html.replace(RAW_TEXT_PLACEHOLDER, (_whole, index: string) => {
    const text = raw[Number(index)];
    if (text === undefined) throw new Error(`Island raw text ${index} is missing.`);
    if (text.kind === 'script') scripts.push(text.body);
    return text.body;
  });
  const hashes = [ISLAND_BRIDGE, ...scripts].map(scriptHash);
  const policy = [
    "default-src 'none'",
    `script-src ${hashes.map((hash) => `'${hash}'`).join(' ')}`,
    "style-src 'unsafe-inline'",
    'img-src data:',
    'font-src data:',
    'media-src data:',
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  const head = `<meta http-equiv="Content-Security-Policy" content="${policy}"><script>${ISLAND_BRIDGE}</script>`;
  const headOpen = /<head\b[^>]*>/iu.exec(html);
  const assembled =
    headOpen === null
      ? `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${html}</body></html>`
      : html.replace(headOpen[0], () => `${headOpen[0]}${head}`);
  return { html: assembled, scriptHashes: hashes };
}

async function inlineCssUrls(
  css: string,
  directory: string,
  island: IslandExtension,
  declared: ReadonlySet<string>,
): Promise<string> {
  let result = css;
  for (const match of [...css.matchAll(CSS_URL)]) {
    const reference = (match[2] ?? '').trim();
    if (reference === '' || reference.startsWith('#') || /^data:/iu.test(reference)) continue;
    const resolved = path.resolve(directory, reference.split(/[?#]/u, 1)[0] ?? '');
    if (!declared.has(resolved))
      throw islandError(
        island,
        'EXTENSION_ISLAND_REFERENCE',
        `The island stylesheet references ${reference}, which is not one of its declared assets.`,
        'List the file in the assets of the island manifest; an island has no network.',
      );
    const url = await dataUrl(resolved);
    result = result.replace(match[0], () => `url("${url}")`);
  }
  return result;
}

async function dataUrl(file: string): Promise<string> {
  const mime = lookupMime(file) || 'application/octet-stream';
  return `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
}

function escapeScript(code: string): string {
  return code.replace(/<(\/script|!--)/giu, '\\x3C$1');
}

function scriptHash(code: string): string {
  return `sha256-${createHash('sha256').update(code).digest('base64')}`;
}

function islandError(
  island: IslandExtension,
  code: string,
  message: string,
  remediation: string,
): AgenticReportError {
  return new AgenticReportError({
    level: 'error',
    code,
    message: `Island ${island.name}: ${message}`,
    remediation,
    source: { file: island.entry },
    details: { extension: island.name },
  });
}
