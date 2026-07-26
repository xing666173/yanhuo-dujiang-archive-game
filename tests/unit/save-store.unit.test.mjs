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

test('uses injected versioned keys and round-trips progress', () => {
  const storage = memoryStorage();
  const store = createSaveStore({ storage, key: 'yanhuo-summer-echo:v1' });
  const storyState = { version: 1, stats: { truth: 1 } };
  const sessionState = { sceneId: 'reeds', visitedHotspots: [] };

  store.saveProgress(storyState, sessionState);

  assert.deepEqual(store.loadProgress(), { storyState, sessionState });
  assert.ok(storage.getItem('yanhuo-summer-echo:v1:progress'));
  assert.equal(storage.getItem('yanhuo-summer-echo:v1:settings'), null);
});

test('uses the required versioned key when key is omitted', () => {
  const storage = memoryStorage();
  const store = createSaveStore({ storage });
  const storyState = { version: 1, stats: { truth: 2 } };
  const sessionState = { sceneId: 'prologue', visitedHotspots: ['bell'] };

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
  store.saveProgress(
    { version: 1, stats: { truth: 1 } },
    { sceneId: 'reeds', visitedHotspots: [] }
  );

  const loaded = store.loadProgress();
  loaded.storyState.stats.truth = 99;
  loaded.sessionState.visitedHotspots.push('lantern');

  assert.deepEqual(store.loadProgress(), {
    storyState: { version: 1, stats: { truth: 1 } },
    sessionState: { sceneId: 'reeds', visitedHotspots: [] }
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
    reducedMotion: true
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
  const invalidValues = [
    '{broken',
    JSON.stringify({ storyState: { version: 2 }, sessionState: { sceneId: 'reeds', visitedHotspots: [] } }),
    JSON.stringify({ storyState: { version: 1 }, sessionState: { sceneId: 42, visitedHotspots: [] } }),
    JSON.stringify({ storyState: { version: 1 }, sessionState: { sceneId: 'reeds', visitedHotspots: {} } })
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
  store.saveProgress({ version: 1 }, { sceneId: 'reeds', visitedHotspots: [] });
  store.saveSettings({ quality: 'low' });

  store.clearProgress();

  assert.equal(store.loadProgress(), null);
  assert.equal(store.loadSettings().quality, 'low');
});
