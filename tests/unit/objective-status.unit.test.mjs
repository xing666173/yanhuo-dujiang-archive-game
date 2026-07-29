import assert from 'node:assert/strict';
import test from 'node:test';
import { describeObjective } from '../../game/core/objective-status.mjs';

test('objective copy tracks preparation and completed wetland records', () => {
  assert.equal(
    describeObjective({ sceneId: 'activity-room' }),
    '前往路线板，确认出发计划'
  );
  assert.equal(
    describeObjective({ sceneId: 'reeds-wetland' }),
    '沿栈道完成三项现场记录'
  );
  assert.equal(
    describeObjective({
      sceneId: 'reeds-wetland',
      completedHotspotIds: ['camera-spot']
    }),
    '现场记录 1 / 3'
  );
  assert.equal(
    describeObjective({
      sceneId: 'reeds-wetland',
      completedHotspotIds: ['camera-spot', 'notes-spot']
    }),
    '现场记录 2 / 3'
  );
  assert.equal(
    describeObjective({
      sceneId: 'reeds-wetland',
      completedHotspotIds: ['camera-spot', 'notes-spot', 'voice-spot']
    }),
    '三项记录完成，整理今日回响'
  );
});

test('objective progress ignores duplicate and unrelated hotspot identifiers', () => {
  assert.equal(
    describeObjective({
      sceneId: 'reeds-wetland',
      completedHotspotIds: ['camera-spot', 'camera-spot', 'route-board']
    }),
    '现场记录 1 / 3'
  );
  assert.equal(describeObjective({ sceneId: 'unknown' }), '');
});
