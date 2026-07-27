import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { installWetlandSave, openSavedWetland } from './helpers/game-state.mjs';

const evidenceDirectory = path.resolve('test-results', 'task-7');

function readStatus(text) {
  const match = String(text).match(
    /scene=([^;]+);\s*player=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?);\s*hotspot=([^;\s]+)/
  );
  if (!match) return null;
  return {
    sceneId: match[1],
    player: [Number(match[2]), Number(match[3]), Number(match[4])],
    hotspotId: match[5].split('@')[0]
  };
}

async function status(page) {
  return readStatus(await page.locator('#game-status').textContent());
}

async function afterAnimationFrames(page, count = 12) {
  await page.evaluate((frameCount) => new Promise((resolve) => {
    let remaining = frameCount;
    function next() {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(next);
    }
    requestAnimationFrame(next);
  }), count);
}

async function worldState(page) {
  const [currentStatus, diagnostics, rootState] = await Promise.all([
    status(page),
    page.locator('#game-canvas').evaluate((canvas) => ({
      playerRootName: canvas.dataset.playerRootName || null,
      playerRootCount: Number(canvas.dataset.playerRootCount),
      playerYaw: canvas.dataset.playerYaw === undefined ? null : Number(canvas.dataset.playerYaw),
      cameraYaw: canvas.dataset.cameraYaw === undefined ? null : Number(canvas.dataset.cameraYaw),
      playerPosition: canvas.dataset.playerPosition
        ? canvas.dataset.playerPosition.split(',').map(Number)
        : null,
      completedHotspots: (canvas.dataset.completedHotspots || '').split(',').filter(Boolean),
      movement: canvas.dataset.movement
        ? canvas.dataset.movement.split(',').map(Number)
        : null
    })),
    page.locator('#game-root').evaluate((root) => ({
      sceneReady: root.dataset.sceneReady || null,
      hotspotId: root.dataset.hotspot || null
    }))
  ]);
  return { ...currentStatus, ...diagnostics, ...rootState };
}

