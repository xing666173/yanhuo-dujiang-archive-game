import { AnimationMixer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

function recordsFrom(assetRecords) {
  return Array.isArray(assetRecords) ? assetRecords : Object.values(assetRecords ?? {});
}

function sourceFrom(record, gltf) {
  const scene = gltf?.scene ?? gltf?.scenes?.[0] ?? (gltf?.isObject3D ? gltf : null);
  if (!scene?.isObject3D) throw new Error(`Model ${record.id} did not contain a scene root`);
  const clips = new Map((gltf?.animations ?? []).filter((clip) => clip?.name).map((clip) => [clip.name, clip]));
  return { scene, clips, kind: record.kind };
}

function addTexture(value, textures, visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return;
  visited.add(value);
  if (value.isTexture) {
    textures.add(value);
    return;
  }
  for (const child of Object.values(value)) addTexture(child, textures, visited);
}

function collectSourceResources(sources) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  for (const { scene } of sources.values()) {
    scene.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material)) addTexture(value, textures);
      }
    });
  }
  return { geometries, materials, textures };
}

function createInstance(source, group) {
  const mixer = source.kind === 'character' ? new AnimationMixer(group) : null;
  const actions = new Map();
  let activeName = null;
  let disposed = false;

  const actionFor = (name) => {
    if (!mixer) return null;
    const resolvedName = source.clips.has(name) ? name : 'Idle';
    const clip = source.clips.get(resolvedName);
    if (!clip) return null;
    if (activeName === resolvedName) return actions.get(resolvedName);
    const action = actions.get(resolvedName) ?? mixer.clipAction(clip);
    actions.set(resolvedName, action);
    action.reset().play();
    activeName = resolvedName;
    return action;
  };

  return {
    group,
    mixer,
    update(delta) {
      if (!disposed && mixer && Number.isFinite(delta) && delta >= 0) mixer.update(delta);
    },
    setQuality() {},
    play(name) {
      return disposed ? null : actionFor(name);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (mixer) {
        mixer.stopAllAction();
        mixer.uncacheRoot(group);
      }
    }
  };
}

export async function loadModelLibrary({
  assetRecords,
  loader = new GLTFLoader(),
  skeletonClone = cloneSkeleton,
  onProgress = () => {}
} = {}) {
  const records = recordsFrom(assetRecords);
  let settled = 0;
  const attempts = records.map((record) => Promise.resolve()
    .then(() => loader.loadAsync(record.url))
    .then((gltf) => sourceFrom(record, gltf))
    .then(
      (source) => {
        settled += 1;
        onProgress({ id: record.id, status: 'fulfilled', settled, total: records.length });
        return source;
      },
      (error) => {
        settled += 1;
        onProgress({ id: record.id, status: 'rejected', settled, total: records.length });
        throw error;
      }
    ));
  const results = await Promise.allSettled(attempts);
  const sources = new Map();
  const failures = new Map();
  for (const [index, result] of results.entries()) {
    const record = records[index];
    if (result.status === 'fulfilled') sources.set(record.id, result.value);
    else failures.set(record.id, result.reason);
  }
  let disposed = false;

  const create = (id, kind) => {
    if (disposed) return null;
    const source = sources.get(id);
    if (!source || source.kind !== kind) return null;
    const group = kind === 'character' ? skeletonClone(source.scene) : source.scene.clone(true);
    return createInstance(source, group);
  };

  return {
    loadedIds: [...sources.keys()],
    failures,
    has(id) {
      return !disposed && sources.has(id);
    },
    createCharacter(id) {
      return create(id, 'character');
    },
    createEnvironment(id) {
      return create(id, 'environment');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const { geometries, materials, textures } = collectSourceResources(sources);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
    }
  };
}
