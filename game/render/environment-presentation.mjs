import * as THREE from '../vendor/three.module.min.js';

const TREE_SWAY_LIMIT = 0.008;
const BUSH_SWAY_LIMIT = 0.012;
const WETLAND_HUE = new THREE.Color('#607965').getHSL({}).h;

function wetlandColor(value) {
  const color = new THREE.Color(value);
  const hsl = {};
  color.getHSL(hsl);
  const hueDelta = THREE.MathUtils.euclideanModulo(WETLAND_HUE - hsl.h + 0.5, 1) - 0.5;
  color.setHSL(
    THREE.MathUtils.euclideanModulo(hsl.h + hueDelta * 0.06, 1),
    hsl.s * 0.78,
    THREE.MathUtils.clamp(hsl.l * 0.98, 0, 1)
  );
  return color;
}

function cloneMaterials(root) {
  const clonedBySource = new Map();
  const clonedMaterials = new Set();

  root.traverse((object) => {
    if (!object.material) return;
    const sources = Array.isArray(object.material) ? object.material : [object.material];
    const clones = sources.map((source) => {
      if (clonedBySource.has(source)) return clonedBySource.get(source);
      const material = source.clone();
      if (material.color) material.color.copy(wetlandColor(material.color));
      if (material.emissive) material.emissive.multiplyScalar(0.35);
      if ('roughness' in material) material.roughness = Math.max(0.84, material.roughness || 0);
      if ('metalness' in material) material.metalness = 0;
      material.userData = {
        ...material.userData,
        environmentPresentation: true,
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

function renderCost(root) {
  let triangleCount = 0;
  let drawCalls = 0;

  root.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    const geometry = object.geometry;
    const triangles = geometry.index
      ? geometry.index.count / 3
      : (geometry.attributes.position?.count ?? 0) / 3;
    const instanceCount = object.isInstancedMesh ? object.count : 1;
    triangleCount += triangles * instanceCount;

    if (Array.isArray(object.material)) {
      drawCalls += geometry.groups.filter((group) => (
        group.count > 0 && object.material[group.materialIndex]
      )).length;
    } else if (object.material) {
      drawCalls += 1;
    }
  });

  return {
    triangleCount: Math.round(triangleCount),
    drawCalls
  };
}

function setShadows(root, quality) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = Boolean(quality.shadows);
    object.receiveShadow = Boolean(quality.shadows);
  });
}

function phaseFor(placement) {
  const key = `${placement.id || placement.modelId || ''}:${placement.index ?? 0}`;
  let hash = 2166136261;
  for (const character of key) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff * Math.PI * 2;
}

export function createEnvironmentPresentation({
  instance,
  placement,
  quality,
  reducedMotion = false
}) {
  if (!instance?.group?.isObject3D) throw new Error('Imported environment instance requires a group');
  const group = new THREE.Group();
  const swayRoot = new THREE.Group();
  const normalizationRoot = new THREE.Group();
  const importedRoot = instance.group;
  importedRoot.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(importedRoot);
  const sourceHeight = bounds.max.y - bounds.min.y;
  const finiteBounds = [...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite);
  const targetHeight = Number(placement.height);
  const uniformScale = Number(placement.scale);
  const scale = Number.isFinite(targetHeight) && targetHeight > 0
    ? targetHeight / sourceHeight
    : uniformScale;

  if (
    bounds.isEmpty()
    || !finiteBounds
    || !Number.isFinite(sourceHeight)
    || sourceHeight <= 0
    || !Number.isFinite(scale)
    || scale <= 0
  ) {
    throw new Error(`Imported environment ${placement.modelId || ''} has invalid bounds`);
  }

  const clonedMaterials = cloneMaterials(importedRoot);
  const cost = renderCost(importedRoot);
  const phase = phaseFor(placement);
  const swayLimit = placement.modelId === 'bush-large' ? BUSH_SWAY_LIMIT : TREE_SWAY_LIMIT;
  let activeReducedMotion = Boolean(reducedMotion);
  let vegetationWind = Boolean(quality.vegetationWind);
  let disposed = false;

  normalizationRoot.scale.setScalar(scale);
  normalizationRoot.position.y = -bounds.min.y * scale;
  normalizationRoot.add(importedRoot);
  swayRoot.add(normalizationRoot);
  group.add(swayRoot);
  group.position.set(...placement.position);
  group.rotation.set(...(placement.rotation ?? [0, 0, 0]));
  group.userData.role = 'environment-model';
  group.userData.placementId = placement.id || '';
  group.userData.modelId = placement.modelId || '';
  group.userData.modelSource = 'imported';

  const presentation = {
    group,
    triangleCount: cost.triangleCount,
    drawCalls: cost.drawCalls,
    update({ time = 0 } = {}) {
      if (disposed) return;
      swayRoot.rotation.z = vegetationWind && !activeReducedMotion
        ? Math.sin(time * 0.00072 + phase) * swayLimit
        : 0;
    },
    setReducedMotion(value) {
      if (disposed) return;
      activeReducedMotion = Boolean(value);
      if (activeReducedMotion) swayRoot.rotation.z = 0;
    },
    setQuality(nextQuality) {
      if (disposed) return;
      vegetationWind = Boolean(nextQuality.vegetationWind);
      if (!vegetationWind) swayRoot.rotation.z = 0;
      instance.setQuality(nextQuality);
      setShadows(importedRoot, nextQuality);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const material of clonedMaterials) material.dispose();
      instance.dispose();
      group.removeFromParent();
      group.clear();
    }
  };

  presentation.setQuality(quality);
  return presentation;
}
