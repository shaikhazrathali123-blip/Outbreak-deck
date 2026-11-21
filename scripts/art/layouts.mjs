// Helix Research Facility, Medical Wing. Built to match the reference map.
// All coordinates are map tiles (x right, y down). Walls are added automatically
// around every floor area; angled corners come from `chamfer`.
//
//          Lab 1    Research Lab    Lab 2   Storage
//          Medbay   [ Central Hall ]  ---corridor---
//          Lobby    Locker |  Cure Lab
//         Entrance         |---corridor---
//                          |  Supply Room

export const MAP_SIZE = { width: 64, height: 53 };

// Floor areas: [x, y, width, height]. chamfer cuts corners diagonally (tl/tr/bl/br = size in tiles).
export const AREAS = [
  { id: 'lab1', rect: [3, 6, 16, 10] },
  { id: 'research', rect: [22, 2, 15, 12], chamfer: { tl: 2, bl: 3 } },
  { id: 'lab2', rect: [41, 5, 12, 11] },
  { id: 'storage', rect: [55, 6, 7, 10] },
  { id: 'medbay', rect: [1, 18, 20, 13], chamfer: { tr: 3, br: 3 } },
  { id: 'hall', rect: [23, 16, 18, 18] },
  { id: 'hall', rect: [19, 31, 5, 6] }, // walkway down to the lobby
  { id: 'corridor', rect: [41, 18, 20, 3] }, // to Lab 2, Storage, Cure Lab
  { id: 'curelab', rect: [43, 23, 18, 11], chamfer: { tl: 3, bl: 4 } },
  { id: 'lobby', rect: [2, 33, 16, 11], chamfer: { bl: 3, br: 3 } },
  { id: 'locker', rect: [25, 36, 12, 9] },
  { id: 'corridor', rect: [38, 34, 3, 13] }, // between Locker Room and Supply Room
  { id: 'corridor', rect: [41, 36, 20, 3] }, // to Cure Lab and Supply Room
  { id: 'supply', rect: [42, 41, 19, 9], chamfer: { tl: 3 } },
  { id: 'entrance', rect: [6, 46, 8, 5] },
];

// Doors cut through walls: [x, y, width, height, 'h' (walk left/right) | 'v' (walk up/down)]
export const DOORS = [
  [8, 16, 3, 2, 'v'], // Lab 1 - Medbay
  [28, 14, 3, 2, 'v'], // Research Lab - Hall
  [44, 16, 3, 2, 'v'], // Lab 2 - corridor
  [57, 16, 3, 2, 'v'], // Storage - corridor
  [21, 23, 2, 3, 'h'], // Medbay - Hall
  [8, 31, 3, 2, 'v'], // Medbay - Lobby
  [18, 34, 1, 3, 'h'], // Lobby - Hall walkway
  [41, 27, 2, 3, 'h'], // Cure Lab - Hall
  [51, 21, 3, 2, 'v'], // Cure Lab - upper corridor
  [51, 34, 3, 2, 'v'], // Cure Lab - lower corridor
  [30, 34, 3, 2, 'v'], // Locker Room - Hall
  [51, 39, 3, 2, 'v'], // Supply Room - corridor
  [9, 44, 3, 2, 'v'], // Lobby - Entrance
];

/**
 * Furniture, decorations, lights and gameplay markers.
 * place(prop,x,y) solid furniture (refuses to block doorways) | decor(name,x,y) walk-over
 * light(x,y,color,radius,mode,intensity) | fx(type,x,y)
 * duel(x,y,challenge) | supplyBox(x,y) | vent(x,y) | spawn(x,y)
 */
