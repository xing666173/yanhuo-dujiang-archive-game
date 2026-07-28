# Field Team Challenges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three short, replay-safe field challenges to the Baiyangdian chapter so each teammate interaction includes a briefing, a distinct playable action, a scored result, and a saved chapter evaluation.

**Architecture:** Keep the existing static Three.js world, story engine, and session controller. Add one deterministic DOM-independent task engine, one field-task data module, and one full-screen DOM view; the session controller gates each hotspot between its briefing and result scripts and stores normalized task results. Main only composes the view with the existing shell and clears world input while a task is active.

**Tech Stack:** HTML5, CSS, JavaScript ES modules, Three.js 0.185.1, Node.js test runner, Playwright 1.61.1, GitHub Pages.

## Global Constraints

- The release remains a static GitHub Pages site with no backend, CDN, remote runtime asset, or build step.
- Named team characters remain exactly two men and one woman.
- Do not add evidence matching, archive repair, material sorting, combat, jumping, pursuit, or physics puzzles.
- Every task must be completable with desktop pointer and keyboard input and with touch input.
- Tasks never enter a permanent failure state; mistakes reduce the one-to-three-star score and gradually widen timing tolerance where needed.
- Task UI is a full-screen HUD over the live 3D scene, not a nested card or settings modal.
- Existing WASD, arrow-key movement, pointer-drag look, E/Enter/Space interaction, touch joystick, dialogue, pause, echo, quality switching, and save behavior must remain valid outside tasks.
- Old valid saves without `fieldTasks` must load and receive one-star compatibility results for already completed reed hotspots.
- Runtime assets remain local and use relative paths.
- Visual verification covers 1440x900, 844x390, and 390x844.

## File Map

- Create `game/data/field-tasks.mjs`: immutable task names, teammate labels, mechanic kinds, thresholds, and timing constants.
- Create `game/core/field-task-engine.mjs`: deterministic focus, timing, and listening state machines with one shared public API.
- Create `game/ui/field-task-view.mjs`: DOM rendering, keyboard/pointer/touch input, animation lifecycle, and accessible task announcements.
- Modify `game/index.html`: static field-task HUD structure.
- Modify `game/styles.css`: cinematic HUD, focus target, route timeline, listening wave, score, and responsive rules.
- Modify `game/ui/game-shell.mjs`: make task activity mutually exclusive with world controls.
- Modify `game/core/save-store.mjs`: validate and migrate optional task results.
- Modify `game/core/session-controller.mjs`: gate hotspot completion behind tasks, save scores, restore active tasks, and build chapter task summary.
- Modify `game/data/reeds.mjs`: split each hotspot into briefing and result scripts.
- Modify `game/data/scripts.mjs`: register the three result scripts.
- Modify `game/main.mjs`: create the task view and connect task callbacks to session APIs.
- Modify `README.md`: document the field-task loop and controls.
- Create `tests/unit/field-task-engine.unit.test.mjs`: deterministic mechanic and score coverage.
- Create `tests/unit/field-task-view.unit.test.cjs`: task-layer DOM, lifecycle, and input contract coverage.
- Modify `tests/unit/save-store.unit.test.mjs`: migration and validation coverage.
- Modify `tests/unit/session-controller.unit.test.mjs`: task gate, cancel, complete, restore, and summary coverage.
- Modify `tests/unit/story-data.unit.test.mjs`: briefing/result graph coverage.
- Modify `tests/unit/game-shell-contract.unit.test.cjs`: task/control exclusivity coverage.
- Modify `tests/unit/release-contract.unit.test.cjs`: published-file and forbidden-theme coverage.
- Modify `tests/e2e/helpers/game-state.mjs`: task-aware save builders and user-level challenge helpers.
- Modify `tests/e2e/prototype-flow.spec.mjs`: complete all three tasks on desktop and touch projects.
- Modify `tests/e2e/game-canvas.spec.mjs`: freeze world movement/look while a task is active.
- Modify `tests/e2e/visual-regression.spec.mjs`: capture all mechanics and responsive layouts.

---

### Task 1: Deterministic Field Task Engine

**Files:**
- Create: `game/data/field-tasks.mjs`
- Create: `game/core/field-task-engine.mjs`
- Create: `tests/unit/field-task-engine.unit.test.mjs`

**Interfaces:**
- Produces `FIELD_TASKS`, keyed by `camera-spot`, `notes-spot`, and `voice-spot`.
- Produces `createFieldTaskEngine(config)` returning `tick(deltaMs)`, `setAim({ x, y })`, `actionDown()`, `actionUp()`, `getSnapshot()`, and `dispose()`.
- Snapshot shape is `{ id, kind, status, progress, elapsedMs, mistakes, stars, aim, target, route, noise, quiet, actionActive }`.
- Normalized aim coordinates and target coordinates are always within `0..1`; progress is always within `0..1`.

- [ ] **Step 1: Write the field-task data and initial-state tests**

Create `tests/unit/field-task-engine.unit.test.mjs` with:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createFieldTaskEngine } from '../../game/core/field-task-engine.mjs';
import { FIELD_TASKS } from '../../game/data/field-tasks.mjs';

test('defines one distinct mechanic for each teammate hotspot', () => {
  assert.deepEqual(Object.keys(FIELD_TASKS).sort(), [
    'camera-spot', 'notes-spot', 'voice-spot'
  ]);
  assert.deepEqual(
    Object.values(FIELD_TASKS).map(({ kind }) => kind).sort(),
    ['focus', 'listening', 'timing']
  );
  assert.equal(new Set(Object.values(FIELD_TASKS).map(({ teammateId }) => teammateId)).size, 3);
});

