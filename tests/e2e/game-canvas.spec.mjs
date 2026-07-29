import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { characterVisuals } from '../../game/data/character-visuals.mjs';
import {
  beginFieldTask,
  completeFieldTaskByKind,
  installWetlandSave,
  openNewJourney,
  openSavedWetland,
  readSavedProgress,
  reachFieldHotspot,
  withVisibleControlHold
} from './helpers/game-state.mjs';

const screenshotDirectory = path.resolve('test-results');
const namedCharacterModelPaths = [
  '/game/assets/models/chen-yu.glb',
  '/game/assets/models/gu-yan.glb',
  '/game/assets/models/lin-xia.glb'
];
const environmentModelPaths = [
  '/game/assets/models/birch-tree-1.glb',
  '/game/assets/models/birch-tree-3.glb',
  '/game/assets/models/bush-large.glb'
];
const allModelPaths = [...namedCharacterModelPaths, ...environmentModelPaths];

function collectRuntimeIssues(page, { allowedAssetFailures = [] } = {}) {
  const pageErrors = [];
  const consoleErrors = [];
  const classifiedFallbackErrors = [];
  const fallbackWarnings = [];
  const unexpectedWarnings = [];
  const allowedFailurePaths = new Set(allowedAssetFailures);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const locationUrl = message.location().url;
      const pathname = locationUrl ? new URL(locationUrl).pathname : '';
      if (
        allowedFailurePaths.has(pathname)
        && message.text() === 'Failed to load resource: the server responded with a status of 404 (Not Found)'
      ) {
        classifiedFallbackErrors.push(pathname);
        return;
      }
      consoleErrors.push(message.text());
    }
    if (message.type() !== 'warning') return;
    if (message.text().startsWith('[model-fallback]')) fallbackWarnings.push(message.text());
    else unexpectedWarnings.push(message.text());
  });
  return {
    pageErrors,
    consoleErrors,
    classifiedFallbackErrors,
    fallbackWarnings,
    unexpectedWarnings
  };
}

function monitorPage(page, { allowedHttpErrors = [] } = {}) {
  const errors = [];
  const allowedErrorUrls = new Set(allowedHttpErrors.map(
    (value) => new URL(value, 'http://127.0.0.1:4173').href
  ));
  const acceptedModelResponseUrls = new Set();
  const pendingModelAborts = new Map();
  const isModelUrl = (url) => url.pathname.startsWith('/game/assets/models/')
    && url.pathname.endsWith('.glb');

  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4173') return;
    const errorText = request.failure()?.errorText || '';
    if (isModelUrl(url) && errorText === 'net::ERR_ABORTED') {
      if (acceptedModelResponseUrls.has(request.url())) return;
      const message = `requestfailed: ${request.url()} ${errorText}`;
      errors.push(message);
      const pending = pendingModelAborts.get(request.url()) ?? [];
      pending.push(message);
      pendingModelAborts.set(request.url(), pending);
      return;
    }
    errors.push(`requestfailed: ${request.url()} ${errorText}`);
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin !== 'http://127.0.0.1:4173') return;
    const acceptedModelResponse = isModelUrl(url) && (
      (response.status() >= 200 && response.status() < 300)
      || (response.status() >= 400 && allowedErrorUrls.has(response.url()))
    );
    if (acceptedModelResponse) {
      acceptedModelResponseUrls.add(response.url());
      for (const message of pendingModelAborts.get(response.url()) ?? []) {
        const index = errors.indexOf(message);
        if (index >= 0) errors.splice(index, 1);
      }
      pendingModelAborts.delete(response.url());
    }
    if (
      response.status() >= 400
      && !allowedErrorUrls.has(response.url())
    ) {
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

async function reachCameraHotspotWithKeyboard(page) {
  await reachFieldHotspot(page, 'camera-spot');
}

async function gameplayDiagnosticSnapshot(page) {
  return page.locator('#game-canvas').evaluate((canvas) => ({
    sceneId: document.querySelector('#game-root')?.dataset.sceneReady || '',
    activeHotspot: document.querySelector('#game-root')?.dataset.hotspot || '',
    playerPosition: canvas.dataset.playerPosition,
    playerYaw: canvas.dataset.playerYaw,
    cameraYaw: canvas.dataset.cameraYaw,
    completedHotspots: canvas.dataset.completedHotspots,
    movement: canvas.dataset.movement
  }));
}

async function instrumentModelLibraryDisposal(page) {
  await page.addInitScript(() => {
    window.__modelLibraryDisposeCount = 0;
  });
  await page.route('**/game/render/model-library.mjs', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const instrumented = source.replace(
      'export async function loadModelLibrary(',
      'async function loadModelLibraryBase('
    );
    expect(instrumented).not.toBe(source);
    await route.fulfill({
      response,
      body: `${instrumented}
export async function loadModelLibrary(options) {
  const library = await loadModelLibraryBase(options);
  const dispose = library.dispose.bind(library);
  let reported = false;
  library.dispose = () => {
    if (!reported) {
      reported = true;
      window.__modelLibraryDisposeCount += 1;
    }
    return dispose();
  };
  return library;
}
`
    });
  });
}

async function characterDiagnosticSnapshot(page) {
  return page.locator('#game-canvas').evaluate((canvas) => ({
    modelLibraryReady: canvas.dataset.modelLibraryReady,
    importedCharacterCount: canvas.dataset.importedCharacterCount,
    namedCharacterCount: canvas.dataset.namedCharacterCount,
    namedCharacterRootCount: canvas.dataset.namedCharacterRootCount,
    activeAnimationMixerCount: canvas.dataset.activeAnimationMixerCount,
    characterModelIds: canvas.dataset.characterModelIds,
    playerAction: canvas.dataset.playerAction,
    playerModelSource: canvas.dataset.playerModelSource
  }));
}

async function environmentDiagnosticSnapshot(page) {
  return page.locator('#game-canvas').evaluate((canvas) => ({
    importedEnvironmentCount: canvas.dataset.importedEnvironmentCount,
    environmentModelIds: canvas.dataset.environmentModelIds,
    importedEnvironmentTriangles: canvas.dataset.importedEnvironmentTriangles,
    importedEnvironmentDrawCalls: canvas.dataset.importedEnvironmentDrawCalls,
    activeQuality: canvas.dataset.activeQuality
  }));
}

function expectNamedCharacterGenderContract() {
  expect({
    'chen-yu': characterVisuals['chen-yu'].gender,
    'gu-yan': characterVisuals['gu-yan'].gender,
    'lin-xia': characterVisuals['lin-xia'].gender,
    player: characterVisuals.player.gender
  }).toEqual({
    'chen-yu': 'male',
    'gu-yan': 'male',
    'lin-xia': 'female',
    player: null
  });
}

async function instrumentWorldReducedMotion(page) {
  await page.addInitScript(() => {
    window.__worldReducedMotionCalls = [];
  });
  await page.route('**/game/render/world.mjs', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const instrumented = source.replace(
      'export function createWorld({',
      'function createWorldBase({'
    );
    expect(instrumented).not.toBe(source);
    await route.fulfill({
      response,
      body: `${instrumented}
export function createWorld(options) {
  const world = createWorldBase(options);
  const setReducedMotion = world.setReducedMotion.bind(world);
  world.setReducedMotion = (value) => {
    window.__worldReducedMotionCalls.push(Boolean(value));
    return setReducedMotion(value);
  };
  return world;
}
`
    });
  });
}

