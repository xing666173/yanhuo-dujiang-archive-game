# Cinematic 3D and Desktop Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the teacher-only flow, make the narrative game fully operable with a mouse, and replace the blocky procedural scene with a browser-efficient cinematic-realistic character and Baiyangdian environment pass.

**Architecture:** Keep the current static Three.js application and story engine. Add one pure movement-source combiner, one DOM directional-control adapter, and one reusable procedural character module; keep scene assembly in `scene-builder.mjs` and express visual differences through scene and quality data. Existing save, dialogue, audio, and navigation contracts remain in place.

**Tech Stack:** HTML5, CSS, JavaScript ES modules, Three.js 0.185.1, Node.js test runner, Playwright 1.61.1, GitHub Pages.

## Global Constraints

- The release remains a static GitHub Pages site with no backend, CDN, remote runtime assets, or build-only production dependency.
- Remove every teacher-mode button, chapter-picker view, teacher startup branch, and `openTeacherChapter` API.
- `?mode=teacher` and unknown `mode` values open the ordinary main menu and do not alter progress.
- Keep ordinary menu actions: Continue, New Journey, Settings, and Return to Results.
- Preserve WASD, arrow-key, pointer-drag look, E, Enter, Space, and existing coarse-pointer controls.
- Desktop mouse users must be able to move, look, and interact without visible tutorial copy.
- Named team characters remain exactly two men and one woman; the back-facing player proxy has no extra team identity.
- Character models must register exactly two arms, two hands, two legs, and two feet.
- No external GLB, motion-capture, facial-capture, ray-tracing, or screen-space reflection dependency.
- Keep `auto`, `high`, and `low` quality modes and the existing one-time downgrade after 5 seconds below 26 FPS.
- Visual verification must cover 1440×900, 1920×1080, and 390×844 viewports.

---

### Task 1: Remove Teacher Mode and Replace Test-Only Chapter Entry

**Files:**
- Modify: `index.html:24-34`
- Modify: `game/index.html:21-43`
- Modify: `game/main.mjs:22-44,119-180,329-427`
- Modify: `game/ui/game-shell.mjs:1-80,109-155,204-255,317-338`
- Modify: `game/core/session-controller.mjs:37-58,194-230`
- Modify: `game/styles.css:136-163,238-260,521-553`
- Modify: `tests/unit/homepage-contract.unit.test.cjs`
- Modify: `tests/unit/game-shell-contract.unit.test.cjs`
- Modify: `tests/unit/session-controller.unit.test.mjs`
- Create: `tests/e2e/helpers/game-state.mjs`
- Modify: `tests/e2e/prototype-flow.spec.mjs`
- Modify: `tests/e2e/game-canvas.spec.mjs`
- Modify: `tests/e2e/visual-regression.spec.mjs`

**Interfaces:**
- Consumes: existing `createSessionController`, `createGameShell`, valid save schema, `?mode=new`.
- Produces: `openNewJourney(page)`, `installWetlandSave(page, { quality })`, and `openSavedWetland(page, { quality })` Playwright helpers; ordinary-menu behavior for legacy modes.

- [ ] **Step 1: Change unit contracts so teacher UI and controller APIs are forbidden**

Update the homepage assertion to keep only the new-journey link:

```js
const newJourney = page.getByRole('link', { name: '开始旅程' });
assert.equal(await newJourney.getAttribute('href'), 'game/?mode=new');
assert.equal(await page.getByRole('link', { name: '教师浏览' }).count(), 0);
```

Update the game-shell contract:

```js
assert.equal(await page.getByRole('button', { name: '教师浏览' }).count(), 0);
assert.equal(await page.locator('#chapter-menu').count(), 0);
assert.equal(
  await page.locator('#loading-view, #main-menu, #dialogue-layer, #settings-panel, #touch-controls, #webgl-fallback').count(),
  6
);
```

Add this assertion to the session-controller harness:

```js
test('session controller exposes no teacher-only entry point', () => {
  const harness = createHarness();
  assert.equal('openTeacherChapter' in harness.controller, false);
});
```

Delete the two teacher-save tests and remove `openTeacherChapter` from the controller disposal transition table. Their normal-save coverage remains in the existing new/continue tests.

- [ ] **Step 2: Run the focused unit tests and verify they fail**

Run:

```bash
node --test --test-name-pattern="homepage|game route|teacher-only" tests/unit/homepage-contract.unit.test.cjs tests/unit/game-shell-contract.unit.test.cjs tests/unit/session-controller.unit.test.mjs
```

Expected: FAIL because the homepage button, game-menu button, chapter menu, and controller method still exist.

