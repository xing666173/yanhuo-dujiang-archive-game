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
  primitive('plane', [0, 0, 0], [12, 10, 1], '#525b59', [-PI / 2, 0, 0], {
    role: 'floor',
    material: 'linoleum'
  }),
  primitive('box', [0, 1.55, -4.92], [12, 3.1, 0.16], '#cbd4d1', [0, 0, 0], {
    role: 'wall',
    material: 'plaster'
  }),
  primitive('box', [-5.92, 1.55, 0], [0.16, 3.1, 10], '#bdc9c6', [0, 0, 0], {
    role: 'wall',
    material: 'plaster'
  }),
  primitive('box', [5.92, 1.55, 0], [0.16, 3.1, 10], '#bdc9c6', [0, 0, 0], {
    role: 'wall',
    material: 'plaster'
  }),
  primitive('box', [0, 3.06, 0], [12, 0.1, 10], '#b7c2bf', [0, 0, 0], {
    role: 'ceiling',
    material: 'plaster'
  }),
  primitive('box', [2.05, 2.97, -1.75], [2.15, 0.055, 0.28], '#e9e4d5', [0, 0, 0], {
    role: 'ceiling-light',
    material: 'light-band'
  }),
  primitive('box', [0, 0.53, -4.79], [11.7, 1, 0.08], '#66716d', [0, 0, 0], {
    role: 'wall-lower',
    material: 'painted-panel'
  }),
  primitive('box', [-5.79, 0.53, 0], [0.08, 1, 9.75], '#606c68', [0, 0, 0], {
    role: 'wall-lower',
    material: 'painted-panel'
  }),
  primitive('box', [5.79, 0.53, 0], [0.08, 1, 9.75], '#606c68', [0, 0, 0], {
    role: 'wall-lower',
    material: 'painted-panel'
  }),
  primitive('box', [0, 1.04, -4.7], [11.75, 0.07, 0.08], '#39423f', [0, 0, 0], {
    role: 'wall-trim',
    material: 'painted-metal'
  })
];

const windowAndDaylight = [
  primitive('plane', [-5.79, 1.95, -0.55], [4.05, 1.72, 1], '#9eb6b8', [0, PI / 2, 0], {
    role: 'window',
    material: 'window-glass',
    transparent: true,
    opacity: 0.88
  }),
  primitive('box', [-5.68, 1.95, -0.55], [0.09, 1.84, 0.08], '#303a38', [0, 0, 0], {
    role: 'window-frame',
    material: 'painted-metal'
  }),
  primitive('box', [-5.68, 1.95, -1.59], [0.09, 0.08, 2.08], '#303a38', [0, 0, 0], {
    role: 'window-frame',
    material: 'painted-metal'
  }),
  primitive('box', [-5.68, 1.95, 0.49], [0.09, 0.08, 2.08], '#303a38', [0, 0, 0], {
    role: 'window-frame',
    material: 'painted-metal'
  }),
  primitive('box', [-5.68, 2.79, -0.55], [0.09, 0.08, 4.08], '#303a38', [0, 0, 0], {
    role: 'window-frame',
    material: 'painted-metal'
  }),
  primitive('box', [-5.68, 1.11, -0.55], [0.09, 0.08, 4.08], '#303a38', [0, 0, 0], {
    role: 'window-frame',
    material: 'painted-metal'
  }),
  primitive('plane', [-3.55, 0.018, 0.2], [0.52, 4.7, 1], '#f2dfb9', [-PI / 2, 0, -0.16], {
    role: 'daylight-band',
    material: 'light-band',
    transparent: true,
    opacity: 0.17
  }),
  primitive('plane', [-2.25, 0.019, 0.45], [0.28, 4.3, 1], '#f2dfb9', [-PI / 2, 0, -0.16], {
    role: 'daylight-band',
    material: 'light-band',
    transparent: true,
    opacity: 0.11
  })
];

