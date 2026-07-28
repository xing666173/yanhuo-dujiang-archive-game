import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseQuality } from '../../game/render/quality.mjs';
import { createResourceStore, createWoodTextures } from '../../game/render/resource-store.mjs';
import { buildScene } from '../../game/render/scene-builder.mjs';
import { createSceneDisposer } from '../../game/render/scene-lifecycle.mjs';

function installCanvasDocument(context) {
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement(name) {
      assert.equal(name, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext(type) {
          assert.equal(type, '2d');
          return {
            fillStyle: '',
            strokeStyle: '',
            globalAlpha: 1,
            lineWidth: 1,
            lineCap: 'butt',
            fillRect() {},
            beginPath() {},
            moveTo() {},
            bezierCurveTo() {},
            lineTo() {},
            stroke() {}
          };
        }
      };
    }
  };
  context.after(() => {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  });
}

function luminance(hexColor) {
  const value = Number.parseInt(hexColor.slice(1), 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function buildWaterScene(context, { reducedMotion = false } = {}) {
  installCanvasDocument(context);
  const builtScene = buildScene({
    id: 'water-motion-contract',
    environment: {
      ambient: '#ffffff',
      ground: '#333333',
      ambientIntensity: 1,
      sun: '#ffffff',
      sunIntensity: 1,
      sunPosition: [2, 4, 3]
    },
    hotspots: [],
    primitives: [{
      kind: 'plane',
      position: [0, 0, 0],
      rotation: [-Math.PI / 2, 0, 0],
      scale: [2, 2, 1],
      color: '#47767a',
      role: 'water',
      transparent: true,
      opacity: 0.96,
      waveAmplitude: 0.055,
      waveSpeed: 0.00072
    }]
  }, {
    quality: chooseQuality({ requested: 'low' }),
    reducedMotion
  });
  context.after(() => builtScene.dispose());

  let water = null;
  builtScene.group.traverse((object) => {
    if (object.userData.role === 'water') water = object;
  });
  assert.ok(water);
  return { builtScene, water };
}

test('resource store preserves cache identity and disposes owned resources once', () => {
  const resources = createResourceStore();
  const counts = { geometry: 0, material: 0, texture: 0 };
  const geometry = resources.geometry('shared-geometry', () => ({
    dispose() {
      counts.geometry += 1;
    }
  }));
  assert.equal(resources.geometry('shared-geometry', () => ({})), geometry);

  const red = resources.material({ color: '#aa0000', role: 'test' });
  const sameRed = resources.material({ color: '#aa0000', role: 'test' });
  const blue = resources.material({ color: '#0000aa', role: 'test' });
  red.dispose = () => {
    counts.material += 1;
  };
  blue.dispose = () => {
    counts.material += 1;
  };
  assert.equal(sameRed, red);
  assert.notEqual(blue, red);

  const texture = resources.texture('shared-texture', () => ({
    dispose() {
      counts.texture += 1;
    }
  }));
  assert.equal(resources.texture('shared-texture', () => ({})), texture);

  resources.dispose();
  resources.dispose();

  assert.deepEqual(counts, { geometry: 1, material: 2, texture: 1 });
});

test('repeated scene disposal releases each owned light shadow exactly once', () => {
  const counts = {
    sunShadow: 0,
    rimShadow: 0,
    nonLightShadow: 0,
    resources: 0,
    remove: 0,
    clear: 0
  };
  const nodes = [
    { isLight: true, shadow: { dispose: () => { counts.sunShadow += 1; } } },
    { isLight: true, shadow: { dispose: () => { counts.rimShadow += 1; } } },
    { isLight: false, shadow: { dispose: () => { counts.nonLightShadow += 1; } } }
  ];
  const group = {
    traverse(callback) {
      for (const node of nodes) callback(node);
    },
    removeFromParent() {
      counts.remove += 1;
    },
    clear() {
      counts.clear += 1;
    }
  };
  const markerById = new Map([['marker', {}]]);
  const animations = [() => {}];
  const dispose = createSceneDisposer({
    group,
    markerById,
    animations,
    disposeResources() {
      counts.resources += 1;
    }
  });

  dispose();
  dispose();

  assert.deepEqual(counts, {
    sunShadow: 1,
    rimShadow: 1,
    nonLightShadow: 0,
    resources: 1,
    remove: 1,
    clear: 1
  });
  assert.equal(markerById.size, 0);
  assert.equal(animations.length, 0);
});

test('wetland water keeps the requested runtime index of refraction', (context) => {
  installCanvasDocument(context);
  const builtScene = buildScene({
    id: 'water-material-contract',
    environment: {
      ambient: '#ffffff',
      ground: '#333333',
      ambientIntensity: 1,
      sun: '#ffffff',
      sunIntensity: 1,
      sunPosition: [2, 4, 3]
    },
    hotspots: [],
    primitives: [{
      kind: 'plane',
      position: [0, 0, 0],
      rotation: [-Math.PI / 2, 0, 0],
      scale: [2, 2, 1],
      color: '#4f6d76',
      role: 'water',
      transparent: true,
      opacity: 0.96
    }]
  }, { quality: chooseQuality({ requested: 'low' }) });
  context.after(() => builtScene.dispose());

  let water = null;
  builtScene.group.traverse((object) => {
    if (object.userData.role === 'water') water = object;
  });

  assert.ok(water?.material.isMeshPhysicalMaterial);
  assert.equal(water.material.ior, 1.333);
  assert.ok(water.material.color.equals(water.material.userData.baseColor));
});

test('wetland reduced motion freezes live water vertices and texture offsets', (context) => {
  const { builtScene, water } = buildWaterScene(context);
  builtScene.update({ time: 1000, delta: 0.016 });
  const movingVertices = Array.from(water.geometry.attributes.position.array);
  const movingOffset = water.material.map.offset.toArray();

  builtScene.setReducedMotion(true);
  builtScene.update({ time: 3000, delta: 2 });

  assert.deepEqual(
    Array.from(water.geometry.attributes.position.array),
    movingVertices
  );
  assert.deepEqual(water.material.map.offset.toArray(), movingOffset);
});

test('wetland water starts frozen and resumes normal motion after reduced motion is disabled', (context) => {
  const { builtScene, water } = buildWaterScene(context, { reducedMotion: true });
  const baseVertices = Array.from(water.geometry.attributes.position.array);
  const baseOffset = water.material.map.offset.toArray();

  builtScene.update({ time: 1000, delta: 0.016 });
  assert.deepEqual(Array.from(water.geometry.attributes.position.array), baseVertices);
  assert.deepEqual(water.material.map.offset.toArray(), baseOffset);

  builtScene.setReducedMotion(false);
  builtScene.update({ time: 1100, delta: 0.016 });
  assert.notDeepEqual(Array.from(water.geometry.attributes.position.array), baseVertices);
  assert.notDeepEqual(water.material.map.offset.toArray(), baseOffset);
});

test('wood texture metadata identifies eight scratches darker than the base color', (context) => {
  installCanvasDocument(context);
  const resources = createResourceStore();
  context.after(() => resources.dispose());

  const { colorMap, roughnessMap } = createWoodTextures(
    resources,
    'weathered-wood-contract',
    ['#817565', '#aa9981', '#554f46', '#baa58a']
  );
  const pattern = colorMap.userData.woodPattern;

  assert.equal(colorMap.image.width, 128);
  assert.equal(colorMap.image.height, 32);
  assert.equal(roughnessMap.image.width, 128);
  assert.equal(roughnessMap.image.height, 32);
  assert.ok(pattern, 'wood color texture must expose verifiable pattern metadata');
  assert.equal(pattern.grainLineCount, 18);
  assert.equal(pattern.scratchCount, 8);
  assert.ok(luminance(pattern.scratchColor) < luminance(pattern.baseColor));
});
