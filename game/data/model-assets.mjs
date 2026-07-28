const CHARACTER_ANIMATIONS = Object.freeze(['Idle', 'Walk', 'Interact', 'Wave']);

export const MODEL_ASSETS = Object.freeze({
  'chen-yu': Object.freeze({
    id: 'chen-yu',
    kind: 'character',
    url: './assets/models/chen-yu.glb',
    sourceUrl: 'https://quaternius.com/packs/ultimatemodularcharacters.html',
    license: 'CC0-1.0',
    animations: CHARACTER_ANIMATIONS,
    triangleCount: 10_202,
    maxBytes: 1_500_000
  }),
  'gu-yan': Object.freeze({
    id: 'gu-yan',
    kind: 'character',
    url: './assets/models/gu-yan.glb',
    sourceUrl: 'https://quaternius.com/packs/ultimatemodularcharacters.html',
    license: 'CC0-1.0',
    animations: CHARACTER_ANIMATIONS,
    triangleCount: 5_776,
    maxBytes: 1_500_000
  }),
  'lin-xia': Object.freeze({
    id: 'lin-xia',
    kind: 'character',
    url: './assets/models/lin-xia.glb',
    sourceUrl: 'https://quaternius.com/packs/ultimatemodularwomen.html',
    license: 'CC0-1.0',
    animations: CHARACTER_ANIMATIONS,
    triangleCount: 6_424,
    maxBytes: 1_500_000
  }),
  'birch-tree-1': Object.freeze({
    id: 'birch-tree-1',
    kind: 'environment',
    url: './assets/models/birch-tree-1.glb',
    sourceUrl: 'https://quaternius.com/packs/ultimatestylizednature.html',
    license: 'CC0-1.0',
    animations: Object.freeze([]),
    triangleCount: 2_000,
    maxBytes: 500_000
  }),
  'birch-tree-3': Object.freeze({
    id: 'birch-tree-3',
    kind: 'environment',
    url: './assets/models/birch-tree-3.glb',
    sourceUrl: 'https://quaternius.com/packs/ultimatestylizednature.html',
    license: 'CC0-1.0',
    animations: Object.freeze([]),
    triangleCount: 2_000,
    maxBytes: 500_000
  }),
  'bush-large': Object.freeze({
    id: 'bush-large',
    kind: 'environment',
    url: './assets/models/bush-large.glb',
    sourceUrl: 'https://quaternius.com/packs/ultimatestylizednature.html',
    license: 'CC0-1.0',
    animations: Object.freeze([]),
    triangleCount: 1_000,
    maxBytes: 500_000
  })
});

export const CHARACTER_MODEL_IDS = Object.freeze(['chen-yu', 'gu-yan', 'lin-xia']);
export const ENVIRONMENT_MODEL_IDS = Object.freeze(['birch-tree-1', 'birch-tree-3', 'bush-large']);