async function waitForPlayerDiagnosticToSettle(page) {
  await page.locator('#game-canvas').evaluate((canvas) => new Promise((resolve) => {
    let lastPosition = canvas.dataset.playerPosition;
    let stableFrames = 0;
    const poll = () => {
      const nextPosition = canvas.dataset.playerPosition;
      stableFrames = nextPosition === lastPosition ? stableFrames + 1 : 0;
      lastPosition = nextPosition;
      if (stableFrames >= 18) {
        resolve();
        return;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }));
}

async function turnCamera(page, projectName) {
  const surface = projectName === 'mobile-landscape'
    ? page.locator('[data-look-zone]')
    : page.locator('#game-canvas');
  await expect(surface).toBeVisible();
  const box = await surface.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + Math.min(80, box.width / 4), y, { steps: 4 });
  await page.mouse.up();
}

async function advanceDisplayedLine(page, expectedText) {
  const line = page.locator('[data-dialogue-line]');
  await expect(line).toBeVisible();
  await line.click();
  const afterFirstClick = await line.textContent();
  if (afterFirstClick === expectedText) await line.click();
}

async function holdKeyboardUntil(page, key, predicate, hotspotId, deadline) {
  await page.keyboard.down(key);
  try {
    while (Date.now() < deadline) {
      const current = await status(page);
      if (current?.hotspotId === hotspotId || predicate(current)) return current;
      await page.waitForTimeout(60);
    }
  } finally {
    await page.keyboard.up(key);
  }
  throw new Error(`Movement timed out before reaching ${hotspotId}`);
}

async function holdTouchUntil(page, key, predicate, hotspotId, deadline) {
  const joystick = page.locator('[data-joystick]');
  await expect(joystick).toBeVisible();
  const box = await joystick.boundingBox();
  const points = {
    KeyW: [box.x + box.width / 2, box.y + 4],
    KeyS: [box.x + box.width / 2, box.y + box.height - 4],
    KeyA: [box.x + 4, box.y + box.height / 2],
    KeyD: [box.x + box.width - 4, box.y + box.height / 2]
  };
  const [clientX, clientY] = points[key];
  const pointerId = Math.floor(clientX + clientY) + 31;
  await joystick.dispatchEvent('pointerdown', {
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
    clientX,
    clientY
  });
  try {
    while (Date.now() < deadline) {
      const current = await status(page);
      if (current?.hotspotId === hotspotId || predicate(current)) return current;
      await page.waitForTimeout(60);
    }
  } finally {
    await joystick.dispatchEvent('pointerup', {
      pointerId,
      pointerType: 'touch',
      isPrimary: true,
      clientX,
      clientY
    });
  }
  throw new Error(`Touch movement timed out before reaching ${hotspotId}`);
}

async function exerciseTouchLook(page) {
  const lookZone = page.locator('[data-look-zone]');
  await expect(lookZone).toBeVisible();
  const box = await lookZone.boundingBox();
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const pointer = {
    pointerId: 811,
    pointerType: 'touch',
    isPrimary: true
  };
  await lookZone.dispatchEvent('pointerdown', { ...pointer, clientX: start.x, clientY: start.y });
  await lookZone.dispatchEvent('pointermove', { ...pointer, clientX: start.x + 24, clientY: start.y });
  await lookZone.dispatchEvent('pointermove', { ...pointer, clientX: start.x, clientY: start.y });
  await lookZone.dispatchEvent('pointerup', { ...pointer, clientX: start.x, clientY: start.y });
}

async function beginHeldMovement(page, projectName, key = 'KeyW') {
  if (projectName !== 'mobile-landscape') {
    await page.keyboard.down(key);
    return () => page.keyboard.up(key);
  }

  const joystick = page.locator('[data-joystick]');
  await expect(joystick).toBeVisible();
  const box = await joystick.boundingBox();
  const points = {
    KeyW: [box.x + box.width / 2, box.y + 4],
    KeyS: [box.x + box.width / 2, box.y + box.height - 4],
    KeyA: [box.x + 4, box.y + box.height / 2],
    KeyD: [box.x + box.width - 4, box.y + box.height / 2]
  };
  const [clientX, clientY] = points[key];
  const pointer = {
    pointerId: 991,
    pointerType: 'touch',
    isPrimary: true,
    clientX,
    clientY
  };
  await joystick.dispatchEvent('pointerdown', pointer);
  return () => joystick.dispatchEvent('pointerup', pointer);
}

async function reachHotspot(page, hotspotId, projectName) {
  const deadline = Date.now() + 8000;
  const hold = projectName === 'mobile-landscape' ? holdTouchUntil : holdKeyboardUntil;
  const routes = {
    'camera-spot': [
      ['KeyW', (value) => value?.player[2] <= 0.35],
      ['KeyA', () => false]
    ],
    'notes-spot': [
      ['KeyD', (value) => value?.player[0] >= -0.1],
      ['KeyW', (value) => value?.player[2] <= -3.75],
      ['KeyD', () => false]
    ],
    'voice-spot': [
      ['KeyA', (value) => value?.player[0] <= 0.65],
      ['KeyW', () => false]
    ]
  };

  for (const [key, predicate] of routes[hotspotId]) {
    const current = await hold(page, key, predicate, hotspotId, deadline);
    if (current?.hotspotId === hotspotId) return current;
  }
  throw new Error(`Route ended before reaching ${hotspotId}`);
}

async function canvasEvidence(page) {
  return page.locator('#game-canvas').evaluate(async (canvas) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const sample = document.createElement('canvas');
    sample.width = 64;
    sample.height = 36;
    const context = sample.getContext('2d', { willReadFrequently: true });
    context.drawImage(canvas, 0, 0, sample.width, sample.height);
    let pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    let sampling = 'drawImage';
    const copiedOpaque = [...pixels].filter((_, index) => index % 4 === 3 && pixels[index] > 0).length;
    if (copiedOpaque === 0) {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        const raw = new Uint8Array(sample.width * sample.height * 4);
        const x = Math.max(0, Math.floor((gl.drawingBufferWidth - sample.width) / 2));
        const y = Math.max(0, Math.floor((gl.drawingBufferHeight - sample.height) / 2));
        gl.readPixels(x, y, sample.width, sample.height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
        pixels = raw;
        sampling = 'readPixels';
      }
    }
    let opaque = 0;
    let minimum = 255;
    let maximum = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] > 0) opaque += 1;
      const luminance = Math.round(
        pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722
      );
      minimum = Math.min(minimum, luminance);
      maximum = Math.max(maximum, luminance);
    }
    return {
      sampling,
      opaqueRatio: opaque / (sample.width * sample.height),
      luminanceRange: maximum - minimum
    };
  });
}

