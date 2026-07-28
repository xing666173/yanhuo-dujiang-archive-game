export const FIELD_TASK_FLOWS = Object.freeze({
  'camera-spot': Object.freeze({
    briefingScriptId: 'reeds-camera',
    briefingEndNodeId: 'reeds-camera-end',
    resultScriptId: 'reeds-camera-result',
    resultEndNodeId: 'reeds-camera-result-end'
  }),
  'notes-spot': Object.freeze({
    briefingScriptId: 'reeds-notes',
    briefingEndNodeId: 'reeds-notes-end',
    resultScriptId: 'reeds-notes-result',
    resultEndNodeId: 'reeds-notes-result-end'
  }),
  'voice-spot': Object.freeze({
    briefingScriptId: 'reeds-voice',
    briefingEndNodeId: 'reeds-voice-end',
    resultScriptId: 'reeds-voice-result',
    resultEndNodeId: 'reeds-voice-result-end'
  })
});

export const FIELD_TASK_CONVERGENCE = Object.freeze({
  scriptId: 'reeds-convergence',
  choiceNodeId: 'reeds-recording-priority',
  nodeIds: Object.freeze([
    'reeds-recording-priority',
    'reeds-echo',
    'reeds-return',
    'reeds-return-chen-yu',
    'reeds-return-lin-xia',
    'reeds-end'
  ]),
  endNodeId: 'reeds-end'
});

const FIELD_TASK_IDS = new Set(Object.keys(FIELD_TASK_FLOWS));
const FIELD_TASK_CONVERGENCE_NODE_IDS = new Set(FIELD_TASK_CONVERGENCE.nodeIds);
const LEGACY_RESULT = Object.freeze({ stars: 1, durationMs: 0, mistakes: 0 });

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isKnownFieldTaskId(id) {
  return FIELD_TASK_IDS.has(id);
}

export function isValidFieldTaskResult(value) {
  return isPlainRecord(value)
    && [1, 2, 3].includes(value.stars)
    && Number.isFinite(value.durationMs)
    && value.durationMs >= 0
    && Number.isInteger(value.mistakes)
    && value.mistakes >= 0;
}

export function hasConsistentVisitedFieldTaskResults(sessionState) {
  if (
    !Array.isArray(sessionState?.visitedHotspots)
    || !isPlainRecord(sessionState?.fieldTasks)
  ) return false;

  return sessionState.visitedHotspots.every((hotspotId) => (
    isKnownFieldTaskId(hotspotId)
    && isValidFieldTaskResult(sessionState.fieldTasks[hotspotId])
  ));
}

export function hasCompleteFieldTaskSet(sessionState) {
  if (
    sessionState?.sceneId !== 'reeds-wetland'
    || sessionState?.activeHotspotId !== null
    || !Array.isArray(sessionState?.visitedHotspots)
    || !isPlainRecord(sessionState?.fieldTasks)
  ) return false;

  return [...FIELD_TASK_IDS].every((hotspotId) => (
    sessionState.visitedHotspots.includes(hotspotId)
    && isValidFieldTaskResult(sessionState.fieldTasks[hotspotId])
  ));
}

export function hasTerminalFieldTaskActiveConflict(storyState, sessionState) {
  const terminalCheckpoint = sessionState?.prototypeComplete
    || storyState?.activeScriptId === FIELD_TASK_CONVERGENCE.scriptId;
  return terminalCheckpoint && sessionState?.activeHotspotId !== null;
}

export function isMatchingFieldTaskBriefing(id, scriptId) {
  return FIELD_TASK_FLOWS[id]?.briefingScriptId === scriptId;
}

export function getFieldTaskResultScript(id) {
  return FIELD_TASK_FLOWS[id]?.resultScriptId || null;
}

