import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  beginFieldTask,
  completeFieldTaskByKind,
  completeVisibleFieldTaskResult,
  expectFieldTaskSummary,
  openNewJourney,
  openSavedWetland,
  reachFieldHotspot
} from './helpers/game-state.mjs';

const expectedOrigin = 'http://127.0.0.1:4173';
const fieldTaskScreenshotDirectory = path.resolve('test-results', 'task-5-field-tasks');
const forbiddenTerms = /证据匹配|档案修复|修复档案/;

test.describe.configure({ timeout: 90_000 });

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

async function advanceDisplayedLine(page, expectedText) {
  const line = page.locator('[data-dialogue-line]');
  await expect(line).toBeVisible();
  await expect(line).toHaveText(expectedText);
  await line.click();
  if (await line.isVisible() && await line.textContent() === expectedText) await line.click();
}

async function advanceResultDialogue(page, expectedSpeakers) {
  const line = page.locator('[data-dialogue-line]');
  const speaker = page.locator('[data-speaker]');
  for (const expectedSpeaker of expectedSpeakers) {
    await expect(line).toBeVisible();
    await expect(speaker).toHaveText(expectedSpeaker);
    await line.click();
    if (await line.isVisible() && await speaker.textContent() === expectedSpeaker) {
      await line.click();
    }
  }
}

async function advanceDialogueUntilClosed(page) {
  const line = page.locator('[data-dialogue-line]');
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await page.locator('[data-choice-list]').isVisible()) return;
    if (!await line.isVisible()) return;
    await line.click();
    await page.waitForTimeout(45);
  }
  await expect(line).toBeHidden();
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
  const pointerId = Math.floor(clientX + clientY) + 113;
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
    if (current?.hotspotId === hotspotId) return;
  }
  throw new Error(`Route ended before reaching ${hotspotId}`);
}

async function canvasEvidence(page) {
  return page.locator('#game-canvas').evaluate(async (canvas) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const box = canvas.getBoundingClientRect();
    const width = 64;
    const height = 36;
    const copy = document.createElement('canvas');
    copy.width = width;
    copy.height = height;
    const context = copy.getContext('2d', { willReadFrequently: true });
    context.drawImage(canvas, 0, 0, width, height);
    let pixels = context.getImageData(0, 0, width, height).data;
    let sampling = 'drawImage';
    const copiedOpaque = [...pixels].filter((_, index) => index % 4 === 3 && pixels[index] > 0).length;
    if (copiedOpaque === 0) {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        const raw = new Uint8Array(width * height * 4);
        const x = Math.max(0, Math.floor((gl.drawingBufferWidth - width) / 2));
        const y = Math.max(0, Math.floor((gl.drawingBufferHeight - height) / 2));
        gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
        pixels = raw;
        sampling = 'readPixels';
      }
    }

    let minimum = 255;
    let maximum = 0;
    let opaque = 0;
    const colors = new Set();
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] > 0) opaque += 1;
      const luminance = Math.round(
        pixels[index] * 0.2126
        + pixels[index + 1] * 0.7152
        + pixels[index + 2] * 0.0722
      );
      minimum = Math.min(minimum, luminance);
      maximum = Math.max(maximum, luminance);
      colors.add(`${pixels[index] >> 4},${pixels[index + 1] >> 4},${pixels[index + 2] >> 4}`);
    }
    return {
      sampling,
      visibleRatio: opaque / (width * height),
      opaqueRatio: opaque / (width * height),
      minimumLuminance: minimum,
      maximumLuminance: maximum,
      luminanceSpread: maximum - minimum,
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

async function renderedTextEvidence(page) {
  return page.evaluate(() => {
    const visibleText = document.body.innerText;
    const accessibleText = [...document.querySelectorAll('[aria-label], [aria-labelledby], [alt], [title]')]
      .flatMap((element) => {
        const labelledBy = element.getAttribute('aria-labelledby');
        const referenced = labelledBy
          ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '')
          : [];
        return [
          element.getAttribute('aria-label') || '',
          element.getAttribute('alt') || '',
          element.getAttribute('title') || '',
          ...referenced
        ];
      })
      .join('\n');
    return { visibleText, accessibleText };
  });
}

