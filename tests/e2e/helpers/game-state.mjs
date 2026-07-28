import { expect } from '@playwright/test';

const PROGRESS_KEY = 'yanhuo-summer-echo:v1:progress';
const SETTINGS_KEY = 'yanhuo-summer-echo:v1:settings';
const WETLAND_FIXTURE_KEY = '__yanhuo_e2e_wetland_fixture_installed__';
const wetlandFixtureRegistrations = new WeakMap();

function registerWetlandFixture(page, signature) {
  const current = wetlandFixtureRegistrations.get(page);
  if (current?.signature === signature) return current.generation;
  const generation = (current?.generation || 0) + 1;
  wetlandFixtureRegistrations.set(page, { generation, signature });
  return generation;
}

export async function openNewJourney(page) {
  await page.goto('/game/?mode=new');
  await expect(page.locator('[data-scene-ready="activity-room"]')).toBeVisible();
}

export async function installWetlandSave(page, {
  quality = 'low',
  visitedHotspots = []
} = {}) {
  const completedScripts = [
    'prologue',
    ...visitedHotspots.map((id) => `reeds-${id.replace('-spot', '')}`)
  ];
  const progress = JSON.stringify({
    storyState: {
      version: 1,
      activeScriptId: 'prologue',
      activeNodeId: 'prologue-end',
      stats: { truth: 0, empathy: 0, expression: 0 },
      cooperation: 0,
      readNodes: ['prologue-end'],
      choices: {},
      completedScripts
    },
    sessionState: {
      version: 1,
      sceneId: 'activity-room',
      visitedHotspots,
      completedScenes: [],
      activeHotspotId: null,
      prototypeComplete: false
    }
  });
  const fixtureSignature = JSON.stringify({ quality, progress });
  const fixtureGeneration = registerWetlandFixture(page, fixtureSignature);
  await page.addInitScript(({
    fixtureKey,
    fixtureSignatureValue,
    fixtureGenerationValue,
    progressKey,
    settingsKey,
    qualityValue,
    serializedProgress
  }) => {
    if (location.pathname !== '/game/') return;
    let installedFixture = null;
    try {
      installedFixture = JSON.parse(sessionStorage.getItem(fixtureKey));
    } catch {}
    if (
      Number(installedFixture?.generation) > fixtureGenerationValue
      || (
        Number(installedFixture?.generation) === fixtureGenerationValue
        && installedFixture?.signature === fixtureSignatureValue
      )
    ) {
      return;
    }
    sessionStorage.setItem(fixtureKey, JSON.stringify({
      generation: fixtureGenerationValue,
      signature: fixtureSignatureValue
    }));
    localStorage.setItem(settingsKey, JSON.stringify({ quality: qualityValue }));
    localStorage.setItem(progressKey, serializedProgress);
  }, {
    fixtureKey: WETLAND_FIXTURE_KEY,
    fixtureSignatureValue: fixtureSignature,
    fixtureGenerationValue: fixtureGeneration,
    progressKey: PROGRESS_KEY,
    settingsKey: SETTINGS_KEY,
    qualityValue: quality,
    serializedProgress: progress
  });
  return progress;
}

export async function openSavedWetland(page, options = {}) {
  await installWetlandSave(page, options);
  await page.goto('/game/');
  await page.getByRole('button', { name: '继续旅程' }).click();
  await expect(page.locator('[data-scene-ready="reeds-wetland"]')).toBeVisible();
  await expect(page.locator('#dialogue-layer')).toBeHidden();
  await expect(page.locator('#game-status')).toContainText('scene=reeds-wetland;');
}

async function isTouchPage(page) {
  return page.evaluate(() => (
    navigator.maxTouchPoints > 0
    && window.matchMedia('(pointer: coarse)').matches
  ));
}

async function pressVisibleControl(page, locator) {
  await expect(locator).toBeVisible();
  if (await isTouchPage(page)) {
    try {
      await locator.tap();
      return;
    } catch (error) {
      if (!String(error.message).includes('does not support tap')) throw error;
    }
  }
  await locator.click();
}