- [ ] **Step 3: Add save-backed Playwright scene helpers before deleting teacher entry**

Create `tests/e2e/helpers/game-state.mjs`:

```js
import { expect } from '@playwright/test';

const PROGRESS_KEY = 'yanhuo-summer-echo:v1:progress';
const SETTINGS_KEY = 'yanhuo-summer-echo:v1:settings';

export async function openNewJourney(page) {
  await page.goto('/game/?mode=new');
  await expect(page.locator('[data-scene-ready="activity-room"]')).toBeVisible();
}

export async function installWetlandSave(page, { quality = 'low' } = {}) {
  const progress = JSON.stringify({
    storyState: {
      version: 1,
      activeScriptId: 'prologue',
      activeNodeId: 'prologue-end',
      stats: { truth: 0, empathy: 0, expression: 0 },
      cooperation: 0,
      readNodes: ['prologue-end'],
      choices: {},
      completedScripts: ['prologue']
    },
    sessionState: {
      version: 1,
      sceneId: 'activity-room',
      visitedHotspots: [],
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
}
```

Replace every `openTeacherChapter(...)` call in canvas and visual tests with `openNewJourney(...)` or `openSavedWetland(...)`. Replace the teacher-save E2E case with:

```js
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
```

- [ ] **Step 4: Delete teacher mode from production code**

Make these exact behavioral changes:

```js
const requestedMode = new URLSearchParams(location.search).get('mode');
const mode = requestedMode === 'new' ? 'new' : null;
```

Delete `teacherChapters`, `showTeacherMenu`, `onTeacherBrowse`, `onChapterSelect`, the `mode === 'teacher'` initial-story condition, and the teacher startup branch. Invalid modes go through:

```js
shell.showMainMenu({ hasSave: Boolean(savedProgress) });
```

Delete `deferTeacherSave` and `openTeacherChapter` from `session-controller.mjs`; `save()` always writes valid normal progress.

Delete these DOM elements:

```html
<button type="button" data-action="teacher-browse">教师浏览</button>
<section id="chapter-menu" class="game-layer chapter-menu" aria-label="章节选择" hidden>
  <div data-chapter-list></div>
</section>
```

Delete the teacher link from the homepage. Remove `chapters` from `BASE_VIEW_KEYS`, `views`, focus fallback, listeners, `showChapterMenu`, and chapter-menu-only CSS.

- [ ] **Step 5: Run all unit tests and the three affected E2E files**

Run:

```bash
npm run test:unit
npx playwright test tests/e2e/prototype-flow.spec.mjs tests/e2e/game-canvas.spec.mjs tests/e2e/visual-regression.spec.mjs
```

Expected: PASS. No test may navigate through a teacher button or chapter menu.

- [ ] **Step 6: Commit the removal**

```bash
git add index.html game/index.html game/main.mjs game/ui/game-shell.mjs game/core/session-controller.mjs game/styles.css tests
git commit -m "refactor: remove teacher browsing mode"
```

---

### Task 2: Add Unified Movement Sources and Desktop Direction Controls

**Files:**
- Create: `game/core/movement-input.mjs`
- Create: `game/ui/directional-controls.mjs`
- Modify: `game/index.html:80-92`
- Modify: `game/styles.css:186-223,519-582`
- Modify: `game/ui/game-shell.mjs:30-115,230-338`
- Modify: `game/main.mjs:40-60,449-563,594-637`
- Create: `tests/unit/movement-input.unit.test.mjs`
- Modify: `tests/unit/game-shell-contract.unit.test.cjs`
- Modify: `tests/e2e/game-canvas.spec.mjs`
- Modify: `tests/e2e/visual-regression.spec.mjs`

**Interfaces:**
- Produces: `createMovementInput({ onChange })`.
- Produces: `createDirectionalControls(root, { onMove })`.
- Consumes: `rawWorld.setMovement({ x, y })` and the existing touch-control callbacks.

- [ ] **Step 1: Write failing tests for movement-source composition**

Create `tests/unit/movement-input.unit.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createMovementInput } from '../../game/core/movement-input.mjs';

test('combines sources, normalizes diagonals, and clears all input', () => {
  const values = [];
  const input = createMovementInput({ onChange: (value) => values.push(value) });
  input.setSource('keyboard', { x: 1, y: 0 });
  input.setSource('desktop', { x: 0, y: 1 });
  assert.ok(Math.abs(values.at(-1).x - Math.SQRT1_2) < 0.0001);
  assert.ok(Math.abs(values.at(-1).y - Math.SQRT1_2) < 0.0001);
  input.clearSource('keyboard');
  assert.deepEqual(values.at(-1), { x: 0, y: 1 });
  input.clearAll();
  assert.deepEqual(values.at(-1), { x: 0, y: 0 });
});

test('rejects non-finite values and suppresses duplicate emissions', () => {
  const values = [];
  const input = createMovementInput({ onChange: (value) => values.push(value) });
  input.setSource('desktop', { x: Number.NaN, y: Infinity });
  input.setSource('desktop', { x: 0, y: 0 });
  assert.deepEqual(values, []);
});
```