test('player completes the branching vertical slice and restores its completed save', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'desktop') {
    await page.addInitScript(() => {
      const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
      let virtualTimestamp = 0;
      window.requestAnimationFrame = (callback) => nativeRequestAnimationFrame(() => {
        virtualTimestamp += 40;
        callback(virtualTimestamp);
      });
    });
  }
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await fs.mkdir(evidenceDirectory, { recursive: true });

  await page.goto('/');
  await page.getByRole('link', { name: '开始旅程' }).click();
  await expect(page).toHaveURL(/\/game\/$/);

  await advanceDisplayedLine(page, '录音笔、电池、采访提纲都在。还差一件事，我们到底想带回来什么？');
  await advanceDisplayedLine(page, '先把画面拍好。芦苇、水路、晨雾，观众愿意停下来，才会看见后面的内容。');
  await expect(page.locator('[data-dialogue-line]')).toHaveText('画面可以补拍，史料说错了却很难补救。路线和讲解口径得先确认。');
  await page.screenshot({
    path: path.join(evidenceDirectory, `dialogue-${testInfo.project.name}.png`),
    animations: 'disabled'
  });
  await advanceDisplayedLine(page, '画面可以补拍，史料说错了却很难补救。路线和讲解口径得先确认。');
  await page.getByRole('button', { name: '先听顾言把资料说完。' }).click();
  await advanceDisplayedLine(page, '那就把三种问题都带上。到了现场，我们再看看答案会不会改变。');
  await expect.poll(async () => (await status(page))?.sceneId).toBe('reeds-wetland');
  if (testInfo.project.name === 'mobile-landscape') await exerciseTouchLook(page);

  const hotspotScripts = [
    {
      id: 'camera-spot',
      lines: [
        '晨雾刚散，木栈道把视线带进芦苇里。这个画面值得先留下。',
        '可以拍，但不要让空镜替代背景说明。水路和这里的人，也要说清楚。'
      ]
    },
    {
      id: 'notes-spot',
      lines: [
        '地点和称谓先核对一遍，写进记录里的每个词都得有来处。',
        '资料里的完整句子，未必等于讲述者的真实节奏。别把他的停顿剪掉。'
      ]
    },
    {
      id: 'voice-spot',
      lines: [
        '他停了一下。我们先别急着把这段话接过去。',
        '好，我先把相机放下，听他把想说的说完。'
      ]
    }
  ];

  let releaseEchoMovement = null;
  for (const [index, hotspot] of hotspotScripts.entries()) {
    await reachHotspot(page, hotspot.id, testInfo.project.name);
    if (index === 0) {
      const pixels = await canvasEvidence(page);
      expect(pixels.opaqueRatio).toBeGreaterThan(0.25);
      expect(pixels.luminanceRange).toBeGreaterThan(24);
      await fs.writeFile(
        path.join(evidenceDirectory, `reeds-pixels-${testInfo.project.name}.json`),
        JSON.stringify(pixels, null, 2)
      );
      await page.screenshot({
        path: path.join(evidenceDirectory, `reeds-exploration-${testInfo.project.name}.png`),
        animations: 'disabled'
      });
    }
    const releaseMovement = index === 0 || index === hotspotScripts.length - 1
      ? await beginHeldMovement(page, testInfo.project.name)
      : null;
    if (testInfo.project.name === 'mobile-landscape') {
      const interact = page.locator('[data-interact]');
      await expect(interact).toBeVisible();
      await interact.click();
    } else {
      await page.keyboard.press('KeyE');
    }
    if (index === 0) {
      await expect(page.locator('#dialogue-layer')).toBeVisible();
      await page.waitForTimeout(150);
      const dialogueStart = await status(page);
      await page.waitForTimeout(350);
      const dialogueEnd = await status(page);
      expect(dialogueEnd.player[0]).toBeCloseTo(dialogueStart.player[0], 2);
      expect(dialogueEnd.player[2]).toBeCloseTo(dialogueStart.player[2], 2);
      await releaseMovement();
    } else if (index === hotspotScripts.length - 1) {
      releaseEchoMovement = releaseMovement;
    }
    for (const line of hotspot.lines) await advanceDisplayedLine(page, line);
    await expect(page.locator('#game-root')).toHaveAttribute('data-interaction-available', 'false');
    await expect(page.locator('.interaction-prompt')).toBeHidden();
    await expect(page.locator('[data-interact]')).toBeDisabled();
  }

  if (testInfo.project.name === 'desktop') {
    await expect(page.locator('#game-status')).toHaveAttribute('data-quality', 'low');
  }
  await page.getByRole('button', { name: '保留讲述中的停顿，不替对方补全。' }).click();
  await expect(page.locator('#game-root')).toHaveAttribute('data-echo-active', 'true');
  await releaseEchoMovement();
  const echoStartedAt = Date.now();
  await expect(page.locator('[data-speaker]')).toHaveText('回响 · 艺术化表达');
  await expect(page.locator('[data-dialogue-line]')).toHaveText(
    '水路曲折，靠一个人记不住。有人辨风，有人看苇，也有人把消息送到下一个村。'
  );
  await page.screenshot({
    path: path.join(evidenceDirectory, `echo-${testInfo.project.name}.png`),
    animations: 'disabled'
  });
  await expect(page.locator('#game-root')).not.toHaveAttribute('data-echo-active', 'true', { timeout: 6500 });
  expect(Date.now() - echoStartedAt).toBeGreaterThanOrEqual(4400);
  if (testInfo.project.name === 'desktop') {
    await expect(page.locator('#game-status')).toHaveAttribute('data-quality', 'low');
  }
  const afterEcho = await status(page);
  await page.waitForTimeout(500);
  const afterEchoSettled = await status(page);
  expect(afterEchoSettled.player[0]).toBeCloseTo(afterEcho.player[0], 2);
  expect(afterEchoSettled.player[2]).toBeCloseTo(afterEcho.player[2], 2);

  await advanceDisplayedLine(page, '我会把来源和背景补清楚，但不替那段停顿下结论。');
  await advanceDisplayedLine(page, '我保留水声。画面不抢着解释，让观众先听见现场。');
  await advanceDisplayedLine(page, '这次我们记录的不是一个标准答案，是三种看见彼此校准的过程。');

  await expect(page.locator('#chapter-complete')).toBeVisible();
  await expect(page.locator('[data-complete-stats] li')).toHaveText(['事实核验', '倾听共情', '表达呈现']);
  await expect(page.getByRole('link', { name: '返回成果页' })).toBeVisible();
  await page.screenshot({
    path: path.join(evidenceDirectory, `summary-${testInfo.project.name}.png`),
    animations: 'disabled'
  });

  await page.goto('/game/');
  await page.reload();
  await expect(page.getByRole('button', { name: '继续旅程' })).toBeVisible();
  await page.getByRole('button', { name: '继续旅程' }).click();
  await expect(page.locator('#chapter-complete')).toBeVisible();

  expect(requests.every((url) => new URL(url).origin === 'http://127.0.0.1:4173')).toBe(true);
});

