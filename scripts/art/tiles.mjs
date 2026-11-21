// Floor, wall and door tiles (32x32). Each function draws one tile at (ox, oy).
import { hex, shade, alpha, mix, mulberry32, line, disc, vgrad, hazard, WHITE, BLACK } from './raster.mjs';

export const TS = 32;

// Floor look per area (matches the Medical Wing reference map).
// `trim` is the neon accent used on that area's walls.
export const THEMES = {
  hall: { style: 'slab', floor: '#4a5561', trim: '#2fd2c0' },
  corridor: { style: 'plate', floor: '#434d59', trim: '#8aa0b8' },
  lab1: { style: 'cleantile', floor: '#5b6977', trim: '#4dd2ff' },
  research: { style: 'cleantile', floor: '#55667a', trim: '#2fd2e0' },
  lab2: { style: 'cleantile', floor: '#5b6977', trim: '#4dd2ff' },
  storage: { style: 'concrete', floor: '#54473a', trim: '#d9a441' },
  medbay: { style: 'cleantile', floor: '#687684', trim: '#ff4a5a' },
  curelab: { style: 'cleantile', floor: '#3b6670', trim: '#3ee6d0' },
  locker: { style: 'raised', floor: '#4c586a', trim: '#6a9cff' },
  supply: { style: 'cleantile', floor: '#5a4935', trim: '#f2b84a' },
  lobby: { style: 'slab', floor: '#505a66', trim: '#9ab8d8' },
  entrance: { style: 'plate', floor: '#48525e', trim: '#e8f4ff' },
};

function bevel(r, ox, oy, base, size = TS, x = 0, y = 0) {
  r.rect(ox + x, oy + y, size, 1, shade(base, 16));
  r.rect(ox + x, oy + y, 1, size, shade(base, 9));
  r.rect(ox + x, oy + y + size - 1, size, 1, shade(base, -16));
  r.rect(ox + x + size - 1, oy + y, 1, size, shade(base, -16));
}

function grain(r, ox, oy, rng, count, strength) {
  for (let i = 0; i < count; i++) {
    const c = rng() < 0.5 ? WHITE(strength) : BLACK(strength * 1.6);
    r.px(ox + rng() * TS, oy + rng() * TS, c);
  }
}

function scratches(r, ox, oy, rng, n = 3) {
  for (let i = 0; i < n; i++) {
    const x = ox + 3 + rng() * 26;
    const y = oy + 3 + rng() * 26;
    const a = rng() * Math.PI;
    const l = 4 + rng() * 9;
    line(r, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, WHITE(22));
  }
}

function crack(r, ox, oy, rng, c = BLACK(110)) {
  let x = ox + 4 + rng() * 24;
  let y = oy + 4 + rng() * 24;
  let a = rng() * Math.PI * 2;
  for (let i = 0; i < 14; i++) {
    const nx = x + Math.cos(a) * 2;
    const ny = y + Math.sin(a) * 2;
    line(r, x, y, nx, ny, c);
    x = Math.max(ox + 1, Math.min(ox + 30, nx));
    y = Math.max(oy + 1, Math.min(oy + 30, ny));
    a += (rng() - 0.5) * 1.4;
  }
}

function stainBlob(r, ox, oy, rng, c) {
  const cx = ox + 8 + rng() * 16;
  const cy = oy + 8 + rng() * 16;
  for (let i = 0; i < 5; i++) disc(r, cx + (rng() - 0.5) * 10, cy + (rng() - 0.5) * 8, 2 + rng() * 4, c);
}

