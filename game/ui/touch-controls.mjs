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

  function move(event) {
    const rect = joystick.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2));
    const y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2));
    handlers.onMove?.({ x, y });
  }

  function reset() {
    joystickPointer = null;
    lookPointer = null;
    lookStart = null;
    handlers.onMove?.({ x: 0, y: 0 });
  }

  joystick?.addEventListener('pointerdown', (event) => {
    joystickPointer = event.pointerId;
    capture(joystick, event.pointerId);
    move(event);
  });
  joystick?.addEventListener('pointermove', (event) => {
    if (event.pointerId === joystickPointer) move(event);
  });
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    joystick?.addEventListener(eventName, (event) => {
      if (event.pointerId === joystickPointer) {
        release(joystick, event.pointerId);
        reset();
      }
    });
  }

  lookZone?.addEventListener('pointerdown', (event) => {
    lookPointer = event.pointerId;
    lookStart = { x: event.clientX, y: event.clientY };
    capture(lookZone, event.pointerId);
  });
  lookZone?.addEventListener('pointermove', (event) => {
    if (event.pointerId !== lookPointer || !lookStart) return;
    handlers.onLook?.({ x: event.clientX - lookStart.x, y: event.clientY - lookStart.y });
    lookStart = { x: event.clientX, y: event.clientY };
  });
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    lookZone?.addEventListener(eventName, (event) => {
      if (event.pointerId === lookPointer) {
        release(lookZone, event.pointerId);
        lookPointer = null;
        lookStart = null;
      }
    });
  }
  interact?.addEventListener('click', () => handlers.onInteract?.());

  return { reset };
}