test('each field task starts active with finite bounded state', () => {
  for (const config of Object.values(FIELD_TASKS)) {
    const engine = createFieldTaskEngine(config);
    const state = engine.getSnapshot();
    assert.equal(state.status, 'active');
    assert.equal(state.progress, 0);
    assert.equal(state.elapsedMs, 0);
    assert.equal(state.mistakes, 0);
    assert.ok(Number.isFinite(state.target.x));
    assert.ok(Number.isFinite(state.target.y));
    engine.dispose();
  }
});
```

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```powershell
& 'D:\node\node.exe' --test tests/unit/field-task-engine.unit.test.mjs
```

Expected: FAIL because both imported modules are absent.

- [ ] **Step 3: Add exact immutable field-task configurations**

Create `game/data/field-tasks.mjs`:

```js
const task = (value) => Object.freeze(value);

export const FIELD_TASKS = Object.freeze({
  'camera-spot': task({
    id: 'camera-spot',
    kind: 'focus',
    teammateId: 'chen-yu',
    teammateName: '陈屿',
    title: '晨雾取景',
    lockMs: 1600,
    targetRadius: 0.12
  }),
  'notes-spot': task({
    id: 'notes-spot',
    kind: 'timing',
    teammateId: 'gu-yan',
    teammateName: '顾言',
    title: '路线节奏',
    nodePositions: Object.freeze([0.2, 0.5, 0.8]),
    sweepMs: 2400,
    baseTolerance: 0.075
  }),
  'voice-spot': task({
    id: 'voice-spot',
    kind: 'listening',
    teammateId: 'lin-xia',
    teammateName: '林夏',
    title: '安静收声',
    recordMs: 2600,
    quietThreshold: 0.44
  })
});
```

- [ ] **Step 4: Implement the minimal shared engine and defensive normalization**

Create `game/core/field-task-engine.mjs` with:

```js
const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

export function createFieldTaskEngine(config = {}) {
  if (!['focus', 'timing', 'listening'].includes(config.kind)) {
    throw new TypeError(`Unknown field task kind: ${config.kind}`);
  }
  let disposed = false;
  let elapsedMs = 0;
  let progress = 0;
  let mistakes = 0;
  let actionActive = false;
  let aim = { x: 0.5, y: 0.5 };
  let routeIndex = 0;
  let wasLocked = false;
  let wasQuiet = true;
  let status = 'active';
  let stars = 0;

  function target() {
    const seconds = elapsedMs / 1000;
    return {
      x: clamp01(0.5 + Math.sin(seconds * 0.7) * 0.22),
      y: clamp01(0.5 + Math.cos(seconds * 0.9) * 0.16)
    };
  }

  function marker() {
    const phase = (elapsedMs % config.sweepMs) / config.sweepMs;
    return phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
  }

  function noise() {
    const seconds = elapsedMs / 1000;
    return clamp01(0.46 + Math.sin(seconds * 1.7) * 0.31 + Math.sin(seconds * 4.3) * 0.12);
  }

  function finish() {
    if (progress < 1 || status === 'complete') return;
    status = 'complete';
    actionActive = false;
    if (mistakes <= 1 && elapsedMs <= 18_000) stars = 3;
    else if (mistakes <= 4 && elapsedMs <= 30_000) stars = 2;
    else stars = 1;
  }

  function tick(deltaMs) {
    const delta = Number(deltaMs);
    if (disposed || status !== 'active' || !Number.isFinite(delta) || delta <= 0) return;
    elapsedMs += Math.min(delta, 100);
    finish();
  }

  function actionDown() {
    if (disposed || status !== 'active' || actionActive) return;
    actionActive = true;
  }

  function getSnapshot() {
    const currentTarget = target();
    const currentNoise = noise();
    return {
      id: config.id,
      kind: config.kind,
      status,
      progress,
      elapsedMs,
      mistakes,
      stars,
      aim: { ...aim },
      target: currentTarget,
      route: {
        index: routeIndex,
        count: config.nodePositions?.length || 0,
        marker: config.kind === 'timing' ? marker() : 0,
        nodes: [...(config.nodePositions || [])]
      },
      noise: currentNoise,
      quiet: currentNoise <= (config.quietThreshold ?? 1),
      actionActive
    };
  }

  return {
    tick,
    setAim(value = {}) {
      if (disposed || status !== 'active') return;
      if (Number.isFinite(Number(value.x))) aim.x = clamp01(value.x);
      if (Number.isFinite(Number(value.y))) aim.y = clamp01(value.y);
    },
    actionDown,
    actionUp() {
      actionActive = false;
    },
    getSnapshot,
    dispose() {
      disposed = true;
      actionActive = false;
    }
  };
}
```

This minimum implementation satisfies the initial-state contract while leaving progress at zero. The next focused tests therefore fail for the intended missing mechanic rather than for an undefined API.

- [ ] **Step 5: Write the failing focus mechanic tests**

Append:

```js
test('focus task gains lock inside the moving target and drains outside it', () => {
  const engine = createFieldTaskEngine(FIELD_TASKS['camera-spot']);
  for (let index = 0; index < 20; index += 1) {
    const { target } = engine.getSnapshot();
    engine.setAim(target);
    engine.tick(100);
  }
  assert.equal(engine.getSnapshot().status, 'complete');
  assert.equal(engine.getSnapshot().progress, 1);
});

