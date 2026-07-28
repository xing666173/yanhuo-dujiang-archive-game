const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { once } = require('node:events');
const { chromium } = require('@playwright/test');
const { createStaticServer } = require('../../tools/serve.cjs');

const root = path.resolve(__dirname, '../..');

async function openGame(t) {
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
  return page;
}

test('field task HUD keeps its required semantic structure', async (t) => {
  const page = await openGame(t);
  const layer = page.locator('#field-task-layer');
  assert.equal(await layer.count(), 1);
  assert.equal(await layer.getAttribute('aria-label'), '实地任务');
  assert.equal(await layer.locator('[data-field-teammate], [data-field-title], [data-field-cancel], [data-field-stage], [data-field-action], [data-field-progress], [data-field-status], [data-field-result], [data-field-stars], [data-field-submit]').count(), 10);
  assert.equal(await layer.locator('[data-focus-stage] [data-focus-target], [data-focus-stage] [data-focus-aim], [data-timing-stage] [data-route-marker], [data-timing-stage] [data-route-nodes], [data-listening-stage] [data-sound-wave]').count(), 5);
  assert.ok(['0px', 'normal'].includes(await layer.locator('[data-field-stars]').evaluate((node) => getComputedStyle(node).letterSpacing)));
});

test('field task view renders mechanics and owns cancellation, submission, and input cleanup', async (t) => {
  const page = await openGame(t);
  const result = await page.evaluate(async () => {
    const { FIELD_TASKS } = await import('/game/data/field-tasks.mjs');
    const { createFieldTaskView } = await import('/game/ui/field-task-view.mjs');
    window.__submits = [];
    window.__cancels = 0;
    window.__fieldView = createFieldTaskView(document.querySelector('#game-root'), {
      onSubmit: (value) => window.__submits.push(value),
      onCancel: () => { window.__cancels += 1; }
    });
    window.__fieldView.show(FIELD_TASKS['camera-spot']);
    return {
      open: window.__fieldView.isOpen(),
      kind: document.querySelector('#field-task-layer').dataset.kind,
      taskId: document.querySelector('#field-task-layer').dataset.taskId,
      focusHidden: document.querySelector('[data-focus-stage]').hidden,
      timingHidden: document.querySelector('[data-timing-stage]').hidden,
      listeningHidden: document.querySelector('[data-listening-stage]').hidden
    };
  });

  assert.deepEqual(result, {
    open: true,
    kind: 'focus',
    taskId: 'camera-spot',
    focusHidden: false,
    timingHidden: true,
    listeningHidden: true
  });

  const focusBounds = await page.locator('[data-focus-stage]').boundingBox();
  await page.locator('[data-focus-stage]').hover({ position: { x: focusBounds.width * 0.2, y: focusBounds.height * 0.3 } });
  const pointerAim = await page.evaluate(() => window.__fieldView.getSnapshot().aim);
  assert.ok(Math.abs(pointerAim.x - 0.2) < 0.02);
  assert.ok(Math.abs(pointerAim.y - 0.3) < 0.02);

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(() => ({
    open: window.__fieldView.isOpen(),
    cancels: window.__cancels,
    fieldTaskActive: document.querySelector('#game-root').dataset.fieldTaskActive ?? null
  })), { open: false, cancels: 1, fieldTaskActive: null });

  await page.evaluate(() => {
    window.__fieldView.show({
      id: 'complete-now', kind: 'focus', teammateName: '测试队员', title: '完成测试', lockMs: 1, targetRadius: 1
    });
  });
  await page.waitForFunction(() => document.querySelector('[data-field-result]').hidden === false);
  await page.locator('[data-field-submit]').dblclick();
  const submissions = await page.evaluate(() => window.__submits);
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].id, 'complete-now');
  assert.equal(submissions[0].stars, 3);
  assert.equal(submissions[0].mistakes, 0);
  assert.ok(submissions[0].durationMs > 0);

  const cleanup = await page.evaluate(() => {
    window.__fieldView.show({ id: 'listen', kind: 'listening', teammateName: '测试队员', title: '清理输入', recordMs: 5000, quietThreshold: 1 });
    const action = document.querySelector('[data-field-action]');
    action.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7 }));
    const heldBeforeBlur = window.__fieldView.getSnapshot().actionActive;
    window.dispatchEvent(new Event('blur'));
    const heldAfterBlur = window.__fieldView.getSnapshot().actionActive;
    action.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 8 }));
    document.dispatchEvent(new Event('visibilitychange'));
    const heldAfterVisibility = window.__fieldView.getSnapshot().actionActive;
    window.__fieldView.destroy();
    return { heldBeforeBlur, heldAfterBlur, heldAfterVisibility, open: window.__fieldView.isOpen() };
  });
  assert.deepEqual(cleanup, { heldBeforeBlur: true, heldAfterBlur: false, heldAfterVisibility: false, open: false });
});