- [ ] **Step 2: Run the new unit test and verify it fails**

Run:

```bash
node --test tests/unit/movement-input.unit.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the pure movement combiner**

Create `game/core/movement-input.mjs` with:

```js
function normalized(value = {}) {
  const x = Number.isFinite(Number(value.x)) ? Number(value.x) : 0;
  const y = Number.isFinite(Number(value.y)) ? Number(value.y) : 0;
  const magnitude = Math.hypot(x, y);
  const divisor = Math.max(1, magnitude);
  return { x: x / divisor, y: y / divisor };
}

export function createMovementInput({ onChange = () => {} } = {}) {
  const sources = new Map();
  let current = { x: 0, y: 0 };

  function emit() {
    const next = normalized([...sources.values()].reduce(
      (sum, value) => ({ x: sum.x + value.x, y: sum.y + value.y }),
      { x: 0, y: 0 }
    ));
    if (next.x === current.x && next.y === current.y) return;
    current = next;
    onChange({ ...current });
  }

  return {
    setSource(name, value) {
      sources.set(name, normalized(value));
      emit();
    },
    clearSource(name) {
      sources.delete(name);
      emit();
    },
    clearAll() {
      sources.clear();
      emit();
    },
    getValue() {
      return { ...current };
    }
  };
}
```

- [ ] **Step 4: Write a failing browser contract for desktop controls**

Add to `game-shell-contract.unit.test.cjs`:

```js
assert.equal(await page.locator('#desktop-controls').count(), 1);
assert.deepEqual(
  await page.locator('#desktop-controls button').evaluateAll((buttons) => (
    buttons.map((button) => [button.dataset.direction, button.getAttribute('aria-label')])
  )),
  [
    ['up', '向前移动'],
    ['left', '向左移动'],
    ['right', '向右移动'],
    ['down', '向后移动']
  ]
);
```

In the module-evaluation fixture, dispatch `pointerdown`, `pointerup`, `pointercancel`, and `lostpointercapture`, then assert the last movement is `{ x: 0, y: 0 }` and no callback fires after `destroy()`.

- [ ] **Step 5: Add the directional-control DOM and adapter**

Add to `game/index.html`:

```html
<nav id="desktop-controls" class="game-layer directional-controls" aria-label="移动方向">
  <button type="button" data-direction="up" aria-label="向前移动">↑</button>
  <button type="button" data-direction="left" aria-label="向左移动">←</button>
  <button type="button" data-direction="right" aria-label="向右移动">→</button>
  <button type="button" data-direction="down" aria-label="向后移动">↓</button>