async function elementCenter(locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Expected a measurable visible element.');
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2
  };
}

async function waitForAnimationFrames(page, count = 8) {
  await page.evaluate((frameCount) => new Promise((resolve) => {
    let remaining = frameCount;
    const next = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }), count);
}

async function triggerTrustedWindowBlur(page) {
  await page.evaluate(() => {
    window.__fieldTaskBlurDiagnostic = {
      isTrusted: null,
      visibilityChanges: 0,
      pointerEnds: []
    };
    window.addEventListener('blur', (event) => {
      window.__fieldTaskBlurDiagnostic.isTrusted = event.isTrusted;
    }, { once: true });
    document.addEventListener('visibilitychange', () => {
      window.__fieldTaskBlurDiagnostic.visibilityChanges += 1;
    });
    const action = document.querySelector('[data-field-action]');
    for (const type of ['pointerup', 'pointercancel']) {
      action?.addEventListener(type, () => {
        window.__fieldTaskBlurDiagnostic.pointerEnds.push(type);
      }, { once: true });
    }
  });

  try {
    await page.evaluate(() => {
      const frame = document.createElement('iframe');
      frame.dataset.fieldTaskBlurProbe = 'true';
      frame.tabIndex = -1;
      frame.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
      document.body.append(frame);
      frame.contentWindow.focus();
    });
    await expect.poll(async () => page.evaluate(() => window.__fieldTaskBlurDiagnostic.isTrusted)).toBe(true);
    const diagnostic = await page.evaluate(() => ({
      ...window.__fieldTaskBlurDiagnostic,
      visibilityState: document.visibilityState
    }));
    expect(diagnostic).toEqual({
      isTrusted: true,
      visibilityChanges: 0,
      pointerEnds: [],
      visibilityState: 'visible'
    });
  } finally {
    await page.evaluate(() => {
      document.querySelector('[data-field-task-blur-probe]')?.remove();
      window.focus();
    });
  }
}

async function timingGeometry(page) {
  const layer = page.locator('#field-task-layer');
  const routeIndex = Number(await layer.getAttribute('data-route-index'));
  return page.locator('[data-timing-stage]').evaluate((stage, index) => {
    const marker = stage.querySelector('[data-route-marker]');
    const node = stage.querySelectorAll('[data-route-nodes] li')[index];
    if (!marker || !node) throw new Error(`Timing controls are not measurable at route index ${index}.`);
    const stageBox = stage.getBoundingClientRect();
    const markerBox = marker.getBoundingClientRect();
    const nodeBox = node.getBoundingClientRect();
    const markerPosition = {
      x: (markerBox.left + markerBox.width / 2 - stageBox.left) / stageBox.width,
      y: (markerBox.top + markerBox.height / 2 - stageBox.top) / stageBox.height
    };
    const nodePosition = {
      x: (nodeBox.left + nodeBox.width / 2 - stageBox.left) / stageBox.width,
      y: (nodeBox.top + nodeBox.height / 2 - stageBox.top) / stageBox.height
    };
    return {
      routeIndex: index,
      distance: Math.hypot(
        markerPosition.x - nodePosition.x,
        markerPosition.y - nodePosition.y
      )
    };
  }, routeIndex);
}

async function waitForTimingAlignment(page, routeIndex) {
  const deadline = Date.now() + 5_000;
  let closest = Number.POSITIVE_INFINITY;
  let first = null;
  let last = null;
  let samples = 0;
  while (Date.now() < deadline) {
    const geometry = await timingGeometry(page);
    first ||= geometry;
    last = geometry;
    samples += 1;
    if (geometry.routeIndex !== routeIndex) {
      throw new Error(`Expected timing route ${routeIndex}, received ${geometry.routeIndex}.`);
    }
    closest = Math.min(closest, geometry.distance);
    if (geometry.distance <= 0.035) return geometry;
    await page.waitForTimeout(10);
  }
  throw new Error(`Timing route ${routeIndex} never aligned: ${JSON.stringify({ closest, samples, first, last })}`);
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

test('wetland render offsets keep player feet and hotspot markers above the declared surface', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One renderer is sufficient for world-space bounds.');
  await openSavedWetland(page, { quality: 'high' });
  const canvas = page.locator('#game-canvas');

  await expect(canvas).toHaveAttribute('data-visual-surface-y', '0.260000');
  await expect(canvas).toHaveAttribute('data-player-foot-min-y', /\d/);
  await expect(canvas).toHaveAttribute('data-hotspot-marker-min-y', /\d/);

  const bounds = await canvas.evaluate((node) => ({
    surfaceY: Number(node.dataset.visualSurfaceY),
    playerFootMinY: Number(node.dataset.playerFootMinY),
    hotspotMarkerMinY: Number(node.dataset.hotspotMarkerMinY),
    playerPosition: node.dataset.playerPosition.split(',').map(Number)
  }));
  expect(bounds.surfaceY).toBe(0.26);
  expect(bounds.playerFootMinY).toBeGreaterThanOrEqual(bounds.surfaceY - 1e-6);
  expect(bounds.hotspotMarkerMinY).toBeGreaterThanOrEqual(bounds.surfaceY - 1e-6);
  expect(bounds.playerPosition[1]).toBe(0);
  expect((await waitForPlayerPosition(page))[1]).toBe(0);
});

test('dialogue interruption releases an active look drag and blocks later yaw changes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Pointer capture is a desktop contract.');
  const errors = monitorPage(page);
  await openSavedWetland(page);
  await reachCameraHotspotWithKeyboard(page);

  const canvas = page.locator('#game-canvas');
  await canvas.evaluate((node) => {
    node.addEventListener('pointerdown', (event) => {
      window.__lookContractPointerId = event.pointerId;
    }, { once: true });
  });
  const beforeYaw = Number(await canvas.getAttribute('data-camera-yaw'));
  await page.mouse.move(720, 450);
  await page.mouse.down();
  await page.mouse.move(810, 450, { steps: 3 });
  await expect.poll(async () => Number(await canvas.getAttribute('data-camera-yaw'))).not.toBe(beforeYaw);

  await page.keyboard.press('KeyE');
  await expect(page.locator('#dialogue-layer')).toBeVisible();
  const dialogueYaw = Number(await canvas.getAttribute('data-camera-yaw'));
  await expect.poll(async () => canvas.evaluate((node) => (
    !node.hasPointerCapture(window.__lookContractPointerId)
  ))).toBe(true);

  await page.mouse.move(940, 450, { steps: 3 });
  await canvas.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  expect(Number(await canvas.getAttribute('data-camera-yaw'))).toBe(dialogueYaw);
  await page.mouse.up();
  expect(errors).toEqual([]);
});

