const DEFAULT_SETTINGS = {
  autoPlay: false,
  quality: 'auto',
  music: 0.55,
  ambience: 0.7,
  uiSound: 0.65,
  reducedMotion: false
};

const QUALITY_VALUES = new Set(['auto', 'high', 'low']);
const SCENE_IDS = new Set(['activity-room', 'reeds-wetland']);
const FIELD_TASK_IDS = new Set(['camera-spot', 'notes-spot', 'voice-spot']);
const VOLUME_KEYS = ['music', 'ambience', 'uiSound'];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeVolume(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeSettings(settings) {
  const source = isRecord(settings) ? settings : {};
  const normalized = {
    autoPlay: normalizeBoolean(source.autoPlay, DEFAULT_SETTINGS.autoPlay),
    quality: QUALITY_VALUES.has(source.quality) ? source.quality : DEFAULT_SETTINGS.quality,
    music: DEFAULT_SETTINGS.music,
    ambience: DEFAULT_SETTINGS.ambience,
    uiSound: DEFAULT_SETTINGS.uiSound,
    reducedMotion: normalizeBoolean(source.reducedMotion, DEFAULT_SETTINGS.reducedMotion)
  };

  for (const key of VOLUME_KEYS) {
    if (key in source) normalized[key] = normalizeVolume(source[key], DEFAULT_SETTINGS[key]);
  }

  return normalized;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidFieldTaskResult(value) {
  return isRecord(value)
    && [1, 2, 3].includes(value.stars)
    && isFiniteNumber(value.durationMs)
    && value.durationMs >= 0
    && Number.isInteger(value.mistakes)
    && value.mistakes >= 0;
}

function hasValidFieldTasks(state) {
  if (!Object.hasOwn(state, 'fieldTasks')) return true;
  return isRecord(state.fieldTasks)
    && Object.entries(state.fieldTasks).every(([id, result]) => (
      FIELD_TASK_IDS.has(id) && isValidFieldTaskResult(result)
    ));
}

function isChoicesRecord(value) {
  return isRecord(value)
    && Object.entries(value).every(([key, choice]) => key.length > 0 && typeof choice === 'string');
}

function isValidStoryState(state) {
  if (!isRecord(state) || state.version !== 1) return false;
  const activeIdsAreStrings = typeof state.activeScriptId === 'string'
    && state.activeScriptId.length > 0
    && typeof state.activeNodeId === 'string'
    && state.activeNodeId.length > 0;
  return activeIdsAreStrings
    && isRecord(state.stats)
    && ['truth', 'empathy', 'expression'].every((key) => isFiniteNumber(state.stats[key]))
    && isFiniteNumber(state.cooperation)
    && isStringArray(state.readNodes)
    && isChoicesRecord(state.choices)
    && isStringArray(state.completedScripts);
}

function isValidSessionState(state) {
  return isRecord(state)
    && state.version === 1
    && SCENE_IDS.has(state.sceneId)
    && isStringArray(state.visitedHotspots)
    && isStringArray(state.completedScenes)
    && state.completedScenes.every((sceneId) => SCENE_IDS.has(sceneId))
    && (state.activeHotspotId === null || typeof state.activeHotspotId === 'string')
    && typeof state.prototypeComplete === 'boolean'
    && hasValidFieldTasks(state);
}

export function createSaveStore({ storage, key = 'yanhuo-summer-echo:v1' }) {
  const progressKey = `${key}:progress`;
  const settingsKey = `${key}:settings`;
  const memory = new Map();
  let storageUnavailable = false;

  function getItem(storageKey) {
    if (storageUnavailable) return memory.get(storageKey) ?? null;
    try {
      const value = storage?.getItem?.(storageKey) ?? null;
      memory.set(storageKey, value);
      return value;
    } catch {
      storageUnavailable = true;
      return memory.get(storageKey) ?? null;
    }
  }

  function setItem(storageKey, value) {
    memory.set(storageKey, value);
    if (storageUnavailable) return;
    try {
      storage?.setItem?.(storageKey, value);
    } catch {
      storageUnavailable = true;
    }
  }

  function removeItem(storageKey) {
    memory.set(storageKey, null);
    if (storageUnavailable) return;
    try {
      storage?.removeItem?.(storageKey);
    } catch {
      storageUnavailable = true;
    }
  }

  function parseStoredValue(storageKey) {
    const raw = getItem(storageKey);
    if (raw === null) return { exists: false, value: null };
    try {
      return { exists: true, value: JSON.parse(raw) };
    } catch {
      return { exists: true, value: null };
    }
  }

  function loadProgress() {
    const parsed = parseStoredValue(progressKey);
    if (!parsed.exists) return null;
    const stored = parsed.value;
    const valid = isRecord(stored)
      && isValidStoryState(stored.storyState)
      && isValidSessionState(stored.sessionState);

    if (!valid) {
      removeItem(progressKey);
      return null;
    }

    const session = stored.sessionState;
    const fieldTasks = isRecord(session.fieldTasks)
      ? structuredClone(session.fieldTasks)
      : {};
    for (const hotspotId of session.visitedHotspots) {
      if (FIELD_TASK_IDS.has(hotspotId) && !fieldTasks[hotspotId]) {
        fieldTasks[hotspotId] = { stars: 1, durationMs: 0, mistakes: 0 };
      }
    }

    return { ...stored, sessionState: { ...session, fieldTasks } };
  }

  function saveProgress(storyState, sessionState) {
    setItem(progressKey, JSON.stringify({ storyState, sessionState }));
  }

  function clearProgress() {
    removeItem(progressKey);
  }

  function loadSettings() {
    const parsed = parseStoredValue(settingsKey);
    if (parsed.exists && !isRecord(parsed.value)) removeItem(settingsKey);
    return normalizeSettings(parsed.value);
  }

  function saveSettings(settings) {
    setItem(settingsKey, JSON.stringify(normalizeSettings(settings)));
  }

  return { loadProgress, saveProgress, clearProgress, loadSettings, saveSettings };
}
