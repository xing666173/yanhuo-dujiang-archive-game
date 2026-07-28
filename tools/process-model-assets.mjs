import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, resample, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const OPTION_NAMES = new Set(['input', 'output', 'kind', 'allowed-animations', 'max-bytes']);

const parseOptions = (argumentsList) => {
  const options = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const option = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!option?.startsWith('--') || value === undefined || !OPTION_NAMES.has(option.slice(2))) {
      throw new Error('Usage: --input <path> --output <path> --kind <character|environment> [--allowed-animations <comma-list>] --max-bytes <integer>');
    }
    options[option.slice(2)] = value;
  }
  return options;
};

const countTriangles = (document) => document.getRoot().listMeshes().reduce(
  (total, mesh) => total + mesh.listPrimitives().reduce((meshTotal, primitive) => {
    const indices = primitive.getIndices();
    const position = primitive.getAttribute('POSITION');
    return meshTotal + (indices ? indices.getCount() : position.getCount()) / 3;
  }, 0),
  0
);

const listClipNames = (document) => document.getRoot().listAnimations().map((animation) => animation.getName());

const parseMaxBytes = (value) => {
  const maxBytes = Number(value);
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('--max-bytes must be a positive integer');
  }
  return maxBytes;
};

const processModel = async (options) => {
  const { input, output, kind } = options;
  if (!input || !output || !kind || !options['max-bytes']) {
    throw new Error('Missing required --input, --output, --kind, or --max-bytes option');
  }
  if (!['character', 'environment'].includes(kind)) {
    throw new Error('--kind must be character or environment');
  }

  const maxBytes = parseMaxBytes(options['max-bytes']);
  const allowedAnimations = options['allowed-animations']
    ? options['allowed-animations'].split(',').map((name) => name.trim()).filter(Boolean)
    : null;
  const io = new NodeIO();
  const document = await io.read(input);
  const root = document.getRoot();

  if (kind === 'character') {
    if (allowedAnimations) {
      for (const animation of root.listAnimations()) {
        if (!allowedAnimations.includes(animation.getName())) animation.dispose();
      }
    }
    await document.transform(resample(), dedup(), prune());
  } else {
    for (const animation of root.listAnimations()) animation.dispose();
    for (const material of root.listMaterials()) material.setNormalTexture(null);
    await document.transform(
      prune(),
      dedup(),
      textureCompress({ encoder: sharp, resize: [512, 512], quality: 82 }),
      prune()
    );
  }

  await fs.mkdir(path.dirname(output), { recursive: true });
  await io.write(output, document);

  const bytes = (await fs.stat(output)).size;
  const triangles = countTriangles(document);
  const clips = listClipNames(document);
  const result = { output, bytes, triangles, clips };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (bytes > maxBytes) {
    throw new Error(`Output ${output} is ${bytes} bytes and exceeds maxBytes ${maxBytes}`);
  }
  return result;
};

try {
  await processModel(parseOptions(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
