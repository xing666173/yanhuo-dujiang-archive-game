import * as THREE from '../vendor/three.module.min.js';

export function seededRandom(seed) {
  let value = typeof seed === 'string'
    ? [...seed].reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619), 2166136261)
    : seed;
  value >>>= 0;
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

export function createWoodTextures(resources, key, colors) {
  const width = 128;
  const height = 32;
  const grainLineCount = 18;
  const scratchCount = 8;
  const scratchColor = '#3d372f';
  const createCanvasTexture = (suffix, draw, colorTexture = false) => resources.texture(
    `wood-${key}-${suffix}`,
    () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      draw(context, seededRandom(`${key}-${suffix}`));
      const texture = new THREE.CanvasTexture(canvas);
      if (colorTexture) texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      return texture;
    }
  );

  const colorMap = createCanvasTexture('color', (context, random) => {
    context.fillStyle = colors[0];
    context.fillRect(0, 0, width, height);
    for (let index = 0; index < grainLineCount; index += 1) {
      const y = 1 + random() * (height - 2);
      context.strokeStyle = colors[1 + Math.floor(random() * Math.max(1, colors.length - 1))];
      context.globalAlpha = 0.18 + random() * 0.24;
      context.lineWidth = 0.45 + random() * 0.75;
      context.beginPath();
      context.moveTo(-4, y);
      context.bezierCurveTo(
        width * 0.3,
        y + (random() - 0.5) * 1.8,
        width * 0.7,
        y + (random() - 0.5) * 1.8,
        width + 4,
        y + (random() - 0.5) * 0.8
      );
      context.stroke();
    }
    context.strokeStyle = scratchColor;
    for (let index = 0; index < scratchCount; index += 1) {
      const x = random() * (width - 18);
      const y = random() * height;
      context.globalAlpha = 0.34 + random() * 0.28;
      context.lineWidth = 0.55 + random() * 0.65;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + 8 + random() * 20, y + (random() - 0.5) * 1.4);
      context.stroke();
    }
    context.globalAlpha = 1;
  }, true);
  colorMap.userData.woodPattern = Object.freeze({
    baseColor: colors[0],
    scratchColor,
    grainLineCount,
    scratchCount
  });

  const roughnessMap = createCanvasTexture('roughness', (context, random) => {
    context.fillStyle = '#888888';
    context.fillRect(0, 0, width, height);
    context.lineCap = 'round';
    context.strokeStyle = '#b8b8b8';
    for (let index = 0; index < 12; index += 1) {
      const y = random() * height;
      context.globalAlpha = 0.2 + random() * 0.3;
      context.lineWidth = 0.6 + random() * 1.4;
      context.beginPath();
      context.moveTo(random() * 18 - 6, y);
      context.lineTo(width - random() * 22, y + (random() - 0.5) * 1.5);
      context.stroke();
    }
    context.strokeStyle = '#545454';
    for (let index = 0; index < 7; index += 1) {
      const y = random() * height;
      context.globalAlpha = 0.24 + random() * 0.28;
      context.lineWidth = 0.7 + random() * 1.8;
      context.beginPath();
      context.moveTo(random() * width * 0.25, y);
      context.lineTo(width * (0.48 + random() * 0.5), y + (random() - 0.5) * 1.8);
      context.stroke();
    }
    context.globalAlpha = 1;
  });

  return { colorMap, roughnessMap };
}