async function advanceBriefingToFieldTask(page) {
  const layer = page.locator('#field-task-layer');
  const line = page.locator('[data-dialogue-line]');
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await layer.isVisible()) return;
    await expect(line).toBeVisible();
    await line.click();
    await page.waitForTimeout(40);
  }
  await expect(layer).toBeVisible();
}

async function completeFocusTask(page) {
  const layer = page.locator('#field-task-layer');
  const stage = page.locator('[data-focus-stage]');
  const target = page.locator('[data-focus-target]');
  const touch = await isTouchPage(page);
  const pointerId = 7001;
  let pointerDown = false;
  const deadline = Date.now() + 20_000;

  try {
    while (Date.now() < deadline) {
      if (await layer.getAttribute('data-status') === 'complete') return;
      const [stageBox, targetBox] = await Promise.all([stage.boundingBox(), target.boundingBox()]);
      if (!stageBox || !targetBox) throw new Error('Focus task controls are not measurable.');
      const clientX = targetBox.x + targetBox.width / 2;
      const clientY = targetBox.y + targetBox.height / 2;
      if (touch) {
        await stage.dispatchEvent(pointerDown ? 'pointermove' : 'pointerdown', {
          pointerId,
          pointerType: 'touch',
          isPrimary: true,
          clientX,
          clientY
        });
        pointerDown = true;
      } else {
        await page.mouse.move(clientX, clientY);
      }
      await page.waitForTimeout(55);
    }
  } finally {
    if (touch && pointerDown) {
      await stage.dispatchEvent('pointerup', {
        pointerId,
        pointerType: 'touch',
        isPrimary: true
      });
    }
  }
  throw new Error('Focus task did not complete before its deadline.');
}

async function completeTimingTask(page) {
  const layer = page.locator('#field-task-layer');
  const stage = page.locator('[data-timing-stage]');
  const action = page.locator('[data-field-action]');
  const deadline = Date.now() + 20_000;
  const touch = await isTouchPage(page);
  let lastMeasurement = null;
  let actions = 0;

  await expect(action).toBeVisible();
  const actionBox = touch ? null : await action.boundingBox();
  if (!touch && !actionBox) throw new Error('Timing action is not measurable.');
  const previousDistances = new Map();
  try {
    while (Date.now() < deadline) {
      if (await layer.getAttribute('data-status') === 'complete') return;
      const routeIndex = Number(await layer.getAttribute('data-route-index'));
      const measurement = await stage.evaluate((stageElement, index) => {
        const markerElement = stageElement.querySelector('[data-route-marker]');
        const nodeElement = stageElement.querySelectorAll('[data-route-nodes] li')[index];
        if (!markerElement || !nodeElement) {
          throw new Error(`Timing task controls are not measurable at route index ${index}.`);
        }
        const stageBox = stageElement.getBoundingClientRect();
        const markerBox = markerElement.getBoundingClientRect();
        const nodeBox = nodeElement.getBoundingClientRect();
        const markerPosition = {
          x: (markerBox.left + markerBox.width / 2 - stageBox.left) / stageBox.width,
          y: (markerBox.top + markerBox.height / 2 - stageBox.top) / stageBox.height
        };
        const nodePosition = {
          x: (nodeBox.left + nodeBox.width / 2 - stageBox.left) / stageBox.width,
          y: (nodeBox.top + nodeBox.height / 2 - stageBox.top) / stageBox.height
        };
        return {
          markerPosition,
          nodePosition,
          difference: Math.hypot(
            markerPosition.x - nodePosition.x,
            markerPosition.y - nodePosition.y
          )
        };
      }, routeIndex);
      const { markerPosition, nodePosition, difference } = measurement;
      const previousDistance = previousDistances.get(routeIndex);
      const approaching = previousDistance === undefined || difference <= previousDistance;
      previousDistances.set(routeIndex, difference);
      lastMeasurement = { routeIndex, markerPosition, nodePosition, difference, approaching };
      if (difference <= 0.035 && approaching) {
        if (touch) await action.tap();
        else {
          await page.mouse.click(
            actionBox.x + actionBox.width / 2,
            actionBox.y + actionBox.height / 2
          );
        }
        actions += 1;
        previousDistances.delete(routeIndex);
        await page.waitForTimeout(45);
      } else {
        await page.waitForTimeout(12);
      }
    }
  } finally {
    await page.mouse.up().catch(() => {});
    await page.keyboard.up('Space').catch(() => {});
  }
  throw new Error(`Timing task did not complete before its deadline: ${JSON.stringify({ lastMeasurement, actions })}`);
}

