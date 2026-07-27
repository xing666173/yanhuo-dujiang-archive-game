import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { openNewJourney, openSavedWetland } from './helpers/game-state.mjs';

const screenshotDirectory = path.resolve('test-results');

function monitorPage(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).origin === 'http://127.0.0.1:4173') {
      errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`);
    }
  });
  page.on('response', (response) => {
    if (new URL(response.url()).origin === 'http://127.0.0.1:4173' && response.status() >= 400) {
      errors.push(`response: ${response.status()} ${response.url()}`);
    }
  });
  return errors;
}

async function sampleCanvas(page) {
  return page.locator('#game-canvas').evaluate(async (canvas) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const box = canvas.getBoundingClientRect();
    const sampleWidth = 64;
    const sampleHeight = 36;
    const copy = document.createElement('canvas');
    copy.width = sampleWidth;
    copy.height = sampleHeight;
    const context = copy.getContext('2d', { willReadFrequently: true });
    context.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);
    let pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    let sampling = 'drawImage';

    const summarize = (data) => {
      let visible = 0;
      let minimumLuminance = 255;
      let maximumLuminance = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] > 0) visible += 1;
        const luminance = Math.round(
          data[index] * 0.2126
          + data[index + 1] * 0.7152
          + data[index + 2] * 0.0722
        );
        minimumLuminance = Math.min(minimumLuminance, luminance);
        maximumLuminance = Math.max(maximumLuminance, luminance);
      }
      return {
        visibleRatio: visible / (sampleWidth * sampleHeight),
        luminanceRange: maximumLuminance - minimumLuminance
      };
    };

    const copiedSummary = summarize(pixels);
    if (copiedSummary.visibleRatio < 0.25 || copiedSummary.luminanceRange < 24) {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        const raw = new Uint8Array(sampleWidth * sampleHeight * 4);
        const x = Math.max(0, Math.floor((gl.drawingBufferWidth - sampleWidth) / 2));
        const y = Math.max(0, Math.floor((gl.drawingBufferHeight - sampleHeight) / 2));
        gl.readPixels(x, y, sampleWidth, sampleHeight, gl.RGBA, gl.UNSIGNED_BYTE, raw);
        pixels = raw;
        sampling = 'readPixels';
      }
    }

    let visible = 0;
    let minimumLuminance = 255;
    let maximumLuminance = 0;
    const colors = new Set();
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] > 0) visible += 1;
      const luminance = Math.round(
        pixels[index] * 0.2126
        + pixels[index + 1] * 0.7152
        + pixels[index + 2] * 0.0722
      );
      minimumLuminance = Math.min(minimumLuminance, luminance);
      maximumLuminance = Math.max(maximumLuminance, luminance);
      colors.add(`${pixels[index] >> 4},${pixels[index + 1] >> 4},${pixels[index + 2] >> 4}`);
    }

    return {
      sampling,
      visibleRatio: visible / (sampleWidth * sampleHeight),
      luminanceRange: maximumLuminance - minimumLuminance,
      colorBuckets: colors.size,
      box: {
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height
      },
      viewport: { width: innerWidth, height: innerHeight }
    };
  });
}

async function expectHealthyCanvas(page) {
  const evidence = await sampleCanvas(page);
  expect(evidence.visibleRatio).toBeGreaterThanOrEqual(0.25);
  expect(evidence.luminanceRange).toBeGreaterThanOrEqual(24);
  expect(evidence.colorBuckets).toBeGreaterThanOrEqual(12);
  expect(evidence.box.left).toBeCloseTo(0, 0);
  expect(evidence.box.top).toBeCloseTo(0, 0);
  expect(evidence.box.width).toBeCloseTo(evidence.viewport.width, 0);
  expect(evidence.box.height).toBeCloseTo(evidence.viewport.height, 0);
  return evidence;
}

async function playerPosition(page) {
  return page.locator('#game-status').evaluate((node) => {
    const match = node.textContent.match(
      /player=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/
    );
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  });
}

async function waitForPlayerPosition(page) {
  await expect.poll(async () => playerPosition(page)).not.toBeNull();
  return playerPosition(page);
}

test('unified player stays singly framed without overlapping controls', async ({ page }, testInfo) => {
  const viewport = testInfo.project.name === 'desktop'
    ? { width: 1440, height: 900 }
    : { width: 390, height: 844 };
  await page.setViewportSize(viewport);
  await openSavedWetland(page, { quality: 'high' });

  await expect(page.locator('#game-canvas')).toHaveAttribute('data-player-root-name', 'player-character');
  await expect(page.locator('#game-canvas')).toHaveAttribute('data-player-root-count', '1');
  if (testInfo.project.name === 'desktop') {
    await expect(page.locator('#desktop-controls')).toBeVisible();
    await expect(page.locator('#touch-controls')).toBeHidden();
    await expect(page.locator('#desktop-controls button')).toHaveCount(4);
  } else {
    await expect(page.locator('#desktop-controls')).toBeHidden();
    await expect(page.locator('#touch-controls')).toBeVisible();
  }
  const pixels = await expectHealthyCanvas(page);
  expect(pixels.viewport).toEqual(viewport);

  const visibleControls = page.locator('.runtime-controls button:visible, [data-joystick]:visible');
  const boxes = (await visibleControls.evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return {
      label: node.getAttribute('aria-label') || node.textContent?.trim() || node.className,
      left: box.left,
      top: box.top,
      right: box.right,
      bottom: box.bottom
    };
  }))).filter((box) => box.right > box.left && box.bottom > box.top);
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const overlapWidth = Math.min(boxes[left].right, boxes[right].right)
        - Math.max(boxes[left].left, boxes[right].left);
      const overlapHeight = Math.min(boxes[left].bottom, boxes[right].bottom)
        - Math.max(boxes[left].top, boxes[right].top);
      expect(
        overlapWidth <= 0 || overlapHeight <= 0,
        `${boxes[left].label} overlaps ${boxes[right].label}`
      ).toBe(true);
    }
  }

  await fs.mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotDirectory, `task-5-player-${testInfo.project.name}.png`),
    animations: 'disabled'
  });
});

test('activity room renders full-bleed through a new journey', async ({ page }, testInfo) => {
  const errors = monitorPage(page);
  await openNewJourney(page);
  await expect(page.locator('#main-menu')).toBeHidden();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#dialogue-layer')).toBeVisible();

  const pixels = await expectHealthyCanvas(page);

  await fs.mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotDirectory, `task-6-activity-room-${testInfo.project.name}.png`),
    animations: 'disabled'
  });
  await fs.writeFile(
    path.join(screenshotDirectory, `task-6-activity-room-${testInfo.project.name}-pixels.json`),
    JSON.stringify(pixels, null, 2)
  );
  expect(errors, `canvas evidence: ${JSON.stringify(pixels)}`).toEqual([]);
});

test('enriched reeds wetland renders a varied, nonblank desktop scene', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop capture is the required wetland visual review.');
  const errors = monitorPage(page);
  await openSavedWetland(page, { quality: 'high' });
  const pixels = await expectHealthyCanvas(page);
  expect(pixels.viewport).toEqual({ width: 1440, height: 900 });

  await fs.mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotDirectory, 'task-4-reeds-wetland-desktop.png'),
    animations: 'disabled'
  });
  await fs.writeFile(
    path.join(screenshotDirectory, 'task-4-reeds-wetland-desktop-pixels.json'),
    JSON.stringify(pixels, null, 2)
  );
  expect(errors, `canvas evidence: ${JSON.stringify(pixels)}`).toEqual([]);
});

test('desktop pointer drag changes the forward travel direction', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Pointer-drag look is a desktop contract.');
  const errors = monitorPage(page);
  await openSavedWetland(page);
  const before = await waitForPlayerPosition(page);
  await page.mouse.move(720, 450);
  await page.mouse.down();
  await page.mouse.move(840, 450, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyW');
  await expect.poll(async () => playerPosition(page)).not.toEqual(before);
  const after = await playerPosition(page);
  expect(Math.abs(after[0] - before[0])).toBeGreaterThan(0.2);
  expect(errors).toEqual([]);
});

test('desktop direction control moves while held and stops on release', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop direction controls require a fine pointer.');
  await openSavedWetland(page);
  const before = await waitForPlayerPosition(page);
  const up = page.locator('#desktop-controls [data-direction="up"]');
  await expect(up).toBeVisible();
  const box = await up.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  const canvas = page.locator('#game-canvas');
  await expect(canvas).toHaveAttribute('data-movement', '0.0000,0.0000');
  const released = (await canvas.getAttribute('data-player-position')).split(',').map(Number);
  expect(released[2]).toBeLessThan(before[2] - 0.5);
  await page.waitForTimeout(250);
  const stopped = (await canvas.getAttribute('data-player-position')).split(',').map(Number);
  expect(stopped).toEqual(released);
});

test('movement controls hide during dialogue, settings, and pause', async ({ page }, testInfo) => {
  const desktopControls = page.locator('#desktop-controls');
  const touchControls = page.locator('#touch-controls');
  await openNewJourney(page);
  await expect(desktopControls).toBeHidden();
  await expect(touchControls).toBeHidden();

  await openSavedWetland(page);
  if (testInfo.project.name === 'desktop') {
    await expect(desktopControls).toBeVisible();
    await expect(touchControls).toBeHidden();
  } else {
    await expect(desktopControls).toBeHidden();
    await expect(touchControls).toBeVisible();
  }

  await page.locator('[data-action="scene-settings"]').click();
  await expect(desktopControls).toBeHidden();
  await expect(touchControls).toBeHidden();
  await page.locator('[data-action="close-settings"]').click();
  await page.getByRole('button', { name: '暂停' }).click();
  await expect(desktopControls).toBeHidden();
  await expect(touchControls).toBeHidden();
});

test('WebGL unavailability reveals the existing fallback without crashing', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for feature detection.');
  const errors = monitorPage(page);
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...arguments_) {
      if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return null;
      return originalGetContext.call(this, type, ...arguments_);
    };
  });
  await page.goto('/game/?mode=new');
  await expect(page.locator('#webgl-fallback')).toBeVisible();
  await expect(page.locator('#webgl-fallback')).toContainText('当前设备无法启动 3D 场景');
  const returnLink = page.getByRole('link', { name: '返回成果页' });
  await expect(returnLink).toHaveAttribute('href', '../');
  await expect(page.locator('[data-scene-ready]')).toHaveCount(0);
  expect(requests.some((url) => new URL(url).pathname.endsWith('/game/render/world.mjs'))).toBe(false);
  await returnLink.click();
  await expect(page).toHaveURL('http://127.0.0.1:4173/');
  expect(errors).toEqual([]);
});

test('portrait load failure shows a named silhouette without blocking dialogue', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for image failure behavior.');
  const errors = monitorPage(page);
  await page.route('**/game/assets/generated/*-expressions.png', (route) => route.abort('failed'));
  await page.goto('/game/?mode=new');

  const portrait = page.locator('#dialogue-layer [data-portrait]');
  await expect(page.locator('[data-speaker]')).toHaveText('林夏');
  await expect(portrait).toHaveAttribute('data-portrait-fallback', 'true');
  await expect(portrait).toContainText('林夏');
  await page.locator('[data-dialogue-line]').click();
  await expect(page.locator('[data-dialogue-line]')).toHaveText(
    '录音笔、电池、采访提纲都在。还差一件事，我们到底想带回来什么？'
  );
  expect(errors.filter((error) => !error.includes('-expressions.png'))).toEqual([]);
});

test('automatic quality downgrade preserves a held visible direction control', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for timed quality behavior.');
  await page.addInitScript(() => {
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    let virtualTimestamp = 0;
    window.requestAnimationFrame = (callback) => nativeRequestAnimationFrame(() => {
      virtualTimestamp += 40;
      callback(virtualTimestamp);
    });
  });
  await openSavedWetland(page, { quality: 'auto' });
  await expect(page.locator('#game-status')).toHaveAttribute('data-quality', 'high');

  const before = await waitForPlayerPosition(page);
  const up = page.locator('[data-direction="up"]');
  await expect(up).toBeVisible();
  const box = await up.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(async () => page.locator('#game-canvas').getAttribute('data-movement')).toBe('0.0000,1.0000');

  await expect(page.locator('#game-status')).toHaveAttribute('data-quality', 'low', { timeout: 5000 });
  await expect(page.locator('#quality-announcement')).toHaveText('已切换为流畅画质');
  await expect(page.locator('#game-canvas')).toHaveAttribute('data-movement', '0.0000,1.0000');
  await expect(page.locator('#game-canvas')).toHaveAttribute('data-player-root-count', '1');
  await expect.poll(async () => playerPosition(page)).not.toEqual(before);

  await page.mouse.up();
  await expect(page.locator('#game-canvas')).toHaveAttribute('data-movement', '0.0000,0.0000');
});

test('pagehide invalidates a pending world import before any late initialization', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for lifecycle invalidation.');
  let releaseWorld;
  let worldRequestHeld = false;
  const worldReleased = new Promise((resolve) => {
    releaseWorld = resolve;
  });

  await page.route('**/game/render/world.mjs', async (route) => {
    worldRequestHeld = true;
    await worldReleased;
    await route.continue();
  });
  await page.addInitScript(() => {
    const diagnostics = {
      pageHidden: false,
      animationFramesRequested: 0,
      audioContextsConstructed: 0,
      listenersAddedAfterPagehide: 0,
      webglContextsRequested: 0
    };
    window.__pendingImportDiagnostics = diagnostics;

    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      diagnostics.animationFramesRequested += 1;
      return nativeRequestAnimationFrame(callback);
    };

    const NativeAudioContext = window.AudioContext;
    if (NativeAudioContext) {
      window.AudioContext = class InstrumentedAudioContext extends NativeAudioContext {
        constructor(...args) {
          super(...args);
          diagnostics.audioContextsConstructed += 1;
        }
      };
    }

    const nativeAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function instrumentedAddEventListener(...args) {
      if (diagnostics.pageHidden) diagnostics.listenersAddedAfterPagehide += 1;
      return nativeAddEventListener.apply(this, args);
    };

    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function instrumentedGetContext(type, ...args) {
      if (/^webgl2?$/.test(type)) diagnostics.webglContextsRequested += 1;
      return nativeGetContext.call(this, type, ...args);
    };
  });

  await page.goto('/game/?mode=new');
  await expect.poll(() => worldRequestHeld).toBe(true);
  const baseline = await page.evaluate(() => {
    window.__pendingImportDiagnostics.pageHidden = true;
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    return { ...window.__pendingImportDiagnostics };
  });
  expect(baseline.animationFramesRequested).toBe(0);
  expect(baseline.audioContextsConstructed).toBe(0);
  expect(baseline.listenersAddedAfterPagehide).toBe(0);

  releaseWorld();
  await page.waitForTimeout(750);

  const afterRelease = await page.evaluate(() => ({ ...window.__pendingImportDiagnostics }));
  expect(afterRelease.animationFramesRequested).toBe(baseline.animationFramesRequested);
  expect(afterRelease.audioContextsConstructed).toBe(baseline.audioContextsConstructed);
  expect(afterRelease.listenersAddedAfterPagehide).toBe(baseline.listenersAddedAfterPagehide);
  expect(afterRelease.webglContextsRequested).toBe(baseline.webglContextsRequested);
  await expect(page.locator('#game-root')).not.toHaveAttribute('data-scene-ready', /.+/);
  await expect(page.locator('[data-speaker]')).toHaveText('');
  await expect(page.locator('.runtime-controls')).toHaveCount(0);
});

test('visibility loss stops frames and autoplay, suspends audio, then restores once visible', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for visibility behavior.');
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden
    });
    window.__setTestHidden = (value) => {
      hidden = value;
      document.dispatchEvent(new Event('visibilitychange'));
    };

    let frames = 0;
    let animationFramesRequested = 0;
    let animationFramesCancelled = 0;
    const pendingAnimationFrames = new Set();
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      animationFramesRequested += 1;
      let handle;
      handle = nativeRequestAnimationFrame((timestamp) => {
        pendingAnimationFrames.delete(handle);
        frames += 1;
        callback(timestamp);
      });
      pendingAnimationFrames.add(handle);
      return handle;
    };
    window.cancelAnimationFrame = (handle) => {
      animationFramesCancelled += 1;
      pendingAnimationFrames.delete(handle);
      return nativeCancelAnimationFrame(handle);
    };
    window.__testFrameDiagnostics = () => ({
      frames,
      animationFramesRequested,
      animationFramesCancelled,
      pendingAnimationFrames: pendingAnimationFrames.size
    });
    window.__testFrameCount = () => frames;

    window.__audioDiagnostics = {
      audioContextType: typeof window.AudioContext,
      constructed: 0,
      lifecycle: []
    };
    const NativeAudioContext = window.AudioContext;
    if (NativeAudioContext) {
      window.AudioContext = class InstrumentedAudioContext extends NativeAudioContext {
        constructor(...args) {
          super(...args);
          window.__audioDiagnostics.constructed += 1;
        }
      };
    }
    for (const name of ['suspend', 'resume']) {
      const original = NativeAudioContext?.prototype?.[name];
      if (!original) continue;
      NativeAudioContext.prototype[name] = function instrumentedAudioLifecycle(...args) {
        window.__audioDiagnostics.lifecycle.push(name);
        return original.apply(this, args);
      };
    }
  });

  await page.goto('/game/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('checkbox', { name: '自动播放' }).check();
  await page.getByRole('button', { name: '关闭设置' }).click();
  await page.getByRole('button', { name: '新的旅程' }).click();
  await expect(page.locator('[data-speaker]')).toHaveText('林夏');
  await expect(page.locator('[data-dialogue-line]')).toHaveText(
    '录音笔、电池、采访提纲都在。还差一件事，我们到底想带回来什么？'
  );
  await page.keyboard.press('Shift');
  await expect.poll(async () => page.evaluate(() => window.__audioDiagnostics.constructed)).toBe(1);

  const baseline = await page.evaluate(() => ({
    frames: window.__testFrameDiagnostics(),
    lifecycle: [...window.__audioDiagnostics.lifecycle]
  }));
  await page.evaluate(() => {
    window.__setTestHidden(true);
    window.__setTestHidden(true);
  });
  const hiddenFrameCount = await page.evaluate(() => window.__testFrameCount());
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => window.__testFrameCount())).toBeLessThanOrEqual(hiddenFrameCount + 1);
  await expect(page.locator('[data-speaker]')).toHaveText('林夏');
  await expect(page.locator('[data-dialogue-line]')).toHaveText(
    '录音笔、电池、采访提纲都在。还差一件事，我们到底想带回来什么？'
  );

  const hidden = await page.evaluate(() => ({
    frames: window.__testFrameDiagnostics(),
    lifecycle: [...window.__audioDiagnostics.lifecycle]
  }));
  expect(hidden.frames.animationFramesCancelled - baseline.frames.animationFramesCancelled).toBe(1);
  expect(hidden.frames.pendingAnimationFrames).toBe(0);
  expect(
    hidden.lifecycle.filter((entry) => entry === 'suspend').length
      - baseline.lifecycle.filter((entry) => entry === 'suspend').length
  ).toBe(1);

  const visible = await page.evaluate(() => {
    window.__setTestHidden(false);
    window.__setTestHidden(false);
    return {
      frames: window.__testFrameDiagnostics(),
      lifecycle: [...window.__audioDiagnostics.lifecycle]
    };
  });
  expect(visible.frames.animationFramesRequested - hidden.frames.animationFramesRequested).toBe(1);
  expect(visible.frames.pendingAnimationFrames).toBe(1);
  expect(
    visible.lifecycle.filter((entry) => entry === 'resume').length
      - hidden.lifecycle.filter((entry) => entry === 'resume').length
  ).toBe(1);
  await expect.poll(async () => page.evaluate(() => window.__testFrameCount())).toBeGreaterThan(hiddenFrameCount + 1);
  await expect(page.locator('[data-speaker]')).toHaveText('陈屿', { timeout: 5000 });
  const audioDiagnostics = await page.evaluate(() => window.__audioDiagnostics);
  const audioLifecycle = audioDiagnostics.lifecycle;
  expect(audioDiagnostics.constructed).toBe(1);
  expect(audioLifecycle.filter((entry) => entry === 'suspend')).toHaveLength(1);
  expect(audioLifecycle.filter((entry) => entry === 'resume')).toHaveLength(2);
});

test('test-only query values cannot bypass the normal journey UI', async ({ page }, testInfo) => {
  await page.goto('/game/?mode=new&testHud=1&scene=reeds-wetland');

  await expect(page.locator('[data-scene-ready="activity-room"]')).toBeVisible();
  await expect(page.locator('#dialogue-layer')).toBeVisible();
  await expect(page.locator('[data-speaker]')).toHaveText('林夏');
  await expect(page.locator('[data-scene-ready="reeds-wetland"]')).toHaveCount(0);
  await expect(page.locator('#game-status')).toContainText('scene=activity-room');
});

test('throwing browser storage still starts gameplay without the 3D fallback', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      Storage.prototype[method] = function throwingStorageOperation() {
        throw new DOMException('Storage blocked', 'SecurityError');
      };
    }
  });

  await page.goto('/game/?mode=new');
  await expect(page.locator('[data-scene-ready="activity-room"]')).toBeVisible();
  await expect(page.locator('#dialogue-layer')).toBeVisible();
  await expect(page.locator('#webgl-fallback')).toBeHidden();
  await expect(page.locator('[data-speaker]')).toHaveText('林夏');
});

test('semantically unknown saved script is cleared without entering fallback', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('yanhuo-summer-echo:v1:progress', JSON.stringify({
      storyState: {
        version: 1,
        activeScriptId: 'missing-script',
        activeNodeId: 'missing-node',
        stats: { truth: 0, empathy: 0, expression: 0 },
        cooperation: 0,
        readNodes: [],
        choices: {},
        completedScripts: []
      },
      sessionState: {
        version: 1,
        sceneId: 'activity-room',
        visitedHotspots: [],
        completedScenes: [],
        activeHotspotId: null,
        prototypeComplete: false
      }
    }));
  });

  await page.goto('/game/');
  await expect(page.locator('#main-menu')).toBeVisible();
  await expect(page.getByRole('button', { name: '继续旅程' })).toBeHidden();
  await expect(page.locator('#webgl-fallback')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('yanhuo-summer-echo:v1:progress'))).toBeNull();
});

test('a persisted checkpoint with null active story ids is cleared safely', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('yanhuo-summer-echo:v1:progress', JSON.stringify({
      storyState: {
        version: 1,
        activeScriptId: null,
        activeNodeId: null,
        stats: { truth: 0, empathy: 0, expression: 0 },
        cooperation: 0,
        readNodes: [],
        choices: {},
        completedScripts: []
      },
      sessionState: {
        version: 1,
        sceneId: 'activity-room',
        visitedHotspots: [],
        completedScenes: [],
        activeHotspotId: null,
        prototypeComplete: false
      }
    }));
  });

  await page.goto('/game/');
  await expect(page.locator('#main-menu')).toBeVisible();
  await expect(page.getByRole('button', { name: '继续旅程' })).toBeHidden();
  await expect(page.locator('#dialogue-layer')).toBeHidden();
  await expect(page.locator('#webgl-fallback')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('yanhuo-summer-echo:v1:progress'))).toBeNull();
});

test('a restored active choice that is already selected is cleared safely', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('yanhuo-summer-echo:v1:progress', JSON.stringify({
      storyState: {
        version: 1,
        activeScriptId: 'prologue',
        activeNodeId: 'prologue-focus',
        stats: { truth: 1, empathy: 0, expression: 0 },
        cooperation: 1,
        readNodes: [
          'prologue-lin-xia-opening',
          'prologue-chen-yu-plan',
          'prologue-gu-yan-plan',
          'prologue-focus'
        ],
        choices: { 'prologue-focus': 'hear-gu-yan' },
        completedScripts: []
      },
      sessionState: {
        version: 1,
        sceneId: 'activity-room',
        visitedHotspots: [],
        completedScenes: [],
        activeHotspotId: null,
        prototypeComplete: false
      }
    }));
  });

  await page.goto('/game/');
  await expect(page.locator('#main-menu')).toBeVisible();
  await expect(page.getByRole('button', { name: '继续旅程' })).toBeHidden();
  await expect(page.locator('#webgl-fallback')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('yanhuo-summer-echo:v1:progress'))).toBeNull();
});

test('coordinate diagnostics stay outside live and accessible output', async ({ page }, testInfo) => {
  await openSavedWetland(page);

  const status = page.locator('#game-status');
  await expect(status).toHaveAttribute('aria-hidden', 'true');
  await expect(status).not.toHaveAttribute('aria-live', /.+/);
  const liveText = await page.locator('[aria-live]').allTextContents();
  expect(liveText.join(' ')).not.toMatch(/player=|-?\d+\.\d+,-?\d+\.\d+,-?\d+\.\d+/);
  expect(await page.locator('#game-root').ariaSnapshot()).not.toContain('player=');
});

test('unavailable audio never blocks dialogue nodes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for audio degradation.');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined });
  });
  await page.goto('/game/?mode=new');
  await expect(page.locator('[data-speaker]')).toHaveText('林夏');
  const line = page.locator('[data-dialogue-line]');
  await expect(line).toHaveText('录音笔、电池、采访提纲都在。还差一件事，我们到底想带回来什么？');
  await line.click();
  await expect(page.locator('[data-speaker]')).toHaveText('陈屿');
});
