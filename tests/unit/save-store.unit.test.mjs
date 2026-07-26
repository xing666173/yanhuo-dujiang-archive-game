import assert from 'node:assert/strict';
import test from 'node:test';
import { createSaveStore } from '../../game/core/save-store.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

const defaultSettings = {
  autoPlay: false,
  quality: 'auto',
  music: 0.55,
  ambience: 0.7,
  uiSound: 0.65,
  reducedMotion: false
};

function validProgress() {
  return {
    storyState: {
      version: 1,
      activeScriptId: 'prologue',
      activeNodeId: 'prologue-lin-xia-opening',
      stats: { truth: 1, empathy: 0, expression: 0 },
      cooperation: 0,
      readNodes: ['prologue-lin-xia-opening'],
      choices: {},
      completedScripts: []
    },
    sessionState: {
      version: 1,
      sceneId: 'activity-room',
      visitedHotspots: [],
      completedScenes: [],
      activeHotspotId: null,
      prototypeComplete: false
    }
  };
}

test('uses injected versioned keys and round-trips progress', () => {
  const storage = memoryStorage();
  const store = createSaveStore({ storage, key: 'yanhuo-summer-echo:v1' });
  const { storyState, sessionState } = validProgress();

  store.saveProgress(storyState, sessionState);

  assert.deepEqual(store.loadProgress(), { storyState, sessionState });
  assert.ok(storage.getItem('yanhuo-summer-echo:v1:progress'));
  assert.equal(storage.getItem('yanhuo-summer-echo:v1:settings'), null);
});

test('uses the required versioned key when key is omitted', () => {
  const storage = memoryStorage();
  const store = createSaveStore({ storage });
  const { storyState, sessionState } = validProgress();

  store.saveProgress(storyState, sessionState);
  store.saveSettings({ quality: 'low' });

  assert.deepEqual(store.loadProgress(), { storyState, sessionState });
  assert.equal(store.loadSettings().quality, 'low');
  assert.ok(storage.getItem('yanhuo-summer-echo:v1:progress'));
  assert.ok(storage.getItem('yanhuo-summer-echo:v1:settings'));
  assert.equal(storage.getItem('undefined:progress'), null);
  assert.equal(storage.getItem('undefined:settings'), null);
});

test('returns default settings when storage is empty', () => {
  const store = createSaveStore({ storage: memoryStorage(), key: 'test' });
  assert.deepEqual(store.loadSettings(), defaultSettings);
});

test('returns independent progress objects on each load', () => {
  const store = createSaveStore({ storage: memoryStorage(), key: 'test' });
  const progress = validProgress();
  store.saveProgress(progress.storyState, progress.sessionState);

  const loaded = store.loadProgress();
  loaded.storyState.stats.truth = 99;
  loaded.sessionState.visitedHotspots.push('lantern');

  assert.deepEqual(store.loadProgress(), {
    storyState: progress.storyState,
    sessionState: progress.sessionState
  });
});

test('returns independent settings objects and protects defaults', () => {
  const store = createSaveStore({ storage: memoryStorage(), key: 'test' });
  const firstDefault = store.loadSettings();
  firstDefault.music = 0;
  firstDefault.quality = 'low';

  assert.deepEqual(store.loadSettings(), defaultSettings);

  store.saveSettings({ music: 0.25 });
  const firstSaved = store.loadSettings();
  firstSaved.music = 1;

  assert.equal(store.loadSettings().music, 0.25);
});

test('merges partial settings and normalizes accepted values', () => {
  const storage = memoryStorage();
  storage.setItem('test:settings', JSON.stringify({
    autoPlay: 0,
    quality: 'high',
    music: -1,
    ambience: 2,
    uiSound: '0.4',
    reducedMotion: 'false'
  }));
  const store = createSaveStore({ storage, key: 'test' });

  assert.deepEqual(store.loadSettings(), {
    autoPlay: false,
    quality: 'high',
    music: 0,
    ambience: 1,
    uiSound: 0.4,
    reducedMotion: false
  });
});