test('legacy teacher mode opens the ordinary menu without altering progress', async ({ page }) => {
  const expectedProgress = await installWetlandSave(page);
  await page.goto('/game/?mode=teacher');
  await expect(page.locator('#main-menu')).toBeVisible();
  await expect(page.getByRole('button', { name: '继续旅程' })).toBeVisible();
  await expect(page.locator('#chapter-menu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '教师浏览' })).toHaveCount(0);
  await expect(page.locator('#dialogue-layer')).toBeHidden();
  expect(await page.evaluate(() => (
    localStorage.getItem('yanhuo-summer-echo:v1:progress')
  ))).toBe(expectedProgress);
  await expect(page).toHaveURL(/\/game\/(?:\?mode=teacher)?$/);
});

test('a progressed new journey consumes its mode and reloads into save-aware Continue', async ({ page }) => {
  await page.goto('/game/?campaign=summer&mode=new#checkpoint');
  await expect(page.locator('[data-speaker]')).toHaveText('林夏');
  await expect(page).toHaveURL(/\/game\/\?campaign=summer#checkpoint$/);
  expect(new URL(page.url()).searchParams.has('mode')).toBe(false);

  await advanceDisplayedLine(page, '录音笔、电池、采访提纲都在。还差一件事，我们到底想带回来什么？');
  await advanceDisplayedLine(page, '先把画面拍好。芦苇、水路、晨雾，观众愿意停下来，才会看见后面的内容。');
  await advanceDisplayedLine(page, '画面可以补拍，史料说错了却很难补救。路线和讲解口径得先确认。');
  await page.getByRole('button', { name: '先听顾言把资料说完。' }).click();
  await expect(page.locator('[data-dialogue-line]')).toHaveText(
    '那就把三种问题都带上。到了现场，我们再看看答案会不会改变。'
  );
  const savedBeforeReload = await page.evaluate(
    () => localStorage.getItem('yanhuo-summer-echo:v1:progress')
  );

  await page.reload();
  await expect(page).toHaveURL(/\/game\/\?campaign=summer#checkpoint$/);
  await expect(page.locator('#main-menu')).toBeVisible();
  await expect(page.locator('#dialogue-layer')).toBeHidden();
  expect(await page.evaluate(
    () => localStorage.getItem('yanhuo-summer-echo:v1:progress')
  )).toBe(savedBeforeReload);

  await page.getByRole('button', { name: '继续旅程' }).click();
  await expect(page.locator('#dialogue-layer')).toBeVisible();
  await expect(page.locator('[data-speaker]')).toHaveText('林夏');
  await expect(page.locator('[data-dialogue-line]')).toHaveText(
    '那就把三种问题都带上。到了现场，我们再看看答案会不会改变。'
  );
  const restored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('yanhuo-summer-echo:v1:progress'))
  );
  expect(restored.storyState.activeNodeId).toBe('prologue-lin-xia-response');
  expect(restored.storyState.choices['prologue-focus']).toBe('hear-gu-yan');
  expect(restored.sessionState.sceneId).toBe('activity-room');
});

test('dialogue hides gameplay controls and rejects movement input', async ({ page }) => {
  await page.goto('/game/?mode=new');
  await expect(page.locator('#dialogue-layer')).toBeVisible();
  await expect(page.getByRole('button', { name: '暂停' })).toBeHidden();
  await expect(page.locator('.runtime-controls')).toBeHidden();
  await expect(page.locator('#desktop-controls')).toBeHidden();
  await expect(page.locator('#touch-controls')).toBeHidden();

  const before = (await worldState(page)).playerPosition;
  expect(before).not.toBeNull();
  await page.keyboard.down('KeyW');
  await afterAnimationFrames(page);
  await page.keyboard.up('KeyW');
  expect((await worldState(page)).playerPosition).toEqual(before);
});

test('visible HUD pause freezes movement and resumes the same scene', async ({ page }) => {
  await openSavedWetland(page);
  const beforePause = (await worldState(page)).playerPosition;
  expect(beforePause).not.toBeNull();
  const pause = page.getByRole('button', { name: '暂停' });
  await expect(pause).toBeVisible();
  await pause.click();
  await expect(page.locator('#main-menu')).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
  await expect(page.locator('.runtime-controls')).toBeHidden();

  await page.keyboard.down('KeyW');
  await afterAnimationFrames(page);
  await page.keyboard.up('KeyW');
  expect((await worldState(page)).playerPosition).toEqual(beforePause);

  await page.getByRole('button', { name: '继续旅程' }).click();
  await expect(page.locator('#hud')).toBeVisible();
  const resumedAt = (await worldState(page)).playerPosition;
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await worldState(page)).playerPosition).not.toEqual(resumedAt);
  await page.keyboard.up('KeyW');
});

