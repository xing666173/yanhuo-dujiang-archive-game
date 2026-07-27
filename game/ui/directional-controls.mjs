const DIRECTIONS = {
  up: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: -1 }
};

function capture(element, pointerId) {
  try { element.setPointerCapture(pointerId); } catch {}
}

function release(element, pointerId) {
  try {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  } catch {}
}

export function createDirectionalControls(root, { onMove = () => {} } = {}) {
  const controls = root.querySelector('#desktop-controls');
  const buttons = [...(controls?.querySelectorAll('[data-direction]') || [])];
  let pointer = null;
  let destroyed = false;

  function reset() {
    if (pointer) release(pointer.element, pointer.id);
    pointer = null;
    onMove({ x: 0, y: 0 });
  }

  function onPointerDown(event) {
    if (destroyed || !DIRECTIONS[event.currentTarget.dataset.direction]) return;
    pointer = { element: event.currentTarget, id: event.pointerId };
    capture(pointer.element, pointer.id);
    event.stopPropagation();
    onMove({ ...DIRECTIONS[event.currentTarget.dataset.direction] });
  }

  function onPointerEnd(event) {
    if (destroyed || !pointer || event.pointerId !== pointer.id) return;
    release(pointer.element, pointer.id);
    pointer = null;
    onMove({ x: 0, y: 0 });
  }

  for (const button of buttons) {
    button.addEventListener('pointerdown', onPointerDown);
    for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(eventName, onPointerEnd);
    }
  }

  return {
    reset,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const button of buttons) {
        button.removeEventListener('pointerdown', onPointerDown);
        for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
          button.removeEventListener(eventName, onPointerEnd);
        }
      }
      reset();
    }
  };
}
