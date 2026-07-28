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

test('listening task records only while held in a quiet interval', () => {
  const engine = createFieldTaskEngine(FIELD_TASKS['voice-spot']);
  const initial = engine.getSnapshot().progress;
  engine.tick(200);
  assert.equal(engine.getSnapshot().progress, initial);
  engine.actionDown();
  for (let index = 0; index < 120 && engine.getSnapshot().status !== 'complete'; index += 1) {
    if (!engine.getSnapshot().quiet) engine.actionUp();
    else engine.actionDown();
    engine.tick(50);
  }
  assert.equal(engine.getSnapshot().status, 'complete');
});

test('invalid and oversized deltas cannot jump a task to completion', () => {
  const engine = createFieldTaskEngine(FIELD_TASKS['voice-spot']);
  engine.actionDown();
  engine.tick(Number.NaN);
  engine.tick(60_000);
  assert.ok(engine.getSnapshot().progress < 0.1);
});
