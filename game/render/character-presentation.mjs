import * as THREE from '../vendor/three.module.min.js';

const MATERIAL_ROLES = Object.freeze({
  'chen-yu': Object.freeze({
    Skin: 'skin',
    Hair: 'hair',
    Eyebrows: 'hair',
    Eye: 'hair',
    Green: 'clothing',
    Grey: 'clothing',
    Black: 'clothing',
    Brown: 'clothing',
    Brown2: 'clothing',
    LightGreen: 'accent',
    Gold: 'accent'
  }),
  'gu-yan': Object.freeze({
    Skin: 'skin',
    Skin_Darker: 'skin',
    Hair: 'hair',
    Eyebrows: 'hair',
    Eye: 'hair',
    LightBrown: 'clothing',
    White: 'clothing',
    Red_Dark: 'accent',
    LightBlue: 'accent'
  }),
  'lin-xia': Object.freeze({
    Skin: 'skin',
    Hair_Brown: 'hair',
    Hair_Blond: 'hair',
    Brown: 'hair',
    Grey: 'clothing',
    White: 'clothing',
    Orange: 'accent'
  })
});

const PROP_COLORS = Object.freeze({
  camera: ['#252b2a', '#8d433e'],
  notebook: ['#d7d2c4', '#697b82'],
  'voice-recorder': ['#29302f', '#a44743'],
  'route-folder': ['#d5cfbf', '#8d4b44']
});

function desaturatedColor(value) {
  const color = new THREE.Color(value);
  const hsl = {};
  color.getHSL(hsl);
  color.setHSL(hsl.h, hsl.s * 0.82, hsl.l);
  return color;
}

function colorForRole(role, appearance) {
  if (role === 'skin') return appearance.skin;
  if (role === 'hair') return '#282725';
  if (role === 'accent') return appearance.accent;
  return appearance.jacket;
}

function clonePresentationMaterials(root, characterId, appearance) {
  const clonedBySource = new Map();
  const clonedMaterials = new Set();
  const roles = MATERIAL_ROLES[characterId] ?? {};

  root.traverse((object) => {
    if (!object.material) return;
    const sources = Array.isArray(object.material) ? object.material : [object.material];
    const clones = sources.map((source) => {
      if (clonedBySource.has(source)) return clonedBySource.get(source);
      const material = source.clone();
      const role = roles[source.name] ?? 'clothing';
      if (material.color) material.color.copy(desaturatedColor(colorForRole(role, appearance)));
      if (material.emissive) material.emissive.set('#000000');
      if ('roughness' in material) material.roughness = Math.max(0.82, material.roughness || 0);
      if ('metalness' in material) material.metalness = 0;
      material.userData = {
        ...material.userData,
        presentationRole: role,
        baseColor: material.color?.clone(),
        baseEmissive: material.emissive?.clone()
      };
      clonedBySource.set(source, material);
      clonedMaterials.add(material);
      return material;
    });
    object.material = Array.isArray(object.material) ? clones : clones[0];
  });

  return clonedMaterials;
}

function propMesh(geometry, material, position, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  return mesh;
}

function createProp(type) {
  const group = new THREE.Group();
  group.name = `prop-${type}`;
  group.userData.role = 'character-prop';
  group.userData.propType = type;
  const [baseColor, accentColor] = PROP_COLORS[type] ?? PROP_COLORS.notebook;
  const base = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: 0.86,
    metalness: 0
  });
  const accent = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.82,
    metalness: 0
  });
  const geometries = [];
  const materials = [base, accent];
  const box = (x, y, z) => {
    const geometry = new THREE.BoxGeometry(x, y, z);
    geometries.push(geometry);
    return geometry;
  };
  const cylinder = (radius, length) => {
    const geometry = new THREE.CylinderGeometry(radius, radius, length, 8);
    geometries.push(geometry);
    return geometry;
  };

  if (type === 'camera') {
    group.add(
      propMesh(box(0.2, 0.12, 0.08), base, [0, -0.02, -0.08]),
      propMesh(cylinder(0.035, 0.07), accent, [0, -0.02, -0.15], [Math.PI / 2, 0, 0])
    );
    group.rotation.set(-0.25, 0, -0.25);
  } else if (type === 'voice-recorder') {
    group.add(
      propMesh(box(0.055, 0.16, 0.045), base, [0, -0.08, -0.03]),
      propMesh(box(0.032, 0.045, 0.012), accent, [0, -0.04, -0.057])
    );
    group.rotation.set(0.15, 0, 0.18);
  } else {
    const width = type === 'route-folder' ? 0.24 : 0.18;
    group.add(
      propMesh(box(width, 0.018, 0.22), base, [0, -0.08, -0.08]),
      propMesh(box(width * 0.72, 0.008, 0.15), accent, [0, -0.067, -0.085])
    );
    group.rotation.set(-0.65, 0, 0.22);
  }

  return {
    group,
    setQuality(quality) {
      group.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = Boolean(quality.shadows);
        object.receiveShadow = Boolean(quality.shadows);
      });
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}

