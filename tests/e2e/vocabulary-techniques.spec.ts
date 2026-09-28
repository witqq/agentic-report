import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Locator, Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/**
 * Приёмы словаря в собранной странице: проигрываемая сцена `demo` по времени и по прокрутке, выбор
 * сценария вкладками, `:swap`, `:typing`, `:mark`, `spotlight`, рамка браузера, печать лога, начало петли и
 * «Развернуть» у клипа, вертикальные вкладки, липкое оглавление лендинга и подписи по краям экрана.
 * Движение проверяется по ручным часам страницы: один и тот же момент `seek(t)` даёт одно состояние.
 */
async function buildTechniquesPage(project: string): Promise<string> {
  const root = path.resolve('test-results/e2e-vocabulary-techniques', project);
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, 'source'), { recursive: true });
  await cp(path.resolve('examples/presentation/assets'), path.join(root, 'source'), {
    recursive: true,
  });
  const scene = (title: string, first: string) =>
    [
      `:::::::demo{title="${title}" play="time" seconds="2"}`,
      '::::::diagram{title="Pipeline" description="Build, then test, then ship."}',
      '::node{id="build" label="Build"}',
      '::node{id="test" label="Test"}',
      '::node{id="ship" label="Ship"}',
      '::edge{from="build" to="test"}',
      '::edge{from="test" to="ship"}',
      '::::::',
      '',
      `:::beat{title="${first}" focus="build"}`,
      'The bundle is written in 4 seconds.',
      ':::',
      '',
      ':::beat{title="Test" focus="test"}',
      '312 checks pass.',
      ':::',
      '',
      ':::beat{title="Ship" focus="ship"}',
      'The page is live.',
      ':::',
      ':::::::',
    ].join('\n');
  await writeFile(
    path.join(root, 'source', 'report.md'),
    [
      '---',
      'title: Techniques',
      'language: en',
      'layout: landing',
      'theme:',
      '  extends: neutral',
      '  chrome:',
      '    edges: mono',
      '---',
      '',
      '# Techniques',
      '',
      'Reviews become :swap[faster]{words="calmer, exact"} with a plan.',
      '',
      '::contents{sticky="true"}',
      '',
      '::::::::section{title="Played" id="played"}',
      scene('One deploy, played', 'Build'),
      '::::::::',
      '',
      '::::::::section{title="Scenarios" id="scenarios"}',
      '::::::::tabs{title="Scenario" orientation="vertical"}',
      ':::::::tab{label="First run"}',
      'The first run.',
      ':::::::',
      ':::::::tab{label="A change"}',
      scene('A change, played', 'Rebuild'),
      ':::::::',
      '::::::::',
      '::::::::',
      '',
      '::::::::section{title="Scrolled" id="scrolled"}',
      ':::::::demo{title="Scroll scene" play="scroll"}',
      '```text',
      '$ agentic-report build page',
      '```',
      '',
      ':::beat{title="One"}',
      'First.',
      ':::',
      '',
      ':::beat{title="Two"}',
      'Second.',
      ':::',
      '',
      ':::beat{title="Three"}',
      'Third.',
      ':::',
      ':::::::',
      '::::::::',
      '',
      '::::section{title="Marked" id="marked"}',
      'Run :typing[agentic-report build page] and the run returns :mark[three times]{shape="circle" seed="7"}.',
      '',
      ':::spotlight{title="The switch" x="72" y="38" zoom="2.5"}',
      '![The product screen](demo.poster.jpg)',
      '',
      'The switch turns the build cache on for every branch.',
      ':::',
      '::::',
      '',
      '::::section{title="Framed" id="framed" frame="browser" address="https://example.com/pricing"}',
      '![The pricing page as it is live](demo.poster.jpg)',
      '::::',
      '',
      '::::section{title="Log" id="log" transition="log"}',
      '```text',
      '$ npm install',
      'added 12 packages',
      'audited 13 packages',
      'found 0 vulnerabilities',
      '```',
      '::::',
      '',
      '::::section{title="Clip" id="clip"}',
      '::video{src="demo.vp9.webm" poster="demo.poster.jpg" caption="The run." start="2" seam="fade" expand="true"}',
      '::::',
      '',
    ].join('\n'),
  );
  const output = path.join(root, 'page.html');
  await buildReport({ input: path.join(root, 'source'), output });
  return pathToFileURL(output).href;
}

