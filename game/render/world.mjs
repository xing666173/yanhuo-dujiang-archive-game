import * as THREE from '../vendor/three.module.min.js';
import { resolveWalkablePosition } from '../core/navigation.mjs';
import { getNearestHotspot } from '../core/proximity.mjs';
import { calculateThirdPersonCamera } from './camera-rig.mjs';
import { buildScene } from './scene-builder.mjs';
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

function createPlayer(quality) {
  const group = new THREE.Group();
  const jacketMaterial = new THREE.MeshStandardMaterial({
    color: '#354a46',
    roughness: 0.76,
    metalness: 0.02
  });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: '#bd8768', roughness: 0.8 });
  const hairMaterial = new THREE.MeshStandardMaterial({ color: '#252a28', roughness: 0.88 });
  const trouserMaterial = new THREE.MeshStandardMaterial({ color: '#272f31', roughness: 0.82 });
  const packMaterial = new THREE.MeshStandardMaterial({ color: '#59695a', roughness: 0.88 });
  const goldMaterial = new THREE.MeshStandardMaterial({ color: '#aa9862', roughness: 0.7 });
  const crimsonMaterial = new THREE.MeshStandardMaterial({ color: '#964842', roughness: 0.72 });
  const torsoGeometry = new THREE.CylinderGeometry(0.3, 0.21, 0.7, 7, 1);
  const armGeometry = new THREE.CylinderGeometry(0.055, 0.075, 0.5, 6, 1);
  const legGeometry = new THREE.CylinderGeometry(0.07, 0.095, 0.52, 6, 1);
  const headGeometry = new THREE.SphereGeometry(0.5, 10, 7);
  const hairGeometry = new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const packGeometry = new THREE.CylinderGeometry(0.22, 0.18, 0.48, 6, 1);
  const flapGeometry = new THREE.BoxGeometry(0.4, 0.11, 0.18);
  const strapGeometry = new THREE.BoxGeometry(0.055, 0.5, 0.035);

  const torso = new THREE.Mesh(torsoGeometry, jacketMaterial);
  torso.position.y = 0.84;
  torso.scale.z = 0.78;
  const head = new THREE.Mesh(headGeometry, skinMaterial);
  head.position.set(0, 1.35, -0.005);
  head.scale.set(0.22, 0.25, 0.23);
  const hair = new THREE.Mesh(hairGeometry, hairMaterial);
  hair.position.set(0, 1.405, -0.006);
  hair.scale.set(0.225, 0.255, 0.235);
  const leftArm = new THREE.Mesh(armGeometry, jacketMaterial);
  leftArm.position.set(-0.31, 0.81, 0);
  leftArm.rotation.z = -0.11;
  const rightArm = leftArm.clone();
  rightArm.position.x *= -1;
  rightArm.rotation.z *= -1;
  const leftLeg = new THREE.Mesh(legGeometry, trouserMaterial);
  leftLeg.position.set(-0.115, 0.27, 0);
  const rightLeg = leftLeg.clone();
  rightLeg.position.x *= -1;
  const backpack = new THREE.Mesh(packGeometry, packMaterial);
  backpack.position.set(0, 0.82, 0.22);
  backpack.scale.z = 0.72;
  const backpackFlap = new THREE.Mesh(flapGeometry, goldMaterial);
  backpackFlap.position.set(0, 0.96, 0.31);
  const leftStrap = new THREE.Mesh(strapGeometry, crimsonMaterial);
  leftStrap.position.set(-0.19, 0.85, -0.225);
  const rightStrap = leftStrap.clone();
  rightStrap.position.x *= -1;
  const meshes = [
    torso, head, hair, leftArm, rightArm, leftLeg, rightLeg,
    backpack, backpackFlap, leftStrap, rightStrap
  ];
  for (const mesh of meshes) {
    mesh.castShadow = quality.shadows;
    mesh.receiveShadow = quality.shadows;
    group.add(mesh);
  }
  group.userData.dispose = () => {
    for (const geometry of [
      torsoGeometry, armGeometry, legGeometry, headGeometry, hairGeometry,
      packGeometry, flapGeometry, strapGeometry
    ]) {
      geometry.dispose();
    }
    for (const material of [
      jacketMaterial, skinMaterial, hairMaterial, trouserMaterial,
      packMaterial, goldMaterial, crimsonMaterial
    ]) {
      material.dispose();
    }
  };
  return group;
}

export function createWorld({
  canvas,
  quality,
  onHotspotChange = () => {},
  onStatusChange = () => {}
}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: quality.antialias,
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const sceneRoot = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.08, 100);
  const player = createPlayer(quality);
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
  let wantsAnimation = false;
  let animationFrame = null;
  let disposed = false;
  const statusThrottle = createStatusThrottle({ emit: onStatusChange });

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
      marker.userData.beaconMaterial.emissiveIntensity = active ? 0.8 : 0.2;
      marker.userData.beaconMaterial.opacity = active ? 0.72 : 0.42;
    }
  }

  function updateHotspot(time = 0) {
    if (!definition) return;
    const nearest = getNearestHotspot(
      [player.position.x, player.position.y, player.position.z],
      definition.hotspots,
      1.5
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

  function render(time = performance.now()) {
    updateCamera();
    setMarkerActive(activeHotspotId, time);
    builtScene?.update(time);
    renderer.render(scene, camera);
  }

  function frame(time) {
    animationFrame = null;
    if (!wantsAnimation || disposed || document.hidden) return;
    const delta = Math.min(clock.getDelta(), MAX_DELTA);
    updateMovement(delta);
    updateHotspot(time);
    render(time);
    emitStatus();
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

  document.addEventListener('visibilitychange', handleVisibilityChange);

  return {
    loadScene(nextDefinition) {
      if (disposed) return;
      const previousHotspotId = activeHotspotId;
      builtScene?.dispose();
      definition = nextDefinition;
      builtScene = buildScene(definition, { quality });
      sceneRoot.add(builtScene.group);
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
    },
    addLookDelta(delta = {}) {
      const x = Number(delta.x);
      if (!Number.isFinite(x)) return;
      yaw = THREE.MathUtils.euclideanModulo(yaw - x * 0.0035 + Math.PI, Math.PI * 2) - Math.PI;
    },
    interact() {
      return cloneHotspot(activeHotspot);
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
      const width = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || innerWidth);
      const height = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || innerHeight);
      camera.aspect = width / height;
      camera.fov = camera.aspect < 1.7 ? 56 : 50;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      render();
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
      player.userData.dispose();
      sceneRoot.clear();
      scene.clear();
      renderer.dispose();
    }
  };
}
