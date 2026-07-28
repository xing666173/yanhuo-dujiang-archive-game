import { createAudioManager } from './audio/audio-manager.mjs';
import { createMovementInput } from './core/movement-input.mjs';
import { createSaveStore } from './core/save-store.mjs';
import { createSessionController } from './core/session-controller.mjs';
import {
  createInitialStoryState,
  createStoryEngine,
  storyStateCanRestore
} from './core/story-engine.mjs';
import { characters } from './data/characters.mjs';
import { FIELD_TASKS } from './data/field-tasks.mjs';
import { scripts } from './data/scripts.mjs';
import {
  chooseQuality,
  createAutoQualityMonitor,
  detectWebGL
} from './render/quality.mjs';
import { activityRoomDefinition } from './scenes/activity-room.mjs';
import { reedsWetlandDefinition } from './scenes/reeds-wetland.mjs';
import { createDialogueView } from './ui/dialogue-view.mjs';
import { createDirectionalControls } from './ui/directional-controls.mjs';
import { createFieldTaskView } from './ui/field-task-view.mjs';
import { createGameShell } from './ui/game-shell.mjs';
import { createTouchControls } from './ui/touch-controls.mjs';

const requestedMode = new URLSearchParams(location.search).get('mode');
const mode = requestedMode === 'new' ? 'new' : null;
const root = document.querySelector('#game-root');
const canvas = document.querySelector('#game-canvas');
const statusOutput = document.querySelector('#game-status');
const qualityAnnouncement = document.querySelector('#quality-announcement');
const sceneDefinitions = {
  'activity-room': activityRoomDefinition,
  'reeds-wetland': reedsWetlandDefinition
};
const chapterTitles = {
  'activity-room': '出发准备',
  'reeds-wetland': '白洋淀木栈道'
};
let audio = null;
let dialogue = null;
let fieldTask = null;
let rawWorld = null;
let session = null;
let directionalControls = null;
let touchControls = null;
let saveStore = null;
let settings = null;
let activeHotspot = null;
let lastWorldStatus = {
  sceneId: 'activity-room',
  player: [0, 0, 3.4],
  hotspotId: null
};
let desiredMovement = { x: 0, y: 0 };
let movementEnabled = true;
let paused = false;
let pausedContext = null;
let activeWorldQuality = null;
let disposed = false;
let initializationGeneration = 0;
let visibilityHidden = document.hidden;
let lookPointer = null;
let lookPoint = null;

const movementInput = createMovementInput({
  onChange(value) {
    desiredMovement = value;
    applyDesiredMovement();
  }
});

function initializationIsCurrent(generation) {
  return !disposed && generation === initializationGeneration;
}

function disposeResource(resource) {
  try {
    void resource?.dispose?.();
  } catch {}
}

function formatStatus(value = lastWorldStatus) {
  const player = (value.player || [0, 0, 0]).map((coordinate) => Number(coordinate).toFixed(2)).join(',');
  const hotspot = activeHotspot
    ? `${activeHotspot.id}@${activeHotspot.position.map((coordinate) => Number(coordinate).toFixed(2)).join(',')}`
    : 'none';
  return `scene=${value.sceneId}; player=${player}; hotspot=${hotspot}`;
}

function updateStatus(value) {
  if (value) lastWorldStatus = value;
  statusOutput.textContent = formatStatus();
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
  activeWorldQuality = { ...quality };
  statusOutput.dataset.quality = quality.shadows ? 'high' : 'low';
  return true;
}

const qualityMonitor = createAutoQualityMonitor({
  onDowngrade() {
    if (settings?.quality !== 'auto' || statusOutput.dataset.quality !== 'high') return;
    if (!applyWorldQuality('low')) return;
    qualityAnnouncement.textContent = '已切换为流畅画质';
  }
});

function clearPausedState() {
  paused = false;
  pausedContext = null;
  setDialoguePause('pause', false);
}

