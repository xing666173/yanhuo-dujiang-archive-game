import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as gameStateHelpers from '../e2e/helpers/game-state.mjs';

const root = path.resolve(import.meta.dirname, '../..');

function functionSource(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

function createTouchPage({
  startError = null,
  endError = null,
  detachError = null
} = {}) {
  const calls = [];
  const session = {
    async send(command, payload) {
      calls.push(`${command}:${payload.type}`);
      if (payload.type === 'touchStart' && startError) throw startError;
      if (payload.type === 'touchEnd' && endError) throw endError;
    },
    async detach() {
      calls.push('detach');
      if (detachError) throw detachError;
    }
  };
  return {
    calls,
    page: {
      async evaluate() {
        return true;
      },
      context() {
        return {
          async newCDPSession() {
            calls.push('session');
            return session;
          }
        };
      }
    }
  };
}

test('a rejected touch start still releases and detaches without replacing the start error', async () => {
  assert.equal(typeof gameStateHelpers.withTrustedPointerSequence, 'function');
  const startError = new Error('touch start transport rejected');
  const endError = new Error('touch end transport rejected');
  const detachError = new Error('session detach rejected');
  const { page, calls } = createTouchPage({ startError, endError, detachError });

  let received;
  try {
    await gameStateHelpers.withTrustedPointerSequence(page, async ({ down }) => {
      await down({ x: 25, y: 40 });
    });
  } catch (error) {
    received = error;
  }

  assert.equal(received, startError);
  assert.deepEqual(received.cleanupErrors, [endError, detachError]);
  assert.deepEqual(calls, [
    'session',
    'Input.dispatchTouchEvent:touchStart',
    'Input.dispatchTouchEvent:touchEnd',
    'detach'
  ]);
});

test('operation failures remain primary when release and detach also fail', async () => {
  assert.equal(typeof gameStateHelpers.withTrustedPointerSequence, 'function');
  const operationError = new Error('operation assertion failed');
  const endError = new Error('touch end failed');
  const detachError = new Error('detach failed');
  const { page, calls } = createTouchPage({ endError, detachError });

  let received;
  try {
    await gameStateHelpers.withTrustedPointerSequence(page, async ({ down }) => {
      await down({ x: 30, y: 45 });
      throw operationError;
    });
  } catch (error) {
    received = error;
  }

  assert.equal(received, operationError);
  assert.deepEqual(received.cleanupErrors, [endError, detachError]);
  assert.deepEqual(calls, [
    'session',
    'Input.dispatchTouchEvent:touchStart',
    'Input.dispatchTouchEvent:touchEnd',
    'detach'
  ]);
});

test('cleanup failures reject an otherwise successful pointer operation', async () => {
  assert.equal(typeof gameStateHelpers.withTrustedPointerSequence, 'function');
  const endError = new Error('touch end failed');
  const detachError = new Error('detach failed');
  const { page, calls } = createTouchPage({ endError, detachError });

  await assert.rejects(
    gameStateHelpers.withTrustedPointerSequence(page, async ({ down }) => {
      await down({ x: 35, y: 50 });
    }),
    (error) => (
      error instanceof AggregateError
      && error.errors[0] === endError
      && error.errors[1] === detachError
    )
  );
  assert.deepEqual(calls, [
    'session',
    'Input.dispatchTouchEvent:touchStart',
    'Input.dispatchTouchEvent:touchEnd',
    'detach'
  ]);
});

test('mobile world navigation and look helpers cannot fall back to synthetic pointer events', () => {
  const prototypeSource = fs.readFileSync(
    path.join(root, 'tests/e2e/prototype-flow.spec.mjs'),
    'utf8'
  );
  const gameStateSource = fs.readFileSync(
    path.join(root, 'tests/e2e/helpers/game-state.mjs'),
    'utf8'
  );
  const productionTouchSource = fs.readFileSync(
    path.join(root, 'game/ui/touch-controls.mjs'),
    'utf8'
  );
  const gameStyles = fs.readFileSync(path.join(root, 'game/styles.css'), 'utf8');
  const prototypeTouchMove = functionSource(
    prototypeSource,
    'async function holdTouchUntil',
    'async function exerciseTouchLook'
  );
  const prototypeTouchLook = functionSource(
    prototypeSource,
    'async function exerciseTouchLook',
    'async function beginHeldMovement'
  );
  const prototypeHeldMove = functionSource(
    prototypeSource,
    'async function beginHeldMovement',
    'async function reachHotspot'
  );
  const sharedWorldMove = functionSource(
    gameStateSource,
    'export async function reachFieldHotspot',
    'export async function readSavedProgress'
  );

  for (const source of [
    prototypeTouchMove,
    prototypeTouchLook,
    prototypeHeldMove,
    sharedWorldMove
  ]) {
    assert.match(source, /withTrustedPointerSequence/);
    assert.doesNotMatch(source, /\.dispatchEvent\(/);
  }
  assert.match(prototypeSource, /installTrustedWorldInputDiagnostics/);
  assert.match(prototypeSource, /expectTrustedWorldInputDiagnostics/);
  assert.doesNotMatch(productionTouchSource, /isTrusted/);
  assert.match(
    gameStyles,
    /\.joystick,\s*\.look-zone\s*\{[^}]*touch-action:\s*none;/s,
    'real touch drags must not be cancelled into a browser pan gesture'
  );
});
