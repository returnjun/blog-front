import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

// Run against the real site with Playwright installed, using a fresh browser profile.
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = name => fileURLToPath(new URL(name, import.meta.url));
let server;
let browser;
try {
  let base = process.env.BLOG_PREVIEW_URL;
  if (!base) {
    server = spawn(process.execPath, ['server.mjs'], {
      cwd: root, env: { ...process.env, HOST: '127.0.0.1', PORT: '0' },
      windowsHide: true, stdio: ['ignore', 'pipe', 'inherit']
    });
    const lines = createInterface({ input: server.stdout });
    const [banner] = await once(lines, 'line', { signal: AbortSignal.timeout(6000) });
    base = banner.match(/http:\/\/127\.0\.0\.1:\d+\//)[0];
    lines.close();
  }
  browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1320, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  const errors = [];
  const dataRequests = [];
  const dataResponses = [];
  const images = [];
  page.on('pageerror', e => errors.push(e.name));
  function dataService(url) {
    const { hostname, pathname } = new URL(url);
    if (hostname === 'get.geojs.io' || hostname === 'api.open-meteo.com') return hostname;
    if (pathname.startsWith('/api/')) return pathname;
  }
  page.on('request', r => {
    const service = dataService(r.url());
    if (service) dataRequests.push(service);
    const { pathname } = new URL(r.url());
    if (pathname.startsWith('/assets/kasukabe')) images.push(pathname);
  });
  page.on('response', r => {
    const service = dataService(r.url());
    if (service) dataResponses.push(service + ' ' + r.status());
  });
  async function expectSeason(tab, season) {
    await tab.waitForFunction(s => document.documentElement.dataset.season === s, season);
    assert.ok(await tab.getByRole('radio', { name: season === 'snow' ? '雪天' : '晴天', exact: true }).isChecked());
  }
  async function expectHero(file) {
    const actual = await page.locator('.hero-art').evaluate(async el => {
      const image = new Image();
      image.src = getComputedStyle(el).backgroundImage.slice(5, -2);
      await image.decode();
      return [new URL(image.src).pathname, image.naturalWidth, image.naturalHeight];
    });
    assert.deepEqual(actual, ['/assets/' + file, 2172, 724]);
  }
  const shot = name => page.screenshot({ path: output(name), type: 'jpeg', quality: 91,
    clip: { x: 0, y: 0, width: 1320, height: 632 } });

  await page.goto(base);
  await expectSeason(page, 'sun');
  await expectHero('kasukabe.webp');
  await page.waitForSelector('.letter-list[aria-busy="false"]', { timeout: 35000 });
  await page.waitForSelector('.wc-refresh:enabled', { timeout: 28000 });
  const weather = page.locator('.wc-body');
  const reading = await weather.innerText();
  const beforeSwitch = dataRequests.length;
  await shot('season-sun.jpg');
  await page.getByRole('radio', { name: '雪天', exact: true }).check();
  await expectSeason(page, 'snow');
  await expectHero('kasukabe-snow.webp');
  assert.equal(await weather.innerText(), reading);
  assert.equal(dataRequests.length, beforeSwitch);
  console.log('Theme change issued zero data requests. Live reading visible:', Boolean(reading.trim()), dataResponses);
  await shot('season-snow.jpg');

  for (const width of [280, 300, 320, 360, 390, 520, 700, 701, 730, 768, 900, 1024, 1320]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const brand = box('.brand'), nav = box('.site-nav'), actions = box('.visitor-actions');
      return { width: innerWidth, scroll: document.documentElement.scrollWidth, right: actions.right,
        overlap: brand.right > actions.left + 1 || (nav.top < actions.bottom - 1 &&
          nav.bottom > actions.top + 1 && nav.right > actions.left + 1) };
    });
    assert.ok(layout.scroll <= width + 1 && layout.right <= width + 1 && !layout.overlap, JSON.stringify(layout));
    if (width === 390) await page.screenshot({ path: output('season-snow-mobile.jpg'), type: 'jpeg', quality: 91,
      clip: { x: 0, y: 0, width: 390, height: 637 } });
  }
  await page.getByRole('radio', { name: '雪天', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expectSeason(page, 'sun');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('ArrowRight');
  await expectSeason(page, 'snow');
  assert.equal(await page.locator('.hero-picture').evaluate(el => getComputedStyle(el, '::before').animationName), 'none');
  const beforeReload = images.length;
  await page.reload();
  await expectSeason(page, 'snow');
  await expectHero('kasukabe-snow.webp');
  assert.ok(!images.slice(beforeReload).includes('/assets/kasukabe.webp'));
  await page.locator('.site-nav a[href="/articles"]').click();
  await page.locator('.cat-page').waitFor();
  await expectSeason(page, 'snow');
  await page.getByRole('button', { name: '搜索文章' }).click();
  await page.locator('#search-keyword').fill('春日部');

  const studio = await context.newPage();
  await studio.goto(new URL('/admin/', base).href);
  await expectSeason(studio, 'snow');
  await studio.getByRole('radio', { name: '晴天', exact: true }).check();
  await expectSeason(page, 'sun');
  assert.equal(await page.locator('#search-keyword').inputValue(), '春日部');
  await page.getByRole('button', { name: '关闭搜索' }).click();
  await page.locator('#search-dialog').waitFor({ state: 'hidden' });
  await page.getByRole('radio', { name: '雪天', exact: true }).check();
  await expectSeason(studio, 'snow');
  await studio.reload();
  await expectSeason(studio, 'snow');
  await studio.setViewportSize({ width: 320, height: 720 });
  assert.ok(await studio.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  if (await studio.locator('#signin').isVisible()) {
    await studio.getByLabel('站主账号').fill('theme-preview');
    await studio.getByRole('radio', { name: '晴天', exact: true }).check();
    assert.equal(await studio.getByLabel('站主账号').inputValue(), 'theme-preview');
  }
  assert.deepEqual(errors, []);
  console.log('Passed 13 widths, keyboard, reduced motion, refresh, search, navigation and studio cross-tab checks.');
} finally {
  await browser?.close();
  server?.kill();
}
