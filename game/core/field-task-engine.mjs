const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

export function createFieldTaskEngine(config = {}) {
  if (!['focus', 'timing', 'listening'].includes(config.kind)) {
    throw new TypeError(`Unknown field task kind: ${config.kind}`);
  }
  let disposed = false;
  let elapsedMs = 0;
  let progress = 0;
  let mistakes = 0;
  let actionActive = false;
  let aim = { x: 0.5, y: 0.5 };
  let routeIndex = 0;
  let wasLocked = false;
  let wasQuiet = true;
  let status = 'active';
  let stars = 0;

  function target() {
    const seconds = elapsedMs / 1000;
    return {
      x: clamp01(0.5 + Math.sin(seconds * 0.7) * 0.22),
      y: clamp01(0.5 + Math.cos(seconds * 0.9) * 0.16)
    };
  }

  function marker() {
    const phase = (elapsedMs % config.sweepMs) / config.sweepMs;
    return phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
  }

  function timingWindow() {
    const expected = config.nodePositions?.[routeIndex];
    const tolerance = config.baseTolerance + Math.min(mistakes, 3) * 0.035;
    const error = Math.abs(marker() - expected);
    return {
      ready: config.kind === 'timing'
        && status === 'active'
        && Number.isFinite(expected)
        && Number.isFinite(tolerance)
        && error <= tolerance,
      error,
      tolerance
    };
  }

  function noise() {
    const seconds = elapsedMs / 1000;
    return clamp01(0.46 + Math.sin(seconds * 1.7) * 0.31 + Math.sin(seconds * 4.3) * 0.12);
  }

  function finish() {
    if (progress < 1 || status === 'complete') return;
    status = 'complete';
    actionActive = false;
    if (mistakes <= 1 && elapsedMs <= 18_000) stars = 3;
    else if (mistakes <= 4 && elapsedMs <= 30_000) stars = 2;
    else stars = 1;
  }

  function tick(deltaMs) {
    const delta = Number(deltaMs);
    if (disposed || status !== 'active' || !Number.isFinite(delta) || delta <= 0) return;
    const boundedDelta = Math.min(delta, 100);
    elapsedMs += boundedDelta;
    if (config.kind === 'focus') {
      const nextTarget = target();
      const distance = Math.hypot(aim.x - nextTarget.x, aim.y - nextTarget.y);
      const locked = distance <= config.targetRadius;
      if (wasLocked && !locked) mistakes += 1;
      wasLocked = locked;
      const nextProgress = progress + (locked
        ? boundedDelta / config.lockMs
        : -boundedDelta / 4000);
      progress = nextProgress >= 1 - 1e-12 ? 1 : clamp01(nextProgress);
    }
    if (config.kind === 'listening') {
      const nextNoise = noise();
      const quiet = nextNoise <= config.quietThreshold;
      if (actionActive && wasQuiet && !quiet) mistakes += 1;
      wasQuiet = quiet;
      if (actionActive) {
        const nextProgress = progress + (quiet
          ? boundedDelta / config.recordMs
          : -boundedDelta / 7000);
        progress = nextProgress >= 1 - 1e-12 ? 1 : clamp01(nextProgress);
      }
    }
    finish();
  }

  function actionDown() {
    if (disposed || status !== 'active' || actionActive) return;
    actionActive = true;
    if (config.kind === 'timing') {
      if (timingWindow().ready) {
        routeIndex += 1;
        progress = routeIndex / config.nodePositions.length;
      } else {
        mistakes += 1;
      }
      finish();
    }
  }

  function getSnapshot() {
    const currentTarget = target();
    const currentNoise = noise();
    const currentTimingWindow = timingWindow();
    const locked = config.kind === 'focus'
      && Math.hypot(aim.x - currentTarget.x, aim.y - currentTarget.y) <= config.targetRadius;
    return {
      id: config.id,
      kind: config.kind,
      status,
      progress,
      elapsedMs,
      mistakes,
      stars,
      aim: { ...aim },
      target: currentTarget,
      locked,
      route: {
        index: routeIndex,
        count: config.nodePositions?.length || 0,
        marker: config.kind === 'timing' ? marker() : 0,
        nodes: [...(config.nodePositions || [])],
        ready: currentTimingWindow.ready
      },
      noise: currentNoise,
      quiet: currentNoise <= (config.quietThreshold ?? 1),
      actionActive
    };
  }

  return {
    tick,
    setAim(value = {}) {
      if (disposed || status !== 'active') return;
      if (Number.isFinite(Number(value.x))) aim.x = clamp01(value.x);
      if (Number.isFinite(Number(value.y))) aim.y = clamp01(value.y);
    },
    actionDown,
    actionUp() {
      actionActive = false;
    },
    getSnapshot,
    dispose() {
      disposed = true;
      actionActive = false;
    }
  };
}
