import assert from 'node:assert/strict';
import test from 'node:test';
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
  assert.equal(model.group.getObjectsByProperty('name', 'left-hand').length, 1);
  assert.equal(model.group.getObjectsByProperty('name', 'right-hand').length, 1);
  resources.dispose();
});