export function getFieldTaskStoryPhase(storyState) {
  for (const [hotspotId, flow] of Object.entries(FIELD_TASK_FLOWS)) {
    if (storyState?.activeScriptId === flow.briefingScriptId) {
      return {
        hotspotId,
        phase: storyState.activeNodeId === flow.briefingEndNodeId
          ? 'briefing-end'
          : 'briefing-line'
      };
    }
    if (storyState?.activeScriptId === flow.resultScriptId) {
      return {
        hotspotId,
        phase: storyState.activeNodeId === flow.resultEndNodeId
          ? 'result-end'
          : 'result-line'
      };
    }
  }
  return null;
}

export function hasStaleFieldTaskConvergenceCheckpoint(storyState) {
  const choices = isPlainRecord(storyState?.choices) ? storyState.choices : {};
  const readNodes = Array.isArray(storyState?.readNodes) ? storyState.readNodes : [];
  const completedScripts = Array.isArray(storyState?.completedScripts)
    ? storyState.completedScripts
    : [];
  return Object.hasOwn(choices, FIELD_TASK_CONVERGENCE.choiceNodeId)
    || readNodes.some((nodeId) => FIELD_TASK_CONVERGENCE_NODE_IDS.has(nodeId))
    || completedScripts.includes(FIELD_TASK_CONVERGENCE.scriptId);
}

export function hasCanonicalFieldTaskCompletionCheckpoint(storyState) {
  return storyState?.activeScriptId === FIELD_TASK_CONVERGENCE.scriptId
    && storyState?.activeNodeId === FIELD_TASK_CONVERGENCE.endNodeId
    && Array.isArray(storyState?.readNodes)
    && storyState.readNodes.includes(FIELD_TASK_CONVERGENCE.endNodeId)
    && Array.isArray(storyState?.completedScripts)
    && storyState.completedScripts.includes(FIELD_TASK_CONVERGENCE.scriptId);
}

export function classifyFieldTaskCheckpoint(storyState, sessionState) {
  if (!hasConsistentVisitedFieldTaskResults(sessionState)) {
    return { kind: 'invalid', hotspotId: null, phase: null };
  }

  const completeFieldTaskSet = hasCompleteFieldTaskSet(sessionState);
  if (sessionState?.prototypeComplete) {
    return {
      kind: completeFieldTaskSet
        && hasCanonicalFieldTaskCompletionCheckpoint(storyState)
        ? 'prototype-complete'
        : 'invalid',
      hotspotId: null,
      phase: 'prototype-complete'
    };
  }

  if (storyState?.activeScriptId === FIELD_TASK_CONVERGENCE.scriptId) {
    const activeNodeIsEnd = storyState.activeNodeId === FIELD_TASK_CONVERGENCE.endNodeId;
    const completedBeforeEnd = !activeNodeIsEnd
      && (
        storyState.readNodes?.includes(FIELD_TASK_CONVERGENCE.endNodeId)
        || storyState.completedScripts?.includes(FIELD_TASK_CONVERGENCE.scriptId)
      );
    return {
      kind: completeFieldTaskSet
        && !completedBeforeEnd
        && (!activeNodeIsEnd || hasCanonicalFieldTaskCompletionCheckpoint(storyState))
        ? 'convergence'
        : 'invalid',
      hotspotId: null,
      phase: activeNodeIsEnd
        ? 'convergence-end'
        : 'convergence'
    };
  }

  const activeIdsAreNull = storyState?.activeScriptId === null
    && storyState?.activeNodeId === null;
  if (activeIdsAreNull) {
    const safeIdle = sessionState?.sceneId === 'reeds-wetland'
      && sessionState?.activeHotspotId === null;
    return {
      kind: !safeIdle
        ? 'invalid'
        : hasStaleFieldTaskConvergenceCheckpoint(storyState)
          ? 'stale-convergence'
          : 'idle',
      hotspotId: null,
      phase: 'idle'
    };
  }
  if (storyState?.activeScriptId === null || storyState?.activeNodeId === null) {
    return { kind: 'invalid', hotspotId: null, phase: null };
  }

  const storyPhase = getFieldTaskStoryPhase(storyState);
  if (!storyPhase) return { kind: 'unrelated', hotspotId: null, phase: null };

  const { hotspotId, phase } = storyPhase;
  const visited = Array.isArray(sessionState?.visitedHotspots)
    && sessionState.visitedHotspots.includes(hotspotId);
  const active = sessionState?.activeHotspotId === hotspotId;
  const scored = isPlainRecord(sessionState?.fieldTasks)
    && isValidFieldTaskResult(sessionState.fieldTasks[hotspotId]);

  if (phase.startsWith('briefing')) {
    if (active && !visited && !scored) {
      return { kind: 'active-briefing', hotspotId, phase };
    }
    if (phase === 'briefing-end' && !active && !visited && !scored) {
      return { kind: 'cancelled-briefing', hotspotId, phase };
    }
  }

  if (phase.startsWith('result')) {
    if (active && !visited && scored) {
      return { kind: 'active-result', hotspotId, phase };
    }
    if (phase === 'result-end' && !active && visited && scored) {
      return { kind: 'completed-result', hotspotId, phase };
    }
  }

  return { kind: 'invalid', hotspotId, phase };
}

