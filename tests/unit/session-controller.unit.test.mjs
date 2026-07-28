import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionController } from '../../game/core/session-controller.mjs';
import { createInitialStoryState, createStoryEngine } from '../../game/core/story-engine.mjs';
import { scripts } from '../../game/data/scripts.mjs';

function createFieldTaskScripts() {
  const fieldTaskScripts = structuredClone(scripts);
  const outcomes = {
    'reeds-camera': 'start-camera-field-task',
    'reeds-notes': 'start-notes-field-task',
    'reeds-voice': 'start-voice-field-task'
  };

  for (const [scriptId, outcome] of Object.entries(outcomes)) {
    fieldTaskScripts[scriptId].nodes[`${scriptId}-end`].outcome = outcome;
    const resultScriptId = `${scriptId}-result`;
    fieldTaskScripts[resultScriptId] = {
      id: resultScriptId,
      entry: `${resultScriptId}-line`,
      nodes: {
        [`${resultScriptId}-line`]: {
          id: `${resultScriptId}-line`,
          type: 'line',
          text: resultScriptId,
          next: `${resultScriptId}-end`
        },
        [`${resultScriptId}-end`]: {
          id: `${resultScriptId}-end`,
          type: 'end',
          outcome: `${scriptId}-complete`
        }
      }
    };
  }

  return fieldTaskScripts;
}

function createHarness({
  storyState = createInitialStoryState(),
  savedProgress = null,
  storyScripts = scripts
} = {}) {
  const loadedScenes = [];
  const rendered = [];
  const summaries = [];
  const saves = [];
  const echoes = [];
  const restored = [];
  const completedHotspotSets = [];
  const hudScenes = [];
  const storyEngine = createStoryEngine({ scripts: storyScripts, state: storyState });
  const saveStore = {
    clearProgress() {},
    loadProgress: () => savedProgress,
    saveProgress(currentStoryState, sessionState) {
      saves.push(structuredClone({ storyState: currentStoryState, sessionState }));
    }
  };
  const world = {
    loadScene: (sceneId) => loadedScenes.push(sceneId),
    completedHotspots: [],
    setCompletedHotspots(ids) {
      this.completedHotspots = [...ids];
      completedHotspotSets.push([...ids]);
    },
    setEchoActive: (active) => echoes.push(active),
    captureInteractionState: () => ({ movement: { x: 0.4, y: -0.2 }, quality: 'high' }),
    restoreInteractionState: (snapshot) => restored.push(snapshot)
  };
  const ui = {
    renderNode: (node) => rendered.push(node),
    hideDialogue() {},
    showChapterComplete: (summary) => summaries.push(summary),
    showFieldTask(config) {
      this.lastFieldTask = structuredClone(config);
      this.fieldTaskHidden = false;
    },
    hideFieldTask() {
      this.fieldTaskHidden = true;
    },
    showHud: (sceneId) => hudScenes.push(sceneId),
    setEchoActive: (active) => echoes.push(`ui:${active}`)
  };
  const controller = createSessionController({ storyEngine, saveStore, world, ui });
  return {
    controller,
    session: controller,
    storyEngine,
    world,
    ui,
    loadedScenes,
    rendered,
    summaries,
    saves,
    echoes,
    restored,
    completedHotspotSets,
    hudScenes,
    advanceCurrentScript() {
      while (storyEngine.getNode()?.type === 'line') controller.advanceDialogue();
    },
    advanceToOutcome(outcome) {
      this.advanceCurrentScript();
      assert.equal(storyEngine.getNode()?.outcome, outcome);
    }
  };
}

function createHarnessAtTask(hotspotId) {
  const harness = createHarness({ storyScripts: createFieldTaskScripts() });
  const scriptId = {
    'camera-spot': 'reeds-camera',
    'notes-spot': 'reeds-notes',
    'voice-spot': 'reeds-voice'
  }[hotspotId];
  harness.session.startNew();
  harness.session.setScene('reeds-wetland');
  assert.equal(harness.session.activateHotspot({ id: hotspotId, scriptId }), true);
  harness.advanceCurrentScript();
  return harness;
}

