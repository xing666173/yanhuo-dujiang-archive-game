import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWalkablePosition } from '../../game/core/navigation.mjs';

test('keeps movement on connected walkable rectangles', () => {
  const areas = [
    { minX: -1.5, maxX: 1.5, minZ: -10, maxZ: 6 },
    { minX: -3, maxX: 3, minZ: -1, maxZ: 1 }
  ];

  assert.deepEqual(resolveWalkablePosition([0, 0, 0], [1, 0, -2], areas), [1, 0, -2]);
  assert.deepEqual(resolveWalkablePosition([1, 0, -2], [2.5, 0, -2], areas), [1, 0, -2]);
  assert.deepEqual(resolveWalkablePosition([0, 0, 0], [2.5, 0, 0], areas), [2.5, 0, 0]);
});

test('treats rectangle edges as walkable and always returns a clone', () => {
  const areas = [{ minX: -1, maxX: 1, minZ: -2, maxZ: 2 }];
  const previous = [0, 0, 0];
  const proposed = [1, 0, -2];

  const accepted = resolveWalkablePosition(previous, proposed, areas);
  const rejected = resolveWalkablePosition(previous, [1.01, 0, -2], areas);

  assert.deepEqual(accepted, proposed);
  assert.notEqual(accepted, proposed);
  assert.deepEqual(rejected, previous);
  assert.notEqual(rejected, previous);
});
