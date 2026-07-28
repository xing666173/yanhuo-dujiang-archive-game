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
  assert.equal(await layer.locator('[data-field-status]').getAttribute('aria-atomic'), 'true');
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
  assert.equal(await page.locator('[data-field-status]').textContent(), '配合默契，获得 3 星');
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

test('timing marker renders a changing unitless route ratio', async (t) => {
  const page = await openGame(t);
  const markerValues = await page.evaluate(async () => {
    const [{ FIELD_TASKS }, { createFieldTaskView }] = await Promise.all([
      import('/game/data/field-tasks.mjs'),
      import('/game/ui/field-task-view.mjs')
    ]);
    const view = createFieldTaskView(document.querySelector('#game-root'));
    const marker = document.querySelector('[data-route-marker]');
    view.show(FIELD_TASKS['notes-spot']);
    const initial = marker.style.getPropertyValue('--marker-position').trim();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const afterTicks = marker.style.getPropertyValue('--marker-position').trim();
    view.destroy();
    return { initial, afterTicks };
  });

  for (const value of Object.values(markerValues)) {
    assert.equal(value.includes('%'), false);
    assert.ok(Number.isFinite(Number(value)));
    assert.ok(Number(value) >= 0 && Number(value) <= 1);
  }
  assert.notEqual(markerValues.afterTicks, markerValues.initial);
});

test('timing live status announces real ready windows before action without frame spam', async (t) => {
  const page = await openGame(t);
  const result = await page.evaluate(async () => {
    const { createFieldTaskView } = await import('/game/ui/field-task-view.mjs');
    const root = document.querySelector('#game-root');
    const view = createFieldTaskView(root);
    const action = root.querySelector('[data-field-action]');
    const status = root.querySelector('[data-field-status]');
    const changes = [];
    const observer = new MutationObserver(() => changes.push(status.textContent));
    observer.observe(status, { childList: true, characterData: true, subtree: true });
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const waitForSnapshot = async (predicate, maxFrames = 240) => {
      let lastSnapshot = null;
      for (let index = 0; index < maxFrames; index += 1) {
        lastSnapshot = view.getSnapshot();
        if (predicate(lastSnapshot)) return lastSnapshot;
        await frame();
      }
      throw new Error(`timing snapshot condition was not reached: ${JSON.stringify(lastSnapshot)}`);
    };
    const pressAction = () => {
      action.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 71,
        pointerType: 'touch',
        isPrimary: true
      }));
      action.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 71,
        pointerType: 'touch',
        isPrimary: true
      }));
    };

    view.show({
      id: 'timing-ready-a11y',
      kind: 'timing',
      teammateName: '顾言',
      title: '节点到达提示',
      nodePositions: [0.25, 0.75],
      sweepMs: 1600,
      baseTolerance: 0.08
    });
    const initialMessage = status.textContent;
    const firstReady = await waitForSnapshot((snapshot) => snapshot.route.ready);
    await Promise.resolve();
    const firstMessage = status.textContent;
    const changesBeforeStableFrames = changes.length;
    await frame();
    await frame();
    const stableReady = view.getSnapshot().route.ready;
    const changesAfterStableFrames = changes.length;

    await waitForSnapshot((snapshot) => !snapshot.route.ready);
    const secondReady = await waitForSnapshot((snapshot) => snapshot.route.ready);
    await Promise.resolve();
    const secondMessage = status.textContent;
    pressAction();
    await frame();
    const afterPress = view.getSnapshot();
    const confirmation = status.textContent;

    observer.disconnect();
    view.destroy();
    return {
      initialMessage,
      firstReady: {
        ready: firstReady.route.ready,
        index: firstReady.route.index,
        mistakes: firstReady.mistakes
      },
      firstMessage,
      stableReady,
      changesBeforeStableFrames,
      changesAfterStableFrames,
      secondReady: {
        ready: secondReady.route.ready,
        index: secondReady.route.index,
        mistakes: secondReady.mistakes
      },
      secondMessage,
      afterPress: {
        index: afterPress.route.index,
        mistakes: afterPress.mistakes
      },
      confirmation
    };
  });

  assert.equal(result.initialMessage, '等待第 1 个节点，游标接近时按下');
  assert.deepEqual(result.firstReady, { ready: true, index: 0, mistakes: 0 });
  assert.equal(result.firstMessage, '第 1 个节点到达，现在按下');
  assert.equal(result.stableReady, true);
  assert.equal(result.changesAfterStableFrames, result.changesBeforeStableFrames);
  assert.deepEqual(result.secondReady, { ready: true, index: 0, mistakes: 0 });
  assert.equal(result.secondMessage, '第 1 个节点再次到达，现在按下（第 2 次）');
  assert.notEqual(result.secondMessage, result.firstMessage);
  assert.deepEqual(result.afterPress, { index: 1, mistakes: 0 });
  assert.equal(result.confirmation, '第 1 个节点已确认，等待第 2 个节点');
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

