import * as THREE from '../vendor/three.module.min.js';

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function createResourceStore() {
  const geometries = new Set();
  const materials = new Set();
  const geometryCache = new Map();
  const materialCache = new Map();

  function geometry(key, factory) {
    if (!geometryCache.has(key)) {
      const resource = factory();
      geometryCache.set(key, resource);
      geometries.add(resource);
    }
    return geometryCache.get(key);
  }

  function material(record, overrides = {}) {
    const role = record.role || 'standard';
    const key = JSON.stringify([
      record.color,
      role,
      Boolean(record.transparent),
      record.opacity ?? 1,
      overrides.emissive || ''
    ]);
    if (!materialCache.has(key)) {
      let resource;
      if (role === 'water') {
        resource = new THREE.MeshPhysicalMaterial({
          color: record.color,
          transparent: true,
          opacity: record.opacity ?? 0.86,
          roughness: 0.24,
          metalness: 0.08,
          clearcoat: 0.72,
          clearcoatRoughness: 0.3,
          side: THREE.DoubleSide
        });
      } else {
        resource = new THREE.MeshStandardMaterial({
          color: record.color,
          roughness: role === 'camera' || role === 'recorder' ? 0.42 : 0.72,
          metalness: role === 'camera' || role === 'recorder' ? 0.18 : 0.02,
          transparent: Boolean(record.transparent),
          opacity: record.opacity ?? 1,
          side: record.kind === 'plane' ? THREE.DoubleSide : THREE.FrontSide,
          emissive: overrides.emissive || '#000000',
          emissiveIntensity: overrides.emissiveIntensity || 0
        });
      }
      resource.userData.baseColor = resource.color.clone();
      if (resource.emissive) resource.userData.baseEmissive = resource.emissive.clone();
      materialCache.set(key, resource);
      materials.add(resource);
    }
    return materialCache.get(key);
  }

  return {
    geometry,
    material,
    addGeometry(resource) {
      geometries.add(resource);
      return resource;
    },
    addMaterial(resource) {
      resource.userData.baseColor = resource.color?.clone();
      if (resource.emissive) resource.userData.baseEmissive = resource.emissive.clone();
      materials.add(resource);
      return resource;
    },
    dispose() {
      for (const geometryResource of geometries) geometryResource.dispose();
      for (const materialResource of materials) materialResource.dispose();
      geometries.clear();
      materials.clear();
      geometryCache.clear();
      materialCache.clear();
    }
  };
}

function applyTransform(object, record) {
  object.position.set(...record.position);
  object.rotation.set(...record.rotation);
}

function configureShadows(object, quality, role) {
  const doesNotCast = ['floor', 'ceiling', 'wall', 'water', 'window'].includes(role);
  object.castShadow = quality.shadows && !doesNotCast;
  object.receiveShadow = quality.shadows && role !== 'window';
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

  const mesh = new THREE.Mesh(geometry, resources.material(record));
  applyTransform(mesh, record);
  if (record.kind === 'plane') mesh.scale.set(record.scale[0], record.scale[1], 1);
  else mesh.scale.set(...record.scale);
  configureShadows(mesh, quality, record.role);
  mesh.userData.role = record.role || '';
  return mesh;
}

function createPerson(record, resources, quality) {
  const group = new THREE.Group();
  const width = record.scale[0];
  const height = record.scale[1];
  const depth = record.scale[2];
  const clothes = resources.material(record);
  const skin = resources.material({ color: '#bd9273', role: 'skin' });
  const hair = resources.material({ color: '#302c29', role: 'hair' });
  const accent = resources.material({ color: record.accent || '#d6c483', role: 'accent' });
  const box = resources.geometry('box', () => new THREE.BoxGeometry(1, 1, 1));
  const sphere = resources.geometry('person-head', () => new THREE.SphereGeometry(0.5, 10, 8));
  const limb = resources.geometry('person-limb', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 7));

  const torso = new THREE.Mesh(box, clothes);
  torso.position.y = height * 0.59;
  torso.scale.set(width * 0.58, height * 0.48, depth * 0.42);

  const sash = new THREE.Mesh(box, accent);
  sash.position.set(0, height * 0.69, depth * 0.225);
  sash.scale.set(width * 0.6, height * 0.055, depth * 0.035);

  const head = new THREE.Mesh(sphere, skin);
  head.position.y = height * 0.91;
  head.scale.set(width * 0.25, height * 0.12, depth * 0.25);

  const hairCap = new THREE.Mesh(sphere, hair);
  hairCap.position.set(0, height * 0.95, -depth * 0.012);
  hairCap.scale.set(width * 0.265, height * 0.074, depth * 0.265);

  const leftLeg = new THREE.Mesh(limb, clothes);
  leftLeg.position.set(-width * 0.14, height * 0.22, 0);
  leftLeg.scale.set(width * 0.11, height * 0.38, depth * 0.11);
  const rightLeg = leftLeg.clone();
  rightLeg.position.x *= -1;

  const leftArm = new THREE.Mesh(limb, skin);
  leftArm.position.set(-width * 0.37, height * 0.61, 0);
  leftArm.rotation.z = -0.12;
  leftArm.scale.set(width * 0.075, height * 0.38, depth * 0.075);
  const rightArm = leftArm.clone();
  rightArm.position.x *= -1;
  rightArm.rotation.z *= -1;

  for (const mesh of [torso, sash, head, hairCap, leftLeg, rightLeg, leftArm, rightArm]) {
    configureShadows(mesh, quality, 'person');
    group.add(mesh);
  }
  applyTransform(group, record);
  group.userData.role = 'person';
  return group;
}

