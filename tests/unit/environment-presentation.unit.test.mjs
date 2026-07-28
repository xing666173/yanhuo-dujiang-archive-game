import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../../game/vendor/three.module.min.js';
import { createEnvironmentPresentation } from '../../game/render/environment-presentation.mjs';
import { buildScene } from '../../game/render/scene-builder.mjs';
import { chooseQuality } from '../../game/render/quality.mjs';
import { reedsWetlandDefinition } from '../../game/scenes/reeds-wetland.mjs';

function createImportedEnvironment({
  meshCount = 1,
  includeGeometry = true,
  rootPosition = [0, 0, 0],
  rootScale = [1, 1, 1],
  color = '#4f8f43'
} = {}) {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 2, 1);
  geometry.translate(0, 1, 0);
  const sourceMaterials = [];

  if (includeGeometry) {
    for (let index = 0; index < meshCount; index += 1) {
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: '#102010',
        roughness: 0.3,
        metalness: 0.6
      });
      material.name = `nature-${index}`;
      sourceMaterials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.x = index * 0.1;
      group.add(mesh);
    }
  }

  group.position.set(...rootPosition);
  group.scale.set(...rootScale);
  let disposeCount = 0;
  return {
    group,
    geometry,
    sourceMaterials,
    update() {},
    setQuality() {},
    dispose() {
      disposeCount += 1;
    },
    get disposeCount() {
      return disposeCount;
    }
  };
}

function placement(overrides = {}) {
  return {
    id: 'bank-birch-a',
    modelId: 'birch-tree-1',
    position: [-5.2, 0.05, -4.8],
    rotation: [0, 0.35, 0],
    height: 3.8,
    index: 0,
    ...overrides
  };
}

function options(instance, overrides = {}) {
  return {
    instance,
    placement: placement(),
    quality: chooseQuality({ requested: 'high' }),
    reducedMotion: false,
    ...overrides
  };
}

function presentationMaterials(group) {
  const materials = [];
  group.traverse((object) => {
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material?.userData.environmentPresentation) materials.push(material);
    }
  });
  return materials;
}

test('environment presentation preserves source transforms while aligning measured height and roots', () => {
  const instance = createImportedEnvironment({
    rootPosition: [0.3, 0.45, -0.2],
    rootScale: [1.2, 1.7, 0.8]
  });
  const sourcePosition = instance.group.position.clone();
  const sourceScale = instance.group.scale.clone();
  const presentation = createEnvironmentPresentation(options(instance));
  presentation.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(presentation.group);

  assert.ok(Math.abs(bounds.min.y - 0.05) < 1e-6);
  assert.ok(Math.abs(bounds.max.y - bounds.min.y - 3.8) < 1e-6);
  assert.deepEqual(instance.group.position.toArray(), sourcePosition.toArray());
  assert.deepEqual(instance.group.scale.toArray(), sourceScale.toArray());
  assert.deepEqual(presentation.group.position.toArray(), [-5.2, 0.05, -4.8]);
  assert.deepEqual(presentation.group.rotation.toArray().slice(0, 3), [0, 0.35, 0]);
  assert.equal(presentation.group.userData.role, 'environment-model');
  assert.equal(presentation.group.userData.modelId, 'birch-tree-1');
  assert.equal(presentation.group.userData.modelSource, 'imported');
  presentation.dispose();
});

test('environment presentation clones wetland-tuned materials and reports actual render cost', () => {
  const instance = createImportedEnvironment({ meshCount: 2 });
  const sourceHsl = {};
  instance.sourceMaterials[0].color.getHSL(sourceHsl);
  const presentation = createEnvironmentPresentation(options(instance));
  const materials = presentationMaterials(presentation.group);

  assert.equal(materials.length, 2);
  assert.equal(presentation.drawCalls, 2);
  assert.equal(presentation.triangleCount, 24);
  for (const [index, material] of materials.entries()) {
    const resultHsl = {};
    material.color.getHSL(resultHsl);
    assert.notEqual(material, instance.sourceMaterials[index]);
    assert.ok(material.roughness >= 0.84);
    assert.equal(material.metalness, 0);
    assert.ok(resultHsl.s / sourceHsl.s >= 0.72 - 1e-6);
    assert.ok(resultHsl.s / sourceHsl.s <= 0.82 + 1e-6);
    assert.ok(material.userData.baseColor?.isColor);
    assert.ok(material.userData.baseEmissive?.isColor);
    assert.notEqual(material.userData.baseColor, material.color);
    assert.notEqual(material.userData.baseEmissive, material.emissive);
  }
  presentation.dispose();
});

