import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseQuality, detectWebGL } from '../../game/render/quality.mjs';

test('returns the exact low and high quality contracts', () => {
  assert.deepEqual(chooseQuality({
    devicePixelRatio: 4,
    coarsePointer: false,
    requested: 'low'
  }), {
    pixelRatio: 1,
    shadows: false,
    antialias: false,
    reedCount: 320,
    postEffects: false
  });

  assert.deepEqual(chooseQuality({
    devicePixelRatio: 1.25,
    coarsePointer: true,
    requested: 'high'
  }), {
    pixelRatio: 1.5,
    shadows: true,
    antialias: true,
    reedCount: 700,
    postEffects: true
  });

  assert.equal(chooseQuality({
    devicePixelRatio: 3,
    coarsePointer: false,
    requested: 'high'
  }).pixelRatio, 2);
});

test('auto selects low for coarse or very high density displays', () => {
  assert.equal(chooseQuality({
    devicePixelRatio: 1,
    coarsePointer: true,
    requested: 'auto'
  }).reedCount, 320);
  assert.equal(chooseQuality({
    devicePixelRatio: 2.1,
    coarsePointer: false,
    requested: 'auto'
  }).reedCount, 320);
  assert.equal(chooseQuality({
    devicePixelRatio: 2,
    coarsePointer: false,
    requested: 'auto'
  }).reedCount, 700);
});

test('detectWebGL tries WebGL2 then WebGL and never throws', () => {
  const calls = [];
  const canvas = {
    getContext(name) {
      calls.push(name);
      return name === 'webgl' ? {} : null;
    }
  };

  assert.equal(detectWebGL(canvas), true);
  assert.deepEqual(calls, ['webgl2', 'webgl']);
  assert.equal(detectWebGL({ getContext() { throw new Error('blocked'); } }), false);
  assert.equal(detectWebGL(null), false);
});