function createReedField(record, count, resources, quality) {
  const group = new THREE.Group();
  const stemGeometry = resources.addGeometry(new THREE.CylinderGeometry(0.018, 0.028, 1, 5));
  const headGeometry = resources.addGeometry(new THREE.CylinderGeometry(0.045, 0.012, 0.28, 5));
  const stemMaterial = resources.addMaterial(new THREE.MeshStandardMaterial({
    color: record.color,
    roughness: 0.82,
    metalness: 0
  }));
  const headMaterial = resources.addMaterial(new THREE.MeshStandardMaterial({
    color: '#7b6948',
    roughness: 0.9,
    metalness: 0
  }));
  const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, count);
  const heads = new THREE.InstancedMesh(headGeometry, headMaterial, count);
  stems.castShadow = quality.shadows;
  stems.receiveShadow = quality.shadows;
  heads.castShadow = quality.shadows;

  const random = seededRandom(record.seed || 1);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  for (let index = 0; index < count; index += 1) {
    const x = (random() - 0.5) * record.scale[0];
    const z = (random() - 0.5) * record.scale[2];
    const height = record.scale[1] * (0.58 + random() * 0.48);
    const lean = (random() - 0.5) * 0.08;
    quaternion.setFromEuler(new THREE.Euler(lean, random() * Math.PI, lean * 0.6));

    position.set(x, height * 0.5, z);
    scale.set(0.8 + random() * 0.45, height, 0.8 + random() * 0.45);
    matrix.compose(position, quaternion, scale);
    stems.setMatrixAt(index, matrix);

    position.set(x, height + 0.06, z);
    scale.set(0.85 + random() * 0.35, 0.72 + random() * 0.55, 0.85 + random() * 0.35);
    matrix.compose(position, quaternion, scale);
    heads.setMatrixAt(index, matrix);
  }
  stems.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  group.add(stems, heads);
  applyTransform(group, record);
  group.userData.role = 'reed-field';
  return group;
}

function createHotspotMarker(hotspot, resources, quality) {
  const group = new THREE.Group();
  const color = hotspot.color || '#b64a43';
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
    definition.id === 'reeds-wetland' ? '#485347' : '#665b4f',
    environment.ambientIntensity
  );
  const fill = new THREE.AmbientLight(environment.ambient, environment.ambientIntensity * 0.34);
  const sun = new THREE.DirectionalLight(environment.sun, environment.sunIntensity);
  sun.position.set(...environment.sunPosition);
  sun.target.position.set(0, 0, -2);
  sun.castShadow = quality.shadows;
  if (quality.shadows) {
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 40;
    sun.shadow.bias = -0.0008;
  }
  group.add(hemisphere, fill, sun, sun.target);
  return group;
}

export function buildScene(definition, { quality }) {
  const resources = createResourceStore();
  const group = new THREE.Group();
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
      object = createPerson(record, resources, quality);
    } else if (record.kind === 'reed-field') {
      const isLast = reedIndex === reedRecords.length - 1;
      const count = isLast
        ? quality.reedCount - reedsAssigned
        : Math.max(1, Math.round(quality.reedCount * (record.density || 1) / reedWeight));
      reedsAssigned += count;
      reedIndex += 1;
      object = createReedField(record, count, resources, quality);
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

  return {
    group,
    markerById,
    dispose() {
      group.removeFromParent();
      resources.dispose();
      markerById.clear();
      group.clear();
    }
  };
}
