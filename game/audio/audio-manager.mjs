const CHANNELS = ['music', 'ambience', 'uiSound'];
const MOTIF_FREQUENCIES = [220, 293.66, 329.63];
const MOTIF_INTERVAL_MS = 8000;
const NOISE_SECONDS = 8;

function clamp(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function setParam(param, value, time = 0) {
  if (typeof param?.setTargetAtTime === 'function') param.setTargetAtTime(value, time, 0.03);
  else if (param) param.value = value;
}

function createSeededNoise(length) {
  let seed = 0x6d2b79f5;
  const samples = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    seed = Math.imul(seed ^ (seed >>> 15), seed | 1);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), seed | 61);
    samples[index] = ((((seed ^ (seed >>> 14)) >>> 0) / 4294967296) * 2 - 1) * 0.42;
  }
  return samples;
}

export function normaliseAudioSettings(settings = {}) {
  return Object.fromEntries(CHANNELS.map((channel) => [channel, clamp(settings[channel])]));
}

export function createAudioManager({ AudioContextCtor } = {}) {
  let available = typeof AudioContextCtor === 'function';
  let unlocked = false;
  let disposed = false;
  let context = null;
  let master = null;
  let channels = null;
  let ambienceSource = null;
  let lowPass = null;
  let bandPass = null;
  let motifTimer = null;
  let settings = normaliseAudioSettings({});
  let sceneId = 'activity-room';

  function applyChannelGains() {
    if (!context || !channels) return;
    for (const channel of CHANNELS) {
      setParam(channels[channel].gain, settings[channel], context.currentTime);
    }
  }

  function applySceneMix() {
    if (!context || !lowPass || !bandPass) return;
    const reeds = sceneId === 'reeds-wetland';
    setParam(lowPass.frequency, reeds ? 3400 : 1450, context.currentTime);
    setParam(bandPass.frequency, reeds ? 920 : 560, context.currentTime);
    setParam(bandPass.Q, reeds ? 0.55 : 1.35, context.currentTime);
  }

  function scheduleMotif() {
    if (!context || !channels || disposed) return;
    const start = context.currentTime + 0.08;
    MOTIF_FREQUENCIES.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const noteStart = start + index * 0.42;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      envelope.gain.setValueAtTime(0.0001, noteStart);
      envelope.gain.linearRampToValueAtTime(0.045, noteStart + 0.08);
      envelope.gain.linearRampToValueAtTime(0.0001, noteStart + 0.58);
      oscillator.connect(envelope).connect(channels.music);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + 0.62);
    });
  }

  function stopMotifScheduler() {
    clearInterval(motifTimer);
    motifTimer = null;
  }

  function startMotifScheduler({ playNow = false } = {}) {
    if (!context || !channels || disposed || !unlocked || motifTimer !== null) return;
    if (playNow) scheduleMotif();
    motifTimer = setInterval(scheduleMotif, MOTIF_INTERVAL_MS);
    motifTimer.unref?.();
  }

  function startAmbience() {
    const length = Math.max(1, Math.floor(context.sampleRate * NOISE_SECONDS));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    buffer.getChannelData(0).set(createSeededNoise(length));
    ambienceSource = context.createBufferSource();
    ambienceSource.buffer = buffer;
    ambienceSource.loop = true;
    lowPass = context.createBiquadFilter();
    lowPass.type = 'lowpass';
    bandPass = context.createBiquadFilter();
    bandPass.type = 'bandpass';
    ambienceSource.connect(lowPass).connect(bandPass).connect(channels.ambience);
    applySceneMix();
    ambienceSource.start();
  }

  function initialiseGraph() {
    master = context.createGain();
    master.gain.value = 0.82;
    master.connect(context.destination);
    channels = Object.fromEntries(CHANNELS.map((channel) => {
      const gain = context.createGain();
      gain.connect(master);
      return [channel, gain];
    }));
    applyChannelGains();
    startAmbience();
  }

  async function markUnavailable() {
    available = false;
    unlocked = false;
    stopMotifScheduler();
    try {
      ambienceSource?.stop();
    } catch {}
    try {
      await context?.close?.();
    } catch {}
    context = null;
    channels = null;
  }

  function playTone(frequency, start, duration, destination) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(0.12, start + 0.012);
    envelope.gain.linearRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope).connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }

  return {
    async unlock() {
      if (!available || disposed) return false;
      try {
        if (!context) {
          context = new AudioContextCtor();
          initialiseGraph();
        }
        await context.resume?.();
        unlocked = true;
        startMotifScheduler({ playNow: true });
        return true;
      } catch {
        await markUnavailable();
        return false;
      }
    },
    applySettings(nextSettings) {
      settings = normaliseAudioSettings(nextSettings);
      applyChannelGains();
    },
    setScene(nextSceneId) {
      sceneId = nextSceneId;
      applySceneMix();
    },
    playUiCue(type) {
      if (!available || !unlocked || !context || !channels) return;
      try {
        const start = context.currentTime + 0.006;
        if (type === 'choice') {
          playTone(392, start, 0.11, channels.uiSound);
          playTone(523.25, start + 0.035, 0.075, channels.uiSound);
        } else {
          playTone(440, start, 0.07, channels.uiSound);
        }
      } catch {
        void markUnavailable();
      }
    },
    async suspend() {
      if (!context || !available) return false;
      stopMotifScheduler();
      try {
        await context.suspend?.();
        unlocked = false;
        return true;
      } catch {
        await markUnavailable();
        return false;
      }
    },
    async resume() {
      if (!context || !available) return false;
      try {
        await context.resume?.();
        unlocked = true;
        startMotifScheduler();
        return true;
      } catch {
        await markUnavailable();
        return false;
      }
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      stopMotifScheduler();
      try {
        ambienceSource?.stop();
      } catch {}
      try {
        await context?.close?.();
      } catch {}
      context = null;
      channels = null;
      unlocked = false;
    },
    getState() {
      return {
        available,
        unlocked,
        sceneId,
        settings: { ...settings }
      };
    }
  };
}
