// Generates the placeholder art and the Helix Facility (Medical Wing) map.
//
//   npm run generate:assets
//
// Outputs (in client/public/assets):
//   tiles/helix_tiles.png   tileset: floors, 3D + angled walls, doors, furniture, decor (1px extruded)
//   sprites/player.png      player, 4 directions x 4 walk frames
//   maps/helix.json         Tiled map
//     tile layers:   Outside, Floor, Decor, Shade, Walls, Props
//     object layers: Rooms, Spawns, Lights, FX, DuelTables, SupplyBoxes, Vents, Signs
//
// Room shapes and doors: scripts/art/layouts.mjs (AREAS, DOORS, furnish()).
// Art: scripts/art/tiles.mjs, props.mjs, character.mjs.
//
// The map is a normal Tiled file you can open in Tiled. Re-running this script
// overwrites helix.json, so once you hand-edit it in Tiled, stop running this.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Raster, mulberry32 } from './art/raster.mjs';
import {
  TS, THEMES, drawFloor, drawDoor, drawDiagonal, drawWallTop, drawWallFace, drawOutside, drawShade, FACE_VARIANTS, FACE_WEIGHTS,
} from './art/tiles.mjs';
import { PROPS, DECOR, SCREENS } from './art/props.mjs';
import { MAP_SIZE, AREAS, DOORS, furnish, furnishDetails } from './art/layouts.mjs';
import { buildPlayerSheet } from './art/character.mjs';
import { TILE_SIZE, ROOMS } from '../shared/constants.js';

if (TILE_SIZE !== TS) throw new Error('TILE_SIZE mismatch');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'client', 'public', 'assets');

// ================================================================ tileset
const tiles = [];
const tileProps = {}; // tile index -> Tiled properties
const T = {};
const addTile = (key, draw, props) => {
  T[key] = tiles.length;
  if (props) tileProps[tiles.length] = props;
  tiles.push(draw);
};
const strProp = (name, value) => ({ name, type: 'string', value });

const themeIds = Object.keys(THEMES);
themeIds.forEach((id, ti) => {
  const props = [strProp('room', id)]; // 'corridor' for hallways
  for (let v = 0; v < 3; v++) addTile(`floor:${id}:${v}`, (r, ox, oy) => drawFloor(r, ox, oy, id, v, ti * 10 + v + 1), props);
  for (const side of ['se', 'sw', 'ne', 'nw']) {
    addTile(`diag:${id}:${side}`, (r, ox, oy) => drawDiagonal(r, ox, oy, id, side, ti * 10 + 1), [
      { name: 'diagonal', type: 'bool', value: true },
      ...(props ?? []),
    ]);
  }
});
for (let v = 0; v < 4; v++) addTile(`outside:${v}`, (r, ox, oy) => drawOutside(r, ox, oy, v, 700 + v));
addTile('door:h', (r, ox, oy) => drawDoor(r, ox, oy, true));
addTile('door:v', (r, ox, oy) => drawDoor(r, ox, oy, false));
for (let m = 1; m < 16; m++) addTile(`shade:${m}`, (r, ox, oy) => drawShade(r, ox, oy, m));
for (let m = 0; m < 16; m++) addTile(`top:${m}`, (r, ox, oy) => drawWallTop(r, ox, oy, m, 500 + m));
themeIds.forEach((id, ti) => {
  FACE_VARIANTS.forEach((variant, vi) => {
    addTile(`face:${id}:${variant}`, (r, ox, oy) => drawWallFace(r, ox, oy, variant, THEMES[id].trim, 900 + ti * 10 + vi));
  });
});

function addSliced(prefix, defs) {
  Object.entries(defs).forEach(([name, def], i) => {
    const pr = new Raster(def.w * TS, def.h * TS);
    def.draw(pr, def.w * TS, def.h * TS, mulberry32(1000 + i * 7 + prefix.length));
    for (let ty = 0; ty < def.h; ty++) {
      for (let tx = 0; tx < def.w; tx++) {
        addTile(`${prefix}:${name}:${tx},${ty}`, (r, ox, oy) => r.blit(pr, tx * TS, ty * TS, TS, TS, ox, oy));
      }
    }
  });
}
addSliced('prop', PROPS);
addSliced('decor', DECOR);

