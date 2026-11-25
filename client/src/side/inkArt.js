// "Ink & neon" art for the side-view facility, drawn in code onto one big canvas.
// Clean bone-white linework on deep blue-black, soft gradients, and neon only
// where something glows (screens, tanks, signs, infection green).
import { ROOMS as ROOM_INFO } from '../../../shared/constants.js';
import { WIDTH, ROOM_HEIGHT, DOOR_HEIGHT, ORIGIN_X, WORLD, FLOORS, GROUND, TOP, ROOMS, LADDERS, FURNITURE } from './facility.js';

export const INK = '#e9e4d6';
const INK_SOFT = 'rgba(233,228,214,0.82)';

/** Lighten (t > 0) or darken (t < 0) a #rrggbb colour. */
function shade(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.round(t > 0 ? v + (255 - v) * t : v * (1 + t));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}
const inkA = (a) => `rgba(233,228,214,${a})`;
const X = (x) => ORIGIN_X + x;
const SLAB = 40;

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pen helpers on a 2D canvas context. Lines get a very slight hand-made wobble
 * and hatching is kept faint, so the result reads clean rather than sketchy.
 */
export class Ink {
  constructor(ctx, seed = 1, { wobble = 0, hatchScale = 0.12 } = {}) {
    this.c = ctx;
    this.rng = mulberry32(seed);
    this.wobble = wobble;
    this.hatchScale = hatchScale;
  }
  jitter(a = 1) {
    return (this.rng() - 0.5) * 2 * a * this.wobble;
  }
  line(x0, y0, x1, y1, w = 2, color = INK) {
    const c = this.c;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(len / 24));
    c.beginPath();
    c.moveTo(x0, y0);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const j = i === n ? 0 : 1;
      c.lineTo(x0 + (x1 - x0) * t + this.jitter() * j, y0 + (y1 - y0) * t + this.jitter() * j);
    }
    c.lineWidth = w * 0.85;
    c.strokeStyle = color;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.stroke();
  }
  rect(x, y, w, h, lw = 2, color = INK, fill = null) {
    if (fill) {
      const c = this.c;
      if (/^#[0-9a-f]{6}$/i.test(fill) && h > 6) {
        // solid objects: lighter at the top, darker at the bottom, a thin top highlight
        const g = c.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, shade(fill, 0.14));
        g.addColorStop(1, shade(fill, -0.3));
        c.fillStyle = g;
        c.fillRect(x, y, w, h);
        c.fillStyle = 'rgba(255,255,255,0.1)';
        c.fillRect(x + 1, y + 1, w - 2, 1);
      } else {
        c.fillStyle = fill;
        c.fillRect(x, y, w, h);
      }
    }
    if (lw > 0 && color === INK) color = INK_SOFT; // outlines a touch softer than pure ink
    if (lw > 0) {
      this.c.lineWidth = lw * 0.85;
      this.c.strokeStyle = color;
      this.c.lineJoin = 'round';
      this.c.strokeRect(x, y, w, h);
    }
  }
  /** Faint parallel strokes clipped to a rectangle (used for texture and shade). */
  hatch(x, y, w, h, gap = 7, alpha = 0.14, angle = 1) {
    const a = alpha * this.hatchScale;
    if (a < 0.015) return;
    const c = this.c;
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    c.lineWidth = 1;
    c.strokeStyle = inkA(a);
    c.beginPath();
    for (let d = -h; d < w + h; d += gap * 1.4) {
      if (angle > 0) {
        c.moveTo(x + d, y + h);
        c.lineTo(x + d + h, y);
      } else {
        c.moveTo(x + d, y);
        c.lineTo(x + d + h, y + h);
      }
    }
    c.stroke();
    c.restore();
  }
  cross(x, y, w, h, gap = 7, alpha = 0.12) {
    this.hatch(x, y, w, h, gap, alpha, 1);
  }
  circle(x, y, r, lw = 2, color = INK, fill = null) {
    const c = this.c;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (lw > 0) {
      c.lineWidth = lw * 0.85;
      c.strokeStyle = color;
      c.stroke();
    }
  }
  /** Run draw() with a neon glow. */
  neon(color, blur, draw) {
    const c = this.c;
    c.save();
    c.shadowColor = color;
    c.shadowBlur = blur;
    draw();
    c.restore();
  }
  text(str, x, y, size, color = INK, align = 'left', weight = '700', spacing = 1) {
    const c = this.c;
    c.font = `${weight} ${Math.round(size * 1.15)}px "Rajdhani", "Segoe UI", sans-serif`;
    if ('letterSpacing' in c) c.letterSpacing = `${spacing}px`;
    c.textAlign = align;
    c.textBaseline = 'middle';
    c.fillStyle = color;
    c.fillText(str, x, y);
    if ('letterSpacing' in c) c.letterSpacing = '0px';
  }
}

const DARK = '#1a1f29'; // furniture bodies: lighter than the walls so they read as objects
const WALL = '#111116';
const roomInfo = (id) => ROOM_INFO.find((r) => r.id === id);