test('focus task ignores non-finite aim input', () => {
  const engine = createFieldTaskEngine(FIELD_TASKS['camera-spot']);
  engine.setAim({ x: Number.NaN, y: Number.POSITIVE_INFINITY });
  assert.deepEqual(engine.getSnapshot().aim, { x: 0.5, y: 0.5 });
});
```

- [ ] **Step 6: Run RED, then implement focus accumulation**

Run the focused file and confirm the first test fails because progress remains zero. In `tick(deltaMs)`:

```js
const delta = Number(deltaMs);
if (disposed || status !== 'active' || !Number.isFinite(delta) || delta <= 0) return;
const boundedDelta = Math.min(delta, 100);
elapsedMs += boundedDelta;
if (config.kind === 'focus') {
  const nextTarget = target();
  const distance = Math.hypot(aim.x - nextTarget.x, aim.y - nextTarget.y);
  const locked = distance <= config.targetRadius;
  if (wasLocked && !locked) mistakes += 1;
  wasLocked = locked;
  progress = clamp01(progress + (locked
    ? boundedDelta / config.lockMs
    : -boundedDelta / 4000));
}
finish();
```

- [ ] **Step 7: Write the failing timing mechanic tests**

Append:

```js
test('timing task accepts nodes in order and a miss never clears completed nodes', () => {
  const engine = createFieldTaskEngine(FIELD_TASKS['notes-spot']);
  engine.actionDown();
  assert.equal(engine.getSnapshot().route.index, 0);
  assert.equal(engine.getSnapshot().mistakes, 1);
  engine.actionUp();
  for (const node of FIELD_TASKS['notes-spot'].nodePositions) {
    while (Math.abs(engine.getSnapshot().route.marker - node) > 0.02) engine.tick(16);
    engine.actionDown();
    engine.actionUp();
  }
  assert.equal(engine.getSnapshot().status, 'complete');
  assert.equal(engine.getSnapshot().route.index, 3);
});
```

- [ ] **Step 8: Run RED, then implement timing actions**

For timing tasks, `actionDown()` must:

```js
if (disposed || status !== 'active') return;
actionActive = true;
if (config.kind === 'timing') {
  const expected = config.nodePositions[routeIndex];
  const error = Math.abs(marker() - expected);
  const tolerance = config.baseTolerance + Math.min(mistakes, 3) * 0.035;
  if (error <= tolerance) {
    routeIndex += 1;
    progress = routeIndex / config.nodePositions.length;
  } else {
    mistakes += 1;
  }
  finish();
}
```

Calling `actionDown()` while already held must not register another timing attempt until `actionUp()` occurs.

- [ ] **Step 9: Write the failing listening mechanic tests**

Append:

```js
test('listening task records only while held in a quiet interval', () => {
  const engine = createFieldTaskEngine(FIELD_TASKS['voice-spot']);
  const initial = engine.getSnapshot().progress;
  engine.tick(200);
  assert.equal(engine.getSnapshot().progress, initial);
  engine.actionDown();
  for (let index = 0; index < 120 && engine.getSnapshot().status !== 'complete'; index += 1) {
    if (!engine.getSnapshot().quiet) engine.actionUp();
    else engine.actionDown();
    engine.tick(50);
  }
  assert.equal(engine.getSnapshot().status, 'complete');
});

test('invalid and oversized deltas cannot jump a task to completion', () => {
  const engine = createFieldTaskEngine(FIELD_TASKS['voice-spot']);
  engine.actionDown();
  engine.tick(Number.NaN);
  engine.tick(60_000);
  assert.ok(engine.getSnapshot().progress < 0.1);
});
```

- [ ] **Step 10: Run RED, then implement listening accumulation**

In `tick`:

```js
if (config.kind === 'listening') {
  const nextNoise = noise();
  const quiet = nextNoise <= config.quietThreshold;
  if (actionActive && wasQuiet && !quiet) mistakes += 1;
  wasQuiet = quiet;
  if (actionActive) {
    progress = clamp01(progress + (quiet
      ? boundedDelta / config.recordMs
      : -boundedDelta / 7000));
  }
}
finish();
```

- [ ] **Step 11: Return complete immutable snapshots**

`getSnapshot()` must create a new deeply independent object:

```js
const currentTarget = target();
const currentNoise = noise();
return {
  id: config.id,
  kind: config.kind,
  status,
  progress,
  elapsedMs,
  mistakes,
  stars,
  aim: { ...aim },
  target: currentTarget,
  route: {
    index: routeIndex,
    count: config.nodePositions?.length || 0,
    marker: config.kind === 'timing' ? marker() : 0,
    nodes: [...(config.nodePositions || [])]
  },
  noise: currentNoise,
  quiet: currentNoise <= (config.quietThreshold ?? 1),
  actionActive
};
```

- [ ] **Step 12: Run the complete engine tests and commit**

Run:

```powershell
& 'D:\node\node.exe' --test tests/unit/field-task-engine.unit.test.mjs
```

Expected: all field-task engine tests pass.

Commit:

```powershell
git add game/data/field-tasks.mjs game/core/field-task-engine.mjs tests/unit/field-task-engine.unit.test.mjs
git commit -m "feat: add deterministic field task engine"
```

---

### Task 2: Full-Screen Field Task View

**Files:**
- Modify: `game/index.html`
- Modify: `game/styles.css`
- Create: `game/ui/field-task-view.mjs`
- Create: `tests/unit/field-task-view.unit.test.cjs`
- Modify: `tests/unit/game-shell-contract.unit.test.cjs`
- Modify: `game/ui/game-shell.mjs`

**Interfaces:**
- Consumes `FIELD_TASKS` and `createFieldTaskEngine`.
- Produces `createFieldTaskView(root, { onSubmit, onCancel })`.
- View methods are `show(config)`, `hide()`, `isOpen()`, `getSnapshot()`, and `destroy()`.
- `onSubmit(result)` receives `{ id, stars, durationMs, mistakes }` exactly once after the completed result is confirmed.

- [ ] **Step 1: Add failing static HUD and shell exclusivity contracts**

Add assertions that `game/index.html` contains exactly one `#field-task-layer` with:

```html
<section id="field-task-layer" class="game-layer field-task-layer" aria-label="实地任务" hidden>
  <header class="field-task-heading">
    <p data-field-teammate></p>
    <h2 data-field-title></h2>
    <button type="button" data-field-cancel aria-label="退出实地任务">×</button>
  </header>
  <div class="field-task-stage" data-field-stage>
    <div class="focus-stage" data-focus-stage>
      <span data-focus-target></span>
      <span data-focus-aim></span>
    </div>
    <div class="timing-stage" data-timing-stage>
      <span data-route-marker></span>
      <ol data-route-nodes></ol>
    </div>
    <div class="listening-stage" data-listening-stage>
      <span data-sound-wave></span>
    </div>
    <button type="button" data-field-action aria-label="执行当前任务">●</button>
  </div>
  <footer class="field-task-footer">
    <progress data-field-progress max="1" value="0"></progress>
    <p data-field-status aria-live="polite"></p>
  </footer>
  <div class="field-task-result" data-field-result hidden>
    <p data-field-stars></p>
    <button type="button" data-field-submit aria-label="继续剧情">›</button>
  </div>
</section>
```

Extend the shell harness to call `shell.setFieldTaskActive(true)` and assert:

```js
assert.equal(root.dataset.fieldTaskActive, 'true');
assert.equal(root.dataset.gameplayActive, 'false');
assert.equal(runtimeControls.hidden, true);
assert.equal(root.querySelector('#desktop-controls').hidden, true);
```

- [ ] **Step 2: Run the focused contracts and verify RED**

Run:

```powershell
& 'D:\node\node.exe' --test tests/unit/game-shell-contract.unit.test.cjs tests/unit/field-task-view.unit.test.cjs
```

Expected: FAIL because the task layer, view module, and shell API are absent.

- [ ] **Step 3: Add the static layer and task-aware shell state**

Add the exact semantic structure above to `game/index.html` before touch controls.

In `game-shell.mjs`, update `syncGameplayActive()`:

```js
const taskOpen = root.dataset.fieldTaskActive === 'true';
const gameplayControlsVisible = activeBaseView === 'hud'
  && views.settings?.hidden
  && !taskOpen;
root.dataset.gameplayActive = String(gameplayControlsVisible);
```

When gameplay controls are hidden, set both `#desktop-controls` and `#touch-controls` to hidden through their existing eligibility mechanisms. Add:

```js
setFieldTaskActive(active) {
  root.dataset.fieldTaskActive = String(Boolean(active));
  syncGameplayActive();
},
```

Reset `data-field-task-active` to `false` in `destroy()`.

- [ ] **Step 4: Write the failing task-view lifecycle tests**

Use Playwright in `field-task-view.unit.test.cjs` to import the module in the served game page and assert:

```js
await page.evaluate(async () => {
  const { FIELD_TASKS } = await import('/game/data/field-tasks.mjs');
  const { createFieldTaskView } = await import('/game/ui/field-task-view.mjs');
  window.__submits = [];
  window.__cancels = 0;
  window.__fieldView = createFieldTaskView(document.querySelector('#game-root'), {
    onSubmit: (value) => window.__submits.push(value),
    onCancel: () => { window.__cancels += 1; }
  });
  window.__fieldView.show(FIELD_TASKS['camera-spot']);
});
await expect(page.locator('#field-task-layer')).toBeVisible();
await expect(page.locator('#field-task-layer')).toHaveAttribute('data-kind', 'focus');
await expect(page.locator('[data-focus-stage]')).toBeVisible();
await expect(page.locator('[data-timing-stage]')).toBeHidden();
```

Also cover Escape cancellation, double submit suppression, `visibilitychange`, `blur`, and `destroy()`.

- [ ] **Step 5: Implement view lifecycle and semantic rendering**

`createFieldTaskView` must:

1. Query every required `data-field-*` element and throw if the layer is incomplete.
2. Create a fresh engine on `show(config)`.
3. Store one animation frame id and tick with a clamped frame delta.
4. Write only changed CSS variables and data attributes.
5. Render mechanic-specific stages with `hidden`.
6. On completion, hide the stage action button, show result stars, and set status text to `配合默契`, `稳稳完成`, or `完成记录` for three, two, or one star.
7. Call `onSubmit` once only after the submit button is clicked.
8. Call `onCancel` once for Escape or the cancel button.
9. Release pointer capture and clear held keys on hide, blur, visibility loss, and destroy.

Use these diagnostics for Playwright without exposing them to assistive output:

```js
layer.dataset.taskId = snapshot.id;
layer.dataset.kind = snapshot.kind;
layer.dataset.progress = snapshot.progress.toFixed(4);
layer.dataset.status = snapshot.status;
layer.dataset.quiet = String(snapshot.quiet);
layer.dataset.routeIndex = String(snapshot.route.index);
```

- [ ] **Step 6: Implement pointer, keyboard, and hold semantics**