/** variant: 0 = clean, 1 = worn, 2 = detailed */
export function drawFloor(r, ox, oy, themeId, variant, seed) {
  const theme = THEMES[themeId];
  const base = hex(theme.floor);
  const rng = mulberry32(seed);

  switch (theme.style) {
    case 'plate': {
      r.rect(ox, oy, TS, TS, base);
      bevel(r, ox, oy, base);
      // side guide lines like a walkway
      r.rect(ox, oy + 2, TS, 1, shade(base, -10));
      for (const [bx, by] of [[3, 4], [28, 4], [3, 27], [28, 27]]) {
        r.px(ox + bx, oy + by, shade(base, 30));
        r.px(ox + bx + 1, oy + by + 1, shade(base, -20));
      }
      if (variant === 2) {
        r.rect(ox + 7, oy + 9, 18, 14, shade(base, -16));
        for (let y = 11; y < 22; y += 3) r.rect(ox + 9, oy + y, 14, 1, shade(base, 14));
      }
      break;
    }
    case 'concrete': {
      r.rect(ox, oy, TS, TS, base);
      grain(r, ox, oy, rng, 160, 16);
      r.rect(ox, oy + TS - 1, TS, 1, shade(base, -12));
      r.rect(ox + TS - 1, oy, 1, TS, shade(base, -12));
      if (variant === 2) crack(r, ox, oy, rng);
      break;
    }
    case 'raised': {
      for (const [sx, sy] of [[0, 0], [16, 0], [0, 16], [16, 16]]) {
        const c = shade(base, (rng() - 0.5) * 6);
        r.rect(ox + sx, oy + sy, 16, 16, c);
        bevel(r, ox, oy, c, 16, sx, sy);
        const perforated = variant === 2 ? (sx + sy) % 32 === 0 : variant === 1 && sx === 0 && sy === 0;
        if (perforated) for (let y = 3; y < 14; y += 3) for (let x = 3; x < 14; x += 3) r.px(ox + sx + x, oy + sy + y, shade(c, -22));
      }
      break;
    }
    case 'cleantile':
    case 'dirty': {
      const dirty = theme.style === 'dirty';
      for (const [sx, sy] of [[0, 0], [16, 0], [0, 16], [16, 16]]) {
        r.rect(ox + sx, oy + sy, 16, 16, shade(base, (rng() - 0.5) * (dirty ? 12 : 6)));
      }
      const grout = shade(base, dirty ? -14 : 20);
      r.rect(ox, oy, TS, 1, grout);
      r.rect(ox, oy + 16, TS, 1, grout);
      r.rect(ox, oy, 1, TS, grout);
      r.rect(ox + 16, oy, 1, TS, grout);
      if (!dirty) for (let i = 0; i < 5; i++) r.px(ox + 3 + i, oy + 3 + i, WHITE(30)); // gloss
      if (dirty) grain(r, ox, oy, rng, 70, 14);
      if (variant === 2) stainBlob(r, ox, oy, rng, dirty ? hex('#120708', 70) : BLACK(35));
      break;
    }
    case 'slab': {
      r.rect(ox, oy, TS, TS, base);
      grain(r, ox, oy, rng, 40, 8);
      r.rect(ox, oy, TS, 2, shade(base, 14));
      r.rect(ox, oy, 2, TS, shade(base, 8));
      r.rect(ox, oy + TS - 2, TS, 2, shade(base, -18));
      r.rect(ox + TS - 2, oy, 2, TS, shade(base, -18));
      if (variant === 2) {
        const t = alpha(hex(theme.trim), 30);
        r.rect(ox + 6, oy + 6, 20, 1, t);
        r.rect(ox + 6, oy + 25, 20, 1, t);
        r.rect(ox + 6, oy + 6, 1, 20, t);
        r.rect(ox + 25, oy + 6, 1, 20, t);
      }
      break;
    }
    case 'diamond': {
      r.rect(ox, oy, TS, TS, base);
      for (let y = 2; y < TS; y += 6) {
        for (let x = 2; x < TS; x += 6) {
          const flip = ((x + y) / 6) % 2 < 1;
          line(r, ox + x, oy + y + (flip ? 2 : 0), ox + x + 2, oy + y + (flip ? 0 : 2), shade(base, 22));
        }
      }
      bevel(r, ox, oy, base);
      if (variant === 2) {
        r.rect(ox + 6, oy + 6, 20, 20, shade(base, -8));
        r.rect(ox + 6, oy + 6, 20, 1, shade(base, 10));
        for (let x = 8; x < 24; x += 4) r.rect(ox + x, oy + 8, 2, 16, shade(base, -16));
      }
      break;
    }
    case 'checker': {
      const alt = hex(theme.alt);
      for (const [sx, sy] of [[0, 0], [16, 0], [0, 16], [16, 16]]) {
        r.rect(ox + sx, oy + sy, 16, 16, (sx + sy) % 32 === 0 ? base : alt);
      }
      grain(r, ox, oy, rng, 30, 8);
      if (variant === 2) stainBlob(r, ox, oy, rng, hex('#7a4a20', 45));
      break;
    }
    default:
      r.rect(ox, oy, TS, TS, base);
  }

  if (variant === 1) scratches(r, ox, oy, rng, 4);
}

