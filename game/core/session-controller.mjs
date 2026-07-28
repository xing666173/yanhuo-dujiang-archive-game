import { FIELD_TASKS } from '../data/field-tasks.mjs';
import { createInitialStoryState } from './story-engine.mjs';
import {
  FIELD_TASK_CONVERGENCE,
  FIELD_TASK_FLOWS,
  classifyFieldTaskCheckpoint,
  getFieldTaskResultScript,
  hasCompleteFieldTaskSet,
  hasTerminalFieldTaskActiveConflict,
  isMatchingFieldTaskBriefing,
  isValidFieldTaskResult,
  normalizeLegacyFieldTaskCompletion,
  normalizeFieldTaskSession
} from './field-task-session.mjs';

const REED_HOTSPOTS = new Set(Object.keys(FIELD_TASK_FLOWS));
const HOTSPOT_OUTCOMES = {
  'reeds-camera-complete': 'camera-spot',
  'reeds-notes-complete': 'notes-spot',
  'reeds-voice-complete': 'voice-spot'
};
const FIELD_TASK_OUTCOMES = {
  'start-camera-field-task': 'camera-spot',
  'start-notes-field-task': 'notes-spot',
  'start-voice-field-task': 'voice-spot'
};
const STAT_LABELS = ['事实核验', '倾听共情', '表达呈现'];
const SUMMARY_BY_STAT = {
  truth: '你们先把事实的地基站稳。',
  empathy: '你们选择先听见讲述的人。',
  expression: '你们让现场的声音和画面先抵达观众。'
};
const TIED_SUMMARY = '你们开始学会让三种方法彼此校准。';

function createInitialSessionState() {
  return {
    version: 1,
    sceneId: 'activity-room',
    visitedHotspots: [],
    completedScenes: [],
    activeHotspotId: null,
    fieldTasks: {},
    prototypeComplete: false
  };
}

function clone(value) {
  return structuredClone(value);
}

function selectSummary(stats = {}) {
  const entries = ['truth', 'empathy', 'expression'].map((key) => [key, Number(stats[key]) || 0]);
  const highest = Math.max(...entries.map(([, value]) => value));
  const leaders = entries.filter(([, value]) => value === highest);
  return leaders.length === 1 ? SUMMARY_BY_STAT[leaders[0][0]] : TIED_SUMMARY;
}