test('environment presentation sway is deterministic, bounded, and disabled live', () => {
  const first = createEnvironmentPresentation(options(createImportedEnvironment()));
  const matching = createEnvironmentPresentation(options(createImportedEnvironment()));
  const bush = createEnvironmentPresentation(options(createImportedEnvironment(), {
    placement: placement({
      id: 'bank-bush-a',
      modelId: 'bush-large',
      height: 1,
      index: 4
    })
  }));

  first.update({ time: 1250, delta: 0.016 });
  matching.update({ time: 1250, delta: 0.016 });
  bush.update({ time: 1250, delta: 0.016 });

  assert.notEqual(first.group.children[0].rotation.z, 0);
  assert.equal(first.group.children[0].rotation.z, matching.group.children[0].rotation.z);
  assert.ok(Math.abs(first.group.children[0].rotation.z) <= 0.008);
  assert.ok(Math.abs(bush.group.children[0].rotation.z) <= 0.012);

  first.setReducedMotion(true);
  assert.equal(first.group.children[0].rotation.z, 0);
  first.setReducedMotion(false);
  first.setQuality(chooseQuality({ requested: 'low' }));
  assert.equal(first.group.children[0].rotation.z, 0);
  first.update({ time: 1350, delta: 0.016 });
  assert.equal(first.group.children[0].rotation.z, 0);

  first.dispose();
  matching.dispose();
  bush.dispose();
});

test('environment presentation rejects invalid bounds and owns only cloned materials and its instance', () => {
  const invalid = createImportedEnvironment({ includeGeometry: false });
  assert.throws(
    () => createEnvironmentPresentation(options(invalid)),
    /invalid bounds/
  );

  const instance = createImportedEnvironment();
  const sourceTexture = new THREE.Texture();
  instance.sourceMaterials[0].map = sourceTexture;
  let sourceMaterialDisposals = 0;
  let geometryDisposals = 0;
  let textureDisposals = 0;
  instance.sourceMaterials[0].dispose = () => { sourceMaterialDisposals += 1; };
  instance.geometry.dispose = () => { geometryDisposals += 1; };
  sourceTexture.dispose = () => { textureDisposals += 1; };
  const presentation = createEnvironmentPresentation(options(instance));
  const clone = presentationMaterials(presentation.group)[0];
  let cloneDisposals = 0;
  clone.dispose = () => { cloneDisposals += 1; };

  presentation.dispose();
  presentation.dispose();

  assert.equal(instance.disposeCount, 1);
  assert.equal(cloneDisposals, 1);
  assert.equal(sourceMaterialDisposals, 0);
  assert.equal(geometryDisposals, 0);
  assert.equal(textureDisposals, 0);
});

function createSceneLibrary({ missingId = null, emptyId = null } = {}) {
  const environmentInstances = [];
  return {
    environmentInstances,
    createCharacter() {
      return null;
    },
    createEnvironment(id) {
      if (id === missingId) return null;
      const instance = createImportedEnvironment({
        includeGeometry: id !== emptyId
      });
      environmentInstances.push({ id, instance });
      return instance;
    }
  };
}

function environmentOnlyDefinition() {
  return {
    ...reedsWetlandDefinition,
    primitives: [],
    hotspots: []
  };
}

test('nature composition uses deterministic high and low selections within the imported draw budget', () => {
  const definition = environmentOnlyDefinition();
  const high = buildScene(definition, {
    quality: chooseQuality({ requested: 'high' }),
    modelLibrary: createSceneLibrary()
  });
  const low = buildScene(definition, {
    quality: chooseQuality({ requested: 'low' }),
    modelLibrary: createSceneLibrary()
  });

  assert.equal(high.importedEnvironmentCount, 8);
  assert.ok(high.importedEnvironmentDrawCalls <= 18);
  assert.deepEqual(high.environmentModelIds, [
    'birch-tree-1',
    'birch-tree-1',
    'birch-tree-3',
    'birch-tree-3',
    'bush-large',
    'bush-large',
    'bush-large',
    'bush-large'
  ]);
  assert.equal(low.importedEnvironmentCount, 2);
  assert.ok(low.importedEnvironmentCount < high.importedEnvironmentCount);
  assert.deepEqual(low.environmentModelIds, ['birch-tree-1', 'birch-tree-3']);
  assert.ok(low.environmentModelIds.every((id) => id !== 'bush-large'));
  assert.equal(high.importedEnvironmentTriangles, 8 * 12);
  assert.equal(low.importedEnvironmentTriangles, 2 * 12);

  high.dispose();
  low.dispose();
});

test('nature composition skips one missing or invalid environment instance without aborting the scene', () => {
  const missing = buildScene(environmentOnlyDefinition(), {
    quality: chooseQuality({ requested: 'high' }),
    modelLibrary: createSceneLibrary({ missingId: 'birch-tree-3' })
  });
  const invalid = buildScene(environmentOnlyDefinition(), {
    quality: chooseQuality({ requested: 'low' }),
    modelLibrary: createSceneLibrary({ emptyId: 'birch-tree-3' })
  });

  assert.equal(missing.importedEnvironmentCount, 6);
  assert.ok(missing.environmentModelIds.every((id) => id !== 'birch-tree-3'));
  assert.equal(invalid.importedEnvironmentCount, 1);
  assert.deepEqual(invalid.environmentModelIds, ['birch-tree-1']);
  assert.equal(invalid.group.name, 'reeds-wetland');

  missing.dispose();
  invalid.dispose();
});
