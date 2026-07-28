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

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function waitForAsyncWork() {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

test('progress observer errors never change delayed loader outcomes or completion order', async () => {
  const records = [createRecord('tree', 'environment'), createRecord('guide', 'character'), createRecord('missing', 'environment')];
  const tree = createSource('tree');
  const guide = createSource('guide', [new THREE.AnimationClip('Idle', -1, [])]);
  const pending = new Map(records.map((record) => [record.url, createDeferred()]));
  const loaderError = new Error('real loader failure');
  const progress = [];
  const libraryPromise = loadModelLibrary({
    assetRecords: records,
    loader: { loadAsync(url) { return pending.get(url).promise; } },
    onProgress(value) {
      progress.push(value);
      throw new Error(`observer failure for ${value.id}`);
    }
  });
  let completed = false;
  libraryPromise.then(() => { completed = true; });

  await waitForAsyncWork();
  pending.get(records[2].url).reject(loaderError);
  await waitForAsyncWork();
  assert.equal(completed, false, 'allSettled must wait for every delayed record');
  pending.get(records[0].url).resolve(tree);
  await waitForAsyncWork();
  assert.equal(completed, false, 'a remaining delayed source must keep the library pending');
  pending.get(records[1].url).resolve(guide);
  const library = await libraryPromise;

  assert.equal(library.has('tree'), true);
  assert.equal(library.has('guide'), true);
  assert.equal(library.failures.get('missing'), loaderError);
  assert.deepEqual(progress.map(({ id, status, settled, total }) => ({ id, status, settled, total })), [
    { id: 'missing', status: 'rejected', settled: 1, total: 3 },
    { id: 'tree', status: 'fulfilled', settled: 2, total: 3 },
    { id: 'guide', status: 'fulfilled', settled: 3, total: 3 }
  ]);
  assert.deepEqual(library.progressErrors.map((error) => error.message), [
    'observer failure for missing',
    'observer failure for tree',
    'observer failure for guide'
  ]);
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

test('character instances use the supplied skeleton clone and switch actions through object updates', async () => {
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
  const idle = character.mixer.clipAction(source.animations[0]);
  const wave = character.mixer.clipAction(source.animations[1]);
  const calls = { idle: { reset: 0, play: 0, stop: 0 }, wave: { reset: 0, play: 0, stop: 0 } };
  for (const [name, action] of Object.entries({ idle, wave })) {
    for (const method of ['reset', 'play', 'stop']) {
      const original = action[method].bind(action);
      action[method] = () => {
        calls[name][method] += 1;
        return original();
      };
    }
  }

  character.update({ delta: 0.25, action: 'Wave' });
  assert.equal(character.mixer.time, 0.25);
  character.update({ delta: 0.25, action: 'Idle' });
  assert.equal(character.mixer.time, 0.5);
  character.play('Idle');
  character.play('not-a-clip');

  assert.deepEqual(calls, {
    idle: { reset: 1, play: 1, stop: 0 },
    wave: { reset: 2, play: 1, stop: 1 }
  });
  assert.equal(character.group.children[0].geometry, source.geometry);
  library.dispose();
});

test('characters without clips return null for every action request', async () => {
  const source = createSource('silent-guide');
  const record = createRecord('silent-guide', 'character');
  const library = await loadModelLibrary({
    assetRecords: [record],
    loader: createLoader(new Map([[record.url, source]])),
    skeletonClone: (root) => root.clone(true)
  });

  assert.equal(library.createCharacter('silent-guide').play('Idle'), null);
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
  instance.play('Idle');
  const timeAtDispose = instance.mixer.time;

  instance.dispose();
  assert.equal(instance.play('Idle'), null);
  instance.update({ delta: 0.25, action: 'Idle' });
  instance.dispose();

  assert.deepEqual({ stopAllAction, uncacheRoot }, { stopAllAction: 1, uncacheRoot: 1 });
  assert.equal(instance.mixer.time, timeAtDispose, 'disposed instances must not advance their mixer');
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

test('library disposal finds unique textures in material arrays and nested uniforms', async () => {
  const source = createSource('textured');
  const map = new THREE.Texture();
  const normalMap = new THREE.Texture();
  const uniformMap = new THREE.Texture();
  const firstMaterial = new THREE.MeshBasicMaterial({ map });
  firstMaterial.normalMap = normalMap;
  const secondMaterial = new THREE.MeshBasicMaterial();
  secondMaterial.uniforms = { nested: { value: { textures: [uniformMap, map] } } };
  source.scene.children[0].material = [firstMaterial, secondMaterial];
  const counts = {
    geometry: countDisposals(source.geometry),
    firstMaterial: countDisposals(firstMaterial),
    secondMaterial: countDisposals(secondMaterial),
    map: countDisposals(map),
    normalMap: countDisposals(normalMap),
    uniformMap: countDisposals(uniformMap)
  };
  const record = createRecord('textured', 'environment');
  const library = await loadModelLibrary({
    assetRecords: [record],
    loader: createLoader(new Map([[record.url, source]]))
  });

  library.dispose();
  library.dispose();

  assert.deepEqual(Object.fromEntries(Object.entries(counts).map(([key, getCount]) => [key, getCount()])), {
    geometry: 1,
    firstMaterial: 1,
    secondMaterial: 1,
    map: 1,
    normalMap: 1,
    uniformMap: 1
  });
});