async function expectCleanRenderedCopy(page) {
  const evidence = await renderedTextEvidence(page);
  expect(evidence.visibleText).not.toContain('\uFFFD');
  expect(evidence.accessibleText).not.toContain('\uFFFD');
  expect(evidence.visibleText).not.toMatch(forbiddenTerms);
  expect(evidence.accessibleText).not.toMatch(forbiddenTerms);
}

async function visibleButtonEvidence(page) {
  return page.locator('button').evaluateAll((buttons) => buttons.flatMap((button) => {
    const style = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    if (
      style.display === 'none'
      || style.visibility === 'hidden'
      || !button.getClientRects().length
    ) return [];
    return [{
      label: button.getAttribute('aria-label') || button.textContent.trim(),
      width: rect.width,
      height: rect.height,
      clientWidth: button.clientWidth,
      clientHeight: button.clientHeight,
      scrollWidth: button.scrollWidth,
      scrollHeight: button.scrollHeight,
      overflows: (
        button.scrollWidth > button.clientWidth + 1
        || button.scrollHeight > button.clientHeight + 1
      )
    }];
  }));
}

async function expectVisibleButtonsSized(page) {
  const buttons = await visibleButtonEvidence(page);
  for (const button of buttons) {
    expect(button.width, `${button.label} button width`).toBeGreaterThan(0);
    expect(button.height, `${button.label} button height`).toBeGreaterThan(0);
    expect(button.overflows, `${button.label} button text overflow`).toBe(false);
  }
  return buttons;
}

async function overlapEvidence(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      if (!element || getComputedStyle(element).display === 'none' || !element.getClientRects().length) return null;
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height
      };
    };
    const intersects = (first, second) => Boolean(
      first
      && second
      && first.left < second.right
      && first.right > second.left
      && first.top < second.bottom
      && first.bottom > second.top
    );
    const line = rect(document.querySelector('[data-dialogue-line]'));
    const choices = rect(document.querySelector('[data-choice-list]'));
    const portrait = rect(document.querySelector('[data-portrait]'));
    const speaker = rect(document.querySelector('[data-speaker]'));
    const touch = rect(document.querySelector('#touch-controls'));
    const desktopControls = rect(document.querySelector('#desktop-controls'));
    const interactionPrompt = rect(document.querySelector('.interaction-prompt'));
    const dialogue = rect(document.querySelector('#dialogue-layer'));
    const runtimeControls = rect(document.querySelector('.runtime-controls'));
    const skip = rect(document.querySelector('[data-skip]'));
    return {
      line,
      choices,
      portrait,
      speaker,
      touch,
      desktopControls,
      interactionPrompt,
      dialogue,
      runtimeControls,
      skip,
      lineChoicesIntersect: intersects(line, choices),
      portraitSpeakerIntersect: intersects(portrait, speaker),
      touchDialogueIntersect: intersects(touch, dialogue),
      desktopDialogueIntersect: intersects(desktopControls, dialogue),
      desktopRuntimeIntersect: intersects(desktopControls, runtimeControls),
      desktopInteractionIntersect: intersects(desktopControls, interactionPrompt),
      interactionDialogueIntersect: intersects(interactionPrompt, dialogue),
      interactionChoicesIntersect: intersects(interactionPrompt, choices),
      skipRuntimeControlsIntersect: intersects(skip, runtimeControls)
    };
  });
}

async function expectNoGameOverlap(page) {
  const evidence = await overlapEvidence(page);
  expect(evidence.lineChoicesIntersect, JSON.stringify(evidence)).toBe(false);
  expect(evidence.portraitSpeakerIntersect, JSON.stringify(evidence)).toBe(false);
  expect(evidence.touchDialogueIntersect, JSON.stringify(evidence)).toBe(false);
  expect(evidence.desktopDialogueIntersect, JSON.stringify(evidence)).toBe(false);
  expect(evidence.desktopRuntimeIntersect, JSON.stringify(evidence)).toBe(false);
  expect(evidence.desktopInteractionIntersect, JSON.stringify(evidence)).toBe(false);
  expect(evidence.interactionDialogueIntersect, JSON.stringify(evidence)).toBe(false);
  expect(evidence.interactionChoicesIntersect, JSON.stringify(evidence)).toBe(false);
  expect(evidence.skipRuntimeControlsIntersect, JSON.stringify(evidence)).toBe(false);
  return evidence;
}

