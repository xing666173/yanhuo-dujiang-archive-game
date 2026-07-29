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
  wrists = ['Wrist.L', 'Wrist.R'],
  includeGeometry = true,
  materialArray = false,
  rootPosition = [0, 0, 0],
  rootScale = [1, 1, 1]
} = {}) {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(0.5, 2, 0.4);
  geometry.translate(0, 1, 0);
  const sourceMaterials = materialNames.map((name) => {
    const material = new THREE.MeshStandardMaterial({ color: '#777777' });
    material.name = name;
    return material;
  });
  if (includeGeometry && materialArray && sourceMaterials.length > 0) {
    group.add(new THREE.Mesh(geometry, sourceMaterials));
  } else if (includeGeometry) {
    for (const [index, material] of sourceMaterials.entries()) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.x = index * 0.02;
      group.add(mesh);
    }
  }
  for (const name of wrists) {
    const wrist = new THREE.Bone();
    wrist.name = name;
    wrist.position.set(name.endsWith('R') ? -0.25 : 0.25, 1.25, 0);
    group.add(wrist);
  }
  group.position.set(...rootPosition);
  group.scale.set(...rootScale);

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

test('character presentation preserves imported root transforms while normalizing measured height and feet', () => {
  const instance = createImportedInstance({
    rootPosition: [0.35, 0.4, -0.2],
    rootScale: [1.25, 2, 0.75]
  });
  const originalPosition = instance.group.position.clone();
  const originalScale = instance.group.scale.clone();
  const presentation = createCharacterPresentation(presentationOptions(instance));
  presentation.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(presentation.group);

  assert.ok(Math.abs(bounds.min.y - 0.26) < 1e-6);
  assert.ok(Math.abs(bounds.max.y - bounds.min.y - 1.7) < 1e-6);
  assert.deepEqual(instance.group.position.toArray(), originalPosition.toArray());
  assert.deepEqual(instance.group.scale.toArray(), originalScale.toArray());
  assert.deepEqual(presentation.group.position.toArray(), [2, 0.26, -3]);
  assert.deepEqual(presentation.group.rotation.toArray().slice(0, 3), [0, 0.7, 0]);
  assert.equal(presentation.group.userData.role, 'person');
  assert.equal(presentation.group.userData.characterId, 'chen-yu');
  assert.equal(presentation.group.userData.modelSource, 'imported');
  presentation.dispose();
});

test('character presentation can reserve animation-safe ground clearance', () => {
  const instance = createImportedInstance();
  const presentation = createCharacterPresentation(presentationOptions(instance, {
    record: record({ groundClearance: 0.002 })
  }));
  presentation.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(presentation.group);

  assert.ok(Math.abs(bounds.min.y - 0.262) < 1e-6);
  assert.ok(Math.abs(bounds.max.y - bounds.min.y - 1.7) < 1e-6);
  presentation.dispose();
});

test('character presentation keeps Chen Yu material roles distinct and preserves unknown source colors', () => {
  const instance = createImportedInstance({
    materialNames: [
      'Skin',
      'Hair',
      'Green',
      'Grey',
      'Brown',
      'Gold',
      'LightGreen',
      'Unknown'
    ]
  });
  const unknownSourceColor = instance.sourceMaterials.at(-1).color.clone();
  const presentation = createCharacterPresentation(presentationOptions(instance));
  const materials = findPresentationMaterials(presentation.group);

  assert.equal(materials.get('Skin').userData.presentationRole, 'skin');
  assert.equal(materials.get('Hair').userData.presentationRole, 'hair');
  assert.equal(materials.get('Green').userData.presentationRole, 'clothing');
  assert.equal(materials.get('Grey').userData.presentationRole, 'trousers');
  assert.equal(materials.get('Brown').userData.presentationRole, 'backpack');
  assert.equal(materials.get('Gold').userData.presentationRole, 'accent');
  assert.equal(materials.get('LightGreen').userData.presentationRole, 'accent');
  assert.equal(materials.get('Unknown').userData.presentationRole, 'source');
  assert.equal(materials.get('Unknown').color.getHex(), unknownSourceColor.getHex());
  for (const [index, material] of [...materials.values()].entries()) {
    assert.notEqual(material, instance.sourceMaterials[index]);
    assert.ok(material.roughness >= 0.78);
    assert.equal(material.metalness, 0);
    assert.ok(material.userData.baseColor?.isColor);
    assert.ok(material.userData.baseEmissive?.isColor);
  }
  presentation.dispose();
});