const shelf = [
  primitive('box', [5.25, 1.06, -1.52], [1.22, 2.1, 0.52], '#34413d', [0, 0, 0], {
    role: 'shelf',
    material: 'painted-metal'
  }),
  ...[0.38, 1.05, 1.72].map((y) => (
    primitive('box', [5.25, y, -1.52], [1.08, 0.07, 0.58], '#6d746b', [0, 0, 0], {
      role: 'shelf-board',
      material: 'dark-laminate'
    })
  )),
  ...[
    [5.01, 1.38, '#a64b45', 0.46],
    [5.2, 1.35, '#70846f', 0.4],
    [5.38, 1.37, '#c0a967', 0.44],
    [5.55, 1.34, '#52616a', 0.38],
    [5.08, 0.7, '#9a9b8c', 0.42],
    [5.3, 0.68, '#536b61', 0.38],
    [5.5, 0.69, '#8c6258', 0.4]
  ].map(([x, y, color, height]) => (
    primitive('box', [x, y, -1.79], [0.13, height, 0.3], color, [0, 0, 0], {
      role: 'book',
      material: 'book-cloth'
    })
  ))
];

const desk = (x, z, width, color, material, rotation = 0) => [
  primitive('box', [x, 0.75, z], [width, 0.1, 1.16], color, [0, rotation, 0], {
    role: 'desk',
    material
  }),
  primitive('box', [x, 0.66, z + 0.48], [width * 0.92, 0.16, 0.08], '#303937', [0, rotation, 0], {
    role: 'desk-apron',
    material: 'painted-metal'
  }),
  ...[-1, 1].flatMap((side) => [-1, 1].map((depth) => (
    primitive('cylinder', [x + side * width * 0.4, 0.36, z + depth * 0.46], [0.075, 0.7, 0.075], '#2c3432', [0, 0, 0], {
      role: 'desk-leg',
      material: 'painted-metal'
    })
  )))
];

const chair = (x, z, color, rotation = 0) => [
  primitive('box', [x, 0.45, z], [0.7, 0.08, 0.72], color, [0, rotation, 0], {
    role: 'chair',
    material: 'chair-fabric'
  }),
  primitive('box', [x, 0.9, z + 0.3], [0.7, 0.82, 0.08], color, [0, rotation, 0], {
    role: 'chair-back',
    material: 'chair-fabric'
  }),
  ...[-1, 1].flatMap((side) => [-1, 1].map((depth) => (
    primitive('cylinder', [x + side * 0.26, 0.22, z + depth * 0.25], [0.045, 0.43, 0.045], '#2c3432', [0, 0, 0], {
      role: 'chair-leg',
      material: 'painted-metal'
    })
  )))
];

const furnishings = [
  ...desk(-3.6, 1.55, 2.35, '#485957', 'dark-laminate', -0.06),
  ...desk(3.55, 1.35, 2.05, '#606b68', 'painted-steel', 0.06),
  ...desk(3.5, -2.2, 2.25, '#4e555d', 'blue-laminate', -0.04),
  ...chair(-3.55, 2.5, '#52665d', PI),
  ...chair(3.52, 2.25, '#5c626a', PI),
  ...chair(3.45, -3.03, '#596b61', 0),
  primitive('box', [-3.55, 0.91, 1.52], [0.68, 0.2, 0.4], '#202726', [0, -0.06, 0], {
    role: 'camera',
    material: 'camera'
  }),
  primitive('cylinder', [-3.24, 0.99, 1.46], [0.1, 0.28, 0.1], '#171d1c', [0, 0, PI / 2], {
    role: 'camera-lens',
    material: 'camera'
  }),
  primitive('box', [3.5, 0.82, 1.33], [1.08, 0.035, 0.7], '#e1e0d7', [0, 0.06, 0], {
    role: 'notes',
    material: 'paper'
  }),
  primitive('box', [3.62, 0.91, -2.22], [0.8, 0.13, 0.52], '#282f2e', [0, -0.04, 0], {
    role: 'recorder',
    material: 'camera'
  }),
  primitive('box', [-4.5, 0.34, -2.78], [1.24, 0.68, 0.7], '#2e3735', [0, 0.03, 0], {
    role: 'equipment-case',
    material: 'case'
  }),
  primitive('box', [-3.12, 0.28, -2.88], [1.16, 0.55, 0.62], '#47544f', [0, -0.04, 0], {
    role: 'equipment-case',
    material: 'case'
  }),
  primitive('box', [-4.5, 0.36, -2.41], [0.3, 0.09, 0.05], '#b7a365', [0, 0, 0], {
    role: 'case-latch',
    material: 'brass'
  }),
  primitive('box', [-3.12, 0.29, -2.55], [0.28, 0.08, 0.05], '#b7a365', [0, 0, 0], {
    role: 'case-latch',
    material: 'brass'
  })
];