async function expectLongestChoiceWraps(page) {
  const evidence = await page.locator('[data-choice-list] button').evaluateAll((buttons) => {
    const longest = [...buttons].sort((first, second) => second.textContent.length - first.textContent.length)[0];
    const text = longest.querySelector('[data-choice-label]') || longest;
    const style = getComputedStyle(longest);
    const textStyle = getComputedStyle(text);
    const buttonBox = longest.getBoundingClientRect();
    const listBox = longest.parentElement.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(text);
    const textRects = [...range.getClientRects()].filter((box) => box.width > 0 && box.height > 0);
    const lineTops = new Set(textRects.map((box) => Math.round(box.top)));
    const textTop = Math.min(...textRects.map((box) => box.top));
    const textBottom = Math.max(...textRects.map((box) => box.bottom));
    return {
      label: longest.textContent.trim(),
      lineCount: lineTops.size,
      clientWidth: longest.clientWidth,
      scrollWidth: longest.scrollWidth,
      clientHeight: longest.clientHeight,
      scrollHeight: longest.scrollHeight,
      textClientWidth: text.clientWidth,
      textHeight: textBottom - textTop,
      lineHeight: Number.parseFloat(textStyle.lineHeight),
      overflowWrap: style.overflowWrap,
      whiteSpace: style.whiteSpace,
      contained: (
        buttonBox.left >= listBox.left
        && buttonBox.right <= listBox.right
        && buttonBox.top >= listBox.top
        && buttonBox.bottom <= listBox.bottom
      )
    };
  });
  expect(evidence.lineCount, JSON.stringify(evidence)).toBeGreaterThan(1);
  expect(evidence.scrollWidth, JSON.stringify(evidence)).toBeLessThanOrEqual(evidence.clientWidth);
  expect(evidence.scrollHeight, JSON.stringify(evidence)).toBeLessThanOrEqual(evidence.clientHeight);
  expect(evidence.textHeight, JSON.stringify(evidence)).toBeGreaterThan(evidence.lineHeight * 1.5);
  expect(evidence.whiteSpace).not.toBe('nowrap');
  expect(evidence.contained, JSON.stringify(evidence)).toBe(true);
  return evidence;
}

function expectLocalRequests(requests) {
  const remote = requests.filter((url) => new URL(url).origin !== expectedOrigin);
  const remoteAudio = requests.filter((url) => (
    /\.(mp3|wav|ogg|m4a)(?:$|\?)/i.test(url)
    && new URL(url).origin !== expectedOrigin
  ));
  expect(remote).toEqual([]);
  expect(remoteAudio).toEqual([]);
}

async function captureViewport(page, testInfo, name) {
  const dimensions = page.viewportSize();
  const fileName = `${name}-${dimensions.width}x${dimensions.height}.png`;
  const outputPath = testInfo.outputPath(fileName);
  await page.screenshot({ path: outputPath, animations: 'disabled' });
  return { fileName, outputPath, dimensions };
}

