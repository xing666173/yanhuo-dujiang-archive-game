import { expect } from '@playwright/test';

const PROGRESS_KEY = 'yanhuo-summer-echo:v1:progress';
const SETTINGS_KEY = 'yanhuo-summer-echo:v1:settings';
const WETLAND_FIXTURE_KEY = '__yanhuo_e2e_wetland_fixture_installed__';
const TIMING_ACTION_DISTANCE = 0.035;
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

function attachCleanupErrors(error, cleanupErrors) {
  if (!error || (typeof error !== 'object' && typeof error !== 'function')) return;
  try {
    Object.defineProperty(error, 'cleanupErrors', {
      configurable: true,
      value: cleanupErrors
    });
  } catch {}
}

export async function withTrustedPointerSequence(page, operation) {
  const touch = await isTouchPage(page);
  const session = touch ? await page.context().newCDPSession(page) : null;
  const touchId = 1;
  let possiblyHeld = false;
  let operationError;
  let result;
  const cleanupErrors = [];

  const touchPoint = ({ x, y }) => ({
    x,
    y,
    id: touchId,
    radiusX: 1,
    radiusY: 1,
    force: 1
  });

  const down = async (point) => {
    if (possiblyHeld) return true;
    if (touch) {
      possiblyHeld = true;
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [touchPoint(point)]
      });
    } else {
      await page.mouse.move(point.x, point.y);
      possiblyHeld = true;
      await page.mouse.down();
    }
    return true;
  };

  const move = async (point) => {
    if (touch) {
      if (!possiblyHeld) throw new Error('Cannot move a touch pointer before it is down.');
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [touchPoint(point)]
      });
    } else {
      await page.mouse.move(point.x, point.y);
    }
  };

  const up = async () => {
    if (!possiblyHeld) return;
    if (touch) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: []
      });
    } else {
      await page.mouse.up();
    }
    possiblyHeld = false;
  };

  try {
    result = await operation({ down, move, up, touch });
  } catch (error) {
    operationError = error;
  } finally {
    try {
      await up();
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await session?.detach();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (operationError) {
    if (cleanupErrors.length > 0) attachCleanupErrors(operationError, cleanupErrors);
    throw operationError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Trusted pointer cleanup failed.');
  }
  return result;
}

export async function withVisibleControlHold(page, locator, operation) {
  return withTrustedPointerSequence(page, async ({
    down: pointerDown,
    up: pointerUp
  }) => {
    let controlHeld = false;
    const down = async () => {
      if (controlHeld) return true;
      await expect(locator).toBeVisible();
      const box = await locator.boundingBox();
      if (!box) throw new Error('Visible hold control is not measurable.');
      controlHeld = true;
      return pointerDown({
        x: box.x + box.width / 2,
        y: box.y + box.height / 2
      });
    };
    const up = async () => {
      if (!controlHeld) return;
      await pointerUp();
      controlHeld = false;
    };

    return operation({ down, up });
  });
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
  const deadline = Date.now() + 20_000;

  await withTrustedPointerSequence(page, async ({ down, move }) => {
    let started = false;
    while (Date.now() < deadline) {
      if (await layer.getAttribute('data-status') === 'complete') return;
      const [stageBox, targetBox] = await Promise.all([stage.boundingBox(), target.boundingBox()]);
      if (!stageBox || !targetBox) throw new Error('Focus task controls are not measurable.');
      const point = {
        x: targetBox.x + targetBox.width / 2,
        y: targetBox.y + targetBox.height / 2
      };
      if (
        point.x < stageBox.x
        || point.x > stageBox.x + stageBox.width
        || point.y < stageBox.y
        || point.y > stageBox.y + stageBox.height
      ) {
        throw new Error('Focus target center is outside its visible stage.');
      }
      if (started) await move(point);
      else {
        await down(point);
        started = true;
      }
      await page.waitForTimeout(55);
    }
    throw new Error('Focus task did not complete before its deadline.');
  });
}

async function completeTimingTask(page) {
  const layer = page.locator('#field-task-layer');
  const stage = page.locator('[data-timing-stage]');
  const action = page.locator('[data-field-action]');
  const deadline = Date.now() + 20_000;
  let lastMeasurement = null;
  let actions = 0;

  await withVisibleControlHold(page, action, async ({ down, up }) => {
    while (Date.now() < deadline) {
      if (await layer.getAttribute('data-status') === 'complete') return;
      const routeIndex = Number(await layer.getAttribute('data-route-index'));
      lastMeasurement = await stage.evaluate((stageElement, {
        index,
        maximumDifference,
        timeoutMs
      }) => new Promise((resolve, reject) => {
        let previousDifference = Number.POSITIVE_INFINITY;
        let closestMeasurement = null;
        let sampleCount = 0;
        let settled = false;
        const markerElement = stageElement.querySelector('[data-route-marker]');
        const nodeElement = stageElement.querySelectorAll('[data-route-nodes] li')[index];
        if (!markerElement || !nodeElement) {
          reject(new Error(`Timing task controls are not measurable at route index ${index}.`));
          return;
        }

        let observer;
        let timer;
        const settle = (callback, value) => {
          if (settled) return;
          settled = true;
          observer?.disconnect();
          clearTimeout(timer);
          callback(value);
        };

        const sample = () => {
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
          const difference = Math.hypot(
            markerPosition.x - nodePosition.x,
            markerPosition.y - nodePosition.y
          );
          const approaching = difference <= previousDifference;
          const measurement = {
            routeIndex: index,
            markerPosition,
            nodePosition,
            difference,
            approaching
          };
          sampleCount += 1;
          if (!closestMeasurement || difference < closestMeasurement.difference) {
            closestMeasurement = measurement;
          }
          if (difference <= maximumDifference && approaching) {
            settle(resolve, measurement);
            return;
          }
          previousDifference = difference;
        };
        observer = new MutationObserver(sample);
        observer.observe(markerElement, { attributes: true, attributeFilter: ['style'] });
        timer = setTimeout(() => settle(
          reject,
          new Error(`Timing route ${index} did not reach its rendered node: ${JSON.stringify({
            closestMeasurement,
            sampleCount
          })}`)
        ), timeoutMs);
        sample();
      }), {
        index: routeIndex,
        maximumDifference: TIMING_ACTION_DISTANCE,
        timeoutMs: Math.min(5_000, Math.max(1, deadline - Date.now()))
      });
      await down();
      await up();
      actions += 1;
      await page.waitForTimeout(45);
    }
    throw new Error(`Timing task did not complete before its deadline: ${JSON.stringify({ lastMeasurement, actions })}`);
  });
}

async function completeListeningTask(page) {
  const layer = page.locator('#field-task-layer');
  const action = page.locator('[data-field-action]');
  const deadline = Date.now() + 25_000;

  await withVisibleControlHold(page, action, async ({ down, up }) => {
    while (Date.now() < deadline) {
      if (await layer.getAttribute('data-status') === 'complete') return;
      const quiet = await layer.getAttribute('data-quiet');
      if (quiet === 'true') await down();
      else await up();
      await page.waitForTimeout(65);
    }
    throw new Error('Listening task did not complete before its deadline.');
  });
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
      if (!box) throw new Error('Touch joystick is not measurable.');
      const center = {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2
      };
      const points = {
        KeyW: { x: center.x, y: box.y + 4 },
        KeyS: { x: center.x, y: box.y + box.height - 4 },
        KeyA: { x: box.x + 4, y: center.y },
        KeyD: { x: box.x + box.width - 4, y: center.y }
      };
      const current = await withTrustedPointerSequence(page, async ({ down, move }) => {
        await down(center);
        await move(points[key]);
        while (Date.now() < deadline) {
          const next = await worldState();
          if (next.hotspotId === hotspotId || reachedWaypoint(next.player)) return next;
          await page.waitForTimeout(50);
        }
        return worldState();
      });
      if (current.hotspotId === hotspotId) return;
    }
  }
  throw new Error(`Movement timed out before reaching ${hotspotId}.`);
}

export async function readSavedProgress(page) {
  return page.evaluate((progressKey) => JSON.parse(localStorage.getItem(progressKey)), PROGRESS_KEY);
}
