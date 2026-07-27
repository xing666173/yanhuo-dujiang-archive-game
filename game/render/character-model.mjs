import * as THREE from '../vendor/three.module.min.js';

const THIGH_LENGTH = 0.22;
const SHIN_LENGTH = 0.19;
const FOOT_HEIGHT = 0.07;
const HIP_HEIGHT = THIGH_LENGTH + SHIN_LENGTH + FOOT_HEIGHT;

function material(resources, color, role, profile = role) {
  return resources.material({ color, role, material: profile });
}

function poseOffsets(pose, side) {
  if (pose === 'camera') {
    return {
      shoulder: [-0.9, 0, side * 0.22],
      elbow: [-1.08, 0, side * -0.1]
    };
  }
  if (pose === 'writing') {
    return {
      shoulder: [-0.55, 0, side * 0.18],
      elbow: [-0.86, 0, side * -0.08]
    };
  }
  if (pose === 'listening') {
    return side < 0
      ? { shoulder: [-0.42, 0, -0.12], elbow: [-1.08, 0, 0.08] }
      : { shoulder: [0, 0, 0.08], elbow: [-0.12, 0, -0.05] };
  }
  if (pose === 'lean') {
    return {
      shoulder: [-0.12, 0, side * 0.1],
      elbow: [-0.28, 0, side * -0.05]
    };
  }
  return {
    shoulder: [0, 0, side * 0.06],
    elbow: [-0.08, 0, 0]
  };
}