async function captureGameView(page, testInfo, name) {
  await expect(page.locator('#game-canvas')).toBeVisible();
  const pixels = await canvasEvidence(page);
  expect(pixels.opaqueRatio, JSON.stringify(pixels)).toBeGreaterThan(0.25);
  expect(pixels.luminanceSpread, JSON.stringify(pixels)).toBeGreaterThan(24);
  expect(pixels.colorBuckets, JSON.stringify(pixels)).toBeGreaterThanOrEqual(12);
  expect(pixels.box.left, JSON.stringify(pixels)).toBeCloseTo(0, 0);
  expect(pixels.box.top, JSON.stringify(pixels)).toBeCloseTo(0, 0);
  expect(pixels.box.width, JSON.stringify(pixels)).toBeCloseTo(pixels.viewport.width, 0);
  expect(pixels.box.height, JSON.stringify(pixels)).toBeCloseTo(pixels.viewport.height, 0);
  const overlap = await expectNoGameOverlap(page);
  const buttons = await expectVisibleButtonsSized(page);
  await expectCleanRenderedCopy(page);
  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
  }));
  expect(layout.horizontalOverflow, JSON.stringify(layout)).toBe(false);
  const screenshot = await captureViewport(page, testInfo, name);
  await fs.writeFile(
    testInfo.outputPath(`${name}-evidence.json`),
    JSON.stringify({ screenshot, pixels, overlap, buttons, layout }, null, 2)
  );
  return { screenshot, pixels, overlap, buttons, layout };
}

async function assertFieldTaskView(page) {
  const layer = page.locator('#field-task-layer');
  const canvas = page.locator('#game-canvas');
  await expect(layer).toBeVisible();
  await expect(canvas).toBeVisible();
  const pixels = await canvasEvidence(page);
  expect(pixels.opaqueRatio, JSON.stringify(pixels)).toBeGreaterThan(0.25);
  expect(pixels.luminanceSpread, JSON.stringify(pixels)).toBeGreaterThan(24);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const selectors = [
    '[data-field-title]',
    '[data-field-stage]',
    '[data-field-progress]',
    '[data-field-cancel]'
  ];
  if (await layer.getAttribute('data-status') === 'complete') {
    selectors.push('[data-field-result]', '[data-field-submit]');
  } else if (await layer.getAttribute('data-kind') !== 'focus') {
    selectors.push('[data-field-action]');
  }
  const bounds = await page.locator(selectors.join(', ')).evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { selector: node.getAttributeNames().join(','), left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  }));
  for (const box of bounds) {
    expect(box.left, JSON.stringify(box)).toBeGreaterThanOrEqual(0);
    expect(box.top, JSON.stringify(box)).toBeGreaterThanOrEqual(0);
    expect(box.right, JSON.stringify(box)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
    expect(box.bottom, JSON.stringify(box)).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));
  }
  for (const selector of ['.runtime-controls', '#desktop-controls', '#touch-controls', '.interaction-prompt', '#dialogue-layer']) {
    await expect(page.locator(selector)).toBeHidden();
  }
  const text = await renderedTextEvidence(page);
  expect(`${text.visibleText}\n${text.accessibleText}`).not.toMatch(
    /\u8bc1\u636e\u5339\u914d|\u6863\u6848\u4fee\u590d|\u4fee\u590d\u6863\u6848|\u6750\u6599\u62fc\u63a5/
  );
}

async function captureFieldTask(page, name) {
  await fs.mkdir(fieldTaskScreenshotDirectory, { recursive: true });
  const outputPath = path.join(fieldTaskScreenshotDirectory, name);
  await page.screenshot({ path: outputPath, animations: 'disabled' });
  return outputPath;
}