function completeHotspotThroughTask(harness, hotspotId, result = {
  stars: 2,
  durationMs: 7000,
  mistakes: 1
}) {
  const scriptId = {
    'camera-spot': 'reeds-camera',
    'notes-spot': 'reeds-notes',
    'voice-spot': 'reeds-voice'
  }[hotspotId];
  assert.equal(harness.session.activateHotspot({ id: hotspotId, scriptId }), true);
  harness.advanceCurrentScript();
  assert.equal(harness.session.completeFieldTask({ id: hotspotId, ...result }), true);
  harness.advanceCurrentScript();
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
    now: () => now,
    restore() {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  };
}

function createEchoHarness({ savedProgress, now } = {}) {
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
    },
    now
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
  const harness = createHarness({ storyScripts: createFieldTaskScripts() });
  const clearedScripts = [];
  const clearScriptCheckpoint = harness.storyEngine.clearScriptCheckpoint.bind(
    harness.storyEngine
  );
  harness.storyEngine.clearScriptCheckpoint = (scriptId) => {
    clearedScripts.push(scriptId);
    return clearScriptCheckpoint(scriptId);
  };
  harness.session.startNew();
  harness.session.setScene('reeds-wetland');

  completeHotspotThroughTask(harness, 'camera-spot');
  completeHotspotThroughTask(harness, 'notes-spot');
  assert.notEqual(harness.storyEngine.getState().activeScriptId, 'reeds-convergence');
  completeHotspotThroughTask(harness, 'voice-spot');

  assert.equal(harness.storyEngine.getState().activeScriptId, 'reeds-convergence');
  assert.deepEqual(clearedScripts, ['reeds-convergence']);
  assert.equal('completeHotspot' in harness.controller, false);
  assert.equal(harness.session.activateHotspot({
    id: 'voice-spot',
    scriptId: 'reeds-voice'
  }), false);
});

test('starts a new journey in the activity room and transitions to the reeds after the prologue', () => {
  const harness = createHarness();

  harness.controller.startNew();
  assert.equal(harness.loadedScenes[0], 'activity-room');
  assert.equal(harness.rendered[0].id, 'prologue-lin-xia-opening');
  assert.equal(harness.saves[0].storyState.activeScriptId, 'prologue');
  assert.equal(harness.saves[0].storyState.activeNodeId, 'prologue-lin-xia-opening');
  assert.equal(harness.saves[0].sessionState.sceneId, 'activity-room');

  harness.controller.advanceDialogue();
  harness.controller.advanceDialogue();
  harness.controller.advanceDialogue();
  harness.controller.choose('hear-gu-yan');
  harness.controller.advanceDialogue();

  assert.equal(harness.loadedScenes.at(-1), 'reeds-wetland');
  assert.equal(harness.saves.at(-1).sessionState.sceneId, 'reeds-wetland');
  assert.deepEqual(harness.saves.at(-1).sessionState.completedScenes, ['activity-room']);
});

test('session controller exposes no teacher-only entry point', () => {
  const harness = createHarness();
  assert.equal('openTeacherChapter' in harness.controller, false);
});

test('keeps each reed hotspot active until its field task result completes it', () => {
  const harness = createHarness();
  const hotspot = { id: 'camera-spot', scriptId: 'reeds-camera' };

  harness.controller.setScene('reeds-wetland');
  assert.equal(harness.controller.activateHotspot(hotspot), true);
  assert.equal(harness.rendered.at(-1).id, 'reeds-camera-observe');
  harness.controller.advanceDialogue();
  harness.controller.advanceDialogue();
  assert.equal(harness.controller.activateHotspot(hotspot), false);
  assert.equal(harness.ui.lastFieldTask.id, 'camera-spot');
  assert.deepEqual(harness.saves.at(-1).sessionState.visitedHotspots, []);
  assert.deepEqual(harness.completedHotspotSets.at(-1), []);
});

test('briefing outcome starts a field task without completing its hotspot', () => {
  const harness = createHarness({ storyScripts: createFieldTaskScripts() });
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
  assert.equal(harness.session.completeFieldTask({
    id: 'camera-spot', stars: 3, durationMs: 8100, mistakes: 0
  }), false);
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
    id: 'notes-spot',
    scriptId: 'reeds-notes'
  }), true);
});

test('rejects unknown hotspots and briefing scripts that do not match their teammate', () => {
  const harness = createHarness();
  harness.session.startNew();
  harness.session.setScene('reeds-wetland');

  assert.equal(harness.session.activateHotspot({
    id: 'unknown-spot',
    scriptId: 'reeds-camera'
  }), false);
  assert.equal(harness.session.activateHotspot({
    id: 'camera-spot',
    scriptId: 'reeds-voice'
  }), false);
  assert.equal(harness.session.activateHotspot({
    id: 'camera-spot',
    scriptId: 'reeds-camera'
  }), true);
});

