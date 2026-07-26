const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { once } = require('node:events');
const { chromium } = require('@playwright/test');
const { createStaticServer } = require('../../tools/serve.cjs');

const root = path.resolve(__dirname, '../..');

test('game route presents the accessible local visual-novel shell and its UI modules work', async (t) => {
  const server = createStaticServer({ rootDir: root });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());

  const browser = await chromium.launch({ channel: 'msedge' });
  t.after(() => browser.close());

  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  t.after(() => page.close());

  const requests = [];
  const assetResponses = new Map();
  page.on('request', (request) => requests.push(request.url()));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.endsWith('.css') || url.pathname.endsWith('.mjs') || url.pathname.endsWith('.png')) {
      assetResponses.set(url.pathname, response.status());
    }
  });

  const response = await page.goto(`${origin}/game/`, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200, 'the game route must be served');
  await page.waitForFunction(() => document.querySelector('#game-root')?.dataset.shellReady === 'true');

  assert.equal(await page.getByRole('heading', { level: 1, name: '《雁火渡江：夏日回响》' }).count(), 1);
  assert.equal(await page.getByRole('button', { name: '继续旅程' }).isVisible(), false);
  assert.equal(await page.getByRole('button', { name: '新的旅程' }).isVisible(), true);
  assert.equal(await page.getByRole('button', { name: '教师浏览' }).isVisible(), true);
  assert.equal(await page.getByRole('button', { name: '设置', exact: true }).isVisible(), true);
  assert.equal(await page.getByRole('button', { name: '暂停' }).count(), 1);
  assert.equal(await page.getByRole('button', { name: '跳过当前对话', includeHidden: true }).count(), 1);
  assert.equal(await page.getByRole('link', { name: '返回成果页' }).getAttribute('href'), '../');
  assert.equal(await page.locator('#game-status[aria-live="polite"]').count(), 1);
  assert.equal(await page.locator('#loading-view, #main-menu, #chapter-menu, #dialogue-layer, #settings-panel, #touch-controls, #webgl-fallback').count(), 7);

  await page.getByRole('button', { name: '设置', exact: true }).click();
  assert.equal(await page.getByRole('dialog', { name: '设置' }).isVisible(), true);
  assert.equal(await page.getByRole('radio', { name: '自动' }).isChecked(), true);
  assert.equal(await page.getByRole('slider', { name: '音乐' }).count(), 1);
  assert.equal(await page.getByRole('slider', { name: '环境音' }).count(), 1);
  assert.equal(await page.getByRole('slider', { name: '提示音' }).count(), 1);
  await page.getByRole('checkbox', { name: '减少动态效果' }).check();
  assert.equal(await page.locator('#game-root').evaluate((rootNode) => rootNode.dataset.reducedMotion), 'true');
  await page.getByRole('button', { name: '关闭设置' }).click();

  const moduleResult = await page.evaluate(async () => {
    const [{ createGameShell }, { createDialogueView, expressionIndex }, { createTouchControls }] = await Promise.all([
      import('./ui/game-shell.mjs'),
      import('./ui/dialogue-view.mjs'),
      import('./ui/touch-controls.mjs')
    ]);
    const fixture = document.createElement('div');
    fixture.innerHTML = [
      '<section id="loading-view"></section><section id="main-menu"></section><section id="chapter-menu"></section>',
      '<section id="hud"></section><section id="chapter-complete"></section><section id="settings-panel"></section>',
      '<section id="webgl-fallback"></section><section id="dialogue-layer"></section><section id="touch-controls">',
      '<div data-joystick></div><div data-look-zone></div><button type="button" data-interact></button></section>'
    ].join('');
    document.body.append(fixture);
    const calls = { advance: 0, move: [], look: [], interact: 0 };
    const shell = createGameShell(fixture, { onNewGame() {}, onTeacherBrowse() {}, onSettings() {} });
    shell.showLoading({ message: '加载场景', progress: 0.4 });
    shell.showChapterMenu({ chapters: [{ title: '第一章', description: '河岸走访' }] });
    shell.showHud({ chapterTitle: '第一章' });
    shell.showChapterComplete({ summary: '完成走访', stats: ['访谈 1'] });
    shell.showFallback('当前设备不支持 WebGL');
    shell.hideOverlay();
    const dialogue = createDialogueView(fixture, { onAdvance() { calls.advance += 1; } });
    dialogue.renderNode({ speaker: '顾言', text: '请记录这段口述材料。', expression: 'thinking', choices: ['继续'] }, {
      portrait: './assets/generated/gu-yan-expressions.png', name: '顾言'
    });
    dialogue.show();
    const line = fixture.querySelector('[data-dialogue-line]');
    line.click();
    const revealed = line.textContent;
    line.click();
    dialogue.appendHistory({ speaker: '顾言', text: revealed });
    dialogue.showHistory();
    const historyVisible = !fixture.querySelector('[data-dialogue-history]').hidden;
    dialogue.hideHistory();
    dialogue.setAutoPlay(true);
    const touch = createTouchControls(fixture, {
      onMove(value) { calls.move.push(value); },
      onLook(value) { calls.look.push(value); },
      onInteract() { calls.interact += 1; }
    });
    const joystick = fixture.querySelector('[data-joystick]');
    const lookZone = fixture.querySelector('[data-look-zone]');
    joystick.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 5, clientY: 5 }));
    joystick.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 5, clientY: 5 }));
    lookZone.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, clientX: 8, clientY: 8 }));
    lookZone.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 2, clientX: 16, clientY: 11 }));
    lookZone.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2, clientX: 16, clientY: 11 }));
    fixture.querySelector('[data-interact]').click();
    touch.reset();
    const portrait = fixture.querySelector('[data-portrait]');
    const value = {
      expressionIndex,
      revealed,
      advance: calls.advance,
      historyVisible,
      autoPlay: fixture.querySelector('#dialogue-layer').dataset.autoPlay,
      liveStatus: fixture.querySelector('[data-dialogue-status]')?.getAttribute('aria-live'),
      portraitSize: portrait.style.backgroundSize,
      portraitPosition: portrait.style.backgroundPositionX,
      moved: calls.move.at(-1),
      looked: calls.look.length > 0,
      interacted: calls.interact
    };
    fixture.remove();
    return value;
  });
  assert.deepEqual(moduleResult.expressionIndex, { calm: 0, thinking: 1, surprised: 2, arguing: 3, relieved: 4 });
  assert.equal(moduleResult.revealed, '请记录这段口述材料。');
  assert.equal(moduleResult.advance, 1, 'second dialogue click advances exactly once');
  assert.equal(moduleResult.historyVisible, true);
  assert.equal(moduleResult.autoPlay, 'true');
  assert.equal(moduleResult.liveStatus, 'polite');
  assert.equal(moduleResult.portraitSize, '500% 100%');
  assert.equal(moduleResult.portraitPosition, '25%');
  assert.deepEqual(moduleResult.moved, { x: 0, y: 0 }, 'joystick resets movement after pointer release');
  assert.equal(moduleResult.looked, true);
  assert.equal(moduleResult.interacted, 1);

  for (const requestUrl of requests) {
    assert.equal(new URL(requestUrl).origin, origin, `external request: ${requestUrl}`);
  }
  for (const pathname of [
    '/game/styles.css', '/game/main.mjs', '/game/ui/game-shell.mjs', '/game/ui/dialogue-view.mjs', '/game/ui/touch-controls.mjs',
    '/game/assets/generated/gu-yan-expressions.png', '/game/assets/generated/chen-yu-expressions.png', '/game/assets/generated/lin-xia-expressions.png'
  ]) {
    assert.equal(assetResponses.get(pathname), 200, `missing local asset ${pathname}`);
  }
  const portraitSizes = await page.evaluate(async () => Promise.all([
    './assets/generated/gu-yan-expressions.png',
    './assets/generated/chen-yu-expressions.png',
    './assets/generated/lin-xia-expressions.png'
  ].map((src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = src;
  }))));
  assert.deepEqual(portraitSizes, [
    { width: 2560, height: 1024 },
    { width: 2560, height: 1024 },
    { width: 2560, height: 1024 }
  ]);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'page must not overflow horizontally');

  const mobile = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  t.after(() => mobile.close());
  await mobile.goto(`${origin}/game/`, { waitUntil: 'networkidle' });
  assert.equal(await mobile.evaluate(() => matchMedia('(pointer: coarse)').matches), true);
  assert.equal(await mobile.locator('#touch-controls').evaluate((node) => getComputedStyle(node).display), 'flex');
  await mobile.evaluate(async () => {
    const { createDialogueView } = await import('./ui/dialogue-view.mjs');
    createDialogueView(document.querySelector('#game-root')).show();
  });
  assert.equal(await mobile.locator('#touch-controls').evaluate((node) => getComputedStyle(node).display), 'none');
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'mobile game must not overflow horizontally');
});
