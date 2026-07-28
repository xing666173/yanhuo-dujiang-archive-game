import * as THREE from '../vendor/three.module.min.js';
import { characterVisuals } from '../data/character-visuals.mjs';
import { createCharacterModel } from './character-model.mjs';
import { createCharacterPresentation } from './character-presentation.mjs';
import {
  createNoiseTexture,
  createResourceStore,
  createWoodTextures,
  seededRandom
} from './resource-store.mjs';
import { createSceneDisposer } from './scene-lifecycle.mjs';

const WEATHERED_WOOD_COLORS = {
  'weathered-wood-a': ['#897b68', '#b3a086', '#5b544a', '#c3ad8e'],
  'weathered-wood-b': ['#817565', '#aa9981', '#554f46', '#baa58a'],
  'weathered-wood-c': ['#756c5e', '#9f8e78', '#4b4740', '#af9b81'],
  'weathered-wood-d': ['#91816b', '#bba487', '#62574a', '#cbb293'],
  'weathered-wood-e': ['#7d7364', '#a7957e', '#514c44', '#b6a187']
};

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
    const { colorMap, roughnessMap } = createWoodTextures(
      resources,
      record.material,
      record.woodColors
        || WEATHERED_WOOD_COLORS[record.material]
        || ['#817565', '#aa9981', '#554f46', '#baa58a']
    );
    material.map = colorMap;
    material.roughnessMap = roughnessMap;
    material.roughness = 0.84;
    material.color.set('#ffffff');
    material.userData.baseColor.copy(material.color);
    material.map.repeat.set(2.4, 1);
    material.roughnessMap.repeat.copy(material.map.repeat);
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
  const segments = quality.waterSegments ?? (quality.postEffects ? 36 : 18);
  const geometry = resources.addGeometry(new THREE.PlaneGeometry(1, 1, segments, segments));
  const positions = geometry.attributes.position;
  const basePositions = Float32Array.from(positions.array);
  const sheen = record.role === 'water-sheen';
  const material = resources.addMaterial(new THREE.MeshPhysicalMaterial({
    color: record.color,
    transparent: true,
    opacity: record.opacity ?? (sheen ? 0.18 : 0.94),
    clearcoat: 1,
    clearcoatRoughness: 0.16,
    roughness: sheen ? 0.18 : 0.28,
    metalness: 0,
    ior: 1.333,
    depthWrite: !sheen,
    side: THREE.DoubleSide
  }));
  const map = createNoiseTexture(
    resources,
    sheen ? 'water-sheen-noise' : 'water-noise',
    sheen ? ['#d9e3e2', '#ffffff', '#b9cbcd'] : ['#c7d4d5', '#e5ecea', '#a8bec1']
  );
  map.repeat.set(sheen ? 5 : 9, sheen ? 7 : 12);
  map.offset.set(sheen ? 0.18 : 0, sheen ? 0.08 : 0);
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
    map.offset.x = ((sheen ? 0.18 : 0) + time * speed * (sheen ? 0.026 : 0.018)) % 1;
    map.offset.y = ((sheen ? 0.08 : 0) + time * speed * (sheen ? -0.016 : 0.01)) % 1;
  });
  return mesh;
}