function consumeStartupMode(expectedMode) {
  const url = new URL(location.href);
  if (url.searchParams.get('mode') !== expectedMode) return;
  url.searchParams.delete('mode');
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function persistSettings(nextSettings) {
  const previousReducedMotion = Boolean(settings?.reducedMotion);
  settings = { ...settings, ...nextSettings };
  saveStore?.saveSettings(settings);
  audio?.applySettings(settings);
  dialogue?.setAutoPlay(settings.autoPlay);
  shell.setAutoPlayActive(settings.autoPlay);
  root.dataset.reducedMotion = String(Boolean(settings.reducedMotion));
  if (
    Object.hasOwn(nextSettings, 'reducedMotion')
    && Boolean(settings.reducedMotion) !== previousReducedMotion
  ) {
    rawWorld?.setReducedMotion(Boolean(settings.reducedMotion));
  }
  if (Object.hasOwn(nextSettings, 'quality')) {
    qualityMonitor.reset();
    applyWorldQuality(settings.quality);
  }
}

function activateCurrentHotspot() {
  if (!gameplayIsActive()) return false;
  const hotspot = rawWorld?.interact();
  if (hotspot) clearMovementInput();
  return session?.activateHotspot(hotspot) || false;
}

const shell = createGameShell(root, {
  onNewGame() {
    clearPausedState();
    clearMovementInput();
    location.href = new URL('./?mode=new', location.href).href;
  },
  onContinue() {
    if (pausedContext) {
      const context = pausedContext;
      clearPausedState();
      shell.showHud({ chapterTitle: chapterTitles[context.sceneId] || '' });
      if (context.dialogueWasActive) dialogue?.show();
      session?.resume();
      applyDesiredMovement();
      void audio?.resume();
      return;
    }
    clearPausedState();
    clearMovementInput();
    void audio?.resume();
    session?.continueSaved();
  },
  onSettings() {
    clearMovementInput();
    return settings || {};
  },
  onSettingsChange: persistSettings,
  onSettingsVisibilityChange(open) {
    setDialoguePause('settings', open);
    if (open) clearMovementInput();
  },
  onPause() {
    if (paused || root.dataset.gameplayActive !== 'true') return;
    pausedContext = {
      dialogueWasActive: root.dataset.dialogueActive === 'true',
      sceneId: lastWorldStatus.sceneId
    };
    paused = true;
    session?.pause();
    clearMovementInput();
    setDialoguePause('pause', true);
    if (pausedContext.dialogueWasActive) dialogue?.hide({ preserve: true });
    void audio?.suspend();
    shell.showMainMenu({ hasSave: true });
  },
  onHistory() {
    if (dialogue?.toggleHistory()) clearMovementInput();
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

fieldTask = createFieldTaskView(root, {
  onSubmit(result) {
    session?.completeFieldTask(result);
  },
  onCancel() {
    session?.cancelFieldTask();
  }
});

statusOutput.textContent = 'scene=activity-room; player=0.00,0.00,3.40; hotspot=none';

function showFallback() {
  root.removeAttribute('data-scene-ready');
  shell.showFallback('当前设备无法启动 3D 场景');
  root.dataset.shellReady = 'true';
}

if (!detectWebGL(document.createElement('canvas'))) {
  showFallback();
} else {
  const generation = ++initializationGeneration;
  void initializeGame(generation);
}

async function initializeGame(generation) {
  if (!initializationIsCurrent(generation)) return;
  saveStore = createSaveStore({ storage: localStorage });
  settings = saveStore.loadSettings();
  root.dataset.reducedMotion = String(Boolean(settings.reducedMotion));
  dialogue.setAutoPlay(settings.autoPlay);
  shell.setAutoPlayActive(settings.autoPlay);

  const quality = resolveQuality(settings.quality);
  activeWorldQuality = { ...quality };
  statusOutput.dataset.quality = quality.shadows ? 'high' : 'low';

  let modelLibraryCandidate = null;
  try {
    const [worldModule, modelAssetsModule, modelLibraryModule] = await Promise.all([
      import('./render/world.mjs'),
      import('./data/model-assets.mjs'),
      import('./render/model-library.mjs')
    ]);
    if (!initializationIsCurrent(generation)) return;

    modelLibraryCandidate = await modelLibraryModule.loadModelLibrary({
      assetRecords: Object.values(modelAssetsModule.MODEL_ASSETS)
    });
    if (!initializationIsCurrent(generation)) {
      disposeResource(modelLibraryCandidate);
      modelLibraryCandidate = null;
      return;
    }
    if (modelLibraryCandidate.failures.size > 0) {
      const failedIds = [...modelLibraryCandidate.failures.keys()].sort();
      console.warn(`[model-fallback] Optional models unavailable: ${failedIds.join(', ')}`);
    }
    const loadedModelIds = new Set(modelLibraryCandidate.loadedIds);
    const loadedModelBytes = Object.values(modelAssetsModule.MODEL_ASSETS)
      .filter((asset) => loadedModelIds.has(asset.id))
      .reduce((total, asset) => total + asset.byteCount, 0);

    const worldCandidate = worldModule.createWorld({
      canvas,
      quality,
      modelLibrary: modelLibraryCandidate,
      loadedModelBytes,
      reducedMotion: Boolean(settings.reducedMotion),
      onHotspotChange(hotspot) {
        if (!initializationIsCurrent(generation)) return;
        activeHotspot = hotspot;
        if (hotspot) root.dataset.hotspot = hotspot.id;
        else root.removeAttribute('data-hotspot');
        shell.setHotspot(hotspot);
        updateStatus();
      },
      onStatusChange(value) {
        if (!initializationIsCurrent(generation)) return;
        updateStatus(value);
      },
      onFrame(timestamp) {
        if (!initializationIsCurrent(generation)) return;
        const requested = settings?.quality === 'auto'
          ? (activeWorldQuality?.shadows ? 'auto' : 'low')
          : settings?.quality;
        qualityMonitor.sample(timestamp, { requested });
      }
    });
    modelLibraryCandidate = null;
    if (!initializationIsCurrent(generation)) {
      disposeResource(worldCandidate);
      return;
    }
    rawWorld = worldCandidate;

    const world = {
      loadScene(sceneId) {
        if (!initializationIsCurrent(generation)) return;
        const definition = sceneDefinitions[sceneId];
        if (!definition) throw new Error(`Unknown scene: ${sceneId}`);
        clearMovementInput();
        activeHotspot = null;
        shell.setHotspot(null);
        rawWorld.loadScene(definition);
        root.dataset.sceneReady = sceneId;
        audio?.setScene(sceneId);
      },
      setMovement(value) {
        if (!initializationIsCurrent(generation)) return;
        rawWorld.setMovement(value);
      },
      setCompletedHotspots(ids) {
        if (!initializationIsCurrent(generation)) return;
        rawWorld.setCompletedHotspots(ids);
      },
      setEchoActive(active) {
        if (!initializationIsCurrent(generation)) return;
        rawWorld.setEchoActive(active);
      },
      captureInteractionState() {
        if (!initializationIsCurrent(generation)) return null;
        const snapshot = {
          quality: activeWorldQuality ? { ...activeWorldQuality } : null,
          movementEnabled
        };
        movementEnabled = false;
        rawWorld.setMovement({ x: 0, y: 0 });
        return snapshot;
      },
      restoreInteractionState(snapshot) {
        if (!initializationIsCurrent(generation) || !snapshot) return;
        if (snapshot.quality) {
          rawWorld.setQuality(snapshot.quality);
          activeWorldQuality = { ...snapshot.quality };
          statusOutput.dataset.quality = snapshot.quality.shadows ? 'high' : 'low';
        }
        movementEnabled = snapshot.movementEnabled;
        applyDesiredMovement();
      }
    };

    let savedProgress = saveStore.loadProgress();
    if (savedProgress && !storyStateCanRestore({ scripts, state: savedProgress.storyState })) {
      saveStore.clearProgress();
      savedProgress = null;
    }
    const storyState = mode === 'new'
      ? createInitialStoryState()
      : savedProgress?.storyState || createInitialStoryState();
    const storyEngine = createStoryEngine({ scripts, state: storyState });
    if (!initializationIsCurrent(generation)) {
      disposeResource(worldCandidate);
      rawWorld = null;
      return;
    }
    const audioCandidate = createAudioManager({
      AudioContextCtor: window.AudioContext || window.webkitAudioContext || null
    });
    if (!initializationIsCurrent(generation)) {
      disposeResource(audioCandidate);
      disposeResource(worldCandidate);
      rawWorld = null;
      return;
    }
    audio = audioCandidate;
    audioCandidate.applySettings(settings);

    const ui = {
      renderNode(node, metadata) {
        if (!initializationIsCurrent(generation)) return;
        clearMovementInput();
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
        if (!initializationIsCurrent(generation)) return;
        dialogue.hide();
      },
      showHud(sceneId) {
        if (!initializationIsCurrent(generation)) return;
        shell.showHud({ chapterTitle: chapterTitles[sceneId] || '' });
      },
      showFieldTask(config) {
        if (!initializationIsCurrent(generation)) return;
        clearMovementInput();
        shell.setFieldTaskActive(true);
        fieldTask.show(config);
      },
      hideFieldTask() {
        if (!initializationIsCurrent(generation)) return;
        fieldTask.hide();
        shell.setFieldTaskActive(false);
      },
      showChapterComplete(summary) {
        if (!initializationIsCurrent(generation)) return;
        const taskList = root.querySelector('[data-complete-tasks]');
        const total = root.querySelector('[data-complete-total]');
        const items = (summary.fieldTasks || []).map(({ id, stars }) => {
          const task = FIELD_TASKS[id];
          const item = root.ownerDocument.createElement('li');
          const starCount = Number(stars) || 0;
          item.textContent = `${task?.title || id} ${'★'.repeat(starCount)} ${starCount} 星`;
          item.setAttribute('aria-label', `${task?.title || id} ${starCount} 星`);
          return item;
        });
        taskList?.replaceChildren(...items);
        if (total) total.textContent = `协作评价 ${summary.totalStars || 0} / 9`;
        shell.showChapterComplete(summary);
      },
      setEchoActive(active) {
        if (!initializationIsCurrent(generation)) return;
        if (active) clearMovementInput();
        if (active) root.dataset.echoActive = 'true';
        else root.removeAttribute('data-echo-active');
        dialogue.setPaused('echo', active);
      }
    };

    if (!initializationIsCurrent(generation)) {
      disposeResource(audioCandidate);
      audio = null;
      disposeResource(worldCandidate);
      rawWorld = null;
      return;
    }
    const sessionCandidate = createSessionController({ storyEngine, saveStore, world, ui });
    if (!initializationIsCurrent(generation)) {
      disposeResource(sessionCandidate);
      disposeResource(audioCandidate);
      audio = null;
      disposeResource(worldCandidate);
      rawWorld = null;
      return;
    }
    session = sessionCandidate;
    rawWorld.resize();
    if (!initializationIsCurrent(generation)) {
      disposeResource(sessionCandidate);
      session = null;
      disposeResource(audioCandidate);
      audio = null;
      disposeResource(worldCandidate);
      rawWorld = null;
      return;
    }
    if (!document.hidden) {
      rawWorld.start();
    }

    if (mode === 'new') {
      session.startNew();
      consumeStartupMode('new');
    } else {
      shell.showMainMenu({ hasSave: Boolean(savedProgress) });
    }
    root.dataset.shellReady = 'true';
  } catch (error) {
    disposeResource(modelLibraryCandidate);
    modelLibraryCandidate = null;
    if (!initializationIsCurrent(generation)) {
      disposeResource(session);
      session = null;
      disposeResource(audio);
      audio = null;
      disposeResource(rawWorld);
      rawWorld = null;
      return;
    }
    console.error(error);
    disposeResource(session);
    session = null;
    disposeResource(audio);
    audio = null;
    disposeResource(rawWorld);
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
    && root.dataset.gameplayActive === 'true'
    && root.dataset.fieldTaskActive !== 'true'
    && root.dataset.dialogueActive !== 'true'
    && root.dataset.echoActive !== 'true'
    && root.dataset.historyOpen !== 'true'
    && !shell.isSettingsOpen()
  );
}

function applyDesiredMovement() {
  rawWorld?.setMovement(
    gameplayIsActive() ? desiredMovement : { x: 0, y: 0 }
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
  movementInput.setSource('keyboard', { x, y });
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

function clearMovementInput() {
  heldKeys.clear();
  touchControls?.reset();
  directionalControls?.reset();
  movementInput.clearAll();
  rawWorld?.setMovement({ x: 0, y: 0 });
  clearLookInput();
}

function clearLookInput() {
  const pointerId = lookPointer;
  lookPointer = null;
  lookPoint = null;
  if (pointerId === null) return;
  try {
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  } catch {}
}

function handleLookStart(event) {
  if (!gameplayIsActive() || event.button !== 0) return;
  lookPointer = event.pointerId;
  lookPoint = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function handleLookMove(event) {
  if (!gameplayIsActive()) {
    clearLookInput();
    return;
  }
  if (event.pointerId !== lookPointer || !lookPoint) return;
  rawWorld?.addLookDelta({
    x: event.clientX - lookPoint.x,
    y: event.clientY - lookPoint.y
  });
  lookPoint = { x: event.clientX, y: event.clientY };
}

function handleLookEnd(event) {
  if (event.pointerId !== lookPointer) return;
  clearLookInput();
}

touchControls = createTouchControls(root, {
  onMove(value) {
    movementInput.setSource('touch', { x: value.x, y: -value.y });
  },
  onLook(value) {
    if (gameplayIsActive()) rawWorld?.addLookDelta(value);
  },
  onInteract: activateCurrentHotspot
});

directionalControls = createDirectionalControls(root, {
  onMove(value) {
    movementInput.setSource('desktop', value);
  }
});

function handleResize() {
  rawWorld?.resize();
}

function handleVisibilityChange() {
  if (disposed) return;
  const hidden = document.hidden;
  if (hidden === visibilityHidden) return;
  visibilityHidden = hidden;
  setDialoguePause('visibility', hidden);
  if (hidden) {
    rawWorld?.stop();
    qualityMonitor.reset();
    clearMovementInput();
    void audio?.suspend();
  } else {
    rawWorld?.start();
    void audio?.resume();
  }
}

async function unlockAudio() {
  if (disposed || !audio) return;
  for (const eventName of ['pointerdown', 'keydown', 'touchstart']) {
    window.removeEventListener(eventName, unlockAudio, true);
  }
  await audio?.unlock();
}

window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);
window.addEventListener('blur', clearMovementInput);
window.addEventListener('resize', handleResize);
document.addEventListener('visibilitychange', handleVisibilityChange);
for (const eventName of ['pointerdown', 'keydown', 'touchstart']) {
  window.addEventListener(eventName, unlockAudio, { capture: true });
}
canvas.addEventListener('pointerdown', handleLookStart);
canvas.addEventListener('pointermove', handleLookMove);
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(eventName, handleLookEnd);
}

window.addEventListener('pagehide', () => {
  if (disposed) return;
  clearMovementInput();
  disposed = true;
  initializationGeneration += 1;
  qualityMonitor.reset();
  directionalControls?.destroy();
  directionalControls = null;
  touchControls?.destroy();
  touchControls = null;
  fieldTask?.destroy();
  fieldTask = null;
  session?.dispose();
  session = null;
  dialogue?.destroy();
  dialogue = null;
  disposeResource(audio);
  audio = null;
  disposeResource(rawWorld);
  rawWorld = null;
  shell.destroy();
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  window.removeEventListener('blur', clearMovementInput);
  window.removeEventListener('resize', handleResize);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  for (const eventName of ['pointerdown', 'keydown', 'touchstart']) {
    window.removeEventListener(eventName, unlockAudio, true);
  }
  canvas.removeEventListener('pointerdown', handleLookStart);
  canvas.removeEventListener('pointermove', handleLookMove);
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.removeEventListener(eventName, handleLookEnd);
  }
}, { once: true });
