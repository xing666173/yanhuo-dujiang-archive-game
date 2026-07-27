import * as THREE from '../vendor/three.module.min.js';
import { characterVisuals } from '../data/character-visuals.mjs';
import { createCharacterModel } from './character-model.mjs';
import { createNoiseTexture, createResourceStore, seededRandom } from './resource-store.mjs';
import { createSceneDisposer } from './scene-lifecycle.mjs';

function applyTransform(object, record) {
  object.position.set(...record.position);
  object.rotation.set(...record.rotation);
}

function configureShadows(object, quality, role) {
  const doesNotCast = [
    'floor', 'ceiling', 'wall', 'wall-lower', 'water', 'water-sheen', 'window', 'daylight-band'
  ].includes(role);
  object.castShadow = quality.shadows && !doesNotCast;
  object.receiveShadow = quality.shadows && !['window', 'daylight-band', 'water-sheen'].includes(role);
}

function createPrimitiveMesh(record, resources, quality) {
  let geometry;
  if (record.kind === 'box') {
    geometry = resources.geometry('box', () => new THREE.BoxGeometry(1, 1, 1));
  } else if (record.kind === 'cylinder') {
    geometry = resources.geometry('cylinder', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8));
  } else {
    geometry = resources.geometry('plane', () => new THREE.PlaneGeometry(1, 1));
  }

  const material = resources.material(record);
  if (record.material === 'linoleum' && !material.map) {
    material.map = createNoiseTexture(resources, 'linoleum-noise', ['#d9ddda', '#f2f2ed', '#b8c0bc']);
    material.map.repeat.set(7, 6);
    material.needsUpdate = true;
  } else if (record.material?.startsWith('weathered-wood') && !material.map) {
    material.map = createNoiseTexture(resources, record.material, ['#d0d0c8', '#eeeeea', '#aeb2aa']);
    material.map.repeat.set(2.5, 1);
    material.needsUpdate = true;
  }

  const mesh = new THREE.Mesh(geometry, material);
  applyTransform(mesh, record);
  if (record.kind === 'plane') mesh.scale.set(record.scale[0], record.scale[1], 1);
  else mesh.scale.set(...record.scale);
  configureShadows(mesh, quality, record.role);
  mesh.userData.role = record.role || '';
  return mesh;
}