test('field task clock freezes while blurred or hidden and resumes without a time jump', async (t) => {
  const page = await openGame(t);
  const snapshots = await page.evaluate(async () => {
    const { createFieldTaskView } = await import('/game/ui/field-task-view.mjs');
    const root = document.querySelector('#game-root');
    const action = root.querySelector('[data-field-action]');
    const view = createFieldTaskView(root);
    const frames = (count = 3) => new Promise((resolve) => {
      let remaining = count;
      const next = () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
        else requestAnimationFrame(next);
      };
      requestAnimationFrame(next);
    });
    let hidden = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden
    });

    view.show({
      id: 'pause-test',
      kind: 'listening',
      teammateName: '林夏',
      title: '后台暂停',
      recordMs: 5000,
      quietThreshold: 1
    });
    await frames();
    action.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 41,
      pointerType: 'touch',
      isPrimary: true
    }));
    const beforeBlur = view.getSnapshot();
    window.dispatchEvent(new Event('blur'));
    await new Promise((resolve) => setTimeout(resolve, 90));
    const duringBlur = view.getSnapshot();
    window.dispatchEvent(new Event('focus'));
    await frames();
    const afterFocus = view.getSnapshot();

    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    const beforeHiddenWait = view.getSnapshot();
    await new Promise((resolve) => setTimeout(resolve, 90));
    const duringHidden = view.getSnapshot();
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await frames();
    const afterVisible = view.getSnapshot();
    view.destroy();

    return {
      beforeBlur,
      duringBlur,
      afterFocus,
      beforeHiddenWait,
      duringHidden,
      afterVisible
    };
  });

  assert.equal(snapshots.beforeBlur.actionActive, true);
  assert.equal(snapshots.duringBlur.actionActive, false);
  assert.equal(snapshots.duringBlur.elapsedMs, snapshots.beforeBlur.elapsedMs);
  assert.ok(snapshots.afterFocus.elapsedMs > snapshots.duringBlur.elapsedMs);
  assert.equal(snapshots.duringHidden.elapsedMs, snapshots.beforeHiddenWait.elapsedMs);
  assert.ok(snapshots.afterVisible.elapsedMs > snapshots.duringHidden.elapsedMs);
  assert.ok(
    snapshots.afterFocus.elapsedMs - snapshots.duringBlur.elapsedMs <= 64,
    'resume must reset the previous frame instead of charging background time'
  );
});

