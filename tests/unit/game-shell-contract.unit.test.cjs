const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { once } = require('node:events');
const { chromium } = require('@playwright/test');
const { createStaticServer } = require('../../tools/serve.cjs');

const root = path.resolve(__dirname, '../..');

test('game entry connects field tasks without taking shell ownership of task state', () => {
  const mainSource = fs.readFileSync(path.join(root, 'game/main.mjs'), 'utf8');
  const shellSource = fs.readFileSync(path.join(root, 'game/ui/game-shell.mjs'), 'utf8');
  const indexSource = fs.readFileSync(path.join(root, 'game/index.html'), 'utf8');

  assert.match(mainSource, /createFieldTaskView/);
  assert.match(mainSource, /showFieldTask/);
  assert.match(mainSource, /completeFieldTask/);
  assert.match(mainSource, /cancelFieldTask/);
  assert.match(mainSource, /showFieldTask\(config\)\s*\{[\s\S]*?clearMovementInput\(\);[\s\S]*?shell\.setFieldTaskActive\(true\);[\s\S]*?fieldTask\.show\(config\);/);
  assert.match(mainSource, /hideFieldTask\(\)\s*\{[\s\S]*?fieldTask\.hide\(\);[\s\S]*?shell\.setFieldTaskActive\(false\);/);
  assert.match(mainSource, /root\.dataset\.fieldTaskActive !== 'true'/);
  assert.match(mainSource, /fieldTask\?\.destroy\(\)/);
  assert.doesNotMatch(mainSource, /root\.dataset\.fieldTaskActive\s*=/);
  assert.match(shellSource, /root\.dataset\.fieldTaskActive\s*=/);
  assert.match(indexSource, /<ul data-complete-tasks><\/ul>/);
  assert.match(indexSource, /<p data-complete-total><\/p>/);
});

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

  assert.equal(await page.locator('#desktop-controls').count(), 1);
  assert.deepEqual(
    await page.locator('#desktop-controls button').evaluateAll((buttons) => (
      buttons.map((button) => [button.dataset.direction, button.getAttribute('aria-label')])
    )),
    [
      ['up', '向前移动'],
      ['left', '向左移动'],
      ['right', '向右移动'],
      ['down', '向后移动']
    ]
  );

  assert.equal(await page.getByRole('heading', { level: 1, name: '《雁火渡江：夏日回响》' }).count(), 1);
  assert.equal(await page.getByRole('button', { name: '继续旅程' }).isVisible(), false);
  assert.equal(await page.getByRole('button', { name: '新的旅程' }).isVisible(), true);
  assert.equal(await page.getByRole('button', { name: '教师浏览' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '设置', exact: true }).isVisible(), true);
  assert.equal(await page.getByRole('button', { name: '暂停', includeHidden: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: '暂停', includeHidden: true }).isVisible(), false);
  assert.equal(await page.getByRole('button', { name: '跳过当前对话', includeHidden: true }).count(), 1);
  assert.equal(await page.getByRole('link', { name: '返回成果页' }).getAttribute('href'), '../');
  assert.equal(await page.locator('#game-status[aria-hidden="true"]:not([aria-live])').count(), 1);
  assert.equal(await page.locator('#chapter-menu').count(), 0);
  assert.equal(await page.locator('#loading-view, #main-menu, #dialogue-layer, #settings-panel, #touch-controls, #webgl-fallback').count(), 6);
  assert.deepEqual(await page.locator('#game-root').evaluate((node) => ({
    backgroundColor: getComputedStyle(node).backgroundColor,
    blendMode: getComputedStyle(node).backgroundBlendMode,
    neutralDimming: getComputedStyle(node, '::before').backgroundColor,
    dimmingLayer: getComputedStyle(node, '::before').zIndex,
    menuLayer: getComputedStyle(node.querySelector('#main-menu')).zIndex
  })), { backgroundColor: 'rgb(29, 33, 31)', blendMode: 'normal', neutralDimming: 'rgba(12, 14, 13, 0.52)', dimmingLayer: '0', menuLayer: '1' });

  const settingsOpener = page.getByRole('button', { name: '设置', exact: true });
  await settingsOpener.click();
  assert.equal(await page.getByRole('dialog', { name: '设置' }).isVisible(), true);
  assert.equal(await page.getByRole('slider', { name: '音乐' }).getAttribute('name'), 'music');
  assert.equal(await page.getByRole('slider', { name: '环境音' }).getAttribute('name'), 'ambience');
  assert.equal(await page.getByRole('slider', { name: '提示音' }).getAttribute('name'), 'uiSound');
  assert.equal(await page.getByRole('dialog', { name: '设置' }).evaluate((node) => node.contains(document.activeElement)), true);
  assert.equal(await page.locator('#main-menu').evaluate((node) => node.inert), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '减少动态效果');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '关闭设置');
  assert.equal(await page.getByRole('radio', { name: '自动' }).isChecked(), true);
  assert.equal(await page.locator('.quality-options').count(), 1, 'quality modes use a dedicated segmented control');
  assert.equal(await page.locator('.quality-options').evaluate((node) => getComputedStyle(node).display), 'flex');
  await page.getByRole('radio', { name: '高' }).check();
  assert.equal(await page.getByRole('radio', { name: '高' }).isChecked(), true);
  assert.equal(await page.getByRole('slider', { name: '音乐' }).count(), 1);
  assert.equal(await page.getByRole('slider', { name: '环境音' }).count(), 1);
  assert.equal(await page.getByRole('slider', { name: '提示音' }).count(), 1);
  await page.getByRole('checkbox', { name: '减少动态效果' }).check();
  assert.equal(await page.locator('#game-root').evaluate((rootNode) => rootNode.dataset.reducedMotion), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog', { name: '设置' }).isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('[data-action="settings"]')), true);
  assert.equal(await page.locator('#main-menu').evaluate((node) => node.inert), false);

  const desktopPortrait = await page.evaluate(async () => {
    const { createDialogueView } = await import('./ui/dialogue-view.mjs');
    const view = createDialogueView(document.querySelector('#game-root'));
    view.renderNode({ text: '江岸边的口述材料需要逐条核验。', expression: 'thinking', choices: ['记录要点', '继续观察'] }, {
      name: '顾言', portrait: './assets/generated/gu-yan-expressions.png'
    });
    view.show();
    const portrait = document.querySelector('#dialogue-layer [data-portrait]').getBoundingClientRect();
    const content = document.querySelector('#dialogue-layer .dialogue-content').getBoundingClientRect();
    const style = getComputedStyle(document.querySelector('#dialogue-layer [data-portrait]'));
    return {
      width: portrait.width,
      height: portrait.height,
      ratio: portrait.width / portrait.height,
      withinViewport: portrait.left >= 0 && portrait.top >= 0 && portrait.right <= innerWidth && portrait.bottom <= innerHeight,
      separateColumns: portrait.right <= content.left + 1,
      backgroundSize: style.backgroundSize,
      backgroundPosition: style.backgroundPositionX,
      backgroundRepeat: style.backgroundRepeat
    };
  });
  assert.ok(desktopPortrait.width > 0 && desktopPortrait.height > 0);
  assert.ok(desktopPortrait.ratio > 0.48 && desktopPortrait.ratio < 0.52, `desktop portrait ratio was ${desktopPortrait.ratio}`);
  assert.equal(desktopPortrait.withinViewport, true);
  assert.equal(desktopPortrait.separateColumns, true);
  assert.equal(desktopPortrait.backgroundSize, '500% 100%');
  assert.equal(desktopPortrait.backgroundPosition, '25%');
  assert.equal(desktopPortrait.backgroundRepeat, 'no-repeat');

  const moduleResult = await page.evaluate(async () => {
    const [{ createGameShell }, { createDialogueView, expressionIndex }, { createDirectionalControls }, { createTouchControls }] = await Promise.all([
      import('./ui/game-shell.mjs'),
      import('./ui/dialogue-view.mjs'),
      import('./ui/directional-controls.mjs'),
      import('./ui/touch-controls.mjs')
    ]);
    const fixture = document.createElement('div');
    fixture.innerHTML = [
      '<section id="loading-view"></section><section id="main-menu"></section>',
      '<section id="hud"></section><section id="chapter-complete"></section><section id="settings-panel"></section>',
      '<section id="webgl-fallback"></section><section id="dialogue-layer"></section><nav id="desktop-controls">',
      '<button data-direction="up"></button><button data-direction="left"></button>',
      '<button data-direction="right"></button><button data-direction="down"></button></nav><section id="touch-controls">',
      '<div data-joystick></div><div data-look-zone></div><button type="button" data-interact></button></section>'
    ].join('');
    document.body.append(fixture);
    const calls = { advance: 0, move: [], look: [], interact: 0 };
    const shell = createGameShell(fixture, { onNewGame() {}, onSettings() {} });
    shell.showLoading({ message: '加载场景', progress: 0.4 });
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
    const desktopCalls = [];
    const desktop = createDirectionalControls(fixture, {
      onMove(value) { desktopCalls.push(value); }
    });
    const desktopUp = fixture.querySelector('[data-direction="up"]');
    desktopUp.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3 }));
    desktopUp.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 3 }));
    desktopUp.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 4 }));
    desktopUp.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 4 }));
    desktopUp.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 5 }));
    desktopUp.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 5 }));
    desktop.destroy();
    const desktopCountAfterDestroy = desktopCalls.length;
    desktopUp.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 6 }));
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
      interacted: calls.interact,
      desktopMoved: desktopCalls.at(-1),
      desktopCountAfterDestroy,
      finalDesktopCount: desktopCalls.length
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
  assert.deepEqual(moduleResult.desktopMoved, { x: 0, y: 0 }, 'desktop direction resets after each pointer interruption');
  assert.equal(moduleResult.finalDesktopCount, moduleResult.desktopCountAfterDestroy, 'destroyed desktop controls ignore later pointer events');

  for (const requestUrl of requests) {
    assert.equal(new URL(requestUrl).origin, origin, `external request: ${requestUrl}`);
  }
  for (const pathname of [
    '/game/styles.css', '/game/main.mjs', '/game/ui/game-shell.mjs', '/game/ui/dialogue-view.mjs', '/game/ui/touch-controls.mjs',
    '/game/assets/generated/gu-yan-expressions.png', '/game/assets/generated/chen-yu-expressions.png', '/game/assets/generated/lin-xia-expressions.png'
  ]) {
    assert.equal(assetResponses.get(pathname), 200, `missing local asset ${pathname}`);
  }
  const portraitEvidence = await page.evaluate(async () => Promise.all([
    './assets/generated/gu-yan-expressions.png',
    './assets/generated/chen-yu-expressions.png',
  './assets/generated/lin-xia-expressions.png'
  ].map((src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const alphaAt = (x, y) => context.getImageData(x, y, 1, 1).data[3];
      const frameHasPortraitPixel = (frame) => {
        const pixels = context.getImageData(frame * 512 + 24, 24, 464, 976).data;
        for (let index = 3; index < pixels.length; index += 16) {
          if (pixels[index] > 16) return true;
        }
        return false;
      };
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
        cornerAlpha: [alphaAt(0, 0), alphaAt(511, 0), alphaAt(2048, 0), alphaAt(2559, 1023)],
        frameEdgeAlpha: [0, 1, 2, 3, 4].map((frame) => alphaAt(frame * 512 + 2, 2)),
        frames: [0, 1, 2, 3, 4].map(frameHasPortraitPixel)
      });
    };
    image.onerror = reject;
    image.src = src;
  }))));
  for (const evidence of portraitEvidence) {
    assert.deepEqual({ width: evidence.width, height: evidence.height }, { width: 2560, height: 1024 });
    assert.deepEqual(evidence.cornerAlpha, [0, 0, 0, 0]);
    assert.deepEqual(evidence.frameEdgeAlpha, [0, 0, 0, 0, 0]);
    assert.deepEqual(evidence.frames, [true, true, true, true, true]);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'page must not overflow horizontally');

  const mobile = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  t.after(() => mobile.close());
  await mobile.goto(`${origin}/game/`, { waitUntil: 'networkidle' });
  assert.equal(await mobile.evaluate(() => matchMedia('(pointer: coarse)').matches), true);
  assert.equal(await mobile.locator('#touch-controls').evaluate((node) => getComputedStyle(node).display), 'none');
  const mobilePortrait = await mobile.evaluate(async () => {
    const { createDialogueView } = await import('./ui/dialogue-view.mjs');
    const view = createDialogueView(document.querySelector('#game-root'));
    view.renderNode({ text: '沿江走访继续进行。', expression: 'surprised', choices: ['继续'] }, {
      name: '顾言', portrait: './assets/generated/gu-yan-expressions.png'
    });
    view.show();
    const portrait = document.querySelector('#dialogue-layer [data-portrait]').getBoundingClientRect();
    const content = document.querySelector('#dialogue-layer .dialogue-content').getBoundingClientRect();
    const style = getComputedStyle(document.querySelector('#dialogue-layer [data-portrait]'));
    return {
      width: portrait.width,
      height: portrait.height,
      ratio: portrait.width / portrait.height,
      withinViewport: portrait.left >= 0 && portrait.top >= 0 && portrait.right <= innerWidth && portrait.bottom <= innerHeight,
      separateColumns: portrait.right <= content.left + 1,
      backgroundPosition: style.backgroundPositionX
    };
  });
  assert.equal(await mobile.locator('#touch-controls').evaluate((node) => getComputedStyle(node).display), 'none');
  assert.ok(mobilePortrait.width > 0 && mobilePortrait.height > 0);
  assert.ok(mobilePortrait.ratio > 0.48 && mobilePortrait.ratio < 0.52, `mobile portrait ratio was ${mobilePortrait.ratio}`);
  assert.equal(mobilePortrait.withinViewport, true);
  assert.equal(mobilePortrait.separateColumns, true);
  assert.equal(mobilePortrait.backgroundPosition, '50%');
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'mobile game must not overflow horizontally');
});