function createWater(record, resources, quality, animations) {
  const segments = quality.postEffects ? 36 : 22;
  const geometry = resources.addGeometry(new THREE.PlaneGeometry(1, 1, segments, segments));
  const positions = geometry.attributes.position;
  const basePositions = Float32Array.from(positions.array);
  const sheen = record.role === 'water-sheen';
  const material = resources.addMaterial(new THREE.MeshPhysicalMaterial({
    color: record.color,
    transparent: true,
    opacity: record.opacity ?? (sheen ? 0.18 : 0.94),
    roughness: sheen ? 0.2 : 0.32,
    metalness: sheen ? 0.08 : 0.02,
    clearcoat: sheen ? 0.95 : 0.78,
    clearcoatRoughness: sheen ? 0.16 : 0.3,
    reflectivity: 0.72,
    depthWrite: !sheen,
    side: THREE.DoubleSide
  }));
  const map = createNoiseTexture(
    resources,
    sheen ? 'water-sheen-noise' : 'water-noise',
    sheen ? ['#d9e3e2', '#ffffff', '#b9cbcd'] : ['#c7d4d5', '#e5ecea', '#a8bec1']
  );
  map.repeat.set(sheen ? 5 : 9, sheen ? 7 : 12);
  material.map = map;
  material.userData.baseColor = material.color.clone();
  const mesh = new THREE.Mesh(geometry, material);
  applyTransform(mesh, record);
  mesh.scale.set(record.scale[0], record.scale[1], 1);
  configureShadows(mesh, quality, record.role);
  mesh.userData.role = record.role;

  const amplitude = record.waveAmplitude || 0.03;
  const speed = record.waveSpeed || 0.0005;
  animations.push((time) => {
    for (let index = 0; index < positions.count; index += 1) {
      const x = basePositions[index * 3];
      const y = basePositions[index * 3 + 1];
      positions.setZ(
        index,
        Math.sin(x * 28 + time * speed) * amplitude
          + Math.cos(y * 19 - time * speed * 0.72) * amplitude * 0.55
      );
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    map.offset.x = (time * speed * 0.018) % 1;
    map.offset.y = (time * speed * 0.01) % 1;
  });
  return mesh;
}

function createReedField(record, count, resources, quality) {
  const group = new THREE.Group();
  const stemGeometry = resources.addGeometry(new THREE.CylinderGeometry(0.014, 0.025, 1, 5));
  const headGeometry = resources.addGeometry(new THREE.SphereGeometry(0.5, 6, 4));
  const leafGeometry = resources.addGeometry(new THREE.PlaneGeometry(0.12, 0.52, 1, 2));
  const stemPalette = (record.palette || [record.color]).slice(0, 3);
  const headPalette = record.headPalette || ['#8a7b57'];
  const batches = stemPalette.map((color, paletteIndex) => {
    const batchCount = Math.floor((count + stemPalette.length - 1 - paletteIndex) / stemPalette.length);
    const stemMaterial = resources.addMaterial(new THREE.MeshBasicMaterial({ color }));
    const headMaterial = resources.addMaterial(new THREE.MeshBasicMaterial({
      color: headPalette[paletteIndex % headPalette.length]
    }));
    const leafMaterial = resources.addMaterial(new THREE.MeshBasicMaterial({
      color: stemPalette[(paletteIndex + 1) % stemPalette.length],
      side: THREE.DoubleSide
    }));
    const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, batchCount);
    const heads = new THREE.InstancedMesh(headGeometry, headMaterial, batchCount);
    const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, batchCount);
    for (const object of [stems, heads, leaves]) {
      object.castShadow = false;
      object.receiveShadow = false;
    }
    group.add(stems, heads, leaves);
    return { stems, heads, leaves };
  });

  const random = seededRandom(record.seed || 1);
  const clusterCount = Math.max(1, record.cluster || 8);
  const centers = Array.from({ length: clusterCount }, () => ({
    x: (random() - 0.5) * record.scale[0] * 0.9,
    z: (random() - 0.5) * record.scale[2] * 0.94
  }));
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  for (let index = 0; index < count; index += 1) {
    const batch = batches[index % batches.length];
    const batchIndex = Math.floor(index / batches.length);
    const center = centers[Math.floor(random() * centers.length)];
    const spreadX = record.scale[0] / Math.max(5, Math.sqrt(clusterCount) * 2.1);
    const spreadZ = record.scale[2] / Math.max(7, Math.sqrt(clusterCount) * 2.4);
    const x = THREE.MathUtils.clamp(
      center.x + (random() + random() + random() - 1.5) * spreadX,
      -record.scale[0] * 0.49,
      record.scale[0] * 0.49
    );
    const z = THREE.MathUtils.clamp(
      center.z + (random() + random() + random() - 1.5) * spreadZ,
      -record.scale[2] * 0.49,
      record.scale[2] * 0.49
    );
    const depth = (z / record.scale[2]) + 0.5;
    const thinning = 1 - (record.distanceFade || 0) * (1 - depth);
    const height = record.scale[1] * (0.55 + random() * 0.5) * thinning;
    const leanX = (random() - 0.5) * 0.2;
    const leanZ = (random() - 0.5) * 0.16;
    quaternion.setFromEuler(new THREE.Euler(leanX, random() * Math.PI, leanZ));

    position.set(x, height * 0.5 - 0.02, z);
    scale.set(0.72 + random() * 0.62, height, 0.72 + random() * 0.62);
    matrix.compose(position, quaternion, scale);
    batch.stems.setMatrixAt(batchIndex, matrix);

    position.set(x + leanZ * height * 0.2, height + 0.06, z - leanX * height * 0.2);
    scale.set(0.07 + random() * 0.025, 0.24 + random() * 0.12, 0.07 + random() * 0.025);
    matrix.compose(position, quaternion, scale);
    batch.heads.setMatrixAt(batchIndex, matrix);

    const leafYaw = random() * Math.PI;
    quaternion.setFromEuler(new THREE.Euler(-0.48 + random() * 0.28, leafYaw, (random() - 0.5) * 0.2));
    position.set(x, height * (0.47 + random() * 0.16), z);
    scale.set(0.72 + random() * 0.52, 0.75 + random() * 0.5, 1);
    matrix.compose(position, quaternion, scale);
    batch.leaves.setMatrixAt(batchIndex, matrix);
  }
  for (const { stems, heads, leaves } of batches) {
    stems.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
  }
  applyTransform(group, record);
  group.userData.role = 'reed-field';
  return group;
}

