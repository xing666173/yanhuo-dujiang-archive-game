import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionController } from '../../game/core/session-controller.mjs';
import { createInitialStoryState, createStoryEngine } from '../../game/core/story-engine.mjs';
import { scripts } from '../../game/data/scripts.mjs';

function createHarness({ storyState = createInitialStoryState(), savedProgress = null } = {}) {
  const loadedScenes = [];
  const rendered = [];
  const summaries = [];
  const saves = [];
  const echoes = [];
  const restored = [];
  const storyEngine = createStoryEngine({ scripts, state: storyState });
  const saveStore = {
    clearProgress() {},
    loadProgress: () => savedProgress,
    saveProgress(currentStoryState, sessionState) {
      saves.push(structuredClone({ storyState: currentStoryState, sessionState }));
    }
  };
  const world = {
    loadScene: (sceneId) => loadedScenes.push(sceneId),
    setEchoActive: (active) => echoes.push(active),
    captureInteractionState: () => ({ movement: { x: 0.4, y: -0.2 }, quality: 'high' }),
    restoreInteractionState: (snapshot) => restored.push(snapshot)
  };
  const ui = {
    renderNode: (node) => rendered.push(node),
    hideDialogue() {},
    showChapterComplete: (summary) => summaries.push(summary),
    setEchoActive: (active) => echoes.push(`ui:${active}`)
  };
  const controller = createSessionController({ storyEngine, saveStore, world, ui });
  return { controller, storyEngine, loadedScenes, rendered, summaries, saves, echoes, restored };
}

