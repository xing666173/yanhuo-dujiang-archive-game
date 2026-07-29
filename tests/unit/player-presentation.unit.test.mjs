import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../../game/vendor/three.module.min.js';
import { characterVisuals } from '../../game/data/character-visuals.mjs';
import { createPlayerPresentation } from '../../game/render/player-presentation.mjs';
import { createResourceStore } from '../../game/render/resource-store.mjs';

const quality = { shadows: true, characterDetail: 1 };

function createImportedInstance() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  material.name = 'Green';
  group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), material));
  return {
    group,
    playCalls: [],
    qualityCalls: [],
    disposeCount: 0,
    play(name) {
      this.playCalls.push(name);
      return { name };
    },
    update() {},
    setQuality(nextQuality) {
      this.qualityCalls.push(nextQuality);
    },
    dispose() {
      this.disposeCount += 1;
    }
  };
}

test('player presentation prefers imported Chen Yu with mapped movement and one-time disposal', (context) => {
  const resources = createResourceStore();
  context.after(() => resources.dispose());
  const instance = createImportedInstance();
  const player = createPlayerPresentation({
    modelLibrary: {
      createCharacter(id) {
        assert.equal(id, 'chen-yu');
        return instance;
      }
    },
    resources,
    quality,
    reducedMotion: false
  });

  assert.equal(player.characterId, 'chen-yu');
  assert.equal(player.modelSource, 'imported');
  player.update({ elapsed: 1, delta: 0.016, movementMagnitude: 1 });
  player.update({ elapsed: 2, delta: 0.016, movementMagnitude: 0 });
  assert.deepEqual(instance.playCalls, ['Idle', 'Walk', 'Idle']);
  player.setReducedMotion(true);
  player.update({ elapsed: 3, delta: 0.016, movementMagnitude: 0 });
  assert.equal(player.group.children[0].rotation.z, 0);
  player.setQuality({ shadows: false, characterDetail: 0 });
  assert.deepEqual(instance.qualityCalls, [quality, { shadows: false, characterDetail: 0 }]);
  player.dispose();
  player.dispose();
  assert.equal(instance.disposeCount, 1);
});

test('player presentation falls back to Chen Yu procedural visuals when imports are unavailable', (context) => {
  const resources = createResourceStore();
  context.after(() => resources.dispose());
  const player = createPlayerPresentation({
    modelLibrary: { createCharacter() { return null; } },
    resources,
    quality
  });

  assert.equal(player.characterId, 'chen-yu');
  assert.equal(player.modelSource, 'procedural');
  player.update({ elapsed: 1, delta: 0.016, movementMagnitude: 1 });
  const torso = player.group.getObjectByName('torso');
  assert.equal(torso.material.color.getHexString(), new THREE.Color(
    characterVisuals['chen-yu'].jacket
  ).getHexString());
});