test('a cancelled task stays dismissed after continue and its hotspot can be reactivated', () => {
  const initial = createHarnessAtTask('notes-spot');
  assert.equal(initial.session.cancelFieldTask(), true);
  const checkpoint = initial.saves.at(-1);
  const restored = createHarness({
    storyScripts: createFieldTaskScripts(),
    storyState: checkpoint.storyState,
    savedProgress: checkpoint
  });

  assert.equal(restored.session.continueSaved(), true);
  assert.equal(restored.ui.lastFieldTask, undefined);
  assert.equal(restored.session.activateHotspot({
    id: 'notes-spot',
    scriptId: 'reeds-notes'
  }), true);
});

test('continuing an orphan result at a briefing drops the score and allows completion', () => {
  const initial = createHarnessAtTask('camera-spot');
  const checkpoint = structuredClone(initial.saves.at(-1));
  checkpoint.sessionState.fieldTasks['camera-spot'] = {
    stars: 3,
    durationMs: 4000,
    mistakes: 0
  };
  const restored = createHarness({
    storyScripts: createFieldTaskScripts(),
    storyState: checkpoint.storyState,
    savedProgress: checkpoint
  });

  assert.equal(restored.session.continueSaved(), true);
  assert.equal(restored.ui.lastFieldTask.id, 'camera-spot');
  assert.equal(restored.session.completeFieldTask({
    id: 'camera-spot',
    stars: 2,
    durationMs: 7000,
    mistakes: 1
  }), true);
});

test('continuing direct storage stubs normalizes non-record field task containers', () => {
  for (const fieldTasks of [[], new Date(0)]) {
    const storyState = createInitialStoryState();
    const savedProgress = {
      storyState,
      sessionState: {
        version: 1,
        sceneId: 'reeds-wetland',
        visitedHotspots: [],
        completedScenes: ['activity-room'],
        activeHotspotId: null,
        fieldTasks,
        prototypeComplete: false
      }
    };
    const harness = createHarness({
      storyScripts: createFieldTaskScripts(),
      storyState,
      savedProgress
    });

    assert.equal(harness.session.continueSaved(), true);
    assert.equal(harness.session.activateHotspot({
      id: 'camera-spot',
      scriptId: 'reeds-camera'
    }), true);
    harness.advanceCurrentScript();
    assert.equal(harness.session.completeFieldTask({
      id: 'camera-spot',
      stars: 2,
      durationMs: 7000,
      mistakes: 1
    }), true);
    assert.deepEqual(harness.saves.at(-1).sessionState.fieldTasks, {
      'camera-spot': { stars: 2, durationMs: 7000, mistakes: 1 }
    });
  }
});

test('continuing an active field task restores its task interface', () => {
  const initial = createHarnessAtTask('voice-spot');
  const checkpoint = initial.saves.at(-1);
  const restored = createHarness({
    storyScripts: createFieldTaskScripts(),
    storyState: checkpoint.storyState,
    savedProgress: checkpoint
  });

  assert.equal(restored.session.continueSaved(), true);
  assert.equal(restored.ui.lastFieldTask.id, 'voice-spot');
  assert.equal(restored.session.completeFieldTask({
    id: 'voice-spot', stars: 2, durationMs: 7000, mistakes: 1
  }), true);
});

test('continuing a matching result dialogue preserves its score and does not reopen the task', () => {
  const initial = createHarnessAtTask('voice-spot');
  assert.equal(initial.session.completeFieldTask({
    id: 'voice-spot',
    stars: 2,
    durationMs: 7000,
    mistakes: 1
  }), true);
  const checkpoint = initial.saves.at(-1);
  const restored = createHarness({
    storyScripts: createFieldTaskScripts(),
    storyState: checkpoint.storyState,
    savedProgress: checkpoint
  });

  assert.equal(restored.session.continueSaved(), true);
  assert.equal(restored.ui.lastFieldTask, undefined);
  assert.equal(restored.storyEngine.getState().activeScriptId, 'reeds-voice-result');
  restored.advanceCurrentScript();
  assert.deepEqual(restored.world.completedHotspots, ['voice-spot']);
});

