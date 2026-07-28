import assert from 'node:assert/strict';
import test from 'node:test';
import { createFieldTaskEngine } from '../../game/core/field-task-engine.mjs';
import { FIELD_TASKS } from '../../game/data/field-tasks.mjs';

test('defines one distinct mechanic for each teammate hotspot', () => {
  assert.deepEqual(Object.keys(FIELD_TASKS).sort(), [
    'camera-spot', 'notes-spot', 'voice-spot'
  ]);
  assert.deepEqual(
    Object.values(FIELD_TASKS).map(({ kind }) => kind).sort(),
    ['focus', 'listening', 'timing']
  );
  assert.equal(new Set(Object.values(FIELD_TASKS).map(({ teammateId }) => teammateId)).size, 3);
});

test('each field task starts active with finite bounded state', () => {
  for (const config of Object.values(FIELD_TASKS)) {
    const engine = createFieldTaskEngine(config);
    const state = engine.getSnapshot();
    assert.equal(state.status, 'active');
    assert.equal(state.progress, 0);
    assert.equal(state.elapsedMs, 0);
    assert.equal(state.mistakes, 0);
    assert.ok(Number.isFinite(state.target.x));
    assert.ok(Number.isFinite(state.target.y));
    engine.dispose();
  }
});

test('focus task gains lock inside the moving target and drains outside it', () => {
  const engine = createFieldTaskEngine(FIELD_TASKS['camera-spot']);
  for (let index = 0; index < 20; index += 1) {
    const { target } = engine.getSnapshot();
    engine.setAim(target);
    engine.tick(100);
  }
  assert.equal(engine.getSnapshot().status, 'complete');
  assert.equal(engine.getSnapshot().progress, 1);
});

test('focus task ignores non-finite aim input', () => {
  const engine = createFieldTaskEngine(FIELD_TASKS['camera-spot']);
  engine.setAim({ x: Number.NaN, y: Number.POSITIVE_INFINITY });
  assert.deepEqual(engine.getSnapshot().aim, { x: 0.5, y: 0.5 });
});

test('focus task drains progress when the aim leaves the target', () => {
  const engine = createFieldTaskEngine(FIELD_TASKS['camera-spot']);
  for (let index = 0; index < 8; index += 1) {
    engine.setAim(engine.getSnapshot().target);
    engine.tick(100);
  }
  const lockedProgress = engine.getSnapshot().progress;
  engine.setAim({ x: 0, y: 0 });
  engine.tick(100);
  assert.ok(engine.getSnapshot().progress < lockedProgress);
});

test('timing task accepts nodes in order and a miss never clears completed nodes', () => {
  const engine = createFieldTaskEngine(FIELD_TASKS['notes-spot']);
  engine.actionDown();
  assert.equal(engine.getSnapshot().route.index, 0);
  assert.equal(engine.getSnapshot().mistakes, 1);
  engine.actionUp();
  for (const node of FIELD_TASKS['notes-spot'].nodePositions) {
    while (Math.abs(engine.getSnapshot().route.marker - node) > 0.02) engine.tick(16);
    engine.actionDown();
    engine.actionUp();
  }
  assert.equal(engine.getSnapshot().status, 'complete');
  assert.equal(engine.getSnapshot().route.index, 3);
});

test('repeated held actionDown calls register only one timing attempt', () => {
  const engine = createFieldTaskEngine(FIELD_TASKS['notes-spot']);
  engine.actionDown();
  engine.actionDown();
  assert.equal(engine.getSnapshot().mistakes, 1);
  assert.equal(engine.getSnapshot().route.index, 0);
});

test('snapshots isolate nested values from engine state', () => {
  const engine = createFieldTaskEngine(FIELD_TASKS['notes-spot']);
  const snapshot = engine.getSnapshot();
  const originalTarget = { ...snapshot.target };
  snapshot.aim.x = 0;
  snapshot.target.y = 0;
  snapshot.route.nodes[0] = 1;
  assert.deepEqual(engine.getSnapshot().aim, { x: 0.5, y: 0.5 });
  assert.deepEqual(engine.getSnapshot().target, originalTarget);
  assert.deepEqual(engine.getSnapshot().route.nodes, [0.2, 0.5, 0.8]);
});

test('disposed engine ignores all subsequent input and time', () => {
  const engine = createFieldTaskEngine(FIELD_TASKS['camera-spot']);
  engine.dispose();
  const disposed = engine.getSnapshot();
  engine.setAim({ x: 0, y: 0 });
  engine.actionDown();
  engine.actionUp();
  engine.tick(60_000);
  assert.deepEqual(engine.getSnapshot(), disposed);
});

test('listening task records only while held in a quiet interval', () => {
  const engine = createFieldTaskEngine(FIELD_TASKS['voice-spot']);
  const initial = engine.getSnapshot().progress;
  engine.tick(200);
  assert.equal(engine.getSnapshot().progress, initial);
  engine.actionDown();
  for (let index = 0; index < 240 && engine.getSnapshot().status !== 'complete'; index += 1) {
    if (!engine.getSnapshot().quiet) engine.actionUp();
    else engine.actionDown();
    engine.tick(50);
  }
  assert.equal(engine.getSnapshot().status, 'complete');
  assert.equal(engine.getSnapshot().progress, 1);
});

test('listening task stays active until progress reaches one', () => {
  const engine = createFieldTaskEngine({
    id: 'strict-listening',
    kind: 'listening',
    recordMs: 1_000,
    quietThreshold: 1
  });
  engine.actionDown();
  for (let index = 0; index < 9; index += 1) engine.tick(100);
  assert.ok(Math.abs(engine.getSnapshot().progress - 0.9) < 1e-12);
  assert.equal(engine.getSnapshot().status, 'active');
  engine.tick(100);
  assert.equal(engine.getSnapshot().progress, 1);
  assert.equal(engine.getSnapshot().status, 'complete');
});

test('invalid and oversized deltas cannot jump a task to completion', () => {
  const engine = createFieldTaskEngine(FIELD_TASKS['voice-spot']);
  engine.actionDown();
  engine.tick(Number.NaN);
  engine.tick(Number.POSITIVE_INFINITY);
  assert.equal(engine.getSnapshot().elapsedMs, 0);
  engine.tick(60_000);
  assert.equal(engine.getSnapshot().elapsedMs, 100);
  assert.ok(engine.getSnapshot().progress < 0.1);
});

test('three stars include the exact 18,000ms completion boundary', () => {
  const engine = createFieldTaskEngine({
    id: 'boundary-18',
    kind: 'focus',
    lockMs: 18_000,
    targetRadius: 1
  });
  for (let index = 0; index < 180; index += 1) engine.tick(100);
  assert.equal(engine.getSnapshot().elapsedMs, 18_000);
  assert.equal(engine.getSnapshot().status, 'complete');
  assert.equal(engine.getSnapshot().stars, 3);
});

test('two stars include the exact 30,000ms completion boundary', () => {
  const engine = createFieldTaskEngine({
    id: 'boundary-30',
    kind: 'focus',
    lockMs: 30_000,
    targetRadius: 1
  });
  for (let index = 0; index < 300; index += 1) engine.tick(100);
  assert.equal(engine.getSnapshot().elapsedMs, 30_000);
  assert.equal(engine.getSnapshot().status, 'complete');
  assert.equal(engine.getSnapshot().stars, 2);
});