test('canvas diagnostics update on ownership changes instead of every animation frame', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One renderer is sufficient for diagnostic cadence.');
  await openSavedWetland(page, {
    quality: 'high',
    visitedHotspots: ['camera-spot']
  });
  const canvas = page.locator('#game-canvas');
  await expect(canvas).toHaveAttribute('data-completed-hotspots', 'camera-spot');
  const initialPosition = await canvas.getAttribute('data-player-position');

  await canvas.evaluate((node) => {
    const tracked = [
      'data-player-root-name',
      'data-player-root-count',
      'data-renderer-antialias',
      'data-completed-hotspots',
      'data-movement',
      'data-player-yaw',
      'data-camera-yaw',
      'data-player-position',
      'data-visual-surface-y',
      'data-player-foot-min-y',
      'data-hotspot-marker-min-y'
    ];
    const counts = Object.fromEntries(tracked.map((name) => [name, 0]));
    const observer = new MutationObserver((records) => {
      for (const record of records) counts[record.attributeName] += 1;
    });
    observer.observe(node, { attributes: true, attributeFilter: tracked });
    window.__diagnosticContract = { counts, frames: 0, done: false };

    const countFrame = () => {
      window.__diagnosticContract.frames += 1;
      if (window.__diagnosticContract.frames >= 36) {
        observer.disconnect();
        window.__diagnosticContract.done = true;
        return;
      }
      requestAnimationFrame(countFrame);
    };
    requestAnimationFrame(countFrame);
  });
  await expect.poll(async () => canvas.evaluate(() => window.__diagnosticContract.done)).toBe(true);
  const idle = await canvas.evaluate(() => window.__diagnosticContract);
  for (const attribute of [
    'data-player-root-name',
    'data-player-root-count',
    'data-renderer-antialias',
    'data-completed-hotspots',
    'data-movement',
    'data-player-yaw',
    'data-camera-yaw',
    'data-visual-surface-y',
    'data-player-foot-min-y',
    'data-hotspot-marker-min-y'
  ]) {
    expect(idle.counts[attribute], `${attribute} must not be written by idle frames`).toBe(0);
  }
  expect(idle.counts['data-player-position']).toBeLessThanOrEqual(6);

  await page.keyboard.down('KeyW');
  try {
    await expect(canvas).toHaveAttribute('data-movement', '0.0000,1.0000');
    await expect.poll(async () => canvas.getAttribute('data-player-position')).not.toBe(initialPosition);
  } finally {
    await page.keyboard.up('KeyW');
  }
  await expect(canvas).toHaveAttribute('data-movement', '0.0000,0.0000');

  const beforeYaw = await canvas.getAttribute('data-camera-yaw');
  await page.mouse.move(720, 450);
  await page.mouse.down();
  await page.mouse.move(790, 450, { steps: 2 });
  await page.mouse.up();
  await expect.poll(async () => canvas.getAttribute('data-camera-yaw')).not.toBe(beforeYaw);

  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  for (const attribute of Object.keys(idle.counts)) {
    await expect(canvas).not.toHaveAttribute(attribute);
  }
});

for (const [quality, expectedCapability] of [['low', 'false'], ['high', 'true']]) {
  test(`renderer startup antialias capability follows ${quality} quality`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One desktop WebGL renderer is sufficient.');
    await openSavedWetland(page, { quality });
    await expect(page.locator('#game-canvas')).toHaveAttribute(
      'data-renderer-antialias',
      expectedCapability
    );
  });
}

test('live quality transitions preserve renderer identity and gameplay state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One desktop WebGL renderer is sufficient.');
  await openSavedWetland(page, {
    quality: 'high',
    visitedHotspots: ['camera-spot']
  });
  const canvas = page.locator('#game-canvas');
  await expect(canvas).toHaveAttribute('data-renderer-antialias', 'true');

  const initialPosition = await canvas.getAttribute('data-player-position');
  await page.keyboard.down('KeyW');
  try {
    await expect.poll(async () => canvas.getAttribute('data-player-position')).not.toBe(initialPosition);
  } finally {
    await page.keyboard.up('KeyW');
  }
  await expect(canvas).toHaveAttribute('data-movement', '0.0000,0.0000');
  await waitForPlayerDiagnosticToSettle(page);
  const initialYaw = await canvas.getAttribute('data-camera-yaw');
  await page.mouse.move(720, 450);
  await page.mouse.down();
  await page.mouse.move(790, 450, { steps: 2 });
  await page.mouse.up();
  await expect.poll(async () => canvas.getAttribute('data-camera-yaw')).not.toBe(initialYaw);

  await canvas.evaluate((node) => {
    window.__rendererIdentity = {
      canvas: node,
      context: node.getContext('webgl2') || node.getContext('webgl')
    };
  });
  const before = await gameplayDiagnosticSnapshot(page);

  for (const quality of ['low', 'high']) {
    await page.locator('[data-action="scene-settings"]').click();
    await expect(page.locator('#settings-panel')).toBeVisible();
    await page.locator(`label:has(input[name="quality"][value="${quality}"])`).click();
    await expect(page.locator('#game-status')).toHaveAttribute('data-quality', quality);
    await page.locator('[data-action="close-settings"]').click();
    await expect(page.locator('#settings-panel')).toBeHidden();
    await expect(canvas).toHaveAttribute('data-renderer-antialias', 'true');

    expect(await canvas.evaluate((node) => ({
      sameCanvas: window.__rendererIdentity.canvas === node,
      sameContext: window.__rendererIdentity.context === (
        node.getContext('webgl2') || node.getContext('webgl')
      )
    }))).toEqual({ sameCanvas: true, sameContext: true });
    expect(await gameplayDiagnosticSnapshot(page)).toEqual(before);
    const environment = await environmentDiagnosticSnapshot(page);
    expect(environment.activeQuality).toBe(quality);
    expect(Number(environment.importedEnvironmentCount)).toBe(quality === 'high' ? 8 : 2);
    expect(Number(environment.importedEnvironmentDrawCalls)).toBeLessThanOrEqual(18);
    expect(environment.environmentModelIds.includes('bush-large')).toBe(quality === 'high');
    expect(Number(environment.importedEnvironmentTriangles)).toBeGreaterThan(0);
    await expect(canvas).toHaveAttribute('data-named-character-count', '3');
  }
});

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
  const canvas = page.locator('#game-canvas');
  await expect(up).toBeVisible();
  const box = await up.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(canvas).toHaveAttribute('data-player-action', 'Walk');
  await expect.poll(async () => (
    Number((await canvas.getAttribute('data-player-position')).split(',')[2])
  )).toBeLessThan(before[2] - 0.5);
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-movement', '0.0000,0.0000');
  await expect(canvas).toHaveAttribute('data-player-action', 'Idle');
  await waitForPlayerDiagnosticToSettle(page);
  const released = (await canvas.getAttribute('data-player-position')).split(',').map(Number);
  expect(released[2]).toBeLessThan(before[2] - 0.5);
  await waitForPlayerDiagnosticToSettle(page);
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

test('opening dialogue history clears held keyboard movement and the walk action', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Keyboard history ownership is a desktop contract.');
  await openSavedWetland(page);
  const canvas = page.locator('#game-canvas');

  await page.keyboard.down('KeyW');
  await expect(canvas).toHaveAttribute('data-player-action', 'Walk');
  await page.locator('[data-action="history"]').click();
  await expect(page.locator('#game-root')).toHaveAttribute('data-history-open', 'true');
  await expect(canvas).toHaveAttribute('data-movement', '0.0000,0.0000');
  await expect(canvas).toHaveAttribute('data-player-action', 'Idle');
  await page.keyboard.up('KeyW');
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
  await expect(page.locator('#game-canvas')).toHaveAttribute('data-renderer-antialias', 'true');

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
  await expect(page.locator('#game-canvas')).toHaveAttribute('data-renderer-antialias', 'true');
  await expect.poll(async () => playerPosition(page)).not.toEqual(before);

  await page.mouse.up();
  await expect(page.locator('#game-canvas')).toHaveAttribute('data-movement', '0.0000,0.0000');
});

