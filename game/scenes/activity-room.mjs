const PI = Math.PI;

const primitive = (kind, position, scale, color, rotation = [0, 0, 0], extra = {}) => ({
  kind,
  position,
  scale,
  color,
  rotation,
  ...extra
});

const roomShell = [
  primitive('plane', [0, 0, 0], [12, 10, 1], '#8b755c', [-PI / 2, 0, 0], { role: 'floor' }),
  primitive('box', [0, 1.55, -4.92], [12, 3.1, 0.16], '#ddd7ca', [0, 0, 0], { role: 'wall' }),
  primitive('box', [-5.92, 1.55, 0], [0.16, 3.1, 10], '#d4d0c6', [0, 0, 0], { role: 'wall' }),
  primitive('box', [5.92, 1.55, 0], [0.16, 3.1, 10], '#d4d0c6', [0, 0, 0], { role: 'wall' }),
  primitive('box', [0, 3.04, 0], [12, 0.12, 10], '#eee9de', [0, 0, 0], { role: 'ceiling' })
];

const windowAndShelves = [
  primitive('plane', [-5.81, 1.85, -0.6], [3.6, 1.65, 1], '#b6c5bd', [0, PI / 2, 0], { role: 'window' }),
  primitive('box', [-5.72, 1.85, -0.6], [0.08, 1.76, 0.08], '#4e514b'),
  primitive('box', [-5.72, 1.85, -1.52], [0.08, 0.08, 1.84], '#4e514b'),
  primitive('box', [-5.72, 1.85, 0.32], [0.08, 0.08, 1.84], '#4e514b'),
  primitive('box', [5.25, 1.05, -1.45], [1.2, 2.1, 0.48], '#5b6552', [0, 0, 0], { role: 'shelf' }),
  primitive('box', [5.25, 1.72, -1.45], [1.08, 0.08, 0.52], '#b2a07a'),
  primitive('box', [5.25, 1.05, -1.45], [1.08, 0.08, 0.52], '#b2a07a'),
  primitive('box', [5.25, 0.38, -1.45], [1.08, 0.08, 0.52], '#b2a07a'),
  primitive('box', [5.03, 1.36, -1.45], [0.15, 0.5, 0.34], '#b64a43'),
  primitive('box', [5.28, 1.34, -1.45], [0.15, 0.46, 0.34], '#708367'),
  primitive('box', [5.51, 1.32, -1.45], [0.15, 0.42, 0.34], '#d6c483')
];

const desk = (x, z, width, color, rotation = 0) => [
  primitive('box', [x, 0.76, z], [width, 0.12, 1.25], color, [0, rotation, 0], { role: 'desk' }),
  primitive('box', [x - width * 0.4, 0.37, z - 0.48], [0.1, 0.74, 0.1], '#4b4540', [0, rotation, 0]),
  primitive('box', [x + width * 0.4, 0.37, z - 0.48], [0.1, 0.74, 0.1], '#4b4540', [0, rotation, 0]),
  primitive('box', [x - width * 0.4, 0.37, z + 0.48], [0.1, 0.74, 0.1], '#4b4540', [0, rotation, 0]),
  primitive('box', [x + width * 0.4, 0.37, z + 0.48], [0.1, 0.74, 0.1], '#4b4540', [0, rotation, 0])
];

const furnishings = [
  ...desk(-3.6, 1.7, 2.45, '#8e6f4e', -0.08),
  ...desk(3.65, 1.45, 2.05, '#6f8068', 0.07),
  ...desk(3.65, -2.15, 2.3, '#a58f66', -0.04),
  primitive('box', [-3.55, 0.94, 1.65], [0.68, 0.24, 0.42], '#222826', [0, -0.08, 0], { role: 'camera' }),
  primitive('cylinder', [-3.25, 1.03, 1.58], [0.12, 0.32, 0.12], '#303735', [0, 0, PI / 2], { role: 'camera-lens' }),
  primitive('box', [3.58, 0.86, 1.42], [1.15, 0.05, 0.75], '#ece7d8', [0, 0.07, 0], { role: 'notes' }),
  primitive('box', [3.66, 0.94, -2.18], [0.88, 0.16, 0.58], '#353b38', [0, -0.04, 0], { role: 'recorder' }),
  primitive('box', [-4.45, 0.35, -2.8], [1.28, 0.7, 0.72], '#313735', [0, 0.03, 0], { role: 'equipment-case' }),
  primitive('box', [-3.02, 0.27, -2.9], [1.18, 0.54, 0.62], '#5b6552', [0, -0.04, 0], { role: 'equipment-case' })
];

const routeBoard = [
  primitive('box', [0, 1.65, -4.77], [4.9, 1.58, 0.12], '#e7e1d3', [0, 0, 0], { role: 'route-board' }),
  primitive('box', [0, 1.65, -4.68], [4.48, 0.08, 0.06], '#8c8b80'),
  primitive('cylinder', [-1.68, 1.68, -4.6], [0.09, 0.04, 0.09], '#b64a43', [PI / 2, 0, 0], { role: 'route-marker' }),
  primitive('cylinder', [-0.55, 1.68, -4.6], [0.09, 0.04, 0.09], '#b8a36b', [PI / 2, 0, 0], { role: 'route-marker' }),
  primitive('cylinder', [0.58, 1.68, -4.6], [0.09, 0.04, 0.09], '#708367', [PI / 2, 0, 0], { role: 'route-marker' }),
  primitive('cylinder', [1.7, 1.68, -4.6], [0.09, 0.04, 0.09], '#934a3f', [PI / 2, 0, 0], { role: 'route-marker' })
];

const teammates = [
  primitive('person', [-3.45, 0, 0.86], [0.92, 1.68, 0.92], '#596d58', [0, 0.35, 0], { accent: '#d9c790' }),
  primitive('person', [3.34, 0, 0.58], [0.98, 1.74, 0.98], '#4a5550', [0, -0.45, 0], { accent: '#b64a43' }),
  primitive('person', [2.9, 0, -2.95], [0.9, 1.62, 0.9], '#a78865', [0, -0.75, 0], { accent: '#708367' })
];

export const activityRoomDefinition = {
  id: 'activity-room',
  environment: {
    background: '#c7c0b3',
    fog: '#c9c0af',
    fogNear: 7,
    fogFar: 18,
    ambient: '#f1e7d2',
    ambientIntensity: 1.45,
    sun: '#ffd9a5',
    sunIntensity: 3.2,
    sunPosition: [-4.8, 6.5, 3.5],
    cameraDistance: 4.75,
    cameraTargetHeight: 0.72
  },
  bounds: {
    min: [-6, 0, -5],
    max: [6, 0, 5]
  },
  playerStart: [0, 0, 3.4],
  walkableAreas: [
    { minX: -1.35, maxX: 1.35, minZ: -4.35, maxZ: 4.45 },
    { minX: -4.75, maxX: 4.75, minZ: -4.35, maxZ: -3.05 }
  ],
  hotspots: [
    {
      id: 'route-board',
      scriptId: 'prologue',
      position: [0, 0, -3.75],
      radius: 1.45,
      color: '#b64a43'
    }
  ],
  primitives: [
    ...roomShell,
    ...windowAndShelves,
    ...furnishings,
    ...routeBoard,
    ...teammates
  ]
};