- Focus stage pointer movement maps its bounding rectangle to normalized aim coordinates.
- Focus keyboard movement changes aim by `0.018` per animation frame while a movement key is held.
- Timing `pointerdown` or keyboard `keydown` calls `actionDown`; matching release calls `actionUp`.
- Listening uses the same down/up pair but keeps the action held.
- Ignore repeated keyboard `keydown` events for timing.
- The task view owns task keys while open and calls `preventDefault`; it never modifies world movement directly.

- [ ] **Step 7: Add the cinematic responsive CSS**

Implement:

- Full-viewport `field-task-layer` with restrained dark top/bottom bands and the live canvas visible behind it.
- A fixed `aspect-ratio: 16 / 7` stage on desktop, `16 / 6` on short landscape, and `4 / 5` on portrait.
- Focus target and aim as circular outlines with no text labels.
- Timing track, three fixed nodes, and a moving marker.
- Listening wave driven by `--noise` and color changes from quiet to noisy.
- A fixed-size circular action button and icon-only cancel/continue buttons with tooltips via `title`.
- Result stars using text `★` with `aria-label`, without adding a nested card.
- No dominant purple, beige, brown, or dark-blue one-note palette.
- No overlaps at 1440x900, 844x390, or 390x844.

- [ ] **Step 8: Run task view and shell tests, inspect one local screenshot, and commit**

Run:

```powershell
& 'D:\node\node.exe' --test tests/unit/field-task-view.unit.test.cjs tests/unit/game-shell-contract.unit.test.cjs
```

Capture one focus-task screenshot at 1440x900 and inspect it for a nonblank canvas, bounded stage, and control separation.

Commit:

```powershell
git add game/index.html game/styles.css game/ui/field-task-view.mjs game/ui/game-shell.mjs tests/unit
git commit -m "feat: add cinematic field task hud"
```

---

### Task 3: Save Migration and Session Task Gate

**Files:**
- Modify: `game/core/save-store.mjs`
- Modify: `game/core/session-controller.mjs`
- Modify: `tests/unit/save-store.unit.test.mjs`
- Modify: `tests/unit/session-controller.unit.test.mjs`

**Interfaces:**
- Session state gains `fieldTasks`, an object keyed by the three reed hotspot ids.
- Produces session methods `completeFieldTask(result)` and `cancelFieldTask()`.
- UI dependency gains `showFieldTask(config)`, `hideFieldTask()`, and enhanced `showChapterComplete({ summary, stats, fieldTasks, totalStars })`.
- Task result shape is `{ id, stars, durationMs, mistakes }`.

- [ ] **Step 1: Write failing save migration tests**

Add:

```js
test('loads a legacy session without fieldTasks and supplies compatibility scores', () => {
  const legacy = validProgress();
  legacy.sessionState.visitedHotspots = ['camera-spot'];
  storage.setItem('test:progress', JSON.stringify(legacy));
  const restored = store.loadProgress();
  assert.deepEqual(restored.sessionState.fieldTasks, {
    'camera-spot': { stars: 1, durationMs: 0, mistakes: 0 }
  });
});

test('rejects malformed field task results', () => {
  const invalid = validProgress();
  invalid.sessionState.fieldTasks = {
    'camera-spot': { stars: 4, durationMs: -1, mistakes: Number.NaN }
  };
  storage.setItem('test:progress', JSON.stringify(invalid));
  assert.equal(store.loadProgress(), null);
});
```

- [ ] **Step 2: Run save tests and verify RED**

Run:

```powershell
& 'D:\node\node.exe' --test tests/unit/save-store.unit.test.mjs
```

Expected: FAIL because `fieldTasks` is not migrated or validated.

- [ ] **Step 3: Implement strict result normalization with legacy compatibility**

Add:

```js
const FIELD_TASK_IDS = new Set(['camera-spot', 'notes-spot', 'voice-spot']);

function isValidFieldTaskResult(value) {
  return isRecord(value)
    && [1, 2, 3].includes(value.stars)
    && isFiniteNumber(value.durationMs)
    && value.durationMs >= 0
    && Number.isInteger(value.mistakes)
    && value.mistakes >= 0;
}
```

Treat missing `fieldTasks` as valid legacy data. After validation, clone the session and:

```js
const fieldTasks = isRecord(session.fieldTasks)
  ? structuredClone(session.fieldTasks)
  : {};
for (const hotspotId of session.visitedHotspots) {
  if (FIELD_TASK_IDS.has(hotspotId) && !fieldTasks[hotspotId]) {
    fieldTasks[hotspotId] = { stars: 1, durationMs: 0, mistakes: 0 };
  }
}
return { ...stored, sessionState: { ...session, fieldTasks } };
```

Reject unknown keys and malformed values when `fieldTasks` is present.

- [ ] **Step 4: Write failing session gate tests**

Extend the harness UI with spies for `showFieldTask`, `hideFieldTask`, and summary data. Add:

