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
    fieldTaskActive: document.querySelector('#game-root').dataset.fieldTaskActive
  })), { open: false, cancels: 1, fieldTaskActive: 'false' });

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
