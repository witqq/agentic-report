/**
 * Compares the computed style of two builds of the same pages: every element and its `::before` and
 * `::after`, in document order, at 390 and 1440 pixels in both schemes, under reduced motion and the
 * manual page clock. A page's stylesheet is assembled from the core and its features' stylesheets
 * (`docs/ARCHITECTURE.md`, «Page assets»), so a moved rule, a reordered feature or a rule that now loses to
 * one it used to follow shows here as a changed property.
 *
 *   node --experimental-strip-types scripts/compare-styles.ts <before-directory> <after-directory>
 *
 * Both directories hold single-file pages with the same names (`<name>.html`), built from the same sources
 * by two versions of the package. The run prints each page, width and scheme with the number of differing
 * elements and the first differences, and exits with 1 when any differs.
 *
 * The defect it catches: a stylesheet split or reorder that changes what a reader sees while every test
 * that asserts one property stays green.
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium, type Page } from '@playwright/test';

const [beforeDirectory, afterDirectory] = process.argv.slice(2);
if (beforeDirectory === undefined || afterDirectory === undefined) {
  throw new Error('Usage: compare-styles.ts <before-directory> <after-directory>');
}

interface Collected {
  readonly hashes: readonly string[];
  readonly errors: readonly string[];
}

/** Runs in the page: serializes every computed property; the stored text serves `describe` below. */
function collect(): readonly string[] {
  const probe = getComputedStyle(document.documentElement);
  const properties: string[] = [];
  for (let index = 0; index < probe.length; index += 1) properties.push(probe.item(index));
  properties.sort();
  // Lightning CSS writes `background: transparent` as `background: 0 0`: the position of no image.
  const normalize = (property: string, value: string): string =>
    property.startsWith('background-position') ? value.replace(/\b0px\b/gu, '0%') : value;
  const serialize = (style: CSSStyleDeclaration): string =>
    properties
      .map((property) => `${property}:${normalize(property, style.getPropertyValue(property))}`)
      .join(';');
  const hash = (text: string): string => {
    let value = 2166136261;
    for (let index = 0; index < text.length; index += 1)
      value = Math.imul(value ^ text.charCodeAt(index), 16777619);
    return (value >>> 0).toString(36);
  };
  const skipped = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'HEAD']);
  const elements = [...document.querySelectorAll('*')].filter(
    (element) => !skipped.has(element.tagName),
  );
  const data = elements.map((element) => [
    serialize(getComputedStyle(element)),
    serialize(getComputedStyle(element, '::before')),
    serialize(getComputedStyle(element, '::after')),
  ]);
  Reflect.set(window, '__compareStyles', { elements, data });
  return data.map((triple) => triple.map(hash).join('.'));
}

/** Runs in the page: a short path of the element and its serialized styles. */
function describe(index: number): { readonly path: string; readonly data: readonly string[] } {
  const stored = Reflect.get(window, '__compareStyles') as {
    readonly elements: readonly Element[];
    readonly data: readonly (readonly string[])[];
  };
  const parts: string[] = [];
  for (
    let element: Element | null = stored.elements[index] ?? null;
    element !== null && element !== document.documentElement;
    element = element.parentElement
  ) {
    const classes = [...element.classList].slice(0, 2).join('.');
    parts.unshift(
      `${element.tagName.toLowerCase()}${element.id === '' ? (classes === '' ? '' : `.${classes}`) : `#${element.id}`}`,
    );
  }
  return { path: parts.slice(-4).join(' > '), data: stored.data[index] ?? [] };
}

async function open(page: Page, file: string): Promise<Collected> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const clock = Reflect.get(window, '__clock') as { seek(seconds: number): void } | undefined;
    clock?.seek(11);
  });
  return { hashes: await page.evaluate(collect), errors };
}

const names = (await readdir(beforeDirectory)).filter((name) => name.endsWith('.html')).sort();
const browser = await chromium.launch();
let failed = false;
for (const name of names) {
  for (const width of [390, 1440]) {
    for (const scheme of ['light', 'dark'] as const) {
      const pages: { readonly page: Page; readonly collected: Collected }[] = [];
      for (const directory of [beforeDirectory, afterDirectory]) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          colorScheme: scheme,
          reducedMotion: 'reduce',
        });
        await context.addInitScript(() => {
          Reflect.set(window, '__agenticReportClock', 'manual');
        });
        const page = await context.newPage();
        pages.push({ page, collected: await open(page, path.resolve(directory, name)) });
      }
      const [before, after] = pages;
      if (before === undefined || after === undefined) throw new Error('Two pages expected.');
      const differing: number[] = [];
      const count = Math.max(before.collected.hashes.length, after.collected.hashes.length);
      for (let index = 0; index < count; index += 1)
        if (before.collected.hashes[index] !== after.collected.hashes[index]) differing.push(index);
      const errorsDiffer = before.collected.errors.join('\n') !== after.collected.errors.join('\n');
      console.log(`${name} ${width} ${scheme}: ${differing.length} differing elements`);
      if (errorsDiffer)
        console.log(
          `  errors ${JSON.stringify(before.collected.errors)} → ${JSON.stringify(after.collected.errors)}`,
        );
      for (const index of differing.slice(0, 8)) {
        const left = await before.page.evaluate(describe, index);
        const right = await after.page.evaluate(describe, index);
        console.log(`  ${left.path}`);
        left.data.forEach((serialized, slot) => {
          const was = serialized.split(';');
          const now = (right.data[slot] ?? '').split(';');
          was.forEach((declaration, at) => {
            if (declaration !== now[at])
              console.log(
                `    ${['', '::before', '::after'][slot]}${declaration} → ${now[at] ?? ''}`,
              );
          });
        });
      }
      if (differing.length > 0 || errorsDiffer) failed = true;
      for (const { page } of pages) await page.context().close();
    }
  }
}
await browser.close();
process.exitCode = failed ? 1 : 0;
