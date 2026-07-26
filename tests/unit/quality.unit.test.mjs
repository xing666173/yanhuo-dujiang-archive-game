import assert from 'node:assert/strict';
import test from 'node:test';
import * as qualityModule from '../../game/render/quality.mjs';

const { chooseQuality, detectWebGL } = qualityModule;

function createAutoQualityMonitor(options) {
  assert.equal(typeof qualityModule.createAutoQualityMonitor, 'function');
  return qualityModule.createAutoQualityMonitor(options);
}

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

test('auto quality downgrades once after five continuous seconds below 26 FPS', () => {
  const announcements = [];
  const monitor = createAutoQualityMonitor({
    onDowngrade() {
      announcements.push('downgraded');
    }
  });

  for (let timestamp = 0; timestamp <= 12_000; timestamp += 40) {
    monitor.sample(timestamp, { requested: 'auto' });
  }

  assert.deepEqual(announcements, ['downgraded']);
  assert.equal(monitor.getState().downgraded, true);
});

test('explicit quality never auto-downgrades and returning to auto requires a fresh window', () => {
  let downgrades = 0;
  const monitor = createAutoQualityMonitor({
    onDowngrade() {
      downgrades += 1;
    }
  });

  for (let timestamp = 0; timestamp <= 6_000; timestamp += 40) {
    monitor.sample(timestamp, { requested: 'high' });
  }
  for (let timestamp = 6_040; timestamp <= 12_000; timestamp += 40) {
    monitor.sample(timestamp, { requested: 'low' });
  }
  for (let timestamp = 12_040; timestamp < 17_040; timestamp += 40) {
    monitor.sample(timestamp, { requested: 'auto' });
  }
  assert.equal(downgrades, 0);

  monitor.sample(17_040, { requested: 'auto' });
  assert.equal(downgrades, 1);
});

test('a recovered frame-rate window and a visibility reset restart the five-second clock', () => {
  let downgrades = 0;
  const monitor = createAutoQualityMonitor({
    onDowngrade() {
      downgrades += 1;
    }
  });

  for (let timestamp = 0; timestamp <= 4_000; timestamp += 40) {
    monitor.sample(timestamp, { requested: 'auto' });
  }
  for (let timestamp = 4_016; timestamp <= 5_016; timestamp += 16) {
    monitor.sample(timestamp, { requested: 'auto' });
  }
  for (let timestamp = 5_056; timestamp < 9_856; timestamp += 40) {
    monitor.sample(timestamp, { requested: 'auto' });
  }
  assert.equal(downgrades, 0);

  monitor.reset();
  for (let timestamp = 10_000; timestamp < 15_000; timestamp += 40) {
    monitor.sample(timestamp, { requested: 'auto' });
  }
  assert.equal(downgrades, 0);
  monitor.sample(15_000, { requested: 'auto' });
  assert.equal(downgrades, 1);
});