export function createSessionController({
  storyEngine,
  saveStore,
  world,
  ui,
  now = () => Date.now()
}) {
  let state = createInitialSessionState();
  let convergenceStarted = false;
  let echoTimer = null;
  let echoSnapshot = null;
  let echoActive = false;
  let echoEpoch = 0;
  let echoDeadline = null;
  let echoRemainingMs = 0;
  let narrativePaused = false;

  function save() {
    saveStore.saveProgress(storyEngine.getState(), clone(state));
  }

  function showSummary() {
    const storyState = storyEngine.getState();
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
  }

  function cancelEcho() {
    echoEpoch += 1;
    const hadEcho = echoActive || echoTimer !== null || echoSnapshot !== null;
    if (echoTimer !== null) clearTimeout(echoTimer);
    echoTimer = null;
    echoDeadline = null;
    echoRemainingMs = 0;
    const snapshot = echoSnapshot;
    echoSnapshot = null;
    echoActive = false;
    if (!hadEcho) return false;
    world.setEchoActive(false);
    ui.setEchoActive?.(false);
    if (snapshot !== null) world.restoreInteractionState?.(snapshot);
    return true;
  }

  function scheduleEcho(epoch, delay) {
    echoRemainingMs = Math.max(0, Number(delay) || 0);
    echoDeadline = now() + echoRemainingMs;
    echoTimer = setTimeout(() => finishEcho(epoch), echoRemainingMs);
  }

  function loadScene(sceneId, { saveProgress = true, completePrevious = false } = {}) {
    cancelEcho();
    const previousSceneId = state.sceneId;
    if (completePrevious && previousSceneId !== sceneId && !state.completedScenes.includes(previousSceneId)) {
      state.completedScenes.push(previousSceneId);
    }
    state.sceneId = sceneId;
    state.activeHotspotId = null;
    world.setCompletedHotspots?.(state.visitedHotspots);
    world.loadScene(sceneId);
    ui.showHud?.(sceneId);
    if (saveProgress) save();
  }

  function finishEcho(epoch) {
    if (epoch !== echoEpoch || !echoActive) return;
    echoTimer = null;
    if (narrativePaused) {
      echoRemainingMs = Math.max(0, (echoDeadline ?? now()) - now());
      echoDeadline = null;
      return;
    }
    echoActive = false;
    echoEpoch += 1;
    echoDeadline = null;
    echoRemainingMs = 0;
    world.setEchoActive(false);
    ui.setEchoActive?.(false);
    if (echoSnapshot !== null) world.restoreInteractionState?.(echoSnapshot);
    echoSnapshot = null;
    const readNodes = storyEngine.getState().readNodes || [];
    const nextNode = storyEngine.advance();
    save();
    presentNode(nextNode, { wasRead: readNodes.includes(nextNode?.id) });
  }

  function startEcho(node) {
    cancelEcho();
    echoSnapshot = world.captureInteractionState?.() ?? null;
    world.setMovement?.({ x: 0, y: 0 });
    world.setEchoActive(true);
    ui.setEchoActive?.(true);
    echoActive = true;
    const epoch = ++echoEpoch;
    scheduleEcho(epoch, node.durationMs);
  }

  function restartPlayablePrologue() {
    state = createInitialSessionState();
    convergenceStarted = false;
    storyEngine.restore(createInitialStoryState());
    ui.hideDialogue?.();
    ui.hideFieldTask?.();
    loadScene('activity-room', { saveProgress: false });
    startScript('prologue');
    save();
    return false;
  }

  function failClosedFieldFlow() {
    if (state.sceneId === 'activity-room') return restartPlayablePrologue();
    const activeHotspotId = state.activeHotspotId;
    if (activeHotspotId && !state.visitedHotspots.includes(activeHotspotId)) {
      delete state.fieldTasks[activeHotspotId];
    }
    state.activeHotspotId = null;
    state.visitedHotspots = state.visitedHotspots.filter((hotspotId) => (
      isValidFieldTaskResult(state.fieldTasks[hotspotId])
    ));
    for (const hotspotId of Object.keys(state.fieldTasks)) {
      if (!state.visitedHotspots.includes(hotspotId)) delete state.fieldTasks[hotspotId];
    }
    state.prototypeComplete = false;
    state.completedScenes = state.completedScenes.filter((sceneId) => sceneId !== 'reeds-wetland');
    storyEngine.clearScriptCheckpoint?.(FIELD_TASK_CONVERGENCE.scriptId);
    convergenceStarted = false;
    const currentStoryState = storyEngine.getState();
    let storyIsSafeToSave = currentStoryState.activeScriptId === null
      && currentStoryState.activeNodeId === null;
    if (typeof storyEngine.restore === 'function') {
      try {
        storyEngine.restore({
          ...currentStoryState,
          activeScriptId: null,
          activeNodeId: null
        });
        storyIsSafeToSave = true;
      } catch {
        storyIsSafeToSave = false;
      }
    }
    world.setCompletedHotspots?.(state.visitedHotspots);
    ui.hideDialogue?.();
    ui.hideFieldTask?.();
    ui.showHud?.(state.sceneId);
    if (storyIsSafeToSave) save();
    return false;
  }

  function restartConvergenceIfComplete() {
    if (!hasCompleteFieldTaskSet(state)) return false;
    storyEngine.clearScriptCheckpoint?.(FIELD_TASK_CONVERGENCE.scriptId);
    convergenceStarted = true;
    startScript(FIELD_TASK_CONVERGENCE.scriptId);
    save();
    return true;
  }

  function handleOutcome(outcome) {
    if (outcome === 'open-reeds-scene') {
      ui.hideDialogue?.();
      loadScene('reeds-wetland', {
        completePrevious: true,
        saveProgress: false
      });
      if (!restartConvergenceIfComplete()) save();
      return;
    }

    const fieldTaskId = FIELD_TASK_OUTCOMES[outcome];
    if (fieldTaskId) {
      const checkpoint = classifyFieldTaskCheckpoint(storyEngine.getState(), state);
      if (
        checkpoint.kind !== 'active-briefing'
        || checkpoint.hotspotId !== fieldTaskId
        || checkpoint.phase !== 'briefing-end'
      ) {
        failClosedFieldFlow();
        return;
      }
      ui.hideDialogue?.();
      ui.showFieldTask?.(FIELD_TASKS[fieldTaskId]);
      save();
      return;
    }

    const hotspotId = HOTSPOT_OUTCOMES[outcome];
    if (hotspotId) {
      completeHotspot(hotspotId);
      return;
    }

    if (outcome === 'prototype-complete') {
      const checkpoint = classifyFieldTaskCheckpoint(storyEngine.getState(), state);
      if (
        checkpoint.kind !== 'convergence'
        || checkpoint.phase !== 'convergence-end'
      ) return failClosedFieldFlow();
      state.prototypeComplete = true;
      state.activeHotspotId = null;
      if (!state.completedScenes.includes('reeds-wetland')) state.completedScenes.push('reeds-wetland');
      save();
      ui.hideDialogue?.();
      showSummary();
    }
  }

  function presentNode(node, metadata = {}) {
    if (!node) return;
    if (node.type === 'end') {
      handleOutcome(node.outcome);
      return;
    }
    ui.renderNode(node, metadata);
    if (node.type === 'effect' && node.effect === 'historical-echo') startEcho(node);
  }

  function startScript(scriptId) {
    const readNodes = storyEngine.getState().readNodes || [];
    const node = storyEngine.start(scriptId);
    presentNode(node, { wasRead: readNodes.includes(node?.id) });
  }

  function completeHotspot(hotspotId) {
    const checkpoint = classifyFieldTaskCheckpoint(storyEngine.getState(), state);
    if (
      !REED_HOTSPOTS.has(hotspotId)
      || checkpoint.kind !== 'active-result'
      || checkpoint.hotspotId !== hotspotId
      || checkpoint.phase !== 'result-end'
      || state.visitedHotspots.includes(hotspotId)
    ) return failClosedFieldFlow();
    state.visitedHotspots.push(hotspotId);
    state.activeHotspotId = null;
    world.setCompletedHotspots?.(state.visitedHotspots);
    ui.hideDialogue?.();
    ui.showHud?.(state.sceneId);

    const completedReedHotspots = state.visitedHotspots.filter((id) => REED_HOTSPOTS.has(id));
    if (!convergenceStarted && completedReedHotspots.length === REED_HOTSPOTS.size) {
      storyEngine.clearScriptCheckpoint?.(FIELD_TASK_CONVERGENCE.scriptId);
      convergenceStarted = true;
      startScript('reeds-convergence');
    }
    save();
    return true;
  }

  return {
    startNew() {
      narrativePaused = false;
      state = createInitialSessionState();
      convergenceStarted = false;
      saveStore.clearProgress?.();
      loadScene('activity-room', { saveProgress: false });
      startScript('prologue');
      save();
    },
    continueSaved() {
      narrativePaused = false;
      const saved = saveStore.loadProgress?.();
      if (!saved) return false;
      const terminalActiveConflict = hasTerminalFieldTaskActiveConflict(
        saved.storyState,
        saved.sessionState
      );
      const originalSessionState = clone(saved.sessionState);
      state = normalizeFieldTaskSession(saved.storyState, originalSessionState);
      const restoredStoryState = normalizeLegacyFieldTaskCompletion(
        saved.storyState,
        originalSessionState,
        state
      );
      let storyRestoreFailed = false;
      try {
        storyEngine.restore?.(restoredStoryState);
      } catch {
        storyRestoreFailed = true;
      }
      const activeHotspotId = state.activeHotspotId;
      loadScene(state.sceneId, { saveProgress: false });
      state.activeHotspotId = activeHotspotId;
      const checkpoint = classifyFieldTaskCheckpoint(storyEngine.getState(), state);
      const allFieldTasksComplete = hasCompleteFieldTaskSet(state);
      convergenceStarted = checkpoint.kind === 'convergence';
      if (
        terminalActiveConflict
        || storyRestoreFailed
        || ['invalid', 'stale-convergence'].includes(checkpoint.kind)
      ) {
        failClosedFieldFlow();
        restartConvergenceIfComplete();
      } else if (checkpoint.kind === 'prototype-complete') {
        showSummary();
      } else if (
        allFieldTasksComplete
        && checkpoint.kind !== 'convergence'
        && (
          ['idle', 'completed-result'].includes(checkpoint.kind)
          || typeof saved.storyState?.activeScriptId === 'string'
        )
      ) {
        restartConvergenceIfComplete();
      } else if (['cancelled-briefing', 'completed-result'].includes(checkpoint.kind)) {
        failClosedFieldFlow();
      } else if (checkpoint.kind !== 'idle') {
        presentNode(storyEngine.getNode?.(), { wasRead: true });
      }
      return true;
    },
    setScene(sceneId) {
      loadScene(sceneId, { completePrevious: state.sceneId !== sceneId });
    },
    activateHotspot(hotspot) {
      if (
        state.sceneId !== 'reeds-wetland'
        || !isMatchingFieldTaskBriefing(hotspot?.id, hotspot?.scriptId)
        || state.activeHotspotId
        || state.visitedHotspots.includes(hotspot.id)
      ) return false;
      state.activeHotspotId = hotspot.id;
      startScript(hotspot.scriptId);
      return true;
    },
    completeFieldTask(result) {
      const id = state.activeHotspotId;
      const resultScriptId = getFieldTaskResultScript(id);
      const checkpoint = classifyFieldTaskCheckpoint(storyEngine.getState(), state);
      if (
        !id
        || !resultScriptId
        || result?.id !== id
        || state.fieldTasks[id]
        || checkpoint.kind !== 'active-briefing'
        || checkpoint.hotspotId !== id
        || checkpoint.phase !== 'briefing-end'
      ) return false;
      if (![1, 2, 3].includes(result.stars)) return false;
      if (!Number.isFinite(result.durationMs) || result.durationMs < 0) return false;
      if (!Number.isInteger(result.mistakes) || result.mistakes < 0) return false;
      state.fieldTasks[id] = {
        stars: result.stars,
        durationMs: result.durationMs,
        mistakes: result.mistakes
      };
      ui.hideFieldTask?.();
      startScript(resultScriptId);
      save();
      return true;
    },
    cancelFieldTask() {
      const checkpoint = classifyFieldTaskCheckpoint(storyEngine.getState(), state);
      if (
        !state.activeHotspotId
        || state.fieldTasks[state.activeHotspotId]
        || checkpoint.kind !== 'active-briefing'
        || checkpoint.phase !== 'briefing-end'
      ) return false;
      state.activeHotspotId = null;
      ui.hideFieldTask?.();
      ui.showHud?.(state.sceneId);
      save();
      return true;
    },
    advanceDialogue() {
      const node = storyEngine.getNode?.();
      if (!node || node.type !== 'line') return false;
      if (classifyFieldTaskCheckpoint(storyEngine.getState(), state).kind === 'invalid') {
        return failClosedFieldFlow();
      }
      const readNodes = storyEngine.getState().readNodes || [];
      const nextNode = storyEngine.advance();
      save();
      presentNode(nextNode, { wasRead: readNodes.includes(nextNode?.id) });
      return true;
    },
    choose(optionId) {
      const node = storyEngine.getNode?.();
      if (node && node.type !== 'choice') return false;
      if (classifyFieldTaskCheckpoint(storyEngine.getState(), state).kind === 'invalid') {
        return failClosedFieldFlow();
      }
      const readNodes = storyEngine.getState().readNodes || [];
      const nextNode = storyEngine.choose(optionId);
      save();
      presentNode(nextNode, { wasRead: readNodes.includes(nextNode?.id) });
      return true;
    },
    pause() {
      if (narrativePaused) return false;
      narrativePaused = true;
      if (!echoActive || echoTimer === null) return false;
      echoRemainingMs = Math.max(0, (echoDeadline ?? now()) - now());
      clearTimeout(echoTimer);
      echoTimer = null;
      echoDeadline = null;
      return true;
    },
    resume() {
      if (!narrativePaused) return false;
      narrativePaused = false;
      if (!echoActive || echoTimer !== null) return false;
      scheduleEcho(echoEpoch, echoRemainingMs);
      return true;
    },
    dispose() {
      cancelEcho();
    }
  };
}
