import assert from 'node:assert/strict';
import test from 'node:test';
import { characters, expressions } from '../../game/data/characters.mjs';
import { scripts } from '../../game/data/scripts.mjs';

test('prototype has exactly two male leads, one female lead and two choices', () => {
  const leads = ['gu-yan', 'chen-yu', 'lin-xia'].map((id) => characters[id]);
  assert.deepEqual(leads.map((item) => item.name), ['顾言', '陈屿', '林夏']);
  assert.deepEqual(leads.map((item) => item.gender), ['男', '男', '女']);
  assert.equal(leads.filter((item) => item.gender === '男').length, 2);
  assert.equal(leads.filter((item) => item.gender === '女').length, 1);

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

test('characters retain their exact display contract', () => {
  const expectedCharacters = {
    'gu-yan': {
      id: 'gu-yan',
      name: '顾言',
      gender: '男',
      role: '资料整理与报告结构',
      accent: '#70889a',
      portrait: './assets/generated/gu-yan-expressions.png'
    },
    'chen-yu': {
      id: 'chen-yu',
      name: '陈屿',
      gender: '男',
      role: '摄影、视频与网页视觉',
      accent: '#9a463d',
      portrait: './assets/generated/chen-yu-expressions.png'
    },
    'lin-xia': {
      id: 'lin-xia',
      name: '林夏',
      gender: '女',
      role: '访谈、文字与人物故事',
      accent: '#b44b42',
      portrait: './assets/generated/lin-xia-expressions.png'
    },
    echo: {
      id: 'echo',
      name: '回响',
      gender: null,
      role: '艺术化表达',
      accent: '#c49a55',
      portrait: null
    }
  };

  assert.deepEqual(Object.keys(characters), Object.keys(expectedCharacters));
  for (const [id, definition] of Object.entries(expectedCharacters)) {
    assert.deepEqual(characters[id], definition);
  }
  assert.deepEqual(expressions, ['calm', 'thinking', 'surprised', 'arguing', 'relieved']);
});

test('prologue retains its required dialogue, choices, and outcome', () => {
  const prologue = scripts.prologue;
  const expectedLines = [
    {
      speaker: 'lin-xia',
      expression: 'thinking',
      text: '录音笔、电池、采访提纲都在。还差一件事，我们到底想带回来什么？'
    },
    {
      speaker: 'chen-yu',
      expression: 'calm',
      text: '先把画面拍好。芦苇、水路、晨雾，观众愿意停下来，才会看见后面的内容。'
    },
    {
      speaker: 'gu-yan',
      expression: 'thinking',
      text: '画面可以补拍，史料说错了却很难补救。路线和讲解口径得先确认。'
    },
    {
      speaker: 'lin-xia',
      expression: 'relieved',
      text: '那就把三种问题都带上。到了现场，我们再看看答案会不会改变。'
    }
  ];
  const lineIds = [
    'prologue-lin-xia-opening',
    'prologue-chen-yu-plan',
    'prologue-gu-yan-plan',
    'prologue-lin-xia-response'
  ];

  assert.deepEqual(
    lineIds.map((id) => {
      const { speaker, expression, text } = prologue.nodes[id];
      return { speaker, expression, text };
    }),
    expectedLines
  );
  assert.deepEqual(prologue.nodes['prologue-focus'].options, [
    {
      id: 'hear-gu-yan',
      label: '先听顾言把资料说完。',
      effects: { truth: 1, cooperation: 1 },
      next: 'prologue-lin-xia-response'
    },
    {
      id: 'hear-chen-yu',
      label: '让陈屿说明拍摄计划。',
      effects: { expression: 1, cooperation: 1 },
      next: 'prologue-lin-xia-response'
    },
    {
      id: 'hear-lin-xia',
      label: '问林夏最想采访谁。',
      effects: { empathy: 1, cooperation: 1 },
      next: 'prologue-lin-xia-response'
    }
  ]);
  assert.equal(prologue.nodes['prologue-end'].outcome, 'open-reeds-scene');
});

test('reeds convergence retains its choice, echo, settlement, and outcome', () => {
  const convergence = scripts['reeds-convergence'];

  assert.deepEqual(convergence.nodes['reeds-recording-priority'].options, [
    {
      id: 'verify-context',
      label: '请顾言先核对时间和称谓。',
      effects: { truth: 1 },
      next: 'reeds-echo'
    },
    {
      id: 'keep-pause',
      label: '保留讲述中的停顿，不替对方补全。',
      effects: { empathy: 1, cooperation: 1 },
      next: 'reeds-echo'
    },
    {
      id: 'keep-wide-shot',
      label: '用一个长镜头保留现场的水声和距离。',
      effects: { expression: 1 },
      next: 'reeds-echo'
    }
  ]);
  assert.deepEqual(convergence.nodes['reeds-echo'], {
    id: 'reeds-echo',
    type: 'effect',
    effect: 'historical-echo',
    durationMs: 4500,
    speaker: 'echo',
    text: '水路曲折，靠一个人记不住。有人辨风，有人看苇，也有人把消息送到下一个村。',
    next: 'reeds-return'
  });
  assert.deepEqual([
    convergence.nodes['reeds-return'].text,
    convergence.nodes['reeds-return-chen-yu'].text,
    convergence.nodes['reeds-return-lin-xia'].text
  ], [
    '我会把来源和背景补清楚，但不替那段停顿下结论。',
    '我保留水声。画面不抢着解释，让观众先听见现场。',
    '这次我们记录的不是一个标准答案，是三种看见彼此校准的过程。'
  ]);
  assert.equal(convergence.nodes['reeds-end'].outcome, 'prototype-complete');
});
