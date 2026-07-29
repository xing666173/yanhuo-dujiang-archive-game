function capture(element, pointerId) {
  try { element.setPointerCapture(pointerId); } catch {}
}

function release(element, pointerId) {
  try {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  } catch {}
}

export function createTouchControls(root, handlers = {}) {
  const controls = root.querySelector('#touch-controls');
  const joystick = controls?.querySelector('[data-joystick]');
  const lookZone = controls?.querySelector('[data-look-zone]');
  const interact = controls?.querySelector('[data-interact]');
  let joystickPointer = null;
  let lookPointer = null;
  let lookStart = null;
  let destroyed = false;

  function move(event) {
    const rect = joystick.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2));
    const y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2));
    handlers.onMove?.({ x, y });
  }

  function reset() {
    if (joystickPointer !== null) release(joystick, joystickPointer);
    if (lookPointer !== null) release(lookZone, lookPointer);
    joystickPointer = null;
    lookPointer = null;
    lookStart = null;
    if (!destroyed) handlers.onMove?.({ x: 0, y: 0 });
  }

  function onJoystickDown(event) {
    if (destroyed) return;
    joystickPointer = event.pointerId;
    capture(joystick, event.pointerId);
    move(event);
  }
  function onJoystickMove(event) {
    if (!destroyed && event.pointerId === joystickPointer) move(event);
  }
  function onJoystickEnd(event) {
    if (!destroyed && event.pointerId === joystickPointer) reset();
  }
  function onLookDown(event) {
    if (destroyed) return;
    lookPointer = event.pointerId;
    lookStart = { x: event.clientX, y: event.clientY };
    capture(lookZone, event.pointerId);
  }
  function onLookMove(event) {
    if (destroyed || event.pointerId !== lookPointer || !lookStart) return;
    handlers.onLook?.({ x: event.clientX - lookStart.x, y: event.clientY - lookStart.y });
    lookStart = { x: event.clientX, y: event.clientY };
  }
  function onLookEnd(event) {
    if (!destroyed && event.pointerId === lookPointer) reset();
  }
  function onLookKeyDown(event) {
    if (destroyed || !['ArrowLeft', 'ArrowRight'].includes(event.code)) return;
    event.preventDefault();
    handlers.onLook?.({ x: event.code === 'ArrowLeft' ? -18 : 18, y: 0 });
  }
  function onInteract() {
    if (!destroyed) handlers.onInteract?.();
  }

  joystick?.addEventListener('pointerdown', onJoystickDown);
  joystick?.addEventListener('pointermove', onJoystickMove);
  lookZone?.addEventListener('pointerdown', onLookDown);
  lookZone?.addEventListener('pointermove', onLookMove);
  lookZone?.addEventListener('keydown', onLookKeyDown);
  interact?.addEventListener('click', onInteract);
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    joystick?.addEventListener(eventName, onJoystickEnd);
    lookZone?.addEventListener(eventName, onLookEnd);
  }

  return {
    reset,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      reset();
      joystick?.removeEventListener('pointerdown', onJoystickDown);
      joystick?.removeEventListener('pointermove', onJoystickMove);
      lookZone?.removeEventListener('pointerdown', onLookDown);
      lookZone?.removeEventListener('pointermove', onLookMove);
      lookZone?.removeEventListener('keydown', onLookKeyDown);
      interact?.removeEventListener('click', onInteract);
      for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        joystick?.removeEventListener(eventName, onJoystickEnd);
        lookZone?.removeEventListener(eventName, onLookEnd);
      }
    }
  };
}
