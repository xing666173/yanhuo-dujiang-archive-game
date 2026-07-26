const DEFAULT_SETTINGS = {
  autoPlay: false,
  quality: 'auto',
  music: 0.55,
  ambience: 0.7,
  uiSound: 0.65,
  reducedMotion: false
};

const QUALITY_VALUES = new Set(['auto', 'high', 'low']);
const VOLUME_KEYS = ['music', 'ambience', 'uiSound'];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeVolume(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

function normalizeSettings(settings) {
  const source = isRecord(settings) ? settings : {};
  const normalized = {
    autoPlay: Boolean(source.autoPlay ?? DEFAULT_SETTINGS.autoPlay),
    quality: QUALITY_VALUES.has(source.quality) ? source.quality : DEFAULT_SETTINGS.quality,
    music: DEFAULT_SETTINGS.music,
    ambience: DEFAULT_SETTINGS.ambience,
    uiSound: DEFAULT_SETTINGS.uiSound,
    reducedMotion: Boolean(source.reducedMotion ?? DEFAULT_SETTINGS.reducedMotion)
  };

  for (const key of VOLUME_KEYS) {
    if (key in source) normalized[key] = normalizeVolume(source[key], DEFAULT_SETTINGS[key]);
  }

  return normalized;
}

function parseStoredValue(storage, storageKey) {
  const value = storage.getItem(storageKey);
  if (value === null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function createSaveStore({ storage, key = 'yanhuo-summer-echo:v1' }) {
  const progressKey = `${key}:progress`;
  const settingsKey = `${key}:settings`;

  function loadProgress() {
    const stored = parseStoredValue(storage, progressKey);
    const valid = isRecord(stored)
      && isRecord(stored.storyState)
      && stored.storyState.version === 1
      && isRecord(stored.sessionState)
      && typeof stored.sessionState.sceneId === 'string'
      && Array.isArray(stored.sessionState.visitedHotspots);

    if (!valid) {
      if (stored !== null || storage.getItem(progressKey) !== null) storage.removeItem(progressKey);
      return null;
    }

    return stored;
  }

  function saveProgress(storyState, sessionState) {
    storage.setItem(progressKey, JSON.stringify({ storyState, sessionState }));
  }

  function clearProgress() {
    storage.removeItem(progressKey);
  }

  function loadSettings() {
    return normalizeSettings(parseStoredValue(storage, settingsKey));
  }

  function saveSettings(settings) {
    storage.setItem(settingsKey, JSON.stringify(normalizeSettings(settings)));
  }

  return { loadProgress, saveProgress, clearProgress, loadSettings, saveSettings };
}
