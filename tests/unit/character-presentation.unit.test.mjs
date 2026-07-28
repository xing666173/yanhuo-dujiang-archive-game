import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../../game/vendor/three.module.min.js';
import { characterVisuals } from '../../game/data/character-visuals.mjs';
import { createCharacterPresentation } from '../../game/render/character-presentation.mjs';
import { buildScene } from '../../game/render/scene-builder.mjs';
import { chooseQuality } from '../../game/render/quality.mjs';
import { reedsWetlandDefinition } from '../../game/scenes/reeds-wetland.mjs';

function createImportedInstance({
  materialNames = ['Skin'],
  wrists = ['Wrist.L', 'Wrist.R']
} = {}) {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(0.5, 2, 0.4);
  geometry.translate(0, 1, 0);
  const sourceMaterials = [];
  for (const [index, name] of materialNames.entries()) {
    const material = new THREE.MeshStandardMaterial({ color: '#777777' });
    material.name = name;
    sourceMaterials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.x = index * 0.02;
    group.add(mesh);
  }
  for (const name of wrists) {
    const wrist = new THREE.Bone();
    wrist.name = name;
    wrist.position.set(name.endsWith('R') ? -0.25 : 0.25, 1.25, 0);
    group.add(wrist);
  }

  const playCalls = [];
  const updateCalls = [];
  let disposeCount = 0;
  const actions = new Map();
  const instance = {
    group,
    playCalls,
    updateCalls,
    sourceMaterials,
    geometry,
    play(name) {
      playCalls.push(name);
      if (!actions.has(name)) actions.set(name, { name });
      return actions.get(name);
    },
    update(input) {
      updateCalls.push(input);
    },
    setQuality() {},
    dispose() {
      disposeCount += 1;
    },
    get disposeCount() {
      return disposeCount;
    }
  };
  return instance;
}

function record(overrides = {}) {
  return {
    kind: 'person',
    characterId: 'chen-yu',
    position: [2, 0.26, -3],
    rotation: [0, 0.7, 0],
    scale: [0.88, 1.7, 0.86],
    cue: null,
    ...overrides
  };
}

function presentationOptions(instance, overrides = {}) {
  return {
    instance,
    record: record(),
    appearance: characterVisuals['chen-yu'],
    quality: chooseQuality({ requested: 'high' }),
    ...overrides
  };
}

function findPresentationMaterials(group) {
  const materials = new Map();
  group.traverse((object) => {
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material?.userData.presentationRole) materials.set(material.name, material);
    }
  });
  return materials;
}

function findProps(group) {
  const props = [];
  group.traverse((object) => {
    if (object.userData.role === 'character-prop') props.push(object);
  });
  return props;
}

test('character presentation normalizes imported height and aligns feet to the scene surface', () => {
  const instance = createImportedInstance();
  const presentation = createCharacterPresentation(presentationOptions(instance));
  presentation.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(presentation.group);

  assert.ok(Math.abs(bounds.min.y - 0.26) < 1e-6);
  assert.ok(Math.abs(bounds.max.y - bounds.min.y - 1.7) < 1e-6);
  assert.deepEqual(presentation.group.position.toArray(), [2, 0.26, -3]);
  assert.deepEqual(presentation.group.rotation.toArray().slice(0, 3), [0, 0.7, 0]);
  assert.equal(presentation.group.userData.role, 'person');
  assert.equal(presentation.group.userData.characterId, 'chen-yu');
  assert.equal(presentation.group.userData.modelSource, 'imported');
  presentation.dispose();
});

test('character presentation keeps skin, hair, clothing and accent palette roles distinct', () => {
  const instance = createImportedInstance({
    materialNames: ['Skin', 'Hair', 'Green', 'LightGreen']
  });
  const presentation = createCharacterPresentation(presentationOptions(instance));
  const materials = findPresentationMaterials(presentation.group);

  assert.equal(materials.get('Skin').userData.presentationRole, 'skin');
  assert.equal(materials.get('Hair').userData.presentationRole, 'hair');
  assert.equal(materials.get('Green').userData.presentationRole, 'clothing');
  assert.equal(materials.get('LightGreen').userData.presentationRole, 'accent');
  assert.equal(new Set([...materials.values()].map((material) => material.color.getHexString())).size, 4);
  for (const [index, material] of [...materials.values()].entries()) {
    assert.notEqual(material, instance.sourceMaterials[index]);
    assert.ok(material.roughness >= 0.78);
    assert.equal(material.metalness, 0);
    assert.ok(material.userData.baseColor?.isColor);
    assert.ok(material.userData.baseEmissive?.isColor);
  }
  presentation.dispose();
});