const routeBoard = [
  primitive('box', [0, 1.73, -4.7], [5.35, 1.82, 0.11], '#303b39', [0, 0, 0], {
    role: 'route-board-frame',
    material: 'painted-metal'
  }),
  primitive('box', [0, 1.73, -4.62], [5.02, 1.53, 0.06], '#d0d8d4', [0, 0, 0], {
    role: 'route-board',
    material: 'board-paper'
  }),
  primitive('box', [-1.58, 1.83, -4.54], [1.02, 0.055, 0.04], '#6d8074', [0, 0, -0.13], {
    role: 'route-line',
    material: 'route-ink'
  }),
  primitive('box', [-0.6, 1.7, -4.54], [1.04, 0.055, 0.04], '#708b91', [0, 0, 0.09], {
    role: 'route-line',
    material: 'route-ink'
  }),
  primitive('box', [0.42, 1.8, -4.54], [1.04, 0.055, 0.04], '#8e7c5a', [0, 0, -0.08], {
    role: 'route-line',
    material: 'route-ink'
  }),
  primitive('box', [1.43, 1.72, -4.54], [1.02, 0.055, 0.04], '#6c7e6b', [0, 0, 0.11], {
    role: 'route-line',
    material: 'route-ink'
  }),
  ...[
    [-2.08, 1.9, '#a44b45'],
    [-1.08, 1.76, '#bca461'],
    [-0.08, 1.77, '#687d69'],
    [0.94, 1.82, '#667e87'],
    [1.95, 1.72, '#8d5c50']
  ].map(([x, y, color]) => (
    primitive('cylinder', [x, y, -4.48], [0.12, 0.05, 0.12], color, [PI / 2, 0, 0], {
      role: 'route-marker',
      material: 'route-pin'
    })
  ))
];

const teammates = [
  primitive('person', [-3.1, 0, 0.75], [0.9, 1.72, 0.86], '#40534c', [0, 0.3, 0], {
    characterId: 'chen-yu',
    cue: 'camera',
    pose: 'camera'
  }),
  primitive('person', [3.12, 0, 0.35], [0.93, 1.76, 0.9], '#46515c', [0, -0.42, 0], {
    characterId: 'gu-yan',
    cue: 'notebook',
    pose: 'writing'
  }),
  primitive('person', [2.18, 0, -3.12], [0.88, 1.68, 0.85], '#565048', [0, -0.58, 0], {
    characterId: 'lin-xia',
    cue: 'route-folder',
    pose: 'lean'
  })
];

export const activityRoomDefinition = {
  id: 'activity-room',
  environment: {
    background: '#8f9b99',
    fog: '#aab1ad',
    fogNear: 8,
    fogFar: 19,
    ambient: '#c8d2ce',
    ground: '#39423f',
    ambientIntensity: 1.02,
    sun: '#ffd2a0',
    sunIntensity: 2.55,
    sunPosition: [-5.2, 6.8, 2.6],
    windowLight: '#ffe0b5',
    windowIntensity: 3.3,
    cameraDistance: 3.8,
    mobileCameraDistance: 4.15,
    cameraTargetHeight: 0.86,
    cameraShoulder: 0.4
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
      color: '#a44b45'
    }
  ],
  primitives: [
    ...roomShell,
    ...windowAndDaylight,
    ...shelf,
    ...furnishings,
    ...routeBoard,
    ...teammates
  ]
};