function installFakeClock() {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const tasks = new Map();
  let now = 0;
  let nextId = 0;

  globalThis.setTimeout = (callback, delay = 0) => {
    const id = ++nextId;
    tasks.set(id, { at: now + Number(delay), callback });
    return id;
  };
  globalThis.clearTimeout = (id) => tasks.delete(id);

  return {
    tick(milliseconds) {
      const target = now + milliseconds;
      while (true) {
        const pending = [...tasks.entries()]
          .filter(([, task]) => task.at <= target)
          .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
        if (!pending) break;
        const [id, task] = pending;
        tasks.delete(id);
        now = task.at;
        task.callback();
      }
      now = target;
    },
    pendingCount: () => tasks.size,
    restore() {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  };
}

function createEchoHarness({ savedProgress } = {}) {
  const effect = {
    id: 'reeds-echo',
    type: 'effect',
    effect: 'historical-echo',
    durationMs: 4500,
    speaker: 'echo',
    text: '回响',
    next: 'after-echo'
  };
  const after = { id: 'after-echo', type: 'line', speaker: 'gu-yan', text: '返回', next: 'end' };
  let currentNode = { id: 'echo-choice', type: 'choice' };
  let advanceCount = 0;
  const restores = [];
  const echoes = [];
  const storyEngine = {
    start(scriptId) {
      currentNode = { id: `${scriptId}-entry`, type: 'line', text: scriptId, next: 'end' };
      return currentNode;
    },
    choose() {
      currentNode = effect;
      return currentNode;
    },
    advance() {
      advanceCount += 1;
      currentNode = after;
      return currentNode;
    },
    getNode: () => currentNode,
    getState: () => ({ version: 1, readNodes: [] })
  };
  const progress = savedProgress || {
    storyState: { version: 1 },
    sessionState: {
      version: 1,
      sceneId: 'reeds-wetland',
      visitedHotspots: ['camera-spot', 'notes-spot', 'voice-spot'],
      completedScenes: ['activity-room'],
      activeHotspotId: null,
      prototypeComplete: false
    }
  };
  const controller = createSessionController({
    storyEngine,
    saveStore: {
      clearProgress() {},
      loadProgress: () => progress,
      saveProgress() {}
    },
    world: {
      loadScene() {},
      setMovement() {},
      setEchoActive: (active) => echoes.push(active),
      captureInteractionState: () => ({ movement: { x: 0.25, y: -0.5 }, quality: 'high' }),
      restoreInteractionState: (snapshot) => restores.push(snapshot)
    },
    ui: {
      renderNode() {},
      hideDialogue() {},
      showChapterComplete() {},
      setEchoActive: (active) => echoes.push(`ui:${active}`)
    }
  });
  return {
    controller,
    effect,
    echoes,
    restores,
    getAdvanceCount: () => advanceCount
  };
}

test('unlocks convergence only after three unique reed hotspots', () => {
  const started = [];
  const controller = createSessionController({
    storyEngine: { start: (id) => started.push(id), getState: () => ({ version: 1 }) },
    saveStore: { saveProgress: () => {} },
    world: { loadScene: () => {}, setEchoActive: () => {} },
    ui: { renderNode: () => {}, showChapterComplete: () => {} }
  });

  controller.setScene('reeds-wetland');
  controller.completeHotspot('camera-spot');
  controller.completeHotspot('notes-spot');
  assert.equal(started.includes('reeds-convergence'), false);
  controller.completeHotspot('voice-spot');
  assert.equal(started.at(-1), 'reeds-convergence');
  controller.completeHotspot('voice-spot');
  assert.equal(started.filter((id) => id === 'reeds-convergence').length, 1);
});

test('starts a new journey in the activity room and transitions to the reeds after the prologue', () => {
  const harness = createHarness();

  harness.controller.startNew();
  assert.equal(harness.loadedScenes[0], 'activity-room');
  assert.equal(harness.rendered[0].id, 'prologue-lin-xia-opening');

  harness.controller.advanceDialogue();
  harness.controller.advanceDialogue();
  harness.controller.advanceDialogue();
  harness.controller.choose('hear-gu-yan');
  harness.controller.advanceDialogue();

  assert.equal(harness.loadedScenes.at(-1), 'reeds-wetland');
  assert.equal(harness.saves.at(-1).sessionState.sceneId, 'reeds-wetland');
  assert.deepEqual(harness.saves.at(-1).sessionState.completedScenes, ['activity-room']);
});

test('starts each reed hotspot script only before that hotspot is completed', () => {
  const harness = createHarness();
  const hotspot = { id: 'camera-spot', scriptId: 'reeds-camera' };

  harness.controller.setScene('reeds-wetland');
  assert.equal(harness.controller.activateHotspot(hotspot), true);
  assert.equal(harness.rendered.at(-1).id, 'reeds-camera-observe');
  harness.controller.advanceDialogue();
  harness.controller.advanceDialogue();
  assert.equal(harness.controller.activateHotspot(hotspot), false);
  assert.deepEqual(harness.saves.at(-1).sessionState.visitedHotspots, ['camera-spot']);
});

test('checkpoints the convergence choice atomically with the final hotspot and restores it', () => {
  const harness = createHarness();
  harness.controller.setScene('reeds-wetland');
  harness.controller.completeHotspot('camera-spot');
  harness.controller.completeHotspot('notes-spot');
  harness.controller.completeHotspot('voice-spot');

  const checkpoint = harness.saves.at(-1);
  assert.equal(checkpoint.storyState.activeScriptId, 'reeds-convergence');
  assert.equal(checkpoint.storyState.activeNodeId, 'reeds-recording-priority');
  assert.deepEqual(checkpoint.sessionState.visitedHotspots, ['camera-spot', 'notes-spot', 'voice-spot']);

  const restored = createHarness({
    storyState: checkpoint.storyState,
    savedProgress: checkpoint
  });
  assert.equal(restored.controller.continueSaved(), true);
  assert.equal(restored.rendered.at(-1).id, 'reeds-recording-priority');
});

test('teacher scene entry defers all progress writes until a story choice', () => {
  const harness = createHarness();

  harness.controller.openTeacherChapter('activity-room');
  harness.controller.advanceDialogue();
  harness.controller.advanceDialogue();
  harness.controller.advanceDialogue();
  assert.equal(harness.saves.length, 0);

  harness.controller.choose('hear-lin-xia');
  assert.equal(harness.saves.length, 1);
  assert.equal(harness.saves[0].storyState.choices['prologue-focus'], 'hear-lin-xia');
});

test('restores a completed save directly to the chapter summary', () => {
  const completedStoryState = {
    ...createInitialStoryState(),
    stats: { truth: 2, empathy: 0, expression: 0 }
  };
  const savedProgress = {
    storyState: completedStoryState,
    sessionState: {
      version: 1,
      sceneId: 'reeds-wetland',
      visitedHotspots: ['camera-spot', 'notes-spot', 'voice-spot'],
      completedScenes: ['activity-room', 'reeds-wetland'],
      activeHotspotId: null,
      prototypeComplete: true
    }
  };
  const harness = createHarness({ storyState: completedStoryState, savedProgress });

  assert.equal(harness.controller.continueSaved(), true);
  assert.equal(harness.loadedScenes.at(-1), 'reeds-wetland');
  assert.deepEqual(harness.summaries.at(-1), {
    summary: '你们先把事实的地基站稳。',
    stats: ['事实核验', '倾听共情', '表达呈现']
  });
});

test('historical echo advances at 4500ms and not at 4499ms', (t) => {
  const clock = installFakeClock();
  t.after(() => clock.restore());
  const harness = createEchoHarness();

  assert.equal(scripts['reeds-convergence'].nodes['reeds-echo'].durationMs, 4500);
  harness.controller.choose('keep-pause');
  clock.tick(4499);
  assert.equal(harness.getAdvanceCount(), 0);
  assert.equal(harness.restores.length, 0);
  assert.equal(clock.pendingCount(), 1);
  clock.tick(1);
  assert.equal(harness.getAdvanceCount(), 1);
  assert.deepEqual(harness.restores, [{
    movement: { x: 0.25, y: -0.5 },
    quality: 'high'
  }]);
  assert.equal(harness.echoes.at(-2), false);
  assert.equal(harness.echoes.at(-1), 'ui:false');
});

for (const [name, interrupt] of [
  ['new journey', (controller) => controller.startNew()],
  ['teacher entry', (controller) => controller.openTeacherChapter('activity-room')],
  ['scene replacement', (controller) => controller.setScene('activity-room')],
  ['destroy', (controller) => controller.dispose()]
]) {
  test(`${name} cancels echo, restores interaction once, and blocks stale advance`, (t) => {
    const clock = installFakeClock();
    t.after(() => clock.restore());
    const harness = createEchoHarness();

    harness.controller.choose('keep-pause');
    clock.tick(1200);
    interrupt(harness.controller);
    assert.equal(harness.restores.length, 1);
    assert.equal(harness.echoes.at(-2), false);
    assert.equal(harness.echoes.at(-1), 'ui:false');
    clock.tick(5000);
    assert.equal(harness.getAdvanceCount(), 0);
    assert.equal(harness.restores.length, 1);
  });
}

test('continue during echo replaces the timer and only the restored echo may advance', (t) => {
  const clock = installFakeClock();
  t.after(() => clock.restore());
  const harness = createEchoHarness();

  harness.controller.choose('keep-pause');
  clock.tick(1000);
  harness.controller.continueSaved();
  assert.equal(harness.restores.length, 1);
  assert.equal(clock.pendingCount(), 1);
  clock.tick(3499);
  assert.equal(harness.getAdvanceCount(), 0);
  clock.tick(1001);
  assert.equal(harness.getAdvanceCount(), 1);
  assert.equal(harness.restores.length, 2);
});

test('uses the tied summary when no single story stat is highest', () => {
  const tiedStoryState = {
    ...createInitialStoryState(),
    stats: { truth: 1, empathy: 1, expression: 0 }
  };
  const savedProgress = {
    storyState: tiedStoryState,
    sessionState: {
      version: 1,
      sceneId: 'reeds-wetland',
      visitedHotspots: [],
      completedScenes: [],
      activeHotspotId: null,
      prototypeComplete: true
    }
  };
  const harness = createHarness({ storyState: tiedStoryState, savedProgress });

  harness.controller.continueSaved();
  assert.equal(harness.summaries.at(-1).summary, '你们开始学会让三种方法彼此校准。');
});
