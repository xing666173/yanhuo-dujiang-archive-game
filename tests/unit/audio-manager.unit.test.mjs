import assert from 'node:assert/strict';
import test from 'node:test';
import { createAudioManager, normaliseAudioSettings } from '../../game/audio/audio-manager.mjs';

test('clamps channel gains and degrades to a no-op manager', () => {
  assert.deepEqual(normaliseAudioSettings({
    music: 2,
    ambience: -1,
    uiSound: 0.4
  }), {
    music: 1,
    ambience: 0,
    uiSound: 0.4
  });

  const audio = createAudioManager({ AudioContextCtor: null });
  assert.equal(audio.getState().available, false);
  assert.doesNotThrow(() => audio.applySettings({ music: 1, ambience: 1, uiSound: 1 }));
  assert.doesNotThrow(() => audio.setScene('reeds-wetland'));
});

function createFakeAudioContext({ resumeRejects = false } = {}) {
  const instances = [];

  class FakeParam {
    constructor(value = 0) {
      this.value = value;
      this.events = [];
    }
    setValueAtTime(value, time) {
      this.value = value;
      this.events.push(['set', value, time]);
    }
    linearRampToValueAtTime(value, time) {
      this.value = value;
      this.events.push(['ramp', value, time]);
    }
    setTargetAtTime(value, time, constant) {
      this.value = value;
      this.events.push(['target', value, time, constant]);
    }
  }

  class FakeNode {
    constructor() {
      this.connections = [];
    }
    connect(node) {
      this.connections.push(node);
      return node;
    }
    disconnect() {}
  }

  return {
    instances,
    Ctor: class {
      constructor() {
        this.currentTime = 4;
        this.sampleRate = 8000;
        this.destination = new FakeNode();
        this.gains = [];
        this.filters = [];
        this.oscillators = [];
        this.sources = [];
        this.buffers = [];
        instances.push(this);
      }
      createGain() {
        const node = new FakeNode();
        node.gain = new FakeParam(1);
        this.gains.push(node);
        return node;
      }
      createBiquadFilter() {
        const node = new FakeNode();
        node.type = '';
        node.frequency = new FakeParam();
        node.Q = new FakeParam();
        this.filters.push(node);
        return node;
      }
      createBuffer(channels, length, sampleRate) {
        const data = new Float32Array(length);
        const buffer = { channels, length, sampleRate, getChannelData: () => data, data };
        this.buffers.push(buffer);
        return buffer;
      }
      createBufferSource() {
        const node = new FakeNode();
        node.start = () => { node.started = true; };
        node.stop = () => { node.stopped = true; };
        this.sources.push(node);
        return node;
      }
      createOscillator() {
        const node = new FakeNode();
        node.frequency = new FakeParam();
        node.start = (time) => { node.startedAt = time; };
        node.stop = (time) => { node.stoppedAt = time; };
        this.oscillators.push(node);
        return node;
      }
      resume() {
        return resumeRejects ? Promise.reject(new Error('blocked')) : Promise.resolve();
      }
      suspend() {
        return Promise.resolve();
      }
      close() {
        this.closed = true;
        return Promise.resolve();
      }
    }
  };
}

test('creates audio lazily after unlock and applies all three channel gains', async () => {
  const fake = createFakeAudioContext();
  const audio = createAudioManager({ AudioContextCtor: fake.Ctor });

  audio.applySettings({ music: 0.2, ambience: 0.3, uiSound: 0.4 });
  audio.setScene('reeds-wetland');
  assert.equal(fake.instances.length, 0);

  assert.equal(await audio.unlock(), true);
  const context = fake.instances[0];
  assert.equal(context.gains.length >= 4, true);
  assert.deepEqual(context.gains.slice(1, 4).map((node) => node.gain.value), [0.2, 0.3, 0.4]);
  assert.equal(context.sources[0].started, true);
  assert.equal(context.oscillators.length >= 3, true);
  assert.equal(audio.getState().unlocked, true);
  await audio.dispose();
});

test('uses the same seeded ambience samples in repeated sessions', async () => {
  const firstFake = createFakeAudioContext();
  const secondFake = createFakeAudioContext();
  const first = createAudioManager({ AudioContextCtor: firstFake.Ctor });
  const second = createAudioManager({ AudioContextCtor: secondFake.Ctor });

  await first.unlock();
  await second.unlock();

  assert.deepEqual(
    [...firstFake.instances[0].buffers[0].data.slice(0, 24)],
    [...secondFake.instances[0].buffers[0].data.slice(0, 24)]
  );
  await first.dispose();
  await second.dispose();
});

test('marks audio unavailable when context creation or resume fails', async () => {
  class ThrowingContext {
    constructor() {
      throw new Error('no device');
    }
  }
  const throwing = createAudioManager({ AudioContextCtor: ThrowingContext });
  assert.equal(await throwing.unlock(), false);
  assert.equal(throwing.getState().available, false);

  const rejectingFake = createFakeAudioContext({ resumeRejects: true });
  const rejecting = createAudioManager({ AudioContextCtor: rejectingFake.Ctor });
  assert.equal(await rejecting.unlock(), false);
  assert.equal(rejecting.getState().available, false);
  await rejecting.dispose();
});