</nav>
```

Implement `createDirectionalControls` with the fixed map:

```js
const DIRECTIONS = {
  up: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: -1 }
};
```

On `pointerdown`, capture the pointer, stop propagation, and emit the mapped direction. On `pointerup`, `pointercancel`, and `lostpointercapture`, release capture and emit zero. `reset()` emits zero; `destroy()` removes listeners before resetting.

- [ ] **Step 6: Integrate all input sources in `main.mjs`**

Create one combiner:

```js
const movementInput = createMovementInput({
  onChange(value) {
    desiredMovement = value;
    applyDesiredMovement();
  }
});
```

Use source names exactly:

```js
movementInput.setSource('keyboard', { x, y });
movementInput.setSource('desktop', value);
movementInput.setSource('touch', { x: value.x, y: -value.y });
```

`clearMovementInput()` clears held keys, resets both control adapters, calls `movementInput.clearAll()`, and writes zero to the world. Rename the shell dataset from `touchEligible` to `gameplayActive`; set it only when HUD is the base view and settings are closed.

- [ ] **Step 7: Style fixed, non-shifting desktop controls and the interaction button**

Use a 132×132 grid at the bottom left, 42×42 buttons, 4px radii, familiar arrow symbols, and no tutorial text. Show it only for `(pointer: fine)` while `data-gameplay-active="true"` and no dialogue/echo state. Move `.interaction-prompt` to the bottom right, make it a 54×54 icon button with text `◎`, and retain a descriptive `aria-label`.

On coarse pointers, hide desktop controls and keep the existing joystick. All controls must be `display:none` during dialogue, echo, menu, pause, and settings.

- [ ] **Step 8: Add E2E coverage for mouse movement and interruption**

Using `openSavedWetland(page)`, add:

```js
test('desktop direction control moves while held and stops on release', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await openSavedWetland(page);
  const before = await waitForPlayerPosition(page);
  const up = page.locator('#desktop-controls [data-direction="up"]');
  const box = await up.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  const released = await waitForPlayerPosition(page);
  expect(released[2]).toBeLessThan(before[2] - 0.5);
  await page.waitForTimeout(250);
  const stopped = await playerPosition(page);
  expect(stopped[2]).toBeCloseTo(released[2], 1);
});
```

Also assert controls hide during dialogue/settings and that dragging the canvas still changes travel direction.

- [ ] **Step 9: Run focused and full control tests**

Run:

```bash
node --test tests/unit/movement-input.unit.test.mjs
node --test tests/unit/game-shell-contract.unit.test.cjs
npx playwright test tests/e2e/game-canvas.spec.mjs tests/e2e/visual-regression.spec.mjs
```

Expected: PASS on desktop and mobile projects.

- [ ] **Step 10: Commit desktop controls**

```bash
git add game/core/movement-input.mjs game/ui/directional-controls.mjs game/index.html game/styles.css game/ui/game-shell.mjs game/main.mjs tests
git commit -m "feat: add desktop directional controls"
```

---

### Task 3: Build One Anatomically Stable Procedural Character System

**Files:**
- Create: `game/data/character-visuals.mjs`
- Create: `game/render/resource-store.mjs`
- Create: `game/render/character-model.mjs`
- Modify: `game/render/scene-builder.mjs:1-183,183-306,534-587`
- Modify: `game/scenes/activity-room.mjs:230-260`
- Modify: `game/scenes/reeds-wetland.mjs:148-170`
- Create: `tests/unit/character-model.unit.test.mjs`
- Modify: `tests/unit/scene-definitions.unit.test.mjs`
- Modify: `tests/unit/scene-lifecycle.unit.test.mjs`

**Interfaces:**
- Produces: `createResourceStore()`, `createNoiseTexture(resources, key, colors, size)`, and `seededRandom(seed)`.
- Produces: `createCharacterModel(record, { resources, quality }) -> { group, parts, update, setQuality }`.
- Produces: `characterVisuals` keyed by `player`, `gu-yan`, `chen-yu`, and `lin-xia`.
- Consumes: scene `person` records containing `characterId`, transform, scale, cue, and pose.

- [ ] **Step 1: Write failing anatomy and identity tests**

Create `tests/unit/character-model.unit.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { characterVisuals } from '../../game/data/character-visuals.mjs';
import { createCharacterModel } from '../../game/render/character-model.mjs';
import { createResourceStore } from '../../game/render/resource-store.mjs';
import { chooseQuality } from '../../game/render/quality.mjs';

const required = [
  'left-upper-arm', 'left-forearm', 'left-hand',
  'right-upper-arm', 'right-forearm', 'right-hand',
  'left-thigh', 'left-shin', 'left-foot',
  'right-thigh', 'right-shin', 'right-foot'
];

test('named team visuals are exactly two men and one woman', () => {
  const team = ['gu-yan', 'chen-yu', 'lin-xia'].map((id) => characterVisuals[id]);
  assert.deepEqual(team.map(({ gender }) => gender).sort(), ['female', 'male', 'male']);
  assert.equal(new Set(team.map(({ hairStyle }) => hairStyle)).size, 3);
  assert.equal(new Set(team.map(({ prop }) => prop)).size, 3);
});

