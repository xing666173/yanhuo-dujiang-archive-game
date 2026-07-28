import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../../game/vendor/three.module.min.js';
import { loadModelLibrary } from '../../game/render/model-library.mjs';

function createRecord(id, kind) {
  return { id, kind, url: `./assets/models/${id}.glb` };
}

function createSource(name, clips = []) {
  const texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  material.uniforms = { detailMap: { value: texture } };
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const scene = new THREE.Group();
  scene.name = name;
  scene.add(new THREE.Mesh(geometry, material));
  return { scene, animations: clips, geometry, material, texture };
}

function createLoader(entries) {
  const calls = [];
  return {
    calls,
    async loadAsync(url) {
      calls.push(url);
      const entry = entries.get(url);
      if (entry instanceof Error) throw entry;
      return entry;
    }
  };
}

function countDisposals(resource) {
  let count = 0;
  resource.dispose = () => { count += 1; };
  return () => count;
}

test('model library settles every record, reports progress, and keeps successful assets usable', async () => {
  const tree = createSource('tree');
  const guide = createSource('guide', [new THREE.AnimationClip('Idle', -1, [])]);
  const records = [createRecord('tree', 'environment'), createRecord('guide', 'character'), createRecord('missing', 'environment')];
  const loader = createLoader(new Map([
    [records[0].url, tree],
    [records[1].url, guide],
    [records[2].url, new Error('missing model')]
  ]));
  const progress = [];

  const library = await loadModelLibrary({ assetRecords: records, loader, onProgress: (value) => progress.push(value) });

  assert.deepEqual(loader.calls, records.map((record) => record.url));
  assert.deepEqual(library.loadedIds.sort(), ['guide', 'tree']);
  assert.equal(library.has('tree'), true);
  assert.equal(library.has('missing'), false);
  assert.equal(library.failures.get('missing').message, 'missing model');
  assert.deepEqual(progress.map(({ id, status, settled, total }) => ({ id, status, settled, total })), [
    { id: 'tree', status: 'fulfilled', settled: 1, total: 3 },
    { id: 'guide', status: 'fulfilled', settled: 2, total: 3 },
    { id: 'missing', status: 'rejected', settled: 3, total: 3 }
  ]);
  assert.ok(library.createEnvironment('tree'));
  assert.ok(library.createCharacter('guide'));
  assert.equal(library.createEnvironment('missing'), null);
  library.dispose();
});

test('environment instances isolate their groups while retaining shared source render resources', async () => {
  const source = createSource('tree');
  const record = createRecord('tree', 'environment');
  const library = await loadModelLibrary({
    assetRecords: [record],
    loader: createLoader(new Map([[record.url, source]]))
  });

  const first = library.createEnvironment('tree');
  const second = library.createEnvironment('tree');
  const firstMesh = first.group.children[0];
  const secondMesh = second.group.children[0];
  first.group.position.x = 12;

  assert.notEqual(first.group, second.group);
  assert.equal(second.group.position.x, 0);
  assert.equal(firstMesh.geometry, secondMesh.geometry);
  assert.equal(firstMesh.material, secondMesh.material);
  library.dispose();
});

test('character instances use the supplied skeleton clone and animate requested actions', async () => {
  const source = createSource('guide', [
    new THREE.AnimationClip('Idle', -1, []),
    new THREE.AnimationClip('Wave', -1, [])
  ]);
  const record = createRecord('guide', 'character');
  const loader = createLoader(new Map([[record.url, source]]));
  const clonedRoots = [];
  const library = await loadModelLibrary({
    assetRecords: [record],
    loader,
    skeletonClone(root) {
      clonedRoots.push(root);
      return root.clone(true);
    }
  });
  const character = library.createCharacter('guide');

  assert.deepEqual(clonedRoots, [source.scene]);
  const wave = character.play('Wave');
  assert.equal(character.play('Wave'), wave);
  assert.equal(character.play('not-a-clip'), character.play('Idle'));
  character.update(0.25);
  assert.equal(character.group.children[0].geometry, source.geometry);
  library.dispose();
});

test('instance disposal releases only its mixer and never shared render resources', async () => {
  const source = createSource('guide', [new THREE.AnimationClip('Idle', -1, [])]);
  const record = createRecord('guide', 'character');
  const geometryDisposals = countDisposals(source.geometry);
  const materialDisposals = countDisposals(source.material);
  const textureDisposals = countDisposals(source.texture);
  const library = await loadModelLibrary({
    assetRecords: [record],
    loader: createLoader(new Map([[record.url, source]])),
    skeletonClone: (root) => root.clone(true)
  });
  const instance = library.createCharacter('guide');
  let stopAllAction = 0;
  let uncacheRoot = 0;
  instance.mixer.stopAllAction = () => { stopAllAction += 1; };
  instance.mixer.uncacheRoot = () => { uncacheRoot += 1; };

  instance.dispose();
  instance.dispose();

  assert.deepEqual({ stopAllAction, uncacheRoot }, { stopAllAction: 1, uncacheRoot: 1 });
  assert.deepEqual({ geometry: geometryDisposals(), material: materialDisposals(), texture: textureDisposals() }, { geometry: 0, material: 0, texture: 0 });
  library.dispose();
});

test('library disposal owns each unique source resource exactly once and is idempotent', async () => {
  const first = createSource('first');
  const second = createSource('second');
  second.scene.children[0].geometry = first.geometry;
  second.scene.children[0].material = first.material;
  const counts = {
    geometry: countDisposals(first.geometry),
    material: countDisposals(first.material),
    texture: countDisposals(first.texture)
  };
  const records = [createRecord('first', 'environment'), createRecord('second', 'environment')];
  const library = await loadModelLibrary({
    assetRecords: records,
    loader: createLoader(new Map([[records[0].url, first], [records[1].url, second]]))
  });

  library.createEnvironment('first');
  library.dispose();
  library.dispose();

  assert.deepEqual(Object.fromEntries(Object.entries(counts).map(([key, getCount]) => [key, getCount()])), {
    geometry: 1,
    material: 1,
    texture: 1
  });
  assert.equal(library.createEnvironment('first'), null);
});
