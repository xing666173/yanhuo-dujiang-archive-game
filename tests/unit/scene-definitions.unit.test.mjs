import assert from 'node:assert/strict';
import test from 'node:test';
import { activityRoomDefinition } from '../../game/scenes/activity-room.mjs';
import { reedsWetlandDefinition } from '../../game/scenes/reeds-wetland.mjs';

const primitiveKinds = new Set(['box', 'cylinder', 'plane', 'reed-field', 'person']);

test('scene definitions have stable bounds, starts and unique hotspots', () => {
  for (const scene of [activityRoomDefinition, reedsWetlandDefinition]) {
    assert.equal(scene.playerStart.length, 3);
    assert.equal(scene.bounds.min.length, 3);
    assert.equal(scene.bounds.max.length, 3);
    assert.ok(scene.walkableAreas.length > 0);
    const ids = scene.hotspots.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length);
  }

  assert.deepEqual(
    reedsWetlandDefinition.hotspots.map((item) => item.scriptId).sort(),
    ['reeds-camera', 'reeds-notes', 'reeds-voice']
  );
});

test('activity room preserves the required prologue facts and primitive contract', () => {
  assert.equal(activityRoomDefinition.id, 'activity-room');
  assert.deepEqual(activityRoomDefinition.bounds, {
    min: [-6, 0, -5],
    max: [6, 0, 5]
  });
  assert.deepEqual(activityRoomDefinition.playerStart, [0, 0, 3.4]);
  assert.deepEqual(activityRoomDefinition.hotspots.map(({ id, scriptId }) => ({ id, scriptId })), [
    { id: 'route-board', scriptId: 'prologue' }
  ]);
  assert.ok(activityRoomDefinition.primitives.filter(({ kind }) => kind === 'person').length >= 3);
});

test('wetland preserves exact hotspot positions and declares buildable primitives', () => {
  assert.equal(reedsWetlandDefinition.id, 'reeds-wetland');
  assert.deepEqual(reedsWetlandDefinition.bounds, {
    min: [-5, 0, -14],
    max: [5, 0, 8]
  });
  assert.deepEqual(reedsWetlandDefinition.playerStart, [0, 0, 6]);
  assert.deepEqual(
    reedsWetlandDefinition.hotspots.map(({ id, position, scriptId }) => ({ id, position, scriptId })),
    [
      { id: 'camera-spot', position: [-2.2, 0, 0], scriptId: 'reeds-camera' },
      { id: 'notes-spot', position: [2.1, 0, -4], scriptId: 'reeds-notes' },
      { id: 'voice-spot', position: [0.5, 0, -9], scriptId: 'reeds-voice' }
    ]
  );
  assert.ok(reedsWetlandDefinition.primitives.some(({ kind }) => kind === 'reed-field'));
  assert.ok(reedsWetlandDefinition.primitives.every(({ kind }) => primitiveKinds.has(kind)));
});
