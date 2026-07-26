export const prologue = {
  id: 'prologue',
  entry: 'prologue-lin-xia-opening',
  nodes: {
    'prologue-lin-xia-opening': {
      id: 'prologue-lin-xia-opening',
      type: 'line',
      speaker: 'lin-xia',
      expression: 'thinking',
      text: '录音笔、电池、采访提纲都在。还差一件事，我们到底想带回来什么？',
      next: 'prologue-chen-yu-plan'
    },
    'prologue-chen-yu-plan': {
      id: 'prologue-chen-yu-plan',
      type: 'line',
      speaker: 'chen-yu',
      expression: 'calm',
      text: '先把画面拍好。芦苇、水路、晨雾，观众愿意停下来，才会看见后面的内容。',
      next: 'prologue-gu-yan-plan'
    },
    'prologue-gu-yan-plan': {
      id: 'prologue-gu-yan-plan',
      type: 'line',
      speaker: 'gu-yan',
      expression: 'thinking',
      text: '画面可以补拍，史料说错了却很难补救。路线和讲解口径得先确认。',
      next: 'prologue-focus'
    },
    'prologue-focus': {
      id: 'prologue-focus',
      type: 'choice',
      prompt: '先从谁的方案听起？',
      options: [
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
      ]
    },
    'prologue-lin-xia-response': {
      id: 'prologue-lin-xia-response',
      type: 'line',
      speaker: 'lin-xia',
      expression: 'relieved',
      text: '那就把三种问题都带上。到了现场，我们再看看答案会不会改变。',
      next: 'prologue-end'
    },
    'prologue-end': {
      id: 'prologue-end',
      type: 'end',
      outcome: 'open-reeds-scene'
    }
  }
};