test('normal model loading returns 200 for all six same-origin GLBs without runtime errors', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for release model requests.');
  const issues = collectRuntimeIssues(page);
  const modelResponses = new Map();
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (!allModelPaths.includes(url.pathname)) return;
    modelResponses.set(url.pathname, {
      origin: url.origin,
      status: response.status()
    });
  });

  await openSavedWetland(page, { quality: 'high' });
  await expect.poll(() => modelResponses.size).toBe(allModelPaths.length);

  expect(Object.fromEntries([...modelResponses].sort())).toEqual(Object.fromEntries(
    allModelPaths.sort().map((pathname) => [
      pathname,
      { origin: 'http://127.0.0.1:4173', status: 200 }
    ])
  ));
  expect(issues).toEqual({
    pageErrors: [],
    consoleErrors: [],
    classifiedFallbackErrors: [],
    fallbackWarnings: [],
    unexpectedWarnings: []
  });
});

test('page monitor reports model abort and HTTP failures but clears an Edge duplicate abort after success', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One Edge project is sufficient for monitor behavior.');
  await page.goto('/');
  const errors = monitorPage(page);
  const requests = {
    abort: 'http://127.0.0.1:4173/game/assets/models/monitor-abort.glb',
    missing: 'http://127.0.0.1:4173/game/assets/models/monitor-404.glb',
    server: 'http://127.0.0.1:4173/game/assets/models/monitor-500.glb',
    duplicate: 'http://127.0.0.1:4173/game/assets/models/monitor-duplicate.glb'
  };
  let duplicateRequests = 0;
  await page.route(requests.abort, (route) => route.abort('aborted'));
  await page.route(requests.missing, (route) => route.fulfill({ status: 404, body: '' }));
  await page.route(requests.server, (route) => route.fulfill({ status: 500, body: '' }));
  await page.route(requests.duplicate, (route) => {
    duplicateRequests += 1;
    if (duplicateRequests === 1) return route.abort('aborted');
    return route.fulfill({ status: 200, body: 'ok' });
  });

  await page.evaluate(async (urls) => {
    await fetch(urls.abort).catch(() => null);
    await fetch(urls.missing);
    await fetch(urls.server);
    await fetch(urls.duplicate).catch(() => null);
    await fetch(urls.duplicate);
  }, requests);

  expect(errors.some((error) => (
    error.includes('monitor-abort.glb') && error.includes('ERR_ABORTED')
  ))).toBe(true);
  expect(errors).toContain(`response: 404 ${requests.missing}`);
  expect(errors).toContain(`response: 500 ${requests.server}`);
  expect(errors.some((error) => error.includes('monitor-duplicate.glb'))).toBe(false);
});

test('imported player reports the named team and movement transitions', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for model diagnostics.');
  const errors = monitorPage(page);
  await openSavedWetland(page, { quality: 'high' });

  await expect.poll(async () => characterDiagnosticSnapshot(page)).toEqual({
    modelLibraryReady: 'true',
    importedCharacterCount: '3',
    namedCharacterCount: '3',
    namedCharacterRootCount: '3',
    activeAnimationMixerCount: '3',
    characterModelIds: 'chen-yu,gu-yan,lin-xia',
    playerAction: 'Idle',
    playerModelSource: 'imported'
  });
  const canvas = page.locator('#game-canvas');
  await expect(canvas).toHaveAttribute('data-player-model-source', 'imported');
  await expect(canvas).toHaveAttribute('data-named-character-root-count', '3');
  await expect(canvas).toHaveAttribute('data-imported-character-count', '3');
  await expect(canvas).toHaveAttribute('data-character-model-ids', 'chen-yu,gu-yan,lin-xia');
  await page.keyboard.down('KeyW');
  try {
    await expect(canvas).toHaveAttribute('data-player-action', 'Walk');
    await expect.poll(async () => Number(await canvas.getAttribute('data-player-yaw')))
      .toBeCloseTo(Math.PI, 5);
  } finally {
    await page.keyboard.up('KeyW');
  }
  await expect(canvas).toHaveAttribute('data-player-action', 'Idle');
  expectNamedCharacterGenderContract();
  await expect(page.locator('#webgl-fallback')).toBeHidden();
  expect(errors).toEqual([]);
});

for (const quality of ['high', 'low']) {
  test(`${quality} quality wetland reports imported environment diagnostics on a nonblank canvas`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for environment diagnostics.');
    const errors = monitorPage(page);
    await openSavedWetland(page, { quality });

    const expectedCount = quality === 'high' ? 8 : 2;
    await expect.poll(async () => environmentDiagnosticSnapshot(page)).toMatchObject({
      importedEnvironmentCount: String(expectedCount),
      activeQuality: quality
    });
    const diagnostics = await environmentDiagnosticSnapshot(page);
    expect(Number(diagnostics.importedEnvironmentTriangles)).toBeGreaterThan(0);
    expect(Number(diagnostics.importedEnvironmentDrawCalls)).toBeLessThanOrEqual(18);
    expect(diagnostics.environmentModelIds.includes('bush-large')).toBe(quality === 'high');
    await expectHealthyCanvas(page);
    await expect(page.locator('#webgl-fallback')).toBeHidden();
    expect(errors).toEqual([]);
  });
}

test('one missing environment GLB keeps the high-quality wetland ready and playable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for environment fallback.');
  const missingPath = '/game/assets/models/birch-tree-3.glb';
  const errors = monitorPage(page, { allowedHttpErrors: [missingPath] });
  await page.route(`**${missingPath}`, (route) => route.fulfill({
    status: 404,
    contentType: 'application/octet-stream',
    body: ''
  }));
  await openSavedWetland(page, { quality: 'high' });

  await expect.poll(async () => environmentDiagnosticSnapshot(page)).toMatchObject({
    importedEnvironmentCount: '6',
    activeQuality: 'high'
  });
  const diagnostics = await environmentDiagnosticSnapshot(page);
  expect(diagnostics.environmentModelIds).not.toContain('birch-tree-3');
  await expect(page.locator('#game-root')).toHaveAttribute('data-scene-ready', 'reeds-wetland');
  await expect(page.locator('#webgl-fallback')).toBeHidden();
  const before = await waitForPlayerPosition(page);
  await page.keyboard.down('KeyW');
  try {
    await expect(page.locator('#game-canvas')).toHaveAttribute('data-player-action', 'Walk');
    await expect.poll(async () => playerPosition(page)).not.toEqual(before);
  } finally {
    await page.keyboard.up('KeyW');
  }
  const after = await waitForPlayerPosition(page);
  expect(after).not.toEqual(before);
  await expectHealthyCanvas(page);
  expect(errors).toEqual([]);
});

test('model fallback keeps a single character GLB 404 playable and interactive', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for model fallback.');
  const errors = monitorPage(page, {
    allowedHttpErrors: ['/game/assets/models/gu-yan.glb']
  });
  await page.route('**/game/assets/models/gu-yan.glb', (route) => route.fulfill({
    status: 404,
    contentType: 'application/octet-stream',
    body: ''
  }));
  await openSavedWetland(page, { quality: 'high' });

  await expect.poll(async () => characterDiagnosticSnapshot(page)).toEqual({
    modelLibraryReady: 'true',
    importedCharacterCount: '2',
    namedCharacterCount: '3',
    namedCharacterRootCount: '3',
    activeAnimationMixerCount: '2',
    characterModelIds: 'chen-yu,lin-xia',
    playerAction: 'Idle',
    playerModelSource: 'imported'
  });
  expectNamedCharacterGenderContract();
  await expect(page.locator('#webgl-fallback')).toBeHidden();

  const before = await waitForPlayerPosition(page);
  await page.keyboard.down('KeyW');
  try {
    await expect(page.locator('#game-canvas')).toHaveAttribute('data-player-action', 'Walk');
  } finally {
    await page.keyboard.up('KeyW');
  }
  await expect(page.locator('#game-canvas')).toHaveAttribute('data-player-action', 'Idle');
  await reachCameraHotspotWithKeyboard(page);
  const after = await waitForPlayerPosition(page);
  expect(after).not.toEqual(before);
  await expect(page.locator('[data-action="interact-prompt"]')).toBeVisible();
  await beginFieldTask(page, 'camera-spot');

  expect(errors).toEqual([]);
});

