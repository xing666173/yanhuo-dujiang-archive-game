import * as THREE from '../vendor/three.module.min.js';
import { characterVisuals } from '../data/character-visuals.mjs';
import { resolveWalkablePosition } from '../core/navigation.mjs';
import { getNearestHotspot } from '../core/proximity.mjs';
import { calculateThirdPersonCamera } from './camera-rig.mjs';
import { buildScene } from './scene-builder.mjs';
import { createCharacterModel } from './character-model.mjs';
import { createResourceStore } from './resource-store.mjs';
import { createStatusThrottle } from './status-throttle.mjs';

const MOVE_SPEED = 3.2;
const MAX_DELTA = 0.05;

function pickLiveQuality(quality) {
  return {
    pixelRatio: quality.pixelRatio,
    shadows: quality.shadows,
    reedCount: quality.reedCount,
    lotusCount: quality.lotusCount,
    waterSegments: quality.waterSegments,
    characterDetail: quality.characterDetail,
    vegetationWind: quality.vegetationWind,
    shadowMapSize: quality.shadowMapSize,
    postEffects: quality.postEffects
  };
}

function cloneHotspot(hotspot) {
  if (!hotspot) return null;
  return {
    ...hotspot,
    position: [...hotspot.position]
  };
}

export function createWorld({
  canvas,
  quality,
  modelLibrary = null,
  reducedMotion = false,
  onHotspotChange = () => {},
  onStatusChange = () => {},
  onFrame = () => {}
}) {
  let activeQuality = pickLiveQuality(quality);
  let activeReducedMotion = Boolean(reducedMotion);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: Boolean(quality.initialAntialias),
    alpha: false,
    powerPreference: 'high-performance'
  });
  const rendererAntialias = Boolean(renderer.getContext().getContextAttributes()?.antialias);
  renderer.setPixelRatio(activeQuality.pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = activeQuality.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const sceneRoot = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.08, 100);
  const playerResources = createResourceStore();
  const playerModel = createCharacterModel({
    ...characterVisuals.player,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0.9, 1.72, 0.88],
    pose: 'neutral'
  }, { resources: playerResources, quality: activeQuality });
  const player = new THREE.Group();
  player.name = 'player-character';
  player.userData.modelSource = 'procedural';
  playerModel.group.userData.modelSource = 'procedural';
  player.add(playerModel.group);
  sceneRoot.add(player);
  scene.add(sceneRoot);

  const timer = new THREE.Timer();
  const movement = { x: 0, y: 0 };
  let definition = null;
  let builtScene = null;
  let activeHotspot = null;
  let activeHotspotId = null;
  let yaw = 0;
  let echoActive = false;
  const completedHotspotIds = new Set();
  let wantsAnimation = false;
  let animationFrame = null;
  let disposed = false;
  let playerAction = 'Idle';

  function writeDiagnostic(name, value) {
    const serialized = String(value);
    if (canvas.dataset[name] !== serialized) canvas.dataset[name] = serialized;
  }

  function syncPlayerRootDiagnostics() {
    writeDiagnostic('playerRootName', player.name);
    writeDiagnostic('playerModelSource', player.userData.modelSource);
    writeDiagnostic(
      'playerRootCount',
      sceneRoot.getObjectsByProperty('name', player.name).length
    );
  }

  function syncRendererDiagnostics() {
    writeDiagnostic('rendererAntialias', rendererAntialias);
  }

  function syncPlayerPositionDiagnostic(position) {
    writeDiagnostic(
      'playerPosition',
      `${position[0].toFixed(4)},${position[1].toFixed(4)},${position[2].toFixed(4)}`
    );
  }

  function syncPlayerYawDiagnostic() {
    writeDiagnostic('playerYaw', player.rotation.y.toFixed(6));
  }

  function syncCameraYawDiagnostic() {
    writeDiagnostic('cameraYaw', yaw.toFixed(6));
  }

  function syncCompletedHotspotsDiagnostic() {
    writeDiagnostic('completedHotspots', [...completedHotspotIds].sort().join(','));
  }

  function syncMovementDiagnostic() {
    writeDiagnostic('movement', `${movement.x.toFixed(4)},${movement.y.toFixed(4)}`);
  }

  function syncPlayerActionDiagnostic() {
    const nextAction = Math.hypot(movement.x, movement.y) > 0.02 ? 'Walk' : 'Idle';
    playerAction = nextAction;
    writeDiagnostic('playerAction', playerAction);
  }

  function syncCharacterDiagnostics() {
    let namedCharacterRootCount = 0;
    builtScene?.group.traverse((object) => {
      if (object.userData.characterId) namedCharacterRootCount += 1;
    });
    writeDiagnostic('modelLibraryReady', Boolean(modelLibrary));
    writeDiagnostic('importedCharacterCount', builtScene?.importedCharacterCount ?? 0);
    writeDiagnostic('namedCharacterCount', builtScene?.namedCharacterCount ?? 0);
    writeDiagnostic('namedCharacterRootCount', namedCharacterRootCount);
    writeDiagnostic(
      'activeAnimationMixerCount',
      modelLibrary?.getActiveAnimationMixerCount?.() ?? 0
    );
    writeDiagnostic('characterModelIds', builtScene?.characterModelIds?.join(',') ?? '');
  }

  function syncEnvironmentDiagnostics() {
    writeDiagnostic('importedEnvironmentCount', builtScene?.importedEnvironmentCount ?? 0);
    writeDiagnostic('environmentModelIds', builtScene?.environmentModelIds?.join(',') ?? '');
    writeDiagnostic(
      'importedEnvironmentTriangles',
      builtScene?.importedEnvironmentTriangles ?? 0
    );
    writeDiagnostic(
      'importedEnvironmentDrawCalls',
      builtScene?.importedEnvironmentDrawCalls ?? 0
    );
    writeDiagnostic('activeQuality', activeQuality.vegetationWind ? 'high' : 'low');
  }

  function updatePlayerFacing() {
    const magnitude = Math.hypot(movement.x, movement.y);
    if (magnitude <= 0.02) return;
    const divisor = Math.max(1, magnitude);
    const inputX = movement.x / divisor;
    const inputY = movement.y / divisor;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const directionX = rightX * inputX + forwardX * inputY;
    const directionZ = rightZ * inputX + forwardZ * inputY;
    player.rotation.y = Math.atan2(directionX, directionZ) + Math.PI;
    syncPlayerYawDiagnostic();
  }

  function syncVisualBoundsDiagnostics() {
    if (!definition || !builtScene) return;
    const surfaceY = Number(definition.visualSurfaceHeight) || 0;
    sceneRoot.updateMatrixWorld(true);
    const playerBounds = new THREE.Box3().setFromObject(playerModel.group);
    let markerMinY = Infinity;
    for (const marker of builtScene.markerById.values()) {
      const markerBounds = new THREE.Box3().setFromObject(marker);
      markerMinY = Math.min(markerMinY, markerBounds.min.y);
    }
    writeDiagnostic('visualSurfaceY', surfaceY.toFixed(6));
    writeDiagnostic('playerFootMinY', playerBounds.min.y.toFixed(6));
    writeDiagnostic('hotspotMarkerMinY', Number.isFinite(markerMinY)
      ? markerMinY.toFixed(6)
      : '');
  }

  const statusThrottle = createStatusThrottle({
    emit(value) {
      syncPlayerPositionDiagnostic(value.player);
      onStatusChange(value);
    }
  });

  function updateCamera() {
    const compactViewport = matchMedia('(pointer: coarse)').matches || innerWidth < 900;
    const cameraDistance = compactViewport
      ? definition?.environment.mobileCameraDistance || definition?.environment.cameraDistance || 4.5
      : definition?.environment.cameraDistance || 4.5;
    const targetHeight = definition?.environment.cameraTargetHeight || 0.85;
    const shoulder = definition?.environment.cameraShoulder || 0;
    const rig = calculateThirdPersonCamera({
      player: [player.position.x, player.position.y, player.position.z],
      targetHeight,
      distance: cameraDistance,
      yaw,
      shoulder,
      aspect: camera.aspect
    });
    camera.position.set(...rig.position);
    camera.lookAt(...rig.target);
  }

  function emitStatus() {
    if (!definition) return;
    statusThrottle.push({
      sceneId: definition.id,
      player: [player.position.x, player.position.y, player.position.z],
      hotspotId: activeHotspotId
    });
  }

  function setMarkerActive(id, time = 0) {
    if (!builtScene) return;
    for (const [markerId, marker] of builtScene.markerById) {
      const active = markerId === id;
      const pulse = active ? 1.12 + Math.sin(time * 0.006) * 0.08 : 1;
      marker.scale.setScalar(pulse);
      marker.userData.ringMaterial.emissiveIntensity = active ? 1.35 : 0.45;
      marker.userData.haloMaterial.emissiveIntensity = active ? 0.8 : 0.2;
      marker.userData.haloMaterial.opacity = active ? 0.64 : 0.32;
    }
  }

  function updateHotspot(time = 0) {
    if (!definition) return;
    const nearest = getNearestHotspot(
      [player.position.x, player.position.y, player.position.z],
      definition.hotspots,
      1.5,
      completedHotspotIds
    );
    const nextId = nearest?.id || null;
    activeHotspot = nearest;
    if (nextId !== activeHotspotId) {
      activeHotspotId = nextId;
      setMarkerActive(activeHotspotId, time);
      onHotspotChange(cloneHotspot(activeHotspot));
    }
  }

  function updateMovement(delta) {
    if (!definition) return;
    const magnitude = Math.hypot(movement.x, movement.y);
    if (magnitude === 0) return;
    const divisor = Math.max(1, magnitude);
    const inputX = movement.x / divisor;
    const inputY = movement.y / divisor;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const previous = [player.position.x, player.position.y, player.position.z];
    const proposed = [
      THREE.MathUtils.clamp(
        previous[0] + (rightX * inputX + forwardX * inputY) * MOVE_SPEED * delta,
        definition.bounds.min[0],
        definition.bounds.max[0]
      ),
      previous[1],
      THREE.MathUtils.clamp(
        previous[2] + (rightZ * inputX + forwardZ * inputY) * MOVE_SPEED * delta,
        definition.bounds.min[2],
        definition.bounds.max[2]
      )
    ];
    const resolved = resolveWalkablePosition(previous, proposed, definition.walkableAreas);
    player.position.set(...resolved);
  }

  function applyEchoMaterials() {
    if (!builtScene) return;
    const color = new THREE.Color();
    builtScene.group.traverse((object) => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material?.color || !material.userData.baseColor) continue;
        if (!echoActive) {
          material.color.copy(material.userData.baseColor);
          if (material.emissive && material.userData.baseEmissive) {
            material.emissive.copy(material.userData.baseEmissive);
          }
          continue;
        }
        color.copy(material.userData.baseColor);
        const hsl = {};
        color.getHSL(hsl);
        color.setHSL(hsl.h, hsl.s * 0.22, hsl.l * 0.78);
        material.color.copy(color);
        if (material.emissive) material.emissive.set('#4a0608');
      }
    });
    if (definition) {
      scene.fog.color.set(echoActive ? '#4b090c' : definition.environment.fog);
      scene.background.set(echoActive ? '#321012' : definition.environment.background);
    }
  }

  function render(time = performance.now(), animateScene = false, delta = 0) {
    updateCamera();
    setMarkerActive(activeHotspotId, time);
    if (animateScene) {
      builtScene?.update({
        time,
        delta,
        activeHotspotId,
        completedHotspotIds
      });
    }
    renderer.render(scene, camera);
  }

  function frame(time) {
    animationFrame = null;
    if (!wantsAnimation || disposed || document.hidden) return;
    timer.update();
    const delta = THREE.MathUtils.clamp(timer.getDelta(), 0, MAX_DELTA);
    updateMovement(delta);
    playerModel.update({
      elapsed: time / 1000,
      movementMagnitude: Math.hypot(movement.x, movement.y)
    });
    syncPlayerActionDiagnostic();
    updateHotspot(time);
    render(time, true, delta);
    emitStatus();
    onFrame(time);
    animationFrame = requestAnimationFrame(frame);
  }

  function scheduleFrame() {
    if (!wantsAnimation || disposed || document.hidden || animationFrame !== null) return;
    timer.reset();
    animationFrame = requestAnimationFrame(frame);
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = null;
    } else {
      scheduleFrame();
    }
  }

  function resizeRenderer() {
    const width = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || innerWidth);
    const height = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || innerHeight);
    camera.aspect = width / height;
    camera.fov = camera.aspect < 1.7 ? 56 : 50;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  document.addEventListener('visibilitychange', handleVisibilityChange);
  syncRendererDiagnostics();
  syncPlayerRootDiagnostics();
  syncPlayerYawDiagnostic();
  syncCameraYawDiagnostic();
  syncCompletedHotspotsDiagnostic();
  syncMovementDiagnostic();
  syncPlayerActionDiagnostic();
  syncCharacterDiagnostics();
  syncEnvironmentDiagnostics();

  return {
    loadScene(nextDefinition) {
      if (disposed) return;
      const previousHotspotId = activeHotspotId;
      builtScene?.dispose();
      definition = nextDefinition;
      builtScene = buildScene(definition, {
        quality: activeQuality,
        modelLibrary,
        reducedMotion: activeReducedMotion
      });
      sceneRoot.add(builtScene.group);
      renderer.toneMappingExposure = definition.environment.exposure ?? 1.08;
      scene.background = new THREE.Color(definition.environment.background);
      scene.fog = new THREE.Fog(
        definition.environment.fog,
        definition.environment.fogNear,
        definition.environment.fogFar
      );
      player.position.set(...definition.playerStart);
      playerModel.group.position.set(0, Number(definition.visualSurfaceHeight) || 0, 0);
      activeHotspot = null;
      activeHotspotId = previousHotspotId;
      updateHotspot();
      applyEchoMaterials();
      updateCamera();
      render();
      emitStatus();
      syncVisualBoundsDiagnostics();
      syncCharacterDiagnostics();
      syncEnvironmentDiagnostics();
    },
    setMovement(nextMovement = {}) {
      movement.x = THREE.MathUtils.clamp(Number(nextMovement.x) || 0, -1, 1);
      movement.y = THREE.MathUtils.clamp(Number(nextMovement.y) || 0, -1, 1);
      syncMovementDiagnostic();
      syncPlayerActionDiagnostic();
      updatePlayerFacing();
    },
    addLookDelta(delta = {}) {
      const x = Number(delta.x);
      if (!Number.isFinite(x)) return;
      yaw = THREE.MathUtils.euclideanModulo(yaw - x * 0.0035 + Math.PI, Math.PI * 2) - Math.PI;
      syncCameraYawDiagnostic();
      updatePlayerFacing();
    },
    interact() {
      return cloneHotspot(activeHotspot);
    },
    setCompletedHotspots(ids = []) {
      completedHotspotIds.clear();
      for (const id of ids) completedHotspotIds.add(id);
      updateHotspot();
      syncCompletedHotspotsDiagnostic();
    },
    start() {
      if (disposed) return;
      wantsAnimation = true;
      scheduleFrame();
    },
    stop() {
      wantsAnimation = false;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = null;
    },
    resize() {
      if (disposed) return;
      resizeRenderer();
      render();
    },
    setReducedMotion(value) {
      if (disposed) return false;
      activeReducedMotion = Boolean(value);
      builtScene?.setReducedMotion(activeReducedMotion);
      syncEnvironmentDiagnostics();
      render();
      return true;
    },
    setQuality(nextQuality) {
      if (disposed || !nextQuality) return false;
      activeQuality = pickLiveQuality(nextQuality);
      renderer.setPixelRatio(activeQuality.pixelRatio);
      renderer.shadowMap.enabled = activeQuality.shadows;
      playerModel.setQuality(activeQuality);

      if (definition) {
        const playerPosition = player.position.clone();
        builtScene?.dispose();
        builtScene = buildScene(definition, {
          quality: activeQuality,
          modelLibrary,
          reducedMotion: activeReducedMotion
        });
        sceneRoot.add(builtScene.group);
        player.position.copy(playerPosition);
        updateHotspot();
        applyEchoMaterials();
      }

      resizeRenderer();
      render();
      emitStatus();
      syncVisualBoundsDiagnostics();
      syncCharacterDiagnostics();
      syncEnvironmentDiagnostics();
      return true;
    },
    setEchoActive(active) {
      echoActive = Boolean(active);
      applyEchoMaterials();
      render();
    },
    dispose() {
      if (disposed) return;
      wantsAnimation = false;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = null;
      timer.dispose();
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      statusThrottle.dispose();
      builtScene?.dispose();
      builtScene = null;
      modelLibrary?.dispose();
      playerResources.dispose();
      sceneRoot.clear();
      scene.clear();
      delete canvas.dataset.playerRootName;
      delete canvas.dataset.playerRootCount;
      delete canvas.dataset.playerModelSource;
      delete canvas.dataset.rendererAntialias;
      delete canvas.dataset.playerPosition;
      delete canvas.dataset.playerYaw;
      delete canvas.dataset.cameraYaw;
      delete canvas.dataset.completedHotspots;
      delete canvas.dataset.movement;
      delete canvas.dataset.visualSurfaceY;
      delete canvas.dataset.playerFootMinY;
      delete canvas.dataset.hotspotMarkerMinY;
      delete canvas.dataset.modelLibraryReady;
      delete canvas.dataset.importedCharacterCount;
      delete canvas.dataset.namedCharacterCount;
      delete canvas.dataset.namedCharacterRootCount;
      delete canvas.dataset.activeAnimationMixerCount;
      delete canvas.dataset.characterModelIds;
      delete canvas.dataset.importedEnvironmentCount;
      delete canvas.dataset.environmentModelIds;
      delete canvas.dataset.importedEnvironmentTriangles;
      delete canvas.dataset.importedEnvironmentDrawCalls;
      delete canvas.dataset.activeQuality;
      delete canvas.dataset.playerAction;
      renderer.dispose();
    }
  };
}
