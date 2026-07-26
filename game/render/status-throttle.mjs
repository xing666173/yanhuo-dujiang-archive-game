const DEFAULT_INTERVAL = 100;

export function createStatusThrottle({
  emit,
  now = () => performance.now(),
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (timer) => clearTimeout(timer),
  intervalMs = DEFAULT_INTERVAL
}) {
  let lastEmission = -Infinity;
  let pending = null;
  let timer = null;
  let disposed = false;

  function flush() {
    timer = null;
    if (disposed || pending === null) return;
    const elapsed = now() - lastEmission;
    if (elapsed < intervalMs) {
      timer = schedule(flush, intervalMs - elapsed);
      return;
    }
    const value = pending;
    pending = null;
    lastEmission = now();
    emit(value);
  }

  return {
    push(value) {
      if (disposed) return;
      const elapsed = now() - lastEmission;
      if (timer === null && elapsed >= intervalMs) {
        lastEmission = now();
        emit(value);
        return;
      }
      pending = value;
      if (timer === null) {
        timer = schedule(flush, Math.max(0, intervalMs - elapsed));
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pending = null;
      if (timer !== null) cancel(timer);
      timer = null;
    }
  };
}