test('shell coordinates exclusive overlays, normalized settings, autoplay, and factory cleanup', async (t) => {
  const server = createStaticServer({ rootDir: root });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());

  const browser = await chromium.launch({ channel: 'msedge' });
  t.after(() => browser.close());
  const page = await browser.newPage();
  t.after(() => page.close());
  const { port } = server.address();
  await page.goto(`http://127.0.0.1:${port}/game/`, { waitUntil: 'networkidle' });

  const result = await page.evaluate(async () => {
    const [{ createGameShell }, { createDialogueView, AUTO_ADVANCE_DELAY }, { createTouchControls }] = await Promise.all([
      import('./ui/game-shell.mjs'),
      import('./ui/dialogue-view.mjs'),
      import('./ui/touch-controls.mjs')
    ]);
    const fixture = document.createElement('div');
    fixture.dataset.reducedMotion = 'true';
    fixture.innerHTML = [
      '<section id="loading-view"><span data-loading-message></span><progress data-loading-progress></progress></section>',
      '<section id="main-menu"><button data-action="settings"></button><button data-action="continue"></button></section>',
      '<section id="hud"><span data-chapter-title></span></section>',
      '<section id="chapter-complete"><span data-complete-summary></span><ul data-complete-stats></ul></section>',
      '<section id="webgl-fallback"></section>',
      '<section id="settings-panel" role="dialog" hidden><button data-action="close-settings"></button>',
      '<input type="radio" name="quality" value="auto"><input type="radio" name="quality" value="high"><input type="radio" name="quality" value="low">',
      '<input type="range" name="music" value="0"><input type="range" name="ambience" value="0"><input type="range" name="uiSound" value="0">',
      '<input type="checkbox" name="autoPlay"><input type="checkbox" name="reducedMotion"></section>',
      '<section id="dialogue-layer"></section><section id="touch-controls"><div data-joystick></div><div data-look-zone></div><button data-interact></button></section>',
      '<nav id="desktop-controls"><button data-direction="up"></button></nav>'
    ].join('');
    document.body.append(fixture);
    const changes = [];
    const shell = createGameShell(fixture, { onSettingsChange(value) { changes.push(value); } });
    const visible = () => ['loading-view', 'main-menu', 'hud', 'chapter-complete', 'webgl-fallback', 'settings-panel']
      .filter((id) => !fixture.querySelector(`#${id}`).hidden);
    const states = [];
    shell.showLoading({ message: 'loading', progress: 0.5 }); states.push(visible());
    shell.showMainMenu({ hasSave: true }); states.push(visible());
    shell.showHud({ chapterTitle: 'one' }); states.push(visible());
    shell.setFieldTaskActive(true);
    const fieldTaskState = {
      fieldTaskActive: fixture.dataset.fieldTaskActive,
      gameplayActive: fixture.dataset.gameplayActive,
      runtimeControlsHidden: fixture.querySelector('.runtime-controls').hidden,
      desktopControlsHidden: fixture.querySelector('#desktop-controls').hidden
    };
    shell.setFieldTaskActive(false);
    shell.showChapterComplete({ summary: 'done', stats: ['one'] }); states.push(visible());
    shell.showFallback('fallback'); states.push(visible());
    shell.showSettings({ quality: 'low', music: 0.2, ambience: 0.35, uiSound: 0.8, autoPlay: true, reducedMotion: true }); states.push(visible());
    const populated = {
      quality: fixture.querySelector('[name="quality"]:checked').value,
      music: fixture.querySelector('[name="music"]').value,
      ambience: fixture.querySelector('[name="ambience"]').value,
      uiSound: fixture.querySelector('[name="uiSound"]').value,
      autoPlay: fixture.querySelector('[name="autoPlay"]').checked,
      reducedMotion: fixture.querySelector('[name="reducedMotion"]').checked
    };
    fixture.querySelector('[name="music"]').value = '46';
    fixture.querySelector('[name="music"]').dispatchEvent(new Event('input', { bubbles: true }));
    fixture.querySelector('[name="autoPlay"]').checked = false;
    fixture.querySelector('[name="autoPlay"]').dispatchEvent(new Event('change', { bubbles: true }));
    shell.hideOverlay(); states.push(visible());
    const settingsChange = changes.at(-1);
    shell.destroy();
    const changeCountAfterDestroy = changes.length;
    fixture.querySelector('[name="music"]').dispatchEvent(new Event('input', { bubbles: true }));

    const dialogueRoot = document.createElement('div');
    dialogueRoot.dataset.reducedMotion = 'true';
    dialogueRoot.innerHTML = '<section id="dialogue-layer"></section>';
    document.body.append(dialogueRoot);
    const advances = [];
    const dialogue = createDialogueView(dialogueRoot, { onAdvance() { advances.push(performance.now()); } });
    const wait = () => new Promise((resolve) => setTimeout(resolve, AUTO_ADVANCE_DELAY + 100));
    dialogue.setAutoPlay(true);
    dialogue.renderNode({ text: 'first' }, {});
    dialogue.show();
    await wait();
    const afterAuto = advances.length;
    dialogue.renderNode({ text: 'off' }, {});
    dialogue.setAutoPlay(false);
    await wait();
    const afterDisabled = advances.length;
    dialogue.setAutoPlay(true);
    dialogue.renderNode({ text: 'click' }, {});
    dialogueRoot.querySelector('[data-dialogue-line]').click();
    await wait();
    const afterClick = advances.length;
    dialogue.renderNode({ text: 'hidden' }, {});
    dialogue.hide();
    await wait();
    const afterHide = advances.length;
    dialogue.show();
    dialogue.renderNode({ text: 'destroyed' }, {});
    dialogue.destroy();
    dialogueRoot.querySelector('[data-dialogue-line]').click();
    await wait();
    const afterDestroy = advances.length;

    const touchRoot = document.createElement('div');
    touchRoot.innerHTML = '<section id="touch-controls"><div data-joystick></div><div data-look-zone></div><button data-interact></button></section>';
    document.body.append(touchRoot);
    const touchCalls = [];
    const touch = createTouchControls(touchRoot, {
      onMove(value) { touchCalls.push(['move', value]); },
      onLook(value) { touchCalls.push(['look', value]); },
      onInteract() { touchCalls.push(['interact']); }
    });
    touch.destroy();
    const touchCountAfterDestroy = touchCalls.length;
    touchRoot.querySelector('[data-joystick]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 8, clientX: 1, clientY: 1 }));
    touchRoot.querySelector('[data-interact]').click();
    fixture.remove();
    dialogueRoot.remove();
    touchRoot.remove();
    return { states, populated, fieldTaskState, settingsChange, changeCountAfterDestroy, finalChangeCount: changes.length, afterAuto, afterDisabled, afterClick, afterHide, afterDestroy, touchCountAfterDestroy, finalTouchCount: touchCalls.length };
  });

  assert.deepEqual(result.states, [
    ['loading-view'], ['main-menu'], ['hud'], ['chapter-complete'], ['webgl-fallback'], ['webgl-fallback', 'settings-panel'], []
  ]);
  assert.deepEqual(result.populated, { quality: 'low', music: '20', ambience: '35', uiSound: '80', autoPlay: true, reducedMotion: true });
  assert.deepEqual(result.fieldTaskState, {
    fieldTaskActive: 'true',
    gameplayActive: 'false',
    runtimeControlsHidden: true,
    desktopControlsHidden: true
  });
  assert.deepEqual(result.settingsChange, { quality: 'low', music: 0.46, ambience: 0.35, uiSound: 0.8, autoPlay: false, reducedMotion: true });
  assert.equal(result.finalChangeCount, result.changeCountAfterDestroy);
  assert.deepEqual([result.afterAuto, result.afterDisabled, result.afterClick, result.afterHide, result.afterDestroy], [1, 1, 2, 2, 2]);
  assert.equal(result.finalTouchCount, result.touchCountAfterDestroy);
});

