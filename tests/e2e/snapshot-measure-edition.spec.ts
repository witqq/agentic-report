import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { MEASURE_OPTIONS, measureInPage } from '../../dist/node/core/snapshot-measure.js';
import { expect, test } from './fixtures.js';

test('edition markers do not define prose width and real overruns remain detectable', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 900 });
  const prose =
    'Ordinary prose fills the declared reading column without exceeding its edge. '.repeat(8);
  const markers = Array.from(
    { length: 8 },
    () =>
      '<p class="edition-ghost edition-ghost-moved">Moved to another chapter of this document for a clearer reading order.</p>',
  ).join('\n');
  const html = `<!doctype html><html lang="en"><head><style>
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #111; background: #fff; }
main { width: 720px; margin: 0 auto; }
p { width: 720px; }
.edition-ghost { width: 620px; font-size: 14px; }
</style></head><body><main><article><h1>Column measurement</h1>
${markers}<p>${prose}</p><p>${prose}</p>
<section class="semantic-section" id="content"><h2>Reading column</h2>
${markers}<p>${prose}</p><p>${prose}</p>
</section></article></main></body></html>`;
  const filename = testInfo.outputPath('edition-column.html');
  await writeFile(filename, html);
  await page.goto(pathToFileURL(filename).href);
  const clean = await page.evaluate(measureInPage, MEASURE_OPTIONS);
  expect(clean.readingColumn.width).toBe(720);
  expect(clean.sectionColumns.count).toBe(0);

  await page.locator('#content').evaluate((section, text) => {
    const paragraph = document.createElement('p');
    paragraph.id = 'real-overrun';
    paragraph.style.width = '900px';
    paragraph.textContent = text;
    section.append(paragraph);
  }, prose);
  const proseOverrun = await page.evaluate(measureInPage, MEASURE_OPTIONS);
  expect(proseOverrun.sectionColumns.samples).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ element: 'p#real-overrun', kind: 'overrun' }),
    ]),
  );

  await page.locator('#real-overrun').evaluate((paragraph) => {
    paragraph.setAttribute('class', 'edition-ghost edition-ghost-moved');
  });
  const markerOverrun = await page.evaluate(measureInPage, MEASURE_OPTIONS);
  expect(markerOverrun.sectionColumns.samples).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        element: 'p#real-overrun.edition-ghost.edition-ghost-moved',
        kind: 'overrun',
      }),
    ]),
  );
});