function setShadows(root, quality) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = Boolean(quality.shadows);
    object.receiveShadow = Boolean(quality.shadows);
  });
}

export function createCharacterPresentation({
  instance,
  record,
  appearance,
  quality,
  reducedMotion = false
}) {
  if (!instance?.group?.isObject3D) throw new Error('Imported character instance requires a group');
  const group = new THREE.Group();
  const driftRoot = new THREE.Group();
  const normalizationRoot = new THREE.Group();
  const importedRoot = instance.group;
  importedRoot.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(importedRoot);
  const sourceHeight = bounds.max.y - bounds.min.y;
  const targetHeight = Number(record.scale?.[1]);
  const finiteBounds = [...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite);
  if (
    bounds.isEmpty()
    || !finiteBounds
    || !Number.isFinite(sourceHeight)
    || sourceHeight <= 0
    || !Number.isFinite(targetHeight)
    || targetHeight <= 0
  ) {
    throw new Error(`Imported character ${record.characterId || ''} has invalid bounds`);
  }
  const scale = targetHeight / sourceHeight;
  const clonedMaterials = clonePresentationMaterials(
    importedRoot,
    record.characterId,
    appearance
  );
  const phase = [...String(record.characterId)].reduce(
    (total, character) => total + character.charCodeAt(0),
    0
  ) * 0.17;
  let prop = null;
  let action = null;
  let disposed = false;
  let activeReducedMotion = Boolean(reducedMotion);

  normalizationRoot.scale.setScalar(scale);
  normalizationRoot.position.y = -bounds.min.y * scale;
  normalizationRoot.add(importedRoot);
  driftRoot.add(normalizationRoot);
  group.add(driftRoot);
  group.position.set(...record.position);
  group.rotation.set(...record.rotation);
  group.userData.role = 'person';
  group.userData.characterId = record.characterId || '';
  group.userData.modelSource = 'imported';

  const propType = record.cue || appearance.prop;
  if (propType) {
    prop = createProp(propType);
    const anchor = importedRoot.getObjectByName('Wrist.R')
      || importedRoot.getObjectByName('Wrist.L')
      || importedRoot;
    anchor.add(prop.group);
  }

  const presentation = {
    group,
    get action() {
      return action;
    },
    play(name = 'Idle') {
      if (disposed || name === action) return null;
      const next = instance.play(name);
      if (!next) return null;
      action = name;
      return next;
    },
    update({ delta = 0, time = 0, action: nextAction = 'Idle' } = {}) {
      if (disposed) return;
      presentation.play(nextAction);
      instance.update({ delta });
      driftRoot.rotation.z = !activeReducedMotion && action === 'Idle'
        ? Math.sin(time * 0.0011 + phase) * 0.006
        : 0;
    },
    setReducedMotion(value) {
      if (disposed) return;
      activeReducedMotion = Boolean(value);
      if (activeReducedMotion) driftRoot.rotation.z = 0;
    },
    setQuality(nextQuality) {
      if (disposed) return;
      instance.setQuality(nextQuality);
      setShadows(importedRoot, nextQuality);
      prop?.setQuality(nextQuality);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      prop?.dispose();
      for (const material of clonedMaterials) material.dispose();
      instance.dispose();
      group.removeFromParent();
      group.clear();
    }
  };

  presentation.setQuality(quality);
  presentation.play('Idle');
  return presentation;
}