test('coarse-pointer touch controls are eligible only during HUD gameplay', async (t) => {
  const server = createStaticServer({ rootDir: root });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const browser = await chromium.launch({ channel: 'msedge' });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  t.after(() => page.close());
  const { port } = server.address();
  await page.goto(`http://127.0.0.1:${port}/game/`, { waitUntil: 'networkidle' });

  const display = () => page.locator('#touch-controls').evaluate((node) => getComputedStyle(node).display);
  assert.equal(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), true);
  assert.equal(await display(), 'none', 'main menu must not expose touch controls');
  await page.evaluate(async () => {
    const { createGameShell } = await import('./ui/game-shell.mjs');
    window.__touchShell = createGameShell(document.querySelector('#game-root'));
    window.__touchShell.showHud({ chapterTitle: '第一章' });
  });
  assert.equal(await display(), 'flex');
  await page.evaluate(() => window.__touchShell.showSettings());
  assert.equal(await display(), 'none');
  await page.locator('[data-action="close-settings"]').click();
  assert.equal(await display(), 'flex');
  await page.evaluate(async () => {
    const { createDialogueView } = await import('./ui/dialogue-view.mjs');
    window.__touchDialogue = createDialogueView(document.querySelector('#game-root'));
    window.__touchDialogue.show();
  });
  assert.equal(await display(), 'none');
  await page.evaluate(() => window.__touchDialogue.hide());
  assert.equal(await display(), 'flex');
  await page.evaluate(() => window.__touchShell.hideOverlay());
  assert.equal(await display(), 'none');
  await page.evaluate(() => {
    window.__touchDialogue.destroy();
    window.__touchShell.destroy();
    delete window.__touchDialogue;
    delete window.__touchShell;
  });
});

