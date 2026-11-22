// Helix Research Facility as a side-view cutaway: 4 floors, 15 rooms, 9 ladders,
// 10 duel tables. Sized for up to 15 players (one room per player).
// All x values are measured from the building's inner left wall (0 .. WIDTH).
//
//   Floor 3  |  Lab 1  |  Research Lab  |  Lab 2  |  Storage  |
//   Floor 2  |  Medbay |      Central Hall         | Cure Lab  |
//   Ground   | Entr. | Lobby | Locker Room |  Supply Room     |
//   Basement | Server Room |  Cafeteria  | Reactor | Quarantine |

export const WIDTH = 2200; // inner width of the building
export const ROOM_HEIGHT = 260; // floor to ceiling
export const DOOR_HEIGHT = 140; // doorway opening between rooms
export const ORIGIN_X = 260; // world x of the building's inner left wall
export const WORLD = { width: ORIGIN_X * 2 + WIDTH, height: 1580 };

// Floors from the bottom up. y = world y of the walking surface.
export const FLOORS = [
  { name: 'Basement', y: 1360 },
  { name: 'Ground floor', y: 1060 },
  { name: 'Floor 2', y: 760 },
  { name: 'Floor 3', y: 460 },
];
export const GROUND = 1; // index of the floor at street level
export const TOP = FLOORS.length - 1;

export const ROOMS = [
  { id: 'server', floor: 0, x0: 0, x1: 560 },
  { id: 'cafeteria', floor: 0, x0: 560, x1: 1300 },
  { id: 'reactor', floor: 0, x0: 1300, x1: 1800 },
  { id: 'quarantine', floor: 0, x0: 1800, x1: 2200 },
  { id: 'entrance', floor: 1, x0: 0, x1: 300 },
  { id: 'lobby', floor: 1, x0: 300, x1: 860 },
  { id: 'locker', floor: 1, x0: 860, x1: 1400 },
  { id: 'supply', floor: 1, x0: 1400, x1: 2200 },
  { id: 'medbay', floor: 2, x0: 0, x1: 640 },
  { id: 'hall', floor: 2, x0: 640, x1: 1560 },
  { id: 'curelab', floor: 2, x0: 1560, x1: 2200 },
  { id: 'lab1', floor: 3, x0: 0, x1: 520 },
  { id: 'research', floor: 3, x0: 520, x1: 1160 },
  { id: 'lab2', floor: 3, x0: 1160, x1: 1700 },
  { id: 'storage', floor: 3, x0: 1700, x1: 2200 },
];

// Ladders through hatches in the floor: x, lower floor, upper floor.
export const LADDERS = [
  { x: 340, lower: 0, upper: 1 }, // Server Room - Lobby
  { x: 1110, lower: 0, upper: 1 }, // Cafeteria - Locker Room
  { x: 1580, lower: 0, upper: 1 }, // Reactor - Supply Room
  { x: 600, lower: 1, upper: 2 }, // Lobby - Medbay
  { x: 1180, lower: 1, upper: 2 }, // Locker Room - Central Hall
  { x: 1700, lower: 1, upper: 2 }, // Supply Room - Cure Lab
  { x: 300, lower: 2, upper: 3 }, // Medbay - Lab 1
  { x: 860, lower: 2, upper: 3 }, // Central Hall - Research Lab
  { x: 2050, lower: 2, upper: 3 }, // Cure Lab - Storage
];

export const SPAWN = { floor: GROUND, x: 170 };

