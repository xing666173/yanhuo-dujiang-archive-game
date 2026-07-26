import assert from 'node:assert/strict';
import test from 'node:test';
import { createStatusThrottle } from '../../game/render/status-throttle.mjs';

function createFakeTime() {
  let time = 0;
  let nextId = 1;
  const tasks = new Map();

  return {
    now: () => time,
    schedule(callback, delay) {
      const id = nextId;
      nextId += 1;
      tasks.set(id, { callback, due: time + delay });
      return id;
    },
    cancel(id) {
      tasks.delete(id);
    },
    advanceTo(target) {
      while (true) {
        const next = [...tasks.entries()]
          .filter(([, task]) => task.due <= target)
          .sort((left, right) => left[1].due - right[1].due)[0];
        if (!next) break;
        const [id, task] = next;
        tasks.delete(id);
        time = task.due;
        task.callback();
      }
      time = target;
    }
  };
}

test('status throttle emits promptly then coalesces bursts to ten callbacks per elapsed second', () => {
  const fakeTime = createFakeTime();
  const emissions = [];
  const throttle = createStatusThrottle({
    emit(value) {
      emissions.push({ time: fakeTime.now(), value });
    },
    now: fakeTime.now,
    schedule: fakeTime.schedule,
    cancel: fakeTime.cancel
  });

  throttle.push('scene-0');
  assert.deepEqual(emissions, [{ time: 0, value: 'scene-0' }]);

  for (let time = 20; time <= 1000; time += 20) {
    fakeTime.advanceTo(time);
    throttle.push(`scene-${time}`);
  }
  fakeTime.advanceTo(1100);

  assert.equal(emissions.at(-1).value, 'scene-1000');
  for (const emission of emissions) {
    const callbacksInWindow = emissions.filter(({ time }) => (
      time >= emission.time && time < emission.time + 1000
    ));
    assert.ok(callbacksInWindow.length <= 10);
  }
  throttle.dispose();
});