test('character model registers one complete left and right anatomy', () => {
  const resources = createResourceStore();
  const model = createCharacterModel({
    ...characterVisuals['lin-xia'],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0.88, 1.68, 0.85],
    pose: 'listening'
  }, { resources, quality: chooseQuality({ requested: 'high' }) });
  assert.deepEqual([...model.parts.keys()].filter((name) => required.includes(name)).sort(), [...required].sort());
  assert.equal(model.group.getObjectsByProperty('name', 'left-hand').length, 1);
  assert.equal(model.group.getObjectsByProperty('name', 'right-hand').length, 1);
  resources.dispose();
});
```

Add scene assertions:

```js
assert.deepEqual(
  reedsWetlandDefinition.primitives
    .filter(({ kind }) => kind === 'person')
    .map(({ characterId }) => characterId)
    .sort(),
  ['chen-yu', 'gu-yan', 'lin-xia']
);
```

- [ ] **Step 2: Run the character tests and verify they fail**

Run:

```bash
node --test tests/unit/character-model.unit.test.mjs tests/unit/scene-definitions.unit.test.mjs
```

Expected: FAIL because the visual data, shared resource module, and character module do not exist.

- [ ] **Step 3: Extract the existing resource cache without changing behavior**

Move `seededRandom`, `createResourceStore`, and `createNoiseTexture` from `scene-builder.mjs` to `resource-store.mjs`. Preserve geometry/material/texture cache keys, base colors, and one-time disposal. Import those functions back into `scene-builder.mjs`.

Run:

```bash
node --test tests/unit/scene-lifecycle.unit.test.mjs tests/unit/scene-definitions.unit.test.mjs
```

Expected: PASS with no scene behavior change.

- [ ] **Step 4: Define stable team appearance data**

Create `character-visuals.mjs` with these exact identities:

```js
export const characterVisuals = Object.freeze({
  player: {
    gender: null, hairStyle: 'short-layered', jacket: '#334640',
    trousers: '#252d2e', skin: '#b98265', accent: '#9c8755',
    backpack: '#566354', prop: null
  },
  'gu-yan': {
    gender: 'male', hairStyle: 'short-side', jacket: '#536672',
    trousers: '#293033', skin: '#bd896b', accent: '#8fa1aa',
    backpack: '#4f5d60', prop: 'notebook'
  },
  'chen-yu': {
    gender: 'male', hairStyle: 'short-wavy', jacket: '#405247',
    trousers: '#272f2e', skin: '#b77e60', accent: '#984942',
    backpack: '#4a5549', prop: 'camera'
  },
  'lin-xia': {
    gender: 'female', hairStyle: 'low-ponytail', jacket: '#77776f',
    trousers: '#313536', skin: '#c18c6d', accent: '#a94743',
    backpack: '#65645b', prop: 'voice-recorder'
  }
});
```

- [ ] **Step 5: Implement the reusable character graph**

`createCharacterModel` must:

1. Create named pivot groups for shoulders, elbows, hips, and knees.
2. Add tapered torso and pelvis, neck, head, nose/ear silhouette, hair pieces, upper/lower limbs, hands, shoes, backpack, straps, and one optional prop.
3. Register every mesh or joint in a `Map` named `parts`.
4. Apply `position`, `rotation`, and `scale` once to the root group.
5. Expose:

```js
return {
  group,
  parts,
  update({ elapsed = 0, movementMagnitude = 0 } = {}) {
    const stride = Math.sin(elapsed * 9) * Math.min(1, movementMagnitude) * 0.42;
    parts.get('left-hip').rotation.x = stride;
    parts.get('right-hip').rotation.x = -stride;
    parts.get('left-shoulder').rotation.x = -stride * 0.65;
    parts.get('right-shoulder').rotation.x = stride * 0.65;
    group.position.y = group.userData.baseY
      + Math.abs(Math.sin(elapsed * 9)) * Math.min(1, movementMagnitude) * 0.025;
  },
  setQuality(nextQuality) {
    group.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = nextQuality.shadows;
      object.receiveShadow = nextQuality.shadows;
    });
  }
};
```

NPC idle poses set fixed joint rotations before `update`; only the player receives nonzero `movementMagnitude`.

- [ ] **Step 6: Replace both scene character implementations**

Delete `addFigureMesh` and `createPerson` from `scene-builder.mjs`. For each person record:

```js
const appearance = characterVisuals[record.characterId];
const model = createCharacterModel(
  { ...appearance, ...record },
  { resources, quality }
);
animations.push((time) => model.update({ elapsed: time / 1000, movementMagnitude: 0 }));
object = model.group;
```

Add `characterId` to all three people in both scene definitions. Map camera to `chen-yu`, notebook to `gu-yan`, and voice recorder or route folder to `lin-xia`.

- [ ] **Step 7: Run anatomy, scene, and lifecycle tests**

Run:

```bash
node --test tests/unit/character-model.unit.test.mjs tests/unit/scene-definitions.unit.test.mjs tests/unit/scene-lifecycle.unit.test.mjs
```

Expected: PASS. Disposal remains one-time and anatomy counts are exact.

- [ ] **Step 8: Commit the character system**

```bash
git add game/data/character-visuals.mjs game/render/resource-store.mjs game/render/character-model.mjs game/render/scene-builder.mjs game/scenes tests/unit
git commit -m "feat: add unified procedural character models"
```

---

### Task 4: Enrich Baiyangdian Materials, Water, Vegetation, and Lighting

**Files:**
- Modify: `game/render/quality.mjs`
- Modify: `game/render/resource-store.mjs`
- Modify: `game/render/character-model.mjs`
- Modify: `game/render/scene-builder.mjs`
- Modify: `game/render/world.mjs:103-121,227-259,301-381`
- Modify: `game/scenes/reeds-wetland.mjs`
- Modify: `tests/unit/quality.unit.test.mjs`
- Modify: `tests/unit/scene-definitions.unit.test.mjs`
- Modify: `tests/e2e/game-canvas.spec.mjs`

**Interfaces:**
- Extends quality records with `waterSegments`, `lotusCount`, `characterDetail`, `vegetationWind`, and `shadowMapSize`.
- Adds scene primitive kinds `lotus-field` and `tree-line`.
- Keeps `buildScene(definition, { quality })` and world public methods unchanged.

- [ ] **Step 1: Write failing quality and scene-detail contracts**

Change the expected profiles:

```js
assert.deepEqual(chooseQuality({ requested: 'low', devicePixelRatio: 4 }), {
  pixelRatio: 1,
  shadows: false,
  antialias: false,
  reedCount: 320,
  lotusCount: 28,
  waterSegments: 18,
  characterDetail: 0,
  vegetationWind: false,
  shadowMapSize: 0,
  postEffects: false
});