// Furniture: [type, x, options]. Drawn in ink with neon details (see inkArt.js).
// x is the left edge, except for centred pieces (helix, duelTable, emergencyButton,
// cureMachine, bigTank, holoTable, chair, redCross, clock, reactorCore, pad).
// Keep ~40px clear around ladders.
export const FURNITURE = {
  // ---------------------------------------------------------- basement
  server: [
    ['serverRack', 20], ['serverRack', 62], ['serverRack', 104], ['serverRack', 146],
    ['duelTable', 250], ['desk', 400, { w: 130, monitors: 2 }], ['chair', 465],
    ['wallScreen', 470], ['vent', 200],
  ],
  cafeteria: [
    ['counter', 580, { w: 180 }], ['duelTable', 850], ['duelTable', 990],
    ['vending', 1145], ['vending', 1190], ['supplyBox', 1238], ['poster', 800, { title: 'MENU' }], ['clock', 930],
  ],
  reactor: [
    ['pad', 1330], ['duelTable', 1420], ['pad', 1515], ['controlPanel', 1350],
    ['reactorCore', 1700], ['vent', 1460],
  ],
  quarantine: [
    ['bench', 1825, { w: 90 }], ['vent', 1925], ['cells', 1960, { w: 230 }], ['poster', 1830, { title: 'NO ENTRY' }],
  ],
  // ---------------------------------------------------------- ground floor
  entrance: [
    ['exitDoor', 0], ['poster', 120, { title: 'PROTOCOL 7' }], ['bench', 90, { w: 110 }],
    ['plant', 255], ['camera', 285], ['vent', 210],
  ],
  lobby: [
    ['window', 380, { w: 90 }], ['reception', 400, { w: 180 }], ['duelTable', 705],
    ['plant', 785], ['waterCooler', 828], ['clock', 700], ['poster', 470, { title: 'HELIX' }],
  ],
  locker: [
    ['lockers', 880, { w: 180 }], ['bench', 900, { w: 130 }], ['puddle', 1310],
    ['lockers', 1235, { w: 150 }], ['duelTable', 1300], ['vent', 1370],
  ],
  supply: [
    ['shelf', 1420, { w: 120 }], ['supplyStation', 1760, { w: 120 }], ['supplyBox', 1935],
    ['crates', 2010], ['barrels', 2110], ['hazardFloor', 1740, { w: 180 }],
  ],
  // ---------------------------------------------------------- floor 2
  medbay: [
    ['bed', 30, { w: 150 }], ['ivStand', 195], ['redCross', 440], ['nurseDesk', 360, { w: 160 }],
    ['medCart', 530], ['poster', 230, { title: 'WASH HANDS' }],
  ],
  hall: [
    ['helix', 1100], ['duelTable', 960], ['duelTable', 1340],
    ['emergencyButton', 1100], ['bench', 690, { w: 110 }], ['bench', 1420, { w: 110 }], ['plant', 660], ['plant', 1540],
    ['wallScreen', 760], ['wallScreen', 1440], ['vent', 1500],
  ],
  curelab: [
    ['tank', 1610], ['tank', 1740], ['cureMachine', 1880], ['tank', 2105], ['tank', 2150],
    ['wallScreen', 1990],
  ],
  // ---------------------------------------------------------- floor 3
  lab1: [
    ['desk', 30, { w: 200, monitors: 2 }], ['chair', 120], ['whiteboard', 370, { w: 120 }],
    ['serverRack', 470], ['sink', 360],
  ],
  research: [
    ['shelfSpecimens', 555, { w: 70 }], ['bigTank', 700], ['holoTable', 1010], ['desk', 1075, { w: 75, monitors: 1 }],
    ['window', 930, { w: 70 }],
  ],
  lab2: [
    ['desk', 1190, { w: 200, monitors: 3 }], ['chair', 1290], ['serverRack', 1420], ['serverRack', 1465],
    ['whiteboard', 1520, { w: 120 }], ['duelTable', 1580], ['fileCabinet', 1655], ['vent', 1210],
  ],
  storage: [
    ['shelf', 1720, { w: 110 }], ['duelTable', 1890], ['supplyBox', 1955],
    ['barrels', 2110], ['vent', 1840],
  ],
};

const roomOf = (id) => ROOMS.find((r) => r.id === id);

// Gameplay markers (world x, floor index), for Phase 2+.
export const DUEL_TABLES = Object.entries(FURNITURE).flatMap(([id, items]) =>
  items.filter(([t]) => t === 'duelTable').map(([, x]) => ({ room: id, floor: roomOf(id).floor, x: ORIGIN_X + x })),
);
export const SUPPLY_BOXES = Object.entries(FURNITURE).flatMap(([id, items]) =>
  items.filter(([t]) => t === 'supplyBox').map(([, x]) => ({ room: id, floor: roomOf(id).floor, x: ORIGIN_X + x + 28 })),
);

/** One centred piece of furniture as a gameplay spot (world x, floor). */
const spotOf = (type) => {
  for (const [id, items] of Object.entries(FURNITURE)) {
    const hit = items.find(([t]) => t === type);
    if (hit) return { room: id, floor: roomOf(id).floor, x: ORIGIN_X + hit[1] };
  }
  throw new Error(`No ${type} on the map`);
};
// The Emergency Button (Central Hall) calls a meeting.
export const EMERGENCY_BUTTON = spotOf('emergencyButton');