function attachVegetationWind(material, phase, windUniforms) {
  const uTime = { value: 0 };
  material.userData.uTime = uTime;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float upperBend = smoothstep(-0.18, 0.5, position.y);
        transformed.x += sin(uTime * 1.25 + position.y * 3.1 + position.x * 11.0 + ${phase.toFixed(3)})
          * 0.026 * upperBend;`
      );
  };
  material.customProgramCacheKey = () => `reed-wind-${phase.toFixed(3)}`;
  windUniforms.push(uTime);
}

function createReedField(record, count, resources, quality, animations) {
  const group = new THREE.Group();
  const stemGeometry = resources.addGeometry(new THREE.CylinderGeometry(0.014, 0.025, 1, 5));
  const headGeometry = resources.addGeometry(new THREE.SphereGeometry(0.5, 6, 4));
  const leafGeometry = resources.addGeometry(new THREE.PlaneGeometry(0.12, 0.52, 1, 2));
  const stemPalette = (record.palette || [record.color]).slice(0, 3);
  const headPalette = record.headPalette || ['#8a7b57'];
  const windUniforms = [];
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
    if (quality.vegetationWind) {
      attachVegetationWind(stemMaterial, paletteIndex * 0.71, windUniforms);
      attachVegetationWind(headMaterial, paletteIndex * 0.71 + 0.23, windUniforms);
      attachVegetationWind(leafMaterial, paletteIndex * 0.71 + 0.46, windUniforms);
    }
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
  if (windUniforms.length > 0) {
    animations.push((time) => {
      const seconds = time / 1000;
      for (const uniform of windUniforms) uniform.value = seconds;
    });
  }
  applyTransform(group, record);
  group.userData.role = 'reed-field';
  return group;
}

function createLotusField(record, count, resources) {
  const group = new THREE.Group();
  const stemGeometry = resources.geometry(
    'lotus-stem',
    () => new THREE.CylinderGeometry(0.014, 0.019, 1, 6)
  );
  const leafGeometry = resources.geometry(
    'lotus-leaf',
    () => new THREE.CircleGeometry(0.5, 12)
  );
  const budGeometry = resources.geometry(
    'lotus-closed-bud',
    () => new THREE.SphereGeometry(0.5, 7, 5)
  );
  const stemMaterial = resources.addMaterial(new THREE.MeshStandardMaterial({
    color: record.stemColor || '#496242',
    roughness: 0.88,
    metalness: 0
  }));
  const leafMaterial = resources.addMaterial(new THREE.MeshStandardMaterial({
    color: record.color,
    roughness: 0.82,
    metalness: 0,
    side: THREE.DoubleSide
  }));
  const budMaterial = resources.addMaterial(new THREE.MeshStandardMaterial({
    color: record.budColor || '#b88b92',
    roughness: 0.76,
    metalness: 0
  }));
  const random = seededRandom(record.seed || 1);
  const corridorHalfWidth = record.corridorHalfWidth ?? 3.35;
  const placements = [];

  for (let index = 0; index < count; index += 1) {
    let x = 0;
    let z = 0;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      x = (random() - 0.5) * record.scale[0];
      z = (random() - 0.5) * record.scale[2];
      if (Math.abs(record.position[0] + x) >= corridorHalfWidth) break;
    }
    const worldX = record.position[0] + x;
    if (Math.abs(worldX) < corridorHalfWidth) {
      const safeWorldX = (worldX < 0 ? -1 : 1) * (corridorHalfWidth + 0.12);
      x = safeWorldX - record.position[0];
    }
    placements.push({
      x,
      z,
      leafY: 0.015 + random() * 0.035,
      diameter: 0.42 + random() * 0.34,
      yaw: random() * Math.PI,
      tilt: (random() - 0.5) * 0.12,
      hasBud: random() < (record.budRate ?? 0.17)
    });
  }

  const budCount = placements.reduce((total, placement) => total + Number(placement.hasBud), 0);
  const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, count);
  const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, count);
  const buds = new THREE.InstancedMesh(budGeometry, budMaterial, budCount);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  let budIndex = 0;

  for (const [index, placement] of placements.entries()) {
    const stemHeight = 0.16 + random() * 0.11;
    euler.set((random() - 0.5) * 0.04, placement.yaw, (random() - 0.5) * 0.04);
    quaternion.setFromEuler(euler);
    position.set(placement.x, placement.leafY - stemHeight * 0.5, placement.z);
    scale.set(0.85 + random() * 0.3, stemHeight, 0.85 + random() * 0.3);
    matrix.compose(position, quaternion, scale);
    stems.setMatrixAt(index, matrix);

    euler.set(-Math.PI / 2 + placement.tilt, 0, placement.yaw);
    quaternion.setFromEuler(euler);
    position.set(placement.x, placement.leafY, placement.z);
    scale.set(placement.diameter * 1.12, placement.diameter * 0.82, 1);
    matrix.compose(position, quaternion, scale);
    leaves.setMatrixAt(index, matrix);

    if (placement.hasBud) {
      quaternion.identity();
      position.set(
        placement.x + (random() - 0.5) * 0.16,
        placement.leafY + 0.11 + random() * 0.08,
        placement.z + (random() - 0.5) * 0.16
      );
      scale.set(0.075, 0.18 + random() * 0.06, 0.075);
      matrix.compose(position, quaternion, scale);
      buds.setMatrixAt(budIndex, matrix);
      budIndex += 1;
    }
  }

  for (const object of [stems, leaves, buds]) {
    object.instanceMatrix.needsUpdate = true;
    object.castShadow = false;
    object.receiveShadow = false;
    group.add(object);
  }
  applyTransform(group, record);
  group.userData.role = 'lotus-field';
  return group;
}

function createTreeLine(record, count, resources) {
  const group = new THREE.Group();
  const trunkGeometry = resources.geometry(
    'tree-line-trunk',
    () => new THREE.CylinderGeometry(0.08, 0.12, 1, 6)
  );
  const crownGeometry = resources.geometry(
    'tree-line-crown',
    () => new THREE.SphereGeometry(0.5, 7, 5)
  );
  const trunkMaterial = resources.addMaterial(new THREE.MeshStandardMaterial({
    color: record.trunkColor || '#4b4338',
    roughness: 0.94,
    metalness: 0
  }));
  const crownPalette = record.palette || ['#31463b', '#405444', '#52634d'];
  const crownMaterials = crownPalette.slice(0, 3).map((color) => (
    resources.addMaterial(new THREE.MeshStandardMaterial({
      color,
      roughness: 0.92,
      metalness: 0
    }))
  ));
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, count);
  const crowns = crownMaterials.map((material) => new THREE.InstancedMesh(crownGeometry, material, count));
  const random = seededRandom(record.seed || 1);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();

  for (let index = 0; index < count; index += 1) {
    const x = (random() - 0.5) * record.scale[0];
    const z = (random() - 0.5) * record.scale[2];
    const height = record.scale[1] * (0.68 + random() * 0.48);
    const crownWidth = height * (0.38 + random() * 0.12);
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI);
    position.set(x, height * 0.36, z);
    scale.set(0.72 + random() * 0.5, height * 0.72, 0.72 + random() * 0.5);
    matrix.compose(position, quaternion, scale);
    trunks.setMatrixAt(index, matrix);

    const crownOffsets = [
      [-0.22, 0.78, 0],
      [0.2, 0.72, 0.05],
      [0, 0.94, -0.03]
    ];
    for (const [crownIndex, crown] of crowns.entries()) {
      const [offsetX, offsetY, offsetZ] = crownOffsets[crownIndex];
      position.set(
        x + offsetX * crownWidth,
        height * offsetY,
        z + offsetZ * crownWidth
      );
      const visibleScale = crownIndex === 2 && index % 3 === 0 ? 0 : 1;
      scale.set(
        crownWidth * (0.94 + random() * 0.16) * visibleScale,
        height * (0.42 + random() * 0.09) * visibleScale,
        crownWidth * (0.78 + random() * 0.16) * visibleScale
      );
      matrix.compose(position, quaternion, scale);
      crown.setMatrixAt(index, matrix);
    }
  }

  for (const object of [trunks, ...crowns]) {
    object.instanceMatrix.needsUpdate = true;
    object.castShadow = false;
    object.receiveShadow = false;
    group.add(object);
  }
  applyTransform(group, record);
  group.userData.role = 'tree-line';
  return group;
}

function createHotspotMarker(hotspot, resources, quality, visualSurfaceHeight = 0) {
  const group = new THREE.Group();
  const color = hotspot.color || '#a44b45';
  const ringMaterial = resources.addMaterial(new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.45,
    roughness: 0.5,
    metalness: 0.08
  }));
  const haloMaterial = resources.addMaterial(new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.32,
    roughness: 0.5,
    depthWrite: false
  }));
  const ring = new THREE.Mesh(
    resources.addGeometry(new THREE.TorusGeometry(0.34, 0.04, 6, 24)),
    ringMaterial
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.035;
  ring.castShadow = quality.shadows;
  const halo = new THREE.Mesh(
    resources.addGeometry(new THREE.CylinderGeometry(0.48, 0.54, 0.065, 24, 1, true)),
    haloMaterial
  );
  halo.position.y = 0.038;
  halo.castShadow = false;
  halo.receiveShadow = false;
  group.add(ring, halo);
  group.position.set(
    hotspot.position[0],
    hotspot.position[1] + visualSurfaceHeight + 0.006,
    hotspot.position[2]
  );
  group.userData.id = hotspot.id;
  group.userData.ringMaterial = ringMaterial;
  group.userData.haloMaterial = haloMaterial;
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
    const shadowMapSize = quality.shadowMapSize ?? (quality.postEffects ? 2048 : 1024);
    sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
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

export function buildScene(definition, {
  quality,
  modelLibrary = null,
  reducedMotion = false
}) {
  const resources = createResourceStore();
  const group = new THREE.Group();
  const animations = [];
  const characterById = new Map();
  const characterInstances = [];
  const characterModelIds = [];
  group.name = definition.id;
  const markerById = new Map();
  const reedRecords = definition.primitives.filter(({ kind }) => kind === 'reed-field');
  const reedWeight = reedRecords.reduce((total, record) => total + (record.density || 1), 0);
  const lotusRecords = definition.primitives.filter(({ kind }) => kind === 'lotus-field');
  const lotusWeight = lotusRecords.reduce((total, record) => total + (record.density || 1), 0);
  const lotusCount = quality.lotusCount ?? (quality.postEffects ? 72 : 28);
  let reedsAssigned = 0;
  let reedIndex = 0;
  let lotusAssigned = 0;
  let lotusIndex = 0;

  group.add(createLights(definition, quality));
  for (const record of definition.primitives) {
    let object;
    if (record.kind === 'person') {
      const appearance = characterVisuals[record.characterId];
      let importedInstance = null;
      try {
        importedInstance = modelLibrary?.createCharacter(record.characterId) ?? null;
      } catch {}
      if (importedInstance) {
        try {
          const presentation = createCharacterPresentation({
            instance: importedInstance,
            record,
            appearance,
            quality,
            reducedMotion
          });
          characterInstances.push(presentation);
          characterModelIds.push(record.characterId);
          object = presentation.group;
        } catch {
          importedInstance.dispose();
        }
      }
      if (!object) {
        const model = createCharacterModel(
          { ...appearance, ...record },
          { resources, quality }
        );
        model.group.userData.modelSource = 'procedural';
        animations.push((time) => model.update({ elapsed: time / 1000, movementMagnitude: 0 }));
        object = model.group;
      }
      characterById.set(record.characterId, object);
    } else if (record.kind === 'reed-field') {
      const isLast = reedIndex === reedRecords.length - 1;
      const count = isLast
        ? quality.reedCount - reedsAssigned
        : Math.max(1, Math.round(quality.reedCount * (record.density || 1) / reedWeight));
      reedsAssigned += count;
      reedIndex += 1;
      object = createReedField(record, count, resources, quality, animations);
    } else if (record.kind === 'lotus-field') {
      const isLast = lotusIndex === lotusRecords.length - 1;
      const count = isLast
        ? lotusCount - lotusAssigned
        : Math.max(1, Math.round(lotusCount * (record.density || 1) / lotusWeight));
      lotusAssigned += count;
      lotusIndex += 1;
      object = createLotusField(record, count, resources);
    } else if (record.kind === 'tree-line') {
      object = createTreeLine(record, record.count, resources);
    } else if (record.role === 'water' || record.role === 'water-sheen') {
      object = createWater(record, resources, quality, animations);
    } else {
      object = createPrimitiveMesh(record, resources, quality);
    }
    group.add(object);
  }

  for (const hotspot of definition.hotspots) {
    const marker = createHotspotMarker(
      hotspot,
      resources,
      quality,
      definition.visualSurfaceHeight || 0
    );
    markerById.set(hotspot.id, marker);
    group.add(marker);
  }

  const dispose = createSceneDisposer({
    group,
    markerById,
    animations,
    disposeResources() {
      for (const instance of characterInstances) instance.dispose();
      characterInstances.length = 0;
      characterById.clear();
      resources.dispose();
    }
  });

  return {
    group,
    markerById,
    characterById,
    characterInstances,
    importedCharacterCount: characterModelIds.length,
    namedCharacterCount: characterById.size,
    characterModelIds: characterModelIds.sort(),
    update(input = 0) {
      const time = typeof input === 'number' ? input : Number(input.time) || 0;
      const delta = typeof input === 'object' ? Number(input.delta) || 0 : 0;
      const activeHotspotId = typeof input === 'object' ? input.activeHotspotId : null;
      const completedHotspotIds = typeof input === 'object'
        ? input.completedHotspotIds ?? new Set()
        : new Set();
      const activeHotspot = definition.hotspots.find(({ id }) => id === activeHotspotId);
      for (const animation of animations) animation(time);
      for (const instance of characterInstances) {
        const isActive = activeHotspot?.characterId === instance.group.userData.characterId
          && !completedHotspotIds.has(activeHotspotId);
        instance.update({ delta, time, action: isActive ? 'Interact' : 'Idle' });
      }
    },
    dispose
  };
}
