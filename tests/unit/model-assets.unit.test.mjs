import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHARACTER_MODEL_IDS,
  ENVIRONMENT_MODEL_IDS,
  MODEL_ASSETS
} from '../../game/data/model-assets.mjs';

const expectedCharacterIds = ['chen-yu', 'gu-yan', 'lin-xia'];
const expectedEnvironmentIds = ['birch-tree-1', 'birch-tree-3', 'bush-large'];
const expectedAssetIds = [...expectedCharacterIds, ...expectedEnvironmentIds];
const expectedCharacterAnimations = ['Idle', 'Walk', 'Interact', 'Wave'];
const expectedMeasuredMetrics = {
  'chen-yu': { triangleCount: 10_202, maxBytes: 1_700_000 },
  'gu-yan': { triangleCount: 5_776, maxBytes: 1_250_000 },
  'lin-xia': { triangleCount: 6_424, maxBytes: 1_350_000 },
  'birch-tree-1': { triangleCount: 4_596, maxBytes: 300_000 },
  'birch-tree-3': { triangleCount: 6_818, maxBytes: 450_000 },
  'bush-large': { triangleCount: 276, maxBytes: 50_000 }
};

test('model asset manifest declares exactly the approved local model ids', () => {
  assert.deepEqual(Object.keys(MODEL_ASSETS).sort(), [...expectedAssetIds].sort());
  assert.deepEqual(CHARACTER_MODEL_IDS, expectedCharacterIds);
  assert.deepEqual(ENVIRONMENT_MODEL_IDS, expectedEnvironmentIds);
});

test('model asset urls are same-origin relative GLB paths', () => {
  for (const record of Object.values(MODEL_ASSETS)) {
    assert.match(record.url, /^\.\/assets\/models\/[^/]+\.glb$/);
    assert.doesNotMatch(record.url, /^(?:[a-z][a-z\d+.-]*:|\/\/)/i);
  }
});

test('model asset records match the measured triangle and byte contracts', () => {
  for (const [id, metrics] of Object.entries(expectedMeasuredMetrics)) {
    assert.deepEqual(
      {
        triangleCount: MODEL_ASSETS[id].triangleCount,
        maxBytes: MODEL_ASSETS[id].maxBytes
      },
      metrics
    );
  }
});

test('model ids match record ids and their declared kind groups', () => {
  for (const [id, record] of Object.entries(MODEL_ASSETS)) {
    assert.equal(record.id, id);
  }
  for (const id of CHARACTER_MODEL_IDS) {
    assert.equal(MODEL_ASSETS[id].kind, 'character');
  }
  for (const id of ENVIRONMENT_MODEL_IDS) {
    assert.equal(MODEL_ASSETS[id].kind, 'environment');
  }
});

test('model asset records are deeply immutable', () => {
  'use strict';

  assert.equal(Object.isFrozen(MODEL_ASSETS), true);
  assert.equal(Object.isFrozen(CHARACTER_MODEL_IDS), true);
  assert.equal(Object.isFrozen(ENVIRONMENT_MODEL_IDS), true);
  for (const record of Object.values(MODEL_ASSETS)) {
    assert.equal(Object.isFrozen(record), true);
    assert.equal(Object.isFrozen(record.animations), true);
    assert.throws(() => {
      record.maxBytes = 1;
    }, TypeError);
    assert.throws(() => {
      record.animations.push('Run');
    }, TypeError);
  }
});

test('model asset records carry the CC0 Quaternius release metadata', () => {
  for (const record of Object.values(MODEL_ASSETS)) {
    assert.equal(record.license, 'CC0-1.0');
    assert.match(record.sourceUrl, /^https:\/\/quaternius\.com\//);
    assert.ok(Number.isInteger(record.triangleCount) && record.triangleCount > 0);
    assert.ok(Number.isInteger(record.maxBytes) && record.maxBytes > 0);
    assert.ok(record.maxBytes <= 2_000_000);
  }
});

test('character records keep the approved animation clips and triangle budget', () => {
  for (const id of CHARACTER_MODEL_IDS) {
    assert.deepEqual(MODEL_ASSETS[id].animations, expectedCharacterAnimations);
  }
  assert.ok(
    CHARACTER_MODEL_IDS.reduce((sum, id) => sum + MODEL_ASSETS[id].triangleCount, 0) <= 25_000
  );
});

test('model byte budgets respect character, environment, and total ceilings', () => {
  const sumBytes = (ids) => ids.reduce((sum, id) => sum + MODEL_ASSETS[id].maxBytes, 0);
  assert.ok(sumBytes(CHARACTER_MODEL_IDS) <= 4.5 * 1024 * 1024);
  assert.ok(sumBytes(ENVIRONMENT_MODEL_IDS) <= 1.5 * 1024 * 1024);
  assert.ok(sumBytes(expectedAssetIds) <= 6 * 1024 * 1024);
});