export function normalizeFieldTaskSession(storyState, sessionState) {
  const migrateLegacyResults = isPlainRecord(sessionState)
    && !Object.hasOwn(sessionState, 'fieldTasks');
  const visitedHotspots = [...new Set(
    sessionState.visitedHotspots.filter((id) => isKnownFieldTaskId(id))
  )];
  const fieldTasks = isPlainRecord(sessionState.fieldTasks)
    ? structuredClone(sessionState.fieldTasks)
    : {};
  let activeHotspotId = sessionState.sceneId === 'reeds-wetland'
    && !sessionState.prototypeComplete
    && isKnownFieldTaskId(sessionState.activeHotspotId)
    && !visitedHotspots.includes(sessionState.activeHotspotId)
    ? sessionState.activeHotspotId
    : null;

  if (migrateLegacyResults) {
    for (const hotspotId of visitedHotspots) {
      fieldTasks[hotspotId] = { ...LEGACY_RESULT };
    }
  }

  if (activeHotspotId) {
    const flow = FIELD_TASK_FLOWS[activeHotspotId];
    const activeScriptId = storyState.activeScriptId;
    const hasResult = Object.hasOwn(fieldTasks, activeHotspotId);

    if (hasResult && activeScriptId !== flow.resultScriptId) {
      delete fieldTasks[activeHotspotId];
    }
    if (
      (!Object.hasOwn(fieldTasks, activeHotspotId) && activeScriptId !== flow.briefingScriptId)
      || (Object.hasOwn(fieldTasks, activeHotspotId) && activeScriptId !== flow.resultScriptId)
    ) {
      activeHotspotId = null;
    }
  }

  for (const hotspotId of Object.keys(fieldTasks)) {
    if (!visitedHotspots.includes(hotspotId) && hotspotId !== activeHotspotId) {
      delete fieldTasks[hotspotId];
    }
  }

  return {
    ...sessionState,
    visitedHotspots,
    activeHotspotId,
    fieldTasks
  };
}

export function normalizeLegacyFieldTaskCompletion(
  storyState,
  originalSessionState,
  normalizedSessionState
) {
  const legacyCompletedSave = isPlainRecord(originalSessionState)
    && !Object.hasOwn(originalSessionState, 'fieldTasks')
    && originalSessionState.prototypeComplete === true
    && storyState?.activeScriptId === null
    && storyState?.activeNodeId === null
    && hasCompleteFieldTaskSet(normalizedSessionState);
  if (!legacyCompletedSave) return storyState;

  return {
    ...storyState,
    activeScriptId: FIELD_TASK_CONVERGENCE.scriptId,
    activeNodeId: FIELD_TASK_CONVERGENCE.endNodeId,
    readNodes: [...new Set([
      ...(Array.isArray(storyState.readNodes) ? storyState.readNodes : []),
      FIELD_TASK_CONVERGENCE.endNodeId
    ])],
    completedScripts: [...new Set([
      ...(Array.isArray(storyState.completedScripts) ? storyState.completedScripts : []),
      FIELD_TASK_CONVERGENCE.scriptId
    ])]
  };
}
