import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../../game/vendor/three.module.min.js';
import { characterVisuals } from '../../game/data/character-visuals.mjs';
import { createCharacterModel } from '../../game/render/character-model.mjs';
import { createResourceStore } from '../../game/render/resource-store.mjs';
import { chooseQuality } from '../../game/render/quality.mjs';

const required = [
  'left-upper-arm', 'left-forearm', 'left-hand',
  'right-upper-arm', 'right-forearm', 'right-hand',
  'left-thigh', 'left-shin', 'left-foot',
  'right-thigh', 'right-shin', 'right-foot'
];

test('named team visuals are exactly two men and one woman', () => {
  const team = ['gu-yan', 'chen-yu', 'lin-xia'].map((id) => characterVisuals[id]);
  assert.deepEqual(team.map(({ gender }) => gender).sort(), ['female', 'male', 'male']);
  assert.equal(new Set(team.map(({ hairStyle }) => hairStyle)).size, 3);
  assert.equal(new Set(team.map(({ prop }) => prop)).size, 3);
});

test('character model registers one complete left and right anatomy', () => {
  const resources = createResourceStore();
  const model = createCharacterModel({
    ...characterVisuals['lin-xia'],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0.88, 1.68, 0.85],
    pose: 'listening'
  }, { resources, quality: chooseQuality({ requested: 'high' }) });
  assert.deepEqual([...model.parts.keys()].filter((name) => required.includes(name)).sort(), [...required].sort());
  for (const name of required) {
    assert.equal(
      model.group.getObjectsByProperty('name', name).length,
      1,
      `${name} must appear exactly once in the scene graph`
    );
  }
  resources.dispose();
});

test('zero-movement character keeps scaled feet on the root ground height', (context) => {
  const resources = createResourceStore();
  context.after(() => resources.dispose());
  const groundY = 1.25;
  const model = createCharacterModel({
    ...characterVisuals['lin-xia'],
    position: [2.18, groundY, -3.12],
    rotation: [0, -0.58, 0],
    scale: [0.88, 1.68, 0.85],
    cue: 'route-folder',
    pose: 'lean'
  }, { resources, quality: chooseQuality({ requested: 'high' }) });

  model.update({ elapsed: 1.7, movementMagnitude: 0 });
  const bounds = new THREE.Box3().setFromObject(model.group);

  assert.equal(model.group.position.y, groundY);
  assert.ok(
    Math.abs(bounds.min.y - groundY) <= 1e-6,
    `expected feet at ${groundY}, received ${bounds.min.y}`
  );
});

test('walk update moves paired limbs in opposite directions and idle returns to neutral', (context) => {
  const resources = createResourceStore();
  context.after(() => resources.dispose());
  const model = createCharacterModel({
    ...characterVisuals.player,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0.9, 1.72, 0.88]
  }, { resources, quality: chooseQuality({ requested: 'low' }) });

  model.group.position.y = 1.25;
  model.update({ elapsed: 0.2, movementMagnitude: 1 });
  assert.notEqual(model.parts.get('left-hip').rotation.x, model.parts.get('right-hip').rotation.x);
  model.update({ elapsed: 0.4, movementMagnitude: 0 });

  for (const joint of ['left-hip', 'right-hip', 'left-shoulder', 'right-shoulder']) {
    assert.ok(
      Math.abs(model.parts.get(joint).rotation.x) < 0.0001,
      `${joint} must return to neutral`
    );
  }
  assert.equal(model.group.position.y, 1.25);
});

test('low quality preserves facial anatomy and primary silhouette while hiding secondary detail', (context) => {
  const resources = createResourceStore();
  context.after(() => resources.dispose());
  const model = createCharacterModel({
    ...characterVisuals['chen-yu'],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0.88, 1.68, 0.85],
    pose: 'camera'
  }, { resources, quality: chooseQuality({ requested: 'low' }) });

  for (const name of [
    'nose',
    'left-ear',
    'right-ear',
    'torso',
    'hair-cap',
    'hair-wave-2',
    'backpack',
    'prop-camera-body',
    'prop-camera-lens'
  ]) {
    assert.equal(model.parts.get(name).visible, true, `${name} must remain visible on low quality`);
  }
  for (const name of [
    'hair-wave-1',
    'hair-wave-3',
    'left-backpack-buckle',
    'right-backpack-buckle',
    'prop-camera-control'
  ]) {
    assert.equal(model.parts.get(name).visible, false, `${name} must be hidden on low quality`);
  }

  model.setQuality(chooseQuality({ requested: 'high' }));
  for (const name of ['nose', 'left-ear', 'right-ear']) {
    assert.equal(model.parts.get(name).visible, true, `${name} must remain visible on high quality`);
  }
});
