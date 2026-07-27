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
  onHotspotChange = () => {},
  onStatusChange = () => {},
  onFrame = () => {}
}) {
  let activeQuality = { ...quality };
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: activeQuality.antialias,
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(activeQuality.pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = activeQuality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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
  const player = playerModel.group;
  player.name = 'player-character';
  sceneRoot.add(player);
  scene.add(sceneRoot);

  const clock = new THREE.Clock(false);
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
  const statusThrottle = createStatusThrottle({ emit: onStatusChange });

  function syncDiagnostics() {
    canvas.dataset.playerRootName = player.name;
    canvas.dataset.playerRootCount = String(
      sceneRoot.getObjectsByProperty('name', player.name).length
    );
    canvas.dataset.playerPosition = [
      player.position.x,
      player.position.y,
      player.position.z
    ].map((value) => value.toFixed(4)).join(',');
    canvas.dataset.playerYaw = player.rotation.y.toFixed(6);
    canvas.dataset.cameraYaw = yaw.toFixed(6);
    canvas.dataset.completedHotspots = [...completedHotspotIds].sort().join(',');
    canvas.dataset.movement = [movement.x, movement.y]
      .map((value) => value.toFixed(4))
      .join(',');
  }

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
      shoulder
    });
    camera.position.set(...rig.position);
    camera.lookAt(...rig.target);
  }

  function emitStatus() {
    syncDiagnostics();
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
    if (magnitude > 0.02) {
      const directionX = rightX * inputX + forwardX * inputY;
      const directionZ = rightZ * inputX + forwardZ * inputY;
      player.rotation.y = Math.atan2(directionX, directionZ) + Math.PI;
    }
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

  function render(time = performance.now(), animateScene = false) {
    updateCamera();
    setMarkerActive(activeHotspotId, time);
    if (animateScene) builtScene?.update(time);
    renderer.render(scene, camera);
  }

  function frame(time) {
    animationFrame = null;
    if (!wantsAnimation || disposed || document.hidden) return;
    const delta = Math.min(clock.getDelta(), MAX_DELTA);
    updateMovement(delta);
    playerModel.update({
      elapsed: time / 1000,
      movementMagnitude: Math.hypot(movement.x, movement.y)
    });
    updateHotspot(time);
    render(time, true);
    emitStatus();
    onFrame(time);
    animationFrame = requestAnimationFrame(frame);
  }

  function scheduleFrame() {
    if (!wantsAnimation || disposed || document.hidden || animationFrame !== null) return;
    clock.start();
    animationFrame = requestAnimationFrame(frame);
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = null;
      clock.stop();
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
  syncDiagnostics();

  return {
    loadScene(nextDefinition) {
      if (disposed) return;
      const previousHotspotId = activeHotspotId;
      builtScene?.dispose();
      definition = nextDefinition;
      builtScene = buildScene(definition, { quality: activeQuality });
      sceneRoot.add(builtScene.group);
      renderer.toneMappingExposure = definition.environment.exposure ?? 1.08;
      scene.background = new THREE.Color(definition.environment.background);
      scene.fog = new THREE.Fog(
        definition.environment.fog,
        definition.environment.fogNear,
        definition.environment.fogFar
      );
      player.position.set(...definition.playerStart);
      activeHotspot = null;
      activeHotspotId = previousHotspotId;
      updateHotspot();
      applyEchoMaterials();
      updateCamera();
      render();
      emitStatus();
    },
    setMovement(nextMovement = {}) {
      movement.x = THREE.MathUtils.clamp(Number(nextMovement.x) || 0, -1, 1);
      movement.y = THREE.MathUtils.clamp(Number(nextMovement.y) || 0, -1, 1);
      syncDiagnostics();
    },
    addLookDelta(delta = {}) {
      const x = Number(delta.x);
      if (!Number.isFinite(x)) return;
      yaw = THREE.MathUtils.euclideanModulo(yaw - x * 0.0035 + Math.PI, Math.PI * 2) - Math.PI;
      syncDiagnostics();
    },
    interact() {
      return cloneHotspot(activeHotspot);
    },
    setCompletedHotspots(ids = []) {
      completedHotspotIds.clear();
      for (const id of ids) completedHotspotIds.add(id);
      updateHotspot();
      syncDiagnostics();
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
      clock.stop();
    },
    resize() {
      if (disposed) return;
      resizeRenderer();
      render();
    },
    setQuality(nextQuality) {
      if (disposed || !nextQuality) return false;
      activeQuality = { ...nextQuality };
      renderer.setPixelRatio(activeQuality.pixelRatio);
      renderer.shadowMap.enabled = activeQuality.shadows;
      playerModel.setQuality(activeQuality);

      if (definition) {
        const playerPosition = player.position.clone();
        builtScene?.dispose();
        builtScene = buildScene(definition, { quality: activeQuality });
        sceneRoot.add(builtScene.group);
        player.position.copy(playerPosition);
        updateHotspot();
        applyEchoMaterials();
      }

      resizeRenderer();
      render();
      emitStatus();
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
      clock.stop();
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      statusThrottle.dispose();
      builtScene?.dispose();
      builtScene = null;
      playerResources.dispose();
      sceneRoot.clear();
      scene.clear();
      delete canvas.dataset.playerRootName;
      delete canvas.dataset.playerRootCount;
      delete canvas.dataset.playerPosition;
      delete canvas.dataset.playerYaw;
      delete canvas.dataset.cameraYaw;
      delete canvas.dataset.completedHotspots;
      delete canvas.dataset.movement;
      renderer.dispose();
    }
  };
}
