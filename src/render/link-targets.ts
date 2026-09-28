import type { Element, Root } from 'hast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

import type { SourceMapSegment } from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import { resolveSourceLocation } from '../source/source-map.js';

/**
 * Ссылка, которая никуда не ведёт, — ошибка сборки, а не молчаливая мёртвая ссылка на странице.
 *
 * Проверяется то, что видит читатель после сборки: пустой адрес (`[текст]()`), якорь на идентификатор,
 * которого на странице нет, и номер `tel:`/`sms:` не по правилам действий. Идентификаторы берутся из
 * собранного дерева — заголовков, секций и блоков, — поэтому якорь на любой из них проходит.
 */
const TEL = /^tel:\+?[0-9][0-9().-]{0,31}$/u;
const SMS = /^sms:\+?[0-9][0-9().,-]{0,63}(?:\?body=[^\s<>]*)?$/u;

export interface LinkTargetOptions {
  readonly sourceMap: readonly SourceMapSegment[];
}

export const rehypeLinkTargets: Plugin<[LinkTargetOptions], Root> = (options) => (tree) => {
  const ids = new Set<string>();
  visit(tree, 'element', (node: Element) => {
    const id = node.properties.id;
    if (typeof id === 'string' && id !== '') ids.add(id);
  });
  visit(tree, 'element', (node: Element) => {
    if (node.tagName !== 'a') return;
    const href = node.properties.href;
    if (href === undefined || href === null) return;
    const target = String(href);
    if (target.trim() === '') throw linkError(node, options, 'EMPTY_LINK_TARGET', target);
    if (target.startsWith('#') && !ids.has(decodeURIComponent(target.slice(1))))
      throw linkError(node, options, 'MISSING_ANCHOR_TARGET', target);
    if (/^tel:/iu.test(target) && !TEL.test(target))
      throw linkError(node, options, 'INVALID_LINK_TARGET', target);
    if (/^sms:/iu.test(target) && !SMS.test(target))
      throw linkError(node, options, 'INVALID_LINK_TARGET', target);
  });
};

function linkError(
  node: Element,
  options: LinkTargetOptions,
  code: 'EMPTY_LINK_TARGET' | 'MISSING_ANCHOR_TARGET' | 'INVALID_LINK_TARGET',
  target: string,
): AgenticReportError {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  const source =
    start === undefined ? undefined : resolveSourceLocation(options.sourceMap, start, end ?? start);
  const text = {
    EMPTY_LINK_TARGET: {
      message: 'A link has an empty target, so it leads nowhere.',
      remediation:
        'Give the link a target — #section-id, a relative path, or a URL — or remove the link.',
    },
    MISSING_ANCHOR_TARGET: {
      message: `A link points to ${target}, but no element on the page has that id.`,
      remediation:
        'Use the id of a section, heading, or block on this page (the heading text in lower case with hyphens), or add id="…" to the target.',
    },
    INVALID_LINK_TARGET: {
      message: `A phone or text-message link is not a number the reader's device can dial: ${target}`,
      remediation: 'Use tel:+15551234567 or sms:+15551234567 with an optional ?body=text.',
    },
  }[code];
  return new AgenticReportError({
    level: 'error',
    code,
    ...text,
    ...(source === undefined ? {} : { source }),
    details: { target },
  });
}
