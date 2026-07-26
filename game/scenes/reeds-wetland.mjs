const PI = Math.PI;

const primitive = (kind, position, scale, color, rotation = [0, 0, 0], extra = {}) => ({
  kind,
  position,
  scale,
  color,
  rotation,
  ...extra
});

const boardwalk = [
  ...Array.from({ length: 45 }, (_, index) => {
    const z = 7.78 - index * 0.49;
    const width = index % 11 === 0 ? 3.08 : 2.94;
    return primitive('box', [0, 0.18, z], [width, 0.18, 0.43], index % 3 === 0 ? '#987a52' : '#866944', [0, (index % 4 - 1.5) * 0.004, 0], { role: 'plank' });
  }),
  ...Array.from({ length: 23 }, (_, index) => {
    const z = 7.55 - index * 0.96;
    return [
      primitive('box', [-1.55, 0.72, z], [0.11, 1.08, 0.11], '#65523c', [0, 0, 0], { role: 'rail-post' }),
      primitive('box', [1.55, 0.72, z], [0.11, 1.08, 0.11], '#65523c', [0, 0, 0], { role: 'rail-post' })
    ];
  }).flat(),
  primitive('box', [-1.55, 1.15, -3.2], [0.1, 0.1, 21.8], '#70583e', [0, 0, 0], { role: 'rail' }),
  primitive('box', [1.55, 1.15, -3.2], [0.1, 0.1, 21.8], '#70583e', [0, 0, 0], { role: 'rail' })
];

const platform = (z) => [
  ...Array.from({ length: 10 }, (_, index) => (
    primitive('box', [0, 0.16, z - 0.9 + index * 0.2], [5.9, 0.18, 0.18], index % 2 ? '#8c6f49' : '#9a7a50', [0, 0, 0], { role: 'platform-plank' })
  )),
  primitive('box', [-3, 1.12, z], [0.1, 0.1, 2], '#70583e', [0, 0, 0], { role: 'rail' }),
  primitive('box', [3, 1.12, z], [0.1, 0.1, 2], '#70583e', [0, 0, 0], { role: 'rail' })
];

const wetland = [
  primitive('plane', [0, -0.08, -3], [34, 34, 1], '#6f8580', [-PI / 2, 0, 0], { role: 'water', transparent: true, opacity: 0.86 }),
  primitive('box', [0, -0.15, -16.5], [38, 0.35, 3.2], '#66705a', [0, 0, 0], { role: 'shore' }),
  primitive('box', [-11, 0.18, -15.1], [12, 0.55, 1.5], '#758166', [0, 0.04, 0], { role: 'shore' }),
  primitive('box', [10.5, 0.12, -15.35], [13, 0.44, 1.2], '#6b775e', [0, -0.03, 0], { role: 'shore' }),
  primitive('reed-field', [-5.5, 0, -3], [7, 1.8, 24], '#718060', [0, 0, 0], { density: 0.56, seed: 17 }),
  primitive('reed-field', [5.4, 0, -3.5], [6.8, 2, 25], '#687a55', [0, 0, 0], { density: 0.62, seed: 41 }),
  primitive('reed-field', [-1.7, 0, -13], [2.1, 1.6, 4], '#7e895f', [0, 0, 0], { density: 0.2, seed: 73 }),
  primitive('reed-field', [2.1, 0, 5.6], [2.3, 1.45, 3.8], '#77845e', [0, 0, 0], { density: 0.18, seed: 91 })
];

const teammates = [
  primitive('person', [-2.35, 0.28, 0.25], [0.92, 1.66, 0.92], '#4c5953', [0, 0.7, 0], { accent: '#b64a43' }),
  primitive('person', [2.25, 0.28, -3.72], [0.94, 1.72, 0.94], '#596d58', [0, -0.75, 0], { accent: '#d6c483' }),
  primitive('person', [0.2, 0.28, -8.65], [0.88, 1.6, 0.88], '#a78865', [0, 0.25, 0], { accent: '#708367' })
];

export const reedsWetlandDefinition = {
  id: 'reeds-wetland',
  environment: {
    background: '#c7b994',
    fog: '#c6b58e',
    fogNear: 9,
    fogFar: 38,
    ambient: '#e8ddbd',
    ambientIntensity: 1.6,
    sun: '#ffd59b',
    sunIntensity: 3.4,
    sunPosition: [-8, 11, 7],
    cameraDistance: 5.7,
    cameraTargetHeight: 0.85
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
      color: '#b64a43'
    },
    {
      id: 'notes-spot',
      scriptId: 'reeds-notes',
      position: [2.1, 0, -4],
      radius: 1.35,
      color: '#d1b96f'
    },
    {
      id: 'voice-spot',
      scriptId: 'reeds-voice',
      position: [0.5, 0, -9],
      radius: 1.4,
      color: '#708367'
    }
  ],
  primitives: [
    ...wetland,
    ...boardwalk,
    ...platform(0),
    ...platform(-4),
    ...teammates
  ]
};
