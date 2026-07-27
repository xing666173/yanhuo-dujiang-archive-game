import assert from 'node:assert/strict';
import test from 'node:test';
import { createMovementInput } from '../../game/core/movement-input.mjs';

test('combines sources, normalizes diagonals, and clears all input', () => {
  const values = [];
  const input = createMovementInput({ onChange: (value) => values.push(value) });
  input.setSource('keyboard', { x: 1, y: 0 });
  input.setSource('desktop', { x: 0, y: 1 });
  assert.ok(Math.abs(values.at(-1).x - Math.SQRT1_2) < 0.0001);
  assert.ok(Math.abs(values.at(-1).y - Math.SQRT1_2) < 0.0001);
  input.clearSource('keyboard');
  assert.deepEqual(values.at(-1), { x: 0, y: 1 });
  input.clearAll();
  assert.deepEqual(values.at(-1), { x: 0, y: 0 });
});

test('rejects non-finite values and suppresses duplicate emissions', () => {
  const values = [];
  const input = createMovementInput({ onChange: (value) => values.push(value) });
  input.setSource('desktop', { x: Number.NaN, y: Infinity });
  input.setSource('desktop', { x: 0, y: 0 });
  assert.deepEqual(values, []);
});
