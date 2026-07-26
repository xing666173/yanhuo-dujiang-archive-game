import { createAudioManager } from './audio/audio-manager.mjs';
import { createSaveStore } from './core/save-store.mjs';
import { createSessionController } from './core/session-controller.mjs';
import { createInitialStoryState, createStoryEngine } from './core/story-engine.mjs';
import { characters } from './data/characters.mjs';
import { scripts } from './data/scripts.mjs';
import { chooseQuality, detectWebGL } from './render/quality.mjs';
import { createWorld } from './render/world.mjs';
import { activityRoomDefinition } from './scenes/activity-room.mjs';
import { reedsWetlandDefinition } from './scenes/reeds-wetland.mjs';
import { createDialogueView } from './ui/dialogue-view.mjs';
import { createGameShell } from './ui/game-shell.mjs';
import { createTouchControls } from './ui/touch-controls.mjs';

const parameters = new URLSearchParams(location.search);
const mode = parameters.get('mode');
const root = document.querySelector('#game-root');
const canvas = document.querySelector('#game-canvas');
const statusOutput = document.querySelector('#game-status');
const sceneDefinitions = {
  'activity-room': activityRoomDefinition,
  'reeds-wetland': reedsWetlandDefinition
};
const chapterTitles = {
  'activity-room': '出发准备',
  'reeds-wetland': '白洋淀木栈道'
};
const teacherChapters = [
  { id: 'activity-room', title: '出发准备', description: '查看团队在活动室确定记录方法。' },
  { id: 'reeds-wetland', title: '白洋淀木栈道', description: '直接进入芦苇湿地探索场景。' }
];

let audio = null;
let dialogue = null;
let rawWorld = null;
let session = null;
let touchControls = null;
let saveStore = null;
let settings = null;
let activeHotspot = null;
let lastWorldStatus = {
  sceneId: 'activity-room',
  player: [0, 0, 3.4],
  hotspotId: null
};
let currentMovement = { x: 0, y: 0 };
let movementEnabled = true;
let paused = false;

function formatStatus(value = lastWorldStatus) {
  const player = (value.player || [0, 0, 0]).map((coordinate) => Number(coordinate).toFixed(2)).join(',');
  const hotspot = activeHotspot
    ? `${activeHotspot.id}@${activeHotspot.position.map((coordinate) => Number(coordinate).toFixed(2)).join(',')}`
    : 'none';
  return `scene=${value.sceneId}; player=${player}; hotspot=${hotspot}`;
}

function updateStatus(value) {
  if (value) lastWorldStatus = value;
  statusOutput.textContent = parameters.get('testHud') === '1'
    ? JSON.stringify(lastWorldStatus)
    : formatStatus();
}

function setDialoguePause(reason, value) {
  dialogue?.setPaused(reason, value);
}

function resolveQuality(requested) {
  return chooseQuality({
    devicePixelRatio: window.devicePixelRatio,
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    requested
  });
}

function applyWorldQuality(requested) {
  const quality = resolveQuality(requested);
  if (!rawWorld?.setQuality(quality)) return false;
  statusOutput.dataset.quality = quality.shadows ? 'high' : 'low';
  return true;
}

function persistSettings(nextSettings) {
  settings = { ...settings, ...nextSettings };
  saveStore?.saveSettings(settings);
  audio?.applySettings(settings);
  dialogue?.setAutoPlay(settings.autoPlay);
  shell.setAutoPlayActive(settings.autoPlay);
  root.dataset.reducedMotion = String(Boolean(settings.reducedMotion));
  if (Object.hasOwn(nextSettings, 'quality')) applyWorldQuality(settings.quality);
}

function showTeacherMenu() {
  dialogue?.hide();
  shell.showChapterMenu({ chapters: teacherChapters });
}

function activateCurrentHotspot() {
  if (!gameplayIsActive()) return false;
  const hotspot = rawWorld?.interact();
  return session?.activateHotspot(hotspot) || false;
}