```js
test('briefing outcome starts a field task without completing its hotspot', () => {
  const harness = createHarness();
  harness.session.startNew();
  harness.session.setScene('reeds-wetland');
  assert.equal(harness.session.activateHotspot({
    id: 'camera-spot',
    scriptId: 'reeds-camera'
  }), true);
  harness.advanceToOutcome('start-camera-field-task');
  assert.equal(harness.ui.lastFieldTask.id, 'camera-spot');
  assert.deepEqual(harness.world.completedHotspots, []);
});

test('a valid task result starts its result script and completes only after that script', () => {
  const harness = createHarnessAtTask('camera-spot');
  assert.equal(harness.session.completeFieldTask({
    id: 'camera-spot', stars: 3, durationMs: 8100, mistakes: 0
  }), true);
  assert.equal(harness.storyEngine.getState().activeScriptId, 'reeds-camera-result');
  assert.deepEqual(harness.world.completedHotspots, []);
  harness.advanceCurrentScript();
  assert.deepEqual(harness.world.completedHotspots, ['camera-spot']);
});

test('cancelling a task returns to hud and allows the same hotspot again', () => {
  const harness = createHarnessAtTask('notes-spot');
  assert.equal(harness.session.cancelFieldTask(), true);
  assert.equal(harness.ui.fieldTaskHidden, true);
  assert.equal(harness.session.activateHotspot({
    id: 'notes-spot', scriptId: 'reeds-notes'
  }), true);
});
```

- [ ] **Step 5: Run session tests and verify RED**

Run:

```powershell
& 'D:\node\node.exe' --test tests/unit/session-controller.unit.test.mjs
```

Expected: FAIL because the task outcomes and session methods are absent.

- [ ] **Step 6: Add task maps and session transitions**

At module scope:

```js
import { FIELD_TASKS } from '../data/field-tasks.mjs';

const FIELD_TASK_OUTCOMES = {
  'start-camera-field-task': 'camera-spot',
  'start-notes-field-task': 'notes-spot',
  'start-voice-field-task': 'voice-spot'
};
const FIELD_RESULT_SCRIPTS = {
  'camera-spot': 'reeds-camera-result',
  'notes-spot': 'reeds-notes-result',
  'voice-spot': 'reeds-voice-result'
};
```

Initialize `fieldTasks: {}`. When continuing, ensure the cloned state has a fieldTasks object. In `handleOutcome`, start a field task before hotspot completion:

```js
const fieldTaskId = FIELD_TASK_OUTCOMES[outcome];
if (fieldTaskId) {
  state.activeHotspotId = fieldTaskId;
  ui.hideDialogue?.();
  ui.showFieldTask?.(FIELD_TASKS[fieldTaskId]);
  save();
  return;
}
```

Implement exact-once methods:

```js
completeFieldTask(result) {
  const id = state.activeHotspotId;
  if (!id || result?.id !== id || state.fieldTasks[id]) return false;
  if (![1, 2, 3].includes(result.stars)) return false;
  if (!Number.isFinite(result.durationMs) || result.durationMs < 0) return false;
  if (!Number.isInteger(result.mistakes) || result.mistakes < 0) return false;
  state.fieldTasks[id] = {
    stars: result.stars,
    durationMs: result.durationMs,
    mistakes: result.mistakes
  };
  ui.hideFieldTask?.();
  startScript(FIELD_RESULT_SCRIPTS[id]);
  save();
  return true;
},
cancelFieldTask() {
  if (!state.activeHotspotId || state.fieldTasks[state.activeHotspotId]) return false;
  state.activeHotspotId = null;
  ui.hideFieldTask?.();
  ui.showHud?.(state.sceneId);
  save();
  return true;
}
```

- [ ] **Step 7: Add scored chapter summary**

In `showSummary()`:

```js
const taskEntries = [...REED_HOTSPOTS].map((id) => ({
  id,
  stars: state.fieldTasks[id]?.stars || 1
}));
ui.showChapterComplete({
  summary: selectSummary(storyState.stats),
  stats: [...STAT_LABELS],
  fieldTasks: taskEntries,
  totalStars: taskEntries.reduce((sum, task) => sum + task.stars, 0)
});
```

Add tests for total star values 3 and 9.

- [ ] **Step 8: Run save and session tests, then commit**

Run:

```powershell
& 'D:\node\node.exe' --test tests/unit/save-store.unit.test.mjs tests/unit/session-controller.unit.test.mjs
```

Expected: all save and session tests pass.

Commit:

```powershell
git add game/core/save-store.mjs game/core/session-controller.mjs tests/unit/save-store.unit.test.mjs tests/unit/session-controller.unit.test.mjs
git commit -m "feat: gate reed hotspots behind field tasks"
```

---

### Task 4: Briefing and Result Narrative Integration

**Files:**
- Modify: `game/data/reeds.mjs`
- Modify: `game/data/scripts.mjs`
- Modify: `game/main.mjs`
- Modify: `game/ui/game-shell.mjs`
- Modify: `game/index.html`
- Modify: `tests/unit/story-data.unit.test.mjs`
- Modify: `tests/unit/game-shell-contract.unit.test.cjs`

**Interfaces:**
- Briefing scripts end in `start-*-field-task`.
- Result scripts end in the existing `reeds-*-complete` outcomes.
- Main UI adapter supplies `showFieldTask`, `hideFieldTask`, and scored chapter-complete rendering.

- [ ] **Step 1: Write failing story graph tests**

Require:

```js
assert.equal(reeds['reeds-camera'].nodes['reeds-camera-end'].outcome, 'start-camera-field-task');
assert.equal(reeds['reeds-notes'].nodes['reeds-notes-end'].outcome, 'start-notes-field-task');
assert.equal(reeds['reeds-voice'].nodes['reeds-voice-end'].outcome, 'start-voice-field-task');
for (const [id, outcome] of [
  ['reeds-camera-result', 'reeds-camera-complete'],
  ['reeds-notes-result', 'reeds-notes-complete'],
  ['reeds-voice-result', 'reeds-voice-complete']
]) {
  assert.equal(reeds[id].nodes[`${id}-end`].outcome, outcome);
}
```

Also require every result script to contain one line from the responsible teammate and one line from another teammate.