export function createCharacterModel(record, { resources, quality }) {
  const group = new THREE.Group();
  const parts = new Map();

  function register(name, object) {
    object.name = name;
    parts.set(name, object);
    return object;
  }

  function joint(name, parent, position = [0, 0, 0], rotation = [0, 0, 0]) {
    const object = register(name, new THREE.Group());
    object.position.set(...position);
    object.rotation.set(...rotation);
    parent.add(object);
    return object;
  }

  function mesh(name, parent, geometry, meshMaterial, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
    const object = register(name, new THREE.Mesh(geometry, meshMaterial));
    object.position.set(...position);
    object.scale.set(...scale);
    object.rotation.set(...rotation);
    parent.add(object);
    return object;
  }

  const jacket = material(resources, record.jacket, 'jacket', 'woven-accent');
  const trousers = material(resources, record.trousers, 'trousers');
  const skin = material(resources, record.skin, 'skin');
  const hair = material(resources, '#252a28', 'hair');
  const accent = material(resources, record.accent, 'accent', 'woven-accent');
  const backpack = material(resources, record.backpack, 'backpack', 'woven-accent');
  const shoe = material(resources, '#202625', 'shoe');
  const dark = material(resources, '#171d1c', 'character-detail', 'camera');

  const torsoGeometry = resources.geometry(
    'character-tapered-torso',
    () => new THREE.CylinderGeometry(0.2, 0.15, 0.34, 8, 1)
  );
  const pelvisGeometry = resources.geometry(
    'character-tapered-pelvis',
    () => new THREE.CylinderGeometry(0.145, 0.17, 0.13, 8, 1)
  );
  const upperArmGeometry = resources.geometry(
    'character-upper-arm',
    () => new THREE.CylinderGeometry(0.045, 0.055, 0.22, 7, 1)
  );
  const forearmGeometry = resources.geometry(
    'character-forearm',
    () => new THREE.CylinderGeometry(0.036, 0.047, 0.2, 7, 1)
  );
  const handGeometry = resources.geometry(
    'character-hand',
    () => new THREE.SphereGeometry(0.5, 8, 6)
  );
  const thighGeometry = resources.geometry(
    'character-thigh',
    () => new THREE.CylinderGeometry(0.055, 0.07, THIGH_LENGTH, 7, 1)
  );
  const shinGeometry = resources.geometry(
    'character-shin',
    () => new THREE.CylinderGeometry(0.043, 0.055, SHIN_LENGTH, 7, 1)
  );
  const headGeometry = resources.geometry(
    'character-head',
    () => new THREE.SphereGeometry(0.5, 12, 8)
  );
  const hairCapGeometry = resources.geometry(
    'character-hair-cap',
    () => new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.62)
  );
  const sphere = resources.geometry(
    'character-sphere',
    () => new THREE.SphereGeometry(0.5, 8, 6)
  );
  const cylinder = resources.geometry(
    'cylinder',
    () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8)
  );
  const box = resources.geometry('box', () => new THREE.BoxGeometry(1, 1, 1));

  const torsoScale = record.gender === 'female' ? [0.94, 1, 0.96] : [1, 1, 1];
  mesh('torso', group, torsoGeometry, jacket, [0, 0.64, 0], torsoScale);
  mesh(
    'pelvis',
    group,
    pelvisGeometry,
    trousers,
    [0, 0.45, 0],
    record.gender === 'female' ? [1.06, 1, 1] : [1, 1, 1]
  );
  mesh('neck', group, cylinder, skin, [0, 0.835, 0], [0.07, 0.09, 0.07]);
  mesh('head', group, headGeometry, skin, [0, 0.925, -0.005], [0.145, 0.13, 0.14]);
  mesh('nose', group, sphere, skin, [0, 0.925, -0.139], [0.035, 0.038, 0.045]);
  mesh('left-ear', group, sphere, skin, [-0.145, 0.925, -0.002], [0.025, 0.04, 0.022]);
  mesh('right-ear', group, sphere, skin, [0.145, 0.925, -0.002], [0.025, 0.04, 0.022]);
  mesh('hair-cap', group, hairCapGeometry, hair, [0, 0.964, 0], [0.151, 0.135, 0.146]);

  if (record.hairStyle === 'short-side') {
    mesh('hair-side', group, box, hair, [-0.12, 0.94, 0.01], [0.035, 0.13, 0.13], [0, 0, 0.08]);
  } else if (record.hairStyle === 'short-wavy') {
    for (const [index, x] of [-0.09, 0, 0.09].entries()) {
      mesh(`hair-wave-${index + 1}`, group, sphere, hair, [x, 1.014, -0.072], [0.075, 0.045, 0.055]);
    }
  } else if (record.hairStyle === 'low-ponytail') {
    mesh('hair-tail-band', group, cylinder, accent, [0, 0.91, 0.145], [0.035, 0.035, 0.035], [Math.PI / 2, 0, 0]);
    mesh('hair-ponytail', group, sphere, hair, [0, 0.845, 0.18], [0.07, 0.12, 0.065], [0.15, 0, 0]);
  } else {
    mesh('hair-layer', group, box, hair, [0.075, 0.995, -0.075], [0.13, 0.035, 0.08], [0, 0, -0.12]);
  }

  mesh('backpack', group, box, backpack, [0, 0.62, 0.145], [0.29, 0.31, 0.13]);
  mesh('left-backpack-strap', group, box, backpack, [-0.12, 0.65, -0.145], [0.035, 0.31, 0.025], [0, 0, -0.08]);
  mesh('right-backpack-strap', group, box, backpack, [0.12, 0.65, -0.145], [0.035, 0.31, 0.025], [0, 0, 0.08]);

  for (const [sideName, side] of [['left', -1], ['right', 1]]) {
    const offsets = poseOffsets(record.pose, side);
    const shoulder = joint(`${sideName}-shoulder`, group, [side * 0.225, 0.745, 0]);
    const shoulderPose = joint(`${sideName}-shoulder-pose`, shoulder, [0, 0, 0], offsets.shoulder);
    mesh(`${sideName}-upper-arm`, shoulderPose, upperArmGeometry, jacket, [0, -0.11, 0]);
    const elbow = joint(`${sideName}-elbow`, shoulderPose, [0, -0.22, 0]);
    const elbowPose = joint(`${sideName}-elbow-pose`, elbow, [0, 0, 0], offsets.elbow);
    mesh(`${sideName}-forearm`, elbowPose, forearmGeometry, skin, [0, -0.1, 0]);
    mesh(`${sideName}-hand`, elbowPose, handGeometry, skin, [0, -0.225, -0.002], [0.075, 0.095, 0.065]);

    const hip = joint(`${sideName}-hip`, group, [side * 0.095, HIP_HEIGHT, 0]);
    mesh(`${sideName}-thigh`, hip, thighGeometry, trousers, [0, -THIGH_LENGTH / 2, 0]);
    const knee = joint(`${sideName}-knee`, hip, [0, -THIGH_LENGTH, 0]);
    mesh(`${sideName}-shin`, knee, shinGeometry, trousers, [0, -SHIN_LENGTH / 2, 0]);
    mesh(
      `${sideName}-foot`,
      knee,
      box,
      shoe,
      [0, -(SHIN_LENGTH + FOOT_HEIGHT / 2), -0.045],
      [0.115, FOOT_HEIGHT, 0.22]
    );
  }

  const propType = record.cue || record.prop;
  if (propType) {
    const prop = joint('prop', group, [0, 0, 0]);
    if (propType === 'camera') {
      mesh('prop-camera-body', prop, box, accent, [0, 0.71, -0.27], [0.24, 0.12, 0.13]);
      mesh('prop-camera-lens', prop, cylinder, dark, [0, 0.71, -0.36], [0.075, 0.1, 0.075], [Math.PI / 2, 0, 0]);
    } else if (propType === 'notebook') {
      mesh('prop-notebook', prop, box, accent, [0, 0.55, -0.25], [0.3, 0.025, 0.25], [-0.28, 0, 0]);
    } else if (propType === 'route-folder') {
      mesh('prop-route-folder', prop, box, accent, [0, 0.55, -0.25], [0.39, 0.028, 0.29], [-0.28, 0, 0]);
    } else if (propType === 'voice-recorder') {
      mesh('prop-voice-recorder', prop, box, accent, [-0.19, 0.67, -0.2], [0.065, 0.17, 0.055], [-0.1, 0, -0.15]);
    }
  }

  group.position.set(...record.position);
  group.rotation.set(...record.rotation);
  group.scale.set(...record.scale);
  group.userData.baseY = record.position[1];
  group.userData.role = 'person';
  group.userData.characterId = record.characterId || '';

  const model = {
    group,
    parts,
    update({ elapsed = 0, movementMagnitude = 0 } = {}) {
      const stride = Math.sin(elapsed * 9) * Math.min(1, movementMagnitude) * 0.42;
      parts.get('left-hip').rotation.x = stride;
      parts.get('right-hip').rotation.x = -stride;
      parts.get('left-shoulder').rotation.x = -stride * 0.65;
      parts.get('right-shoulder').rotation.x = stride * 0.65;
      group.position.y = group.userData.baseY
        + Math.abs(Math.sin(elapsed * 9)) * Math.min(1, movementMagnitude) * 0.025;
    },
    setQuality(nextQuality) {
      group.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = nextQuality.shadows;
        object.receiveShadow = nextQuality.shadows;
      });
    }
  };

  model.setQuality(quality);
  return model;
}