async function completeListeningTask(page) {
  const layer = page.locator('#field-task-layer');
  const action = page.locator('[data-field-action]');
  const touch = await isTouchPage(page);
  const pointerId = 7002;
  let held = false;
  const deadline = Date.now() + 25_000;

  const release = async () => {
    if (!held) return;
    await action.dispatchEvent('pointerup', {
      pointerId,
      pointerType: touch ? 'touch' : 'mouse',
      isPrimary: true
    });
    held = false;
  };

  try {
    while (Date.now() < deadline) {
      if (await layer.getAttribute('data-status') === 'complete') return;
      const quiet = await layer.getAttribute('data-quiet');
      if (quiet === 'true' && !held) {
        await expect(action).toBeVisible();
        const box = await action.boundingBox();
        await action.dispatchEvent('pointerdown', {
          pointerId,
          pointerType: touch ? 'touch' : 'mouse',
          isPrimary: true,
          clientX: box.x + box.width / 2,
          clientY: box.y + box.height / 2
        });
        held = true;
      } else if (quiet !== 'true') {
        await release();
      }
      await page.waitForTimeout(65);
    }
  } finally {
    await release();
  }
  throw new Error('Listening task did not complete before its deadline.');
}

export async function completeVisibleFieldTaskResult(page) {
  const layer = page.locator('#field-task-layer');
  await expect(layer).toBeVisible();
  const kind = await layer.getAttribute('data-kind');
  if (kind === 'focus') await completeFocusTask(page);
  else if (kind === 'timing') await completeTimingTask(page);
  else if (kind === 'listening') await completeListeningTask(page);
  else throw new Error(`Unknown visible field task: ${kind}`);
  await expect(layer).toHaveAttribute('data-status', 'complete');
}

export async function completeVisibleFieldTask(page) {
  const layer = page.locator('#field-task-layer');
  await completeVisibleFieldTaskResult(page);
  await pressVisibleControl(page, page.locator('[data-field-submit]'));
  await expect(layer).toBeHidden();
}

export async function completeFieldTaskByKind(page, kind) {
  const layer = page.locator('#field-task-layer');
  await expect(layer).toBeVisible();
  await expect(layer).toHaveAttribute('data-kind', kind);
  await completeVisibleFieldTask(page);
}

export async function expectFieldTaskSummary(page) {
  const rows = page.locator('[data-complete-tasks] li');
  const expectedTitles = ['晨雾取景', '路线节奏', '安静收声'];
  await expect(rows).toHaveCount(expectedTitles.length);
  const rowTexts = (await rows.allTextContents()).map((text) => text.trim());
  const rowTitles = [];
  const rowStars = rowTexts.map((text, index) => {
    const matchingTitles = expectedTitles.filter((title) => text.includes(title));
    expect(matchingTitles, text).toHaveLength(1);
    expect(matchingTitles[0]).toBe(expectedTitles[index]);
    rowTitles.push(matchingTitles[0]);
    const starGlyphs = text.match(/★/g) || [];
    const displayedStars = Number(text.match(/([1-3])\s*星$/)?.[1]);
    expect(Number.isInteger(displayedStars), text).toBe(true);
    expect(displayedStars, text).toBeGreaterThanOrEqual(1);
    expect(displayedStars, text).toBeLessThanOrEqual(3);
    expect(starGlyphs, text).toHaveLength(displayedStars);
    return displayedStars;
  });
  expect(new Set(rowTitles).size).toBe(expectedTitles.length);

  const totalText = (await page.locator('[data-complete-total]').textContent())?.trim() || '';
  const totalMatch = totalText.match(/^协作评价 ([3-9]) \/ 9$/);
  expect(totalMatch, totalText).not.toBeNull();
  const totalStars = Number(totalMatch[1]);
  expect(totalStars).toBe(rowStars.reduce((sum, stars) => sum + stars, 0));
  return { rowStars, totalStars };
}