- [ ] **Step 2: Run story tests and verify RED**

Run:

```powershell
& 'D:\node\node.exe' --test tests/unit/story-data.unit.test.mjs
```

Expected: FAIL because result scripts are absent and briefing outcomes still complete hotspots.

- [ ] **Step 3: Split the three script graphs**

Change only the three existing end outcomes. Add:

- `reeds-camera-result`: 陈屿 confirms the usable wide shot; 顾言 notes that the water route remains visible.
- `reeds-notes-result`: 顾言 confirms the route order; 林夏 notes that the team pace stayed together.
- `reeds-voice-result`: 林夏 confirms a clean natural pause; 陈屿 says the camera stayed down until the sentence ended.

Keep result lines concise and free of task-control instructions. Register all result scripts through the existing spread in `scripts.mjs`.

- [ ] **Step 4: Write failing main integration checks**

Extend the static contract to require imports and construction:

```js
assert.match(mainSource, /createFieldTaskView/);
assert.match(mainSource, /showFieldTask/);
assert.match(mainSource, /completeFieldTask/);
assert.match(mainSource, /cancelFieldTask/);
```

Add a chapter-complete DOM contract for `[data-complete-tasks]` and `[data-complete-total]`.

- [ ] **Step 5: Connect the view, shell, and session**

In `main.mjs`:

```js
import { createFieldTaskView } from './ui/field-task-view.mjs';

let fieldTask = null;
fieldTask = createFieldTaskView(root, {
  onSubmit(result) {
    session?.completeFieldTask(result);
  },
  onCancel() {
    session?.cancelFieldTask();
  }
});
```

UI adapter behavior:

```js
showFieldTask(config) {
  clearMovementInput();
  shell.setFieldTaskActive(true);
  fieldTask.show(config);
},
hideFieldTask() {
  fieldTask.hide();
  shell.setFieldTaskActive(false);
},
```

`gameplayIsActive()` must require `root.dataset.fieldTaskActive !== 'true'`. Destroy the view on `pagehide`.

- [ ] **Step 6: Render task scores in chapter completion**

Add to `#chapter-complete`:

```html
<ul data-complete-tasks></ul>
<p data-complete-total></p>
```

Use names from `FIELD_TASKS` in `showChapterComplete`:

```js
const items = fieldTasks.map(({ id, stars }) => {
  const item = ownerDocument.createElement('li');
  item.textContent = `${FIELD_TASKS[id].title} ${'★'.repeat(stars)}`;
  item.setAttribute('aria-label', `${FIELD_TASKS[id].title} ${stars}星`);
  return item;
});
taskList.replaceChildren(...items);
total.textContent = `协作评价 ${totalStars} / 9`;
```

- [ ] **Step 7: Run story and shell contracts, then commit**

Run:

```powershell
& 'D:\node\node.exe' --test tests/unit/story-data.unit.test.mjs tests/unit/game-shell-contract.unit.test.cjs
```

Expected: all focused tests pass.

Commit:

```powershell
git add game/data game/main.mjs game/ui/game-shell.mjs game/index.html tests/unit
git commit -m "feat: connect field tasks to the story"
```

---

### Task 5: Desktop and Touch End-to-End Gameplay

**Files:**
- Modify: `tests/e2e/helpers/game-state.mjs`
- Modify: `tests/e2e/prototype-flow.spec.mjs`
- Modify: `tests/e2e/game-canvas.spec.mjs`
- Modify: `tests/e2e/visual-regression.spec.mjs`

**Interfaces:**
- Produces `completeVisibleFieldTask(page)` and `completeFieldTaskByKind(page, kind)` helpers.
- Reuses existing `reachHotspot`, status parsing, canvas evidence, and dialogue advance helpers.

- [ ] **Step 1: Add user-level field task helper functions**

Implement:

```js
export async function completeVisibleFieldTask(page) {
  const layer = page.locator('#field-task-layer');
  await expect(layer).toBeVisible();
  const kind = await layer.getAttribute('data-kind');
  if (kind === 'focus') await completeFocusTask(page);
  else if (kind === 'timing') await completeTimingTask(page);
  else if (kind === 'listening') await completeListeningTask(page);
  else throw new Error(`Unknown visible field task: ${kind}`);
  await expect(layer).toHaveAttribute('data-status', 'complete');
  await page.locator('[data-field-submit]').click();
  await expect(layer).toBeHidden();
}
```

The helpers must use visible controls:

- Focus: repeatedly read target and stage bounding boxes and move the pointer or dispatch touch pointer moves to the target center until complete.
- Timing: poll marker and current node positions, then click the action button when their normalized difference is below `0.04`; release before the next attempt.
- Listening: poll `data-quiet`, hold the action button only while true, and release while false until complete.

- [ ] **Step 2: Update the vertical-slice test and verify RED**

After each hotspot briefing, require the task layer, complete it, then advance the new result lines. Preserve the final convergence and restored-save assertions.

Run:

```powershell
& 'D:\node\npx.cmd' playwright test tests/e2e/prototype-flow.spec.mjs --workers=1
```

Expected: FAIL until the full task integration is present.

- [ ] **Step 3: Add task freeze and lifecycle tests**

For each mechanic:

1. Open the field task.
2. Save player position and camera yaw.
3. Hold world movement keys and drag the canvas.
4. Advance the task for at least 500 ms.
5. Assert position and yaw are unchanged.
6. Trigger window blur and assert held task action clears.
7. Cancel and assert the same hotspot can be activated again.

