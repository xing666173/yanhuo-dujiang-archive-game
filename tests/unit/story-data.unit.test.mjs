import assert from 'node:assert/strict';
import test from 'node:test';
import { characters } from '../../game/data/characters.mjs';
import { scripts } from '../../game/data/scripts.mjs';

test('prototype has exactly two male leads, one female lead and two choices', () => {
  const leads = ['gu-yan', 'chen-yu', 'lin-xia'].map((id) => characters[id]);
  assert.deepEqual(leads.map((item) => item.gender), ['男', '男', '女']);

  const nodes = Object.values(scripts).flatMap((script) => Object.values(script.nodes));
  assert.equal(nodes.filter((node) => node.type === 'choice').length, 2);
  assert.equal(nodes.filter((node) => node.effect === 'historical-echo').length, 1);
  assert.equal(nodes.some((node) => /证据匹配|档案修复/.test(node.text || node.prompt || '')), false);
});

test('every branch target resolves inside its script', () => {
  for (const script of Object.values(scripts)) {
    assert.ok(script.nodes[script.entry], `${script.id} entry exists`);
    for (const node of Object.values(script.nodes)) {
      const targets = node.type === 'choice'
        ? node.options.map((option) => option.next)
        : node.next ? [node.next] : [];
      for (const target of targets) assert.ok(script.nodes[target], `${script.id}:${target} exists`);
    }
  }
});
