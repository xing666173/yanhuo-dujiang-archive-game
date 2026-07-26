import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

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
  expect(evidence.colorBuckets).toBeGreaterThan(12);
  expect(evidence.box.left).toBeCloseTo(0, 0);
  expect(evidence.box.top).toBeCloseTo(0, 0);
  expect(evidence.box.width).toBeCloseTo(evidence.viewport.width, 0);
  expect(evidence.box.height).toBeCloseTo(evidence.viewport.height, 0);
  return evidence;
}

async function playerPosition(page) {
  return page.locator('#game-status').evaluate((node) => {
    try {
      const status = JSON.parse(node.textContent);
      return Array.isArray(status.player) ? status.player : null;
    } catch {
      return null;
    }
  });
}

async function waitForPlayerPosition(page) {
  await expect.poll(async () => playerPosition(page)).not.toBeNull();
  return playerPosition(page);
}

test('activity room renders full-bleed and responds to forward movement', async ({ page }, testInfo) => {
  const errors = monitorPage(page);
  await page.goto('/game/?mode=new&testHud=1');
  await expect(page.locator('[data-scene-ready="activity-room"]')).toBeVisible();
  await expect(page.locator('#main-menu')).toBeHidden();
  await expect(page.locator('#hud')).toBeVisible();

  const pixels = await expectHealthyCanvas(page);
  const before = await waitForPlayerPosition(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyW');
  await expect.poll(async () => playerPosition(page)).not.toEqual(before);
  const after = await playerPosition(page);
  expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeGreaterThan(0.4);

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

test('reeds preview renders a varied, nonblank desktop scene', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop capture is the required wetland visual review.');
  const errors = monitorPage(page);
  await page.goto('/game/?mode=new&testHud=1&scene=reeds-wetland');
  await expect(page.locator('[data-scene-ready="reeds-wetland"]')).toBeVisible();
  const pixels = await expectHealthyCanvas(page);

  await fs.mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotDirectory, 'task-6-reeds-wetland-desktop.png'),
    animations: 'disabled'
  });
  await fs.writeFile(
    path.join(screenshotDirectory, 'task-6-reeds-wetland-desktop-pixels.json'),
    JSON.stringify(pixels, null, 2)
  );
  expect(errors, `canvas evidence: ${JSON.stringify(pixels)}`).toEqual([]);
});

test('desktop pointer drag changes the forward travel direction', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Pointer-drag look is a desktop contract.');
  const errors = monitorPage(page);
  await page.goto('/game/?mode=new&testHud=1');
  await expect(page.locator('[data-scene-ready="activity-room"]')).toBeVisible();
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

test('WebGL unavailability reveals the existing fallback without crashing', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for feature detection.');
  const errors = monitorPage(page);
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...arguments_) {
      if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return null;
      return originalGetContext.call(this, type, ...arguments_);
    };
  });
  await page.goto('/game/?mode=new');
  await expect(page.locator('#webgl-fallback')).toBeVisible();
  await expect(page.locator('#webgl-fallback')).toContainText('无法启动三维场景');
  await expect(page.locator('[data-scene-ready]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