/** Unreachable space between rooms: dark machinery, ducts and cables seen from above. */
export function drawOutside(r, ox, oy, variant, seed) {
  const rng = mulberry32(seed);
  const base = hex('#0c0f15');
  r.rect(ox, oy, TS, TS, base);
  for (let i = 0; i < 30; i++) r.px(ox + rng() * TS, oy + rng() * TS, shade(base, (rng() - 0.5) * 10));
  r.rect(ox, oy + TS - 1, TS, 1, shade(base, 5));
  r.rect(ox + TS - 1, oy, 1, TS, shade(base, 5));
  if (variant === 1) {
    // duct running across
    r.rect(ox, oy + 9, TS, 12, hex('#1a1f2a'));
    r.rect(ox, oy + 9, TS, 1, hex('#283040'));
    r.rect(ox, oy + 20, TS, 1, hex('#07090c'));
    r.rect(ox + 10, oy + 9, 2, 12, hex('#11151d'));
  } else if (variant === 2) {
    // vertical pipes
    for (const x of [6, 14]) {
      r.rect(ox + x, oy, 5, TS, hex('#1c222c'));
      r.rect(ox + x, oy, 1, TS, hex('#2c3442'));
    }
    r.rect(ox + 4, oy + 12, 18, 3, hex('#141922'));
  } else if (variant === 3) {
    // machine block with a tiny status light
    r.rect(ox + 4, oy + 4, 24, 24, hex('#141922'));
    r.rect(ox + 4, oy + 4, 24, 1, hex('#242b38'));
    for (let y = 9; y < 26; y += 4) r.rect(ox + 7, oy + y, 18, 1, hex('#0a0d12'));
    r.px(ox + 24, oy + 7, rng() < 0.5 ? hex('#3ee67a', 180) : hex('#e0443e', 180));
  }
}

/** Door threshold with orange frame posts. horizontal = passage runs left/right. */
export function drawDoor(r, ox, oy, horizontal) {
  const base = hex('#3a434f');
  const orange = hex('#ff9a2a');
  const dark = hex('#1a1f27');
  r.rect(ox, oy, TS, TS, base);
  bevel(r, ox, oy, base);
  if (horizontal) {
    r.rect(ox + 14, oy, 4, TS, dark);
    r.rect(ox + 15, oy, 2, TS, alpha(orange, 120));
    r.rect(ox, oy, 3, TS, orange);
    r.rect(ox + TS - 3, oy, 3, TS, orange);
    r.rect(ox + 1, oy, 1, TS, hex('#ffd08a'));
  } else {
    r.rect(ox, oy + 14, TS, 4, dark);
    r.rect(ox, oy + 15, TS, 2, alpha(orange, 120));
    r.rect(ox, oy, TS, 3, orange);
    r.rect(ox, oy + TS - 3, TS, 3, orange);
    r.rect(ox, oy + 1, TS, 1, hex('#ffd08a'));
  }
}

/**
 * Angled wall: half floor, half wall top, split along the diagonal.
 * floorSide = 'se' | 'sw' | 'ne' | 'nw' (which corner of the tile is floor).
 */
export function drawDiagonal(r, ox, oy, themeId, floorSide, seed) {
  drawFloor(r, ox, oy, themeId, 0, seed);
  const wall = hex('#11151d');
  const edge = hex('#3b4660');
  const hi = hex('#5a6788');
  const trim = hex(THEMES[themeId].trim);
  for (let y = 0; y < TS; y++) {
    for (let x = 0; x < TS; x++) {
      // d < 0 means the wall side
      let d;
      if (floorSide === 'se') d = x + y - (TS - 1);
      else if (floorSide === 'nw') d = TS - 1 - (x + y);
      else if (floorSide === 'sw') d = y - x;
      else d = x - y; // ne
      if (d < -4) r.px(ox + x, oy + y, wall);
      else if (d < -1) r.px(ox + x, oy + y, edge);
      else if (d < 0) r.px(ox + x, oy + y, hi);
      else if (d < 1.5) r.px(ox + x, oy + y, alpha(trim, 200));
      else if (d < 3) r.px(ox + x, oy + y, alpha(trim, 60));
    }
  }
}

/** Top of a wall. mask bits: 1=N 2=E 4=S 8=W are open floor (draw an edge there). */
export function drawWallTop(r, ox, oy, mask, seed) {
  const rng = mulberry32(seed);
  const base = hex('#11151d');
  r.rect(ox, oy, TS, TS, base);
  for (let i = 0; i < 25; i++) r.px(ox + rng() * TS, oy + rng() * TS, shade(base, (rng() - 0.5) * 12));
  const edge = hex('#3b4660');
  const hi = hex('#5a6788');
  if (mask & 1) { r.rect(ox, oy, TS, 3, edge); r.rect(ox, oy, TS, 1, hi); }
  if (mask & 4) { r.rect(ox, oy + TS - 3, TS, 3, edge); r.rect(ox, oy + TS - 1, TS, 1, shade(edge, -10)); }
  if (mask & 8) { r.rect(ox, oy, 3, TS, edge); r.rect(ox, oy, 1, TS, hi); }
  if (mask & 2) { r.rect(ox + TS - 3, oy, 3, TS, edge); r.rect(ox + TS - 1, oy, 1, TS, shade(edge, -10)); }
}

