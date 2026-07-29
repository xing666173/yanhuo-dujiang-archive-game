const PI = Math.PI;

const primitive = (kind, position, scale, color, rotation = [0, 0, 0], extra = {}) => ({
  kind,
  position,
  scale,
  color,
  rotation,
  ...extra
});

const plankPalette = [
  ['#5c574e', 'weathered-wood-a'],
  ['#655d51', 'weathered-wood-b'],
  ['#4e4c46', 'weathered-wood-c'],
  ['#6d6356', 'weathered-wood-d'],
  ['#57544c', 'weathered-wood-e']
];

const boardwalk = [
  ...Array.from({ length: 45 }, (_, index) => {
    const z = 7.78 - index * 0.49;
    const [color, material] = plankPalette[index % plankPalette.length];
    return primitive('box', [0, 0.17 + (index % 4) * 0.004, z], [index % 11 === 0 ? 3.06 : 2.93, 0.16, 0.43], color, [0, (index % 5 - 2) * 0.004, 0], {
      role: 'plank',
      material
    });
  }),
  ...Array.from({ length: 23 }, (_, index) => {
    const z = 7.55 - index * 0.96;
    return [
      primitive('cylinder', [-1.53, 0.7, z], [0.07, 1.04, 0.07], '#39423e', [0, 0, 0], {
        role: 'rail-post',
        material: 'weathered-rail'
      }),
      primitive('cylinder', [1.53, 0.7, z], [0.07, 1.04, 0.07], '#39423e', [0, 0, 0], {
        role: 'rail-post',
        material: 'weathered-rail'
      })
    ];
  }).flat(),
  primitive('cylinder', [-1.53, 1.1, -3.2], [0.065, 21.8, 0.065], '#414942', [PI / 2, 0, 0], {
    role: 'rail',
    material: 'weathered-rail'
  }),
  primitive('cylinder', [1.53, 1.1, -3.2], [0.065, 21.8, 0.065], '#414942', [PI / 2, 0, 0], {
    role: 'rail',
    material: 'weathered-rail'
  })
];

const platform = (z, offset) => [
  ...Array.from({ length: 10 }, (_, index) => {
    const [color, material] = plankPalette[(index + offset) % plankPalette.length];
    return primitive('box', [0, 0.16, z - 0.9 + index * 0.2], [5.88, 0.16, 0.18], color, [0, 0, 0], {
      role: 'platform-plank',
      material
    });
  }),
  primitive('cylinder', [-2.96, 1.08, z], [0.065, 2, 0.065], '#414942', [PI / 2, 0, 0], {
    role: 'rail',
    material: 'weathered-rail'
  }),
  primitive('cylinder', [2.96, 1.08, z], [0.065, 2, 0.065], '#414942', [PI / 2, 0, 0], {
    role: 'rail',
    material: 'weathered-rail'
  })
];

const reedPalette = ['#314a3b', '#3f5a45', '#52684d', '#667858'];
const reedHeadPalette = ['#655a42', '#746348', '#554c39'];

