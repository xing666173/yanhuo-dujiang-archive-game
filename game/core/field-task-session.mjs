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

const FIELD_TASK_IDS = new Set(Object.keys(FIELD_TASK_FLOWS));
const LEGACY_RESULT = Object.freeze({ stars: 1, durationMs: 0, mistakes: 0 });

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isKnownFieldTaskId(id) {
  return FIELD_TASK_IDS.has(id);
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

export function classifyFieldTaskCheckpoint(storyState, sessionState) {
  const storyPhase = getFieldTaskStoryPhase(storyState);
  if (!storyPhase) return { kind: 'unrelated', hotspotId: null, phase: null };

  const { hotspotId, phase } = storyPhase;
  const visited = sessionState.visitedHotspots.includes(hotspotId);
  const active = sessionState.activeHotspotId === hotspotId;
  const scored = isPlainRecord(sessionState.fieldTasks)
    && Object.hasOwn(sessionState.fieldTasks, hotspotId);

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

  for (const hotspotId of visitedHotspots) {
    fieldTasks[hotspotId] ||= { ...LEGACY_RESULT };
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