test('historical echo hides gameplay controls and rejects movement input', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('yanhuo-summer-echo:v1:settings', JSON.stringify({
      quality: 'low'
    }));
    localStorage.setItem('yanhuo-summer-echo:v1:progress', JSON.stringify({
      storyState: {
        version: 1,
        activeScriptId: 'reeds-convergence',
        activeNodeId: 'reeds-recording-priority',
        stats: { truth: 1, empathy: 1, expression: 1 },
        cooperation: 1,
        readNodes: ['reeds-recording-priority'],
        choices: {},
        completedScripts: ['prologue', 'reeds-camera', 'reeds-notes', 'reeds-voice']
      },
      sessionState: {
        version: 1,
        sceneId: 'reeds-wetland',
        visitedHotspots: ['camera-spot', 'notes-spot', 'voice-spot'],
        completedScenes: ['activity-room'],
        activeHotspotId: null,
        prototypeComplete: false
      }
    }));
  });

  await page.goto('/game/');
  await page.getByRole('button', { name: '继续旅程' }).click();
  await page.getByRole('button', { name: '保留讲述中的停顿，不替对方补全。' }).click();
  await expect(page.locator('#game-root')).toHaveAttribute('data-echo-active', 'true');
  await expect(page.getByRole('button', { name: '暂停' })).toBeHidden();
  await expect(page.locator('.runtime-controls')).toBeHidden();
  await expect(page.locator('#desktop-controls')).toBeHidden();
  await expect(page.locator('#touch-controls')).toBeHidden();

  const before = (await worldState(page)).playerPosition;
  expect(before).not.toBeNull();
  await page.keyboard.down('KeyW');
  await afterAnimationFrames(page);
  await page.keyboard.up('KeyW');
  expect((await worldState(page)).playerPosition).toEqual(before);
});

