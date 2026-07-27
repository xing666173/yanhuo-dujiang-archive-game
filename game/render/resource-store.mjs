import * as THREE from '../vendor/three.module.min.js';

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function createResourceStore() {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const geometryCache = new Map();
  const materialCache = new Map();
  const textureCache = new Map();

  function geometry(key, factory) {
    if (!geometryCache.has(key)) {
      const resource = factory();
      geometryCache.set(key, resource);
      geometries.add(resource);
    }
    return geometryCache.get(key);
  }

  function texture(key, factory) {
    if (!textureCache.has(key)) {
      const resource = factory();
      textureCache.set(key, resource);
      textures.add(resource);
    }
    return textureCache.get(key);
  }

  function material(record, overrides = {}) {
    const role = record.role || 'standard';
    const profile = record.material || role;
    const key = JSON.stringify([
      record.color,
      role,
      profile,
      Boolean(record.transparent),
      record.opacity ?? 1,
      overrides.emissive || ''
    ]);
    if (!materialCache.has(key)) {
      const glossy = ['camera', 'recorder', 'route-pin', 'brass'].includes(profile);
      const soft = ['plaster', 'paper', 'board-paper', 'chair-fabric', 'book-cloth'].includes(profile);
      const metallic = ['painted-metal', 'painted-steel', 'camera', 'recorder', 'brass'].includes(profile);
      const isLightBand = profile === 'light-band';
      const ambientLift = ['plaster', 'painted-panel', 'linoleum'].includes(profile);
      const resource = new THREE.MeshStandardMaterial({
        color: record.color,
        roughness: glossy ? 0.38 : soft ? 0.86 : profile.startsWith('weathered') ? 0.78 : 0.68,
        metalness: metallic ? (profile === 'brass' ? 0.34 : 0.14) : 0.01,
        transparent: Boolean(record.transparent),
        opacity: record.opacity ?? 1,
        side: record.kind === 'plane' ? THREE.DoubleSide : THREE.FrontSide,
        emissive: overrides.emissive || (isLightBand || ambientLift ? record.color : '#000000'),
        emissiveIntensity: overrides.emissiveIntensity ?? (isLightBand ? 0.4 : ambientLift ? 0.045 : 0),
        depthWrite: !isLightBand
      });
      resource.userData.baseColor = resource.color.clone();
      resource.userData.baseEmissive = resource.emissive.clone();
      materialCache.set(key, resource);
      materials.add(resource);
    }
    return materialCache.get(key);
  }

  return {
    geometry,
    texture,
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
      for (const resource of geometries) resource.dispose();
      for (const resource of materials) resource.dispose();
      for (const resource of textures) resource.dispose();
      geometries.clear();
      materials.clear();
      textures.clear();
      geometryCache.clear();
      materialCache.clear();
      textureCache.clear();
    }
  };
}

export function createNoiseTexture(resources, key, colors, size = 64) {
  return resources.texture(key, () => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const random = seededRandom(key.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0));
    context.fillStyle = colors[0];
    context.fillRect(0, 0, size, size);
    for (let index = 0; index < size * 3; index += 1) {
      context.fillStyle = colors[1 + Math.floor(random() * (colors.length - 1))];
      context.globalAlpha = 0.12 + random() * 0.18;
      const width = 1 + random() * 5;
      context.fillRect(random() * size, random() * size, width, 1 + random() * 2);
    }
    context.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    return texture;
  });
}