// ------------------------------------------------------------ furniture
// Each drawer: (ink, x, floorY, options, out, accent). x is world x.
const F = {
  desk(k, x, fy, o, out) {
    const w = o.w ?? 160;
    k.rect(x, fy - 56, w, 8, 2, INK, DARK);
    k.line(x + 8, fy - 48, x + 8, fy, 2);
    k.line(x + w - 8, fy - 48, x + w - 8, fy, 2);
    k.hatch(x + 8, fy - 48, w - 16, 48, 9, 0.08);
    const n = o.monitors ?? 1;
    for (let i = 0; i < n; i++) {
      const mx = x + 14 + i * ((w - 28) / n);
      const mw = Math.min(54, (w - 28) / n - 8);
      k.rect(mx, fy - 98, mw, 36, 2, INK, '#050608');
      k.neon('#2fd2e0', 10, () => {
        for (let l = 0; l < 4; l++) k.line(mx + 6, fy - 90 + l * 7, mx + 6 + (mw - 14) * (0.3 + 0.7 * k.rng()), fy - 90 + l * 7, 1.5, '#5ff0ff');
      });
      k.line(mx + mw / 2, fy - 62, mx + mw / 2, fy - 56, 2);
      out.glows.push({ x: mx + mw / 2, y: fy - 80, color: '#2fd2e0', radius: 70, intensity: 0.35, mode: 'flicker' });
    }
  },
  chair(k, x, fy) {
    k.line(x - 14, fy - 40, x + 14, fy - 40, 3);
    k.line(x - 12, fy - 40, x - 16, fy - 78, 3);
    k.line(x, fy - 40, x, fy - 8, 2);
    k.line(x - 12, fy, x + 12, fy, 2);
  },
  bed(k, x, fy, o) {
    const w = o.w ?? 150;
    k.rect(x, fy - 44, w, 14, 2, INK, '#262b36');
    k.rect(x + 4, fy - 58, w - 8, 14, 2, INK, '#e9e4d6');
    k.rect(x + 8, fy - 70, 34, 12, 2, INK, '#f4f1ea');
    k.hatch(x + 46, fy - 58, w - 54, 14, 5, 0.35);
    k.line(x, fy - 30, x, fy, 2);
    k.line(x + w, fy - 30, x + w, fy, 2);
    k.line(x, fy - 44, x, fy - 90, 3);
  },
  ivStand(k, x, fy, o, out) {
    k.line(x, fy, x, fy - 120, 2);
    k.line(x - 12, fy, x + 12, fy, 2);
    k.line(x - 10, fy - 120, x + 10, fy - 120, 2);
    k.neon('#7fd0ff', 8, () => k.rect(x - 9, fy - 116, 12, 20, 1.5, '#9fe0ff', 'rgba(127,208,255,0.25)'));
  },
  nurseDesk(k, x, fy, o, out) {
    const w = o.w ?? 160;
    k.rect(x, fy - 64, w, 64, 2, INK, DARK);
    k.cross(x + 2, fy - 62, w - 4, 60, 9, 0.08);
    k.line(x - 4, fy - 64, x + w + 4, fy - 64, 3);
    k.rect(x + w / 2 - 22, fy - 100, 44, 30, 2, INK, '#050608');
    k.neon('#ff4a5a', 10, () => k.line(x + w / 2 - 14, fy - 86, x + w / 2 + 14, fy - 86, 2, '#ff6a78'));
    out.glows.push({ x: x + w / 2, y: fy - 86, color: '#ff4a5a', radius: 60, intensity: 0.3, mode: 'pulse' });
  },
  medCart(k, x, fy) {
    k.rect(x, fy - 60, 40, 52, 2, INK, '#262b36');
    for (const y of [-46, -32, -18]) k.line(x + 4, fy + y, x + 36, fy + y, 1.5);
    k.circle(x + 6, fy - 4, 4, 2, INK, DARK);
    k.circle(x + 34, fy - 4, 4, 2, INK, DARK);
  },
  redCross(k, x, fy, o, out) {
    const y = fy - 190;
    k.neon('#ff4a5a', 18, () => {
      k.rect(x - 9, y - 26, 18, 52, 3, '#ff5a68');
      k.rect(x - 26, y - 9, 52, 18, 3, '#ff5a68');
    });
    out.glows.push({ x, y, color: '#ff4a5a', radius: 110, intensity: 0.4, mode: 'pulse' });
  },
  poster(k, x, fy, o) {
    const y = fy - 200;
    k.rect(x, y, 56, 74, 2, INK, '#20242e');
    k.hatch(x + 4, y + 24, 48, 30, 4, 0.3);
    k.circle(x + 28, y + 38, 10, 2);
    k.text(o.title ?? 'NOTICE', x + 28, y + 12, 8, INK, 'center');
    for (let i = 0; i < 2; i++) k.line(x + 8, y + 60 + i * 6, x + 48, y + 60 + i * 6, 1, inkA(0.6));
  },
  window(k, x, fy, o) {
    const w = o.w ?? 100;
    const y = fy - 210;
    k.rect(x, y, w, 90, 3, INK, '#04060c');
    for (let i = 0; i < 10; i++) {
      k.c.fillStyle = inkA(0.4 + k.rng() * 0.5);
      k.c.fillRect(x + 6 + k.rng() * (w - 12), y + 6 + k.rng() * 50, 1.5, 1.5);
    }
    for (let i = 0; i < 14; i++) {
      const rx = x + 4 + k.rng() * (w - 8);
      const ry = y + 4 + k.rng() * 70;
      k.line(rx, ry, rx - 3, ry + 12, 1, 'rgba(160,190,230,0.35)');
    }
    k.line(x + w / 2, y, x + w / 2, y + 90, 2);
    k.line(x, y + 45, x + w, y + 45, 2);
  },
  reception(k, x, fy, o, out) {
    const w = o.w ?? 180;
    k.rect(x, fy - 74, w, 74, 2, INK, DARK);
    k.hatch(x + 2, fy - 72, w - 4, 70, 6, 0.1);
    k.line(x - 6, fy - 74, x + w + 6, fy - 74, 3);
    k.neon('#3ee6a0', 14, () => k.line(x + 10, fy - 40, x + w - 10, fy - 40, 2, '#5effb8'));
    k.rect(x + w - 60, fy - 110, 40, 30, 2, INK, '#050608');
    out.glows.push({ x: x + w / 2, y: fy - 44, color: '#3ee6a0', radius: 100, intensity: 0.3, mode: 'steady' });
  },
  sofa(k, x, fy, o) {
    const w = o.w ?? 120;
    k.rect(x, fy - 62, w, 30, 2, INK, '#262b36');
    k.rect(x - 8, fy - 46, w + 16, 34, 2, INK, '#262b36');
    k.hatch(x - 6, fy - 44, w + 12, 30, 5, 0.18);
    k.line(x, fy - 12, x, fy, 2);
    k.line(x + w, fy - 12, x + w, fy, 2);
  },
  plant(k, x, fy) {
    k.rect(x - 12, fy - 30, 24, 30, 2, INK, DARK);
    k.hatch(x - 10, fy - 28, 20, 26, 4, 0.3);
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.38;
      const len = 30 + k.rng() * 26;
      k.line(x, fy - 30, x + Math.cos(a) * len, fy - 30 + Math.sin(a) * len, 2);
    }
  },
  waterCooler(k, x, fy, o, out) {
    k.rect(x - 12, fy - 60, 24, 60, 2, INK, '#262b36');
    k.neon('#3e8bff', 10, () => k.rect(x - 10, fy - 96, 20, 34, 2, '#6aa8ff', 'rgba(62,139,255,0.25)'));
  },
  clock(k, x, fy) {
    k.circle(x, fy - 220, 14, 2, INK, '#20242e');
    k.line(x, fy - 220, x, fy - 230, 2);
    k.line(x, fy - 220, x + 7, fy - 217, 2);
  },
  lockers(k, x, fy, o) {
    const w = o.w ?? 200;
    const n = Math.round(w / 36);
    const lw = w / n;
    for (let i = 0; i < n; i++) {
      const lx = x + i * lw;
      k.rect(lx, fy - 190, lw - 2, 190, 2, INK, '#16181e');
      for (let v = 0; v < 4; v++) k.line(lx + 8, fy - 176 + v * 5, lx + lw - 10, fy - 176 + v * 5, 1, inkA(0.6));
      k.line(lx + lw - 8, fy - 110, lx + lw - 8, fy - 96, 2);
      k.hatch(lx + 2, fy - 90, lw - 6, 88, 8, 0.07);
    }
  },
  bench(k, x, fy, o) {
    const w = o.w ?? 120;
    k.rect(x, fy - 34, w, 8, 2, INK, '#262b36');
    k.line(x + 8, fy - 26, x + 8, fy, 2);
    k.line(x + w - 8, fy - 26, x + w - 8, fy, 2);
  },
  cone(k, x, fy) {
    k.c.beginPath();
    k.c.moveTo(x - 12, fy);
    k.c.lineTo(x, fy - 34);
    k.c.lineTo(x + 12, fy);
    k.c.closePath();
    k.c.fillStyle = '#ff7a1a';
    k.c.fill();
    k.line(x - 12, fy, x, fy - 34, 2);
    k.line(x, fy - 34, x + 12, fy, 2);
    k.line(x - 7, fy - 14, x + 7, fy - 14, 3, INK);
  },
  puddle(k, x, fy) {
    k.c.fillStyle = 'rgba(160,200,230,0.25)';
    k.c.beginPath();
    k.c.ellipse(x, fy - 2, 40, 4, 0, 0, Math.PI * 2);
    k.c.fill();
  },
  shelf(k, x, fy, o) {
    const w = o.w ?? 140;
    k.line(x, fy, x, fy - 200, 3);
    k.line(x + w, fy, x + w, fy - 200, 3);
    for (let s = 0; s < 4; s++) {
      const sy = fy - 10 - s * 55;
      k.line(x, sy, x + w, sy, 3);
      for (let bx = x + 6; bx < x + w - 14;) {
        const bw = 16 + k.rng() * 20;
        const bh = 16 + k.rng() * 26;
        if (bx + bw > x + w - 4) break;
        k.rect(bx, sy - bh, bw, bh, 1.5, INK, '#16181e');
        if (k.rng() < 0.5) k.hatch(bx + 1, sy - bh + 1, bw - 2, bh - 2, 4, 0.25);
        bx += bw + 4;
      }
    }
  },
  shelfSpecimens(k, x, fy, o, out) {
    const w = o.w ?? 70;
    k.line(x, fy, x, fy - 200, 3);
    k.line(x + w, fy, x + w, fy - 200, 3);
    for (let s = 0; s < 3; s++) {
      const sy = fy - 30 - s * 60;
      k.line(x, sy, x + w, sy, 3);
      for (let j = 0; j < 3; j++) {
        const jx = x + 8 + j * 21;
        k.neon('#3ee67a', 8, () => k.rect(jx, sy - 26, 14, 24, 1.5, '#6effa0', 'rgba(62,230,122,0.3)'));
      }
    }
    out.glows.push({ x: x + w / 2, y: fy - 100, color: '#3ee67a', radius: 90, intensity: 0.3, mode: 'pulse' });
  },
  crates(k, x, fy) {
    k.rect(x, fy - 44, 50, 44, 2, INK, '#16181e');
    k.line(x, fy - 44, x + 50, fy, 1.5, inkA(0.6));
    k.line(x + 50, fy - 44, x, fy, 1.5, inkA(0.6));
    k.rect(x + 54, fy - 34, 28, 34, 2, INK, '#16181e');
    k.hatch(x + 55, fy - 33, 26, 32, 5, 0.3);
    k.rect(x + 10, fy - 76, 34, 32, 2, INK, '#16181e');
  },
  barrels(k, x, fy, o, out) {
    for (const bx of [x, x + 42]) {
      k.rect(bx, fy - 58, 36, 58, 2, INK, '#14180c');
      k.line(bx, fy - 40, bx + 36, fy - 40, 1.5);
      k.line(bx, fy - 18, bx + 36, fy - 18, 1.5);
      k.neon('#c6f03a', 10, () => k.circle(bx + 18, fy - 29, 6, 2, '#d8ff5a'));
    }
    out.glows.push({ x: x + 40, y: fy - 30, color: '#c6f03a', radius: 70, intensity: 0.25, mode: 'pulse' });
  },
  supplyStation(k, x, fy, o, out) {
    const w = o.w ?? 120;
    k.rect(x, fy - 110, w, 110, 2, INK, DARK);
    k.rect(x + 14, fy - 96, w - 28, 34, 2, INK, '#050608');
    k.neon('#f2b84a', 10, () => k.text('CARD REFILL', x + w / 2, fy - 79, 10, '#ffd27a', 'center'));
    k.rect(x + w / 2 - 20, fy - 50, 40, 8, 2, INK, '#050608');
    k.hatch(x + 2, fy - 36, w - 4, 34, 6, 0.12);
    out.glows.push({ x: x + w / 2, y: fy - 79, color: '#f2b84a', radius: 80, intensity: 0.35, mode: 'pulse' });
  },
  supplyBox(k, x, fy, o, out) {
    k.neon('#f2b84a', 18, () => k.rect(x, fy - 46, 56, 46, 3, '#ffd27a', '#2a1e08'));
    k.line(x, fy - 30, x + 56, fy - 30, 2, '#ffd27a');
    k.line(x + 28, fy - 46, x + 28, fy, 2, '#ffd27a');
    out.glows.push({ x: x + 28, y: fy - 24, color: '#f2b84a', radius: 110, intensity: 0.5, mode: 'pulse' });
  },
  hazardFloor(k, x, fy, o) {
    const w = o.w ?? 160;
    for (let i = 0; i < w; i += 16) {
      k.c.fillStyle = (i / 16) % 2 ? '#d9b526' : '#141414';
      k.c.fillRect(x + i, fy - 3, 16, 3);
    }
  },
  helix(k, x, fy, o, out) {
    const cy = fy - 170;
    k.neon('#2fd2c0', 20, () => {
      k.circle(x, cy, 70, 3, '#5ff0e0');
      for (let y = -54; y <= 54; y += 3) {
        const s = Math.sin(y / 14) * 26;
        k.c.fillStyle = '#7ffff0';
        k.c.fillRect(x + s - 1.5, cy + y, 3, 2.4);
        k.c.fillStyle = 'rgba(127,255,240,0.6)';
        k.c.fillRect(x - s - 1.5, cy + y, 3, 2.4);
        if (y % 9 === 0) k.line(x - s, cy + y, x + s, cy + y, 1, 'rgba(127,255,240,0.5)');
      }
    });
    k.text('HELIX RESEARCH', x, cy - 84, 11, 'rgba(127,255,240,0.75)', 'center', '700', 4);
    out.glows.push({ x, y: cy, color: '#2fd2c0', radius: 170, intensity: 0.35, mode: 'steady' });
  },
  duelTable(k, x, fy, o, out) {
    const col = '#2fd2e0';
    k.c.fillStyle = DARK;
    k.c.beginPath();
    k.c.ellipse(x, fy - 52, 46, 10, 0, 0, Math.PI * 2);
    k.c.fill();
    k.neon(col, 16, () => {
      k.c.beginPath();
      k.c.ellipse(x, fy - 52, 46, 10, 0, 0, Math.PI * 2);
      k.c.lineWidth = 3;
      k.c.strokeStyle = col;
      k.c.stroke();
    });
    k.line(x, fy - 44, x, fy - 6, 4);
    k.line(x - 24, fy, x + 24, fy, 3);
    k.rect(x - 22, fy - 60, 14, 8, 1.5, INK, '#e9e4d6');
    k.rect(x + 8, fy - 60, 14, 8, 1.5, INK, col);
    // hanging sign
    k.line(x, fy - ROOM_HEIGHT + 24, x, fy - 128, 1, 'rgba(233,228,214,0.4)');
    k.neon(col, 10, () => {
      k.rect(x - 56, fy - 128, 112, 20, 2, col, '#07080b');
      k.text('DUEL', x, fy - 118, 10, col, 'center');
    });
    out.duels.push({ x, y: fy - 52 });
    out.glows.push({ x, y: fy - 52, color: col, radius: 90, intensity: 0.45, mode: 'pulse' });
  },
  emergencyButton(k, x, fy, o, out) {
    k.rect(x - 20, fy - 70, 40, 70, 2, INK, DARK);
    k.hatch(x - 18, fy - 68, 36, 66, 6, 0.15);
    k.neon('#ff3b4a', 16, () => k.circle(x, fy - 80, 13, 3, '#ff5a68', '#7a0a12'));
    out.glows.push({ x, y: fy - 80, color: '#ff3b4a', radius: 70, intensity: 0.5, mode: 'pulse' });
  },
  wallScreen(k, x, fy, o, out) {
    const y = fy - 210;
    k.rect(x - 40, y, 80, 50, 3, INK, '#050608');
    k.neon('#2fd2e0', 10, () => {
      for (let l = 0; l < 4; l++) k.line(x - 32, y + 10 + l * 9, x - 32 + 20 + k.rng() * 40, y + 10 + l * 9, 1.5, '#5ff0ff');
    });
    out.glows.push({ x, y: y + 25, color: '#2fd2e0', radius: 80, intensity: 0.3, mode: 'flicker' });
  },
  tank(k, x, fy, o, out) {
    k.rect(x - 2, fy - 22, 48, 22, 2, INK, DARK);
    k.neon('#3ee6a0', 14, () => k.rect(x + 2, fy - 150, 40, 128, 2.5, '#6effc0', 'rgba(30,140,90,0.45)'));
    k.c.fillStyle = 'rgba(5,30,18,0.9)';
    k.c.beginPath();
    k.c.ellipse(x + 22, fy - 84, 9, 22, 0, 0, Math.PI * 2);
    k.c.fill();
    k.circle(x + 22, fy - 116, 7, 0, INK, 'rgba(5,30,18,0.9)');
    for (let i = 0; i < 6; i++) k.circle(x + 8 + k.rng() * 28, fy - 40 - k.rng() * 100, 1.5, 1, '#b8ffd8');
    k.rect(x - 2, fy - 162, 48, 12, 2, INK, DARK);
    out.glows.push({ x: x + 22, y: fy - 86, color: '#3ee6a0', radius: 90, intensity: 0.4, mode: 'pulse' });
  },
  bigTank(k, x, fy, o, out) {
    k.rect(x - 70, fy - 30, 140, 30, 2, INK, DARK);
    k.cross(x - 68, fy - 28, 136, 26, 6, 0.15);
    k.neon('#43f0dc', 20, () => k.rect(x - 52, fy - 220, 104, 190, 3, '#7ffff0', 'rgba(20,120,120,0.45)'));
    k.c.fillStyle = 'rgba(3,26,26,0.92)';
    k.c.beginPath();
    k.c.ellipse(x, fy - 120, 18, 44, 0, 0, Math.PI * 2);
    k.c.fill();
    k.circle(x, fy - 176, 14, 0, INK, 'rgba(3,26,26,0.92)');
    k.line(x - 18, fy - 150, x - 34, fy - 110, 4, 'rgba(3,26,26,0.92)');
    k.line(x + 18, fy - 150, x + 32, fy - 106, 4, 'rgba(3,26,26,0.92)');
    for (let i = 0; i < 12; i++) k.circle(x - 44 + k.rng() * 88, fy - 50 - k.rng() * 160, 1.5 + k.rng() * 2, 1, '#c8fff8');
    k.line(x - 40, fy - 214, x - 40, fy - 40, 2, 'rgba(255,255,255,0.35)');
    k.rect(x - 62, fy - 238, 124, 18, 2, INK, DARK);
    k.line(x, fy - 238, x, fy - 260, 3);
    out.glows.push({ x, y: fy - 120, color: '#43f0dc', radius: 170, intensity: 0.45, mode: 'pulse' });
  },
  holoTable(k, x, fy, o, out) {
    k.rect(x - 46, fy - 40, 92, 12, 2, INK, DARK);
    k.line(x - 30, fy - 28, x - 36, fy, 3);
    k.line(x + 30, fy - 28, x + 36, fy, 3);
    k.neon('#2fd2e0', 12, () => k.line(x - 40, fy - 41, x + 40, fy - 41, 2, '#5ff0ff'));
    out.holos.push({ x, y: fy - 44 });
    out.glows.push({ x, y: fy - 90, color: '#2fd2e0', radius: 110, intensity: 0.35, mode: 'pulse' });
  },
  cureMachine(k, x, fy, o, out) {
    k.rect(x - 80, fy - 60, 160, 60, 2, INK, DARK);
    k.cross(x - 78, fy - 58, 156, 56, 7, 0.12);
    k.rect(x - 60, fy - 230, 120, 170, 3, INK, '#0d1013');
    k.neon('#3ee6d0', 24, () => {
      k.circle(x, fy - 150, 46, 4, '#6ffff0', 'rgba(20,110,100,0.5)');
      k.circle(x, fy - 150, 28, 2, '#9ffff8');
    });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.line(x + Math.cos(a) * 50, fy - 150 + Math.sin(a) * 50, x + Math.cos(a) * 58, fy - 150 + Math.sin(a) * 58, 3);
    }
    k.text('CURE', x, fy - 82, 12, '#9ffff8', 'center');
    k.line(x - 60, fy - 230, x - 100, fy - 260, 4);
    k.line(x + 60, fy - 230, x + 100, fy - 260, 4);
    out.glows.push({ x, y: fy - 150, color: '#3ee6d0', radius: 200, intensity: 0.5, mode: 'pulse' });
  },
  whiteboard(k, x, fy, o) {
    const w = o.w ?? 120;
    const y = fy - 200;
    k.rect(x, y, w, 70, 3, INK, '#d8d4c8');
    k.line(x + 10, y + 18, x + 50, y + 14, 2, '#262b36');
    k.line(x + 10, y + 32, x + 70, y + 36, 2, '#c42a2a');
    k.circle(x + w - 30, y + 30, 14, 2, '#262b36');
    k.line(x + w - 44, y + 30, x + w - 16, y + 30, 1.5, '#262b36');
    k.line(x + 10, y + 52, x + 40, y + 50, 2, '#2a5ac4');
  },
  serverRack(k, x, fy, o, out) {
    k.rect(x, fy - 200, 40, 200, 2, INK, '#0d0f13');
    for (let y = fy - 190; y < fy - 10; y += 14) {
      k.line(x + 4, y, x + 36, y, 1, inkA(0.4));
      for (let l = 0; l < 3; l++) {
        if (k.rng() < 0.6) {
          k.c.fillStyle = ['#3ee67a', '#3e8bff', '#e6b23e'][Math.floor(k.rng() * 3)];
          k.c.fillRect(x + 8 + l * 8, y + 5, 3, 3);
        }
      }
    }
    out.leds.push({ x: x + 6, y: fy - 190, w: 28, h: 180 });
  },
  sink(k, x, fy) {
    k.rect(x, fy - 70, 50, 12, 2, INK, '#d8d4c8');
    k.line(x + 25, fy - 70, x + 25, fy - 86, 2);
    k.line(x + 25, fy - 86, x + 34, fy - 86, 2);
    k.line(x + 8, fy - 58, x + 8, fy, 2);
    k.line(x + 42, fy - 58, x + 42, fy, 2);
  },
  fileCabinet(k, x, fy) {
    k.rect(x, fy - 100, 40, 100, 2, INK, '#16181e');
    for (const y of [-68, -36]) k.line(x, fy + y, x + 40, fy + y, 2);
    for (const y of [-84, -52, -20]) k.line(x + 14, fy + y, x + 26, fy + y, 2);
  },
  vent(k, x, fy, o, out) {
    k.neon('#ff3b4a', 10, () => k.rect(x, fy - 34, 44, 26, 2.5, '#ff5a68', '#1a0508'));
    for (let i = 1; i < 5; i++) k.line(x + i * 9, fy - 30, x + i * 9, fy - 12, 1.5, '#ff5a68');
    out.vents.push({ x: x + 22, y: fy - 21 });
  },
  camera(k, x, fy) {
    const y = fy - ROOM_HEIGHT + 6;
    k.line(x, y, x, y + 14, 2);
    k.rect(x - 22, y + 14, 26, 12, 2, INK, DARK);
    k.neon('#ff3b4a', 6, () => k.circle(x - 18, y + 20, 2, 0, null, '#ff3b4a'));
  },
  counter(k, x, fy, o, out) {
    const w = o.w ?? 180;
    k.rect(x, fy - 70, w, 70, 2, INK, DARK);
    k.hatch(x + 2, fy - 68, w - 4, 66, 7, 0.1);
    k.line(x - 4, fy - 70, x + w + 4, fy - 70, 3);
    for (let tx = x + 12; tx < x + w - 30; tx += 42) {
      k.rect(tx, fy - 82, 32, 10, 1.5, INK, '#262b36');
      k.circle(tx + 10, fy - 84, 5, 1.5, INK, '#2a2420');
    }
    k.rect(x + 10, fy - 210, w - 20, 50, 2, INK, '#07080b');
    k.neon('#b06cff', 12, () => k.text('CANTEEN', x + w / 2, fy - 185, 14, '#d2a8ff', 'center'));
    out.glows.push({ x: x + w / 2, y: fy - 185, color: '#b06cff', radius: 110, intensity: 0.35, mode: 'flicker' });
  },
  vending(k, x, fy, o, out) {
    k.rect(x, fy - 160, 44, 160, 2, INK, '#0d0f13');
    k.neon('#ff3bd4', 12, () => k.rect(x + 5, fy - 150, 26, 100, 2, '#ff7ae6', 'rgba(120,20,100,0.35)'));
    for (let r = 0; r < 5; r++) {
      for (let ci = 0; ci < 3; ci++) {
        k.c.fillStyle = ['#ff3bd4', '#2fd2e0', '#f2e14a'][(r + ci) % 3];
        k.c.fillRect(x + 9 + ci * 7, fy - 142 + r * 19, 4, 8);
      }
    }
    k.rect(x + 8, fy - 36, 28, 12, 2, INK, '#050608');
    out.glows.push({ x: x + 18, y: fy - 100, color: '#ff3bd4', radius: 70, intensity: 0.3, mode: 'flicker' });
  },
  pad(k, x, fy, o, out) {
    for (let i = -24; i < 24; i += 8) {
      k.c.fillStyle = ((i + 24) / 8) % 2 ? '#d9b526' : '#141414';
      k.c.fillRect(x + i, fy - 5, 8, 5);
    }
    k.neon('#ffb347', 12, () => k.rect(x - 16, fy - 12, 32, 7, 2, '#ffd27a', '#2a1a08'));
    out.glows.push({ x, y: fy - 10, color: '#ffb347', radius: 50, intensity: 0.4, mode: 'pulse' });
  },
  controlPanel(k, x, fy, o, out) {
    const y = fy - 220;
    k.rect(x, y, 110, 70, 2.5, INK, '#07080b');
    k.neon('#ffb347', 10, () => {
      k.rect(x + 8, y + 8, 50, 28, 1.5, '#ffd27a');
      for (let l = 0; l < 3; l++) k.line(x + 12, y + 14 + l * 8, x + 20 + k.rng() * 34, y + 14 + l * 8, 1.5, '#ffd27a');
    });
    for (let i = 0; i < 6; i++) k.circle(x + 70 + (i % 3) * 13, y + 16 + Math.floor(i / 3) * 16, 4, 1.5, INK, ['#ff3b4a', '#3ee67a', '#f2e14a'][i % 3]);
    k.text('CORE TEMP', x + 55, y + 56, 9, '#ffd27a', 'center');
    out.glows.push({ x: x + 33, y: y + 22, color: '#ffb347', radius: 70, intensity: 0.3, mode: 'flicker' });
  },
  reactorCore(k, x, fy, o, out) {
    k.rect(x - 86, fy - 40, 172, 40, 2.5, INK, DARK);
    k.cross(x - 84, fy - 38, 168, 36, 6, 0.15);
    k.rect(x - 64, fy - 250, 128, 18, 2.5, INK, DARK);
    for (const px of [x - 70, x + 62]) {
      k.rect(px, fy - 232, 8, 192, 2, INK, '#14161b');
      k.hatch(px + 1, fy - 230, 6, 188, 4, 0.3);
    }
    k.neon('#ff8c2a', 26, () => {
      k.rect(x - 46, fy - 226, 92, 182, 3, '#ffb060', 'rgba(140,50,0,0.45)');
      for (let y = fy - 210; y < fy - 60; y += 22) k.line(x - 40, y, x + 40, y, 1.5, 'rgba(255,190,110,0.7)');
    });
    k.c.fillStyle = 'rgba(255,220,150,0.85)';
    k.c.fillRect(x - 10, fy - 210, 20, 150);
    k.text('REACTOR', x, fy - 20, 12, '#ffd27a', 'center');
    out.glows.push({ x, y: fy - 140, color: '#ff8c2a', radius: 230, intensity: 0.55, mode: 'pulse' });
  },
  cells(k, x, fy, o, out) {
    const w = o.w ?? 230;
    const half = w / 2;
    for (const cx of [x, x + half]) {
      k.rect(cx, fy - ROOM_HEIGHT + 30, half - 6, ROOM_HEIGHT - 30, 2.5, INK, '#0a0a0d');
      k.line(cx + 12, fy - 46, cx + half - 30, fy - 46, 3);
      k.rect(cx + 12, fy - 58, 60, 12, 1.5, INK, '#2a2c32');
      k.neon('#3ee67a', 12, () => {
        k.c.fillStyle = 'rgba(62,230,122,0.5)';
        k.c.beginPath();
        k.c.ellipse(cx + half / 2, fy - 3, 30, 3, 0, 0, Math.PI * 2);
        k.c.fill();
      });
      for (let bx = cx + 6; bx < cx + half - 8; bx += 12) k.line(bx, fy - ROOM_HEIGHT + 30, bx, fy, 2.5);
      k.line(cx, fy - ROOM_HEIGHT + 60, cx + half - 6, fy - ROOM_HEIGHT + 60, 3);
    }
    out.glows.push({ x: x + w / 2, y: fy - 60, color: '#3ee67a', radius: 140, intensity: 0.25, mode: 'pulse' });
  },
  exitDoor(k, x, fy, o, out) {
    const dx = X(-40);
    k.rect(dx + 4, fy - 160, 32, 160, 2, INK, '#262b36');
    for (let i = 0; i < 160; i += 14) {
      k.c.fillStyle = (i / 14) % 2 ? '#d9b526' : '#141414';
      k.c.fillRect(dx + 6, fy - 160 + i, 6, 14);
    }
    k.neon('#ff3b4a', 14, () => {
      k.rect(X(8), fy - 196, 88, 24, 2, '#ff5a68', '#1a0508');
      k.text('EXIT SEALED', X(52), fy - 184, 10, '#ff8a94', 'center');
    });
    out.glows.push({ x: X(52), y: fy - 184, color: '#ff3b4a', radius: 90, intensity: 0.4, mode: 'flicker' });
  },
};