test('audio settings persist without requesting remote audio', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/game/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('slider', { name: '音乐' }).fill('21');
  await page.getByRole('slider', { name: '环境音' }).fill('43');
  await page.getByRole('slider', { name: '提示音' }).fill('87');
  await page.getByRole('button', { name: '关闭设置' }).click();

  await page.reload();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('slider', { name: '音乐' })).toHaveValue('21');
  await expect(page.getByRole('slider', { name: '环境音' })).toHaveValue('43');
  await expect(page.getByRole('slider', { name: '提示音' })).toHaveValue('87');

  const audioRequests = requests.filter((url) => /\.(mp3|wav|ogg|m4a)(?:$|\?)/i.test(url));
  expect(audioRequests).toEqual([]);
  expect(requests.every((url) => new URL(url).origin === 'http://127.0.0.1:4173')).toBe(true);
});

test('visible quality settings preserve complete nonempty player and hotspot state', async ({ page }, testInfo) => {
  await openSavedWetland(page, {
    quality: 'low',
    visitedHotspots: ['camera-spot']
  });
  const deadline = Date.now() + 8000;
  for (const [key, predicate] of [
    ['KeyD', (value) => value?.player[0] >= -0.1],
    ['KeyW', (value) => value?.player[2] <= -3.75],
    ['KeyD', () => false]
  ]) {
    const current = await holdKeyboardUntil(page, key, predicate, 'notes-spot', deadline);
    if (current?.hotspotId === 'notes-spot') break;
  }
  await turnCamera(page, testInfo.project.name);

  const sceneSettings = page.locator('[data-action="scene-settings"]');
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await worldState(page)).movement).toEqual([1, 0]);
  await sceneSettings.click();
  await expect(page.locator('#settings-panel')).toBeVisible();
  await expect.poll(async () => (await worldState(page)).movement).toEqual([0, 0]);
  await page.keyboard.up('KeyD');
  await waitForPlayerDiagnosticToSettle(page);

  const initial = await worldState(page);
  expect(initial.hotspotId).toBe('notes-spot');
  expect(initial.completedHotspots).toEqual(['camera-spot']);
  expect(Math.abs(initial.playerYaw)).toBeGreaterThan(0.01);
  expect(Math.abs(initial.cameraYaw)).toBeGreaterThan(0.01);

  for (const quality of ['high', 'low', 'high']) {
    if (await page.locator('#settings-panel').isHidden()) {
      await sceneSettings.click();
      await expect(page.locator('#settings-panel')).toBeVisible();
    }
    const before = await worldState(page);
    expect(before.movement).toEqual([0, 0]);
    await page.getByRole('radio', { name: quality === 'high' ? '高' : '低' }).check();
    await expect(page.locator('#game-status')).toHaveAttribute('data-quality', quality);
    const after = await worldState(page);
    expect(after.playerRootName).toBe('player-character');
    expect(after.playerRootCount).toBe(1);
    expect(after.sceneId).toBe(before.sceneId);
    expect(after.sceneReady).toBe(before.sceneReady);
    expect(after.playerPosition).toEqual(before.playerPosition);
    expect(after.playerYaw).toBeCloseTo(before.playerYaw, 10);
    expect(after.cameraYaw).toBeCloseTo(before.cameraYaw, 10);
    expect(after.completedHotspots).toEqual(before.completedHotspots);
    expect(after.completedHotspots).toEqual(['camera-spot']);
    expect(after.hotspotId).toBe(before.hotspotId);
    expect(after.hotspotId).toBe('notes-spot');
    expect(after.movement).toEqual([0, 0]);
    const pixels = await canvasEvidence(page);
    expect(pixels.opaqueRatio).toBeGreaterThan(0.25);
    expect(pixels.luminanceRange).toBeGreaterThan(24);
    await page.getByRole('button', { name: '关闭设置' }).click();
    await expect(page.locator('#settings-panel')).toBeHidden();
  }

  const resumedAt = await status(page);
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await worldState(page)).movement).toEqual([0, 1]);
  await expect.poll(async () => (await status(page)).player).not.toEqual(resumedAt.player);
  await page.keyboard.up('KeyW');
  await expect.poll(async () => (await worldState(page)).movement).toEqual([0, 0]);
});
