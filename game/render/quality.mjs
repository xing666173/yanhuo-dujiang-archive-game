const LOW = Object.freeze({
  pixelRatio: 1,
  shadows: false,
  initialAntialias: false,
  reedCount: 320,
  lotusCount: 28,
  waterSegments: 18,
  characterDetail: 0,
  vegetationWind: false,
  shadowMapSize: 0,
  postEffects: false
});

function highPixelRatio(devicePixelRatio) {
  const ratio = Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
  if (ratio <= 1) return 1;
  if (ratio <= 1.5) return 1.5;
  return 2;
}

function highQuality(devicePixelRatio) {
  return {
    pixelRatio: highPixelRatio(devicePixelRatio),
    shadows: true,
    initialAntialias: true,
    reedCount: 760,
    lotusCount: 72,
    waterSegments: 36,
    characterDetail: 1,
    vegetationWind: true,
    shadowMapSize: 2048,
    postEffects: true
  };
}

export function chooseQuality({
  devicePixelRatio = 1,
  coarsePointer = false,
  requested = 'auto'
} = {}) {
  if (requested === 'low') return { ...LOW };
  if (requested === 'high') return highQuality(devicePixelRatio);
  if (coarsePointer || devicePixelRatio > 2) return { ...LOW };
  return highQuality(devicePixelRatio);
}

export function createAutoQualityMonitor({
  thresholdFps = 26,
  durationMs = 5000,
  onDowngrade = () => {}
} = {}) {
  let windowStartedAt = null;
  let frameCount = 0;
  let averageFps = null;
  let downgraded = false;

  function resetWindow(timestamp = null) {
    windowStartedAt = timestamp;
    frameCount = 0;
    averageFps = null;
  }

  return {
    sample(timestamp, { requested = 'auto' } = {}) {
      if (downgraded) return false;
      const now = Number(timestamp);
      if (requested !== 'auto' || !Number.isFinite(now)) {
        resetWindow();
        return false;
      }
      if (windowStartedAt === null || now <= windowStartedAt) {
        resetWindow(now);
        return false;
      }

      frameCount += 1;
      const elapsed = now - windowStartedAt;
      averageFps = frameCount * 1000 / elapsed;
      if (averageFps >= thresholdFps) {
        resetWindow(now);
        return false;
      }
      if (elapsed < durationMs) return false;

      downgraded = true;
      onDowngrade();
      return true;
    },
    reset() {
      resetWindow();
    },
    getState() {
      return {
        averageFps,
        downgraded,
        frameCount,
        windowStartedAt
      };
    }
  };
}

export function detectWebGL(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') return false;
  try {
    return Boolean(
      canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true })
      || canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true })
    );
  } catch {
    return false;
  }
}