test('documentary overlay regions stay distinct at all required game viewports', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One controlled browser verifies the three required UI viewports.');
  const viewports = [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 844, height: 390 }
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/game/');
    await expect(page.locator('#game-root')).toHaveAttribute('data-shell-ready', 'true', { timeout: 20_000 });
    await expect(page.locator('[data-layout-region="menu-title"]')).toBeVisible();
    await expect(page.locator('[data-layout-region="menu-actions"]')).toBeVisible();
    expect(
      await page.locator('#game-root').evaluate((root) => getComputedStyle(root).backgroundImage)
    ).toContain('hero-summer-echo.jpg');
    await expect(page.locator('#game-canvas')).toHaveCSS('opacity', '0');
    const menu = await page.evaluate(() => {
      const box = (region) => {
        const rect = document.querySelector(`[data-layout-region="${region}"]`).getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      };
      const title = box('menu-title');
      const actions = box('menu-actions');
      const intersects = title.left < actions.right
        && title.right > actions.left
        && title.top < actions.bottom
        && title.bottom > actions.top;
      return { title, actions, intersects, width: innerWidth, height: innerHeight };
    });
    expect(menu.intersects, JSON.stringify(menu)).toBe(false);
    expect(menu.title.left, JSON.stringify(menu)).toBeGreaterThanOrEqual(0);
    expect(menu.title.bottom, JSON.stringify(menu)).toBeLessThanOrEqual(menu.height);
    expect(menu.actions.right, JSON.stringify(menu)).toBeLessThanOrEqual(menu.width);
    expect(menu.actions.bottom, JSON.stringify(menu)).toBeLessThanOrEqual(menu.height);
    await captureViewport(page, testInfo, `task-6-menu-${viewport.width}x${viewport.height}`);

    await openNewJourney(page);
    for (const region of ['dialogue', 'choices']) {
      await expect(page.locator(`[data-layout-region="${region}"]`)).toHaveCount(1);
    }
    const dialogue = await page.evaluate(() => {
      const portrait = document.querySelector('[data-portrait]').getBoundingClientRect();
      const content = document.querySelector('.dialogue-content').getBoundingClientRect();
      return {
        portraitRight: portrait.right,
        contentLeft: content.left,
        contentRight: content.right,
        contentBottom: content.bottom,
        width: innerWidth,
        height: innerHeight
      };
    });
    expect(dialogue.portraitRight, JSON.stringify(dialogue)).toBeLessThanOrEqual(dialogue.contentLeft + 1);
    expect(dialogue.contentRight, JSON.stringify(dialogue)).toBeLessThanOrEqual(dialogue.width);
    expect(dialogue.contentBottom, JSON.stringify(dialogue)).toBeLessThanOrEqual(dialogue.height);
    await captureViewport(page, testInfo, `task-6-layout-${viewport.width}x${viewport.height}`);
  }
});

test('field task HUD stays bounded across required visual states', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One controlled browser captures all required task viewports.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSavedWetland(page);

  await reachFieldHotspot(page, 'camera-spot');
  await beginFieldTask(page, 'camera-spot');
  await assertFieldTaskView(page);
  await captureFieldTask(page, 'focus-1440x900.png');

  await completeVisibleFieldTaskResult(page);
  await assertFieldTaskView(page);
  await captureFieldTask(page, 'result-1440x900.png');
  await page.locator('[data-field-submit]').click();
  await expect(page.locator('#field-task-layer')).toBeHidden();
  await advanceResultDialogue(page, ['陈屿', '顾言']);

  await reachFieldHotspot(page, 'notes-spot');
  await beginFieldTask(page, 'notes-spot');
  await page.setViewportSize({ width: 844, height: 390 });
  await assertFieldTaskView(page);
  await captureFieldTask(page, 'timing-844x390.png');
  await completeFieldTaskByKind(page, 'timing');
  await advanceResultDialogue(page, ['顾言', '林夏']);

  await reachFieldHotspot(page, 'voice-spot');
  await beginFieldTask(page, 'voice-spot');
  await page.setViewportSize({ width: 390, height: 844 });
  await assertFieldTaskView(page);
  await captureFieldTask(page, 'listening-390x844.png');
  await completeFieldTaskByKind(page, 'listening');
  await advanceResultDialogue(page, ['林夏', '陈屿']);

  await page.locator('[data-choice-list] button').nth(1).click();
  await expect(page.locator('#game-root')).not.toHaveAttribute('data-echo-active', 'true', { timeout: 6_500 });
  await advanceDialogueUntilClosed(page);
  await expect(page.locator('#chapter-complete')).toBeVisible();
  await expectFieldTaskSummary(page);
  const summaryPixels = await canvasEvidence(page);
  expect(summaryPixels.opaqueRatio, JSON.stringify(summaryPixels)).toBeGreaterThan(0.25);
  expect(summaryPixels.luminanceSpread, JSON.stringify(summaryPixels)).toBeGreaterThan(24);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const summaryText = await renderedTextEvidence(page);
  expect(`${summaryText.visibleText}\n${summaryText.accessibleText}`).not.toMatch(
    /\u8bc1\u636e\u5339\u914d|\u6863\u6848\u4fee\u590d|\u4fee\u590d\u6863\u6848|\u6750\u6599\u62fc\u63a5/
  );
  await captureFieldTask(page, 'summary-390x844.png');
});

