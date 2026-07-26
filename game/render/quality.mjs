const LOW = Object.freeze({
  pixelRatio: 1,
  shadows: false,
  antialias: false,
  reedCount: 320,
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
    antialias: true,
    reedCount: 700,
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