assert.deepEqual(chooseQuality({ requested: 'high', devicePixelRatio: 1.25 }), {
  pixelRatio: 1.5,
  shadows: true,
  antialias: true,
  reedCount: 760,
  lotusCount: 72,
  waterSegments: 36,
  characterDetail: 1,
  vegetationWind: true,
  shadowMapSize: 2048,
  postEffects: true
});
```

Extend `primitiveKinds` and assert:

```js
assert.ok(reedsWetlandDefinition.primitives.some(({ kind }) => kind === 'lotus-field'));
assert.ok(reedsWetlandDefinition.primitives.some(({ kind }) => kind === 'tree-line'));
assert.ok(reedsWetlandDefinition.environment.exposure > 0);
assert.ok(reedsWetlandDefinition.environment.fogNear < reedsWetlandDefinition.environment.fogFar);
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
node --test tests/unit/quality.unit.test.mjs tests/unit/scene-definitions.unit.test.mjs
```

Expected: FAIL because the new quality fields and primitive records are absent.

- [ ] **Step 3: Add deterministic wood color and roughness textures**

Extend `resource-store.mjs` with `createWoodTextures(resources, key, colors)`. It creates two 128×32 CanvasTextures:

- color map: base fill, 18 long horizontal grain lines, 8 short darker scratches;
- roughness map: mid-gray fill with lighter worn streaks and darker damp streaks;
- both use `RepeatWrapping`, sRGB only for the color texture, and deterministic `seededRandom(key)`.

For `weathered-wood-*` materials, set:

```js
material.map = colorMap;
material.roughnessMap = roughnessMap;
material.roughness = 0.84;
material.map.repeat.set(2.4, 1);
material.roughnessMap.repeat.copy(material.map.repeat);
```

Use brown-gray source colors rather than the existing neutral gray noise so wood reads as wood under warm light.

Make `character-model.mjs` consume `quality.characterDetail`. Meshes tagged with
`userData.detailLevel = 1` (ears, nose, backpack buckles, prop controls, and
secondary hair pieces) are visible only when `characterDetail >= 1`; anatomy,
hair silhouette, clothing, backpack, and the primary prop remain visible in both
quality modes. Before Task 4 profiles exist, the module must use
`quality.characterDetail ?? (quality.postEffects ? 1 : 0)` so Task 3 remains
independently testable.

- [ ] **Step 4: Upgrade water without expensive reflection techniques**

Keep MeshPhysicalMaterial and two water layers. Use `quality.waterSegments`; add:

```js
clearcoat: 1,
clearcoatRoughness: 0.16,
roughness: sheen ? 0.18 : 0.28,
metalness: 0,
ior: 1.333,
reflectivity: 0.82
```

Animate geometry only while the world frame loop runs. Add a camera-facing sheen by offsetting the second texture layer; do not add SSR, refraction render targets, or per-frame texture allocation.

- [ ] **Step 5: Add lotus and distant tree instances**

Implement `createLotusField(record, count, resources)` with shared stem cylinder, flattened circle leaf, and occasional closed bud geometry. Distribute instances with seeded randomness and keep them outside the boardwalk walkable corridor.

Implement `createTreeLine(record, count, resources)` with instanced trunks and 2-3 overlapping low-detail crown shapes. Tree line meshes do not cast shadows.

Add at least two lotus-field records and one tree-line record to `reeds-wetland.mjs`.

- [ ] **Step 6: Improve reeds, hotspots, and scene light**

- Keep InstancedMesh reed batches.
- On high quality, attach one `uTime` shader uniform per reed material and bend upper vertices by at most 0.035 world units; on low quality, leave shader source unchanged.
- Replace the vertical hotspot beacon with a low ground ring plus a shallow transparent halo.
- Keep active-marker scale and emissive changes through `ringMaterial` and `haloMaterial`.
- Set shadow map size from `quality.shadowMapSize`.
- Read `environment.exposure` in `world.loadScene()` and update `renderer.toneMappingExposure`.
- Preserve echo tinting through the existing `material.userData.baseColor` path. Water remains `MeshPhysicalMaterial`, stores `baseColor` when created, and restores that exact color when echo mode ends.

- [ ] **Step 7: Run quality, scene, and canvas tests**

Run:

```bash
node --test tests/unit/quality.unit.test.mjs tests/unit/scene-definitions.unit.test.mjs tests/unit/scene-lifecycle.unit.test.mjs
npx playwright test tests/e2e/game-canvas.spec.mjs --project=desktop
```

Expected: PASS. Canvas evidence remains nonblank with at least 12 color buckets and no page errors.

- [ ] **Step 8: Commit the environment pass**

```bash
git add game/render game/scenes/reeds-wetland.mjs tests/unit tests/e2e/game-canvas.spec.mjs
git commit -m "feat: enrich cinematic wetland environment"
```

---

### Task 5: Use the Character System for the Player and Preserve Quality Transitions

**Files:**
- Modify: `game/render/world.mjs:1-93,95-135,193-225,255-269,357-403`
- Modify: `game/render/character-model.mjs`
- Modify: `tests/unit/character-model.unit.test.mjs`
- Modify: `tests/e2e/game-canvas.spec.mjs`
- Modify: `tests/e2e/prototype-flow.spec.mjs`

**Interfaces:**
- Consumes: `characterVisuals.player`, `createResourceStore`, and `createCharacterModel`.
- Keeps: `createWorld({...})` public API and status text format.
- Produces: player walk/idle animation driven by movement magnitude.

- [ ] **Step 1: Add failing animation-stability tests**

Extend `character-model.unit.test.mjs`:

```js
test('walk update moves paired limbs in opposite directions and idle returns to neutral', () => {
  const resources = createResourceStore();
  const model = createCharacterModel({
    ...characterVisuals.player,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0.9, 1.72, 0.88]
  }, { resources, quality: chooseQuality({ requested: 'low' }) });
  model.update({ elapsed: 0.2, movementMagnitude: 1 });
  assert.notEqual(model.parts.get('left-hip').rotation.x, model.parts.get('right-hip').rotation.x);
  model.update({ elapsed: 0.4, movementMagnitude: 0 });
  assert.ok(Math.abs(model.parts.get('left-hip').rotation.x) < 0.0001);
  assert.ok(Math.abs(model.parts.get('right-hip').rotation.x) < 0.0001);
  resources.dispose();
});
```

- [ ] **Step 2: Run the animation test and verify it fails**

Run:

```bash
node --test tests/unit/character-model.unit.test.mjs
```

Expected: FAIL if idle does not reset all animated joints.

- [ ] **Step 3: Replace `createPlayer` in `world.mjs`**

Create player resources once:

```js
const playerResources = createResourceStore();
const playerModel = createCharacterModel({
  ...characterVisuals.player,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [0.9, 1.72, 0.88],
  pose: 'neutral'
}, { resources: playerResources, quality: activeQuality });
const player = playerModel.group;
```

In each frame, after movement resolution:

```js
playerModel.update({
  elapsed: time / 1000,
  movementMagnitude: Math.hypot(movement.x, movement.y)
});
```

On quality change, call `playerModel.setQuality(activeQuality)`. On world disposal, call `playerResources.dispose()` exactly once instead of `player.userData.dispose()`.

- [ ] **Step 4: Preserve player state through scene and quality rebuilds**

Verify and retain:

- player position through `setQuality`;
- player yaw and camera yaw;
- completed hotspots;
- active hotspot;
- scene-ready marker;
- movement state;
- no duplicated player group after repeated quality switches.

Add an E2E assertion that switches high → low → high while moving, then checks one player root by a stable `group.name = 'player-character'` and a nonblank canvas.

- [ ] **Step 5: Run character and flow tests**

Run:

```bash
node --test tests/unit/character-model.unit.test.mjs
npx playwright test tests/e2e/game-canvas.spec.mjs tests/e2e/prototype-flow.spec.mjs
```

Expected: PASS for desktop and mobile projects; player movement coordinates still change and pause/dialogue still freeze movement.

- [ ] **Step 6: Commit player integration**

```bash
git add game/render/world.mjs game/render/character-model.mjs tests/unit/character-model.unit.test.mjs tests/e2e
git commit -m "feat: animate the unified player model"
```

---

### Task 6: Complete Visual, Accessibility, and Release Verification

**Files:**
- Modify: `tests/e2e/visual-regression.spec.mjs`
- Modify: `tests/e2e/game-canvas.spec.mjs`
- Modify: `tests/unit/release-contract.unit.test.cjs`
- Modify: `README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: final menu, controls, character, quality, and scene behavior.
- Produces: screenshot and canvas evidence in `test-results/`; documentation matching the released controls.