test('ordinary game menu remains the only 1440x900 entry', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The required ordinary menu evidence is desktop only.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/game/');
  await expect(page.locator('#main-menu')).toBeVisible();
  await expect(page.locator('#chapter-menu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '教师浏览' })).toHaveCount(0);
  await expectVisibleButtonsSized(page);
  await expectCleanRenderedCopy(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await captureViewport(page, testInfo, 'task-6-ordinary-menu');
});

test('homepage desktop and mobile portrait remain navigable, clean, and visually bounded', async ({ page }, testInfo) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  if (testInfo.project.name === 'mobile-landscape') {
    await page.setViewportSize({ width: 390, height: 844 });
  }

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '雁火渡江： 夏日回响' })).toBeVisible();
  await expectCleanRenderedCopy(page);
  await expectVisibleButtonsSized(page);
  const nextSection = await page.locator('#team').boundingBox();
  const viewport = page.viewportSize();
  expect(nextSection.y).toBeGreaterThan(0);
  expect(nextSection.y).toBeLessThan(viewport.height);
  await captureViewport(
    page,
    testInfo,
    testInfo.project.name === 'desktop' ? 'task-8-homepage-desktop' : 'task-8-homepage-mobile'
  );

  await page.getByRole('link', { name: '开始旅程' }).click();
  await expect(page).toHaveURL(`${expectedOrigin}/game/?mode=new`);
  await expect(page.locator('#dialogue-layer')).toBeVisible();
  await expectCleanRenderedCopy(page);

  expectLocalRequests(requests);
});

test('homepage short landscape keeps the complete hero copy below the fixed header', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-landscape', 'The short landscape viewport is the regression target.');
  await page.goto('/');
  await page.waitForTimeout(750);
  const layout = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left };
    };
    return {
      header: rect('.site-header'),
      hero: rect('#entry'),
      eyebrow: rect('.eyebrow'),
      heading: rect('#page-title'),
      actions: rect('.entry-actions')
    };
  });
  expect(layout.eyebrow.top).toBeGreaterThanOrEqual(layout.header.bottom);
  expect(layout.heading.top).toBeGreaterThanOrEqual(layout.header.bottom);
  expect(layout.heading.bottom).toBeLessThanOrEqual(layout.hero.bottom);
  expect(layout.actions.bottom).toBeLessThanOrEqual(layout.hero.bottom);
  await captureViewport(page, testInfo, 'task-9-homepage-mobile-landscape');
});

test('rendered-copy guard includes accessible names and descriptions', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser project is sufficient for the copy-guard regression.');
  await page.goto('/');
  await page.locator('main').evaluate((main) => main.setAttribute('aria-label', '档案修复'));
  let rejected = false;
  try {
    await expectCleanRenderedCopy(page);
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
});