test('character presentation attaches one prop to Wrist.R and falls back once to Wrist.L', () => {
  const rightInstance = createImportedInstance();
  const right = createCharacterPresentation(presentationOptions(rightInstance, {
    record: record({ cue: 'camera' })
  }));
  const rightProps = findProps(right.group);
  assert.equal(rightProps.length, 1);
  assert.equal(rightProps[0].parent.name, 'Wrist.R');
  assert.equal(right.group.getObjectsByProperty('name', 'Wrist.R').length, 1);
  assert.equal(right.group.getObjectsByProperty('name', 'Wrist.L').length, 1);

  const leftInstance = createImportedInstance({ wrists: ['Wrist.L'] });
  const left = createCharacterPresentation(presentationOptions(leftInstance, {
    record: record({ cue: 'route-folder' })
  }));
  const leftProps = findProps(left.group);
  assert.equal(leftProps.length, 1);
  assert.equal(leftProps[0].parent.name, 'Wrist.L');
  assert.equal(left.group.getObjectsByProperty('name', 'Wrist.L').length, 1);

  right.dispose();
  left.dispose();
});

test('character presentation action state ignores repeats and returns movement to idle', () => {
  const instance = createImportedInstance();
  const presentation = createCharacterPresentation(presentationOptions(instance));
  assert.deepEqual(instance.playCalls, ['Idle']);

  presentation.play('Idle');
  presentation.play('Walk');
  presentation.play('Walk');
  presentation.update({ delta: 0.1, time: 1000, action: 'Walk' });
  presentation.update({ delta: 0.1, time: 1100, action: 'Idle' });

  assert.deepEqual(instance.playCalls, ['Idle', 'Walk', 'Idle']);
  assert.equal(presentation.action, 'Idle');
  assert.deepEqual(instance.updateCalls, [{ delta: 0.1 }, { delta: 0.1 }]);
  presentation.dispose();
});

test('character presentation disposal releases instance materials and props but not shared sources', () => {
  const instance = createImportedInstance();
  let sourceMaterialDisposals = 0;
  let sharedGeometryDisposals = 0;
  instance.sourceMaterials[0].dispose = () => { sourceMaterialDisposals += 1; };
  instance.geometry.dispose = () => { sharedGeometryDisposals += 1; };
  const presentation = createCharacterPresentation(presentationOptions(instance, {
    record: record({ cue: 'notebook' })
  }));
  const clone = findPresentationMaterials(presentation.group).get('Skin');
  let cloneDisposals = 0;
  clone.dispose = () => { cloneDisposals += 1; };

  presentation.dispose();
  presentation.dispose();

  assert.equal(instance.disposeCount, 1);
  assert.equal(cloneDisposals, 1);
  assert.equal(sourceMaterialDisposals, 0);
  assert.equal(sharedGeometryDisposals, 0);
});

function createSceneLibrary(missingId = null) {
  const instances = new Map();
  return {
    instances,
    createCharacter(id) {
      if (id === missingId) return null;
      const instance = createImportedInstance();
      instances.set(id, instance);
      return instance;
    }
  };
}

function importedSceneDefinition() {
  return {
    ...reedsWetlandDefinition,
    primitives: reedsWetlandDefinition.primitives.filter(({ kind }) => kind === 'person')
  };
}

test('imported character scene building prefers all three named models and drives hotspot actions', () => {
  const modelLibrary = createSceneLibrary();
  const scene = buildScene(importedSceneDefinition(), {
    quality: chooseQuality({ requested: 'low' }),
    modelLibrary
  });

  assert.equal(scene.importedCharacterCount, 3);
  assert.equal(scene.namedCharacterCount, 3);
  assert.deepEqual(scene.characterModelIds, ['chen-yu', 'gu-yan', 'lin-xia']);
  assert.deepEqual([...scene.characterById.keys()].sort(), ['chen-yu', 'gu-yan', 'lin-xia']);
  assert.ok([...scene.characterById.values()].every(
    (character) => character.userData.modelSource === 'imported'
  ));

  scene.update({
    time: 1000,
    delta: 0.016,
    activeHotspotId: 'camera-spot',
    completedHotspotIds: new Set()
  });
  assert.deepEqual(modelLibrary.instances.get('chen-yu').playCalls, ['Idle', 'Interact']);
  assert.deepEqual(modelLibrary.instances.get('gu-yan').playCalls, ['Idle']);
  assert.deepEqual(modelLibrary.instances.get('lin-xia').playCalls, ['Idle']);

  scene.update({
    time: 1016,
    delta: 0.016,
    activeHotspotId: null,
    completedHotspotIds: new Set(['camera-spot'])
  });
  assert.deepEqual(modelLibrary.instances.get('chen-yu').playCalls, ['Idle', 'Interact', 'Idle']);
  scene.dispose();
});

test('imported character scene building falls back per missing model and disposes each instance once', () => {
  const modelLibrary = createSceneLibrary('gu-yan');
  const scene = buildScene(importedSceneDefinition(), {
    quality: chooseQuality({ requested: 'low' }),
    modelLibrary
  });

  assert.equal(scene.importedCharacterCount, 2);
  assert.equal(scene.namedCharacterCount, 3);
  assert.deepEqual(scene.characterModelIds, ['chen-yu', 'lin-xia']);
  assert.equal(scene.characterById.get('gu-yan').userData.modelSource, 'procedural');

  scene.dispose();
  scene.dispose();
  assert.equal(modelLibrary.instances.get('chen-yu').disposeCount, 1);
  assert.equal(modelLibrary.instances.get('lin-xia').disposeCount, 1);
});