let url: string | undefined;
async function pageUrl(project: string): Promise<string> {
  url ??= await buildTechniquesPage(project);
  return url;
}

async function openManual(page: Page, target: string): Promise<void> {
  await page.addInitScript(() => {
    window.__agenticReportClock = 'manual';
  });
  await page.goto(target);
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

async function seek(page: Page, seconds: number): Promise<void> {
  await page.evaluate((t) => window.__clock?.seek(t), seconds);
}

async function scrollTo(page: Page, selector: string): Promise<void> {
  await page
    .locator(selector)
    .first()
    .evaluate((element) => {
      element.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
}

const beatStates = (demo: Locator) =>
  demo
    .locator('[data-demo-beat]')
    .evaluateAll((beats) => beats.map((beat) => (beat as HTMLElement).dataset.demoState ?? ''));

test.describe('vocabulary techniques', () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(browserName !== 'chromium' || testInfo.project.name !== 'desktop-chromium');
  });

  test('a timed demo plays its beats by the page clock, pauses, and ends on its final frame', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openManual(page, await pageUrl(testInfo.project.name));
    const demo = page.locator('#played [data-demo-scene]');
    const toggle = demo.locator('[data-demo-toggle]');
    // Ловит: сцена без рантайма — статичный список, и воспроизведение ничего не доказывало бы.
    await expect(demo).toHaveAttribute('data-demo-live', '');
    await expect(demo.locator('[data-demo-controls]')).toBeVisible();
    await scrollTo(page, '#played [data-demo-scene]');
    await expect(demo).toHaveAttribute('data-demo-state', 'playing');

    await seek(page, 0.5);
    expect(await beatStates(demo)).toEqual(['current', 'next', 'next']);
    // Ловит: такт не зажигает свой узел схемы.
    await expect(demo.locator('[data-node-id="build"][data-lit]').first()).toBeAttached();
    await expect(demo.locator('[data-node-id="test"][data-lit]')).toHaveCount(0);

    await seek(page, 2.5);
    expect(await beatStates(demo)).toEqual(['passed', 'current', 'next']);
    await expect(demo.locator('[data-demo-position]')).toHaveText('2 / 3');
    // Ловит: такт, который ещё не наступил, виден — сцена не играет, а стоит целиком.
    await expect(demo.locator('[data-demo-beat="2"]')).toHaveCSS('opacity', '0');

    // Пауза держит момент: часы идут, такт стоит.
    await toggle.click();
    await expect(demo).toHaveAttribute('data-demo-state', 'paused');
    await seek(page, 5.5);
    expect(await beatStates(demo)).toEqual(['passed', 'current', 'next']);
    await toggle.click();
    await expect(demo).toHaveAttribute('data-demo-state', 'playing');
    await seek(page, 7);
    expect(await beatStates(demo)).toEqual(['passed', 'passed', 'current']);

    // Ловит: сцена крутится без конца, а не встаёт на конечный кадр с кнопкой «ещё раз».
    await seek(page, 30);
    await expect(demo).toHaveAttribute('data-demo-state', 'ended');
    expect(await beatStates(demo)).toEqual(['passed', 'passed', 'current']);
    await expect(toggle).toHaveText('Play again');
    // Одинаковый момент — одинаковое состояние и после перемотки назад: состояние — функция часов.
    await seek(page, 31);
    expect(await beatStates(demo)).toEqual(['passed', 'passed', 'current']);
  });

  test('a scenario chosen by tabs plays from its start, and the tab list stands beside it', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openManual(page, await pageUrl(testInfo.project.name));
    const tabs = page.locator('#scenarios > [data-tabs]');
    const list = tabs.locator(':scope > [role="tablist"]');
    const second = tabs.locator('[data-demo-scene]');
    await scrollTo(page, '#scenarios > [data-tabs]');
    // Ловит: сцена в закрытой вкладке играет невидимой и к открытию уже кончилась.
    await expect(second).toHaveAttribute('data-demo-state', 'waiting');
    await expect(list).toHaveAttribute('aria-orientation', 'vertical');
    const listBox = await list.boundingBox();
    const firstPanel = await tabs.locator(':scope > [data-tab-panel]').first().boundingBox();
    // Ловит: «вертикальные» вкладки остались строкой над панелью.
    expect(
      listBox !== null && firstPanel !== null && listBox.x + listBox.width <= firstPanel.x,
    ).toBe(true);
    await tabs.getByRole('tab', { name: 'First run' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(tabs.getByRole('tab', { name: 'A change' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await scrollTo(page, '#scenarios [data-demo-scene]');
    await expect(second).toHaveAttribute('data-demo-state', 'playing');
    await seek(page, 0.2);
    expect(await beatStates(second)).toEqual(['current', 'next', 'next']);

    await page.setViewportSize({ width: 700, height: 900 });
    // На узком экране список возвращается над панелью и перестаёт быть вертикальным.
    await expect(list).not.toHaveAttribute('aria-orientation', 'vertical');
  });

  test('a scroll demo is pinned while its beats pass, and a recording sets its progress', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openManual(page, await pageUrl(testInfo.project.name));
    const demo = page.locator('#scrolled [data-demo-scene]');
    await expect(demo.locator('[data-demo-frame]')).toHaveCSS('position', 'sticky');
    await demo.evaluate((element) => element.setAttribute('data-clock-progress', '0.1'));
    await seek(page, 1);
    expect(await beatStates(demo)).toEqual(['current', 'next', 'next']);
    await demo.evaluate((element) => element.setAttribute('data-clock-progress', '0.8'));
    await seek(page, 1);
    // Ловит: прогресс сцены по прокрутке нельзя выставить записью, и кадр ролика зависел бы от прокрутки.
    expect(await beatStates(demo)).toEqual(['passed', 'passed', 'current']);
  });

  test('swap and typing keep their width while they move, with the whole text in the page', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openManual(page, await pageUrl(testInfo.project.name));
    const swap = page.locator('.semantic-swap');
    const current = () => swap.locator('[data-current]').textContent();
    await expect(swap).toHaveAttribute('data-swap-live', '');
    await seek(page, 0.1);
    const before = await swap.boundingBox();
    expect(await current()).toBe('faster');
    await seek(page, 1.4);
    expect(await current()).toBe('calmer');
    // Ловит: ширина идёт за словом, и строка вокруг дёргается.
    expect((await swap.boundingBox())?.width).toBe(before?.width);
    await seek(page, 10);
    // Ловит: замена крутится бесконечно, а не возвращается к написанному слову.
    expect(await current()).toBe('faster');

    const typing = page.locator('.semantic-typing');
    await scrollTo(page, '.semantic-typing');
    await expect(typing).toHaveAttribute('data-typing-live', 'typing');
    const start = await page.evaluate(() => window.__clock?.now() ?? 0);
    await seek(page, start / 1000 + 0.2);
    const partial = await typing.evaluate((element) =>
      Number.parseFloat(element.style.getPropertyValue('--typing-shown')),
    );
    const full = await typing.evaluate((element) => element.getBoundingClientRect().width);
    const typingBox = await typing.boundingBox();
    // Ловит: строка набирается вставкой символов, а не открытием уже стоящей строки.
    await expect(typing).toHaveText('agentic-report build page');
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(full);
    await seek(page, start / 1000 + 5);
    await expect(typing).toHaveAttribute('data-typing-done', '');
    expect(await typing.boundingBox()).toEqual(typingBox);
  });

  test('a mark is drawn when it comes into view and a spotlight moves in on its detail', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openManual(page, await pageUrl(testInfo.project.name));
    const mark = page.locator('.semantic-mark');
    const spotlight = page.locator('.semantic-spotlight');
    // Ловит: пометка и лупа рисуются заранее, и появления на экране нет.
    await expect(mark).toHaveAttribute('data-mark-pending', '');
    await expect(spotlight).toHaveAttribute('data-spotlight-pending', '');
    await scrollTo(page, '.semantic-mark');
    await expect(mark).not.toHaveAttribute('data-mark-pending', '');
    await scrollTo(page, '.semantic-spotlight');
    await expect(spotlight).not.toHaveAttribute('data-spotlight-pending', '');
    await seek(page, 5);
    await expect(mark.locator('path')).toHaveCSS('stroke-dashoffset', '0px');
    await expect(spotlight.locator('.spotlight-ring')).toHaveCSS('opacity', '1');
    // Копия картинки в лупе скрыта от чтеца: картинку называет оригинал.
    await expect(spotlight.locator('.spotlight-loupe')).toHaveAttribute('aria-hidden', 'true');
    await expect(spotlight.getByRole('img')).toHaveCount(1);
    await expect(spotlight.locator('figcaption')).toContainText('build cache');
  });

  test('a code block of a log section prints line by line with its whole text in the page', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openManual(page, await pageUrl(testInfo.project.name));
    const pre = page.locator('#log pre');
    const shown = () =>
      pre.evaluate((element) => Number(element.style.getPropertyValue('--log-shown')));
    const height = (await pre.boundingBox())?.height;
    await expect(pre).toHaveAttribute('data-log-live', '');
    expect(await shown()).toBe(0);
    await scrollTo(page, '#log pre');
    await expect.poll(shown).toBe(1);
    const start = await page.evaluate(() => window.__clock?.now() ?? 0);
    await seek(page, start / 1000 + 0.3);
    // Ловит: лог появляется целиком сразу или строки печатаются вставкой, меняя высоту блока.
    expect(await shown()).toBeGreaterThan(1);
    expect(await shown()).toBeLessThan(4);
    expect((await pre.boundingBox())?.height).toBe(height);
    await expect(pre.locator('code')).toContainText('found 0 vulnerabilities');
    await seek(page, start / 1000 + 5);
    await expect(pre).toHaveAttribute('data-log-done', '');
  });

  test('a clip starts at its offset, loops there, and expands into a dialog with sound', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(await pageUrl(testInfo.project.name));
    const video = page.locator('#clip video');
    await scrollTo(page, '#clip video');
    // Ловит: встроенная петля вернула бы ролик к нулю, а не к началу петли.
    await expect(video).not.toHaveAttribute('loop', '');
    await expect
      .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
      .toBeGreaterThanOrEqual(2);
    await page.locator('#clip [data-video-expand]').click();
    const dialog = page.locator('dialog[data-video-expand-dialog]');
    await expect(dialog).toBeVisible();
    const player = dialog.locator('video');
    expect(
      await player.evaluate((element: HTMLVideoElement) => [element.controls, element.muted]),
    ).toEqual([true, false]);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('#clip [data-video-expand]')).toBeFocused();
  });

  test('a browser frame shows the real address, and the landing holds its numbered chapters and edge captions', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openManual(page, await pageUrl(testInfo.project.name));
    await expect(page.locator('#framed .browser-frame-address')).toHaveText(
      'https://example.com/pricing',
    );
    const nav = page.locator('nav[data-sticky="true"]');
    await expect(nav).toHaveCSS('position', 'fixed');
    await scrollTo(page, '#framed .browser-frame');
    await seek(page, 1);
    await expect(nav.locator('a[aria-current]')).toHaveText('Framed');
    // Ловит: колонка оглавления наезжает на текст статьи.
    const navBox = await nav.boundingBox();
    const heading = await page.locator('#framed > h2').boundingBox();
    expect(navBox !== null && heading !== null && navBox.x + navBox.width <= heading.x).toBe(true);
    const end = page.locator('.edge-caption[data-edge-caption="end"]');
    await expect(end).toBeVisible();
    await expect(end).toContainText('Framed');
    await expect(page.locator('.edge-caption[data-edge-caption="start"]')).toHaveText('Techniques');
  });

  test('under reduced motion every technique is its final frame', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(await pageUrl(testInfo.project.name));
    const demo = page.locator('#played [data-demo-scene]');
    await expect(demo).not.toHaveAttribute('data-demo-live', '');
    await expect(demo.locator('[data-demo-controls]')).toBeHidden();
    for (const beat of await demo.locator('[data-demo-beat]').all())
      await expect(beat).toHaveCSS('opacity', '1');
    await expect(page.locator('.semantic-swap')).not.toHaveAttribute('data-swap-live', '');
    // Без движения видно только написанное слово; остальные скрыты и от чтеца.
    await expect(page.locator('.semantic-swap')).toHaveText('faster', { useInnerText: true });
    await expect(page.locator('.semantic-typing')).not.toHaveAttribute('data-typing-live', '');
    await expect(page.locator('.semantic-mark')).not.toHaveAttribute('data-mark-pending', '');
    await expect(page.locator('.semantic-spotlight .spotlight-ring')).toHaveCSS('opacity', '1');
    await expect(page.locator('#log pre')).not.toHaveAttribute('data-log-live', '');
  });
});
