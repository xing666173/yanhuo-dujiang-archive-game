const task = (value) => Object.freeze(value);

export const FIELD_TASKS = Object.freeze({
  'camera-spot': task({
    id: 'camera-spot',
    kind: 'focus',
    teammateId: 'chen-yu',
    teammateName: '陈屿',
    title: '晨雾取景',
    lockMs: 1600,
    targetRadius: 0.12
  }),
  'notes-spot': task({
    id: 'notes-spot',
    kind: 'timing',
    teammateId: 'gu-yan',
    teammateName: '顾言',
    title: '路线节奏',
    nodePositions: Object.freeze([0.2, 0.5, 0.8]),
    sweepMs: 2400,
    baseTolerance: 0.075
  }),
  'voice-spot': task({
    id: 'voice-spot',
    kind: 'listening',
    teammateId: 'lin-xia',
    teammateName: '林夏',
    title: '安静收声',
    recordMs: 2600,
    quietThreshold: 0.44
  })
});
