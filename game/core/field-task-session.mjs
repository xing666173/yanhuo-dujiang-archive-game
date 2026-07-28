export const FIELD_TASK_FLOWS = Object.freeze({
  'camera-spot': Object.freeze({
    briefingScriptId: 'reeds-camera',
    resultScriptId: 'reeds-camera-result'
  }),
  'notes-spot': Object.freeze({
    briefingScriptId: 'reeds-notes',
    resultScriptId: 'reeds-notes-result'
  }),
  'voice-spot': Object.freeze({
    briefingScriptId: 'reeds-voice',
    resultScriptId: 'reeds-voice-result'
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
