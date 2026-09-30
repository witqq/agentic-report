/**
 * The dark variant of a Markdown image: `![alt](shot.png){dark="shot-dark.png"}`.
 *
 * Markdown gives an image no attributes, so the package reads one attribute block written directly after
 * it, in the same `name="value"` form as directive attributes. The only attribute is `dark`: a confined
 * local image the page shows instead while its colour scheme is dark. The phase runs right after parsing,
 * before any directive is read, so `compare`, `spotlight` and section media see an ordinary image. The
 * asset phase embeds or copies the dark file like the image itself, and the runtime
 * (`src/browser/scheme-media.ts`) shows the variant that matches the scheme around the image.
 *
 * Braces that do not read as attributes stay text. An attribute block with another name, with an empty
 * `dark`, or that opens `name="` and does not close in the same text, fails the build at its line.
 */

import type { Image, Root as MdastRoot, RootContent, Text } from 'mdast';
import type { Plugin } from 'unified';

import type { SourceMapSegment } from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import { resolveSourceLocation } from '../source/source-map.js';

/** Attribute of an image that names its dark variant, and the hast property that carries it. */
export const IMAGE_DARK_ATTRIBUTE = 'dark';
export const IMAGE_DARK_PROPERTY = 'dataDarkSrc';

export interface ImageVariantOptions {
  readonly sourceMap: readonly SourceMapSegment[];
  /** Refusals of the phase; the directive phase reports them together with its own. */
  readonly violations: AgenticReportError[];
}

/** `{name="value" …}` at the very start of the text after an image. */
const ATTRIBUTE_BLOCK = /^\{((?:\s*[A-Za-z][A-Za-z0-9-]*="[^"]*")+)\s*\}/u;
const OPENED_ATTRIBUTE = /^\{\s*[A-Za-z][A-Za-z0-9-]*="/u;
const ATTRIBUTE = /([A-Za-z][A-Za-z0-9-]*)="([^"]*)"/gu;

interface ParentNode {
  children: RootContent[];
}

export const remarkImageVariants: Plugin<[ImageVariantOptions], MdastRoot> =
  (options) => (tree) => {
    visitParents(tree as unknown as ParentNode, options);
  };

function visitParents(parent: ParentNode, options: ImageVariantOptions): void {
  for (let index = 0; index < parent.children.length; index += 1) {
    const child = parent.children[index];
    if (child === undefined) continue;
    if (child.type === 'image') {
      const next = parent.children[index + 1];
      if (next?.type === 'text') readAttributes(child, next, parent, index + 1, options);
      continue;
    }
    if ('children' in child && Array.isArray(child.children))
      visitParents(child as unknown as ParentNode, options);
  }
}

function readAttributes(
  image: Image,
  text: Text,
  parent: ParentNode,
  textIndex: number,
  options: ImageVariantOptions,
): void {
  const block = ATTRIBUTE_BLOCK.exec(text.value);
  if (block === null) {
    // An opened attribute that does not close in this text: a web address inside it became a link.
    if (OPENED_ATTRIBUTE.test(text.value))
      options.violations.push(
        located(
          image,
          options,
          'INVALID_IMAGE_DARK_VARIANT',
          'The attribute block after the image does not read as name="value" pairs; a web address is not a dark variant.',
          'Write {dark="file"} with a relative path to a local image next to the page source.',
          { image: image.url },
        ),
      );
    return;
  }
  const attributes = [...(block[1] ?? '').matchAll(ATTRIBUTE)].map(
    ([, name, value]) => [name ?? '', value ?? ''] as const,
  );
  const unknown = attributes.filter(([name]) => name !== IMAGE_DARK_ATTRIBUTE);
  const dark = attributes.find(([name]) => name === IMAGE_DARK_ATTRIBUTE)?.[1].trim();
  if (unknown.length > 0) {
    options.violations.push(
      located(
        image,
        options,
        'IMAGE_ATTRIBUTE_UNKNOWN',
        `An image takes one attribute, dark; this one also has ${unknown.map(([name]) => name).join(', ')}.`,
        'Write only {dark="file"} after the image; framing and fit belong to the section (media-fit, media-aspect, focal).',
        { attributes: unknown.map(([name]) => name) },
      ),
    );
  } else if (dark === undefined || dark === '') {
    options.violations.push(
      located(
        image,
        options,
        'IMAGE_DARK_VARIANT_EMPTY',
        'The dark variant of an image names no file.',
        'Name the local image the page shows in the dark scheme: {dark="shot-dark.png"}, or remove the attribute block.',
        { image: image.url },
      ),
    );
  } else {
    image.data = {
      ...image.data,
      hProperties: { ...image.data?.hProperties, [IMAGE_DARK_PROPERTY]: dark },
    };
  }
  const rest = text.value.slice(block[0].length);
  if (rest === '') parent.children.splice(textIndex, 1);
  else text.value = rest;
}

function located(
  node: Image,
  options: ImageVariantOptions,
  code: string,
  message: string,
  remediation: string,
  details: Readonly<Record<string, unknown>>,
): AgenticReportError {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  const source =
    start === undefined || end === undefined
      ? undefined
      : resolveSourceLocation(options.sourceMap, start, end);
  return new AgenticReportError({
    level: 'error',
    code,
    message,
    remediation,
    ...(source === undefined ? {} : { source }),
    details,
  });
}