- [ ] **Step 1: Add final overlap and visibility assertions**

For desktop gameplay assert:

```js
await expect(page.locator('#desktop-controls')).toBeVisible();
await expect(page.locator('#touch-controls')).toBeHidden();
await expect(page.locator('#desktop-controls button')).toHaveCount(4);
```

For mobile gameplay assert the inverse. Extend the overlap collector with `desktopControls` and require:

```js
expect(evidence.desktopDialogueIntersect).toBe(false);
expect(evidence.desktopRuntimeIntersect).toBe(false);
expect(evidence.interactionDialogueIntersect).toBe(false);
```

During dialogue, settings, pause, and echo, assert both desktop and touch movement controls are hidden.

- [ ] **Step 2: Add final visual evidence at required sizes**

Capture:

- ordinary menu at 1440×900;
- Baiyangdian exploration at 1440×900;
- Baiyangdian exploration at 1920×1080;
- portrait mobile gameplay at 390×844;
- dialogue at desktop and mobile sizes.

For each gameplay capture, run the existing canvas pixel sampler and record visible ratio, luminance range, color buckets, canvas bounds, and UI overlap evidence.

- [ ] **Step 3: Update documentation and release contracts**

Update `README.md` to state:

- ordinary entry only;
- desktop keyboard plus mouse direction controls;
- pointer-drag view;
- click/E/Enter/Space interaction;
- coarse-pointer joystick;
- automatic quality downgrade;
- all runtime assets remain local.