test('all named character GLB 404 responses keep the procedural team playable and interactive', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for all-model fallback.');
  const errors = monitorPage(page, { allowedHttpErrors: namedCharacterModelPaths });
  for (const pathname of namedCharacterModelPaths) {
    await page.route(`**${pathname}`, (route) => route.fulfill({
      status: 404,
      contentType: 'application/octet-stream',
      body: ''
    }));
  }
  await openSavedWetland(page, { quality: 'high' });

  await expect.poll(async () => characterDiagnosticSnapshot(page)).toEqual({
    modelLibraryReady: 'true',
    importedCharacterCount: '0',
    namedCharacterCount: '3',
    namedCharacterRootCount: '3',
    activeAnimationMixerCount: '0',
    characterModelIds: '',
    playerAction: 'Idle',
    playerModelSource: 'procedural'
  });
  expectNamedCharacterGenderContract();
  await expect(page.locator('#webgl-fallback')).toBeHidden();

  const before = await waitForPlayerPosition(page);
  await page.keyboard.down('KeyW');
  try {
    await expect(page.locator('#game-canvas')).toHaveAttribute('data-player-action', 'Walk');
    await expect.poll(async () => {
      const yaw = Number(await page.locator('#game-canvas').getAttribute('data-player-yaw'));
      return Math.abs(Math.atan2(Math.sin(yaw), Math.cos(yaw)));
    }).toBeLessThan(0.00001);
  } finally {
    await page.keyboard.up('KeyW');
  }
  await expect(page.locator('#game-canvas')).toHaveAttribute('data-player-action', 'Idle');
  await reachCameraHotspotWithKeyboard(page);
  expect(await waitForPlayerPosition(page)).not.toEqual(before);
  await expect(page.locator('[data-action="interact-prompt"]')).toBeVisible();
  await beginFieldTask(page, 'camera-spot');

  expect(errors).toEqual([]);
});

test('one character and one environment fallback preserve the complete playable loop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for combined fallback.');
  const missingPaths = [
    '/game/assets/models/gu-yan.glb',
    '/game/assets/models/birch-tree-3.glb'
  ];
  const networkErrors = monitorPage(page, { allowedHttpErrors: missingPaths });
  const issues = collectRuntimeIssues(page, { allowedAssetFailures: missingPaths });
  for (const pathname of missingPaths) {
    await page.route(`**${pathname}`, (route) => route.fulfill({
      status: 404,
      contentType: 'application/octet-stream',
      body: ''
    }));
  }

  await openSavedWetland(page, { quality: 'high' });
  const canvas = page.locator('#game-canvas');
  await expect.poll(async () => characterDiagnosticSnapshot(page)).toMatchObject({
    importedCharacterCount: '2',
    namedCharacterCount: '3',
    namedCharacterRootCount: '3',
    activeAnimationMixerCount: '2'
  });
  await expect.poll(async () => environmentDiagnosticSnapshot(page)).toMatchObject({
    importedEnvironmentCount: '6',
    activeQuality: 'high'
  });

  const before = await waitForPlayerPosition(page);
  await page.keyboard.down('KeyW');
  try {
    await expect(canvas).toHaveAttribute('data-player-action', 'Walk');
    await expect.poll(async () => playerPosition(page)).not.toEqual(before);
  } finally {
    await page.keyboard.up('KeyW');
  }
  await expect(canvas).toHaveAttribute('data-player-action', 'Idle');

  await reachCameraHotspotWithKeyboard(page);
  await expect(page.locator('[data-action="interact-prompt"]')).toBeVisible();
  await page.locator('[data-action="interact-prompt"]').click();
  await expect(page.locator('#dialogue-layer')).toBeVisible();
  await expect(canvas).toHaveAttribute('data-player-action', 'Idle');
  for (let attempt = 0; attempt < 6 && await page.locator('#field-task-layer').isHidden(); attempt += 1) {
    await page.locator('[data-dialogue-line]').click();
  }
  await expect(page.locator('#field-task-layer')).toBeVisible();
  await expect(canvas).toHaveAttribute('data-player-action', 'Idle');

  await page.locator('[data-field-cancel]').click();
  await expect(page.locator('#field-task-layer')).toBeHidden();
  await page.locator('[data-action="scene-settings"]').click();
  await page.getByRole('radio', { name: '低' }).check();
  await expect(page.locator('#game-status')).toHaveAttribute('data-quality', 'low');
  await page.getByRole('button', { name: '关闭设置' }).click();

  const saved = await readSavedProgress(page);
  const savedSettings = await page.evaluate(() => JSON.parse(
    localStorage.getItem('yanhuo-summer-echo:v1:settings')
  ));
  expect(saved.sessionState.sceneId).toBe('reeds-wetland');
  expect(saved.storyState.activeScriptId).toBe('reeds-camera');
  expect(savedSettings.quality).toBe('low');
  expect(networkErrors).toEqual([]);
  expect(issues.pageErrors).toEqual([]);
  expect(issues.consoleErrors).toEqual([]);
  expect(issues.classifiedFallbackErrors.sort()).toEqual(missingPaths.sort());
  expect(issues.unexpectedWarnings).toEqual([]);
  expect(issues.fallbackWarnings).toEqual([
    '[model-fallback] Optional models unavailable: birch-tree-3, gu-yan'
  ]);
});

test('quality rebuilds keep one player, three named roots, and exactly three active mixers', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for rebuild ownership.');
  const issues = collectRuntimeIssues(page);
  await openSavedWetland(page, { quality: 'high' });
  const canvas = page.locator('#game-canvas');

  for (const quality of ['low', 'high', 'low', 'high']) {
    await expect.poll(async () => characterDiagnosticSnapshot(page)).toMatchObject({
      namedCharacterCount: '3',
      namedCharacterRootCount: '3',
      activeAnimationMixerCount: '3'
    });
    await expect(canvas).toHaveAttribute('data-player-root-count', '1');
    await page.locator('[data-action="scene-settings"]').click();
    await page.getByRole('radio', { name: quality === 'high' ? '高' : '低' }).check();
    await expect(page.locator('#game-status')).toHaveAttribute('data-quality', quality);
    await page.getByRole('button', { name: '关闭设置' }).click();
  }

  await expect.poll(async () => characterDiagnosticSnapshot(page)).toMatchObject({
    namedCharacterCount: '3',
    namedCharacterRootCount: '3',
    activeAnimationMixerCount: '3'
  });
  await expect(canvas).toHaveAttribute('data-player-root-count', '1');
  expect(issues).toEqual({
    pageErrors: [],
    consoleErrors: [],
    classifiedFallbackErrors: [],
    fallbackWarnings: [],
    unexpectedWarnings: []
  });
});