test('field task live status announces only actionable discrete changes', async (t) => {
  const page = await openGame(t);
  const messages = await page.evaluate(async () => {
    const { createFieldTaskView } = await import('/game/ui/field-task-view.mjs');
    const root = document.querySelector('#game-root');
    const view = createFieldTaskView(root);
    const focusStage = root.querySelector('[data-focus-stage]');
    const action = root.querySelector('[data-field-action]');
    const status = root.querySelector('[data-field-status]');
    const changes = [];
    const observer = new MutationObserver(() => changes.push(status.textContent));
    observer.observe(status, { childList: true, characterData: true, subtree: true });
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const aimAt = ({ x, y }) => {
      const bounds = focusStage.getBoundingClientRect();
      focusStage.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        clientX: bounds.left + bounds.width * x,
        clientY: bounds.top + bounds.height * y
      }));
    };
    const pressAction = (pointerId) => {
      action.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId,
        pointerType: 'touch',
        isPrimary: true
      }));
      action.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        pointerId,
        pointerType: 'touch',
        isPrimary: true
      }));
    };

    view.show({
      id: 'focus-a11y',
      kind: 'focus',
      teammateName: '陈屿',
      title: '聚焦提示',
      lockMs: 5000,
      targetRadius: 0.08
    });
    const focusOutside = status.textContent;
    aimAt(view.getSnapshot().target);
    await frame();
    const focusInside = status.textContent;
    aimAt({ x: 0, y: 0 });
    await frame();
    const focusLeft = status.textContent;

    view.show({
      id: 'timing-a11y',
      kind: 'timing',
      teammateName: '顾言',
      title: '节奏提示',
      nodePositions: [0.5, 0.8],
      sweepMs: 1000,
      baseTolerance: 0.1
    });
    const timingInitial = status.textContent;
    pressAction(51);
    await frame();
    const timingMissed = status.textContent;
    pressAction(52);
    await frame();
    const timingMissedAgain = status.textContent;

    view.show({
      id: 'listening-a11y',
      kind: 'listening',
      teammateName: '林夏',
      title: '收声提示',
      recordMs: 5000,
      quietThreshold: 0.5
    });
    const listeningQuiet = status.textContent;
    const deadline = performance.now() + 1000;
    while (!status.textContent.includes('噪声') && performance.now() < deadline) await frame();
    const listeningNoisy = status.textContent;
    const changesBeforeStableFrames = changes.length;
    await frame();
    await frame();
    await frame();
    const changesAfterStableFrames = changes.length;

    observer.disconnect();
    view.destroy();
    return {
      focusOutside,
      focusInside,
      focusLeft,
      timingInitial,
      timingMissed,
      timingMissedAgain,
      listeningQuiet,
      listeningNoisy,
      changesBeforeStableFrames,
      changesAfterStableFrames
    };
  });

  assert.deepEqual(messages, {
    focusOutside: '目标离开取景框，继续跟随',
    focusInside: '目标进入取景框，保持稳定',
    focusLeft: '目标离开取景框，继续跟随',
    timingInitial: '等待第 1 个节点，游标接近时按下',
    timingMissed: '第 1 次时机偏差，请等待游标接近第 1 个节点',
    timingMissedAgain: '第 2 次时机偏差，请等待游标接近第 1 个节点',
    listeningQuiet: '环境安静，可以按住收声',
    listeningNoisy: '出现噪声，请松开等待',
    changesBeforeStableFrames: messages.changesBeforeStableFrames,
    changesAfterStableFrames: messages.changesBeforeStableFrames
  });
});

test('focus task keeps its first primary pointer and still supports mouse hover aim', async (t) => {
  const page = await openGame(t);
  const ownership = await page.evaluate(async () => {
    const { createFieldTaskView } = await import('/game/ui/field-task-view.mjs');
    const root = document.querySelector('#game-root');
    const stage = root.querySelector('[data-focus-stage]');
    const captured = [];
    const released = [];
    const activeCaptures = new Set();
    stage.setPointerCapture = (pointerId) => {
      captured.push(pointerId);
      activeCaptures.add(pointerId);
    };
    stage.hasPointerCapture = (pointerId) => activeCaptures.has(pointerId);
    stage.releasePointerCapture = (pointerId) => {
      released.push(pointerId);
      activeCaptures.delete(pointerId);
    };
    const view = createFieldTaskView(root);
    view.show({
      id: 'focus-owner',
      kind: 'focus',
      teammateName: '陈屿',
      title: '主触点',
      lockMs: 5000,
      targetRadius: 0.1
    });
    const bounds = stage.getBoundingClientRect();
    const pointer = (type, pointerId, pointerType, isPrimary, x, y) => stage.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      pointerId,
      pointerType,
      isPrimary,
      clientX: bounds.left + bounds.width * x,
      clientY: bounds.top + bounds.height * y
    }));

    pointer('pointermove', 1, 'mouse', true, 0.15, 0.2);
    const mouseHover = view.getSnapshot().aim;
    pointer('pointerdown', 11, 'touch', true, 0.3, 0.35);
    const firstTouch = view.getSnapshot().aim;
    pointer('pointerdown', 12, 'touch', false, 0.85, 0.85);
    pointer('pointermove', 12, 'touch', false, 0.9, 0.9);
    const afterSecondTouch = view.getSnapshot().aim;
    pointer('pointermove', 11, 'touch', true, 0.45, 0.5);
    const afterOwnerMove = view.getSnapshot().aim;
    window.dispatchEvent(new Event('blur'));
    view.destroy();

    return {
      mouseHover,
      firstTouch,
      afterSecondTouch,
      afterOwnerMove,
      captured,
      released
    };
  });

  assert.ok(Math.abs(ownership.mouseHover.x - 0.15) < 0.02);
  assert.ok(Math.abs(ownership.mouseHover.y - 0.2) < 0.02);
  assert.deepEqual(ownership.afterSecondTouch, ownership.firstTouch);
  assert.ok(Math.abs(ownership.afterOwnerMove.x - 0.45) < 0.02);
  assert.ok(Math.abs(ownership.afterOwnerMove.y - 0.5) < 0.02);
  assert.deepEqual(ownership.captured, [11]);
  assert.deepEqual(ownership.released, [11]);
});