const shell = createGameShell(root, {
  onNewGame() {
    location.href = new URL('./?mode=new', location.href).href;
  },
  onContinue() {
    paused = false;
    setDialoguePause('pause', false);
    void audio?.resume();
    session?.continueSaved();
  },
  onTeacherBrowse: showTeacherMenu,
  onChapterSelect(sceneId) {
    paused = false;
    session?.openTeacherChapter(sceneId);
  },
  onSettings() {
    clearKeyboardMovement();
    return settings || {};
  },
  onSettingsChange: persistSettings,
  onSettingsVisibilityChange(open) {
    setDialoguePause('settings', open);
    if (open) clearKeyboardMovement();
  },
  onPause() {
    paused = true;
    clearKeyboardMovement();
    setDialoguePause('pause', true);
    void audio?.suspend();
    shell.showMainMenu({ hasSave: Boolean(saveStore?.loadProgress()) });
  },
  onHistory() {
    dialogue?.toggleHistory();
  },
  onAutoPlay() {
    persistSettings({ autoPlay: !settings.autoPlay });
  },
  onInteract: activateCurrentHotspot
});

dialogue = createDialogueView(root, {
  onAdvance() {
    audio?.playUiCue('advance');
    session?.advanceDialogue();
  },
  onChoice(choice) {
    audio?.playUiCue('choice');
    session?.choose(choice.id);
  }
});

statusOutput.textContent = 'scene=activity-room; player=0.00,0.00,3.40; hotspot=none';

function showFallback() {
  root.removeAttribute('data-scene-ready');
  shell.showFallback('当前设备无法启动三维场景，请开启浏览器硬件加速后重试。');
}

if (!detectWebGL(document.createElement('canvas'))) {
  showFallback();
} else {
  saveStore = createSaveStore({ storage: localStorage });
  settings = saveStore.loadSettings();
  root.dataset.reducedMotion = String(Boolean(settings.reducedMotion));
  dialogue.setAutoPlay(settings.autoPlay);
  shell.setAutoPlayActive(settings.autoPlay);

  const quality = resolveQuality(settings.quality);
  statusOutput.dataset.quality = quality.shadows ? 'high' : 'low';

  try {
    rawWorld = createWorld({
      canvas,
      quality,
      onHotspotChange(hotspot) {
        activeHotspot = hotspot;
        if (hotspot) root.dataset.hotspot = hotspot.id;
        else root.removeAttribute('data-hotspot');
        shell.setHotspot(hotspot);
        updateStatus();
      },
      onStatusChange(value) {
        updateStatus(value);
      }
    });

    const world = {
      loadScene(sceneId) {
        const definition = sceneDefinitions[sceneId];
        if (!definition) throw new Error(`Unknown scene: ${sceneId}`);
        activeHotspot = null;
        shell.setHotspot(null);
        rawWorld.loadScene(definition);
        root.dataset.sceneReady = sceneId;
        audio?.setScene(sceneId);
      },
      setMovement(value) {
        if (!movementEnabled) {
          rawWorld.setMovement({ x: 0, y: 0 });
          return;
        }
        currentMovement = {
          x: Number(value?.x) || 0,
          y: Number(value?.y) || 0
        };
        rawWorld.setMovement(currentMovement);
      },
      setEchoActive(active) {
        rawWorld.setEchoActive(active);
      },
      captureInteractionState() {
        const snapshot = {
          movement: { ...currentMovement },
          quality: settings.quality,
          movementEnabled
        };
        movementEnabled = false;
        rawWorld.setMovement({ x: 0, y: 0 });
        return snapshot;
      },
      restoreInteractionState(snapshot) {
        settings.quality = snapshot.quality;
        saveStore.saveSettings(settings);
        applyWorldQuality(settings.quality);
        currentMovement = { ...snapshot.movement };
        movementEnabled = snapshot.movementEnabled;
        rawWorld.setMovement(movementEnabled ? currentMovement : { x: 0, y: 0 });
      }
    };

    const savedProgress = saveStore.loadProgress();
    const storyState = mode === 'new' || mode === 'teacher'
      ? createInitialStoryState()
      : savedProgress?.storyState || createInitialStoryState();
    const storyEngine = createStoryEngine({ scripts, state: storyState });
    audio = createAudioManager({
      AudioContextCtor: window.AudioContext || window.webkitAudioContext || null
    });
    audio.applySettings(settings);

    const ui = {
      renderNode(node, metadata) {
        const character = node.speaker === 'echo'
          ? { name: '回响 · 艺术化表达' }
          : characters[node.speaker] || { name: node.speaker || '' };
        dialogue.renderNode({
          ...node,
          choices: node.options || []
        }, character, metadata);
        dialogue.show();
      },
      hideDialogue() {
        dialogue.hide();
      },
      showHud(sceneId) {
        shell.showHud({ chapterTitle: chapterTitles[sceneId] || '' });
      },
      showChapterComplete(summary) {
        shell.showChapterComplete(summary);
      },
      setEchoActive(active) {
        if (active) root.dataset.echoActive = 'true';
        else root.removeAttribute('data-echo-active');
        dialogue.setPaused('echo', active);
      }
    };

    session = createSessionController({ storyEngine, saveStore, world, ui });
    rawWorld.resize();
    rawWorld.start();

    if (parameters.get('testHud') === '1') {
      const sceneId = parameters.get('scene') === 'reeds-wetland' ? 'reeds-wetland' : 'activity-room';
      world.loadScene(sceneId);
      ui.showHud(sceneId);
      dialogue.hide();
    } else if (mode === 'new') {
      session.startNew();
    } else if (mode === 'teacher') {
      showTeacherMenu();
    } else {
      shell.showMainMenu({ hasSave: Boolean(savedProgress) });
    }
  } catch (error) {
    console.error(error);
    rawWorld?.dispose();
    rawWorld = null;
    showFallback();
  }
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
  return Boolean(
    rawWorld
    && movementEnabled
    && !paused
    && root.dataset.touchEligible === 'true'
    && root.dataset.dialogueActive !== 'true'
    && root.dataset.echoActive !== 'true'
    && !shell.isSettingsOpen()
  );
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
  if (movementEnabled) {
    currentMovement = { x, y };
    rawWorld?.setMovement(currentMovement);
  } else {
    rawWorld?.setMovement({ x: 0, y: 0 });
  }
}

