import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../../game/vendor/three.module.min.js';
import { buildScene } from '../../game/render/scene-builder.mjs';
import { chooseQuality } from '../../game/render/quality.mjs';
import { activityRoomDefinition } from '../../game/scenes/activity-room.mjs';
import { reedsWetlandDefinition } from '../../game/scenes/reeds-wetland.mjs';

const primitiveKinds = new Set([
  'box',
  'cylinder',
  'plane',
  'reed-field',
  'lotus-field',
  'tree-line',
  'person'
]);

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

test('scene definitions reserve Chen Yu for the player and retain Gu Yan and Lin Xia as NPCs', () => {
  for (const definition of [activityRoomDefinition, reedsWetlandDefinition]) {
    assert.equal(definition.playerCharacterId, 'chen-yu');
    assert.deepEqual(
      definition.primitives.filter(({ kind }) => kind === 'person')
        .map(({ characterId }) => characterId).sort(),
      ['gu-yan', 'lin-xia']
    );
  }
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
  assert.equal(activityRoomDefinition.primitives.filter(({ kind }) => kind === 'person').length, 2);
});

test('wetland preserves exact hotspot positions and declares buildable primitives', () => {
  assert.equal(reedsWetlandDefinition.id, 'reeds-wetland');
  assert.deepEqual(reedsWetlandDefinition.bounds, {
    min: [-5, 0, -14],
    max: [5, 0, 8]
  });
  assert.deepEqual(reedsWetlandDefinition.playerStart, [0, 0, 6]);
  assert.deepEqual(
    reedsWetlandDefinition.hotspots.map(
      ({ id, position, scriptId, characterId }) => ({ id, position, scriptId, characterId })
    ),
    [
      {
        id: 'camera-spot',
        position: [-2.2, 0, 0],
        scriptId: 'reeds-camera',
        characterId: 'chen-yu'
      },
      {
        id: 'notes-spot',
        position: [2.1, 0, -4],
        scriptId: 'reeds-notes',
        characterId: 'gu-yan'
      },
      {
        id: 'voice-spot',
        position: [0.5, 0, -9],
        scriptId: 'reeds-voice',
        characterId: 'lin-xia'
      }
    ]
  );
  assert.ok(reedsWetlandDefinition.primitives.some(({ kind }) => kind === 'reed-field'));
  assert.ok(reedsWetlandDefinition.primitives.some(({ kind }) => kind === 'lotus-field'));
  assert.ok(reedsWetlandDefinition.primitives.some(({ kind }) => kind === 'tree-line'));
  assert.ok(reedsWetlandDefinition.environment.exposure > 0);
  assert.ok(reedsWetlandDefinition.environment.fogNear < reedsWetlandDefinition.environment.fogFar);
  assert.ok(reedsWetlandDefinition.primitives.every(({ kind }) => primitiveKinds.has(kind)));
  assert.deepEqual(
    reedsWetlandDefinition.primitives
      .filter(({ kind }) => kind === 'person')
      .map(({ characterId }) => characterId)
      .sort(),
    ['gu-yan', 'lin-xia']
  );
});

test('wetland visual surface lifts hotspot rendering without changing state or NPC coordinates', (context) => {
  const surfaceY = reedsWetlandDefinition.visualSurfaceHeight;
  assert.equal(surfaceY, 0.26);
  assert.equal(reedsWetlandDefinition.playerStart[1], 0);
  assert.ok(reedsWetlandDefinition.hotspots.every(({ position }) => position[1] === 0));
  assert.deepEqual(
    reedsWetlandDefinition.primitives
      .filter(({ kind }) => kind === 'person')
      .map(({ position }) => position[1]),
    [surfaceY, surfaceY]
  );

  const builtScene = buildScene({
    ...reedsWetlandDefinition,
    primitives: []
  }, {
    quality: chooseQuality({ requested: 'low' })
  });
  context.after(() => builtScene.dispose());
  builtScene.group.updateMatrixWorld(true);

  for (const [id, marker] of builtScene.markerById) {
    const bounds = new THREE.Box3().setFromObject(marker);
    assert.ok(
      bounds.min.y >= surfaceY - 1e-6,
      `${id} marker minimum ${bounds.min.y} must stay above surface ${surfaceY}`
    );
  }
});

test('scene definitions retain deliberate material and decor differentiation', () => {
  const activityRoles = new Set(activityRoomDefinition.primitives.map(({ role }) => role).filter(Boolean));
  for (const role of [
    'floor', 'wall', 'wall-lower', 'window', 'window-frame', 'daylight-band',
    'shelf', 'book', 'desk', 'chair', 'route-board', 'equipment-case'
  ]) {
    assert.ok(activityRoles.has(role), `activity room must declare ${role}`);
  }
  assert.ok(new Set(
    activityRoomDefinition.primitives
      .filter(({ role }) => role === 'desk')
      .map(({ material }) => material)
  ).size >= 3, 'activity desks must use at least three differentiated materials');
  assert.deepEqual(
    activityRoomDefinition.primitives
      .filter(({ kind }) => kind === 'person')
      .map(({ cue }) => cue)
      .sort(),
    ['notebook', 'route-folder']
  );

  const waterLayers = reedsWetlandDefinition.primitives.filter(({ role }) => (
    role === 'water' || role === 'water-sheen'
  ));
  assert.ok(waterLayers.length >= 2, 'wetland must layer water and water sheen records');
  const reedFields = reedsWetlandDefinition.primitives.filter(({ kind }) => kind === 'reed-field');
  assert.ok(reedFields.every(({ palette, cluster }) => palette?.length >= 3 && cluster > 0));
  assert.ok(new Set(
    reedsWetlandDefinition.primitives
      .filter(({ role }) => role === 'plank' || role === 'platform-plank')
      .map(({ material }) => material)
  ).size >= 4, 'boardwalk needs weathered plank material variation');
  assert.ok(reedsWetlandDefinition.primitives.some(({ role }) => role === 'horizon-shore'));
});

