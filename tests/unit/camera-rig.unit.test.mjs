import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateThirdPersonCamera } from '../../game/render/camera-rig.mjs';

const EPSILON = 1e-10;

test('camera offset and look target form an exact 18 degree pitch', () => {
  const rig = calculateThirdPersonCamera({
    player: [2, 0.25, 3],
    targetHeight: 0.85,
    distance: 5,
    yaw: 0,
    shoulder: 0.4
  });

  assert.deepEqual(rig.target, [2.4, 1.1, 3]);
  assert.ok(Math.abs(rig.position[0] - 2.4) < EPSILON);
  assert.ok(Math.abs(rig.position[2] - (3 + Math.cos(Math.PI / 10) * 5)) < EPSILON);

  const vertical = rig.position[1] - rig.target[1];
  const horizontal = Math.hypot(
    rig.position[0] - rig.target[0],
    rig.position[2] - rig.target[2]
  );
  assert.ok(Math.abs(Math.atan2(vertical, horizontal) - Math.PI / 10) < EPSILON);
});

test('portrait framing centers the shoulder and pulls back to retain side characters', () => {
  const rig = calculateThirdPersonCamera({
    player: [0, 0, 6],
    targetHeight: 0.9,
    distance: 5.05,
    yaw: 0,
    shoulder: 0.42,
    aspect: 390 / 844
  });

  assert.deepEqual(rig.target, [0, 0.9, 6]);
  const distance = Math.hypot(
    rig.position[0] - rig.target[0],
    rig.position[1] - rig.target[1],
    rig.position[2] - rig.target[2]
  );
  assert.ok(Math.abs(distance - 5.05 * 1.32) < EPSILON);
});
