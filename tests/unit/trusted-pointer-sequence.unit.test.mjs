import assert from 'node:assert/strict';
import test from 'node:test';
import * as gameStateHelpers from '../e2e/helpers/game-state.mjs';

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
