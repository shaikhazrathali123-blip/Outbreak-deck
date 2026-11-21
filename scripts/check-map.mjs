// Sanity checks for the Helix map. Run after editing the map in Tiled:
//
//   npm run check:map
//
// Checks that every room can be reached from the spawn point (walls and
// furniture block movement) and that no walkable tile leads out into the void.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const mapFile = process.argv[2] ?? join(ROOT, 'client', 'public', 'assets', 'maps', 'helix.json');
const map = JSON.parse(readFileSync(mapFile, 'utf8'));

const layer = (name) => {
  const l = map.layers.find((x) => x.name === name);
  if (!l) throw new Error(`Map is missing the "${name}" layer`);
  return l;
};
const floor = layer('Floor').data;
const walls = layer('Walls').data;
const props = layer('Props').data;
const rooms = layer('Rooms').objects;
const spawn = layer('Spawns').objects.find((o) => o.name === 'player');
const { width: W, height: H, tilewidth: TS } = map;

const errors = [];
if (!spawn) errors.push('No spawn point named "player" in the Spawns layer');

const walkable = (x, y) => x >= 0 && y >= 0 && x < W && y < H && floor[y * W + x] > 0 && walls[y * W + x] === 0 && props[y * W + x] === 0;
const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (floor[y * W + x] > 0 || walls[y * W + x] > 0);

const reached = new Uint8Array(W * H);
if (spawn) {
  const sx = Math.floor(spawn.x / TS);
  const sy = Math.floor(spawn.y / TS);
  if (!walkable(sx, sy)) errors.push(`Spawn tile (${sx},${sy}) is not walkable`);
  const queue = [[sx, sy]];
  reached[sy * W + sx] = 1;
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!solid(nx, ny)) errors.push(`Leak: walkable tile (${x},${y}) touches the void at (${nx},${ny})`);
      if (walkable(nx, ny) && !reached[ny * W + nx]) {
        reached[ny * W + nx] = 1;
        queue.push([nx, ny]);
      }
    }
  }
}

for (const room of rooms) {
  let ok = false;
  const x0 = Math.floor(room.x / TS);
  const y0 = Math.floor(room.y / TS);
  const x1 = Math.floor((room.x + room.width) / TS);
  const y1 = Math.floor((room.y + room.height) / TS);
  for (let y = y0; y < y1 && !ok; y++) for (let x = x0; x < x1 && !ok; x++) ok = !!reached[y * W + x];
  if (!ok) errors.push(`Room "${room.name}" cannot be reached from spawn`);
}

const reachable = reached.reduce((a, b) => a + b, 0);
if (errors.length) {
  console.error(`Map check FAILED (${errors.length} problems):`);
  for (const e of [...new Set(errors)].slice(0, 20)) console.error('  - ' + e);
  process.exit(1);
}
console.log(`Map check passed: ${rooms.length} rooms reachable, ${reachable} walkable tiles, no leaks.`);
