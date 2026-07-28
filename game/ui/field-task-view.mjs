import { createFieldTaskEngine } from '../core/field-task-engine.mjs';

const AIM_STEP = 0.018;
const MAX_FRAME_DELTA = 100;
const FOCUS_KEYS = new Map([
  ['ArrowUp', { x: 0, y: -1 }],
  ['KeyW', { x: 0, y: -1 }],
  ['ArrowDown', { x: 0, y: 1 }],
  ['KeyS', { x: 0, y: 1 }],
  ['ArrowLeft', { x: -1, y: 0 }],
  ['KeyA', { x: -1, y: 0 }],
  ['ArrowRight', { x: 1, y: 0 }],
  ['KeyD', { x: 1, y: 0 }]
]);
const ACTION_KEYS = new Set(['Space', 'Enter', 'KeyE']);

function required(root, selector) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Field task layer is missing ${selector}`);
  return element;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function releaseCapture(element, pointerId) {
  if (!element || pointerId === null) return;
  try {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  } catch {}
}

function capture(element, pointerId) {
  try { element.setPointerCapture(pointerId); } catch {}
}

function resultStatus(stars) {
  if (stars === 3) return '配合默契';
  if (stars === 2) return '稳稳完成';
  return '完成记录';
}

export function createFieldTaskView(root, { onSubmit = () => {}, onCancel = () => {} } = {}) {
  const layer = required(root, '#field-task-layer');
  const teammate = required(layer, '[data-field-teammate]');
  const title = required(layer, '[data-field-title]');
  const cancel = required(layer, '[data-field-cancel]');
  const stage = required(layer, '[data-field-stage]');
  const focusStage = required(layer, '[data-focus-stage]');
  const focusTarget = required(layer, '[data-focus-target]');
  const focusAim = required(layer, '[data-focus-aim]');
  const timingStage = required(layer, '[data-timing-stage]');
  const routeMarker = required(layer, '[data-route-marker]');
  const routeNodes = required(layer, '[data-route-nodes]');
  const listeningStage = required(layer, '[data-listening-stage]');
  const soundWave = required(layer, '[data-sound-wave]');
  const action = required(layer, '[data-field-action]');
  const progress = required(layer, '[data-field-progress]');
  const status = required(layer, '[data-field-status]');
  const result = required(layer, '[data-field-result]');
  const stars = required(layer, '[data-field-stars]');
  const submit = required(layer, '[data-field-submit]');

  let engine = null;
  let animationFrame = null;
  let previousFrame = 0;
  let focusPointer = null;
  let completed = null;
  let submitted = false;
  let cancelled = false;
  let destroyed = false;
  let renderedRouteIndex = -1;
  const heldFocusKeys = new Set();
  const actionPointers = new Set();
  const actionKeys = new Set();
  const styleValues = new Map();
  const dataValues = new Map();
  const textValues = new Map();

  function setData(name, value) {
    const next = String(value);
    if (dataValues.get(name) === next) return;
    dataValues.set(name, next);
    layer.dataset[name] = next;
  }

  function setStyle(element, name, value) {
    const key = `${name}:${element.dataset.fieldStyleKey || element.tagName}`;
    if (styleValues.get(key) === value) return;
    styleValues.set(key, value);
    element.style.setProperty(name, value);
  }

  function setText(element, value) {
    if (textValues.get(element) === value) return;
    textValues.set(element, value);
    element.textContent = value;
  }

  function clearInput() {
    releaseCapture(focusStage, focusPointer);
    focusPointer = null;
    const capturedPointers = [...actionPointers];
    actionPointers.clear();
    for (const pointerId of capturedPointers) releaseCapture(action, pointerId);
    actionKeys.clear();
    heldFocusKeys.clear();
    engine?.actionUp();
  }

  function hasActionOwner() {
    return actionPointers.size + actionKeys.size > 0;
  }

  function addActionOwner(owners, owner) {
    if (owners.has(owner)) return;
    const wasActive = hasActionOwner();
    owners.add(owner);
    if (!wasActive) engine?.actionDown();
  }

  function removeActionOwner(owners, owner) {
    if (!owners.delete(owner)) return;
    if (!hasActionOwner()) engine?.actionUp();
  }

  function stopAnimation() {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    previousFrame = 0;
  }

  function stopTask() {
    stopAnimation();
    clearInput();
    engine?.dispose();
    engine = null;
  }

  function updateAimFromPoint(clientX, clientY) {
    if (!engine || engine.getSnapshot().kind !== 'focus') return;
    const bounds = focusStage.getBoundingClientRect();
    engine.setAim({
      x: clamp01((clientX - bounds.left) / Math.max(bounds.width, 1)),
      y: clamp01((clientY - bounds.top) / Math.max(bounds.height, 1))
    });
  }

  function updateKeyboardAim() {
    if (!engine || !heldFocusKeys.size) return;
    let x = 0;
    let y = 0;
    for (const code of heldFocusKeys) {
      const direction = FOCUS_KEYS.get(code);
      if (!direction) continue;
      x += direction.x;
      y += direction.y;
    }
    const snapshot = engine.getSnapshot();
    engine.setAim({ x: snapshot.aim.x + x * AIM_STEP, y: snapshot.aim.y + y * AIM_STEP });
  }

  function renderRoute(nodes) {
    renderedRouteIndex = -1;
    routeNodes.replaceChildren(...nodes.map((position) => {
      const node = document.createElement('li');
      node.style.setProperty('--node-position', String(position));
      return node;
    }));
  }

  function render(snapshot) {
    setData('taskId', snapshot.id);
    setData('kind', snapshot.kind);
    setData('progress', snapshot.progress.toFixed(4));
    setData('status', snapshot.status);
    setData('quiet', snapshot.quiet);
    setData('routeIndex', snapshot.route.index);
    setStyle(layer, '--progress', snapshot.progress.toFixed(4));
    progress.value = snapshot.progress;

    focusStage.hidden = snapshot.kind !== 'focus';
    timingStage.hidden = snapshot.kind !== 'timing';
    listeningStage.hidden = snapshot.kind !== 'listening';
    action.hidden = snapshot.kind === 'focus' || snapshot.status === 'complete';

    setStyle(focusTarget, '--target-x', `${(snapshot.target.x * 100).toFixed(3)}%`);
    setStyle(focusTarget, '--target-y', `${(snapshot.target.y * 100).toFixed(3)}%`);
    setStyle(focusAim, '--aim-x', `${(snapshot.aim.x * 100).toFixed(3)}%`);
    setStyle(focusAim, '--aim-y', `${(snapshot.aim.y * 100).toFixed(3)}%`);
    setStyle(routeMarker, '--marker-position', `${(snapshot.route.marker * 100).toFixed(3)}%`);
    setStyle(soundWave, '--noise', snapshot.noise.toFixed(4));
    if (renderedRouteIndex !== snapshot.route.index) {
      renderedRouteIndex = snapshot.route.index;
      for (const [index, node] of [...routeNodes.children].entries()) {
        node.dataset.complete = String(index < snapshot.route.index);
      }
    }

    if (snapshot.status === 'complete') {
      completed ||= { id: snapshot.id, stars: snapshot.stars, durationMs: snapshot.elapsedMs, mistakes: snapshot.mistakes };
      result.hidden = false;
      if (stars.dataset.count !== String(snapshot.stars)) {
        stars.dataset.count = String(snapshot.stars);
        stars.replaceChildren(...Array.from({ length: snapshot.stars }, () => {
          const star = document.createElement('span');
          star.textContent = '★';
          return star;
        }));
      }
      stars.setAttribute('aria-label', `获得 ${snapshot.stars} 星`);
      setText(status, resultStatus(snapshot.stars));
      return;
    }

    result.hidden = true;
    setText(status, snapshot.kind === 'focus' ? '调整取景' : snapshot.kind === 'timing' ? '把握节奏' : '保持安静');
  }

  function scheduleFrame() {
    if (animationFrame !== null || !engine || layer.hidden) return;
    animationFrame = requestAnimationFrame((timestamp) => {
      animationFrame = null;
      const delta = previousFrame ? Math.min(MAX_FRAME_DELTA, Math.max(0, timestamp - previousFrame)) : 16;
      previousFrame = timestamp;
      updateKeyboardAim();
      engine?.tick(delta);
      if (!engine) return;
      render(engine.getSnapshot());
      if (engine.getSnapshot().status !== 'complete') scheduleFrame();
    });
  }

  function hide() {
    if (destroyed) return;
    stopTask();
    layer.hidden = true;
  }

  function cancelTask() {
    if (destroyed || layer.hidden || cancelled) return;
    cancelled = true;
    hide();
    onCancel();
  }

  function handleCancel() { cancelTask(); }

  function handleFocusPointerDown(event) {
    if (destroyed || layer.hidden || engine?.getSnapshot().kind !== 'focus') return;
    focusPointer = event.pointerId;
    capture(focusStage, event.pointerId);
    updateAimFromPoint(event.clientX, event.clientY);
    event.preventDefault();
  }

  function handleFocusPointerMove(event) {
    if (destroyed || layer.hidden || engine?.getSnapshot().kind !== 'focus') return;
    updateAimFromPoint(event.clientX, event.clientY);
  }

  function handleFocusPointerEnd(event) {
    if (event.pointerId !== focusPointer) return;
    releaseCapture(focusStage, focusPointer);
    focusPointer = null;
  }

  function handleActionPointerDown(event) {
    if (destroyed || layer.hidden || !engine || engine.getSnapshot().kind === 'focus' || engine.getSnapshot().status !== 'active') return;
    capture(action, event.pointerId);
    addActionOwner(actionPointers, event.pointerId);
    event.preventDefault();
  }

  function handleActionPointerEnd(event) {
    if (!actionPointers.has(event.pointerId)) return;
    actionPointers.delete(event.pointerId);
    releaseCapture(action, event.pointerId);
    if (!hasActionOwner()) engine?.actionUp();
  }

  function handleKeyDown(event) {
    if (destroyed || layer.hidden || !engine) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelTask();
      return;
    }
    const snapshot = engine.getSnapshot();
    if (snapshot.kind === 'focus' && FOCUS_KEYS.has(event.code)) {
      heldFocusKeys.add(event.code);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if ((snapshot.kind === 'timing' || snapshot.kind === 'listening') && ACTION_KEYS.has(event.code)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat && snapshot.kind === 'timing') return;
      addActionOwner(actionKeys, event.code);
    }
  }

  function handleKeyUp(event) {
    if (destroyed || layer.hidden || !engine) return;
    const snapshot = engine.getSnapshot();
    if (snapshot.kind === 'focus' && FOCUS_KEYS.has(event.code)) {
      heldFocusKeys.delete(event.code);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if ((snapshot.kind === 'timing' || snapshot.kind === 'listening') && ACTION_KEYS.has(event.code)) {
      removeActionOwner(actionKeys, event.code);
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function handleVisibility() { clearInput(); }

  function handleSubmit() {
    if (destroyed || !completed || submitted) return;
    submitted = true;
    clearInput();
    onSubmit({ ...completed });
  }

  cancel.addEventListener('click', handleCancel);
  submit.addEventListener('click', handleSubmit);
  focusStage.addEventListener('pointerdown', handleFocusPointerDown);
  focusStage.addEventListener('pointermove', handleFocusPointerMove);
  action.addEventListener('pointerdown', handleActionPointerDown);
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    focusStage.addEventListener(eventName, handleFocusPointerEnd);
    action.addEventListener(eventName, handleActionPointerEnd);
  }
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('keyup', handleKeyUp, true);
  window.addEventListener('blur', handleVisibility);
  document.addEventListener('visibilitychange', handleVisibility);

  return {
    show(config) {
      if (destroyed) return;
      hide();
      completed = null;
      submitted = false;
      cancelled = false;
      engine = createFieldTaskEngine(config);
      renderRoute(config.nodePositions || []);
      setText(teammate, config.teammateName || '队友');
      setText(title, config.title || '实地任务');
      layer.hidden = false;
      render(engine.getSnapshot());
      scheduleFrame();
    },
    hide,
    isOpen() {
      return !destroyed && !layer.hidden;
    },
    getSnapshot() {
      return engine?.getSnapshot() || null;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopTask();
      layer.hidden = true;
      cancel.removeEventListener('click', handleCancel);
      submit.removeEventListener('click', handleSubmit);
      focusStage.removeEventListener('pointerdown', handleFocusPointerDown);
      focusStage.removeEventListener('pointermove', handleFocusPointerMove);
      action.removeEventListener('pointerdown', handleActionPointerDown);
      for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        focusStage.removeEventListener(eventName, handleFocusPointerEnd);
        action.removeEventListener(eventName, handleActionPointerEnd);
      }
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('blur', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    }
  };
}