test('checkpoints the convergence choice atomically with the final hotspot and restores it', () => {
  const harness = createHarness({ storyScripts: createFieldTaskScripts() });
  harness.session.startNew();
  harness.session.setScene('reeds-wetland');
  completeHotspotThroughTask(harness, 'camera-spot');
  completeHotspotThroughTask(harness, 'notes-spot');
  completeHotspotThroughTask(harness, 'voice-spot');

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

test('a stale completed briefing checkpoint fails closed to playable hud', () => {
  const storyState = {
    ...createInitialStoryState(),
    activeScriptId: 'reeds-camera',
    activeNodeId: 'reeds-camera-reminder',
    readNodes: ['reeds-camera-reminder']
  };
  const savedProgress = {
    storyState,
    sessionState: {
      version: 1,
      sceneId: 'reeds-wetland',
      visitedHotspots: ['camera-spot'],
      completedScenes: ['activity-room'],
      activeHotspotId: null,
      fieldTasks: {
        'camera-spot': { stars: 2, durationMs: 7000, mistakes: 1 }
      },
      prototypeComplete: false
    }
  };
  const harness = createHarness({
    storyScripts: scripts,
    storyState,
    savedProgress
  });

  assert.equal(harness.session.continueSaved(), true);
  assert.equal(harness.session.advanceDialogue(), false);
  assert.equal(harness.rendered.length, 0);
  assert.equal(harness.session.activateHotspot({
    id: 'notes-spot',
    scriptId: 'reeds-notes'
  }), true);
});

test('a result checkpoint without a score fails closed and cannot bypass its task', () => {
  const storyState = {
    ...createInitialStoryState(),
    activeScriptId: 'reeds-camera-result',
    activeNodeId: 'reeds-camera-result-chen-yu',
    readNodes: ['reeds-camera-result-chen-yu']
  };
  const savedProgress = {
    storyState,
    sessionState: {
      version: 1,
      sceneId: 'reeds-wetland',
      visitedHotspots: [],
      completedScenes: ['activity-room'],
      activeHotspotId: 'camera-spot',
      fieldTasks: {},
      prototypeComplete: false
    }
  };
  const harness = createHarness({
    storyScripts: scripts,
    storyState,
    savedProgress
  });

  assert.equal(harness.session.continueSaved(), true);
  assert.equal(harness.session.advanceDialogue(), false);
  assert.equal(harness.rendered.length, 0);
  assert.deepEqual(harness.world.completedHotspots, []);
  assert.equal(harness.session.activateHotspot({
    id: 'camera-spot',
    scriptId: 'reeds-camera'
  }), true);
});

test('incomplete convergence checkpoints fail closed to a persistent playable idle', () => {
  const score = { stars: 2, durationMs: 7000, mistakes: 1 };
  const storyState = {
    ...createInitialStoryState(),
    activeScriptId: 'reeds-convergence',
    activeNodeId: 'reeds-recording-priority',
    readNodes: ['reeds-recording-priority']
  };
  const savedProgress = {
    storyState,
    sessionState: {
      version: 1,
      sceneId: 'reeds-wetland',
      visitedHotspots: ['camera-spot', 'notes-spot'],
      completedScenes: ['activity-room'],
      activeHotspotId: null,
      fieldTasks: {
        'camera-spot': score,
        'notes-spot': score
      },
      prototypeComplete: false
    }
  };
  const harness = createHarness({ storyState, savedProgress });

  assert.equal(harness.session.continueSaved(), true);
  assert.equal(harness.rendered.length, 0);
  assert.equal(harness.summaries.length, 0);
  assert.equal(harness.storyEngine.getState().activeScriptId, null);
  assert.equal(harness.storyEngine.getState().activeNodeId, null);
  assert.equal(harness.saves.at(-1).storyState.activeScriptId, null);
  assert.equal(harness.saves.at(-1).storyState.activeNodeId, null);
  assert.equal(harness.hudScenes.at(-1), 'reeds-wetland');
  assert.equal(harness.session.activateHotspot({
    id: 'voice-spot',
    scriptId: 'reeds-voice'
  }), true);
});

test('incomplete prototype completion fails closed and reopens unfinished hotspots', () => {
  const storyState = {
    ...createInitialStoryState(),
    activeScriptId: 'reeds-convergence',
    activeNodeId: 'reeds-end',
    readNodes: ['reeds-end'],
    completedScripts: ['reeds-convergence']
  };
  const savedProgress = {
    storyState,
    sessionState: {
      version: 1,
      sceneId: 'reeds-wetland',
      visitedHotspots: ['camera-spot'],
      completedScenes: ['activity-room', 'reeds-wetland'],
      activeHotspotId: null,
      fieldTasks: {
        'camera-spot': { stars: 2, durationMs: 7000, mistakes: 1 }
      },
      prototypeComplete: true
    }
  };
  const harness = createHarness({ storyState, savedProgress });

  assert.equal(harness.session.continueSaved(), true);
  assert.equal(harness.summaries.length, 0);
  assert.equal(harness.rendered.length, 0);
  assert.equal(harness.saves.at(-1).sessionState.prototypeComplete, false);
  assert.deepEqual(harness.saves.at(-1).sessionState.completedScenes, ['activity-room']);
  assert.equal(harness.saves.at(-1).storyState.activeScriptId, null);
  assert.equal(harness.saves.at(-1).storyState.activeNodeId, null);
  assert.equal(harness.session.activateHotspot({
    id: 'notes-spot',
    scriptId: 'reeds-notes'
  }), true);
});

test('a present but partial terminal score map reopens its unscored hotspot', () => {
  const score = { stars: 2, durationMs: 7000, mistakes: 1 };
  const storyState = {
    ...createInitialStoryState(),
    activeScriptId: 'reeds-convergence',
    activeNodeId: 'reeds-end',
    readNodes: ['reeds-end'],
    completedScripts: ['reeds-convergence']
  };
  const savedProgress = {
    storyState,
    sessionState: {
      version: 1,
      sceneId: 'reeds-wetland',
      visitedHotspots: ['camera-spot', 'notes-spot', 'voice-spot'],
      completedScenes: ['activity-room', 'reeds-wetland'],
      activeHotspotId: null,
      fieldTasks: {
        'camera-spot': score,
        'notes-spot': score
      },
      prototypeComplete: true
    }
  };
  const harness = createHarness({ storyState, savedProgress });

  assert.equal(harness.session.continueSaved(), true);
  assert.equal(harness.summaries.length, 0);
  assert.deepEqual(
    harness.saves.at(-1).sessionState.visitedHotspots,
    ['camera-spot', 'notes-spot']
  );
  assert.equal(harness.session.activateHotspot({
    id: 'voice-spot',
    scriptId: 'reeds-voice'
  }), true);
});

test('a terminal checkpoint with an active hotspot restarts a selectable convergence', () => {
  const score = { stars: 2, durationMs: 7000, mistakes: 1 };
  const storyState = {
    ...createInitialStoryState(),
    activeScriptId: 'reeds-convergence',
    activeNodeId: 'reeds-recording-priority',
    readNodes: ['reeds-recording-priority']
  };
  const savedProgress = {
    storyState,
    sessionState: {
      version: 1,
      sceneId: 'reeds-wetland',
      visitedHotspots: ['camera-spot', 'notes-spot', 'voice-spot'],
      completedScenes: ['activity-room'],
      activeHotspotId: 'voice-spot',
      fieldTasks: {
        'camera-spot': score,
        'notes-spot': score,
        'voice-spot': score
      },
      prototypeComplete: false
    }
  };
  const harness = createHarness({ storyState, savedProgress });

  assert.equal(harness.session.continueSaved(), true);
  assert.equal(harness.rendered.at(-1).id, 'reeds-recording-priority');
  assert.equal(harness.storyEngine.getState().activeScriptId, 'reeds-convergence');
  assert.equal(harness.storyEngine.getState().activeNodeId, 'reeds-recording-priority');
  assert.equal(harness.saves.at(-1).sessionState.activeHotspotId, null);
  assert.equal(harness.session.choose('verify-context'), true);
});

test('an idle checkpoint with an unscored visited hotspot reopens that hotspot', () => {
  const storyState = createInitialStoryState();
  const savedProgress = {
    storyState,
    sessionState: {
      version: 1,
      sceneId: 'reeds-wetland',
      visitedHotspots: ['camera-spot'],
      completedScenes: ['activity-room'],
      activeHotspotId: null,
      fieldTasks: {},
      prototypeComplete: false
    }
  };
  const harness = createHarness({ storyState, savedProgress });

  assert.equal(harness.session.continueSaved(), true);
  assert.deepEqual(harness.saves.at(-1).sessionState.visitedHotspots, []);
  assert.equal(harness.session.activateHotspot({
    id: 'camera-spot',
    scriptId: 'reeds-camera'
  }), true);
});

test('fail-closed completion can replay convergence after a stale convergence choice', () => {
  const storyState = {
    ...createInitialStoryState(),
    activeScriptId: 'reeds-convergence',
    activeNodeId: 'reeds-end',
    stats: { truth: 1, empathy: 0, expression: 0 },
    readNodes: ['reeds-recording-priority', 'reeds-end'],
    choices: { 'reeds-recording-priority': 'verify-context' },
    completedScripts: ['reeds-convergence']
  };
  const savedProgress = {
    storyState,
    sessionState: {
      version: 1,
      sceneId: 'reeds-wetland',
      visitedHotspots: ['camera-spot'],
      completedScenes: ['activity-room', 'reeds-wetland'],
      activeHotspotId: null,
      fieldTasks: {
        'camera-spot': { stars: 2, durationMs: 7000, mistakes: 1 }
      },
      prototypeComplete: true
    }
  };
  const harness = createHarness({
    storyScripts: createFieldTaskScripts(),
    storyState,
    savedProgress
  });

  assert.equal(harness.session.continueSaved(), true);
  assert.equal(
    Object.hasOwn(harness.storyEngine.getState().choices, 'reeds-recording-priority'),
    false
  );
  assert.deepEqual(
    harness.storyEngine.getState().stats,
    { truth: 0, empathy: 0, expression: 0 }
  );
  assert.equal(harness.storyEngine.getState().cooperation, 0);
  completeHotspotThroughTask(harness, 'notes-spot');
  completeHotspotThroughTask(harness, 'voice-spot');
  assert.equal(harness.storyEngine.getState().activeScriptId, 'reeds-convergence');
  assert.equal(harness.session.choose('verify-context'), true);
  assert.deepEqual(
    harness.storyEngine.getState().stats,
    { truth: 1, empathy: 0, expression: 0 }
  );
  assert.equal(harness.storyEngine.getState().cooperation, 0);
  harness.session.dispose();
});

test('all-complete active-null idle clears a stale convergence choice before replay', () => {
  const score = { stars: 2, durationMs: 7000, mistakes: 1 };
  const storyState = {
    ...createInitialStoryState(),
    stats: { truth: 1, empathy: 0, expression: 0 },
    readNodes: ['reeds-recording-priority', 'reeds-echo'],
    choices: { 'reeds-recording-priority': 'verify-context' },
    completedScripts: ['reeds-convergence']
  };
  const savedProgress = {
    storyState,
    sessionState: {
      version: 1,
      sceneId: 'reeds-wetland',
      visitedHotspots: ['camera-spot', 'notes-spot', 'voice-spot'],
      completedScenes: ['activity-room'],
      activeHotspotId: null,
      fieldTasks: {
        'camera-spot': score,
        'notes-spot': score,
        'voice-spot': score
      },
      prototypeComplete: false
    }
  };
  const harness = createHarness({ storyState, savedProgress });

  assert.equal(harness.session.continueSaved(), true);
  assert.equal(harness.storyEngine.getState().activeScriptId, 'reeds-convergence');
  assert.equal(harness.storyEngine.getState().activeNodeId, 'reeds-recording-priority');
  assert.deepEqual(harness.storyEngine.getState().choices, {});
  assert.deepEqual(harness.storyEngine.getState().completedScripts, []);
  assert.deepEqual(
    harness.storyEngine.getState().stats,
    { truth: 0, empathy: 0, expression: 0 }
  );
  assert.equal(harness.session.choose('verify-context'), true);
  assert.deepEqual(
    harness.storyEngine.getState().stats,
    { truth: 1, empathy: 0, expression: 0 }
  );
});

test('a different active script clears stale convergence before the final task', () => {
  const score = { stars: 2, durationMs: 7000, mistakes: 1 };
  const storyState = {
    ...createInitialStoryState(),
    activeScriptId: 'prologue',
    activeNodeId: 'prologue-lin-xia-opening',
    stats: { truth: 1, empathy: 0, expression: 0 },
    readNodes: [
      'prologue-lin-xia-opening',
      'reeds-recording-priority',
      'reeds-echo'
    ],
    choices: { 'reeds-recording-priority': 'verify-context' },
    completedScripts: ['reeds-convergence']
  };
  const savedProgress = {
    storyState,
    sessionState: {
      version: 1,
      sceneId: 'reeds-wetland',
      visitedHotspots: ['camera-spot', 'notes-spot'],
      completedScenes: ['activity-room'],
      activeHotspotId: null,
      fieldTasks: {
        'camera-spot': score,
        'notes-spot': score
      },
      prototypeComplete: false
    }
  };
  const harness = createHarness({
    storyScripts: createFieldTaskScripts(),
    storyState,
    savedProgress
  });

  assert.equal(harness.session.continueSaved(), true);
  assert.deepEqual(harness.storyEngine.getState().choices, {});
  assert.deepEqual(harness.storyEngine.getState().completedScripts, []);
  assert.deepEqual(
    harness.storyEngine.getState().stats,
    { truth: 0, empathy: 0, expression: 0 }
  );

  completeHotspotThroughTask(harness, 'voice-spot');
  assert.equal(harness.storyEngine.getState().activeScriptId, 'reeds-convergence');
  assert.equal(harness.storyEngine.getState().activeNodeId, 'reeds-recording-priority');
  assert.equal(harness.session.choose('verify-context'), true);
  assert.deepEqual(
    harness.storyEngine.getState().stats,
    { truth: 1, empathy: 0, expression: 0 }
  );
});

test('prototype completion at convergence choice, echo, or return restarts the choice', () => {
  const score = { stars: 2, durationMs: 7000, mistakes: 1 };
  for (const activeNodeId of ['reeds-recording-priority', 'reeds-echo', 'reeds-return']) {
    const choiceApplied = activeNodeId !== 'reeds-recording-priority';
    const storyState = {
      ...createInitialStoryState(),
      activeScriptId: 'reeds-convergence',
      activeNodeId,
      stats: { truth: choiceApplied ? 1 : 0, empathy: 0, expression: 0 },
      readNodes: choiceApplied
        ? ['reeds-recording-priority', 'reeds-echo', activeNodeId]
        : ['reeds-recording-priority'],
      choices: choiceApplied
        ? { 'reeds-recording-priority': 'verify-context' }
        : {},
      completedScripts: []
    };
    const savedProgress = {
      storyState,
      sessionState: {
        version: 1,
        sceneId: 'reeds-wetland',
        visitedHotspots: ['camera-spot', 'notes-spot', 'voice-spot'],
        completedScenes: ['activity-room', 'reeds-wetland'],
        activeHotspotId: null,
        fieldTasks: {
          'camera-spot': score,
          'notes-spot': score,
          'voice-spot': score
        },
        prototypeComplete: true
      }
    };
    const harness = createHarness({ storyState, savedProgress });

    assert.equal(harness.session.continueSaved(), true, activeNodeId);
    assert.equal(harness.summaries.length, 0, activeNodeId);
    assert.equal(
      harness.storyEngine.getState().activeNodeId,
      'reeds-recording-priority',
      activeNodeId
    );
    assert.deepEqual(harness.storyEngine.getState().choices, {}, activeNodeId);
    assert.deepEqual(
      harness.storyEngine.getState().stats,
      { truth: 0, empathy: 0, expression: 0 },
      activeNodeId
    );
    assert.equal(harness.session.choose('verify-context'), true, activeNodeId);
  }
});

test('a mismatched result outcome fails closed instead of completing another hotspot', () => {
  const storyScripts = createFieldTaskScripts();
  storyScripts['reeds-camera-result'].nodes['reeds-camera-result-end'].outcome = 'reeds-notes-complete';
  const harness = createHarness({ storyScripts });
  harness.session.startNew();
  harness.session.setScene('reeds-wetland');
  assert.equal(harness.session.activateHotspot({
    id: 'camera-spot',
    scriptId: 'reeds-camera'
  }), true);
  harness.advanceCurrentScript();
  assert.equal(harness.session.completeFieldTask({
    id: 'camera-spot',
    stars: 2,
    durationMs: 7000,
    mistakes: 1
  }), true);

  harness.advanceCurrentScript();

  assert.deepEqual(harness.world.completedHotspots, []);
  assert.equal(harness.saves.at(-1).sessionState.activeHotspotId, null);
  assert.deepEqual(harness.saves.at(-1).sessionState.fieldTasks, {});
  assert.equal(harness.session.activateHotspot({
    id: 'camera-spot',
    scriptId: 'reeds-camera'
  }), true);
});

test('all visited checkpoints outside convergence resume at the convergence choice', () => {
  const score = { stars: 2, durationMs: 7000, mistakes: 1 };
  const storyState = {
    ...createInitialStoryState(),
    activeScriptId: 'reeds-voice-result',
    activeNodeId: 'reeds-voice-result-end',
    readNodes: ['reeds-voice-result-end'],
    completedScripts: ['reeds-voice-result']
  };
  const savedProgress = {
    storyState,
    sessionState: {
      version: 1,
      sceneId: 'reeds-wetland',
      visitedHotspots: ['camera-spot', 'notes-spot', 'voice-spot'],
      completedScenes: ['activity-room'],
      activeHotspotId: null,
      fieldTasks: {
        'camera-spot': score,
        'notes-spot': score,
        'voice-spot': score
      },
      prototypeComplete: false
    }
  };
  const harness = createHarness({
    storyScripts: scripts,
    storyState,
    savedProgress
  });

  assert.equal(harness.session.continueSaved(), true);
  assert.equal(harness.storyEngine.getState().activeScriptId, 'reeds-convergence');
  assert.equal(harness.storyEngine.getState().activeNodeId, 'reeds-recording-priority');
  assert.equal(harness.rendered.at(-1).id, 'reeds-recording-priority');
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
  assert.equal(harness.storyEngine.getState().activeScriptId, 'reeds-convergence');
  assert.equal(harness.storyEngine.getState().activeNodeId, 'reeds-end');
  assert.deepEqual(harness.summaries.at(-1), {
    summary: '你们先把事实的地基站稳。',
    stats: ['事实核验', '倾听共情', '表达呈现'],
    fieldTasks: [
      { id: 'camera-spot', stars: 1 },
      { id: 'notes-spot', stars: 1 },
      { id: 'voice-spot', stars: 1 }
    ],
    totalStars: 3
  });
});

test('summarizes all field task scores as nine stars', () => {
  const completedStoryState = {
    ...createInitialStoryState(),
    activeScriptId: 'reeds-convergence',
    activeNodeId: 'reeds-end',
    readNodes: ['reeds-end'],
    completedScripts: ['reeds-convergence']
  };
  const savedProgress = {
    storyState: completedStoryState,
    sessionState: {
      version: 1,
      sceneId: 'reeds-wetland',
      visitedHotspots: ['camera-spot', 'notes-spot', 'voice-spot'],
      completedScenes: ['activity-room', 'reeds-wetland'],
      activeHotspotId: null,
      prototypeComplete: true,
      fieldTasks: {
        'camera-spot': { stars: 3, durationMs: 8100, mistakes: 0 },
        'notes-spot': { stars: 3, durationMs: 7200, mistakes: 1 },
        'voice-spot': { stars: 3, durationMs: 6500, mistakes: 0 }
      }
    }
  };
  const harness = createHarness({ storyState: completedStoryState, savedProgress });

  assert.equal(harness.session.continueSaved(), true);
  assert.deepEqual(harness.summaries.at(-1).fieldTasks, [
    { id: 'camera-spot', stars: 3 },
    { id: 'notes-spot', stars: 3 },
    { id: 'voice-spot', stars: 3 }
  ]);
  assert.equal(harness.summaries.at(-1).totalStars, 9);
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

test('pausing historical echo preserves its remaining duration until resume', (t) => {
  const clock = installFakeClock();
  t.after(() => clock.restore());
  const harness = createEchoHarness({ now: clock.now });

  harness.controller.choose('keep-pause');
  clock.tick(1000);
  harness.controller.pause();
  assert.equal(clock.pendingCount(), 0);

  clock.tick(5000);
  assert.equal(harness.getAdvanceCount(), 0);
  assert.equal(harness.restores.length, 0);

  harness.controller.resume();
  assert.equal(clock.pendingCount(), 1);
  clock.tick(3499);
  assert.equal(harness.getAdvanceCount(), 0);
  clock.tick(1);
  assert.equal(harness.getAdvanceCount(), 1);
  assert.equal(harness.restores.length, 1);
});

for (const [name, interrupt] of [
  ['new journey', (controller) => controller.startNew()],
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
      visitedHotspots: ['camera-spot', 'notes-spot', 'voice-spot'],
      completedScenes: [],
      activeHotspotId: null,
      prototypeComplete: true
    }
  };
  const harness = createHarness({ storyState: tiedStoryState, savedProgress });

  harness.controller.continueSaved();
  assert.equal(harness.summaries.at(-1).summary, '你们开始学会让三种方法彼此校准。');
});