export const FACE_VARIANTS = ['plain', 'pipe', 'vent', 'screen', 'warning', 'lamp', 'whiteboard', 'poster', 'extinguisher', 'window', 'shelf'];

// How often each wall decoration appears, per area (anything missing uses DEFAULT).
const DEFAULT_FACES = { plain: 40, pipe: 10, vent: 8, screen: 10, warning: 4, lamp: 8, poster: 5, extinguisher: 4, window: 4 };
export const FACE_WEIGHTS = {
  default: DEFAULT_FACES,
  corridor: { plain: 34, pipe: 20, vent: 14, warning: 10, lamp: 10, extinguisher: 6, screen: 4 },
  lab1: { ...DEFAULT_FACES, whiteboard: 14, screen: 14 },
  lab2: { ...DEFAULT_FACES, whiteboard: 14, screen: 14 },
  research: { ...DEFAULT_FACES, whiteboard: 10, screen: 18, window: 6 },
  medbay: { ...DEFAULT_FACES, poster: 14, extinguisher: 6, pipe: 4 },
  curelab: { ...DEFAULT_FACES, screen: 18, warning: 8, window: 6 },
  storage: { plain: 30, pipe: 16, shelf: 22, vent: 8, warning: 8, lamp: 8, extinguisher: 6 },
  supply: { plain: 30, pipe: 12, shelf: 22, vent: 8, warning: 10, lamp: 8, extinguisher: 6 },
  locker: { ...DEFAULT_FACES, shelf: 10, poster: 8 },
  lobby: { ...DEFAULT_FACES, window: 18, poster: 10, screen: 8 },
  hall: { ...DEFAULT_FACES, screen: 14, window: 10, poster: 6 },
  entrance: { plain: 30, window: 20, warning: 14, lamp: 12, extinguisher: 8 },
};

/** Soft contact shadow on a floor tile next to walls. mask: 1=N 2=E 4=S 8=W have a wall. */
export function drawShade(r, ox, oy, mask) {
  const band = (len, maxA, fn) => {
    for (let i = 0; i < len; i++) fn(i, Math.round(maxA * (1 - i / len) ** 1.6));
  };
  if (mask & 1) band(12, 120, (i, a) => r.rect(ox, oy + i, TS, 1, BLACK(a)));
  if (mask & 8) band(7, 80, (i, a) => r.rect(ox + i, oy, 1, TS, BLACK(a)));
  if (mask & 2) band(7, 80, (i, a) => r.rect(ox + TS - 1 - i, oy, 1, TS, BLACK(a)));
  if (mask & 4) band(4, 60, (i, a) => r.rect(ox, oy + TS - 1 - i, TS, 1, BLACK(a)));
}

