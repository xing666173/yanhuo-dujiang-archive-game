import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modelsDirectory = path.join(root, 'game/assets/models');
const characterIds = ['chen-yu', 'gu-yan', 'lin-xia'];
const environmentIds = ['birch-tree-1', 'birch-tree-3', 'bush-large'];
const allowedAnimations = ['Idle', 'Walk', 'Interact', 'Wave'];
const requiredJoints = ['Hips', 'Head', 'Wrist.L', 'Wrist.R'];
const sourceModels = {
  'chen-yu': 'chen-yu-adventurer.gltf',
  'gu-yan': 'gu-yan-casual-2.gltf',
  'lin-xia': 'lin-xia-casual.gltf',
  'birch-tree-1': 'nature/BirchTree_1.gltf',
  'birch-tree-3': 'nature/BirchTree_3.gltf',
  'bush-large': 'nature/Bush_Large.gltf'
};
const packUrls = [
  'https://quaternius.com/packs/ultimatemodularcharacters.html',
  'https://quaternius.com/packs/ultimatemodularwomen.html',
  'https://quaternius.com/packs/ultimatestylizednature.html'
];

const loadManifest = async () => import(pathToFileURL(path.join(root, 'game/data/model-assets.mjs')).href);

const countTriangles = (document) => document.getRoot().listMeshes().reduce(
  (total, mesh) => total + mesh.listPrimitives().reduce((meshTotal, primitive) => {
    const indices = primitive.getIndices();
    return meshTotal + (indices ? indices.getCount() : primitive.getAttribute('POSITION').getCount()) / 3;
  }, 0),
  0
);

test('model processing publishes every manifest output before inspection', async () => {
  const { MODEL_ASSETS } = await loadManifest();

  for (const record of Object.values(MODEL_ASSETS)) {
    const filePath = path.join(modelsDirectory, `${record.id}.glb`);
    assert.equal(fs.existsSync(filePath), true, `${record.id} output must exist`);
    assert.ok(fs.statSync(filePath).size <= record.maxBytes, `${record.id} must fit its byte budget`);
  }
});

test('model processing preserves the character skeleton, approved clips, and measured triangles', async () => {
  const { NodeIO } = await import('@gltf-transform/core');
  const { MODEL_ASSETS } = await loadManifest();
  const io = new NodeIO();

  for (const id of characterIds) {
    const document = await io.read(path.join(modelsDirectory, `${id}.glb`));
    assert.deepEqual(
      document.getRoot().listAnimations().map((animation) => animation.getName()).sort(),
      [...allowedAnimations].sort()
    );
    assert.deepEqual(
      requiredJoints.filter((joint) => document.getRoot().listNodes().some((node) => node.getName() === joint)),
      requiredJoints,
      `${id} must retain the required named joints`
    );
    assert.equal(countTriangles(document), MODEL_ASSETS[id].triangleCount, `${id} triangle count must match the manifest`);
  }
});

test('model processing emits self-contained environment GLBs with no normal textures', async () => {
  const { NodeIO } = await import('@gltf-transform/core');
  const { MODEL_ASSETS } = await loadManifest();
  const io = new NodeIO();

  for (const id of environmentIds) {
    const document = await io.read(path.join(modelsDirectory, `${id}.glb`));
    assert.deepEqual(document.getRoot().listAnimations(), [], `${id} must not retain animations`);
    assert.equal(countTriangles(document), MODEL_ASSETS[id].triangleCount, `${id} triangle count must match the manifest`);
    for (const material of document.getRoot().listMaterials()) {
      assert.equal(material.getNormalTexture(), null, `${id} must not retain a normal texture`);
    }
  }
});

test('model processing embeds every buffer and texture resource', async () => {
  const { NodeIO } = await import('@gltf-transform/core');
  const { MODEL_ASSETS } = await loadManifest();
  const io = new NodeIO();

  for (const id of Object.keys(MODEL_ASSETS)) {
    const document = await io.read(path.join(modelsDirectory, `${id}.glb`));
    for (const buffer of document.getRoot().listBuffers()) {
      assert.equal(buffer.getURI(), '', `${id} buffer must be embedded`);
    }
    for (const texture of document.getRoot().listTextures()) {
      assert.equal(texture.getURI(), '', `${id} texture must be embedded`);
    }
  }
});

test('model processing outputs fit the character, environment, and total byte ceilings', async () => {
  const sizes = (ids) => ids.reduce(
    (total, id) => total + fs.statSync(path.join(modelsDirectory, `${id}.glb`)).size,
    0
  );
  const characterBytes = sizes(characterIds);
  const environmentBytes = sizes(environmentIds);

  assert.ok(characterBytes <= 4.5 * 1024 * 1024);
  assert.ok(environmentBytes <= 1.5 * 1024 * 1024);
  assert.ok(characterBytes + environmentBytes <= 6 * 1024 * 1024);
});

test('model release attribution records sources, modifications, measurements, and CC0', async () => {
  const { MODEL_ASSETS } = await loadManifest();
  const attribution = fs.readFileSync(path.join(modelsDirectory, 'ATTRIBUTION.md'), 'utf8');
  const license = fs.readFileSync(path.join(modelsDirectory, 'CC0-1.0.txt'), 'utf8');

  assert.match(license, /CC0 1\.0 Universal/u);
  assert.match(license, /https:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0\//u);
  for (const packUrl of packUrls) assert.match(attribution, new RegExp(packUrl.replaceAll('.', '\\.')));
  for (const [id, sourceModel] of Object.entries(sourceModels)) {
    assert.match(attribution, new RegExp(id));
    assert.match(attribution, new RegExp(sourceModel.replace('.', '\\.')));
    assert.match(attribution, new RegExp(String(MODEL_ASSETS[id].triangleCount)));
    assert.match(attribution, new RegExp(String(MODEL_ASSETS[id].maxBytes)));
  }
  assert.match(attribution, /CC0-1\.0/u);
  assert.match(attribution, /CC0 1\.0 Public Domain Dedication/u);
});

test('model processing exits nonzero when an output exceeds maxBytes', () => {
  const output = path.join(modelsDirectory, '.model-processing-over-budget.glb');
  const result = spawnSync(process.execPath, [
    path.join(root, 'tools/process-model-assets.mjs'),
    '--input', 'C:/Users/axezt/AppData/Local/Temp/yanhuo-model-research/chen-yu-adventurer.gltf',
    '--output', output,
    '--kind', 'character',
    '--allowed-animations', allowedAnimations.join(','),
    '--max-bytes', '1'
  ], { encoding: 'utf8' });

  fs.rmSync(output, { force: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exceeds maxBytes/u);
});