export async function beginFieldTask(page, hotspotId) {
  const root = page.locator('#game-root');
  if (await root.getAttribute('data-hotspot') !== hotspotId) {
    throw new Error(`Expected player to be at ${hotspotId} before starting its task.`);
  }
  if (await page.locator('#touch-controls').isVisible()) {
    await pressVisibleControl(page, page.locator('[data-interact]'));
  } else {
    await page.keyboard.press('KeyE');
  }
  await advanceBriefingToFieldTask(page);
  await expect(page.locator('#field-task-layer')).toHaveAttribute('data-task-id', hotspotId);
}

export async function reachFieldHotspot(page, hotspotId) {
  const touch = await page.locator('#touch-controls').isVisible();
  const routes = {
    'camera-spot': [
      ['KeyW', (player) => player[2] <= 0.35],
      ['KeyA', () => false]
    ],
    'notes-spot': [
      ['KeyD', (player) => player[0] >= -0.1],
      ['KeyW', (player) => player[2] <= -3.75],
      ['KeyD', () => false]
    ],
    'voice-spot': [
      ['KeyA', (player) => player[0] <= 0.65],
      ['KeyW', () => false]
    ]
  };
  const deadline = Date.now() + 12_000;
  const joystick = page.locator('[data-joystick]');

  const worldState = async () => {
    const text = await page.locator('#game-status').textContent();
    const match = String(text).match(/player=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    return {
      hotspotId: await page.locator('#game-root').getAttribute('data-hotspot'),
      player: match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [0, 0, 0]
    };
  };

  for (const [key, reachedWaypoint] of routes[hotspotId] || []) {
    if ((await worldState()).hotspotId === hotspotId) return;
    if (!touch) {
      await page.keyboard.down(key);
      try {
        while (Date.now() < deadline) {
          const current = await worldState();
          if (current.hotspotId === hotspotId) return;
          if (reachedWaypoint(current.player)) break;
          await page.waitForTimeout(50);
        }
      } finally {
        await page.keyboard.up(key);
      }
    } else {
      await expect(joystick).toBeVisible();
      const box = await joystick.boundingBox();
      const points = {
        KeyW: [box.x + box.width / 2, box.y + 4],
        KeyS: [box.x + box.width / 2, box.y + box.height - 4],
        KeyA: [box.x + 4, box.y + box.height / 2],
        KeyD: [box.x + box.width - 4, box.y + box.height / 2]
      };
      const [clientX, clientY] = points[key];
      const pointerId = 7100 + key.charCodeAt(3);
      await joystick.dispatchEvent('pointerdown', { pointerId, pointerType: 'touch', isPrimary: true, clientX, clientY });
      try {
        while (Date.now() < deadline) {
          const current = await worldState();
          if (current.hotspotId === hotspotId) return;
          if (reachedWaypoint(current.player)) break;
          await page.waitForTimeout(50);
        }
      } finally {
        await joystick.dispatchEvent('pointerup', { pointerId, pointerType: 'touch', isPrimary: true, clientX, clientY });
      }
    }
  }
  throw new Error(`Movement timed out before reaching ${hotspotId}.`);
}

export async function readSavedProgress(page) {
  return page.evaluate((progressKey) => JSON.parse(localStorage.getItem(progressKey)), PROGRESS_KEY);
}