/** Front face of a wall (visible because floor is below it), with a neon trim strip. */
export function drawWallFace(r, ox, oy, variant, trimHex, seed) {
  const rng = mulberry32(seed);
  const trim = hex(trimHex);
  vgrad(r, ox, oy, TS, TS, hex('#36405a'), hex('#1d2331'));
  r.rect(ox, oy, TS, 2, hex('#4a5672'));
  r.rect(ox, oy + 2, TS, 1, hex('#11151d'));
  r.rect(ox, oy + 15, TS, 1, hex('#1a1f2b'));
  r.rect(ox + 15, oy + 3, 1, 22, hex('#1a1f2b'));
  r.rect(ox + 16, oy + 3, 1, 22, hex('#3a4560'));
  // baseboard + neon strip
  r.rect(ox, oy + 26, TS, 6, hex('#141821'));
  r.rect(ox, oy + 27, TS, 1, alpha(trim, 230));
  r.rect(ox, oy + 26, TS, 1, alpha(trim, 70));
  r.rect(ox, oy + 28, TS, 1, alpha(trim, 70));
  for (let i = 0; i < 18; i++) r.px(ox + rng() * TS, oy + 3 + rng() * 22, BLACK(30));

  switch (variant) {
    case 'pipe':
      r.rect(ox, oy + 8, TS, 5, hex('#5e6a78'));
      r.rect(ox, oy + 8, TS, 1, hex('#8a97a6'));
      r.rect(ox, oy + 12, TS, 1, hex('#363e4a'));
      r.rect(ox + 6, oy + 7, 3, 7, hex('#2a313c'));
      r.rect(ox + 22, oy + 7, 3, 7, hex('#2a313c'));
      break;
    case 'vent':
      r.rect(ox + 6, oy + 6, 20, 14, hex('#0d1016'));
      r.rect(ox + 6, oy + 6, 20, 1, hex('#4a5672'));
      for (let y = 9; y < 19; y += 3) r.rect(ox + 8, oy + y, 16, 1, hex('#2c3446'));
      break;
    case 'screen': {
      r.rect(ox + 4, oy + 5, 24, 15, hex('#0b0e13'));
      r.rect(ox + 6, oy + 7, 20, 11, mix(hex('#06080c'), trim, 0.25));
      for (const y of [9, 12, 15]) r.rect(ox + 8, oy + y, 4 + Math.floor(rng() * 14), 1, alpha(trim, 200));
      r.px(ox + 24, oy + 8, alpha(trim, 255));
      break;
    }
    case 'warning':
      r.rect(ox + 8, oy + 6, 16, 14, hex('#0b0e13'));
      hazard(r, ox + 9, oy + 7, 14, 12);
      r.rect(ox + 15, oy + 9, 2, 6, hex('#0b0e13'));
      r.rect(ox + 15, oy + 16, 2, 2, hex('#0b0e13'));
      break;
    case 'whiteboard':
      r.rect(ox + 3, oy + 5, 26, 17, hex('#8a97a6'));
      r.rect(ox + 4, oy + 6, 24, 15, hex('#e8eef2'));
      line(r, ox + 6, oy + 9, ox + 14, oy + 9, hex('#3e8bff'));
      line(r, ox + 6, oy + 12, ox + 18, oy + 14, hex('#e0443e'));
      line(r, ox + 16, oy + 8, ox + 24, oy + 16, hex('#3a4458'));
      r.rect(ox + 6, oy + 16, 6, 3, hex('#3ee67a'));
      r.rect(ox + 8, oy + 22, 16, 2, hex('#5e6a78'));
      break;
    case 'poster': {
      r.rect(ox + 8, oy + 4, 16, 20, hex('#0b0e13'));
      r.rect(ox + 9, oy + 5, 14, 18, mix(hex('#e8eef2'), trim, 0.25));
      r.rect(ox + 10, oy + 6, 12, 7, alpha(trim, 220));
      disc(r, ox + 16, oy + 9.5, 2.5, WHITE(220));
      for (const y of [15, 17, 19]) r.rect(ox + 11, oy + y, 9, 1, hex('#5e6a78'));
      break;
    }
    case 'extinguisher':
      r.rect(ox + 11, oy + 6, 10, 18, hex('#3a4458'));
      r.rect(ox + 13, oy + 8, 6, 15, hex('#c41e1e'));
      r.rect(ox + 14, oy + 9, 1, 12, hex('#ff6a6a'));
      r.rect(ox + 14, oy + 5, 4, 3, hex('#1a1a1a'));
      r.rect(ox + 18, oy + 6, 4, 2, hex('#1a1a1a'));
      break;
    case 'window': {
      r.rect(ox + 2, oy + 4, 28, 19, hex('#0b0e13'));
      vgrad(r, ox + 3, oy + 5, 26, 17, hex('#0a1a33'), hex('#05070a'));
      for (let i = 0; i < 6; i++) r.px(ox + 4 + rng() * 24, oy + 6 + rng() * 14, WHITE(120 + rng() * 120));
      line(r, ox + 6, oy + 20, ox + 14, oy + 6, WHITE(30));
      r.rect(ox + 15, oy + 5, 2, 17, hex('#2c3446'));
      break;
    }
    case 'shelf':
      r.rect(ox + 1, oy + 8, 30, 2, hex('#5e6a78'));
      r.rect(ox + 1, oy + 18, 30, 2, hex('#5e6a78'));
      for (let x = 3; x < 28; x += 7) {
        const c = hex(['#8a6a3a', '#6f7d5a', '#4a6a8a', '#9a4a3a'][Math.floor(rng() * 4)]);
        r.rect(ox + x, oy + 3, 5, 5, c);
        r.rect(ox + x + 1, oy + 12, 4, 6, shade(c, -10));
      }
      break;
    case 'lamp':
      r.rect(ox + 9, oy + 6, 14, 6, hex('#0b0e13'));
      r.rect(ox + 10, oy + 7, 12, 4, mix(WHITE(), trim, 0.35));
      r.rect(ox + 10, oy + 11, 12, 1, alpha(trim, 120));
      break;
    default:
      break;
  }
}
