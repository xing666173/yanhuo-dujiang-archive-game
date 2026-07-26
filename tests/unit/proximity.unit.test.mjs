import assert from 'node:assert/strict';
import test from 'node:test';
import { getNearestHotspot } from '../../game/core/proximity.mjs';

test('returns the nearest in-range hotspot without mutating input', () => {
  const hotspots = [
    { id: 'far', position: [0, 0, 5], radius: 1 },
    { id: 'near', position: [1, 0, 0], radius: 2 }
  ];
  const copy = structuredClone(hotspots);

  assert.equal(getNearestHotspot([0, 0, 0], hotspots)?.id, 'near');
  assert.deepEqual(hotspots, copy);
  assert.equal(getNearestHotspot([9, 0, 9], hotspots), null);
});

test('uses XZ distance and the fallback radius when a hotspot omits one', () => {
  const hotspots = [
    { id: 'outside', position: [0, 99, 2.01] },
    { id: 'inside', position: [1.2, -99, 1.2] }
  ];

  assert.equal(getNearestHotspot([0, 0, 0], hotspots, 2)?.id, 'inside');
  assert.equal(getNearestHotspot([0, 0, 0], hotspots, 1), null);
});