function handleKeyDown(event) {
  if (movementKeys.has(event.code) && gameplayIsActive()) {
    event.preventDefault();
    heldKeys.add(event.code);
    syncKeyboardMovement();
    return;
  }
  if (['KeyE', 'Enter', 'Space'].includes(event.code) && gameplayIsActive() && activeHotspot) {
    event.preventDefault();
    activateCurrentHotspot();
  }
}

function handleKeyUp(event) {
  if (!movementKeys.has(event.code)) return;
  heldKeys.delete(event.code);
  syncKeyboardMovement();
}

function clearKeyboardMovement() {
  heldKeys.clear();
  currentMovement = { x: 0, y: 0 };
  rawWorld?.setMovement({ x: 0, y: 0 });
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
  rawWorld?.addLookDelta({
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

touchControls = createTouchControls(root, {
  onMove(value) {
    if (gameplayIsActive()) {
      currentMovement = { x: value.x, y: -value.y };
      rawWorld?.setMovement(currentMovement);
    }
  },
  onLook(value) {
    if (gameplayIsActive()) rawWorld?.addLookDelta(value);
  },
  onInteract: activateCurrentHotspot
});

function handleResize() {
  rawWorld?.resize();
}

function handleVisibilityChange() {
  const hidden = document.hidden;
  setDialoguePause('visibility', hidden);
  if (hidden) {
    clearKeyboardMovement();
    void audio?.suspend();
  } else {
    void audio?.resume();
  }
}

async function unlockAudio() {
  for (const eventName of ['pointerdown', 'keydown', 'touchstart']) {
    window.removeEventListener(eventName, unlockAudio, true);
  }
  await audio?.unlock();
}

window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);
window.addEventListener('blur', clearKeyboardMovement);
window.addEventListener('resize', handleResize);
document.addEventListener('visibilitychange', handleVisibilityChange);
for (const eventName of ['pointerdown', 'keydown', 'touchstart']) {
  window.addEventListener(eventName, unlockAudio, { capture: true, once: true });
}
canvas.addEventListener('pointerdown', handleLookStart);
canvas.addEventListener('pointermove', handleLookMove);
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(eventName, handleLookEnd);
}

window.addEventListener('pagehide', () => {
  touchControls?.destroy();
  session?.dispose();
  dialogue?.destroy();
  void audio?.dispose();
  rawWorld?.dispose();
  shell.destroy();
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  window.removeEventListener('blur', clearKeyboardMovement);
  window.removeEventListener('resize', handleResize);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  canvas.removeEventListener('pointerdown', handleLookStart);
  canvas.removeEventListener('pointermove', handleLookMove);
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.removeEventListener(eventName, handleLookEnd);
  }
}, { once: true });

root.dataset.shellReady = 'true';