test('game views preserve canvas detail, layout bounds, wrapping, copy, and local requests', async ({ page }, testInfo) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  const mobile = testInfo.project.name === 'mobile-landscape';
  const suffix = mobile ? 'mobile-portrait' : 'desktop';
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });

  await openNewJourney(page);
  await expect(page.locator('[data-dialogue-line]')).toHaveText(
    '录音笔、电池、采访提纲都在。还差一件事，我们到底想带回来什么？'
  );
  await expect(page.locator('#desktop-controls')).toBeHidden();
  await expect(page.locator('#touch-controls')).toBeHidden();
  await captureGameView(page, testInfo, `task-6-dialogue-${suffix}`);

  await openSavedWetland(page);
  if (mobile) {
    await expect(page.locator('#desktop-controls')).toBeHidden();
    await expect(page.locator('#touch-controls')).toBeVisible();
  } else {
    await expect(page.locator('#desktop-controls')).toBeVisible();
    await expect(page.locator('#touch-controls')).toBeHidden();
    await expect(page.locator('#desktop-controls button')).toHaveCount(4);
  }
  await captureGameView(page, testInfo, `task-6-baiyangdian-gameplay-${suffix}`);
  if (!mobile) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await captureGameView(page, testInfo, 'task-6-baiyangdian-gameplay-desktop-wide');
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  await openNewJourney(page);
  await expect(page.locator('[data-speaker]')).toHaveText('林夏');
  await expect(page.locator('[data-dialogue-line]')).toHaveText(
    '录音笔、电池、采访提纲都在。还差一件事，我们到底想带回来什么？'
  );
  await captureGameView(page, testInfo, `task-8-normal-dialogue-${suffix}`);

  await advanceDisplayedLine(page, '录音笔、电池、采访提纲都在。还差一件事，我们到底想带回来什么？');
  await advanceDisplayedLine(page, '先把画面拍好。芦苇、水路、晨雾，观众愿意停下来，才会看见后面的内容。');
  await advanceDisplayedLine(page, '画面可以补拍，史料说错了却很难补救。路线和讲解口径得先确认。');
  await page.getByRole('button', { name: '先听顾言把资料说完。' }).click();
  await advanceDisplayedLine(page, '那就把三种问题都带上。到了现场，我们再看看答案会不会改变。');
  await expect.poll(async () => (await status(page))?.sceneId).toBe('reeds-wetland');

  const hotspotScripts = [
    {
      id: 'camera-spot',
      kind: 'focus',
      lines: [
        '晨雾刚散，木栈道把视线带进芦苇里。这个画面值得先留下。',
        '可以拍，但不要让空镜替代背景说明。水路和这里的人，也要说清楚。'
      ],
      resultSpeakers: ['陈屿', '顾言']
    },
    {
      id: 'notes-spot',
      kind: 'timing',
      lines: [
        '地点和称谓先核对一遍，写进记录里的每个词都得有来处。',
        '资料里的完整句子，未必等于讲述者的真实节奏。别把他的停顿剪掉。'
      ],
      resultSpeakers: ['顾言', '林夏']
    },
    {
      id: 'voice-spot',
      kind: 'listening',
      lines: [
        '他停了一下。我们先别急着把这段话接过去。',
        '好，我先把相机放下，听他把想说的说完。'
      ],
      resultSpeakers: ['林夏', '陈屿']
    }
  ];

  for (const hotspot of hotspotScripts) {
    await reachHotspot(page, hotspot.id, testInfo.project.name);
    if (testInfo.project.name === 'mobile-landscape') {
      await page.locator('[data-interact]').click();
    } else {
      await page.keyboard.press('KeyE');
    }
    for (const line of hotspot.lines) await advanceDisplayedLine(page, line);
    await completeFieldTaskByKind(page, hotspot.kind);
    await advanceResultDialogue(page, hotspot.resultSpeakers);
  }

  await expect(page.locator('[data-dialogue-line]')).toHaveText('这段讲述应该怎样留下？');
  const wrap = await expectLongestChoiceWraps(page);
  const choiceEvidence = await captureGameView(page, testInfo, `task-8-choice-dialogue-${suffix}`);
  await fs.writeFile(
    testInfo.outputPath(`task-8-choice-wrap-${suffix}.json`),
    JSON.stringify({ wrap, ...choiceEvidence }, null, 2)
  );

  await page.getByRole('button', { name: '保留讲述中的停顿，不替对方补全。' }).click();
  await expect(page.locator('#game-root')).toHaveAttribute('data-echo-active', 'true');
  await expect(page.locator('#desktop-controls')).toBeHidden();
  await expect(page.locator('#touch-controls')).toBeHidden();
  await expect(page.locator('[data-speaker]')).toHaveText('回响 · 艺术化表达');
  await expect(page.locator('[data-dialogue-line]')).toHaveText(
    '水路曲折，靠一个人记不住。有人辨风，有人看苇，也有人把消息送到下一个村。'
  );
  await captureGameView(page, testInfo, `task-8-historical-echo-${suffix}`);

  expectLocalRequests(requests);
});
