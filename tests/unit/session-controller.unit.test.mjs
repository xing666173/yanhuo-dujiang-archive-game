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

test('historical echo restores the exact interaction snapshot after its duration', async () => {
  const current = {
    id: 'echo-choice',
    type: 'choice',
    options: [{ id: 'keep-pause', next: 'echo-effect', effects: {} }]
  };
  const effect = {
    id: 'echo-effect',
    type: 'effect',
    effect: 'historical-echo',
    durationMs: 20,
    speaker: 'echo',
    text: '回响',
    next: 'after-echo'
  };
  const after = { id: 'after-echo', type: 'line', speaker: 'gu-yan', text: '返回', next: 'end' };
  const saves = [];
  const echoes = [];
  const restored = [];
  const snapshot = { movement: { x: -1, y: 0.5 }, quality: 'low' };
  const storyEngine = {
    choose() {
      current.id = effect.id;
      current.type = effect.type;
      return effect;
    },
    advance: () => after,
    getState: () => ({ version: 1 })
  };
  const controller = createSessionController({
    storyEngine,
    saveStore: { saveProgress: (...args) => saves.push(args) },
    world: {
      loadScene() {},
      setEchoActive: (active) => echoes.push(active),
      captureInteractionState: () => snapshot,
      restoreInteractionState: (value) => restored.push(value)
    },
    ui: { renderNode() {}, setEchoActive() {}, showChapterComplete() {} }
  });

  controller.choose('keep-pause');
  assert.equal(echoes.at(-1), true);
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(echoes.at(-1), false);
  assert.deepEqual(restored, [snapshot]);
  assert.equal(saves.length, 2);
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