export function furnish({ place, decor, light, fx, duel, supplyBox, vent, spawn }) {
  // ---------------------------------------------------------- Central Hall
  decor('emblem', 30, 23);
  place('counter', 26, 18); place('terminalDesk', 30, 18); place('counter', 33, 18);
  duel(25, 22, 'highcard');
  duel(37, 22, 'highcard');
  place('benchV', 26, 27); place('benchV', 37, 27);
  place('bench', 29, 31); place('bench', 33, 31);
  place('planter', 24, 17); place('planter', 39, 17); place('planter', 25, 31); place('planter', 38, 31);
  vent(34, 16);
  light(32, 25, '#2fd2c0', 200, 'steady', 0.18);
  light(27, 20.5, '#e8f4ff', 220, 'steady', 0.2);
  light(37, 20.5, '#e8f4ff', 220, 'steady', 0.2);
  light(27, 30, '#e8f4ff', 220, 'flicker', 0.2);
  light(37, 30, '#e8f4ff', 220, 'steady', 0.2);
  light(26, 23, '#3e8bff', 110, 'pulse', 0.45);
  light(38, 23, '#3e8bff', 110, 'pulse', 0.45);
  light(21, 34, '#e8f4ff', 150, 'steady', 0.18);

  // ---------------------------------------------------------------- Lab 1
  place('terminalDesk', 4, 6); place('glassCase', 8, 6); place('terminalDesk', 13, 6); place('serverRack', 17, 6);
  place('meetingTable', 9, 10);
  place('console', 3, 9); place('console', 3, 10); place('console', 18, 9); place('console', 18, 10);
  place('medCabinet', 18, 12); place('planter', 3, 15); place('planter', 18, 15);
  light(6, 9, '#cfefff', 200, 'steady', 0.22);
  light(15, 9, '#cfefff', 200, 'steady', 0.22);
  light(11, 13.5, '#4dd2ff', 150, 'pulse', 0.25);
  light(9.5, 7, '#3ee6a0', 100, 'pulse', 0.4);

  // --------------------------------------------------------- Research Lab
  place('bigTank', 28, 4);
  place('terminalDesk', 24, 2); place('terminalDesk', 32, 2); place('planter', 36, 2);
  place('console', 36, 5); place('console', 36, 6); place('console', 36, 9);
  place('console', 22, 6); place('console', 22, 7);
  place('labBench', 23, 9); place('labBench', 32, 11);
  place('planter', 25, 12); place('planter', 36, 12);
  light(29.5, 6, '#43f0dc', 230, 'pulse', 0.45);
  light(25, 5, '#cfefff', 190, 'steady', 0.2);
  light(34, 5, '#cfefff', 190, 'steady', 0.2);
  light(25, 10.5, '#cfefff', 190, 'flicker', 0.2);
  light(34, 10.5, '#cfefff', 190, 'steady', 0.2);

  // ---------------------------------------------------------------- Lab 2
  place('terminalDesk', 43, 5); place('terminalDesk', 48, 5);
  place('console', 41, 8); place('console', 41, 9); place('console', 41, 10);
  place('serverRack', 52, 7); place('serverRack', 52, 9);
  place('medCabinet', 46, 10); place('planter', 52, 13); place('planter', 41, 13);
  light(44, 8.5, '#cfefff', 190, 'steady', 0.22);
  light(49.5, 8.5, '#cfefff', 190, 'steady', 0.22);
  light(47, 13, '#4dd2ff', 150, 'flicker', 0.22);

  // -------------------------------------------------------------- Storage
  place('shelf', 55, 6); place('shelf', 57, 6); place('crate', 60, 6); place('crates', 61, 6);
  place('crate', 55, 9); place('crates', 55, 10); place('barrel', 55, 11);
  place('shelf', 59, 9); place('crate', 61, 9); place('crates', 58, 11); place('barrel', 61, 13);
  decor('pallet', 57, 13);
  light(58, 8.5, '#ffc979', 200, 'flicker', 0.25);
  light(58, 12.5, '#ffc979', 180, 'broken', 0.3);
  fx('sparks', 56.5, 6.2);

  // ------------------------------------------------------ upper corridor
  vent(48, 19);
  decor('stairs', 59, 18);
  light(50, 19.5, '#a8c4e0', 160, 'steady', 0.2);
  light(56, 19.5, '#a8c4e0', 160, 'flicker', 0.2);

  // --------------------------------------------------------------- Medbay
  place('bed', 3, 19); place('bed', 17, 19); place('bed', 3, 26); place('bed', 17, 26);
  place('medCabinet', 4, 18); place('medCabinet', 5, 18); place('medCabinet', 13, 18); place('medCabinet', 14, 18);
  decor('redCross', 10, 21);
  place('nurseDesk', 9, 25);
  place('console', 1, 22); place('console', 1, 23);
  place('planter', 1, 30); place('planter', 16, 30);
  light(5, 21, '#e8f4ff', 210, 'steady', 0.22);
  light(16, 21, '#e8f4ff', 210, 'steady', 0.22);
  light(5, 28, '#e8f4ff', 200, 'flicker', 0.22);
  light(16, 28, '#e8f4ff', 200, 'steady', 0.22);
  light(11, 22, '#ff4a5a', 120, 'pulse', 0.35);

  // ------------------------------------------------------------- Cure Lab
  place('cureMachine', 51, 27);
  place('labBenchV', 48, 26); place('labBenchV', 56, 26);
  place('labBench', 46, 23); place('labBench', 57, 23); place('labBench', 56, 33);
  place('console', 60, 26); place('console', 60, 27); place('tank', 60, 30);
  for (let x = 50; x <= 54; x++) decor('hazardH', x, 31);
  light(52.5, 28.5, '#3ee6d0', 260, 'pulse', 0.45);
  light(47, 25, '#d8fff8', 180, 'steady', 0.2);
  light(58, 25.5, '#d8fff8', 180, 'steady', 0.2);
  light(58, 31.5, '#d8fff8', 180, 'flicker', 0.2);

  // ---------------------------------------------------------- Locker Room
  for (let y = 38; y <= 43; y++) { place('locker', 25, y); place('locker', 36, y); }
  place('locker', 25, 36); place('locker', 26, 36); place('locker', 27, 36);
  place('locker', 35, 36); place('locker', 36, 36);
  place('bench', 28, 42); place('bench', 32, 42);
  light(28, 39.5, '#9ab8ff', 190, 'steady', 0.22);
  light(34, 39.5, '#9ab8ff', 190, 'steady', 0.22);
  light(31, 43, '#9ab8ff', 170, 'flicker', 0.2);

  // ------------------------------------------- corridors around Locker/Supply
  vent(39, 44);
  vent(58, 37);
  light(39.5, 40, '#a8c4e0', 150, 'broken', 0.3);
  fx('sparks', 39.5, 40);
  light(47, 37.5, '#a8c4e0', 160, 'steady', 0.2);
  light(55, 37.5, '#a8c4e0', 160, 'flicker', 0.2);

  // ---------------------------------------------------------- Supply Room
  place('shelf', 45, 41); place('shelf', 57, 41); place('locker', 59, 41); place('locker', 60, 41);
  place('crate', 42, 45); place('crates', 42, 46); place('barrel', 42, 47);
  place('supplyStation', 45, 44); place('supplyStation', 45, 47);
  place('crate', 49, 46); place('crates', 49, 47);
  supplyBox(53, 46);
  place('shelf', 56, 45); place('crate', 60, 45); place('crates', 60, 46);
  place('supplyStation', 57, 48); place('crates', 59, 48); place('crate', 60, 49);
  decor('pallet', 52, 43); decor('pallet', 47, 49);
  light(47, 44, '#ffd59a', 210, 'steady', 0.24);
  light(56, 43.5, '#ffd59a', 210, 'steady', 0.24);
  light(53.5, 46.5, '#f2b84a', 130, 'pulse', 0.45);
  light(47, 48.5, '#ffd59a', 180, 'flicker', 0.22);

  // ---------------------------------------------------------------- Lobby
  place('reception', 7, 37);
  place('sofa', 3, 34); place('sofa', 3, 40); place('sofa', 13, 40);
  place('planter', 6, 37); place('planter', 13, 37); place('planter', 2, 33); place('planter', 16, 40);
  light(5, 36, '#ffe0b0', 200, 'steady', 0.22);
  light(14, 36, '#ffe0b0', 200, 'steady', 0.22);
  light(10, 41.5, '#9ab8d8', 200, 'steady', 0.2);
  light(10, 38, '#3ee6a0', 110, 'pulse', 0.3);

  // ------------------------------------------------------------- Entrance
  decor('arrowUp', 9, 48);
  for (let x = 7; x <= 12; x++) decor('hazardH', x, 50);
  place('planter', 6, 46); place('planter', 13, 48);
  spawn(10, 48.5);
  light(10, 48, '#e8f4ff', 200, 'steady', 0.3);
}

