import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
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

const processorPath = path.join(root, 'tools/process-model-assets.mjs');
const publishedCharacterPath = path.join(modelsDirectory, 'chen-yu.glb');

const runProcessor = (argumentsList) => spawnSync(process.execPath, [processorPath, ...argumentsList], {
  encoding: 'utf8'
});

const successResult = (result) => JSON.parse(result.stdout.split(/\r?\n/u).find((line) => line.startsWith('{')));

const createCharacterFixture = async (directory) => {
  const { NodeIO } = await import('@gltf-transform/core');
  const io = new NodeIO();
  const document = await io.read(publishedCharacterPath);
  const root = document.getRoot();
  const buffer = root.listBuffers()[0];
  const animation = document.createAnimation('Run');
  const sampler = document.createAnimationSampler()
    .setInput(document.createAccessor('RunInput').setBuffer(buffer).setType('SCALAR').setArray(new Float32Array([0, 1])))
    .setOutput(document.createAccessor('RunOutput').setBuffer(buffer).setType('VEC3').setArray(new Float32Array([0, 0, 0, 0, 0.1, 0])))
    .setInterpolation('LINEAR');
  animation.addChannel(document.createAnimationChannel()
    .setSampler(sampler)
    .setTargetNode(root.listNodes()[0])
    .setTargetPath('translation'));
  const input = path.join(directory, 'character-with-run.glb');
  await io.write(input, document);
  return input;
};

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
    assert.equal(fs.statSync(filePath).size, record.byteCount, `${record.id} must match its measured byte count`);
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
    assert.match(
      attribution,
      new RegExp('\\| `' + id + '\\.glb`[^\\n]*?\\| ' + MODEL_ASSETS[id].byteCount + ' B;')
    );
    assert.match(attribution, new RegExp(String(MODEL_ASSETS[id].maxBytes)));
  }
  assert.match(attribution, /CC0-1\.0/u);
  assert.match(attribution, /CC0 1\.0 Public Domain Dedication/u);
});

test('model processing rejects an over-budget output without creating or replacing files', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yanhuo-model-processing-'));
  const missingOutput = path.join(directory, 'missing.glb');
  const sentinelOutput = path.join(directory, 'sentinel.glb');

  try {
    const missingResult = runProcessor([
      '--input', publishedCharacterPath,
      '--output', missingOutput,
      '--kind', 'character',
      '--max-bytes', '1'
    ]);
    assert.notEqual(missingResult.status, 0);
    assert.match(missingResult.stderr, /exceeds maxBytes/u);
    assert.equal(fs.existsSync(missingOutput), false);
    assert.doesNotMatch(missingResult.stdout, /^\{/mu);

    fs.writeFileSync(sentinelOutput, 'sentinel');
    const sentinelResult = runProcessor([
      '--input', publishedCharacterPath,
      '--output', sentinelOutput,
      '--kind', 'character',
      '--max-bytes', '1'
    ]);
    assert.notEqual(sentinelResult.status, 0);
    assert.match(sentinelResult.stderr, /exceeds maxBytes/u);
    assert.equal(fs.readFileSync(sentinelOutput, 'utf8'), 'sentinel');
    assert.doesNotMatch(sentinelResult.stdout, /^\{/mu);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('model processing defaults characters to the approved clips and honors an explicit clip list', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yanhuo-model-processing-'));

  try {
    const input = await createCharacterFixture(directory);
    const defaultResult = runProcessor([
      '--input', input,
      '--output', path.join(directory, 'default.glb'),
      '--kind', 'character',
      '--max-bytes', '1700000'
    ]);
    assert.equal(defaultResult.status, 0, defaultResult.stderr);
    assert.deepEqual(successResult(defaultResult).clips.sort(), [...allowedAnimations].sort());

    const explicitResult = runProcessor([
      '--input', input,
      '--output', path.join(directory, 'explicit.glb'),
      '--kind', 'character',
      '--allowed-animations', 'Idle,Run',
      '--max-bytes', '1700000'
    ]);
    assert.equal(explicitResult.status, 0, explicitResult.stderr);
    assert.deepEqual(successResult(explicitResult).clips.sort(), ['Idle', 'Run']);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('model processing rejects a missing requested clip without writing an output', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yanhuo-model-processing-'));
  const output = path.join(directory, 'missing-clip.glb');

  try {
    const result = runProcessor([
      '--input', publishedCharacterPath,
      '--output', output,
      '--kind', 'character',
      '--allowed-animations', 'Idle,Missing',
      '--max-bytes', '1700000'
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing/u);
    assert.equal(fs.existsSync(output), false);
    assert.doesNotMatch(result.stdout, /^\{/mu);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
