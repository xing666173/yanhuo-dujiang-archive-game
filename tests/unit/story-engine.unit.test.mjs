import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialStoryState, createStoryEngine } from '../../game/core/story-engine.mjs';

const scripts = {
  sample: {
    id: 'sample',
    entry: 'line',
    nodes: {
      line: { id: 'line', type: 'line', speaker: 'lin-xia', text: '出发吧。', next: 'choice' },
      choice: {
        id: 'choice',
        type: 'choice',
        prompt: '先记录什么？',
        options: [
          { id: 'truth', label: '核对资料', effects: { truth: 1, cooperation: 1 }, next: 'end' }
        ]
      },
      end: { id: 'end', type: 'end', outcome: 'sample-complete' }
    }
  }
};

test('advances lines, applies a choice, and marks the script complete', () => {
  const engine = createStoryEngine({ scripts, state: createInitialStoryState() });

  engine.start('sample');
  assert.equal(engine.getNode().id, 'line');
  engine.advance();
  engine.choose('truth');

  assert.deepEqual(engine.getState().stats, { truth: 1, empathy: 0, expression: 0 });
  assert.equal(engine.getState().cooperation, 1);
  assert.deepEqual(engine.getState().choices, { choice: 'truth' });
  assert.deepEqual(engine.getState().completedScripts, ['sample']);
  assert.equal(engine.getNode().id, 'end');
});

test('rejects unknown scripts and illegal advance or choose transitions', () => {
  const engine = createStoryEngine({ scripts, state: createInitialStoryState() });

  assert.throws(() => engine.start('missing'), /unknown script: missing/i);
  assert.throws(() => engine.advance(), /cannot advance/i);
  assert.throws(() => engine.choose('truth'), /not a choice/i);

  engine.start('sample');
  engine.advance();
  assert.throws(() => engine.advance(), /cannot advance/i);
});

test('rejects unknown options without changing story state', () => {
  const engine = createStoryEngine({ scripts, state: createInitialStoryState() });
  engine.start('sample');
  engine.advance();

  assert.throws(() => engine.choose('missing'), /unknown option: missing/i);
  assert.deepEqual(engine.getState().stats, { truth: 0, empathy: 0, expression: 0 });
  assert.equal(engine.getState().cooperation, 0);
  assert.deepEqual(engine.getState().choices, {});
});

test('keeps state unchanged when a choice destination is unknown', () => {
  const malformedScripts = structuredClone(scripts);
  malformedScripts.sample.nodes.choice.options[0].next = 'missing';
  const engine = createStoryEngine({ scripts: malformedScripts, state: createInitialStoryState() });
  engine.start('sample');
  engine.advance();
  const beforeChoice = engine.getState();

  assert.throws(() => engine.choose('truth'), /unknown node: missing/i);
  assert.deepEqual(engine.getState(), beforeChoice);
});

test('rejects restored states whose active node is missing from the active script', () => {
  const state = createInitialStoryState();
  state.activeScriptId = 'sample';
  state.activeNodeId = 'missing';
  const engine = createStoryEngine({ scripts, state });

  assert.throws(() => engine.getNode(), /unknown node: missing/i);
});

test('prevents a previously selected choice from applying twice', () => {
  const engine = createStoryEngine({ scripts, state: createInitialStoryState() });
  engine.start('sample');
  engine.advance();
  engine.choose('truth');

  engine.start('sample');
  engine.advance();
  assert.throws(() => engine.choose('truth'), /choice already made: choice/i);
  assert.deepEqual(engine.getState().stats, { truth: 1, empathy: 0, expression: 0 });
  assert.equal(engine.getState().cooperation, 1);
});

test('returns immutable node and state snapshots', () => {
  const engine = createStoryEngine({ scripts, state: createInitialStoryState() });
  engine.start('sample');

  const state = engine.getState();
  const node = engine.getNode();
  state.stats.truth = 99;
  node.text = '篡改的对白';

  assert.equal(engine.getState().stats.truth, 0);
  assert.equal(engine.getNode().text, '出发吧。');
});