// ------------------------------------------------------------- building
const FLOOR_LABEL = ['B1', 'G', '02', '03'];
const EDGE = 'rgba(233,228,214,0.55)';
const EDGE_SOFT = 'rgba(233,228,214,0.16)';

/** Mix two #rrggbb colours (t = 0 → a, 1 → b). */
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function drawGround(k) {
  const c = k.c;
  const gy = FLOORS[GROUND].y;
  // low mist over the ground line
  const mist = c.createLinearGradient(0, gy - 90, 0, gy);
  mist.addColorStop(0, 'rgba(80,110,160,0)');
  mist.addColorStop(1, 'rgba(80,110,160,0.10)');
  c.fillStyle = mist;
  c.fillRect(0, gy - 90, WORLD.width, 90);
  // earth
  const g = c.createLinearGradient(0, gy, 0, WORLD.height);
  g.addColorStop(0, '#0b0c10');
  g.addColorStop(1, '#040506');
  c.fillStyle = g;
  c.fillRect(0, gy, WORLD.width, WORLD.height - gy);
  for (const [dy, a] of [[70, 0.07], [150, 0.05], [260, 0.04], [380, 0.03]]) k.line(0, gy + dy, WORLD.width, gy + dy, 1, inkA(a));
  // buried service pipes
  for (const py of [gy + 120, gy + 132]) {
    c.fillStyle = 'rgba(233,228,214,0.08)';
    c.fillRect(0, py, X(-60), 2);
    c.fillRect(X(WIDTH + 60), py, WORLD.width, 2);
  }
  k.neon('#3ee67a', 18, () => {
    c.fillStyle = 'rgba(62,230,122,0.45)';
    c.beginPath();
    c.ellipse(X(WIDTH + 200), gy + 140, 46, 5, 0, 0, Math.PI * 2);
    c.fill();
  });
  // ground line and a neat perimeter fence
  c.fillStyle = 'rgba(233,228,214,0.6)';
  c.fillRect(0, gy - 1, WORLD.width, 2);
  for (let fx = 20; fx < WORLD.width; fx += 52) {
    if (fx > X(-70) && fx < X(WIDTH + 70)) continue;
    c.fillStyle = 'rgba(233,228,214,0.28)';
    c.fillRect(fx, gy - 46, 2, 46);
  }
  c.fillStyle = 'rgba(233,228,214,0.18)';
  c.fillRect(0, gy - 40, X(-70), 1);
  c.fillRect(0, gy - 24, X(-70), 1);
  c.fillRect(X(WIDTH + 70), gy - 40, WORLD.width, 1);
  c.fillRect(X(WIDTH + 70), gy - 24, WORLD.width, 1);
}

