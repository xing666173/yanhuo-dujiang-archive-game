import assert from 'node:assert/strict';
import test from 'node:test';
import { createResourceStore } from '../../game/render/resource-store.mjs';
import { createSceneDisposer } from '../../game/render/scene-lifecycle.mjs';

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
