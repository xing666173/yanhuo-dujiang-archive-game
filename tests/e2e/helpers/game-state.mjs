import { expect } from '@playwright/test';

const PROGRESS_KEY = 'yanhuo-summer-echo:v1:progress';
const SETTINGS_KEY = 'yanhuo-summer-echo:v1:settings';

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
  await page.addInitScript(({ progressKey, settingsKey, qualityValue, serializedProgress }) => {
    localStorage.setItem(settingsKey, JSON.stringify({ quality: qualityValue }));
    localStorage.setItem(progressKey, serializedProgress);
  }, {
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