test('settings propagate reduced motion to the active 3D world without rebuilding the scene', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for live presentation settings.');
  await instrumentWorldReducedMotion(page);
  await openSavedWetland(page, { quality: 'high' });
  const canvas = page.locator('#game-canvas');
  const before = await characterDiagnosticSnapshot(page);

  await page.locator('[data-action="scene-settings"]').click();
  await page.getByRole('checkbox', { name: '减少动态效果' }).check();
  await expect.poll(async () => page.evaluate(() => window.__worldReducedMotionCalls)).toEqual([true]);
  await page.locator('[data-action="close-settings"]').click();

  expect(await characterDiagnosticSnapshot(page)).toEqual(before);
  await expect(canvas).toHaveAttribute('data-player-model-source', 'imported');
});

test('world disposal releases its model library exactly once', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for library ownership.');
  await instrumentModelLibraryDisposal(page);
  await openNewJourney(page);
  expect(await page.evaluate(() => window.__modelLibraryDisposeCount)).toBe(0);
  await expect(page.locator('#game-canvas')).toHaveAttribute('data-player-model-source', 'imported');

  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
  });
  await expect.poll(async () => page.evaluate(() => window.__modelLibraryDisposeCount)).toBe(1);
  await expect(page.locator('#game-canvas')).not.toHaveAttribute('data-player-model-source', /.+/);
});

test('stale model loading generation disposes the candidate library without late world setup', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for stale model loading.');
  await instrumentModelLibraryDisposal(page);
  let releaseModel;
  let modelRequestHeld = false;
  const modelReleased = new Promise((resolve) => {
    releaseModel = resolve;
  });
  await page.route('**/game/assets/models/lin-xia.glb', async (route) => {
    modelRequestHeld = true;
    await modelReleased;
    await route.continue();
  });

  await page.goto('/game/?mode=new');
  await expect.poll(() => modelRequestHeld).toBe(true);
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
  });
  releaseModel();

  await expect.poll(async () => page.evaluate(() => window.__modelLibraryDisposeCount)).toBe(1);
  await expect(page.locator('#game-root')).not.toHaveAttribute('data-scene-ready', /.+/);
  await expect(page.locator('#game-canvas')).not.toHaveAttribute('data-model-library-ready', /.+/);
  await expect(page.locator('#game-canvas')).not.toHaveAttribute('data-named-character-count', /.+/);
  await expect(page.locator('#game-canvas')).not.toHaveAttribute('data-active-animation-mixer-count', /.+/);
  await expect(page.locator('#webgl-fallback')).toBeHidden();
});