test('nature composition placements are deterministic and outside every walkable wetland lane', () => {
  const placements = reedsWetlandDefinition.environmentModels;
  assert.equal(placements.length, 8);
  assert.deepEqual(
    placements.map(({ id, modelId, position, height }) => ({ id, modelId, position, height })),
    [
      {
        id: 'west-near-birch',
        modelId: 'birch-tree-1',
        position: [-5.2, 0.02, -4.8],
        height: 3.8
      },
      {
        id: 'east-mid-birch',
        modelId: 'birch-tree-3',
        position: [5.35, 0.01, -8.2],
        height: 4.1
      },
      {
        id: 'west-mid-birch',
        modelId: 'birch-tree-1',
        position: [-6.2, 0.02, -12],
        height: 3.6
      },
      {
        id: 'east-far-birch',
        modelId: 'birch-tree-3',
        position: [6.45, 0, -14.2],
        height: 4.2
      },
      {
        id: 'west-near-bush',
        modelId: 'bush-large',
        position: [-4.25, 0, 3.35],
        height: 1.05
      },
      {
        id: 'east-near-bush',
        modelId: 'bush-large',
        position: [4.4, 0, 1.9],
        height: 0.92
      },
      {
        id: 'west-mid-bush',
        modelId: 'bush-large',
        position: [-4.6, 0, -7.25],
        height: 0.86
      },
      {
        id: 'east-mid-bush',
        modelId: 'bush-large',
        position: [4.75, 0, -10.7],
        height: 1.1
      }
    ]
  );

  for (const placement of placements) {
    const [x, , z] = placement.position;
    assert.ok(
      reedsWetlandDefinition.walkableAreas.every((area) => (
        x < area.minX || x > area.maxX || z < area.minZ || z > area.maxZ
      )),
      `${placement.id} must stay outside authored walkable areas`
    );
    if (placement.modelId.startsWith('birch-tree')) assert.ok(Math.abs(x) >= 4.4);
    if (placement.modelId === 'bush-large') assert.ok(Math.abs(x) >= 3.6);
  }
  assert.deepEqual(activityRoomDefinition.environmentModels, []);
});

test('nature composition retains procedural depth layers and adds a primitive horizon fishing boat', () => {
  for (const kind of ['reed-field', 'lotus-field', 'tree-line']) {
    assert.ok(reedsWetlandDefinition.primitives.some((record) => record.kind === kind));
  }
  const boatRoles = new Set(reedsWetlandDefinition.primitives
    .map(({ role }) => role)
    .filter((role) => role?.startsWith('fishing-boat')));
  assert.deepEqual(
    [...boatRoles].sort(),
    [
      'fishing-boat-canopy',
      'fishing-boat-frame',
      'fishing-boat-hull',
      'fishing-boat-pole',
      'fishing-boat-trim'
    ]
  );
  const boatHull = reedsWetlandDefinition.primitives.find(
    ({ role }) => role === 'fishing-boat-hull'
  );
  const boatCanopy = reedsWetlandDefinition.primitives.find(
    ({ role }) => role === 'fishing-boat-canopy'
  );
  assert.deepEqual(
    reedsWetlandDefinition.primitives
      .filter(({ role }) => role?.startsWith('fishing-boat'))
      .map(({ role, position }) => ({ role, position })),
    [
      { role: 'fishing-boat-hull', position: [6.4, 0.18, -7.4] },
      { role: 'fishing-boat-trim', position: [6.3, 0.45, -7.4] },
      { role: 'fishing-boat-pole', position: [5.3, 1.7, -7.15] },
      { role: 'fishing-boat-frame', position: [5.75, 1.26, -7.38] },
      { role: 'fishing-boat-frame', position: [6.95, 1.26, -7.38] },
      { role: 'fishing-boat-canopy', position: [6.35, 2.02, -7.38] }
    ]
  );
  assert.deepEqual(boatHull.position, [6.4, 0.18, -7.4]);
  assert.deepEqual(boatHull.scale, [3.4, 0.44, 0.96]);
  assert.deepEqual(boatCanopy.position, [6.35, 2.02, -7.38]);
  assert.ok(boatCanopy.scale[0] >= 2.1, 'canopy must read above the reeds at default framing');
  assert.ok(boatCanopy.scale[2] >= 1, 'canopy needs a recognizable distant silhouette');
  assert.ok(boatHull.position[2] <= -6, 'boat must remain in middle-distance water');
  assert.ok(boatHull.position[0] > 5.5, 'boat must remain to the right of the boardwalk');
  assert.ok(boatHull.position[0] < 7, 'boat must stay readable in the default camera');
  const channel = reedsWetlandDefinition.primitives.find(
    ({ kind, waterChannel }) => kind === 'reed-field' && waterChannel
  )?.waterChannel;
  assert.deepEqual(channel?.to, [6.4, -7.4]);
  assert.equal(channel?.halfWidth, 1.05);
  assert.ok(channel?.heightScale <= 0.15, 'reeds in the channel must stay below the boat silhouette');
  assert.ok(reedsWetlandDefinition.primitives.every(({ kind }) => primitiveKinds.has(kind)));
});