test('character presentation maps Gu Yan and Lin Xia shirt and trouser materials separately', () => {
  const cases = [
    {
      characterId: 'gu-yan',
      materialNames: ['LightBrown', 'White', 'LightBlue'],
      expectedRoles: ['clothing', 'shirt', 'trousers']
    },
    {
      characterId: 'lin-xia',
      materialNames: ['Grey', 'White', 'Orange'],
      expectedRoles: ['clothing', 'shirt', 'accent']
    }
  ];

  for (const { characterId, materialNames, expectedRoles } of cases) {
    const instance = createImportedInstance({ materialNames });
    const presentation = createCharacterPresentation(presentationOptions(instance, {
      record: record({ characterId }),
      appearance: characterVisuals[characterId]
    }));
    const materials = findPresentationMaterials(presentation.group);
    assert.deepEqual(
      materialNames.map((name) => materials.get(name).userData.presentationRole),
      expectedRoles
    );
    presentation.dispose();
  }
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

test('character presentation attaches exactly one prop to the imported root when wrists are absent', () => {
  const instance = createImportedInstance({ wrists: [] });
  const presentation = createCharacterPresentation(presentationOptions(instance, {
    record: record({ cue: 'voice-recorder' })
  }));
  const props = findProps(presentation.group);

  assert.equal(props.length, 1);
  assert.equal(props[0].parent, instance.group);
  presentation.dispose();
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

test('character presentation applies reduced motion live without blocking action changes', () => {
  const instance = createImportedInstance();
  const presentation = createCharacterPresentation(presentationOptions(instance, {
    reducedMotion: false
  }));
  const driftRoot = presentation.group.children[0];

  presentation.update({ delta: 0.1, time: 1000, action: 'Idle' });
  assert.notEqual(driftRoot.rotation.z, 0);

  presentation.setReducedMotion(true);
  presentation.update({ delta: 0.1, time: 1100, action: 'Idle' });
  assert.equal(driftRoot.rotation.z, 0);
  presentation.update({ delta: 0.1, time: 1200, action: 'Interact' });

  assert.equal(presentation.action, 'Interact');
  assert.deepEqual(instance.playCalls, ['Idle', 'Interact']);
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

test('character presentation clones and disposes each array material once without shared resource disposal', () => {
  const instance = createImportedInstance({
    materialNames: ['Skin', 'Hair'],
    materialArray: true
  });
  const sourceTexture = new THREE.Texture();
  instance.sourceMaterials[0].map = sourceTexture;
  const sourceDisposals = [0, 0];
  let geometryDisposals = 0;
  let textureDisposals = 0;
  instance.sourceMaterials.forEach((material, index) => {
    material.dispose = () => { sourceDisposals[index] += 1; };
  });
  instance.geometry.dispose = () => { geometryDisposals += 1; };
  sourceTexture.dispose = () => { textureDisposals += 1; };

  const presentation = createCharacterPresentation(presentationOptions(instance));
  const mesh = instance.group.children.find((child) => child.isMesh);
  assert.ok(Array.isArray(mesh.material));
  const cloneDisposals = mesh.material.map(() => 0);
  mesh.material.forEach((material, index) => {
    assert.notEqual(material, instance.sourceMaterials[index]);
    material.dispose = () => { cloneDisposals[index] += 1; };
  });

  presentation.dispose();
  presentation.dispose();

  assert.deepEqual(cloneDisposals, [1, 1]);
  assert.deepEqual(sourceDisposals, [0, 0]);
  assert.equal(geometryDisposals, 0);
  assert.equal(textureDisposals, 0);
});

function createSceneLibrary({ missingId = null, emptyId = null } = {}) {
  const instances = new Map();
  return {
    instances,
    createCharacter(id) {
      if (id === missingId) return null;
      const instance = createImportedInstance({
        includeGeometry: id !== emptyId
      });
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

test('imported NPC scene building prefers both visible teammates and drives hotspot actions', () => {
  const modelLibrary = createSceneLibrary();
  const scene = buildScene(importedSceneDefinition(), {
    quality: chooseQuality({ requested: 'low' }),
    modelLibrary
  });

  assert.equal(scene.importedCharacterCount, 2);
  assert.equal(scene.namedCharacterCount, 2);
  assert.deepEqual(scene.characterModelIds, ['gu-yan', 'lin-xia']);
  assert.deepEqual([...scene.characterById.keys()].sort(), ['gu-yan', 'lin-xia']);
  assert.ok([...scene.characterById.values()].every(
    (character) => character.userData.modelSource === 'imported'
  ));

  scene.update({
    time: 1000,
    delta: 0.016,
    activeHotspotId: 'notes-spot',
    completedHotspotIds: new Set()
  });
  assert.deepEqual(modelLibrary.instances.get('gu-yan').playCalls, ['Idle', 'Interact']);
  assert.deepEqual(modelLibrary.instances.get('lin-xia').playCalls, ['Idle']);

  scene.update({
    time: 1016,
    delta: 0.016,
    activeHotspotId: null,
    completedHotspotIds: new Set(['notes-spot'])
  });
  assert.deepEqual(modelLibrary.instances.get('gu-yan').playCalls, ['Idle', 'Interact', 'Idle']);
  scene.dispose();
});

test('imported character scene building falls back per missing model and disposes each instance once', () => {
  const modelLibrary = createSceneLibrary({ missingId: 'gu-yan' });
  const scene = buildScene(importedSceneDefinition(), {
    quality: chooseQuality({ requested: 'low' }),
    modelLibrary
  });

  assert.equal(scene.importedCharacterCount, 1);
  assert.equal(scene.namedCharacterCount, 2);
  assert.deepEqual(scene.characterModelIds, ['lin-xia']);
  assert.equal(scene.characterById.get('gu-yan').userData.modelSource, 'procedural');

  scene.dispose();
  scene.dispose();
  assert.equal(modelLibrary.instances.get('lin-xia').disposeCount, 1);
});

test('imported character scene building falls back when measured source bounds are empty', () => {
  const modelLibrary = createSceneLibrary({ emptyId: 'gu-yan' });
  const scene = buildScene(importedSceneDefinition(), {
    quality: chooseQuality({ requested: 'low' }),
    modelLibrary
  });

  assert.equal(scene.importedCharacterCount, 1);
  assert.equal(scene.namedCharacterCount, 2);
  assert.deepEqual(scene.characterModelIds, ['lin-xia']);
  assert.equal(scene.characterById.get('gu-yan').userData.modelSource, 'procedural');
  assert.equal(modelLibrary.instances.get('gu-yan').disposeCount, 1);
  scene.dispose();
});

test('scene forwards live reduced motion to imported presentations without rebuilding them', () => {
  const modelLibrary = createSceneLibrary();
  const scene = buildScene(importedSceneDefinition(), {
    quality: chooseQuality({ requested: 'low' }),
    modelLibrary,
    reducedMotion: false
  });
  const instances = [...scene.characterInstances];

  scene.update({ time: 1000, delta: 0.016 });
  assert.ok(instances.some(({ group }) => group.children[0].rotation.z !== 0));
  scene.setReducedMotion(true);
  scene.update({
    time: 1016,
    delta: 0.016,
    activeHotspotId: 'notes-spot',
    completedHotspotIds: new Set()
  });

  assert.deepEqual(scene.characterInstances, instances);
  assert.ok(instances.every(({ group }) => group.children[0].rotation.z === 0));
  assert.equal(instances.find(
    ({ group }) => group.userData.characterId === 'gu-yan'
  ).action, 'Interact');
  scene.dispose();
});