const wetland = [
  primitive('plane', [0, -0.14, -4], [38, 40, 1], '#47767a', [-PI / 2, 0, 0], {
    role: 'water',
    material: 'wetland-water',
    transparent: true,
    opacity: 0.96,
    waveAmplitude: 0.055,
    waveSpeed: 0.00072
  }),
  primitive('plane', [0, -0.09, -4], [38, 40, 1], '#a5c7c2', [-PI / 2, 0, 0], {
    role: 'water-sheen',
    material: 'wetland-water-sheen',
    transparent: true,
    opacity: 0.17,
    waveAmplitude: 0.027,
    waveSpeed: 0.00046
  }),
  primitive('box', [0, 0.18, -17.2], [42, 0.86, 3.2], '#405047', [0, 0, 0], {
    role: 'horizon-shore',
    material: 'shore'
  }),
  primitive('box', [-11.5, 0.08, -15.8], [13, 0.55, 1.7], '#4c5d50', [0, 0.03, 0], {
    role: 'shore',
    material: 'shore'
  }),
  primitive('box', [10.8, 0.04, -16], [14, 0.5, 1.5], '#46574b', [0, -0.025, 0], {
    role: 'shore',
    material: 'shore'
  }),
  primitive('box', [-13.5, -0.02, 5.5], [8, 0.24, 5], '#46564d', [0, 0.08, 0], {
    role: 'near-shore',
    material: 'shore'
  }),
  primitive('box', [6.4, 0.18, -7.4], [3.4, 0.44, 0.96], '#756957', [0, -0.22, 0], {
    role: 'fishing-boat-hull',
    material: 'weathered-wood-c'
  }),
  primitive('box', [6.3, 0.45, -7.4], [2.65, 0.1, 1.03], '#d0b27a', [0, -0.22, 0], {
    role: 'fishing-boat-trim',
    material: 'weathered-wood-a'
  }),
  primitive('cylinder', [5.3, 1.7, -7.15], [0.05, 3, 0.05], '#4a443b', [0, 0, 0], {
    role: 'fishing-boat-pole',
    material: 'weathered-rail'
  }),
  primitive('cylinder', [5.75, 1.26, -7.38], [0.035, 1.5, 0.035], '#554b3d', [0, 0, 0], {
    role: 'fishing-boat-frame',
    material: 'weathered-rail'
  }),
  primitive('cylinder', [6.95, 1.26, -7.38], [0.035, 1.5, 0.035], '#554b3d', [0, 0, 0], {
    role: 'fishing-boat-frame',
    material: 'weathered-rail'
  }),
  primitive('box', [6.35, 2.02, -7.38], [2.2, 0.12, 1.08], '#a45f48', [0, -0.22, 0], {
    role: 'fishing-boat-canopy',
    material: 'weathered-wood-d'
  }),
  primitive('tree-line', [0, 0.15, -16.25], [38, 3.35, 2.7], '#3f5443', [0, 0, 0], {
    count: 42,
    seed: 149,
    trunkColor: '#4c443a',
    palette: ['#2f4539', '#405646', '#52634d']
  }),
  primitive('lotus-field', [-6.35, -0.05, -5.1], [5.7, 0.3, 22.4], '#58734f', [0, 0, 0], {
    density: 0.52,
    seed: 211,
    stemColor: '#466142',
    budColor: '#b4878d',
    budRate: 0.17,
    corridorHalfWidth: 3.35
  }),
  primitive('lotus-field', [6.4, -0.055, -5.45], [5.8, 0.3, 21.7], '#647d57', [0, 0, 0], {
    density: 0.48,
    seed: 307,
    stemColor: '#4a6545',
    budColor: '#c29aa0',
    budRate: 0.15,
    corridorHalfWidth: 3.35
  }),
  primitive('reed-field', [-5.2, 0, -3.3], [6.6, 1.9, 25.5], '#52694d', [0, 0, 0], {
    density: 0.54,
    seed: 17,
    palette: reedPalette,
    headPalette: reedHeadPalette,
    cluster: 15,
    distanceFade: 0.2
  }),
  primitive('reed-field', [5.15, 0, -3.7], [6.5, 2.05, 26], '#4b6349', [0, 0, 0], {
    density: 0.58,
    seed: 41,
    palette: [...reedPalette].reverse(),
    headPalette: reedHeadPalette,
    cluster: 16,
    distanceFade: 0.22,
    waterChannel: {
      from: [2.3, 5.6],
      to: [6.4, -7.4],
      halfWidth: 1.05,
      heightScale: 0.12
    }
  }),
  primitive('reed-field', [-0.5, 0, -14.7], [12, 1.25, 3.5], '#51644a', [0, 0, 0], {
    density: 0.2,
    seed: 73,
    palette: ['#344d3f', '#455d48', '#566d50'],
    headPalette: reedHeadPalette,
    cluster: 10,
    distanceFade: 0.34
  }),
  primitive('reed-field', [-3.5, 0, 6.2], [2.6, 1.45, 4.1], '#5d7150', [0, 0, 0], {
    density: 0.12,
    seed: 91,
    palette: reedPalette,
    headPalette: reedHeadPalette,
    cluster: 6,
    distanceFade: 0.1
  }),
  primitive('reed-field', [3.75, 0, 5.8], [2.5, 1.55, 4.2], '#58704f', [0, 0, 0], {
    density: 0.12,
    seed: 111,
    palette: reedPalette,
    headPalette: reedHeadPalette,
    cluster: 6,
    distanceFade: 0.1
  })
];

