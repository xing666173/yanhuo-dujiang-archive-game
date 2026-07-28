export const reeds = {
  'reeds-camera': {
    id: 'reeds-camera',
    entry: 'reeds-camera-observe',
    nodes: {
      'reeds-camera-observe': {
        id: 'reeds-camera-observe',
        type: 'line',
        speaker: 'chen-yu',
        expression: 'calm',
        text: '晨雾刚散，木栈道把视线带进芦苇里。这个画面值得先留下。',
        next: 'reeds-camera-reminder'
      },
      'reeds-camera-reminder': {
        id: 'reeds-camera-reminder',
        type: 'line',
        speaker: 'gu-yan',
        expression: 'thinking',
        text: '可以拍，但不要让空镜替代背景说明。水路和这里的人，也要说清楚。',
        next: 'reeds-camera-end'
      },
      'reeds-camera-end': {
        id: 'reeds-camera-end',
        type: 'end',
        outcome: 'start-camera-field-task'
      }
    }
  },
  'reeds-notes': {
    id: 'reeds-notes',
    entry: 'reeds-notes-check',
    nodes: {
      'reeds-notes-check': {
        id: 'reeds-notes-check',
        type: 'line',
        speaker: 'gu-yan',
        expression: 'thinking',
        text: '地点和称谓先核对一遍，写进记录里的每个词都得有来处。',
        next: 'reeds-notes-reminder'
      },
      'reeds-notes-reminder': {
        id: 'reeds-notes-reminder',
        type: 'line',
        speaker: 'lin-xia',
        expression: 'calm',
        text: '资料里的完整句子，未必等于讲述者的真实节奏。别把他的停顿剪掉。',
        next: 'reeds-notes-end'
      },
      'reeds-notes-end': {
        id: 'reeds-notes-end',
        type: 'end',
        outcome: 'start-notes-field-task'
      }
    }
  },
  'reeds-voice': {
    id: 'reeds-voice',
    entry: 'reeds-voice-pause',
    nodes: {
      'reeds-voice-pause': {
        id: 'reeds-voice-pause',
        type: 'line',
        speaker: 'lin-xia',
        expression: 'thinking',
        text: '他停了一下。我们先别急着把这段话接过去。',
        next: 'reeds-voice-listen'
      },
      'reeds-voice-listen': {
        id: 'reeds-voice-listen',
        type: 'line',
        speaker: 'chen-yu',
        expression: 'relieved',
        text: '好，我先把相机放下，听他把想说的说完。',
        next: 'reeds-voice-end'
      },
      'reeds-voice-end': {
        id: 'reeds-voice-end',
        type: 'end',
        outcome: 'start-voice-field-task'
      }
    }
  },
  'reeds-camera-result': {
    id: 'reeds-camera-result',
    entry: 'reeds-camera-result-chen-yu',
    nodes: {
      'reeds-camera-result-chen-yu': {
        id: 'reeds-camera-result-chen-yu',
        type: 'line',
        speaker: 'chen-yu',
        expression: 'relieved',
        text: '画面够用了，水路和木栈道都留在镜头里。',
        next: 'reeds-camera-result-gu-yan'
      },
      'reeds-camera-result-gu-yan': {
        id: 'reeds-camera-result-gu-yan',
        type: 'line',
        speaker: 'gu-yan',
        expression: 'calm',
        text: '水路还在画面里，后面的说明能接上。',
        next: 'reeds-camera-result-end'
      },
      'reeds-camera-result-end': {
        id: 'reeds-camera-result-end',
        type: 'end',
        outcome: 'reeds-camera-complete'
      }
    }
  },
  'reeds-notes-result': {
    id: 'reeds-notes-result',
    entry: 'reeds-notes-result-gu-yan',
    nodes: {
      'reeds-notes-result-gu-yan': {
        id: 'reeds-notes-result-gu-yan',
        type: 'line',
        speaker: 'gu-yan',
        expression: 'relieved',
        text: '路线次序核对好了，可以按这个节奏往下走。',
        next: 'reeds-notes-result-lin-xia'
      },
      'reeds-notes-result-lin-xia': {
        id: 'reeds-notes-result-lin-xia',
        type: 'line',
        speaker: 'lin-xia',
        expression: 'calm',
        text: '大家的步子没散，记录也跟得上。',
        next: 'reeds-notes-result-end'
      },
      'reeds-notes-result-end': {
        id: 'reeds-notes-result-end',
        type: 'end',
        outcome: 'reeds-notes-complete'
      }
    }
  },
  'reeds-voice-result': {
    id: 'reeds-voice-result',
    entry: 'reeds-voice-result-lin-xia',
    nodes: {
      'reeds-voice-result-lin-xia': {
        id: 'reeds-voice-result-lin-xia',
        type: 'line',
        speaker: 'lin-xia',
        expression: 'relieved',
        text: '这段停顿很干净，先把它完整留下。',
        next: 'reeds-voice-result-chen-yu'
      },
      'reeds-voice-result-chen-yu': {
        id: 'reeds-voice-result-chen-yu',
        type: 'line',
        speaker: 'chen-yu',
        expression: 'calm',
        text: '我把相机放下，等他说完才继续。',
        next: 'reeds-voice-result-end'
      },
      'reeds-voice-result-end': {
        id: 'reeds-voice-result-end',
        type: 'end',
        outcome: 'reeds-voice-complete'
      }
    }
  },
  'reeds-convergence': {
    id: 'reeds-convergence',
    entry: 'reeds-recording-priority',
    nodes: {
      'reeds-recording-priority': {
        id: 'reeds-recording-priority',
        type: 'choice',
        prompt: '这段讲述应该怎样留下？',
        options: [
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
        ]
      },
      'reeds-echo': {
        id: 'reeds-echo',
        type: 'effect',
        effect: 'historical-echo',
        durationMs: 4500,
        speaker: 'echo',
        text: '水路曲折，靠一个人记不住。有人辨风，有人看苇，也有人把消息送到下一个村。',
        next: 'reeds-return'
      },
      'reeds-return': {
        id: 'reeds-return',
        type: 'line',
        speaker: 'gu-yan',
        expression: 'relieved',
        text: '我会把来源和背景补清楚，但不替那段停顿下结论。',
        next: 'reeds-return-chen-yu'
      },
      'reeds-return-chen-yu': {
        id: 'reeds-return-chen-yu',
        type: 'line',
        speaker: 'chen-yu',
        expression: 'relieved',
        text: '我保留水声。画面不抢着解释，让观众先听见现场。',
        next: 'reeds-return-lin-xia'
      },
      'reeds-return-lin-xia': {
        id: 'reeds-return-lin-xia',
        type: 'line',
        speaker: 'lin-xia',
        expression: 'relieved',
        text: '这次我们记录的不是一个标准答案，是三种看见彼此校准的过程。',
        next: 'reeds-end'
      },
      'reeds-end': {
        id: 'reeds-end',
        type: 'end',
        outcome: 'prototype-complete'
      }
    }
  }
};
