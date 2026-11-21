// Tiny pixel-drawing toolkit + PNG writer used to generate placeholder art.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname } from 'node:path';

// ---------------------------------------------------------------- PNG writer
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
export function encodePNG(w, h, rgba) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// -------------------------------------------------------------------- colour
export const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));
export const hex = (h, a = 255) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
  a,
];
export const shade = (c, amt) => [clamp8(c[0] + amt), clamp8(c[1] + amt), clamp8(c[2] + amt), c[3]];
export const alpha = (c, a) => [c[0], c[1], c[2], a];
export const mix = (a, b, t) => a.map((v, i) => clamp8(v + (b[i] - v) * t));
export const WHITE = (a = 255) => [255, 255, 255, a];
export const BLACK = (a = 255) => [0, 0, 0, a];

export function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -------------------------------------------------------------------- raster
export class Raster {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = Buffer.alloc(w * h * 4);
  }
  px(x, y, c) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || c[3] <= 0) return;
    const d = this.data;
    const i = (y * this.w + x) * 4;
    const a = c[3] / 255;
    if (a >= 1) {
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
      return;
    }
    const da = d[i + 3] / 255;
    const oa = a + da * (1 - a);
    for (let k = 0; k < 3; k++) d[i + k] = clamp8((c[k] * a + d[i + k] * da * (1 - a)) / oa);
    d[i + 3] = clamp8(oa * 255);
  }
  get(x, y) {
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  rect(x, y, w, h, c) {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.px(x + xx, y + yy, c);
  }
  /** Fill pixels of a w*h box where pred(localX, localY) is true (pixel centres). */
  shape(x, y, w, h, pred, c) {
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) if (pred(xx + 0.5, yy + 0.5)) this.px(x + xx, y + yy, c);
  }
  copy(sx, sy, dx, dy) {
    const s = (sy * this.w + sx) * 4;
    const d = (dy * this.w + dx) * 4;
    this.data.copy(this.data, d, s, s + 4);
  }
  /** Copy a region from another raster (raw, no blending). */
  blit(src, sx, sy, w, h, dx, dy) {
    for (let y = 0; y < h; y++) {
      const s = ((sy + y) * src.w + sx) * 4;
      const d = ((dy + y) * this.w + dx) * 4;
      src.data.copy(this.data, d, s, s + w * 4);
    }
  }
  save(file) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, encodePNG(this.w, this.h, this.data));
  }
}

// ------------------------------------------------------------ shape helpers
export function disc(r, cx, cy, rad, c) {
  const x0 = Math.floor(cx - rad - 1);
  const y0 = Math.floor(cy - rad - 1);
  const s = Math.ceil(rad * 2) + 3;
  r.shape(x0, y0, s, s, (x, y) => (x0 + x - cx) ** 2 + (y0 + y - cy) ** 2 <= rad * rad, c);
}

export function ellipse(r, cx, cy, rx, ry, c) {
  const x0 = Math.floor(cx - rx - 1);
  const y0 = Math.floor(cy - ry - 1);
  r.shape(x0, y0, Math.ceil(rx * 2) + 3, Math.ceil(ry * 2) + 3,
    (x, y) => ((x0 + x - cx) / rx) ** 2 + ((y0 + y - cy) / ry) ** 2 <= 1, c);
}

/** Annulus; colorFn(angle) may return a colour per angle (e.g. hazard stripes). */
export function ring(r, cx, cy, r1, r2, colorFn) {
  const x0 = Math.floor(cx - r2 - 1);
  const y0 = Math.floor(cy - r2 - 1);
  const s = Math.ceil(r2 * 2) + 3;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = x0 + x + 0.5 - cx;
      const dy = y0 + y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r1 * r1 || d2 > r2 * r2) continue;
      const c = typeof colorFn === 'function' ? colorFn(Math.atan2(dy, dx)) : colorFn;
      if (c) r.px(x0 + x, y0 + y, c);
    }
  }
}

export function line(r, x0, y0, x1, y1, c, thick = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    r.rect(x0, y0, thick, thick, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

export function vgrad(r, x, y, w, h, c1, c2) {
  for (let yy = 0; yy < h; yy++) r.rect(x, y + yy, w, 1, mix(c1, c2, h > 1 ? yy / (h - 1) : 0));
}

export function roundRect(r, x, y, w, h, rad, c) {
  r.shape(x, y, w, h, (px, py) => {
    const cx = Math.min(Math.max(px, rad), w - rad);
    const cy = Math.min(Math.max(py, rad), h - rad);
    return (px - cx) ** 2 + (py - cy) ** 2 <= rad * rad;
  }, c);
}

/** Soft drop shadow under an object. */
export function shadow(r, x, y, w, h, a = 80) {
  r.rect(x + 2, y + 3, w, h, BLACK(a));
}

/**
 * 3/4 top-down box: a top face and a front face of `depth` pixels.
 * Colours are hex strings.
 */
export function box3d(r, x, y, w, h, depth, { top, front, outline = '#0b0e13', edge } = {}) {
  const t = hex(top);
  const f = hex(front);
  r.rect(x - 1, y - 1, w + 2, h + 2, hex(outline));
  r.rect(x, y, w, h - depth, t);
  r.rect(x, y, w, 1, edge ? hex(edge) : shade(t, 28));
  r.rect(x, y + 1, 1, h - depth - 1, shade(t, 12));
  vgrad(r, x, y + h - depth, w, depth, f, shade(f, -22));
  r.rect(x, y + h - depth, w, 1, shade(t, -40));
}

/** Diagonal yellow/black hazard stripes in a rectangle. */
export function hazard(r, x, y, w, h, a = 255) {
  const yellow = hex('#d9b526', a);
  const black = hex('#141414', a);
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) r.px(x + xx, y + yy, ((xx + yy) >> 2) & 1 ? yellow : black);
}