test('programmatic settings closure restores valid focus for every base view transition', async (t) => {
  const server = createStaticServer({ rootDir: root });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const browser = await chromium.launch({ channel: 'msedge' });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  t.after(() => page.close());
  const { port } = server.address();
  await page.goto(`http://127.0.0.1:${port}/game/`, { waitUntil: 'networkidle' });

  const result = await page.evaluate(async () => {
    const { createGameShell } = await import('./ui/game-shell.mjs');
    const root = document.querySelector('#game-root');
    const shell = createGameShell(root);
    const opener = root.querySelector('[data-action="settings"]');
    const close = root.querySelector('[data-action="close-settings"]');
    const inspect = () => {
      const active = document.activeElement;
      return {
        settingsHidden: root.querySelector('#settings-panel').hidden,
        inertLeaked: [...root.querySelectorAll('.game-layer')].some((layer) => layer.id !== 'settings-panel' && layer.inert),
        insideSettings: root.querySelector('#settings-panel').contains(active),
        hiddenAncestor: active !== document.body && Boolean(active.closest('[hidden]')),
        disabled: active instanceof HTMLButtonElement && active.disabled,
        visible: active === document.body || active.getClientRects().length > 0,
        target: active === document.body ? 'body' : active.closest('[id]')?.id
      };
    };
    const openFromMenu = () => {
      shell.showMainMenu({ hasSave: false });
      opener.focus();
      shell.showSettings();
    };
    openFromMenu();
    close.click();
    const closeButton = inspect();
    const transitions = [
      ['loading', () => shell.showLoading({ message: 'loading', progress: 0.5 })],
      ['hud', () => shell.showHud({ chapterTitle: 'HUD' })],
      ['fallback', () => shell.showFallback('fallback')],
      ['complete', () => shell.showChapterComplete({ summary: 'complete', stats: [] })],
      ['hidden', () => shell.hideOverlay()]
    ];
    const outcomes = transitions.map(([name, transition]) => {
      openFromMenu();
      transition();
      return { name, ...inspect() };
    });
    shell.destroy();
    return { closeButton, outcomes };
  });

  assert.deepEqual(result.closeButton, {
    settingsHidden: true,
    inertLeaked: false,
    insideSettings: false,
    hiddenAncestor: false,
    disabled: false,
    visible: true,
    target: 'main-menu'
  });
  for (const outcome of result.outcomes) {
    assert.equal(outcome.settingsHidden, true, `${outcome.name} must hide settings`);
    assert.equal(outcome.inertLeaked, false, `${outcome.name} must clear inert state`);
    assert.equal(outcome.insideSettings, false, `${outcome.name} must move focus out of settings`);
    assert.equal(outcome.hiddenAncestor, false, `${outcome.name} must not focus hidden content`);
    assert.equal(outcome.disabled, false, `${outcome.name} must not focus a disabled control`);
    assert.equal(outcome.visible, true, `${outcome.name} must leave focus visible`);
  }
  assert.deepEqual(result.outcomes.map((outcome) => [outcome.name, outcome.target]), [
    ['loading', 'body'], ['hud', 'body'], ['fallback', 'body'], ['complete', 'body'], ['hidden', 'body']
  ]);
});