const COLUMNS = 16;
const MARGIN = 1;
const SPACING = 2;
const ROWS = Math.ceil(tiles.length / COLUMNS);

function buildTileset() {
  const w = MARGIN * 2 + COLUMNS * TS + (COLUMNS - 1) * SPACING;
  const h = MARGIN * 2 + ROWS * TS + (ROWS - 1) * SPACING;
  const r = new Raster(w, h);
  tiles.forEach((draw, i) => {
    const ox = MARGIN + (i % COLUMNS) * (TS + SPACING);
    const oy = MARGIN + Math.floor(i / COLUMNS) * (TS + SPACING);
    draw(r, ox, oy);
    for (let k = 0; k < TS; k++) {
      r.copy(ox + k, oy, ox + k, oy - 1);
      r.copy(ox + k, oy + TS - 1, ox + k, oy + TS);
      r.copy(ox, oy + k, ox - 1, oy + k);
      r.copy(ox + TS - 1, oy + k, ox + TS, oy + k);
    }
    r.copy(ox, oy, ox - 1, oy - 1);
    r.copy(ox + TS - 1, oy, ox + TS, oy - 1);
    r.copy(ox, oy + TS - 1, ox - 1, oy + TS);
    r.copy(ox + TS - 1, oy + TS - 1, ox + TS, oy + TS);
  });
  r.save(join(OUT, 'tiles', 'helix_tiles.png'));
  return { width: w, height: h };
}

// ==================================================================== map
const VOID = 0;
const FLOOR = 1;
const WALL = 2;