test('world creation failure disposes the candidate model library', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for candidate ownership.');
  await instrumentModelLibraryDisposal(page);
  await page.route('**/game/render/world.mjs', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const instrumented = source.replace(
      'export function createWorld({',
      'function createWorldBase({'
    );
    expect(instrumented).not.toBe(source);
    await route.fulfill({
      response,
      body: `${instrumented}
export function createWorld() {
  throw new Error('intentional createWorld failure');
}
`
    });
  });

  await page.goto('/game/?mode=new');
  await expect(page.locator('#webgl-fallback')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.__modelLibraryDisposeCount)).toBe(1);
  await expect(page.locator('#game-root')).not.toHaveAttribute('data-scene-ready', /.+/);
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
    const response = await route.fetch();
    const source = await response.text();
    await worldReleased;
    await route.fulfill({
      response,
      body: `${source}
window.__pendingImportDiagnostics.worldModuleEvaluated = true;
`
    });
  });
  await page.addInitScript(() => {
    const diagnostics = {
      pageHidden: false,
      animationFramesRequested: 0,
      audioContextsConstructed: 0,
      listenersAddedAfterPagehide: 0,
      webglContextsRequested: 0,
      worldModuleEvaluated: false
    };
    window.__pendingImportDiagnostics = diagnostics;
    const originals = {
      requestAnimationFrame: window.requestAnimationFrame,
      AudioContext: window.AudioContext,
      addEventListener: EventTarget.prototype.addEventListener,
      getContext: HTMLCanvasElement.prototype.getContext
    };
    window.__pendingImportOriginals = originals;
    window.__restorePendingImportInstrumentation = () => {
      window.requestAnimationFrame = originals.requestAnimationFrame;
      window.AudioContext = originals.AudioContext;
      EventTarget.prototype.addEventListener = originals.addEventListener;
      HTMLCanvasElement.prototype.getContext = originals.getContext;
    };

    window.requestAnimationFrame = (callback) => {
      diagnostics.animationFramesRequested += 1;
      return originals.requestAnimationFrame.call(window, callback);
    };

    if (originals.AudioContext) {
      window.AudioContext = class InstrumentedAudioContext extends originals.AudioContext {
        constructor(...args) {
          super(...args);
          diagnostics.audioContextsConstructed += 1;
        }
      };
    }

    EventTarget.prototype.addEventListener = function instrumentedAddEventListener(...args) {
      if (diagnostics.pageHidden) diagnostics.listenersAddedAfterPagehide += 1;
      return originals.addEventListener.apply(this, args);
    };

    HTMLCanvasElement.prototype.getContext = function instrumentedGetContext(type, ...args) {
      if (/^webgl2?$/.test(type)) diagnostics.webglContextsRequested += 1;
      return originals.getContext.call(this, type, ...args);
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
  await expect.poll(async () => page.evaluate(
    () => window.__pendingImportDiagnostics.worldModuleEvaluated
  )).toBe(true);

  const afterRelease = await page.evaluate(() => ({ ...window.__pendingImportDiagnostics }));
  expect(afterRelease.animationFramesRequested).toBe(baseline.animationFramesRequested);
  expect(afterRelease.audioContextsConstructed).toBe(baseline.audioContextsConstructed);
  expect(afterRelease.listenersAddedAfterPagehide).toBe(baseline.listenersAddedAfterPagehide);
  expect(afterRelease.webglContextsRequested).toBe(baseline.webglContextsRequested);
  await expect(page.locator('#game-root')).not.toHaveAttribute('data-scene-ready', /.+/);
  await expect(page.locator('[data-speaker]')).toHaveText('');
  await expect(page.locator('.runtime-controls')).toHaveCount(0);

  const restoration = await page.evaluate(() => {
    const originals = window.__pendingImportOriginals;
    window.__restorePendingImportInstrumentation();
    return {
      requestAnimationFrame: window.requestAnimationFrame === originals.requestAnimationFrame,
      addEventListener: EventTarget.prototype.addEventListener === originals.addEventListener,
      getContext: HTMLCanvasElement.prototype.getContext === originals.getContext,
      audioContext: window.AudioContext === originals.AudioContext
    };
  });
  expect(restoration).toEqual({
    requestAnimationFrame: true,
    addEventListener: true,
    getContext: true,
    audioContext: true
  });
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

test('focus completion follows the rendered target through trusted stage input', async ({ page }) => {
  await openSavedWetland(page);
  await reachFieldHotspot(page, 'camera-spot');
  await beginFieldTask(page, 'camera-spot');

  const stage = page.locator('[data-focus-stage]');
  await stage.evaluate((element) => {
    window.__focusPointerEvents = [];
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
      element.addEventListener(type, (event) => {
        const stageBox = element.getBoundingClientRect();
        const targetBox = element.querySelector('[data-focus-target]').getBoundingClientRect();
        const hit = document.elementFromPoint(event.clientX, event.clientY);
        window.__focusPointerEvents.push({
          type,
          isTrusted: event.isTrusted,
          pointerType: event.pointerType,
          pointerId: event.pointerId,
          eventTargetsStage: event.target === element,
          hitWithinStage: hit === element || element.contains(hit),
          insideStage: (
            event.clientX >= stageBox.left
            && event.clientX <= stageBox.right
            && event.clientY >= stageBox.top
            && event.clientY <= stageBox.bottom
          ),
          insideTarget: (
            event.clientX >= targetBox.left
            && event.clientX <= targetBox.right
            && event.clientY >= targetBox.top
            && event.clientY <= targetBox.bottom
          )
        });
      });
    }
  });

  let completionError = null;
  try {
    await completeFieldTaskByKind(page, 'focus');
  } catch (error) {
    completionError = String(error);
  }
  const events = await page.evaluate(() => window.__focusPointerEvents);
  expect(completionError, JSON.stringify(events.slice(0, 12))).toBeNull();
  const expectedPointerType = await page.evaluate(() => (
    navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches
      ? 'touch'
      : 'mouse'
  ));
  const downIndex = events.findIndex((event) => event.type === 'pointerdown');
  const upIndex = events.findIndex((event, index) => index > downIndex && event.type === 'pointerup');
  expect(downIndex).toBeGreaterThanOrEqual(0);
  expect(upIndex).toBeGreaterThan(downIndex);
  const activeSequence = events.slice(downIndex, upIndex + 1);
  expect(activeSequence.some((event) => event.type === 'pointermove')).toBe(true);
  expect(activeSequence.every((event) => event.isTrusted)).toBe(true);
  expect(activeSequence.every((event) => event.pointerType === expectedPointerType)).toBe(true);
  expect(new Set(activeSequence.map((event) => event.pointerId)).size).toBe(1);
  expect(activeSequence[0]).toMatchObject({
    type: 'pointerdown',
    eventTargetsStage: true,
    hitWithinStage: true,
    insideStage: true,
    insideTarget: true
  });
  expect(activeSequence.filter((event) => event.type === 'pointermove').some((event) => (
    event.eventTargetsStage
    && event.hitWithinStage
    && event.insideStage
    && event.insideTarget
  ))).toBe(true);
  expect(activeSequence.at(-1)).toMatchObject({
    type: 'pointerup',
    eventTargetsStage: true,
    insideStage: true
  });
});

test('visible action hold reaches the control through trusted pointer input', async ({ page }) => {
  expect(typeof withVisibleControlHold).toBe('function');

  await openSavedWetland(page);
  await reachFieldHotspot(page, 'voice-spot');
  await beginFieldTask(page, 'voice-spot');

  const layer = page.locator('#field-task-layer');
  const action = page.locator('[data-field-action]');
  await expect.poll(async () => layer.getAttribute('data-quiet')).toBe('true');
  await action.evaluate((element) => {
    window.__fieldActionPointerEvents = [];
    for (const type of ['pointerdown', 'pointerup']) {
      element.addEventListener(type, (event) => {
        const box = element.getBoundingClientRect();
        window.__fieldActionPointerEvents.push({
          type,
          isTrusted: event.isTrusted,
          pointerType: event.pointerType,
          inside: (
            event.clientX >= box.left
            && event.clientX <= box.right
            && event.clientY >= box.top
            && event.clientY <= box.bottom
          )
        });
      }, { once: true });
    }
  });

  await withVisibleControlHold(page, action, async ({ down, up }) => {
    await down();
    await expect.poll(async () => Number(await layer.getAttribute('data-progress'))).toBeGreaterThan(0);
    await up();
  });

  const [downEvent, upEvent] = await page.evaluate(() => window.__fieldActionPointerEvents);
  const expectedPointerType = await page.evaluate(() => (
    navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches
      ? 'touch'
      : 'mouse'
  ));
  expect(downEvent).toEqual({
    type: 'pointerdown',
    isTrusted: true,
    pointerType: expectedPointerType,
    inside: true
  });
  expect(upEvent?.type).toBe('pointerup');
  expect(upEvent?.isTrusted).toBe(true);
  expect(upEvent?.pointerType).toBe(expectedPointerType);
});

test('timing completion helper finishes through trusted visible holds', async ({ page }) => {
  await openSavedWetland(page);
  await reachFieldHotspot(page, 'notes-spot');
  await beginFieldTask(page, 'notes-spot');

  const layer = page.locator('#field-task-layer');
  const action = page.locator('[data-field-action]');
  await action.evaluate((element) => {
    window.__timingCompletionEvents = [];
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture']) {
      element.addEventListener(type, (event) => {
        window.__timingCompletionEvents.push({
          type,
          isTrusted: event.isTrusted,
          pointerId: event.pointerId,
          routeIndex: document.querySelector('#field-task-layer')?.dataset.routeIndex
        });
      });
    }
  });

  let completionError = null;
  try {
    await completeFieldTaskByKind(page, 'timing');
  } catch (error) {
    completionError = String(error);
  }
  const evidence = {
    completionError,
    routeIndex: await layer.getAttribute('data-route-index'),
    events: await page.evaluate(() => window.__timingCompletionEvents)
  };
  expect(completionError, JSON.stringify(evidence)).toBeNull();
  expect(evidence.events.length).toBeGreaterThanOrEqual(6);
  expect(evidence.events.every((event) => event.isTrusted)).toBe(true);
});

for (const [hotspotId, kind] of [
  ['camera-spot', 'focus'],
  ['notes-spot', 'timing'],
  ['voice-spot', 'listening']
]) {
  test(`${kind} field task freezes world input and can be cancelled then reopened`, async ({ page }) => {
    await openSavedWetland(page);
    await reachFieldHotspot(page, hotspotId);
    await beginFieldTask(page, hotspotId);

    const canvas = page.locator('#game-canvas');
    const layer = page.locator('#field-task-layer');
    await expect(layer).toHaveAttribute('data-kind', kind);
    const before = await gameplayDiagnosticSnapshot(page);
    await page.keyboard.down('KeyW');
    try {
      await canvas.dispatchEvent('pointerdown', { pointerId: 7301, clientX: 120, clientY: 120, button: 0 });
      await canvas.dispatchEvent('pointermove', { pointerId: 7301, clientX: 260, clientY: 120, button: 0 });
      await page.waitForTimeout(600);
    } finally {
      await page.keyboard.up('KeyW');
      await canvas.dispatchEvent('pointerup', { pointerId: 7301, clientX: 260, clientY: 120, button: 0 });
    }
    const after = await gameplayDiagnosticSnapshot(page);
    expect(after.playerPosition).toBe(before.playerPosition);
    expect(after.cameraYaw).toBe(before.cameraYaw);
    expect(after.playerYaw).toBe(before.playerYaw);

    if (kind === 'listening') {
      const action = page.locator('[data-field-action]');
      await expect.poll(async () => layer.getAttribute('data-quiet')).toBe('true');
      await withVisibleControlHold(page, action, async ({ down }) => {
        await down();
        await expect.poll(async () => Number(await layer.getAttribute('data-progress'))).toBeGreaterThan(0);
        await triggerTrustedWindowBlur(page);
        const releasedProgress = Number(await layer.getAttribute('data-progress'));
        await expect.poll(async () => layer.getAttribute('data-quiet')).toBe('true');
        await page.waitForTimeout(250);
        expect(Number(await layer.getAttribute('data-progress'))).toBeCloseTo(releasedProgress, 4);
      });
    } else if (kind === 'timing') {
      const action = page.locator('[data-field-action]');
      await withVisibleControlHold(page, action, async ({ down, up }) => {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          await waitForTimingAlignment(page, 0);
          await down();
          await page.waitForTimeout(80);
          if (await layer.getAttribute('data-route-index') === '1') break;
          await up();
        }
        await expect(layer).toHaveAttribute('data-route-index', '1');
        await triggerTrustedWindowBlur(page);
        await waitForTimingAlignment(page, 1);
        await page.keyboard.press('Space');
        await expect(layer).toHaveAttribute('data-route-index', '2');
      });
    } else {
      const aim = page.locator('[data-focus-aim]');
      const start = await elementCenter(aim);
      await page.keyboard.down('KeyD');
      try {
        await expect.poll(async () => (await elementCenter(aim)).x - start.x).toBeGreaterThan(8);
        await triggerTrustedWindowBlur(page);
        await page.waitForTimeout(120);
        const afterBlur = await elementCenter(aim);
        await waitForAnimationFrames(page, 10);
        const settled = await elementCenter(aim);
        expect(settled.x).toBeCloseTo(afterBlur.x, 0);
        expect(settled.y).toBeCloseTo(afterBlur.y, 0);
      } finally {
        await page.keyboard.up('KeyD');
      }
    }

    await page.locator('[data-field-cancel]').click();
    await expect(layer).toBeHidden();
    await expect(page.locator('#game-root')).not.toHaveAttribute('data-field-task-active', 'true');
    await beginFieldTask(page, hotspotId);
    await expect(layer).toHaveAttribute('data-kind', kind);
  });
}

