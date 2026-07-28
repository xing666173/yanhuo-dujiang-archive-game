import assert from 'node:assert/strict';
import test from 'node:test';
import * as fieldTaskSession from '../../game/core/field-task-session.mjs';

const score = { stars: 2, durationMs: 7000, mistakes: 1 };

function story(activeScriptId, activeNodeId) {
  return { activeScriptId, activeNodeId };
}

function session({
  visitedHotspots = [],
  activeHotspotId = null,
  fieldTasks = {}
} = {}) {
  return {
    sceneId: 'reeds-wetland',
    visitedHotspots,
    activeHotspotId,
    fieldTasks,
    prototypeComplete: false
  };
}

test('field task flow mapping declares briefing and result end nodes for every hotspot', () => {
  assert.deepEqual(fieldTaskSession.FIELD_TASK_FLOWS, {
    'camera-spot': {
      briefingScriptId: 'reeds-camera',
      briefingEndNodeId: 'reeds-camera-end',
      resultScriptId: 'reeds-camera-result',
      resultEndNodeId: 'reeds-camera-result-end'
    },
    'notes-spot': {
      briefingScriptId: 'reeds-notes',
      briefingEndNodeId: 'reeds-notes-end',
      resultScriptId: 'reeds-notes-result',
      resultEndNodeId: 'reeds-notes-result-end'
    },
    'voice-spot': {
      briefingScriptId: 'reeds-voice',
      briefingEndNodeId: 'reeds-voice-end',
      resultScriptId: 'reeds-voice-result',
      resultEndNodeId: 'reeds-voice-result-end'
    }
  });
});

test('classifies the complete legal field-flow checkpoint matrix', () => {
  assert.equal(typeof fieldTaskSession.classifyFieldTaskCheckpoint, 'function');
  const classify = fieldTaskSession.classifyFieldTaskCheckpoint;
  const cases = [
    {
      name: 'active briefing line',
      story: story('reeds-camera', 'reeds-camera-reminder'),
      session: session({ activeHotspotId: 'camera-spot' }),
      expected: 'active-briefing'
    },
    {
      name: 'active briefing end',
      story: story('reeds-camera', 'reeds-camera-end'),
      session: session({ activeHotspotId: 'camera-spot' }),
      expected: 'active-briefing'
    },
    {
      name: 'cancelled briefing end',
      story: story('reeds-camera', 'reeds-camera-end'),
      session: session(),
      expected: 'cancelled-briefing'
    },
    {
      name: 'active result line',
      story: story('reeds-camera-result', 'reeds-camera-result-chen-yu'),
      session: session({
        activeHotspotId: 'camera-spot',
        fieldTasks: { 'camera-spot': score }
      }),
      expected: 'active-result'
    },
    {
      name: 'active result end',
      story: story('reeds-camera-result', 'reeds-camera-result-end'),
      session: session({
        activeHotspotId: 'camera-spot',
        fieldTasks: { 'camera-spot': score }
      }),
      expected: 'active-result'
    },
    {
      name: 'completed result end',
      story: story('reeds-camera-result', 'reeds-camera-result-end'),
      session: session({
        visitedHotspots: ['camera-spot'],
        fieldTasks: { 'camera-spot': score }
      }),
      expected: 'completed-result'
    },
    {
      name: 'unrelated convergence',
      story: story('reeds-convergence', 'reeds-recording-priority'),
      session: session({
        visitedHotspots: ['camera-spot', 'notes-spot', 'voice-spot'],
        fieldTasks: {
          'camera-spot': score,
          'notes-spot': score,
          'voice-spot': score
        }
      }),
      expected: 'unrelated'
    }
  ];

  for (const value of cases) {
    assert.equal(
      classify(value.story, value.session).kind,
      value.expected,
      value.name
    );
  }
});

test('rejects every reverse-inconsistent field-flow checkpoint combination', () => {
  assert.equal(typeof fieldTaskSession.classifyFieldTaskCheckpoint, 'function');
  const classify = fieldTaskSession.classifyFieldTaskCheckpoint;
  const cases = [
    {
      name: 'visited score while briefing line remains active',
      story: story('reeds-camera', 'reeds-camera-reminder'),
      session: session({
        visitedHotspots: ['camera-spot'],
        fieldTasks: { 'camera-spot': score }
      })
    },
    {
      name: 'result line without score',
      story: story('reeds-camera-result', 'reeds-camera-result-chen-yu'),
      session: session({ activeHotspotId: 'camera-spot' })
    },
    {
      name: 'briefing line without active hotspot',
      story: story('reeds-camera', 'reeds-camera-reminder'),
      session: session()
    },
    {
      name: 'result line after hotspot is already visited',
      story: story('reeds-camera-result', 'reeds-camera-result-chen-yu'),
      session: session({
        visitedHotspots: ['camera-spot'],
        fieldTasks: { 'camera-spot': score }
      })
    },
    {
      name: 'result end has score but wrong active hotspot',
      story: story('reeds-camera-result', 'reeds-camera-result-end'),
      session: session({
        activeHotspotId: 'notes-spot',
        fieldTasks: { 'camera-spot': score }
      })
    }
  ];

  for (const value of cases) {
    assert.equal(classify(value.story, value.session).kind, 'invalid', value.name);
  }
});
