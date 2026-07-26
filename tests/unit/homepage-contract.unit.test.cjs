const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { once } = require('node:events');
const { chromium } = require('@playwright/test');
const { createStaticServer } = require('../../tools/serve.cjs');

const root = path.resolve(__dirname, '../..');

test('homepage presents the story game and removes the old repair theme', async (t) => {
  const server = createStaticServer({ rootDir: root });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());

  const browser = await chromium.launch({ channel: 'msedge' });
  t.after(() => browser.close());

  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  t.after(() => page.close());

  const requestedUrls = [];
  const heroResponses = [];
  page.on('request', (request) => requestedUrls.push(request.url()));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname === '/assets/generated/hero-summer-echo.jpg') {
      heroResponses.push({ origin: url.origin, status: response.status() });
    }
  });

  await page.goto(`${origin}/`, { waitUntil: 'networkidle' });

  await assert.doesNotReject(() => page.getByRole('heading', {
    level: 1,
    name: /雁火渡江：\s*夏日回响/
  }).waitFor({ timeout: 3000 }));

  for (const id of ['entry', 'team', 'route', 'creation-note']) {
    assert.equal(await page.locator(`section#${id}`).count(), 1, `missing #${id}`);
  }

  const newJourneyHref = await page.getByRole('link', { name: '开始旅程' }).getAttribute('href');
  const teacherBrowseHref = await page.getByRole('link', { name: '教师浏览' }).getAttribute('href');
  assert.equal(newJourneyHref, 'game/?mode=new');
  assert.equal(teacherBrowseHref, 'game/?mode=teacher');
  assert.equal(new URL(newJourneyHref, `${origin}/`).toString(), `${origin}/game/?mode=new`);
  assert.equal(new URL(teacherBrowseHref, `${origin}/`).toString(), `${origin}/game/?mode=teacher`);
  assert.equal(await page.getByText(/证据匹配|档案修复|修复档案/).count(), 0);
  assert.equal(fs.existsSync(path.join(root, 'app.js')), false);
  assert.ok(requestedUrls.length > 0);
  for (const requestUrl of requestedUrls) {
    assert.equal(new URL(requestUrl).origin, origin, `external request: ${requestUrl}`);
  }

  const routePalette = await page.locator('#route').evaluate((route) => ({
    backgroundColor: getComputedStyle(route).backgroundColor,
    markerColor: getComputedStyle(route.querySelector('.route-list span')).color
  }));
  assert.deepEqual(routePalette, {
    backgroundColor: 'rgb(49, 92, 77)',
    markerColor: 'rgb(183, 163, 107)'
  });

  const backgroundImage = await page.locator('#entry').evaluate((element) => (
    getComputedStyle(element).backgroundImage
  ));
  assert.match(backgroundImage, /hero-summer-echo\.jpg/);
  assert.deepEqual(heroResponses, [{ origin, status: 200 }]);
});