test('field task view never mutates shell-owned activation state during its lifecycle', async (t) => {
  const page = await openGame(t);
  const states = await page.evaluate(async () => {
    const [{ createGameShell }, { FIELD_TASKS }, { createFieldTaskView }] = await Promise.all([
      import('/game/ui/game-shell.mjs'),
      import('/game/data/field-tasks.mjs'),
      import('/game/ui/field-task-view.mjs')
    ]);
    const root = document.querySelector('#game-root');
    const shell = createGameShell(root);
    shell.showHud({ chapterTitle: '测试' });
    shell.setFieldTaskActive(true);
    const runtimeControls = [...root.querySelectorAll('.runtime-controls')].at(-1);
    const state = () => ({
      fieldTaskActive: root.dataset.fieldTaskActive,
      gameplayActive: root.dataset.gameplayActive,
      runtimeHidden: runtimeControls.hidden,
      desktopHidden: root.querySelector('#desktop-controls').hidden,
      touchHidden: root.querySelector('#touch-controls').hidden
    });
    const view = createFieldTaskView(root);
    const before = state();
    view.show(FIELD_TASKS['camera-spot']);
    const afterShow = state();
    view.hide();
    const afterHide = state();
    view.destroy();
    const afterDestroy = state();
    shell.destroy();
    return { before, afterShow, afterHide, afterDestroy };
  });
  const expected = {
    fieldTaskActive: 'true',
    gameplayActive: 'false',
    runtimeHidden: true,
    desktopHidden: true,
    touchHidden: true
  };
  assert.deepEqual(states.before, expected);
  assert.deepEqual(states.afterShow, expected);
  assert.deepEqual(states.afterHide, expected);
  assert.deepEqual(states.afterDestroy, expected);
});

test('field task keeps listening active until every pointer and key owner releases', async (t) => {
  const page = await openGame(t);
  const owners = await page.evaluate(async () => {
    const { createFieldTaskView } = await import('/game/ui/field-task-view.mjs');
    const root = document.querySelector('#game-root');
    const view = createFieldTaskView(root);
    const action = root.querySelector('[data-field-action]');
    const listening = (id) => view.show({ id, kind: 'listening', teammateName: '测试', title: '监听', recordMs: 5000, quietThreshold: 1 });
    const pointer = (type, pointerId) => action.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId }));
    const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { bubbles: true, code, key: code === 'Space' ? ' ' : 'Enter' }));

    listening('two-pointers');
    pointer('pointerdown', 1);
    pointer('pointerdown', 2);
    const pointerBothHeld = view.getSnapshot().actionActive;
    pointer('pointerup', 2);
    const pointerFirstHeld = view.getSnapshot().actionActive;
    pointer('pointerup', 1);
    const pointerNoneHeld = view.getSnapshot().actionActive;

    listening('two-keys');
    key('keydown', 'Space');
    key('keydown', 'Enter');
    const keyBothHeld = view.getSnapshot().actionActive;
    key('keyup', 'Enter');
    const keyFirstHeld = view.getSnapshot().actionActive;
    key('keyup', 'Space');
    const keyNoneHeld = view.getSnapshot().actionActive;

    listening('mixed');
    pointer('pointerdown', 3);
    key('keydown', 'Space');
    pointer('pointerup', 3);
    const mixedKeyHeld = view.getSnapshot().actionActive;
    key('keyup', 'Space');
    const mixedNoneHeld = view.getSnapshot().actionActive;
    view.destroy();
    return { pointerBothHeld, pointerFirstHeld, pointerNoneHeld, keyBothHeld, keyFirstHeld, keyNoneHeld, mixedKeyHeld, mixedNoneHeld };
  });
  assert.deepEqual(owners, {
    pointerBothHeld: true,
    pointerFirstHeld: true,
    pointerNoneHeld: false,
    keyBothHeld: true,
    keyFirstHeld: true,
    keyNoneHeld: false,
    mixedKeyHeld: true,
    mixedNoneHeld: false
  });
});

test('field task submit clears captured input before its exact-once callback', async (t) => {
  const page = await openGame(t);
  await page.evaluate(async () => {
    const { createFieldTaskView } = await import('/game/ui/field-task-view.mjs');
    const root = document.querySelector('#game-root');
    const action = root.querySelector('[data-field-action]');
    const captured = new Set();
    const released = [];
    action.setPointerCapture = (pointerId) => captured.add(pointerId);
    action.hasPointerCapture = (pointerId) => captured.has(pointerId);
    action.releasePointerCapture = (pointerId) => {
      released.push(pointerId);
      captured.delete(pointerId);
    };
    window.__submitCleanup = null;
    window.__submitView = createFieldTaskView(root, {
      onSubmit(value) {
        window.__submitCleanup = { value, captured: [...captured], released: [...released] };
      }
    });
    window.__submitView.show({ id: 'submit-cleanup', kind: 'listening', teammateName: '测试', title: '提交清理', recordMs: 1, quietThreshold: 1 });
    action.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 17 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'Space', key: ' ' }));
  });
  await page.waitForFunction(() => document.querySelector('[data-field-result]').hidden === false);
  await page.locator('[data-field-submit]').dblclick();
  const cleanup = await page.evaluate(() => {
    window.__submitView.destroy();
    return window.__submitCleanup;
  });
  assert.equal(cleanup.value.id, 'submit-cleanup');
  assert.deepEqual(cleanup.captured, []);
  assert.deepEqual(cleanup.released, [17]);
});