/** Second pass: small clutter that makes rooms feel lived-in. */
export function furnishDetails({ place, decor, light, fx }) {
  const line = (name, x0, x1, y) => { for (let x = x0; x <= x1; x++) decor(name, x, y); };
  const col = (name, x, y0, y1) => { for (let y = y0; y <= y1; y++) decor(name, x, y); };

  // Central Hall: DNA hologram over the emblem, staff chairs, bins
  fx('holo', 32, 25);
  place('officeChair', 34, 17); place('officeChair', 35, 17);
  place('waterCooler', 23, 19); place('trashBin', 40, 22); place('trashBin', 23, 30);
  decor('footprints', 28, 26); decor('scuffs', 31, 21); decor('puddle', 35, 29); decor('scuffs', 36, 25);

  // Lab 1
  place('officeChair', 5, 7); place('officeChair', 14, 7);
  place('fileCabinet', 16, 6); place('sink', 11, 6); place('waterCooler', 12, 6);
  place('computerDesk', 4, 13); place('officeChair', 4, 14);
  place('computerDesk', 15, 13); place('officeChair', 15, 14);
  place('trashBin', 3, 12);
  decor('papers', 7, 9); decor('cables', 13, 9); decor('scuffs', 14, 11);

  // Research Lab: holo table
  place('officeChair', 25, 3); place('officeChair', 33, 3);
  place('holoTable', 32, 7); fx('holo', 33, 8);
  place('fileCabinet', 27, 2); place('fileCabinet', 31, 2);
  place('sink', 22, 9); place('trashBin', 35, 13);
  line('hazardH', 28, 30, 8);
  decor('cables', 27, 6); decor('cables', 31, 5);
  light(33, 8, '#2fd2e0', 120, 'pulse', 0.4);

  // Lab 2
  place('officeChair', 44, 6); place('officeChair', 49, 6);
  place('fileCabinet', 46, 5); place('fileCabinet', 47, 5);
  place('waterCooler', 51, 5); place('trashBin', 52, 5); place('sink', 41, 6);
  place('computerDesk', 49, 12); place('computerDesk', 50, 12); place('officeChair', 49, 13);
  decor('cables', 47, 8); decor('papers', 44, 11);

  // Storage
  place('cone', 60, 13); decor('stain', 57, 9); decor('scuffs', 56, 13);

  // corridors: painted guide lines
  for (let x = 41; x <= 58; x++) if (x !== 48 && (x < 44 || x > 46) && (x < 51 || x > 53) && (x < 57 || x > 59)) decor('lineTealH', x, 19);
  for (let x = 41; x <= 57; x++) if (x < 51 || x > 53) decor('lineAmberH', x, 37);
  col('lineAmberV', 39, 34, 42);
  place('cone', 60, 36); place('trashBin', 38, 46);

  // Medbay: IV stands, carts, sinks
  place('ivStand', 4, 19); place('ivStand', 16, 19); place('ivStand', 4, 26); place('ivStand', 16, 26);
  place('medCart', 5, 21); place('medCart', 15, 22);
  place('wheelchair', 2, 29); place('sink', 15, 18); place('sink', 16, 18);
  place('trashBin', 13, 27); place('waterCooler', 1, 25);
  decor('footprints', 7, 23); decor('scuffs', 14, 24);

  // Cure Lab
  place('tank', 56, 23); place('computerDesk', 46, 30); place('officeChair', 47, 30);
  place('sink', 60, 23); place('fileCabinet', 60, 33); place('trashBin', 59, 33);
  decor('scuffs', 49, 31);

  // Locker Room: wet floor
  place('bench', 28, 39); place('bench', 32, 39);
  place('trashBin', 35, 44); place('waterCooler', 26, 44);
  decor('puddle', 33, 43); place('cone', 34, 44); decor('footprints', 30, 40);

  // Supply Room
  place('cone', 48, 42); place('fileCabinet', 56, 41); place('trashBin', 51, 49);
  decor('tapeCross', 55, 46); decor('scuffs', 50, 44);

  // Lobby: rug, staff chairs
  decor('rug', 8, 39);
  place('officeChair', 9, 36); place('officeChair', 10, 36);
  place('waterCooler', 2, 37); place('trashBin', 15, 34);
  decor('footprints', 11, 34);

  // Entrance
  place('cone', 6, 50); place('cone', 13, 50); place('trashBin', 6, 48);
  decor('scuffs', 8, 47);
}