const teammates = [
  primitive('person', [2.25, 0.26, -3.72], [0.91, 1.74, 0.88], '#4a5d4e', [0, -0.75, 0], {
    characterId: 'gu-yan',
    cue: 'notebook',
    pose: 'writing'
  }),
  primitive('person', [0.2, 0.26, -8.65], [0.86, 1.65, 0.84], '#52606a', [0, 0.25, 0], {
    characterId: 'lin-xia',
    cue: 'voice-recorder',
    pose: 'listening'
  })
];

const environmentModels = [
  {
    id: 'west-near-birch',
    modelId: 'birch-tree-1',
    position: [-5.2, 0.02, -4.8],
    rotation: [0, 0.28, 0],
    height: 3.8
  },
  {
    id: 'east-mid-birch',
    modelId: 'birch-tree-3',
    position: [5.35, 0.01, -8.2],
    rotation: [0, -0.42, 0],
    height: 4.1
  },
  {
    id: 'west-mid-birch',
    modelId: 'birch-tree-1',
    position: [-6.2, 0.02, -12],
    rotation: [0, 0.67, 0],
    height: 3.6
  },
  {
    id: 'east-far-birch',
    modelId: 'birch-tree-3',
    position: [6.45, 0, -14.2],
    rotation: [0, -0.18, 0],
    height: 4.2
  },
  {
    id: 'west-near-bush',
    modelId: 'bush-large',
    position: [-4.25, 0, 3.35],
    rotation: [0, 0.36, 0],
    height: 1.05
  },
  {
    id: 'east-near-bush',
    modelId: 'bush-large',
    position: [4.4, 0, 1.9],
    rotation: [0, -0.52, 0],
    height: 0.92
  },
  {
    id: 'west-mid-bush',
    modelId: 'bush-large',
    position: [-4.6, 0, -7.25],
    rotation: [0, 0.82, 0],
    height: 0.86
  },
  {
    id: 'east-mid-bush',
    modelId: 'bush-large',
    position: [4.75, 0, -10.7],
    rotation: [0, -0.25, 0],
    height: 1.1
  }
];

export const reedsWetlandDefinition = {
  id: 'reeds-wetland',
  playerCharacterId: 'chen-yu',
  visualSurfaceHeight: 0.26,
  environmentModels,
  environment: {
    background: '#91aaad',
    fog: '#a6b7b5',
    fogNear: 10,
    fogFar: 36,
    ambient: '#b8cdd0',
    ground: '#34483f',
    ambientIntensity: 1.06,
    sun: '#ffd5a5',
    sunIntensity: 2.18,
    sunPosition: [-9, 11, 7],
    rim: '#a8c5ca',
    rimIntensity: 0.44,
    exposure: 1.02,
    cameraDistance: 4.75,
    mobileCameraDistance: 5.05,
    cameraTargetHeight: 0.9,
    cameraShoulder: 0.42
  },
  bounds: {
    min: [-5, 0, -14],
    max: [5, 0, 8]
  },
  playerStart: [0, 0, 6],
  walkableAreas: [
    { minX: -1.5, maxX: 1.5, minZ: -14, maxZ: 8 },
    { minX: -3, maxX: 3, minZ: -1, maxZ: 1 },
    { minX: -3, maxX: 3, minZ: -5, maxZ: -3 }
  ],
  hotspots: [
    {
      id: 'camera-spot',
      scriptId: 'reeds-camera',
      position: [-2.2, 0, 0],
      radius: 1.35,
      color: '#9a4c48',
      characterId: 'chen-yu',
      label: '陈屿取景位',
      actionLabel: '开始晨雾取景'
    },
    {
      id: 'notes-spot',
      scriptId: 'reeds-notes',
      position: [2.1, 0, -4],
      radius: 1.35,
      color: '#b8a363',
      characterId: 'gu-yan',
      label: '顾言',
      actionLabel: '协助核对路线'
    },
    {
      id: 'voice-spot',
      scriptId: 'reeds-voice',
      position: [0.5, 0, -9],
      radius: 1.4,
      color: '#6e8370',
      characterId: 'lin-xia',
      label: '林夏',
      actionLabel: '协助安静收声'
    }
  ],
  primitives: [
    ...wetland,
    ...boardwalk,
    ...platform(0, 1),
    ...platform(-4, 3),
    ...teammates
  ]
};