/** The outer walls and the roof: clean bevelled slabs with a thin bright edge. */
function drawShell(k) {
  const c = k.c;
  const top = FLOORS[TOP].y - ROOM_HEIGHT - SLAB;
  const bottom = FLOORS[0].y + SLAB;
  for (const [wx, inner] of [[X(-40), 1], [X(WIDTH), -1]]) {
    const g = c.createLinearGradient(wx, 0, wx + 40, 0);
    g.addColorStop(0, inner > 0 ? '#1a1e28' : '#0d0f15');
    g.addColorStop(1, inner > 0 ? '#0d0f15' : '#1a1e28');
    c.fillStyle = g;
    c.fillRect(wx, top, 40, bottom - top);
    c.fillStyle = EDGE;
    c.fillRect(wx, top, 1.5, bottom - top);
    c.fillRect(wx + 38.5, top, 1.5, bottom - top);
    // rivet rows at every floor
    for (const f of FLOORS) {
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.fillRect(wx, f.y + SLAB / 2, 40, 1);
      for (let ry = f.y - ROOM_HEIGHT + 30; ry < f.y - 20; ry += 46) {
        c.fillStyle = 'rgba(233,228,214,0.18)';
        c.beginPath();
        c.arc(wx + 20, ry, 1.6, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  // roof slab, parapet rail and rooftop plant
  const rg = c.createLinearGradient(0, top, 0, top + SLAB);
  rg.addColorStop(0, '#1b1f29');
  rg.addColorStop(1, '#0b0d12');
  c.fillStyle = rg;
  c.fillRect(X(-40), top, WIDTH + 80, SLAB);
  c.fillStyle = 'rgba(255,255,255,0.4)';
  c.fillRect(X(-40), top, WIDTH + 80, 1.5);
  c.fillStyle = EDGE_SOFT;
  c.fillRect(X(-40), top - 26, WIDTH + 80, 2);
  for (let x = -40; x <= WIDTH + 40; x += 80) c.fillRect(X(x), top - 26, 2, 26);
  const unit = (x, w, h) => {
    const ug = c.createLinearGradient(0, top - h, 0, top);
    ug.addColorStop(0, '#1c202a');
    ug.addColorStop(1, '#0e1016');
    c.fillStyle = ug;
    c.fillRect(X(x), top - h, w, h);
    c.strokeStyle = EDGE;
    c.lineWidth = 1.2;
    c.strokeRect(X(x) + 0.5, top - h + 0.5, w - 1, h - 1);
    for (let vx = X(x) + 8; vx < X(x) + w - 6; vx += 6) {
      c.fillStyle = 'rgba(233,228,214,0.08)';
      c.fillRect(vx, top - h + 8, 2, h - 16);
    }
  };
  unit(240, 110, 64);
  unit(1480, 80, 44);
  unit(1580, 80, 44);
  c.fillStyle = 'rgba(233,228,214,0.7)';
  c.fillRect(X(1900) - 1, top - 170, 2.5, 170);
  for (let i = 1; i < 5; i++) c.fillRect(X(1900) - 18 + i * 3, top - i * 32, 36 - i * 6, 1.5);
}

/**
 * One room: a wall tinted by the room's colour, clean bevelled panels, a trim light,
 * a wainscot with a coloured edge, the ceiling cove with its LED strips, a name plate,
 * then the furniture.
 */
function drawRoom(k, room, out) {
  const c = k.c;
  const fy = FLOORS[room.floor].y;
  const ty = fy - ROOM_HEIGHT;
  const x0 = X(room.x0);
  const w = room.x1 - room.x0;
  const info = roomInfo(room.id);
  const col = info.color;

  // back wall: a soft vertical gradient carrying a hint of the room colour
  const wall = c.createLinearGradient(0, ty, 0, fy);
  wall.addColorStop(0, mix('#161a25', col, 0.16));
  wall.addColorStop(0.55, mix('#10131b', col, 0.1));
  wall.addColorStop(1, mix('#0a0c11', col, 0.04));
  c.fillStyle = wall;
  c.fillRect(x0, ty, w, ROOM_HEIGHT);
  // a soft glow of the room colour behind the middle of the room
  c.save();
  c.beginPath();
  c.rect(x0, ty, w, ROOM_HEIGHT);
  c.clip();
  const cx = x0 + w / 2;
  const glow = c.createRadialGradient(cx, fy - 110, 10, cx, fy - 110, Math.max(w, 300) * 0.6);
  glow.addColorStop(0, rgba(col, 0.13));
  glow.addColorStop(1, rgba(col, 0));
  c.fillStyle = glow;
  c.fillRect(x0, ty, w, ROOM_HEIGHT);
  // darker corners for depth
  const side = c.createLinearGradient(x0, 0, x0 + w, 0);
  side.addColorStop(0, 'rgba(0,0,0,0.35)');
  side.addColorStop(0.18, 'rgba(0,0,0,0)');
  side.addColorStop(0.82, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,0.35)');
  c.fillStyle = side;
  c.fillRect(x0, ty, w, ROOM_HEIGHT);
  c.restore();

  // bevelled wall panels between the ceiling cove and the wainscot
  const pTop = ty + 34;
  const pBot = fy - 98;
  const n = Math.max(2, Math.round(w / 118));
  const gap = 6;
  const pw = (w - 16 - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const px = x0 + 8 + i * (pw + gap);
    c.fillStyle = 'rgba(255,255,255,0.035)';
    c.beginPath();
    c.roundRect(px, pTop, pw, pBot - pTop, 6);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    c.lineWidth = 1;
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fillRect(px + 6, pTop, pw - 12, 1);
    c.fillStyle = 'rgba(0,0,0,0.38)';
    c.fillRect(px + 6, pBot - 1, pw - 12, 1.5);
    // every other panel: a pair of small vent slots
    if (i % 2 === 1) {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      for (let s = 0; s < 3; s++) c.fillRect(px + pw / 2 - 12, pTop + 14 + s * 5, 24, 2);
    }
  }
  // a thin trim light along the wall, in the room colour
  k.neon(col, 6, () => {
    c.fillStyle = rgba(col, 0.32);
    c.fillRect(x0, ty + ROOM_HEIGHT * 0.42, w, 1.5);
  });

  // wainscot: a darker lower band with grooves and a coloured edge
  const wg = c.createLinearGradient(0, fy - 92, 0, fy);
  wg.addColorStop(0, '#10131a');
  wg.addColorStop(1, '#090a0e');
  c.fillStyle = wg;
  c.fillRect(x0, fy - 92, w, 92);
  for (let gx = x0 + 60; gx < x0 + w - 20; gx += 60) {
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.fillRect(gx, fy - 86, 1, 76);
    c.fillStyle = 'rgba(255,255,255,0.025)';
    c.fillRect(gx + 1, fy - 86, 1, 76);
  }
  k.neon(col, 8, () => {
    c.fillStyle = rgba(col, 0.55);
    c.fillRect(x0, fy - 93, w, 1.5);
  });

  // ceiling cove
  const cg = c.createLinearGradient(0, ty, 0, ty + 28);
  cg.addColorStop(0, '#06070a');
  cg.addColorStop(1, '#0e1017');
  c.fillStyle = cg;
  c.fillRect(x0, ty, w, 28);
  c.fillStyle = 'rgba(233,228,214,0.12)';
  c.fillRect(x0, ty + 28, w, 1);

  // skirting light in the room colour
  k.neon(col, 12, () => {
    c.fillStyle = col;
    c.globalAlpha = 0.85;
    c.fillRect(x0, fy - 4, w, 2);
    c.globalAlpha = 1;
  });

  // name plate: floor badge + room name in the room colour
  const lx = x0 + 22;
  const ly = ty + 50;
  c.fillStyle = 'rgba(7,8,12,0.75)';
  c.beginPath();
  c.roundRect(lx - 6, ly - 12, 44 + info.name.length * 9.5, 24, 5);
  c.fill();
  c.fillStyle = rgba(col, 0.9);
  c.beginPath();
  c.roundRect(lx - 6, ly - 12, 30, 24, [5, 0, 0, 5]);
  c.fill();
  k.text(FLOOR_LABEL[room.floor], lx + 9, ly + 0.5, 11, '#07080c', 'center', '700', 1);
  k.text(info.name.toUpperCase(), lx + 32, ly + 0.5, 11, rgba(col, 0.9), 'left', '700', 3);

  // LED light strips in recessed housings
  const lamps = Math.max(1, Math.round(w / 230));
  for (let i = 0; i < lamps; i++) {
    const lxp = x0 + (w / lamps) * (i + 0.5);
    c.fillStyle = '#05060a';
    c.beginPath();
    c.roundRect(lxp - 50, ty + 17, 100, 10, 3);
    c.fill();
    k.neon('#fff2dc', 16, () => {
      c.fillStyle = '#fff6ea';
      c.beginPath();
      c.roundRect(lxp - 44, ty + 20, 88, 4, 2);
      c.fill();
    });
    const roll = k.rng();
    out.lamps.push({
      x: lxp,
      y: ty + 24,
      color: { curelab: '#c8fff4', research: '#c8fff4', reactor: '#ffd2a0', quarantine: '#ffc8c8', server: '#cfe0ff' }[room.id] ?? '#fff1d6',
      mode: roll < 0.8 ? 'steady' : roll < 0.94 ? 'flicker' : 'broken',
    });
  }
  for (const [type, fx, opts] of FURNITURE[room.id] ?? []) {
    const draw = F[type];
    if (!draw) throw new Error(`Unknown furniture "${type}"`);
    draw(k, X(fx), fy, opts ?? {}, out, col);
  }
}

/** A concrete floor slab between storeys. */
function drawSlab(k, y) {
  const c = k.c;
  const g = c.createLinearGradient(0, y, 0, y + SLAB);
  g.addColorStop(0, '#1a1e27');
  g.addColorStop(0.3, '#12151c');
  g.addColorStop(1, '#08090c');
  c.fillStyle = g;
  c.fillRect(X(0), y, WIDTH, SLAB);
  c.fillStyle = EDGE_SOFT;
  c.fillRect(X(0), y + SLAB - 1, WIDTH, 1);
  for (let x = 240; x < WIDTH; x += 240) {
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(X(x), y + 12, 1, SLAB - 13);
  }
}

/** The polished floor of a room: a bright edge and a tinted, glossy face that fades down. */
function drawFloorFace(k, room) {
  const c = k.c;
  const fy = FLOORS[room.floor].y;
  const x0 = X(room.x0);
  const w = room.x1 - room.x0;
  const col = roomInfo(room.id).color;
  const g = c.createLinearGradient(0, fy, 0, fy + 12);
  g.addColorStop(0, mix('#2a2f3b', col, 0.18));
  g.addColorStop(1, '#12151c');
  c.fillStyle = g;
  c.fillRect(x0, fy, w, 12);
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.fillRect(x0, fy, w, 1);
  // tile joints
  for (let tx = x0 + 40; tx < x0 + w; tx += 80) {
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(tx, fy + 1, 1, 11);
  }
}

/** Doorways between rooms: bevelled pillars, a lintel, and a neon frame in each room's colour. */
function drawDividers(k, out) {
  const c = k.c;
  for (let f = 0; f < FLOORS.length; f++) {
    const rooms = ROOMS.filter((r) => r.floor === f).sort((a, b) => a.x0 - b.x0);
    const fy = FLOORS[f].y;
    const ty = fy - ROOM_HEIGHT;
    for (let i = 1; i < rooms.length; i++) {
      const bx = X(rooms[i].x0);
      const lintel = fy - DOOR_HEIGHT;
      const left = roomInfo(rooms[i - 1].id);
      const right = roomInfo(rooms[i].id);
      const pg = c.createLinearGradient(bx - 12, 0, bx + 12, 0);
      pg.addColorStop(0, '#1b1f29');
      pg.addColorStop(0.5, '#12151d');
      pg.addColorStop(1, '#0b0d12');
      c.fillStyle = pg;
      c.fillRect(bx - 12, ty, 24, lintel - ty);
      c.fillStyle = EDGE;
      c.fillRect(bx - 12, ty, 1.2, lintel - ty);
      c.fillRect(bx + 10.8, ty, 1.2, lintel - ty);
      c.fillRect(bx - 12, lintel - 1, 24, 1.5);
      // jambs, each with a neon line in the colour of the room it faces
      c.fillStyle = '#1e222c';
      c.fillRect(bx - 12, lintel, 4, DOOR_HEIGHT);
      c.fillRect(bx + 8, lintel, 4, DOOR_HEIGHT);
      k.neon(left.color, 10, () => {
        c.fillStyle = left.color;
        c.fillRect(bx - 8.5, lintel + 4, 1.4, DOOR_HEIGHT - 8);
      });
      k.neon(right.color, 10, () => {
        c.fillStyle = right.color;
        c.fillRect(bx + 7.1, lintel + 4, 1.4, DOOR_HEIGHT - 8);
      });
      out.signs.push({ x: bx, y: lintel - 16, left: left.name.toUpperCase(), right: right.name.toUpperCase() });
    }
  }
}

/** Ladders: a hatch with hazard stripes, shaded rails and rungs. */
function drawLadders(k) {
  const c = k.c;
  for (const l of LADDERS) {
    const x = X(l.x);
    const yTop = FLOORS[l.upper].y;
    const yBottom = FLOORS[l.lower].y;
    // the hatch through the slab
    c.fillStyle = '#06070a';
    c.fillRect(x - 24, yTop, 48, SLAB);
    c.save();
    c.beginPath();
    c.rect(x - 26, yTop - 2, 52, 6);
    c.clip();
    for (let s = -30; s < 30; s += 8) {
      c.fillStyle = (s / 8) % 2 ? '#141414' : '#e3b52c';
      c.beginPath();
      c.moveTo(x + s, yTop + 4);
      c.lineTo(x + s + 4, yTop - 2);
      c.lineTo(x + s + 8, yTop - 2);
      c.lineTo(x + s + 4, yTop + 4);
      c.closePath();
      c.fill();
    }
    c.restore();
    k.neon('#ffb04a', 8, () => {
      c.fillStyle = 'rgba(255,192,104,0.8)';
      c.fillRect(x - 26, yTop - 3, 52, 1);
    });
    // rails: a lit edge and a shadow edge
    for (const rx of [x - 16, x + 13.5]) {
      c.fillStyle = 'rgba(233,228,214,0.85)';
      c.fillRect(rx, yTop - 48, 1.5, yBottom - yTop + 48);
      c.fillStyle = 'rgba(120,128,142,0.9)';
      c.fillRect(rx + 1.5, yTop - 48, 1.5, yBottom - yTop + 48);
    }
    for (let y = yBottom - 16; y > yTop - 48; y -= 18) {
      c.fillStyle = 'rgba(233,228,214,0.6)';
      c.fillRect(x - 14, y, 28, 1.5);
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.fillRect(x - 14, y + 1.5, 28, 1);
    }
  }
}

/** Night sky (parallax layer): gradient, stars and a soft moon. */
export function drawSky(scene) {
  if (scene.textures.exists('sky')) return;
  const t = scene.textures.createCanvas('sky', WORLD.width, WORLD.height);
  const c = t.getContext();
  const rng = mulberry32(77);
  const g = c.createLinearGradient(0, 0, 0, FLOORS[GROUND].y);
  g.addColorStop(0, '#03040a');
  g.addColorStop(0.7, '#0a1020');
  g.addColorStop(1, '#131c33');
  c.fillStyle = g;
  c.fillRect(0, 0, WORLD.width, WORLD.height);
  for (let i = 0; i < 140; i++) {
    c.fillStyle = `rgba(233,228,214,${0.15 + rng() * 0.6})`;
    const s = rng() < 0.1 ? 2 : 1.2;
    c.fillRect(rng() * WORLD.width, rng() * 700, s, s);
  }
  const mx = WORLD.width - 360;
  const my = 120;
  const halo = c.createRadialGradient(mx, my, 20, mx, my, 160);
  halo.addColorStop(0, 'rgba(220,230,255,0.25)');
  halo.addColorStop(1, 'rgba(220,230,255,0)');
  c.fillStyle = halo;
  c.fillRect(mx - 160, my - 160, 320, 320);
  c.fillStyle = '#e4e2da';
  c.beginPath();
  c.arc(mx, my, 34, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(10,16,32,0.55)';
  c.beginPath();
  c.arc(mx + 14, my - 6, 32, 0, Math.PI * 2);
  c.fill();
  t.refresh();
}

/** Distant city skyline (parallax layer) with a few lit windows. */
export function drawSkyline(scene) {
  if (scene.textures.exists('skyline')) return;
  const W = WORLD.width;
  const H = 420; // tower bases sit here; below is solid distant ground
  const t = scene.textures.createCanvas('skyline', W, H + 320);
  const c = t.getContext();
  const rng = mulberry32(99);
  c.fillStyle = '#080b14';
  c.fillRect(0, H - 2, W, 322);
  // far hills
  c.fillStyle = '#080b14';
  c.beginPath();
  c.moveTo(0, H);
  for (let x = 0; x <= W; x += 30) c.lineTo(x, H - 120 - Math.sin(x / 260) * 40 - Math.sin(x / 90) * 10);
  c.lineTo(W, H);
  c.fill();
  // towers
  for (let x = 0; x < W;) {
    const bw = 40 + rng() * 90;
    const bh = 90 + rng() * 260;
    c.fillStyle = rng() < 0.5 ? '#0b0f1a' : '#0d1220';
    c.fillRect(x, H - bh, bw, bh);
    c.fillStyle = 'rgba(233,228,214,0.08)';
    c.fillRect(x, H - bh, bw, 1);
    for (let wy = H - bh + 12; wy < H - 10; wy += 14) {
      for (let wx = x + 8; wx < x + bw - 8; wx += 12) {
        if (rng() < 0.12) {
          c.fillStyle = rng() < 0.7 ? 'rgba(255,214,150,0.55)' : 'rgba(140,220,255,0.5)';
          c.fillRect(wx, wy, 4, 5);
        }
      }
    }
    if (rng() < 0.25) {
      c.fillStyle = '#ff3b4a';
      c.fillRect(x + bw / 2 - 1, H - bh - 10, 2, 10);
    }
    x += bw + 6 + rng() * 30;
  }
  t.refresh();
}

/**
 * Draw the whole facility into a canvas texture called `facility` (the sky is
 * left transparent so the parallax layers show through).
 * Returns what the scene needs to light and animate it.
 */
export function drawFacility(scene, res = 1) {
  // 1x: one texture. 2x: tiles of at most 2048 px (sharper when the camera zooms in on desktops).
  for (const key of Object.keys(scene.textures.list)) if (key === 'facility' || key.startsWith('facility-')) scene.textures.remove(key);
  const T = res === 1 ? Math.max(WORLD.width, WORLD.height) : 2048;
  const cols = Math.ceil((WORLD.width * res) / T);
  const rows = Math.ceil((WORLD.height * res) / T);
  let out = null;
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const key = res === 1 ? 'facility' : `facility-${r}-${col}`;
      const tw = Math.min(T, WORLD.width * res - col * T);
      const th = Math.min(T, WORLD.height * res - r * T);
      const tex = scene.textures.createCanvas(key, tw, th);
      const ctx = tex.getContext();
      ctx.translate(-col * T, -r * T);
      ctx.scale(res, res);
      const o = paint(new Ink(ctx, 2031)); // same seed on every tile: identical drawing
      out ??= o;
      tex.refresh();
      tiles.push({ key, x: (col * T) / res, y: (r * T) / res, scale: 1 / res });
    }
  }
  const top = FLOORS[TOP].y - ROOM_HEIGHT - SLAB;
  out.tiles = tiles;
  out.roofSign = { x: X(WIDTH / 2), y: top - 70 };
  out.antenna = { x: X(1900), y: top - 172 };
  out.building = { x: X(-40), y: top - 30, width: WIDTH + 80, height: FLOORS[0].y + SLAB - top + 30 };
  return out;
}

/** Draw the whole building once with pen `k`; returns what the scene needs to light and animate it. */
function paint(k) {
  const out = { lamps: [], glows: [], signs: [], holos: [], leds: [], vents: [], duels: [] };
  drawGround(k);
  drawShell(k);
  for (const room of ROOMS) drawRoom(k, room, out);
  for (const f of FLOORS) drawSlab(k, f.y);
  drawSlab(k, FLOORS[TOP].y - ROOM_HEIGHT - SLAB);
  for (const room of ROOMS) drawFloorFace(k, room);
  drawDividers(k, out);
  drawLadders(k);
  return out;
}