test('wetland fixture targets game documents and applies changed arguments on a reused page', async ({ page }) => {
  const firstProgress = await installWetlandSave(page, {
    quality: 'low',
    visitedHotspots: ['camera-spot']
  });
  await page.goto('/');
  expect(await page.evaluate(() => localStorage.getItem('yanhuo-summer-echo:v1:progress'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('yanhuo-summer-echo:v1:settings'))).toBeNull();

  await page.goto('/game/');
  expect(await page.evaluate(() => localStorage.getItem('yanhuo-summer-echo:v1:progress'))).toBe(firstProgress);

  const secondProgress = await installWetlandSave(page, {
    quality: 'high',
    visitedHotspots: ['notes-spot']
  });
  await page.goto('/game/');
  expect(await page.evaluate(() => localStorage.getItem('yanhuo-summer-echo:v1:progress'))).toBe(secondProgress);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('yanhuo-summer-echo:v1:settings')))).toEqual({
    quality: 'high'
  });
});

test('field task completion helpers use rendered geometry and trusted visible holds', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The helper source contract is project-independent.');
  const source = await fs.readFile(new URL('./helpers/game-state.mjs', import.meta.url), 'utf8');
  const sequenceStart = source.indexOf('export async function withTrustedPointerSequence');
  const holdStart = source.indexOf('export async function withVisibleControlHold');
  const focusStart = source.indexOf('async function completeFocusTask');
  expect(sequenceStart).toBeGreaterThanOrEqual(0);
  expect(holdStart).toBeGreaterThan(sequenceStart);
  expect(holdStart).toBeGreaterThanOrEqual(0);
  expect(focusStart).toBeGreaterThan(holdStart);
  const pointerSequence = source.slice(sequenceStart, holdStart);
  const holdHelper = source.slice(holdStart, focusStart);
  expect(source).toContain('navigator.maxTouchPoints');
  expect(source).toContain("matchMedia('(pointer: coarse)')");
  expect(pointerSequence).toContain('isTouchPage(page)');
  expect(pointerSequence).toContain('Input.dispatchTouchEvent');
  expect(pointerSequence).toContain("type: 'touchStart'");
  expect(pointerSequence).toContain("type: 'touchMove'");
  expect(pointerSequence).toContain("type: 'touchEnd'");
  expect(pointerSequence).toMatch(/page\.mouse\.move\(/);
  expect(pointerSequence).toMatch(/page\.mouse\.down\(/);
  expect(pointerSequence).toMatch(/page\.mouse\.up\(/);
  expect(pointerSequence).toMatch(/\.detach\(/);
  expect(pointerSequence).toContain('operationError');
  expect(pointerSequence).toContain('cleanupErrors');
  expect(pointerSequence.indexOf('possiblyHeld = true')).toBeLessThan(pointerSequence.indexOf('page.mouse.down()'));
  expect(holdHelper).not.toContain('dispatchEvent');
  const downHelper = holdHelper.slice(
    holdHelper.indexOf('const down'),
    holdHelper.indexOf('const up')
  );
  expect(downHelper).toContain('locator.boundingBox()');

  const focusHelper = source.slice(focusStart, source.indexOf('async function completeTimingTask'));
  expect(focusHelper).toContain('withTrustedPointerSequence');
  expect(focusHelper).toContain('target.boundingBox()');
  expect(focusHelper).not.toContain('dispatchEvent');

  const timingHelper = source.slice(
    source.indexOf('async function completeTimingTask'),
    source.indexOf('async function completeListeningTask')
  );
  expect(timingHelper).not.toContain('--marker-position');
  expect(timingHelper).not.toContain('--node-position');
  expect(timingHelper).toMatch(/getBoundingClientRect|boundingBox/);
  expect(timingHelper).toContain('withVisibleControlHold');
  expect(timingHelper).not.toContain('actionBox');

  const listeningHelper = source.slice(
    source.indexOf('async function completeListeningTask'),
    source.indexOf('export async function completeVisibleFieldTaskResult')
  );
  expect(listeningHelper).toContain('withVisibleControlHold');
  expect(listeningHelper).not.toContain('dispatchEvent');

  const lifecycleSource = await fs.readFile(new URL('./game-canvas.spec.mjs', import.meta.url), 'utf8');
  const lifecycleStart = lifecycleSource.indexOf("if (kind === 'listening')");
  const lifecycleEnd = lifecycleSource.indexOf(
    "await page.locator('[data-field-cancel]').click()",
    lifecycleStart
  );
  const lifecycleBranches = lifecycleSource.slice(
    lifecycleStart,
    lifecycleEnd
  );
  expect(lifecycleStart).toBeGreaterThanOrEqual(0);
  expect(lifecycleEnd).toBeGreaterThan(lifecycleStart);
  expect(lifecycleBranches).not.toContain('project.name');
  expect(lifecycleBranches).not.toMatch(/dispatchEvent\(['"]pointer(?:down|up)/);
  expect(lifecycleBranches).not.toContain("new Event('blur')");
  expect(lifecycleBranches).toContain('triggerTrustedWindowBlur');
});

for (const [hotspotId, kind] of [
  ['camera-spot', 'focus'],
  ['notes-spot', 'timing'],
  ['voice-spot', 'listening']
]) {
  test(`reloading after a briefing reopens the saved ${kind} field task`, async ({ page }) => {
    await openSavedWetland(page);
    await reachFieldHotspot(page, hotspotId);
    await beginFieldTask(page, hotspotId);
    await expect(page.locator('#field-task-layer')).toBeVisible();
    expect((await readSavedProgress(page)).sessionState.activeHotspotId).toBe(hotspotId);

    await page.reload();
    await page.getByRole('button', { name: /\u7ee7\u7eed\u65c5\u7a0b/ }).click();
    await expect(page.locator('#field-task-layer')).toBeVisible();
    await expect(page.locator('#field-task-layer')).toHaveAttribute('data-task-id', hotspotId);
    await expect(page.locator('#field-task-layer')).toHaveAttribute('data-kind', kind);
  });
}

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