function createHotspotMarker(hotspot, resources, quality) {
  const group = new THREE.Group();
  const color = hotspot.color || '#a44b45';
  const ringMaterial = resources.addMaterial(new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.45,
    roughness: 0.5,
    metalness: 0.08
  }));
  const beaconMaterial = resources.addMaterial(new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.42,
    roughness: 0.5
  }));
  const ring = new THREE.Mesh(
    resources.addGeometry(new THREE.TorusGeometry(0.34, 0.04, 6, 24)),
    ringMaterial
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.06;
  ring.castShadow = quality.shadows;
  const beacon = new THREE.Mesh(
    resources.addGeometry(new THREE.CylinderGeometry(0.045, 0.2, 0.7, 8, 1, true)),
    beaconMaterial
  );
  beacon.position.y = 0.38;
  group.add(ring, beacon);
  group.position.set(...hotspot.position);
  group.userData.id = hotspot.id;
  group.userData.ringMaterial = ringMaterial;
  group.userData.beaconMaterial = beaconMaterial;
  return group;
}

function createLights(definition, quality) {
  const environment = definition.environment;
  const group = new THREE.Group();
  const hemisphere = new THREE.HemisphereLight(
    environment.ambient,
    environment.ground || '#39423f',
    environment.ambientIntensity
  );
  const sun = new THREE.DirectionalLight(environment.sun, environment.sunIntensity);
  sun.position.set(...environment.sunPosition);
  sun.target.position.set(0, 0.4, -2);
  sun.castShadow = quality.shadows;
  if (quality.shadows) {
    sun.shadow.mapSize.set(quality.postEffects ? 2048 : 1024, quality.postEffects ? 2048 : 1024);
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 11;
    sun.shadow.camera.bottom = -11;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 42;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 3;
    sun.shadow.blurSamples = 12;
  }
  const fill = new THREE.AmbientLight(environment.ambient, environment.ambientIntensity * 0.26);
  group.add(hemisphere, fill, sun, sun.target);

  if (environment.windowLight) {
    const windowLight = new THREE.RectAreaLight(
      environment.windowLight,
      environment.windowIntensity || 2.5,
      4,
      2
    );
    windowLight.position.set(-5.45, 2, -0.5);
    windowLight.lookAt(0, 0.8, 0.2);
    group.add(windowLight);
  }
  if (environment.rim) {
    const rim = new THREE.DirectionalLight(environment.rim, environment.rimIntensity || 0.6);
    rim.position.set(8, 5, -10);
    rim.target.position.set(0, 0.6, -4);
    group.add(rim, rim.target);
  }
  return group;
}

export function buildScene(definition, { quality }) {
  const resources = createResourceStore();
  const group = new THREE.Group();
  const animations = [];
  group.name = definition.id;
  const markerById = new Map();
  const reedRecords = definition.primitives.filter(({ kind }) => kind === 'reed-field');
  const reedWeight = reedRecords.reduce((total, record) => total + (record.density || 1), 0);
  let reedsAssigned = 0;
  let reedIndex = 0;

  group.add(createLights(definition, quality));
  for (const record of definition.primitives) {
    let object;
    if (record.kind === 'person') {
      const appearance = characterVisuals[record.characterId];
      const model = createCharacterModel(
        { ...appearance, ...record },
        { resources, quality }
      );
      animations.push((time) => model.update({ elapsed: time / 1000, movementMagnitude: 0 }));
      object = model.group;
    } else if (record.kind === 'reed-field') {
      const isLast = reedIndex === reedRecords.length - 1;
      const count = isLast
        ? quality.reedCount - reedsAssigned
        : Math.max(1, Math.round(quality.reedCount * (record.density || 1) / reedWeight));
      reedsAssigned += count;
      reedIndex += 1;
      object = createReedField(record, count, resources, quality);
    } else if (record.role === 'water' || record.role === 'water-sheen') {
      object = createWater(record, resources, quality, animations);
    } else {
      object = createPrimitiveMesh(record, resources, quality);
    }
    group.add(object);
  }

  for (const hotspot of definition.hotspots) {
    const marker = createHotspotMarker(hotspot, resources, quality);
    markerById.set(hotspot.id, marker);
    group.add(marker);
  }

  const dispose = createSceneDisposer({
    group,
    markerById,
    animations,
    disposeResources: () => resources.dispose()
  });

  return {
    group,
    markerById,
    update(time) {
      for (const animation of animations) animation(time);
    },
    dispose
  };
}