function buildMap(tileset) {
  const { width: W, height: H } = MAP_SIZE;
  const N = W * H;
  const rng = mulberry32(2031);
  const kind = new Uint8Array(N);
  const owner = new Array(N).fill(null);
  const door = new Array(N).fill(null);
  const diag = new Array(N).fill(null);
  const layers = {
    outside: new Array(N).fill(-1),
    floor: new Array(N).fill(-1),
    decor: new Array(N).fill(-1),
    shade: new Array(N).fill(-1),
    walls: new Array(N).fill(-1),
    props: new Array(N).fill(-1),
  };
  const at = (x, y) => y * W + x;
  const inMap = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const kindAt = (x, y) => (inMap(x, y) ? kind[at(x, y)] : VOID);
  const isFloor = (x, y) => kindAt(x, y) === FLOOR;

  // ---- carve floor areas (with diagonal corner cuts)
  for (const area of AREAS) {
    if (!THEMES[area.id]) throw new Error(`No theme for area "${area.id}"`);
    const [ax, ay, aw, ah] = area.rect;
    const c = area.chamfer ?? {};
    for (let dy = 0; dy < ah; dy++) {
      for (let dx = 0; dx < aw; dx++) {
        const fromR = aw - 1 - dx;
        const fromB = ah - 1 - dy;
        if ((c.tl && dx + dy < c.tl) || (c.tr && fromR + dy < c.tr) || (c.bl && dx + fromB < c.bl) || (c.br && fromR + fromB < c.br)) continue;
        const x = ax + dx;
        const y = ay + dy;
        if (!inMap(x, y)) throw new Error(`Area ${area.id} goes outside the map`);
        kind[at(x, y)] = FLOOR;
        owner[at(x, y)] = area.id;
      }
    }
  }
  // ---- doors
  const doorCells = [];
  for (const [dx, dy, dw, dh, dir] of DOORS) {
    for (let y = dy; y < dy + dh; y++) {
      for (let x = dx; x < dx + dw; x++) {
        kind[at(x, y)] = FLOOR;
        owner[at(x, y)] = 'corridor';
        door[at(x, y)] = dir;
        doorCells.push([x, y]);
      }
    }
  }
  // ---- walls around every floor tile (8 directions)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (kind[at(x, y)] !== VOID) continue;
      let near = null;
      for (let oy = -1; oy <= 1 && !near; oy++) for (let ox = -1; ox <= 1 && !near; ox++) if (isFloor(x + ox, y + oy)) near = owner[at(x + ox, y + oy)];
      if (near) {
        kind[at(x, y)] = WALL;
        owner[at(x, y)] = near;
      }
    }
  }
  // ---- angled walls: a wall with floor on two perpendicular sides becomes a diagonal
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (kind[at(x, y)] !== WALL) continue;
      const n = isFloor(x, y - 1), s = isFloor(x, y + 1), e = isFloor(x + 1, y), w = isFloor(x - 1, y);
      if (n + s + e + w !== 2 || (n && s) || (e && w)) continue;
      const side = `${s ? 's' : 'n'}${e ? 'e' : 'w'}`;
      const dxs = e ? 1 : -1;
      const dys = s ? 1 : -1;
      if (!isFloor(x + dxs, y + dys) || isFloor(x - dxs, y - dys)) continue;
      const nb = s ? at(x, y + 1) : at(x, y - 1);
      if (door[nb] || door[e ? at(x + 1, y) : at(x - 1, y)]) continue;
      diag[at(x, y)] = { side, theme: owner[nb] };
    }
  }
  // ---- thicken walls so each visible wall face has a wall top above it
  const thicken = [];
  for (let y = 1; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (kind[at(x, y)] === WALL && !diag[at(x, y)] && isFloor(x, y + 1) && kind[at(x, y - 1)] === VOID) thicken.push([x, y]);
    }
  }
  for (const [x, y] of thicken) {
    kind[at(x, y - 1)] = WALL;
    owner[at(x, y - 1)] = owner[at(x, y)];
  }

  // ---- furniture & markers
  const lights = [];
  const fxs = [];
  const duels = [];
  const boxes = [];
  const vents = [];
  let spawnPx = null;
  const nearDoor = (x, y) => doorCells.some(([dx, dy]) => Math.max(Math.abs(dx - x), Math.abs(dy - y)) <= 2);

  const ctx = {
    place(name, x, y) {
      const def = PROPS[name];
      if (!def) throw new Error(`Unknown prop "${name}"`);
      for (let ty = 0; ty < def.h; ty++) {
        for (let tx = 0; tx < def.w; tx++) {
          const px = x + tx;
          const py = y + ty;
          const where = `${name} at (${x},${y}) cell (${px},${py})`;
          if (!isFloor(px, py) || door[at(px, py)]) throw new Error(`${where} is not on open floor`);
          if (nearDoor(px, py)) throw new Error(`${where} blocks a doorway`);
          if (layers.props[at(px, py)] !== -1) throw new Error(`${where} overlaps another prop`);
          layers.props[at(px, py)] = T[`prop:${name}:${tx},${ty}`];
        }
      }
      if (name === 'serverRack') fxs.push({ type: 'leds', x: x * TS + 6, y: y * TS + 24, width: 14, height: 32 });
      for (const [sx, sy, sw, sh] of SCREENS[name] ?? []) fxs.push({ type: 'screen', x: x * TS + sx, y: y * TS + sy, width: sw, height: sh });
    },
    decor(name, x, y) {
      const def = DECOR[name];
      if (!def) throw new Error(`Unknown decor "${name}"`);
      for (let ty = 0; ty < def.h; ty++) {
        for (let tx = 0; tx < def.w; tx++) {
          if (!isFloor(x + tx, y + ty)) throw new Error(`decor ${name} at (${x},${y}) is not on floor`);
          layers.decor[at(x + tx, y + ty)] = T[`decor:${name}:${tx},${ty}`];
        }
      }
    },
    light(x, y, color, radius, mode = 'steady', intensity = 0.5) {
      lights.push({ x: x * TS, y: y * TS, color, radius, mode, intensity });
    },
    fx(type, x, y) {
      fxs.push({ type, x: x * TS, y: y * TS });
    },
    duel(x, y, challenge) {
      ctx.place('duelTable', x, y);
      duels.push({ x: x * TS, y: y * TS, width: 2 * TS, height: 2 * TS, challenge });
    },
    supplyBox(x, y) {
      ctx.place('supplyBox', x, y);
      boxes.push({ x: (x + 0.5) * TS, y: (y + 0.5) * TS });
    },
    vent(x, y) {
      ctx.decor('ventRed', x, y);
      vents.push({ x: (x + 0.5) * TS, y: (y + 0.5) * TS });
    },
    spawn(x, y) {
      spawnPx = { x: x * TS, y: y * TS };
    },
  };
  furnish(ctx);
  furnishDetails(ctx);

  // wear and tear on empty floor
  const cleanRooms = new Set(['medbay', 'curelab', 'lab1', 'lab2', 'research', 'lobby']);
  for (let n = 0; n < 70; n++) {
    const x = Math.floor(rng() * W);
    const y = Math.floor(rng() * H);
    const i = at(x, y);
    if (isFloor(x, y) && !door[i] && layers.props[i] === -1 && layers.decor[i] === -1) {
      const pool = cleanRooms.has(owner[i]) ? ['scuffs', 'papers', 'scuffs'] : ['stain', 'crack', 'scuffs', 'cables', 'papers'];
      layers.decor[i] = T[`decor:${pool[Math.floor(rng() * pool.length)]}:0,0`];
    }
  }

  // ---- tiles
  const pickFace = (theme) => {
    const weights = Object.entries(FACE_WEIGHTS[theme] ?? FACE_WEIGHTS.default);
    let roll = rng() * weights.reduce((a, [, w]) => a + w, 0);
    for (const [v, w] of weights) if ((roll -= w) < 0) return v;
    return 'plain';
  };
  const isSolidWall = (x, y) => kindAt(x, y) === WALL && !diag[at(x, y)];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = at(x, y);
      if (kind[i] === VOID) {
        const roll = rng();
        layers.outside[i] = T[`outside:${roll < 0.7 ? 0 : roll < 0.8 ? 1 : roll < 0.9 ? 2 : 3}`];
      } else if (kind[i] === FLOOR) {
        const shadeMask = (isSolidWall(x, y - 1) ? 1 : 0) | (isSolidWall(x + 1, y) ? 2 : 0) | (isSolidWall(x, y + 1) ? 4 : 0) | (isSolidWall(x - 1, y) ? 8 : 0);
        if (shadeMask) layers.shade[i] = T[`shade:${shadeMask}`];
        if (door[i]) layers.floor[i] = T[`door:${door[i]}`];
        else {
          const roll = rng();
          layers.floor[i] = T[`floor:${owner[i]}:${roll < 0.7 ? 0 : roll < 0.9 ? 1 : 2}`];
        }
      } else if (diag[i]) {
        layers.walls[i] = T[`diag:${diag[i].theme}:${diag[i].side}`];
      } else if (isFloor(x, y + 1)) {
        const theme = owner[at(x, y + 1)];
        const variant = pickFace(theme);
        layers.walls[i] = T[`face:${theme}:${variant}`];
        if (variant === 'lamp') {
          lights.push({ x: (x + 0.5) * TS, y: (y + 1.1) * TS, color: THEMES[theme].trim, radius: 100, mode: 'steady', intensity: 0.25 });
        }
      } else {
        const mask = (isFloor(x, y - 1) ? 1 : 0) | (isFloor(x + 1, y) ? 2 : 0) | (isFloor(x, y + 1) ? 4 : 0) | (isFloor(x - 1, y) ? 8 : 0);
        layers.walls[i] = T[`top:${mask}`];
      }
    }
  }
  for (let i = 0; i < N; i++) if (door[i]) layers.decor[i] = -1;

  // ---- door signs: each side of a door names the room on the other side
  const roomName = (id) => ROOMS.find((r) => r.id === id);
  const signs = [];
  for (const [dx, dy, dw, dh, dir] of DOORS) {
    const sides = dir === 'v'
      ? [{ from: [dx + 1, dy + dh], to: [dx + 1, dy - 1], x: (dx + dw / 2) * TS, y: (dy + dh - 0.55) * TS },
         { from: [dx + 1, dy - 1], to: [dx + 1, dy + dh], x: (dx + dw / 2) * TS, y: (dy + 0.25) * TS }]
      : [{ from: [dx + dw, dy + 1], to: [dx - 1, dy + 1], x: (dx + dw / 2) * TS, y: (dy - 0.35) * TS, arrow: 'left' },
         { from: [dx - 1, dy + 1], to: [dx + dw, dy + 1], x: (dx + dw / 2) * TS, y: (dy + dh + 0.35) * TS, arrow: 'right' }];
    for (const side of sides) {
      const target = roomName(owner[at(...side.to)]);
      if (!target) continue;
      const text = side.arrow === 'left' ? `< ${target.name}` : side.arrow === 'right' ? `${target.name} >` : target.name;
      signs.push({ x: side.x, y: side.y, text: text.toUpperCase(), color: target.color });
    }
  }
  // ================================================ Tiled JSON output
  let nextId = 1;
  const point = (name, type, x, y, properties) => ({
    id: nextId++, name, type, point: true, x: Math.round(x), y: Math.round(y), width: 0, height: 0, rotation: 0, visible: true,
    ...(properties ? { properties } : {}),
  });
  const rect = (name, type, x, y, w, h, properties) => ({
    id: nextId++, name, type, x, y, width: w, height: h, rotation: 0, visible: true, ...(properties ? { properties } : {}),
  });

  // Room rectangle = its first (main) area; used for labels and the minimap.
  const roomObjects = ROOMS.filter((room) => AREAS.some((a) => a.id === room.id)).map((room) => {
    const area = AREAS.find((a) => a.id === room.id);
    if (!area) throw new Error(`Room ${room.id} has no area`);
    const [x, y, w, h] = area.rect;
    return rect(room.name, 'room', x * TS, y * TS, w * TS, h * TS, [strProp('roomId', room.id), strProp('color', room.color)]);
  });
  if (!spawnPx) throw new Error('No spawn point set');

  const gids = (arr) => arr.map((v) => (v < 0 ? 0 : v + 1));
  const tileLayer = (id, name, data) => ({ id, name, type: 'tilelayer', x: 0, y: 0, width: W, height: H, opacity: 1, visible: true, data: gids(data) });
  const objectLayer = (id, name, objects) => ({ id, name, type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects });

  const map = {
    type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down',
    infinite: false, width: W, height: H, tilewidth: TS, tileheight: TS, backgroundcolor: '#05070a',
    nextlayerid: 15,
    layers: [
      tileLayer(1, 'Outside', layers.outside),
      tileLayer(2, 'Floor', layers.floor),
      tileLayer(3, 'Decor', layers.decor),
      tileLayer(13, 'Shade', layers.shade),
      tileLayer(4, 'Walls', layers.walls),
      tileLayer(5, 'Props', layers.props),
      objectLayer(6, 'Rooms', roomObjects),
      objectLayer(7, 'Spawns', [point('player', 'spawn', spawnPx.x, spawnPx.y)]),
      objectLayer(8, 'Lights', lights.map((l) => point('light', 'light', l.x, l.y, [
        strProp('color', l.color),
        { name: 'radius', type: 'int', value: l.radius },
        { name: 'intensity', type: 'float', value: l.intensity },
        strProp('mode', l.mode),
      ]))),
      objectLayer(9, 'FX', fxs.map((f) => (f.width ? rect(f.type, 'fx', f.x, f.y, f.width, f.height) : point(f.type, 'fx', f.x, f.y)))),
      objectLayer(10, 'DuelTables', duels.map((d) => rect('duelTable', 'duelTable', d.x, d.y, d.width, d.height, [strProp('challenge', d.challenge)]))),
      objectLayer(11, 'SupplyBoxes', boxes.map((b) => point('supplyBox', 'supplyBox', b.x, b.y))),
      objectLayer(12, 'Vents', vents.map((v) => point('vent', 'vent', v.x, v.y))),
      objectLayer(14, 'Signs', signs.map((g) => point('sign', 'sign', g.x, g.y, [strProp('text', g.text), strProp('color', g.color)]))),
    ],
    tilesets: [{
      firstgid: 1, name: 'helix_tiles', image: '../tiles/helix_tiles.png',
      imagewidth: tileset.width, imageheight: tileset.height, tilewidth: TS, tileheight: TS,
      margin: MARGIN, spacing: SPACING, columns: COLUMNS, tilecount: COLUMNS * ROWS,
      tiles: Object.entries(tileProps).map(([id, properties]) => ({ id: Number(id), properties })),
    }],
  };
  map.nextobjectid = nextId;

  const file = join(OUT, 'maps', 'helix.json');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(map));
  return { W, H, signs: signs.length, lights: lights.length, fx: fxs.length, duels: duels.length, vents: vents.length, diagonals: diag.filter(Boolean).length };
}

const tileset = buildTileset();
buildPlayerSheet(join(OUT, 'sprites', 'player.png'));
const info = buildMap(tileset);
console.log(
  `Tileset: ${tiles.length} tiles (${tileset.width}x${tileset.height}). Map: ${info.W}x${info.H} tiles, ` +
    `${info.diagonals} angled walls, ${info.signs} door signs, ${info.lights} lights, ${info.fx} effects, ${info.duels} duel tables, ${info.vents} vents.`,
);