Add `.superpowers/` to `.gitignore` so visual brainstorming artifacts are never published.

Update release-contract assertions to require the new control description and forbid `mode=teacher`, `teacher-browse`, `chapter-menu`, and `openTeacherChapter` in release HTML and JavaScript outside historical design documents.

- [ ] **Step 4: Run formatting and static checks**

Run:

```bash
git diff --check
npm run test:unit
```

Expected: no whitespace errors; all unit tests pass.

- [ ] **Step 5: Run the complete Playwright suite**

Run:

```bash
npm run test:e2e
```

Expected: all desktop and mobile projects pass with no failed request, page error, blank canvas, horizontal overflow, or UI overlap.

- [ ] **Step 6: Inspect rendered screenshots**

Open the 1440×900, 1920×1080, and 390×844 gameplay images. Confirm:

- player and three named NPCs have complete limbs and no duplicate hands;
- the named NPC group reads as two men and one woman;
- wood, water, reeds, lotus leaves, tree line, and morning fog are distinguishable;
- the boardwalk remains the dominant navigation path;
- desktop controls do not cover the player, hotspot, runtime controls, or dialogue;
- no text or button overflows.

If any check fails, fix the owning task’s module and rerun that task’s focused tests before repeating the full suite.

- [ ] **Step 7: Commit release verification**

```bash
git add .gitignore README.md tests
git commit -m "test: verify cinematic controls and layouts"
```

- [ ] **Step 8: Perform branch completion and publish**

Use `superpowers:verification-before-completion`, then `superpowers:finishing-a-development-branch`. After the verified branch is integrated into `main`:

```bash
git push origin main
```

Wait for GitHub Pages deployment, then smoke-test:

```text
https://xing666173.github.io/yanhuo-dujiang-archive-game/
https://xing666173.github.io/yanhuo-dujiang-archive-game/game/
https://xing666173.github.io/yanhuo-dujiang-archive-game/game/?mode=teacher
```

The first URL must show no teacher link. The second and third must show the same ordinary game menu. Start a journey and verify keyboard movement, mouse-button movement, pointer-drag look, clickable interaction, quality switching, and a nonblank Baiyangdian scene.