test('uses defaults for invalid settings values including non-finite volumes', () => {
  const storage = memoryStorage();
  const store = createSaveStore({ storage, key: 'test' });
  store.saveSettings({
    quality: 'ultra',
    music: Number.NaN,
    ambience: Number.POSITIVE_INFINITY,
    uiSound: 'not-a-number'
  });

  assert.deepEqual(store.loadSettings(), defaultSettings);
});

test('accepts only the supported quality values', () => {
  const storage = memoryStorage();
  const store = createSaveStore({ storage, key: 'test' });

  for (const quality of ['auto', 'high', 'low']) {
    store.saveSettings({ quality });
    assert.equal(store.loadSettings().quality, quality);
  }
});

test('removes malformed or incompatible progress and returns null', () => {
  const storage = memoryStorage();
  const store = createSaveStore({ storage, key: 'test' });
  const progress = validProgress();
  const invalidValues = [
    '{broken',
    JSON.stringify({ ...progress, storyState: { ...progress.storyState, version: 2 } }),
    JSON.stringify({ ...progress, storyState: { ...progress.storyState, activeNodeId: null } }),
    JSON.stringify({ ...progress, storyState: { ...progress.storyState, stats: { ...progress.storyState.stats, truth: null } } }),
    JSON.stringify({ ...progress, storyState: { ...progress.storyState, cooperation: '1' } }),
    JSON.stringify({ ...progress, storyState: { ...progress.storyState, readNodes: [42] } }),
    JSON.stringify({ ...progress, storyState: { ...progress.storyState, completedScripts: [false] } }),
    JSON.stringify({ ...progress, storyState: { ...progress.storyState, choices: { 'prologue-focus': 42 } } }),
    JSON.stringify({ ...progress, sessionState: { ...progress.sessionState, version: 2 } }),
    JSON.stringify({ ...progress, sessionState: { ...progress.sessionState, sceneId: 'unknown-scene' } }),
    JSON.stringify({ ...progress, sessionState: { ...progress.sessionState, visitedHotspots: [42] } }),
    JSON.stringify({ ...progress, sessionState: { ...progress.sessionState, completedScenes: ['unknown-scene'] } }),
    JSON.stringify({ ...progress, sessionState: { ...progress.sessionState, activeHotspotId: false } }),
    JSON.stringify({ ...progress, sessionState: { ...progress.sessionState, prototypeComplete: 'false' } })
  ];

  for (const value of invalidValues) {
    storage.setItem('test:progress', value);
    assert.equal(store.loadProgress(), null);
    assert.equal(storage.getItem('test:progress'), null);
  }
});

test('clearProgress removes progress without removing settings', () => {
  const storage = memoryStorage();
  const store = createSaveStore({ storage, key: 'test' });
  const progress = validProgress();
  store.saveProgress(progress.storyState, progress.sessionState);
  store.saveSettings({ quality: 'low' });

  store.clearProgress();

  assert.equal(store.loadProgress(), null);
  assert.equal(store.loadSettings().quality, 'low');
});

test('throwing storage degrades to current in-memory progress and settings', () => {
  const storage = {
    getItem() { throw new DOMException('blocked', 'SecurityError'); },
    setItem() { throw new DOMException('full', 'QuotaExceededError'); },
    removeItem() { throw new DOMException('blocked', 'SecurityError'); }
  };
  const store = createSaveStore({ storage, key: 'test' });
  const progress = validProgress();

  assert.deepEqual(store.loadSettings(), defaultSettings);
  store.saveSettings({ quality: 'low', music: 0.2 });
  assert.deepEqual(store.loadSettings(), { ...defaultSettings, quality: 'low', music: 0.2 });

  store.saveProgress(progress.storyState, progress.sessionState);
  assert.deepEqual(store.loadProgress(), progress);
  store.clearProgress();
  assert.equal(store.loadProgress(), null);
});

test('malformed progress is ignored even when storage removal throws', () => {
  const storage = {
    getItem: () => '{"storyState":{"version":1}}',
    setItem() {},
    removeItem() { throw new DOMException('blocked', 'SecurityError'); }
  };

  assert.equal(createSaveStore({ storage, key: 'test' }).loadProgress(), null);
});