Add a reload test after the briefing end:

```js
await expect(page.locator('#field-task-layer')).toBeVisible();
await page.reload();
await page.getByRole('button', { name: '继续旅程' }).click();
await expect(page.locator('#field-task-layer')).toBeVisible();
await expect(page.locator('#field-task-layer')).toHaveAttribute('data-task-id', hotspotId);
```

- [ ] **Step 4: Add save and score assertions**

After each completed task, inspect the stored progress and assert:

```js
expect(progress.sessionState.fieldTasks[hotspotId]).toEqual({
  stars: expect.any(Number),
  durationMs: expect.any(Number),
  mistakes: expect.any(Number)
});
expect(progress.sessionState.fieldTasks[hotspotId].stars).toBeGreaterThanOrEqual(1);
expect(progress.sessionState.fieldTasks[hotspotId].stars).toBeLessThanOrEqual(3);
```

At chapter completion require three task rows and total score text matching `/协作评价 [3-9] \/ 9/`.

- [ ] **Step 5: Add responsive visual captures**

Capture:

- Focus task at 1440x900.
- Timing task at 844x390.
- Listening task at 390x844.
- Completed task result at 1440x900.
- Chapter summary with three scores at 390x844.

For every capture assert:

- Canvas pixel evidence remains nonblank.
- `document.documentElement.scrollWidth <= innerWidth`.
- Task heading, stage, progress, action, cancel, and result controls are within viewport.
- Runtime controls, desktop direction controls, touch controls, interaction prompt, and dialogue are hidden while the task is active.
- No visible or accessible text matches `/证据匹配|档案修复|修复档案|材料拼接/`.

- [ ] **Step 6: Run focused desktop and mobile tests**

Run:

```powershell
& 'D:\node\npx.cmd' playwright test tests/e2e/prototype-flow.spec.mjs tests/e2e/game-canvas.spec.mjs tests/e2e/visual-regression.spec.mjs --workers=1
```

Expected: all desktop and mobile projects pass; conditional viewport tests may skip only on the non-target project.

- [ ] **Step 7: Inspect screenshots and commit**

Open all five new screenshots and verify:

- The task operation is visually dominant without covering the 3D scene completely.
- Controls do not overlap at any required viewport.
- Chinese titles and score text fit.
- The stage does not resize while values change.
- Result stars remain readable but do not resemble a marketing card.

Commit:

```powershell
git add tests/e2e
git commit -m "test: verify field tasks across input modes"
```

---

### Task 6: Documentation, Full Verification, and Publication

**Files:**
- Modify: `README.md`
- Modify: `tests/unit/release-contract.unit.test.cjs`

**Interfaces:**
- Produces a release whose documentation and static contracts match the field-task controls and saved evaluation.

- [ ] **Step 1: Add failing release documentation contracts**

Require README copy for:

- Three field tasks.
- Pointer, keyboard, and touch task controls.
- One-to-three-star local evaluation.
- No leaderboard or network submission.

Require the published HTML and JavaScript to include `field-task-layer`, `field-task-engine.mjs`, and `field-task-view.mjs`, while still forbidding teacher and repair-theme markers.

- [ ] **Step 2: Run release tests and verify RED**

Run:

```powershell
& 'D:\node\node.exe' --test tests/unit/release-contract.unit.test.cjs
```

Expected: FAIL until README and release expectations are updated.

- [ ] **Step 3: Update README and release contracts**

Document the gameplay loop in plain Chinese. Keep local preview and test commands unchanged. State that scores are stored only in the browser save and are not teacher grades.

- [ ] **Step 4: Run formatting and complete unit verification**

Run:

```powershell
git diff --check
& 'D:\node\npm.cmd' run test:unit
```

Expected: no whitespace errors; all unit tests pass with zero failures.

- [ ] **Step 5: Run the complete browser suite**

Run:

```powershell
& 'D:\node\npm.cmd' run test:e2e -- --workers=1
```

Expected: all applicable desktop and mobile tests pass with zero failures, page errors, failed local requests, blank canvases, horizontal overflow, or incoherent overlaps.

- [ ] **Step 6: Request final code review and resolve important findings**

Use `superpowers:requesting-code-review`. Review:

- Engine completion and exact-once semantics.
- Save migration and old-save compatibility.
- Task input cleanup on every lifecycle boundary.
- Session restore at briefing end.
- DOM visibility and focus behavior.
- Static GitHub Pages paths.

Apply important fixes with focused regression tests, then rerun the affected suite.

- [ ] **Step 7: Commit the release state**

```powershell
git add README.md tests/unit/release-contract.unit.test.cjs
git commit -m "docs: describe collaborative field tasks"
```

- [ ] **Step 8: Verify branch state and publish**

Use `superpowers:verification-before-completion`, then `superpowers:finishing-a-development-branch`. Merge the verified feature branch into `main`, then:

```powershell
git push origin main
```

Wait for GitHub Pages deployment and verify its workflow conclusion is `success` for the merged commit.

- [ ] **Step 9: Smoke-test the production site**

Open:

```text
https://xing666173.github.io/yanhuo-dujiang-archive-game/
https://xing666173.github.io/yanhuo-dujiang-archive-game/game/
```

On the deployed game:

1. Start a new journey.
2. Reach each of the three Baiyangdian teammates.
3. Complete focus, timing, and listening tasks with real browser input.
4. Confirm each result dialogue and saved star result.
5. Complete convergence and inspect the chapter score summary.
6. Reload and continue the completed save.
7. Confirm zero runtime errors and zero failed same-origin requests.
