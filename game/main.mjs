import { createGameShell } from './ui/game-shell.mjs';
import { createTouchControls } from './ui/touch-controls.mjs';
import { activityRoomDefinition } from './scenes/activity-room.mjs';
import { reedsWetlandDefinition } from './scenes/reeds-wetland.mjs';
import { chooseQuality, detectWebGL } from './render/quality.mjs';
import { createWorld } from './render/world.mjs';

const root = document.querySelector('#game-root');
const canvas = document.querySelector('#game-canvas');
const status = document.querySelector('#game-status');
const parameters = new URLSearchParams(location.search);
const previewScene = parameters.get('scene') === 'reeds-wetland'
  ? reedsWetlandDefinition
  : activityRoomDefinition;
let world = null;

const shell = createGameShell(root, {
  onNewGame() {
    shell.showHud({ chapterTitle: previewScene.id === 'activity-room' ? '出发准备' : '白洋淀木栈道' });
  },
  onTeacherBrowse() {},
  onSettings() {
    clearKeyboardMovement();
  }
});

function showFallback() {
  root.removeAttribute('data-scene-ready');
  shell.showFallback('当前设备无法启动三维场景，请开启浏览器硬件加速后重试。');
}

if (!detectWebGL(document.createElement('canvas'))) {
  showFallback();
} else {
  try {
    const quality = chooseQuality({
      devicePixelRatio: window.devicePixelRatio,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      requested: parameters.get('quality') || 'auto'
    });
    world = createWorld({
      canvas,
      quality,
      onHotspotChange(hotspot) {
        if (hotspot) root.dataset.hotspot = hotspot.id;
        else root.removeAttribute('data-hotspot');
      },
      onStatusChange(value) {
        status.textContent = JSON.stringify(value);
      }
    });
    world.loadScene(previewScene);
    world.resize();
    world.start();
    root.dataset.sceneReady = previewScene.id;
  } catch (error) {
    console.error(error);
    world?.dispose();
    world = null;
    showFallback();
  }
}

if (world && parameters.get('mode') === 'new') {
  shell.showHud({ chapterTitle: previewScene.id === 'activity-room' ? '出发准备' : '白洋淀木栈道' });
} else if (world) {
  shell.showMainMenu({ hasSave: false });
}

const movementKeys = new Map([
  ['KeyW', [0, 1]],
  ['ArrowUp', [0, 1]],
  ['KeyS', [0, -1]],
  ['ArrowDown', [0, -1]],
  ['KeyA', [-1, 0]],
  ['ArrowLeft', [-1, 0]],
  ['KeyD', [1, 0]],
  ['ArrowRight', [1, 0]]
]);
const heldKeys = new Set();

function gameplayIsActive() {
  return Boolean(world && root.dataset.touchEligible === 'true');
}

function syncKeyboardMovement() {
  let x = 0;
  let y = 0;
  for (const code of heldKeys) {
    const direction = movementKeys.get(code);
    if (!direction) continue;
    x += direction[0];
    y += direction[1];
  }
  world?.setMovement({ x, y });
}

function handleKeyDown(event) {
  if (!movementKeys.has(event.code) || !gameplayIsActive()) return;
  event.preventDefault();
  heldKeys.add(event.code);
  syncKeyboardMovement();
}

function handleKeyUp(event) {
  if (!movementKeys.has(event.code)) return;
  heldKeys.delete(event.code);
  syncKeyboardMovement();
}

function clearKeyboardMovement() {
  heldKeys.clear();
  world?.setMovement({ x: 0, y: 0 });
}

let lookPointer = null;
let lookPoint = null;

function handleLookStart(event) {
  if (!gameplayIsActive() || event.button !== 0) return;
  lookPointer = event.pointerId;
  lookPoint = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function handleLookMove(event) {
  if (event.pointerId !== lookPointer || !lookPoint) return;
  world?.addLookDelta({
    x: event.clientX - lookPoint.x,
    y: event.clientY - lookPoint.y
  });
  lookPoint = { x: event.clientX, y: event.clientY };
}

function handleLookEnd(event) {
  if (event.pointerId !== lookPointer) return;
  try {
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  } catch {}
  lookPointer = null;
  lookPoint = null;
}

const touchControls = createTouchControls(root, {
  onMove(value) {
    if (gameplayIsActive()) world?.setMovement({ x: value.x, y: -value.y });
  },
  onLook(value) {
    if (gameplayIsActive()) world?.addLookDelta(value);
  },
  onInteract() {
    if (gameplayIsActive()) world?.interact();
  }
});

function handleResize() {
  world?.resize();
}

window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);
window.addEventListener('blur', clearKeyboardMovement);
window.addEventListener('resize', handleResize);
canvas.addEventListener('pointerdown', handleLookStart);
canvas.addEventListener('pointermove', handleLookMove);
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(eventName, handleLookEnd);
}

window.addEventListener('pagehide', () => {
  touchControls.destroy();
  world?.dispose();
  shell.destroy();
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  window.removeEventListener('blur', clearKeyboardMovement);
  window.removeEventListener('resize', handleResize);
  canvas.removeEventListener('pointerdown', handleLookStart);
  canvas.removeEventListener('pointermove', handleLookMove);
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.removeEventListener(eventName, handleLookEnd);
  }
}, { once: true });

root.dataset.shellReady = 'true';
