// Outbreak Deck explainer video: draws every frame in code (game's ink & neon look),
// mixes the narration (audio/*.wav from voice.ps1) with a generated music bed, encodes MP4.
//   node render.js            -> out/outbreak-deck-explainer.mp4
//   node render.js --stills   -> out/stills/*.png (one still per scene, for checking)
//   node render.js --v3       -> out/outbreak-deck-v3-whats-new.mp4 (scenes-v3.json: what's new in rules v3.0)
//   node render.js --full     -> out/outbreak-deck-full-guide.mp4 (scenes-full.json: the whole game, rules v3.0)
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(HERE, '..', 'node_modules', '@fontsource', 'rajdhani', 'files');
for (const w of [500, 600, 700]) GlobalFonts.registerFromPath(path.join(FONT_DIR, `rajdhani-latin-${w}-normal.woff2`), 'Rajdhani');

const W = 1920, H = 1080, FPS = 30;
const C = {
  bg: '#0b0c0f', wall: '#22252a', wall2: '#1a1c20', slab: '#111215', ink: '#e9e4d6', dim: '#8f96a3',
  teal: '#2fd2c0', cyan: '#2fd2e0', green: '#3ee67a', gun: '#ff7a3a', cure: '#3e8bff', red: '#ff3b4a',
  gold: '#f0c04a', fill: '#15171c',
};
const VISOR = { p1: '#ff8c2a', teal: '#2fd2c0', pink: '#ff5ca8', yellow: '#f2d14a', blue: '#4dd2ff', purple: '#b06cff', lime: '#9be15d', white: '#e8f4ff' };

const FULL = process.argv.includes('--full'); // the complete v3.0 guide: old scenes show the v3 numbers

// ---------- helpers ----------
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const P = (t, a, b) => clamp((t - a) / (b - a));
const E = (p) => p * p * (3 - 2 * p);
const EO = (p) => 1 - Math.pow(1 - p, 3);
const lerp = (a, b, p) => a + (b - a) * p;
const BACK = (p) => { const c = 1.9; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function glow(ctx, color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
function noGlow(ctx) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }

/** Text with letter spacing. align: left | center | right. Returns width. */
function txt(ctx, s, x, y, { size = 32, weight = 700, color = C.ink, sp = 0, align = 'left', base = 'middle', alpha = 1, g = 0, gc } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px Rajdhani`; ctx.textBaseline = base; ctx.fillStyle = color; ctx.globalAlpha *= alpha;
  if (g) glow(ctx, gc || color, g);
  const chars = [...s]; const ws = chars.map((c) => ctx.measureText(c).width);
  const total = ws.reduce((a, b) => a + b, 0) + sp * Math.max(0, chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += ws[i] + sp; });
  ctx.restore();
  return total;
}
function measure(ctx, s, size, weight = 700, sp = 0) {
  ctx.save(); ctx.font = `${weight} ${size}px Rajdhani`;
  const w = [...s].reduce((a, c) => a + ctx.measureText(c).width, 0) + sp * Math.max(0, [...s].length - 1);
  ctx.restore(); return w;
}

// ---------- props ----------
function survivor(ctx, x, y, o = {}) {
  const s = o.s ?? 1, face = o.face ?? 1, visor = o.visor ?? VISOR.p1;
  const line = o.line ?? C.ink;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= o.alpha ?? 1;
  if (o.lie) ctx.rotate(-face * Math.PI / 2 * o.lie);
  if (o.twitch) ctx.rotate(o.twitch);
  ctx.scale(s * face, s);
  const bob = o.moving ? Math.abs(Math.sin(o.walk ?? 0)) * -3 : Math.sin((o.t ?? 0) * 2) * 1.2;
  ctx.translate(0, bob);
  const sw = o.moving ? Math.sin(o.walk ?? 0) * 0.5 : 0.17;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 3.4; ctx.strokeStyle = line;
  if (o.glow) glow(ctx, o.glow, o.glowBlur ?? 22);
  const leg = (a) => {
    ctx.beginPath(); ctx.moveTo(0, -58); ctx.lineTo(Math.sin(a) * 18, -30); ctx.lineTo(Math.sin(a) * 34, -2);
    ctx.lineTo(Math.sin(a) * 34 + 12, -2); ctx.stroke();
  };
  leg(-sw); leg(sw);
  // backpack
  rr(ctx, -33, -122, 16, 50, 5); ctx.fillStyle = C.fill; ctx.fill(); ctx.stroke();
  // torso
  rr(ctx, -19, -128, 40, 74, 12); ctx.fillStyle = C.fill; ctx.fill();
  if (o.tint) { ctx.fillStyle = hexA(C.green, o.tint); ctx.fill(); }
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-12, -92); ctx.lineTo(14, -92); ctx.globalAlpha *= 0.5; ctx.stroke(); ctx.globalAlpha /= 0.5;
  // arm
  const arm = o.aim ? -1.45 : -sw * 0.8;
  ctx.beginPath(); ctx.moveTo(4, -118); ctx.lineTo(4 + Math.sin(-arm) * 26 + (o.aim ? 4 : 0), -118 + Math.cos(arm) * 30);
  ctx.lineTo(4 + Math.sin(-arm) * 44 + (o.aim ? 8 : 0), -118 + Math.cos(arm) * 50); ctx.stroke();
  if (o.aim) { // little pistol
    ctx.fillStyle = C.gun; ctx.fillRect(48, -128, 22, 7); ctx.fillRect(48, -124, 7, 12);
  }
  // helmet
  ctx.beginPath(); ctx.arc(2, -150, 24, 0, Math.PI * 2); ctx.fillStyle = C.fill; ctx.fill();
  if (o.tint) { ctx.fillStyle = hexA(C.green, o.tint); ctx.fill(); }
  ctx.stroke();
  rr(ctx, 6, -160, 20, 15, 6); ctx.fillStyle = visor; ctx.save(); glow(ctx, visor, 10); ctx.fill(); ctx.restore();
  ctx.restore();
}

function ladder(ctx, x, y1, y2, k = 1, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = C.ink; ctx.lineWidth = 3 * k;
  ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.moveTo(x + 56 * k, y1); ctx.lineTo(x + 56 * k, y2); ctx.stroke();
  ctx.lineWidth = 2.2 * k; ctx.globalAlpha *= 0.8;
  for (let y = y1 + 22 * k; y < y2; y += 26 * k) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 56 * k, y); ctx.stroke(); }
  ctx.restore();
}

function duelTable(ctx, x, floorY, k = 1, t = 0, opts = {}) {
  ctx.save();
  const pulse = 0.75 + 0.25 * Math.sin(t * 2.5);
  // sign
  if (!opts.noSign) {
    ctx.strokeStyle = C.cyan; ctx.lineWidth = 4 * k; glow(ctx, C.cyan, 22 * k * pulse);
    rr(ctx, x - 110 * k, floorY - 250 * k, 220 * k, 42 * k, 3 * k); ctx.fillStyle = 'rgba(47,210,224,0.07)'; ctx.fill(); ctx.stroke();
    noGlow(ctx);
    txt(ctx, 'DUEL', x, floorY - 228 * k, { size: 30 * k, sp: 3 * k, align: 'center', color: '#5fe3ee', g: 10 * k, gc: C.cyan });
  }
  // stem + base
  ctx.strokeStyle = C.ink; ctx.lineWidth = 3 * k;
  ctx.beginPath(); ctx.moveTo(x, floorY - 95 * k); ctx.lineTo(x, floorY); ctx.moveTo(x - 30 * k, floorY); ctx.lineTo(x + 30 * k, floorY); ctx.stroke();
  // top
  ctx.beginPath(); ctx.ellipse(x, floorY - 100 * k, 92 * k, 20 * k, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(47,210,224,0.10)'; ctx.fill();
  ctx.strokeStyle = C.cyan; ctx.lineWidth = 4 * k; glow(ctx, C.cyan, 26 * k * pulse); ctx.stroke(); noGlow(ctx);
  // two tiny cards on the table
  if (!opts.noCards) {
    ctx.fillStyle = 'rgba(200,220,230,0.55)'; ctx.fillRect(x - 46 * k, floorY - 110 * k, 30 * k, 14 * k);
    ctx.fillStyle = 'rgba(47,210,224,0.6)'; ctx.fillRect(x + 12 * k, floorY - 110 * k, 30 * k, 14 * k);
  }
  ctx.restore();
}

function dnaHolo(ctx, cx, cy, r, t, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.strokeStyle = C.teal; ctx.lineWidth = Math.max(2, r * 0.035); glow(ctx, C.teal, r * 0.25);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); noGlow(ctx);
  const hgt = r * 1.5, n = 22;
  for (let i = 0; i <= n; i++) {
    const yy = cy - hgt / 2 + (hgt * i) / n; const ph = i * 0.55 + t * 1.6;
    const x1 = cx + Math.sin(ph) * r * 0.36, x2 = cx - Math.sin(ph) * r * 0.36;
    const z = Math.cos(ph);
    ctx.fillStyle = hexA(C.teal, 0.45 + 0.45 * (z > 0 ? 1 : 0.3));
    ctx.beginPath(); ctx.arc(x1, yy, r * 0.035, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hexA(C.teal, 0.45 + 0.45 * (z < 0 ? 1 : 0.3));
    ctx.beginPath(); ctx.arc(x2, yy, r * 0.035, 0, Math.PI * 2); ctx.fill();
    if (i % 2 === 0) { ctx.strokeStyle = hexA(C.teal, 0.35); ctx.lineWidth = r * 0.015; ctx.beginPath(); ctx.moveTo(x1, yy); ctx.lineTo(x2, yy); ctx.stroke(); }
  }
  ctx.restore();
}

function emergencyButton(ctx, x, floorY, k = 1, t = 0, press = 0) {
  ctx.save();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 3 * k; ctx.fillStyle = C.fill;
  ctx.fillRect(x - 40 * k, floorY - 130 * k, 80 * k, 130 * k); ctx.strokeRect(x - 40 * k, floorY - 130 * k, 80 * k, 130 * k);
  const pulse = 0.7 + 0.3 * Math.sin(t * 4) + press * 1.5;
  ctx.fillStyle = C.red; glow(ctx, C.red, (24 + press * 60) * k * pulse);
  ctx.beginPath(); ctx.arc(x, floorY - 152 * k + press * 6 * k, 27 * k, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function wallScreen(ctx, x, y, w, h, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
  ctx.fillStyle = '#16181c'; ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
  ctx.strokeStyle = C.teal; ctx.lineWidth = 3; glow(ctx, C.teal, 8);
  [0.62, 0.8, 0.5, 0.7].forEach((f, i) => { ctx.beginPath(); ctx.moveTo(x + 16, y + 22 + i * 18); ctx.lineTo(x + 16 + (w - 32) * f, y + 22 + i * 18); ctx.stroke(); });
  ctx.restore();
}

function bench(ctx, x, floorY, w = 210) {
  ctx.save(); ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
  ctx.strokeRect(x, floorY - 62, w, 12); ctx.beginPath(); ctx.moveTo(x + 16, floorY - 50); ctx.lineTo(x + 16, floorY);
  ctx.moveTo(x + w - 16, floorY - 50); ctx.lineTo(x + w - 16, floorY); ctx.stroke(); ctx.restore();
}
function plant(ctx, x, floorY) {
  ctx.save(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
  ctx.strokeRect(x - 20, floorY - 50, 40, 50);
  for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.28; ctx.beginPath(); ctx.moveTo(x, floorY - 50); ctx.lineTo(x + Math.cos(a) * (70 + (i % 3) * 25), floorY - 50 + Math.sin(a) * (70 + (i % 3) * 25)); ctx.stroke(); }
  ctx.restore();
}

/** A room interior: wall, LED strips with light pools, floor line with accent strip. */
function room(ctx, x, y, w, h, o = {}) {
  const k = o.k ?? 1, accent = o.accent ?? C.teal, lit = o.lit ?? 1;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#26292f'); g.addColorStop(1, '#1b1d21');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  // wall panels
  ctx.strokeStyle = 'rgba(233,228,214,0.06)'; ctx.lineWidth = 2 * k;
  for (let px = x + 240 * k; px < x + w; px += 450 * k) { ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + h); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(x, y + h * 0.62); ctx.lineTo(x + w, y + h * 0.62); ctx.stroke();
  // LEDs
  const n = Math.max(1, Math.round(w / (440 * k)));
  for (let i = 0; i < n; i++) {
    const cx = x + (w * (i + 0.5)) / n;
    const pool = ctx.createRadialGradient(cx, y + 20 * k, 4, cx, y + h * 0.4, h * 0.75);
    pool.addColorStop(0, 'rgba(235,240,245,0.10)'); pool.addColorStop(1, 'rgba(235,240,245,0)');
    ctx.fillStyle = pool; ctx.fillRect(cx - h, y, h * 2, h);
    ctx.fillStyle = '#d9dde2'; glow(ctx, '#ffffff', 14 * k); rr(ctx, cx - 85 * k, y + 14 * k, 170 * k, 7 * k, 3 * k); ctx.fill(); noGlow(ctx);
  }
  // floor
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y + h - 4 * k, w, 4 * k);
  ctx.strokeStyle = accent; ctx.lineWidth = 3 * k; glow(ctx, accent, 12 * k); ctx.globalAlpha = 0.75;
  ctx.beginPath(); ctx.moveTo(x, y + h - 6 * k); ctx.lineTo(x + w, y + h - 6 * k); ctx.stroke(); noGlow(ctx); ctx.globalAlpha = 1;
  if (o.label) txt(ctx, o.label, x + 26 * k, y + 52 * k, { size: 30 * k, sp: 7 * k, color: 'rgba(233,228,214,0.18)' });
  if (o.draw) o.draw();
  if (lit < 1) { ctx.fillStyle = `rgba(5,6,8,${(1 - lit) * 0.88})`; ctx.fillRect(x, y, w, h); }
  ctx.restore();
  // outline
  ctx.save(); ctx.strokeStyle = 'rgba(233,228,214,0.55)'; ctx.lineWidth = 2 * k; ctx.strokeRect(x, y, w, h); ctx.restore();
}

// ---------- cards ----------
function clawIcon(ctx, s, col) {
  ctx.save(); ctx.scale(s, s); ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  glow(ctx, col, 16);
  rr(ctx, -34, -2, 68, 52, 18); ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const bx = -26 + i * 17.5; const tx = bx - 6 + i * 2, ty = -52 + Math.abs(i - 1.5) * 8;
    ctx.beginPath(); ctx.moveTo(bx, 0); ctx.quadraticCurveTo(bx - 4, -26, tx, ty); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx - 4, ty + 4); ctx.lineTo(tx - 2, ty - 12); ctx.lineTo(tx + 5, ty + 2); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  }
  ctx.beginPath(); ctx.moveTo(34, 18); ctx.quadraticCurveTo(52, 8, 54, -12); ctx.stroke();
  ctx.restore();
}
function pistolIcon(ctx, s, col, bullets = 2) {
  ctx.save(); ctx.scale(s, s); ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineJoin = 'round'; glow(ctx, col, 16);
  ctx.beginPath(); ctx.moveTo(-52, -34); ctx.lineTo(50, -34); ctx.lineTo(50, -14); ctx.lineTo(-6, -14); ctx.lineTo(-2, 30);
  ctx.lineTo(-30, 30); ctx.lineTo(-36, -14); ctx.lineTo(-52, -14); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.arc(-4, -10, 13, 0.1, Math.PI * 0.9); ctx.stroke();
  noGlow(ctx);
  for (let i = 0; i < 2; i++) {
    rr(ctx, -26 + i * 30, 46, 22, 12, 6);
    if (i < bullets) { ctx.fillStyle = col; glow(ctx, col, 10); ctx.fill(); noGlow(ctx); } else { ctx.lineWidth = 2.5; ctx.stroke(); }
  }
  ctx.restore();
}
function syringeIcon(ctx, s, col) {
  ctx.save(); ctx.scale(s, s); ctx.rotate(-Math.PI / 4); ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round'; glow(ctx, col, 16);
  rr(ctx, -40, -13, 70, 26, 4); ctx.stroke();
  ctx.fillStyle = hexA(col, 0.55); ctx.fillRect(-6, -9, 32, 18);
  ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-62, 0); ctx.moveTo(-62, -14); ctx.lineTo(-62, 14);
  ctx.moveTo(30, 0); ctx.lineTo(66, 0); ctx.stroke();
  ctx.lineWidth = 2.5; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-28 + i * 13, -13); ctx.lineTo(-28 + i * 13, -4); ctx.stroke(); }
  ctx.restore();
}
const CARD_COL = { n: C.cyan, zombie: C.green, gun: C.gun, cure: C.cure };
const CARD_NAME = { zombie: 'ZOMBIE', gun: 'GUN', cure: 'CURE' };
function card(ctx, cx, cy, o = {}) {
  const w = o.w ?? 150, h = o.h ?? 210, kind = o.kind ?? 'n', col = o.color ?? CARD_COL[kind];
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(o.rot ?? 0); ctx.scale(o.sc ?? 1, o.sc ?? 1);
  ctx.globalAlpha *= o.alpha ?? 1;
  let sx = o.flip ?? 1; // horizontal squash for flips (-1..1)
  ctx.scale(Math.max(0.02, Math.abs(sx)), 1);
  const back = o.back || sx < 0;
  rr(ctx, -w / 2, -h / 2, w, h, 14); ctx.fillStyle = '#101318'; ctx.fill();
  ctx.lineWidth = 3.5; ctx.strokeStyle = back ? C.teal : col; glow(ctx, back ? C.teal : col, o.glow ?? 14); ctx.stroke(); noGlow(ctx);
  if (back) {
    ctx.save(); rr(ctx, -w / 2 + 10, -h / 2 + 10, w - 20, h - 20, 9); ctx.clip();
    ctx.strokeStyle = 'rgba(47,210,192,0.18)'; ctx.lineWidth = 2;
    for (let d = -h; d < w + h; d += 16) { ctx.beginPath(); ctx.moveTo(-w / 2 + d, -h / 2); ctx.lineTo(-w / 2 + d - h, h / 2); ctx.stroke(); }
    ctx.restore();
    txt(ctx, 'OD', 0, 2, { size: w * 0.3, sp: 2, align: 'center', color: C.teal, g: 12 });
  } else {
    ctx.strokeStyle = hexA(col, 0.3); ctx.lineWidth = 1.5; rr(ctx, -w / 2 + 9, -h / 2 + 9, w - 18, h - 18, 9); ctx.stroke();
    if (kind === 'n') {
      txt(ctx, String(o.v), 0, 6, { size: h * 0.5, weight: 700, align: 'center', color: o.crack ? C.dim : '#ffffff' });
      txt(ctx, String(o.v), -w / 2 + 18, -h / 2 + 26, { size: h * 0.12, align: 'left', color: col });
    } else {
      const k = w / 150;
      if (kind === 'zombie') { ctx.save(); ctx.translate(0, -2 * k); clawIcon(ctx, 1.0 * k, col); ctx.restore(); }
      if (kind === 'gun') { ctx.save(); ctx.translate(0, -16 * k); pistolIcon(ctx, 0.95 * k, col, o.bullets ?? 2); ctx.restore(); }
      if (kind === 'cure') { ctx.save(); ctx.translate(0, -10 * k); syringeIcon(ctx, 0.95 * k, col); ctx.restore(); }
      txt(ctx, CARD_NAME[kind], 0, h / 2 - 26 * k, { size: 22 * k, sp: 4 * k, align: 'center', color: col });
    }
    if (o.crack) { // broken card
      ctx.strokeStyle = C.red; ctx.lineWidth = 4; glow(ctx, C.red, 10);
      ctx.beginPath(); ctx.moveTo(-w * 0.3, -h / 2); ctx.lineTo(w * 0.05, -h * 0.1); ctx.lineTo(-w * 0.1, h * 0.05); ctx.lineTo(w * 0.25, h / 2); ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------- HUD ----------
function pill(ctx, x, y, text, o = {}) {
  const size = o.size ?? 22, sp = o.sp ?? 4, col = o.color ?? C.ink, pad = size * 0.75;
  const tw = measure(ctx, text, size, 700, sp); const w = tw + pad * 2, h = size * 1.55;
  const left = o.align === 'center' ? x - w / 2 : x;
  ctx.save(); ctx.globalAlpha *= o.alpha ?? 1;
  rr(ctx, left, y - h / 2, w, h, h / 2); ctx.fillStyle = o.fill ?? 'rgba(7,8,12,0.85)'; ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 2.5; if (o.g) glow(ctx, col, o.g); ctx.stroke(); noGlow(ctx);
  txt(ctx, text, left + pad, y + 1, { size, sp, color: o.textColor ?? col });
  ctx.restore();
  return w;
}
function roomChip(ctx, x, y, name, floor, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha;
  rr(ctx, x, y, 270, 64, 8); ctx.fillStyle = 'rgba(7,8,12,0.85)'; ctx.fill(); ctx.strokeStyle = 'rgba(233,228,214,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = C.teal; glow(ctx, C.teal, 8); ctx.beginPath(); ctx.arc(x + 22, y + 22, 6, 0, Math.PI * 2); ctx.fill(); noGlow(ctx);
  txt(ctx, name, x + 40, y + 22, { size: 24, sp: 3 });
  txt(ctx, floor, x + 40, y + 46, { size: 17, sp: 3, weight: 600, color: C.dim });
  ctx.restore();
}
function timerPill(ctx, x, y, text, alpha = 1, col = C.ink) {
  ctx.save(); ctx.globalAlpha *= alpha;
  rr(ctx, x - 90, y - 26, 180, 52, 26); ctx.fillStyle = 'rgba(7,8,12,0.9)'; ctx.fill(); ctx.strokeStyle = 'rgba(233,228,214,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
  txt(ctx, text, x, y + 1, { size: 32, sp: 4, align: 'center', color: col });
  ctx.restore();
}
function minimap(ctx, x, y, t, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha;
  rr(ctx, x, y, 300, 190, 8); ctx.fillStyle = 'rgba(7,8,12,0.85)'; ctx.fill(); ctx.strokeStyle = 'rgba(233,228,214,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
  txt(ctx, 'MAP [M]', x + 8, y + 14, { size: 15, sp: 3, color: C.dim });
  FLOORS.forEach((fl, fi) => {
    let rx = x + 10; const ry = y + 28 + fi * 39;
    fl.forEach((r) => {
      const rw = 280 * r.w; ctx.fillStyle = hexA(r.c, r.name === 'CENTRAL HALL' ? 0.35 : 0.18); ctx.fillRect(rx, ry, rw - 2, 34);
      if (r.name === 'CENTRAL HALL') { ctx.strokeStyle = C.teal; ctx.lineWidth = 2; ctx.strokeRect(rx, ry, rw - 2, 34); }
      rx += rw;
    });
  });
  const R = rng(5);
  for (let i = 0; i < 9; i++) { const fx = x + 14 + ((R() * 270 + t * 18 * (R() - 0.5)) % 270 + 270) % 270; const fy = y + 28 + Math.floor(R() * 4) * 39 + 28; ctx.fillStyle = i === 0 ? C.gold : C.cyan; ctx.beginPath(); ctx.arc(fx, fy, 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
function hand(ctx, cx, baseY, values, o = {}) {
  const n = values.length, spread = o.spread ?? 92;
  txt(ctx, `${n} DUEL CARDS`, cx, baseY - 150, { size: 20, sp: 5, align: 'center', color: C.dim, alpha: o.alpha ?? 1 });
  values.forEach((v, i) => {
    const f = i - (n - 1) / 2;
    card(ctx, cx + f * spread, baseY + Math.abs(f) * 6, { v, rot: f * 0.05, w: 120, h: 170, alpha: o.alpha ?? 1, glow: 8 });
  });
}
function gameHud(ctx, t, o = {}) {
  const a = o.alpha ?? 1;
  roomChip(ctx, 24, 22, o.room ?? 'CENTRAL HALL', o.floor ?? 'FLOOR 2', a);
  pill(ctx, 24, 120, o.role ?? 'HUMAN', { size: 19, sp: 4, alpha: a, color: o.roleColor ?? C.ink });
  pill(ctx, 24, 166, `SCORE ${o.score ?? 35}  ·  SECRET`, { size: 19, sp: 4, color: C.gold, alpha: a });
  timerPill(ctx, W / 2, 46, o.timer ?? '3:40', a, o.timerColor);
  minimap(ctx, W - 330, 22, t, a);
}

// ---------- building (hook + outro) ----------
const FLOORS = [
  [{ name: 'LAB 1', w: 0.22, c: '#4dd2ff' }, { name: 'RESEARCH LAB', w: 0.3, c: '#2fd2e0' }, { name: 'LAB 2', w: 0.22, c: '#4dd2ff' }, { name: 'STORAGE', w: 0.26, c: '#d9a441' }],
  [{ name: 'MEDBAY', w: 0.24, c: '#ff4a5a' }, { name: 'CENTRAL HALL', w: 0.5, c: '#2fd2c0' }, { name: 'CURE LAB', w: 0.26, c: '#3ee6d0' }],
  [{ name: 'ENTRANCE', w: 0.22, c: '#e8f4ff' }, { name: 'LOBBY', w: 0.26, c: '#9ab8d8' }, { name: 'LOCKER ROOM', w: 0.26, c: '#6a9cff' }, { name: 'SUPPLY ROOM', w: 0.26, c: '#f2b84a' }],
  [{ name: 'SERVER ROOM', w: 0.25, c: '#3e8bff' }, { name: 'CAFETERIA', w: 0.25, c: '#b06cff' }, { name: 'REACTOR', w: 0.25, c: '#ff8c2a' }, { name: 'QUARANTINE', w: 0.25, c: '#ff3b4a' }],
];
const SKY = (() => {
  const R = rng(11); const bld = []; let x = -40;
  while (x < W + 40) { const w = 60 + R() * 140; bld.push({ x, w, h: 160 + R() * 380, win: Array.from({ length: 14 }, () => [R(), R(), R() < 0.25]) }); x += w + 6; }
  const rain = Array.from({ length: 260 }, () => ({ x: R() * W, y: R() * H, v: 900 + R() * 600, l: 18 + R() * 22 }));
  return { bld, rain };
})();
function sky(ctx, t, flash = 0) {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#070a12'); g.addColorStop(1, '#10141c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (flash > 0) { ctx.fillStyle = `rgba(170,190,230,${flash * 0.25})`; ctx.fillRect(0, 0, W, H); }
  SKY.bld.forEach((b) => {
    ctx.fillStyle = '#0d1018'; ctx.fillRect(b.x, H - 140 - b.h, b.w, b.h + 140);
    b.win.forEach(([u, v, on]) => { if (on) { ctx.fillStyle = 'rgba(240,192,74,0.25)'; ctx.fillRect(b.x + 8 + u * (b.w - 20), H - 140 - b.h + 12 + v * (b.h - 30), 6, 9); } });
  });
}
function rain(ctx, t, alpha = 1) {
  ctx.save(); ctx.strokeStyle = `rgba(170,190,220,${0.22 * alpha})`; ctx.lineWidth = 1.5;
  SKY.rain.forEach((d) => { const y = (d.y + t * d.v) % (H + 60) - 30; const x = (d.x - t * d.v * 0.12) % W; const xx = x < 0 ? x + W : x; ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx - d.l * 0.12, y + d.l); ctx.stroke(); });
  ctx.restore();
}
function building(ctx, t, o = {}) {
  const bx = 160, bw = 1600, top = 150, fh = 190, slab = 22;
  const lightAt = o.lightAt ?? (() => 1);
  // roof
  ctx.save(); ctx.fillStyle = '#0f1013'; ctx.fillRect(bx - 20, top - 30, bw + 40, 30); ctx.strokeStyle = 'rgba(233,228,214,0.6)'; ctx.lineWidth = 2; ctx.strokeRect(bx - 20, top - 30, bw + 40, 30);
  txt(ctx, 'HELIX RESEARCH FACILITY', bx + bw / 2, top - 15, { size: 20, sp: 8, align: 'center', color: C.teal, g: 10 });
  // earth behind basement
  ctx.fillStyle = '#0a0b0d'; ctx.fillRect(0, top + 3 * (fh + slab) - slab / 2, W, H); ctx.restore();
  ctx.strokeStyle = 'rgba(233,228,214,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, top + 3 * (fh + slab) - slab / 2); ctx.lineTo(W, top + 3 * (fh + slab) - slab / 2); ctx.stroke();
  let idx = 0;
  FLOORS.forEach((fl, fi) => {
    const y = top + fi * (fh + slab); let x = bx;
    ctx.fillStyle = C.slab; ctx.fillRect(bx, y + fh, bw, slab);
    fl.forEach((r) => {
      const w = bw * r.w; const lit = lightAt(idx++, r);
      room(ctx, x, y, w, fh, {
        k: 0.42, accent: r.c, lit, label: r.name,
        draw: () => {
          if (r.name === 'CENTRAL HALL') { dnaHolo(ctx, x + w / 2, y + 85, 52, t); emergencyButton(ctx, x + w / 2, y + fh, 0.42, t); duelTable(ctx, x + w * 0.22, y + fh, 0.42, t); duelTable(ctx, x + w * 0.8, y + fh, 0.42, t); }
          else if (['LOBBY', 'CAFETERIA', 'LAB 2', 'LOCKER ROOM', 'RESEARCH LAB', 'REACTOR', 'SERVER ROOM'].includes(r.name)) duelTable(ctx, x + w * 0.5, y + fh, 0.42, t);
          if (r.name === 'QUARANTINE') { ctx.strokeStyle = hexA(C.red, 0.8); ctx.lineWidth = 2; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(x + 60 + i * 26, y + 40); ctx.lineTo(x + 60 + i * 26, y + fh); ctx.stroke(); } }
          if (r.name === 'REACTOR') { ctx.save(); glow(ctx, '#ff8c2a', 30); ctx.strokeStyle = '#ff8c2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + w * 0.22, y + 110, 40, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
        },
      });
      x += w;
    });
  });
  // ladders
  [[0, 0.21], [0, 0.7], [1, 0.27], [1, 0.88], [2, 0.04], [2, 0.47], [2, 0.95]].forEach(([fi, f]) => {
    const y1 = top + fi * (fh + slab) + 30, y2 = top + (fi + 1) * (fh + slab) + fh; ladder(ctx, bx + bw * f, y1, y2, 0.42, 0.8);
  });
  // little survivors
  (o.people ?? []).forEach((p) => {
    const fl = top + p.f * (fh + slab) + fh - 3; const span = p.b - p.a;
    const ph = (t * p.v / span + p.o) % 2; const forward = ph < 1; const u = forward ? ph : 2 - ph;
    const lit = lightAt(-1, null, p);
    survivor(ctx, bx + bw * (p.a + span * E(u)), fl, { s: 0.42, face: forward ? 1 : -1, moving: true, walk: t * 9 + p.o * 3, visor: p.c, alpha: lit, line: p.z && o.flicker ? C.green : C.ink, glow: p.z && o.flicker ? C.green : null });
  });
}

// ---------- hall close-up (the screenshot's room) ----------
function hall(ctx, t, o = {}) {
  ctx.save();
  ctx.translate(-(o.pan ?? 0), 0);
  ctx.fillStyle = C.bg; ctx.fillRect(-200, 0, W + 600, H);
  // floor above (dim)
  room(ctx, -200, -90, W + 600, 205, { lit: 0.35, accent: C.teal });
  ctx.fillStyle = C.slab; ctx.fillRect(-200, 115, W + 600, 105);
  // main hall
  room(ctx, -200, 220, W + 600, 478, { accent: C.teal, draw: () => {
    txt(ctx, '02  CENTRAL HALL', 255, 285, { size: 34, sp: 9, color: 'rgba(233,228,214,0.16)' });
    ctx.fillStyle = 'rgba(47,210,192,0.9)'; ctx.fillRect(248, 268, 5, 32);
    wallScreen(ctx, 370, 292, 155, 98); wallScreen(ctx, 1690, 292, 155, 98);
    dnaHolo(ctx, 1107, 370, 136, t);
    txt(ctx, 'HELIX RESEARCH', 1107, 542, { size: 30, sp: 4, align: 'center', color: 'rgba(233,228,214,0.45)' });
    plant(ctx, 255, 695); bench(ctx, 312, 695);
    if (!o.noTables) { duelTable(ctx, 835, 695, 1, t, { noCards: o.noCards }); duelTable(ctx, 1572, 695, 1, t, { noCards: o.noCards }); }
    emergencyButton(ctx, 1107, 695, 1, t, o.press ?? 0);
  } });
  ladder(ctx, 612, 20, 695);
  ctx.fillStyle = C.slab; ctx.fillRect(-200, 698, W + 600, 80);
  room(ctx, -200, 778, W + 600, 400, { lit: 0.3, accent: '#6a9cff' });
  ladder(ctx, 1235, 610, 1080);
  ctx.restore();
}

// ---------- overlays ----------
function stamp(ctx, text, x, y, p, col, size = 96, rot = -0.08) {
  if (p <= 0) return;
  const sc = lerp(1.8, 1, EO(clamp(p * 3))); const a = clamp(p * 4);
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc); ctx.globalAlpha *= a;
  const w = measure(ctx, text, size, 700, size * 0.08) + size * 0.8;
  rr(ctx, -w / 2, -size * 0.7, w, size * 1.4, 10); ctx.fillStyle = 'rgba(7,8,12,0.75)'; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = col; glow(ctx, col, 24); ctx.stroke(); noGlow(ctx);
  txt(ctx, text, 0, 4, { size, sp: size * 0.08, align: 'center', color: col, g: 16 });
  ctx.restore();
}
function header(ctx, text, p, col = C.teal, y = 90) {
  if (p <= 0) return;
  const a = E(clamp(p * 2)); const dy = (1 - a) * 20;
  txt(ctx, text, W / 2, y + dy, { size: 58, sp: 12, align: 'center', color: C.ink, alpha: a });
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = col; glow(ctx, col, 14);
  const w = measure(ctx, text, 58, 700, 12); ctx.fillRect(W / 2 - w / 2, y + 40 + dy, w * E(clamp(p * 2 - 0.3)), 4); ctx.restore();
}
function vignette(ctx, red = 0) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, red > 0 ? `rgba(160,0,20,${0.35 + red * 0.4})` : 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function panelBg(ctx, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha;
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 50, W / 2, H * 0.45, W * 0.7); g.addColorStop(0, '#1d2026'); g.addColorStop(1, '#090a0d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(233,228,214,0.045)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.restore();
}
function tableGlow(ctx, cx, cy, rx, ry, a = 1) {
  ctx.save(); ctx.globalAlpha *= a;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(47,210,224,0.06)'; ctx.fill();
  ctx.strokeStyle = C.cyan; ctx.lineWidth = 5; glow(ctx, C.cyan, 40); ctx.stroke(); ctx.restore();
}
function ring(ctx, x, y, r, p, col, lw = 8) {
  ctx.save(); ctx.strokeStyle = 'rgba(233,228,214,0.15)'; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = col; glow(ctx, col, 12); ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); ctx.stroke(); ctx.restore();
}
function button(ctx, x, y, w, h, label, col, o = {}) {
  ctx.save(); ctx.globalAlpha *= o.alpha ?? 1; const sc = o.sc ?? 1; ctx.translate(x, y); ctx.scale(sc, sc);
  rr(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = o.on ? hexA(col, 0.35) : 'rgba(7,8,12,0.85)'; ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 3; glow(ctx, col, o.on ? 30 : 12); ctx.stroke(); noGlow(ctx);
  txt(ctx, label, 0, 2, { size: h * 0.42, sp: 4, align: 'center', color: o.on ? '#fff' : col });
  ctx.restore();
}
function walkX(t, t0, x0, x1, speed) { const d = Math.abs(x1 - x0) / speed; const p = clamp((t - t0) / d); return { x: lerp(x0, x1, p), moving: p > 0 && p < 1, done: p >= 1 }; }

// ---------- scenes ----------
const LEAD = 0.5;
const SCENES = {
  hook(ctx, t, d) {
    if (t < 5.0) {
      const z = 1 + t * 0.012; ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
      hall(ctx, t);
      const a = walkX(t, 0.2, 480, 930, 170);
      survivor(ctx, a.x, 695, { moving: a.moving, walk: t * 9, t, visor: VISOR.p1 });
      const b = walkX(t, 0.8, 2050, 1420, 200);
      const fl = t > 3.3 && t < 3.55;
      survivor(ctx, b.x, 695, { moving: b.moving, walk: t * 9, t, face: -1, visor: VISOR.pink, line: fl ? C.green : C.ink, glow: fl ? C.green : null, tint: fl ? 0.25 : 0 });
      ctx.restore();
      gameHud(ctx, t, { timer: `3:${String(40 - Math.floor(t)).padStart(2, '0')}` });
      hand(ctx, W / 2, 1000, [7, 7, 6, 6, 5, 4]);
      vignette(ctx);
      const f = P(t, 4.6, 5.0); if (f > 0) { ctx.fillStyle = `rgba(0,0,0,${f})`; ctx.fillRect(0, 0, W, H); }
      return;
    }
    const u = t - 5.0; const flash = Math.max(0, 1 - Math.abs(u - 1.6) * 6) + Math.max(0, 1 - Math.abs(u - 1.85) * 8);
    sky(ctx, t, flash); rain(ctx, t, 0.8);
    const z = lerp(1.25, 1, EO(P(u, 0, 2.5)));
    ctx.save(); ctx.translate(W / 2, H / 2 + 40); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
    building(ctx, t, {
      lightAt: (i, r, p) => (p ? 1 : r?.name === 'CENTRAL HALL' ? 1 : 0.25 + 0.75 * E(P(u, 0.3 + i * 0.13, 0.6 + i * 0.13))),
      people: BUILDING_PEOPLE, flicker: (u > 2.8 && u < 3.0) || (u > 4.4 && u < 4.55),
    });
    ctx.restore();
    vignette(ctx);
    const tp = P(t, 9.0, 10.0);
    if (tp > 0) {
      ctx.fillStyle = `rgba(4,5,7,${0.72 * tp})`; ctx.fillRect(0, 0, W, H);
      txt(ctx, 'OUTBREAK DECK', W / 2, H / 2 - 40 + (1 - EO(tp)) * 30, { size: 150, sp: 22, align: 'center', color: '#e9fffb', alpha: tp, g: 40, gc: C.teal });
      txt(ctx, 'TRUST NO ONE.', W / 2, H / 2 + 80, { size: 44, sp: 16, align: 'center', color: C.green, alpha: P(t, 9.8, 10.6), g: 14 });
    }
    const f = P(t, 0, 0) ; void f;
    const fi = 1 - P(u, 0, 0.35); if (fi > 0) { ctx.fillStyle = `rgba(0,0,0,${fi})`; ctx.fillRect(0, 0, W, H); }
  },

  teams(ctx, t) {
    room(ctx, 0, 0, W, 700, { accent: C.teal, label: 'SECRET ROLES' });
    ctx.fillStyle = C.bg; ctx.fillRect(0, 700, W, H);
    header(ctx, 'TWO TEAMS', P(t, 0.2, 1.2), C.teal, 130);
    const xs = [250, 450, 650, 850, 1070, 1270, 1470, 1670]; const zombies = [3, 6];
    const humRev = P(t, 3.2, 3.6), zRev = P(t, 5.6, 6.0), see = P(t, 7.6, 8.3);
    xs.forEach((x, i) => {
      const z = zombies.includes(i); const ap = E(P(t, 0.4 + i * 0.12, 0.8 + i * 0.12));
      const vis = ['p1', 'teal', 'pink', 'yellow', 'blue', 'purple', 'lime', 'white'][i];
      const outl = z && see > 0;
      survivor(ctx, x, 640 + (1 - ap) * 40, { t: t + i, visor: VISOR[vis], face: i < 4 ? 1 : -1, alpha: ap, line: outl ? C.green : C.ink, glow: outl ? C.green : null, glowBlur: 26 * see });
      const rev = z ? zRev : humRev; const label = rev > 0.5 ? (z ? 'ZOMBIE' : 'HUMAN') : '? ? ?';
      const col = rev > 0.5 ? (z ? C.green : C.ink) : C.dim;
      const flipS = Math.abs(Math.cos(rev * Math.PI));
      ctx.save(); ctx.translate(x, 410); ctx.scale(Math.max(0.05, flipS), 1);
      pill(ctx, 0, 0, label, { size: 22, sp: 4, align: 'center', color: col, alpha: ap, g: rev > 0.5 && z ? 14 : 0 });
      ctx.restore();
    });
    if (see > 0) {
      ctx.save(); ctx.strokeStyle = C.green; ctx.lineWidth = 4; ctx.setLineDash([14, 12]); ctx.lineDashOffset = -t * 40; glow(ctx, C.green, 14); ctx.globalAlpha = see;
      ctx.beginPath(); ctx.moveTo(850, 455); ctx.quadraticCurveTo(1160, 330, 1470, 455); ctx.stroke(); ctx.restore();
      txt(ctx, 'ZOMBIES SEE EACH OTHER', 1160, 345, { size: 28, sp: 5, align: 'center', color: C.green, alpha: see, g: 10 });
    }
    // count table
    const tb = P(t, 5.8, 6.6);
    if (tb > 0) {
      const rows = [['6 – 8 PLAYERS', '1 ZOMBIE'], ['9 – 12 PLAYERS', '2 ZOMBIES'], ['13 – 15 PLAYERS', '3 ZOMBIES']];
      rows.forEach(([a, b], i) => {
        const rp = E(P(t, 5.8 + i * 0.25, 6.3 + i * 0.25)); const y = 770 + i * 64;
        ctx.save(); ctx.globalAlpha = rp; rr(ctx, 560, y - 26, 800, 52, 10); ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill(); ctx.strokeStyle = 'rgba(233,228,214,0.18)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
        txt(ctx, a, 600, y, { size: 32, sp: 4, alpha: rp }); txt(ctx, '→', 960, y, { size: 32, align: 'center', color: C.dim, alpha: rp });
        txt(ctx, b, 1320, y, { size: 32, sp: 4, align: 'right', color: C.green, alpha: rp, g: 8 });
      });
    }
    const hs = P(t, 10.3, 10.9);
    if (hs > 0) txt(ctx, 'HUMANS SEE NO ONE', 550, 345, { size: 28, sp: 5, align: 'center', color: C.dim, alpha: hs });
    vignette(ctx);
  },

  challenge(ctx, t) {
    hall(ctx, t, { noCards: true });
    const a = walkX(t, 0.2, 1150, 1330, 150); const goT = 7.2;
    const a2 = walkX(t, goT, 1330, 1450, 120); const b2 = walkX(t, goT, 1460, 1700, 160);
    const ax = t < goT ? a.x : a2.x, bx = t < goT ? 1460 : b2.x;
    const atTable = t > goT + 3.2;
    survivor(ctx, ax, 695, { moving: t < goT ? a.moving : a2.moving, walk: t * 9, t, visor: VISOR.p1, face: 1 });
    survivor(ctx, bx, 695, { moving: t >= goT && b2.moving, walk: t * 9, t, visor: VISOR.pink, face: t >= goT && !b2.done ? 1 : -1 });
    // challenge button (bottom right, like the game)
    const cb = P(t, 1.6, 2.0); const press = t > 2.4 && t < 2.7;
    if (cb > 0 && t < 3.0) {
      ctx.save(); ctx.globalAlpha = cb * (1 - P(t, 2.7, 3.0)); const sc = press ? 0.9 : BACK(cb);
      ctx.translate(1700, 900); ctx.scale(sc, sc);
      ctx.beginPath(); ctx.arc(0, 0, 90, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,59,74,0.25)'; ctx.fill();
      ctx.strokeStyle = C.red; ctx.lineWidth = 5; glow(ctx, C.red, 30); ctx.stroke(); noGlow(ctx);
      txt(ctx, 'CHALLENGE', 0, 2, { size: 30, sp: 3, align: 'center', color: '#fff' });
      const pr = (t * 1.2) % 1; ctx.globalAlpha *= 1 - pr; ctx.strokeStyle = C.red; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 90 + pr * 50, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      txt(ctx, 'PRESS E', 1700, 1020, { size: 22, sp: 5, align: 'center', color: C.dim, alpha: cb });
    }
    // accept / run prompt
    const pp = P(t, 2.7, 3.1), pOut = P(t, 6.9, 7.2);
    if (pp > 0 && pOut < 1) {
      ctx.save(); ctx.globalAlpha = pp * (1 - pOut); const sc = BACK(pp);
      ctx.translate(1440, 330); ctx.scale(sc, sc);
      rr(ctx, -270, -110, 540, 220, 16); ctx.fillStyle = 'rgba(7,8,12,0.92)'; ctx.fill(); ctx.strokeStyle = 'rgba(233,228,214,0.35)'; ctx.lineWidth = 2; ctx.stroke();
      txt(ctx, 'P1 CHALLENGES YOU', 0, -66, { size: 30, sp: 5, align: 'center' });
      const left = 5 - clamp((t - 3.0) / 0.8, 0, 5); // countdown 5 → ~0 over 3.2s visual
      ring(ctx, 0, 20, 34, clamp(left / 5), C.ink, 6); txt(ctx, String(Math.max(1, Math.ceil(left))), 0, 22, { size: 34, align: 'center' });
      const acc = t > 6.2;
      button(ctx, -160, 20, 180, 62, 'ACCEPT', C.teal, { on: acc, sc: acc && t < 6.4 ? 0.92 : 1 });
      button(ctx, 160, 20, 180, 62, 'RUN', C.red, {});
      txt(ctx, 'Y', -160, 75, { size: 18, align: 'center', color: C.dim }); txt(ctx, 'N', 160, 75, { size: 18, align: 'center', color: C.dim });
      ctx.restore();
    }
    // at the table: cards flip
    if (atTable) {
      const fp = P(t, goT + 3.4, goT + 4.0);
      card(ctx, 1525, 562, { v: 7, w: 80, h: 112, flip: lerp(-1, 1, fp) });
      card(ctx, 1619, 562, { v: 4, w: 80, h: 112, flip: lerp(-1, 1, fp) });
      txt(ctx, 'DUEL!', 1572, 395, { size: 44, sp: 8, align: 'center', color: C.cyan, alpha: fp, g: 16 });
    }
    gameHud(ctx, t, { timer: '3:12' });
    vignette(ctx);
  },

  chase(ctx, t) {
    // two floors and a ladder
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    room(ctx, -10, -40, W + 20, 380, { accent: '#6a9cff', label: '' });
    ctx.fillStyle = C.slab; ctx.fillRect(0, 340, W, 60);
    room(ctx, -10, 400, W + 20, 480, { accent: '#9ab8d8', label: 'LOBBY' });
    ctx.fillStyle = C.slab; ctx.fillRect(0, 880, W, 200);
    ladder(ctx, 1500, 150, 878);
    duelTable(ctx, 300, 878, 0.9, t, { noCards: true });
    const take2 = t >= 6.0;
    let rx, ry = 878, cx, rmov, cmov, climbing = false, caught = false, escaped = false, chaseStart, chaseEnd;
    if (!take2) {
      chaseStart = 1.4;
      const tc = 4.05; caught = t >= tc;
      const tt = Math.min(t, tc);
      rx = 800 + Math.max(0, tt - 0.6) * 220; cx = 560 + Math.max(0, tt - 1.4) * 360;
      rmov = t > 0.6 && !caught; cmov = t > 1.4 && !caught; chaseEnd = tc;
    } else {
      const u = t - 6.0; chaseStart = 6.6;
      rx = Math.min(1150 + Math.max(0, u) * 260, 1528); rmov = rx < 1528;
      const climbT = (1528 - 1150) / 260;
      if (u > climbT) { climbing = true; ry = Math.max(330, 878 - (u - climbT) * 420); }
      cx = Math.min(850 + Math.max(0, u - 0.6) * 360, 1440); cmov = u > 0.6 && cx < 1440;
      escaped = ry <= 340; chaseEnd = 6.0 + climbT + (878 - 330) / 420;
    }
    const showChase = t > chaseStart && t < chaseEnd;
    survivor(ctx, cx, 878, { moving: cmov, walk: t * 13, t, visor: VISOR.teal, face: 1 });
    survivor(ctx, rx, ry, { moving: rmov || (climbing && ry > 340), walk: t * 14, t, visor: VISOR.p1, face: climbing && !escaped ? -1 : 1 });
    if (escaped) { txt(ctx, '', 0, 0, {}); }
    // heartbeat
    const hb = showChase ? Math.pow(Math.max(0, Math.sin(t * Math.PI * 2.4)), 6) : 0;
    vignette(ctx, showChase ? 0.3 + hb * 0.7 : 0);
    if (t > chaseStart) {
      const left = Math.max(0, 8 - (Math.min(t, chaseEnd) - chaseStart));
      pill(ctx, W / 2, 100, `CHASE  ${left.toFixed(1)}s`, { size: 34, sp: 6, align: 'center', color: C.red, g: 18 });
    }
    if (!take2) {
      stamp(ctx, 'RUN!', 800, 560, P(t, 0.5, 1.0) * (1 - P(t, 1.3, 1.5)), C.red, 70);
      stamp(ctx, 'TOUCHED: DUEL FORCED', W / 2, 500, P(t, 4.1, 4.6), C.red, 80);
      const fx = Math.max(0, 1 - (t - 4.05) * 4); if (t > 4.05 && fx > 0) { ctx.fillStyle = `rgba(255,255,255,${fx * 0.3})`; ctx.fillRect(0, 0, W, H); }
    } else {
      stamp(ctx, 'OR CLIMB A LADDER', W / 2, 560, P(t, 6.1, 6.5) * (1 - P(t, 7.2, 7.5)), C.teal, 64, 0);
      stamp(ctx, 'ESCAPED', 1200, 200, P(t, chaseEnd + 0.1, chaseEnd + 0.6), C.teal, 80);
    }
    const fd = P(t, 5.6, 6.0) * (1 - P(t, 6.0, 6.3)); if (fd > 0) { ctx.fillStyle = `rgba(0,0,0,${fd})`; ctx.fillRect(0, 0, W, H); }
  },

  numbers(ctx, t) {
    panelBg(ctx);
    header(ctx, '1 – 9   NUMBER CARDS', P(t, 0.2, 1.2), C.cyan, 110);
    const row = 1 - P(t, 3.6, 4.1);
    if (row > 0) for (let v = 1; v <= 9; v++) {
      const ap = E(P(t, 0.6 + v * 0.18, 0.9 + v * 0.18));
      card(ctx, 960 + (v - 5) * 170, 460 + (1 - ap) * 60, { v, w: 140, h: 196, alpha: ap * row, glow: 6 + v * 2 });
    }
    if (row > 0 && t > 2.3) txt(ctx, 'HIGHER NUMBER WINS', 960, 650, { size: 40, sp: 8, align: 'center', color: C.cyan, alpha: P(t, 2.3, 2.8) * row });
    const duel = P(t, 4.0, 4.6);
    if (duel > 0) {
      tableGlow(ctx, 960, 640, 620, 150, duel);
      const win = t > 8.0; const take = E(P(t, 8.2, 9.2));
      card(ctx, lerp(760, 760, 0), 560 - (1 - EO(duel)) * 200, { v: 7, w: 170, h: 238, alpha: duel, glow: win ? 30 : 14 });
      const fp = P(t, 5.8, 6.3);
      card(ctx, lerp(1160, 800, take), lerp(560 - (1 - EO(duel)) * 200, 830, take), { v: 4, w: 170, h: 238, alpha: duel * (1 - P(t, 9.6, 10.0)), flip: lerp(-1, 1, fp), rot: take * -0.3, sc: lerp(1, 0.6, take) });
      txt(ctx, 'YOU', 760, 380, { size: 26, sp: 6, align: 'center', color: C.dim, alpha: duel });
      txt(ctx, 'OPPONENT', 1160, 380, { size: 26, sp: 6, align: 'center', color: C.dim, alpha: duel * (1 - take) });
      stamp(ctx, '7 BEATS 4', 960, 270, P(t, 6.6, 7.1), C.cyan, 70, 0);
      if (t > 8.2) txt(ctx, 'WINNER TAKES THE LOSER\'S CARD', 960, 900, { size: 38, sp: 6, align: 'center', color: C.ink, alpha: P(t, 8.2, 8.8) });
    }
    vignette(ctx);
  },

  zombie(ctx, t) {
    panelBg(ctx);
    ctx.save(); ctx.globalAlpha = 0.06 + 0.04 * Math.sin(t * 3); ctx.fillStyle = C.green; ctx.fillRect(0, 0, W, H); ctx.restore();
    header(ctx, 'THE ZOMBIE CARD', P(t, 0.2, 1.2), C.green, 110);
    const intro = EO(P(t, 0.3, 1.1)); const mv = E(P(t, 3.6, 4.4));
    const used = P(t, 9.8, 10.4);
    const zx = lerp(960, 640, mv), zy = lerp(520, 520, mv), zs = lerp(1.45, 1, mv);
    card(ctx, zx, zy + (1 - intro) * 80, { kind: 'zombie', sc: zs, alpha: intro * (1 - used), glow: 28 + 10 * Math.sin(t * 4) });
    if (mv < 0.5 && t > 1.6) txt(ctx, 'ZOMBIES ONLY  ·  ONE AT A TIME', 960, 800, { size: 34, sp: 6, align: 'center', color: C.green, alpha: P(t, 1.6, 2.1) * (1 - mv * 2) });
    if (mv > 0) {
      const hit = t > 5.0;
      card(ctx, 1280, 520, { v: 9, alpha: mv * (1 - used * 0.6), crack: hit, sc: 1 });
      txt(ctx, 'VS', 960, 520, { size: 60, align: 'center', color: C.dim, alpha: mv * (1 - used) });
      if (hit) { const fl = Math.max(0, 1 - (t - 5.0) * 3); ctx.fillStyle = `rgba(62,230,122,${fl * 0.35})`; ctx.fillRect(0, 0, W, H); }
      stamp(ctx, 'BEATS EVEN A 9', 960, 280, P(t, 5.1, 5.5) * (1 - used), C.green, 64, 0);
      // human pill flips
      const fp = P(t, 7.0, 7.5); const z = fp > 0.5; const s = Math.abs(Math.cos(fp * Math.PI));
      ctx.save(); ctx.translate(1280, 720); ctx.scale(Math.max(0.05, s), 1);
      pill(ctx, 0, 0, z ? 'ZOMBIE' : 'HUMAN', { size: 30, sp: 6, align: 'center', color: z ? C.green : C.ink, g: z ? 20 : 0, alpha: mv });
      ctx.restore();
      if (t > 7.6) txt(ctx, 'BITTEN: TURNS AT ONCE', 1280, 800, { size: 32, sp: 5, align: 'center', color: C.green, alpha: P(t, 7.6, 8.1) * (1 - used) });
    }
    if (used > 0) {
      const rp = clamp((t - 10.4) / 4.5);
      ring(ctx, 640, 520, 110, rp, C.green, 10);
      txt(ctx, `${Math.ceil((FULL ? 65 : 75) * (1 - rp))}s`, 640, 512, { size: 64, align: 'center', color: C.green, alpha: used, g: 14 });
      txt(ctx, 'NEW CARD GROWS', 640, 690, { size: 30, sp: 5, align: 'center', alpha: used });
      txt(ctx, FULL ? 'ABOUT A MINUTE  (45s – 95s BY LOBBY)' : '75s  + 20s PER OTHER ZOMBIE', 640, 735, { size: 26, sp: 4, align: 'center', color: C.dim, alpha: used });
      if (rp >= 1) card(ctx, 640, 520, { kind: 'zombie', sc: 0.6, alpha: P(t, 14.9, 15.2), glow: 30 });
    }
    vignette(ctx);
  },

  gun(ctx, t) {
    hall(ctx, t, { pan: 0 });
    const shot = 4.6; const fallP = E(P(t, shot + 0.05, shot + 0.6)); const stun = !FULL && t > 10.2;
    survivor(ctx, 1330, 695, { t, visor: VISOR.p1, aim: t > 3.6, face: 1, alpha: stun ? 0.75 + 0.25 * Math.sin(t * 10) : 1 });
    survivor(ctx, 1650, 695, { t, visor: VISOR.blue, face: -1, lie: fallP, alpha: 1 - fallP * 0.35 });
    if (t > shot && t < shot + 0.18) {
      ctx.save(); ctx.fillStyle = '#fff6d0'; glow(ctx, C.gun, 50); ctx.beginPath(); ctx.arc(1405, 570, 26, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd9a0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(1420, 570); ctx.lineTo(1635, 560); ctx.stroke(); ctx.restore();
      ctx.fillStyle = 'rgba(255,200,150,0.18)'; ctx.fillRect(0, 0, W, H);
    }
    // card panel
    const cp = EO(P(t, 0.3, 1.0));
    ctx.save(); ctx.globalAlpha = cp; rr(ctx, 60, 250, 400, 520, 18); ctx.fillStyle = 'rgba(7,8,12,0.88)'; ctx.fill(); ctx.strokeStyle = hexA(C.gun, 0.5); ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    card(ctx, 260, 470 + (1 - cp) * 60, { kind: 'gun', sc: 1.35, alpha: cp, bullets: t > shot ? 1 : 2, glow: 22 });
    txt(ctx, 'HUMANS ONLY', 260, 680, { size: 28, sp: 5, align: 'center', color: C.gun, alpha: cp });
    txt(ctx, '2 BULLETS', 260, 724, { size: 26, sp: 5, align: 'center', color: C.dim, alpha: cp });
    if (t > shot + 0.8) { const kp = P(t, shot + 0.8, shot + 1.3); ctx.save(); ctx.globalAlpha = kp; rr(ctx, 900, 730, 1000, 70, 12); ctx.fillStyle = 'rgba(7,8,12,0.9)'; ctx.fill(); ctx.restore(); } if (t > shot + 0.8) txt(ctx, 'KILLS ANYONE: HUMAN OR ZOMBIE', 1400, 766, { size: 34, sp: 5, align: 'center', color: C.gun, alpha: P(t, shot + 0.8, shot + 1.3) });
    // announcement banner
    const bp = P(t, 8.2, 8.7);
    if (bp > 0) {
      ctx.save(); ctx.globalAlpha = bp; ctx.translate(0, (1 - EO(bp)) * -40);
      rr(ctx, W / 2 - 330, 110, 660, 110, 14); ctx.fillStyle = 'rgba(7,8,12,0.92)'; ctx.fill(); ctx.strokeStyle = C.gun; ctx.lineWidth = 3; glow(ctx, C.gun, 18); ctx.stroke(); noGlow(ctx);
      txt(ctx, 'P1 SHOT P4', W / 2, 150, { size: 44, sp: 8, align: 'center', color: '#fff' });
      txt(ctx, 'ROLE: ? ? ?', W / 2, 195, { size: 26, sp: 6, align: 'center', color: C.dim });
      ctx.restore();
    }
    if (stun) {
      const sp2 = P(t, 10.2, 10.6);
      ctx.save(); ctx.globalAlpha = sp2; ctx.strokeStyle = C.gold; ctx.lineWidth = 3; glow(ctx, C.gold, 10);
      for (let i = 0; i < 3; i++) { const a = t * 3 + i * 2.1; ctx.beginPath(); ctx.arc(1330 + Math.cos(a) * 40, 505 + Math.sin(a) * 10, 6, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
      pill(ctx, 1330, 465, `STUNNED ${Math.max(1, 8 - Math.floor((t - 10.2) * 1.5))}s`, { size: 24, sp: 4, align: 'center', color: C.gold, alpha: sp2 });
    }
    vignette(ctx);
  },

  cure(ctx, t) {
    panelBg(ctx);
    header(ctx, 'THE CURE', P(t, 0.2, 1.0), C.cure, 110);
    const partA = 1 - P(t, 8.0, 8.4), partB = P(t, 8.4, 8.8) * (1 - P(t, 11.0, 11.4)), partC = P(t, 11.4, 11.8);
    if (partA > 0) {
      ctx.save(); ctx.globalAlpha = partA;
      const cp = EO(P(t, 0.3, 1.0));
      card(ctx, 420, 500 + (1 - cp) * 60, { kind: 'cure', sc: 1.25, alpha: cp, glow: 24 });
      txt(ctx, 'HUMANS ONLY', 420, 700, { size: 28, sp: 5, align: 'center', color: C.cure, alpha: cp });
      const zp = P(t, 1.6, 2.1); const cured = P(t, 3.0, 3.6);
      const zLine = cured < 1 ? C.green : C.ink;
      const inCell = P(t, 5.2, 5.8);
      survivor(ctx, 1380, 720, { t, s: 1.4, visor: VISOR.purple, face: -1, alpha: zp, line: cured > 0.5 ? C.ink : C.green, glow: cured > 0.5 ? null : C.green, tint: (1 - cured) * 0.15 });
      void zLine;
      if (t > 2.4 && t < 3.4) { // beam
        const bp = P(t, 2.4, 3.0);
        ctx.save(); ctx.strokeStyle = C.cure; ctx.lineWidth = 8; glow(ctx, C.cure, 30); ctx.globalAlpha *= 1 - P(t, 3.0, 3.4);
        ctx.beginPath(); ctx.moveTo(520, 480); ctx.lineTo(lerp(520, 1360, bp), lerp(480, 560, bp)); ctx.stroke(); ctx.restore();
      }
      const fp = P(t, 3.2, 3.7); const s = Math.abs(Math.cos(fp * Math.PI)); const h = fp > 0.5;
      ctx.save(); ctx.translate(1380, 440); ctx.scale(Math.max(0.05, s), 1);
      pill(ctx, 0, 0, h ? 'HUMAN' : 'ZOMBIE', { size: 30, sp: 6, align: 'center', color: h ? C.ink : C.green, alpha: zp, g: h ? 0 : 18 }); ctx.restore();
      if (t > 3.8) stamp(ctx, 'CURED', 1380, 300, P(t, 3.8, 4.2), C.cure, 64, 0);
      if (inCell > 0) {
        // cure user to the cell
        ctx.save(); ctx.globalAlpha *= inCell;
        rr(ctx, 230, 310, 380, 470, 12); ctx.fillStyle = 'rgba(20,6,8,0.92)'; ctx.fill(); ctx.strokeStyle = C.red; ctx.lineWidth = 3; glow(ctx, C.red, 20); ctx.stroke(); noGlow(ctx);
        survivor(ctx, 420, 740, { t, s: 1.3, visor: VISOR.p1 });
        ctx.strokeStyle = hexA(C.red, 0.9); ctx.lineWidth = 6;
        for (let i = 0; i < 7; i++) { const x = 260 + i * 53; ctx.beginPath(); ctx.moveTo(x, 330); ctx.lineTo(x, lerp(330, 770, EO(inCell))); ctx.stroke(); }
        ctx.restore();
        txt(ctx, `QUARANTINE  ${(FULL ? 30 : 60) - Math.floor(Math.max(0, t - 5.8) * (FULL ? 2 : 4))}s`, 420, 830, { size: 32, sp: 5, align: 'center', color: C.red, alpha: inCell, g: 12 });
        txt(ctx, 'THE CURE USER: FROZEN AND GAGGED', 420, 875, { size: 22, sp: 4, align: 'center', color: C.dim, alpha: inCell });
      }
      ctx.restore();
    }
    if (partB > 0) {
      ctx.save(); ctx.globalAlpha = partB;
      card(ctx, 700, 520, { kind: 'cure', sc: 1.1, crack: t > 9.5 });
      txt(ctx, 'VS', 960, 520, { size: 60, align: 'center', color: C.dim });
      survivor(ctx, 1240, 700, { t, s: 1.3, visor: VISOR.yellow, face: -1 });
      pill(ctx, 1240, 420, 'HUMAN', { size: 30, sp: 6, align: 'center' });
      ctx.restore();
      stamp(ctx, 'WASTED', 960, 830, P(t, 9.5, 9.9) * partB, C.dim, 80);
    }
    if (partC > 0) {
      ctx.save(); ctx.globalAlpha = partC;
      survivor(ctx, 960, 760, { t, s: 1.6, visor: VISOR.p1 });
      card(ctx, 1180, 560, { kind: 'cure', sc: 0.8, rot: 0.15 });
      ctx.strokeStyle = C.red; ctx.lineWidth = 10; glow(ctx, C.red, 20); ctx.beginPath(); ctx.arc(960, 560, 260, 0, Math.PI * 2); ctx.moveTo(960 - 184, 560 - 184); ctx.lineTo(960 + 184, 560 + 184); ctx.globalAlpha *= 0.85; ctx.stroke();
      ctx.restore();
      txt(ctx, 'HOLDING A CURE DOES NOT PROTECT YOU', 960, 880, { size: 40, sp: 5, align: 'center', alpha: partC });
      txt(ctx, 'YOU CAN\'T CURE YOURSELF', 960, 930, { size: 30, sp: 5, align: 'center', color: C.cure, alpha: P(t, 12.4, 12.9) });
    }
    vignette(ctx);
  },

  hunger(ctx, t) {
    const split = P(t, 9.2, 9.7);
    if (split < 1) {
      ctx.save(); ctx.globalAlpha = 1 - split;
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      room(ctx, -10, 120, W + 20, 640, { accent: '#b06cff', label: 'CAFETERIA' });
      ctx.fillStyle = C.slab; ctx.fillRect(0, 760, W, H);
      duelTable(ctx, 1500, 754, 1, t, { noCards: true });
      const x = 500 + ((t * 120) % 900);
      const hp = clamp(1 - (t - 0.4) / 5); const starving = hp <= 0;
      const flare = starving ? Math.max(0, 1 - Math.abs(((t - 5.6) % 2.2) - 0.4) * 3) : 0;
      if (flare > 0) { const g = ctx.createRadialGradient(x, 640, 10, x, 640, 330); g.addColorStop(0, hexA(C.green, 0.55 * flare)); g.addColorStop(1, hexA(C.green, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
      survivor(ctx, x, 754, { s: 1.3, moving: true, walk: t * 7, t, visor: VISOR.purple, line: flare > 0.3 ? C.green : C.ink, glow: flare > 0.3 ? C.green : null, glowBlur: 40 * flare });
      // hunger bar
      // the claw in hand: hunger only runs while the zombie holds its Zombie card
      card(ctx, W / 2 - 390, 273, { kind: 'zombie', sc: 0.42, glow: 18 + 8 * Math.sin(t * 4) });
      txt(ctx, starving ? 'STARVING' : 'CLAW IN HAND', W / 2, 230, { size: 36, sp: 10, align: 'center', color: starving ? (Math.sin(t * 10) > 0 ? C.green : C.red) : C.ink, g: starving ? 14 : 0 });
      rr(ctx, W / 2 - 300, 260, 600, 26, 13); ctx.strokeStyle = 'rgba(233,228,214,0.4)'; ctx.lineWidth = 2; ctx.stroke();
      if (hp > 0) { rr(ctx, W / 2 - 296, 264, 592 * hp, 18, 9); ctx.fillStyle = hp > 0.35 ? C.green : C.red; glow(ctx, ctx.fillStyle, 12); ctx.fill(); noGlow(ctx); }
      txt(ctx, `${Math.ceil(hp * 20)}s`, W / 2 + 330, 273, { size: 28, color: C.dim });
      if (starving) stamp(ctx, 'GRRRR...', 1350, 450, P(t, 6.0, 6.4), C.green, 70, 0.06);
      txt(ctx, 'USE IT WITHIN 20s  ·  NO CARD = NO HUNGER', W / 2, 330, { size: 26, sp: 5, align: 'center', color: C.dim });
      ctx.restore();
    }
    if (split > 0) {
      ctx.save(); ctx.globalAlpha = split;
      panelBg(ctx);
      header(ctx, 'SPOT THE SIGNS', P(t, 9.5, 10.3), C.green, 110);
      const labels = ['FAINT GREEN FLICKER', 'TWITCHES', 'GLOWING FOOTPRINTS'];
      [0, 1, 2].forEach((i) => {
        const ap = E(P(t, 9.8 + i * 0.9, 10.3 + i * 0.9)); const cx = 380 + i * 580;
        ctx.save(); ctx.globalAlpha *= ap;
        rr(ctx, cx - 260, 220, 520, 620, 16); ctx.fillStyle = 'rgba(7,8,12,0.7)'; ctx.fill(); ctx.strokeStyle = hexA(C.green, 0.4); ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = 'rgba(233,228,214,0.4)'; ctx.beginPath(); ctx.moveTo(cx - 230, 720); ctx.lineTo(cx + 230, 720); ctx.stroke();
        if (i === 0) { const fl = Math.sin(t * 2.3) > 0.93; survivor(ctx, cx, 720, { s: 1.5, t, visor: VISOR.blue, tint: fl ? 0.4 : 0.07, line: fl ? C.green : C.ink, glow: fl ? C.green : null }); }
        if (i === 1) { const tw = Math.sin(t * 1.7) > 0.8 ? Math.sin(t * 60) * 0.06 : 0; survivor(ctx, cx, 720, { s: 1.5, t, visor: VISOR.pink, twitch: tw }); }
        if (i === 2) {
          const x = cx - 180 + ((t * 90) % 360);
          for (let j = 0; j < 8; j++) { const fx = x - 30 - j * 40; if (fx < cx - 240) break; ctx.save(); ctx.fillStyle = hexA(C.green, 0.6 * (1 - j / 8)); glow(ctx, C.green, 10); ctx.beginPath(); ctx.ellipse(fx, 716 - (j % 2) * 6, 10, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
          survivor(ctx, x, 720, { s: 1.5, moving: true, walk: t * 8, t, visor: VISOR.yellow });
        }
        txt(ctx, labels[i], cx, 790, { size: 30, sp: 5, align: 'center', color: C.green });
        ctx.restore();
      });
    }
    vignette(ctx);
  },

  meeting(ctx, t) {
    const ov = P(t, 5.2, 5.7);
    if (ov < 1) {
      const press = t > 2.9 && t < 3.3 ? 1 : 0;
      hall(ctx, t, { press });
      const a = walkX(t, 0.2, 640, 1060, 180);
      survivor(ctx, a.x, 695, { moving: a.moving, walk: t * 9, t, visor: VISOR.p1, aim: false });
      const paused = t > 4.5;
      gameHud(ctx, t, { timer: paused ? '❚❚ 3:02' : '3:02', timerColor: paused ? C.red : C.ink });
      if (t > 3.0) {
        const fl = (Math.sin((t - 3) * 9) + 1) / 2; ctx.fillStyle = `rgba(255,40,60,${0.12 + 0.12 * fl})`; ctx.fillRect(0, 0, W, H);
        stamp(ctx, 'EMERGENCY MEETING', W / 2, 820, P(t, 3.0, 3.5), C.red, 76, 0);
      }
      if (paused) txt(ctx, 'CLOCK PAUSED', W / 2, 105, { size: 24, sp: 6, align: 'center', color: C.red, alpha: P(t, 4.5, 4.9) });
      vignette(ctx);
    }
    if (ov > 0) {
      ctx.save(); ctx.globalAlpha = ov;
      panelBg(ctx);
      const vote = t > 8.2;
      // phase bar
      const phase = vote ? 'VOTE' : 'DISCUSS'; const total = vote ? 15 : 30; const el = vote ? (t - 8.2) * 3 : (t - 5.5) * 9;
      txt(ctx, phase, 160, 90, { size: 52, sp: 12, color: vote ? C.gold : C.teal });
      txt(ctx, `${Math.max(0, Math.ceil(total - el))}s`, 1760, 90, { size: 52, align: 'right', color: C.ink });
      rr(ctx, 160, 130, 1600, 10, 5); ctx.fillStyle = 'rgba(233,228,214,0.12)'; ctx.fill();
      rr(ctx, 160, 130, 1600 * clamp(1 - el / total), 10, 5); ctx.fillStyle = vote ? C.gold : C.teal; ctx.fill();
      const vis = ['p1', 'teal', 'pink', 'yellow', 'blue', 'purple', 'lime', 'white'];
      const votes = [0, 0, 1, 0, 0, 3, 0, 0];
      const out = t > 10.2;
      vis.forEach((v, i) => {
        const col = i % 4, rowI = Math.floor(i / 4); const x = 160 + col * 300, y = 200 + rowI * 250;
        const ap = E(P(t, 5.5 + i * 0.06, 5.9 + i * 0.06));
        const target = i === 5;
        ctx.save(); ctx.globalAlpha *= ap;
        rr(ctx, x, y, 270, 220, 14); ctx.fillStyle = target && out ? 'rgba(80,10,20,0.85)' : 'rgba(7,8,12,0.85)'; ctx.fill();
        ctx.strokeStyle = target && out ? C.red : 'rgba(233,228,214,0.3)'; ctx.lineWidth = target && out ? 4 : 2; if (target && out) glow(ctx, C.red, 20); ctx.stroke(); noGlow(ctx);
        survivor(ctx, x + 135, y + 170, { s: 0.8, t: t + i, visor: VISOR[v] });
        txt(ctx, `P${i + 1}`, x + 20, y + 30, { size: 30, sp: 3 });
        if (vote) { const n = Math.min(votes[i], Math.floor((t - 8.6) * 2.2)); for (let k = 0; k < n; k++) { ctx.fillStyle = C.gold; glow(ctx, C.gold, 10); ctx.beginPath(); ctx.arc(x + 240 - k * 26, y + 30, 9, 0, Math.PI * 2); ctx.fill(); noGlow(ctx); } }
        if (target && out) { txt(ctx, 'QUARANTINED', x + 135, y + 200, { size: 26, sp: 4, align: 'center', color: C.red }); txt(ctx, '?', x + 225, y + 80, { size: 60, align: 'center', color: C.dim }); }
        ctx.restore();
      });
      // chat log
      rr(ctx, 1380, 200, 380, 470, 14); ctx.fillStyle = 'rgba(7,8,12,0.85)'; ctx.fill(); ctx.strokeStyle = 'rgba(233,228,214,0.3)'; ctx.lineWidth = 2; ctx.stroke();
      txt(ctx, 'CHAT', 1404, 232, { size: 24, sp: 6, color: C.dim });
      const msgs = [['P3', 'ACCUSE P6', C.red], ['P6', 'I\'M CLEAN', C.teal], ['P2', 'VOUCH P6', C.teal], ['P5', 'SKIP', C.dim], ['P7', 'ACCUSE P6', C.red]];
      msgs.forEach(([who, m, col], i) => {
        const mp = P(t, 6.0 + i * 0.45, 6.3 + i * 0.45); if (mp <= 0) return;
        const y = 290 + i * 70; const lie = i === 1 && t > 13.3;
        ctx.save(); ctx.globalAlpha *= mp; rr(ctx, 1400, y - 26, 340, 54, 10); ctx.fillStyle = lie ? 'rgba(62,230,122,0.15)' : 'rgba(255,255,255,0.04)'; ctx.fill();
        if (lie) { ctx.strokeStyle = C.green; ctx.lineWidth = 3; glow(ctx, C.green, 14); ctx.stroke(); noGlow(ctx); }
        txt(ctx, who, 1420, y, { size: 26, color: C.dim }); txt(ctx, m, 1480, y, { size: 28, sp: 3, color: col }); ctx.restore();
      });
      if (t > 13.3) stamp(ctx, 'A LIE?', 1560, 420, P(t, 13.3, 13.7), C.green, 48, 0.1);
      // quick chat buttons
      ['ACCUSE', 'VOUCH', 'I\'M CLEAN', 'SKIP'].forEach((b, i) => button(ctx, 300 + i * 290, 760, 250, 64, b, [C.red, C.teal, C.ink, C.dim][i], { alpha: vote ? 0.3 : 1 }));
      if (vote) button(ctx, 1570, 760, 300, 64, 'VOTE P6', C.gold, { on: t > 8.8 && t < 9.1 });
      if (out) txt(ctx, 'MOST VOTES → QUARANTINE CELL. ROLE STAYS SECRET.', W / 2, 870, { size: 34, sp: 4, align: 'center', color: C.ink, alpha: P(t, 10.2, 10.7) });
      ctx.restore();
    }
  },

  win(ctx, t) {
    panelBg(ctx);
    header(ctx, 'HOW TO WIN', P(t, 0.1, 0.9), C.teal, 100);
    const cols = [
      { x: 330, t0: 0.4, title: 'HUMANS WIN', col: C.teal, sub: FULL ? ['EVERY ZOMBIE GONE,', 'OR ESCAPE IN THE EVAC'] : ['EVERY ZOMBIE IS', 'SHOT · VOTED OUT · CURED'] },
      { x: 960, t0: FULL ? 5.4 : 3.6, title: 'ZOMBIES WIN', col: C.green, sub: ['NO HUMAN', 'IS LEFT'] },
      { x: 1590, t0: FULL ? 8.6 : 7.0, title: 'TIME UP  0:00', col: C.gold, sub: ['THE BIGGER', 'TEAM WINS'] },
    ];
    cols.forEach((c, i) => {
      const ap = E(P(t, c.t0, c.t0 + 0.6)); if (ap <= 0) return;
      ctx.save(); ctx.globalAlpha = ap; ctx.translate(0, (1 - ap) * 40);
      rr(ctx, c.x - 280, 190, 560, 700, 18); ctx.fillStyle = 'rgba(7,8,12,0.8)'; ctx.fill(); ctx.strokeStyle = hexA(c.col, 0.6); ctx.lineWidth = 2.5; glow(ctx, c.col, 14); ctx.stroke(); noGlow(ctx);
      txt(ctx, c.title, c.x, 250, { size: 44, sp: 8, align: 'center', color: c.col, g: 12 });
      ctx.strokeStyle = 'rgba(233,228,214,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(c.x - 230, 600); ctx.lineTo(c.x + 230, 600); ctx.stroke();
      if (i === 0) ['p1', 'teal', 'yellow', 'blue'].forEach((v, k) => survivor(ctx, c.x - 165 + k * 110, 600 - Math.max(0, Math.sin(t * 6 + k)) * 18, { s: 0.95, t, visor: VISOR[v] }));
      if (i === 1) ['purple', 'pink', 'lime', 'white'].forEach((v, k) => survivor(ctx, c.x - 165 + k * 110, 600, { s: 0.95, t: t + k, visor: VISOR[v], line: C.green, glow: C.green, tint: 0.12, face: k % 2 ? -1 : 1 }));
      if (i === 2) {
        const tie = t > (FULL ? 11.8 : 10.0); const hs = tie ? 2 : 3, zs = 2;
        const tilt = tie ? 0.0 : -0.12;
        ctx.save(); ctx.translate(c.x, 440); ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 150); ctx.moveTo(-50, 150); ctx.lineTo(50, 150); ctx.stroke();
        ctx.rotate(tilt); ctx.beginPath(); ctx.moveTo(-200, 0); ctx.lineTo(200, 0); ctx.stroke();
        for (let k = 0; k < hs; k++) survivor(ctx, -200 + (k - (hs - 1) / 2) * 44, -4, { s: 0.42, visor: VISOR.p1 });
        for (let k = 0; k < zs; k++) survivor(ctx, 200 + (k - 0.5) * 44, -4, { s: 0.42, visor: VISOR.purple, line: C.green, glow: C.green });
        ctx.restore();
        txt(ctx, tie ? '2  vs  2' : '3  vs  2', c.x, 660, { size: 40, sp: 6, align: 'center' });
        txt(ctx, tie ? 'TIE → HUMANS WIN' : 'MORE HUMANS → HUMANS WIN', c.x, 720, { size: 26, sp: 3, align: 'center', color: C.teal });
      }
      txt(ctx, c.sub[0], c.x, i === 2 ? 790 : 680, { size: 30, sp: 4, align: 'center' });
      txt(ctx, c.sub[1], c.x, i === 2 ? 830 : 722, { size: 30, sp: 4, align: 'center', color: c.col });
      ctx.restore();
    });
    vignette(ctx);
  },

  talk(ctx, t) {
    panelBg(ctx);
    const talkEnd = 11.0, pickEnd = 16.0;
    const talking = t < talkEnd;
    // floor, table, the two duelists
    ctx.save(); ctx.strokeStyle = 'rgba(233,228,214,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(240, 640); ctx.lineTo(1680, 640); ctx.stroke(); ctx.restore();
    duelTable(ctx, 960, 640, 1.3, t, { noSign: true, noCards: true });
    survivor(ctx, 600, 640, { s: 1.25, t, visor: VISOR.p1, face: 1 });
    survivor(ctx, 1320, 640, { s: 1.25, t: t + 1, visor: VISOR.pink, face: -1 });
    txt(ctx, 'YOU', 600, 680, { size: 24, sp: 6, align: 'center', color: C.dim });
    txt(ctx, 'P5', 1320, 680, { size: 24, sp: 6, align: 'center', color: C.dim });
    // phase pill + timer
    if (talking) {
      const left = clamp(talkEnd - Math.max(t, 1.0), 0, 10);
      pill(ctx, W / 2, 80, `TALK  ${Math.ceil(left)}s`, { size: 40, sp: 8, align: 'center', color: C.teal, g: 18, alpha: P(t, 0.3, 0.8) });
      txt(ctx, 'VOICE OR MESSAGE  ·  ONLY THE TWO OF YOU HEAR IT', W / 2, 150, { size: 26, sp: 5, align: 'center', color: C.dim, alpha: P(t, 1.2, 1.7) });
    } else {
      const left = clamp(pickEnd - t, 0, 5);
      const sw = P(t, talkEnd, talkEnd + 0.4);
      pill(ctx, W / 2, 80, t < pickEnd ? `PICK A CARD  ${Math.ceil(left)}s` : 'FLIP!', { size: 40, sp: 8, align: 'center', color: C.gold, g: 18 });
      txt(ctx, 'TALK IS OVER: THE CARD TIMER STARTS NOW', W / 2, 150, { size: 26, sp: 5, align: 'center', color: C.gold, alpha: sw * (1 - P(t, 15.0, 15.4)) });
    }
    // chat bubbles
    const msgs = [
      { at: 1.6, side: -1, kind: 'msg', text: "LET'S BOTH PLAY LOW." },
      { at: 3.4, side: 1, kind: 'voice', text: "DEAL. I'LL PLAY A 1." },
      { at: 5.4, side: -1, kind: 'voice', text: 'PROMISE?' },
      { at: 6.9, side: 1, kind: 'msg', text: 'TRUST ME.' },
    ];
    msgs.forEach((m, i) => {
      const p = P(t, m.at, m.at + 0.3) * (1 - P(t, talkEnd, talkEnd + 0.4));
      if (p <= 0) return;
      const row = Math.floor(i / 2);
      const x = m.side < 0 ? 600 : 1320, y = 250 + row * 105;
      const speaking = m.kind === 'voice' && t < m.at + 1.6;
      const w = measure(ctx, m.text, 30, 700, 3) + 120;
      ctx.save(); ctx.globalAlpha = p; ctx.translate(x, y + (1 - EO(p)) * 20);
      rr(ctx, -w / 2, -34, w, 68, 16); ctx.fillStyle = 'rgba(7,8,12,0.92)'; ctx.fill();
      const col = m.side < 0 ? VISOR.p1 : VISOR.pink;
      ctx.strokeStyle = col; ctx.lineWidth = 2.5; glow(ctx, col, 12); ctx.stroke(); noGlow(ctx);
      // icon: mic (voice) or chat box (message)
      ctx.save(); ctx.translate(-w / 2 + 38, 0); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3;
      if (m.kind === 'voice') {
        rr(ctx, -7, -16, 14, 22, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -2, 13, 0.15, Math.PI - 0.15); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 11); ctx.lineTo(0, 18); ctx.stroke();
      } else {
        rr(ctx, -15, -14, 30, 22, 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6, 8); ctx.lineTo(-10, 16); ctx.lineTo(2, 8); ctx.stroke();
      }
      ctx.restore();
      txt(ctx, m.text, -w / 2 + 70, 2, { size: 30, sp: 3, color: C.ink });
      if (speaking) { // little voice waveform
        for (let k = 0; k < 7; k++) { const hgt = 6 + Math.abs(Math.sin(t * 14 + k * 1.3)) * 22; ctx.fillStyle = col; ctx.fillRect(w / 2 + 14 + k * 9, -hgt / 2, 5, hgt); }
      }
      ctx.restore();
    });
    stamp(ctx, 'ANYONE CAN LIE', W / 2, 520, P(t, 8.4, 8.8) * (1 - P(t, talkEnd - 0.3, talkEnd)), C.green, 52, -0.05);
    // your hand: locked while talking
    const picked = P(t, 13.0, 13.8);
    const handVals = t < 13.0 ? [7, 5, 4, 2] : [7, 5, 4];
    ctx.save(); ctx.globalAlpha = talking ? 0.35 : 1; hand(ctx, W / 2, 880, handVals, { spread: 110 }); ctx.restore();
    if (talking) pill(ctx, W / 2, 880, 'CARDS LOCKED', { size: 30, sp: 6, align: 'center', color: C.ink, alpha: P(t, 1.0, 1.5) });
    if (!talking && t < 13.0) { const pr = (t * 1.5) % 1; ctx.save(); ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.globalAlpha = 1 - pr; glow(ctx, C.gold, 14); rr(ctx, W / 2 + 1.5 * 110 - 64 - pr * 10, 795 - pr * 10, 128 + pr * 20, 178 + pr * 20, 14); ctx.stroke(); ctx.restore(); }
    // the picked card goes to the table face down, then both flip
    const flip = P(t, 16.0, 16.4);
    if (picked > 0) card(ctx, lerp(W / 2 + 165, 905, EO(picked)), lerp(880, 452, EO(picked)), { v: 2, w: 80, h: 112, flip: lerp(-1, 1, flip), sc: 1 });
    const opp = P(t, 14.2, 14.8);
    if (opp > 0) card(ctx, 1015, lerp(380, 452, EO(opp)), { v: 8, w: 80, h: 112, flip: lerp(-1, 1, flip), alpha: opp });
    stamp(ctx, 'THEY LIED: 2 vs 8', W / 2, 560, P(t, 16.6, 17.0), C.red, 60, -0.04);
    vignette(ctx);
  },

  score(ctx, t) {
    panelBg(ctx);
    const ph = (a, b) => P(t, a, a + 0.4) * (1 - P(t, b - 0.4, b));
    // A: what the score is
    const A = ph(0, 6.9);
    if (A > 0) {
      ctx.save(); ctx.globalAlpha = A;
      ctx.save(); ctx.translate(W / 2, 360); ctx.scale(2.4, 2.4); pill(ctx, 0, 0, 'SCORE 35  ·  SECRET', { size: 24, sp: 5, align: 'center', color: C.gold, g: 16 }); ctx.restore();
      txt(ctx, 'ONLY YOU SEE YOUR SCORE', W / 2, 490, { size: 34, sp: 6, align: 'center', color: C.dim });
      txt(ctx, 'YOUR TEAM WINS THE MATCH', W / 2, 620, { size: 40, sp: 6, align: 'center', alpha: P(t, 0.8, 1.3) });
      txt(ctx, 'YOUR SCORE PICKS THE  ★ TOP PLAYER', W / 2, 690, { size: 40, sp: 6, align: 'center', color: C.gold, alpha: P(t, 3.0, 3.5), g: 10 });
      ctx.restore();
    }
    // B: card points
    const B = ph(7.0, 14.3);
    if (B > 0) {
      ctx.save(); ctx.globalAlpha = B;
      header(ctx, 'CARD POINTS', 1, C.cyan, 120);
      txt(ctx, 'ONLY WHILE THE CARD IS IN YOUR HAND', W / 2, 205, { size: 28, sp: 5, align: 'center', color: C.dim });
      const items = [
        { at: 8.6, o: { v: 7 }, pts: '7', sub: 'ITS NUMBER', col: C.cyan },
        { at: 10.2, o: { kind: 'gun', bullets: 2 }, pts: '20', sub: '10 PER BULLET', col: C.gun },
        { at: 12.0, o: { kind: 'cure' }, pts: '30', sub: 'CURE', col: C.cure },
        { at: 12.9, o: { kind: 'zombie' }, pts: '0', sub: 'ZOMBIE CARD', col: C.green },
      ];
      items.forEach((it, i) => {
        const p = EO(P(t, it.at, it.at + 0.5)); if (p <= 0) return;
        const x = 960 + (i - 1.5) * 380;
        card(ctx, x, 470 + (1 - p) * 50, { ...it.o, sc: 1.25, alpha: p });
        txt(ctx, it.pts, x, 720, { size: 90, align: 'center', color: it.col, alpha: p, g: 16 });
        txt(ctx, it.sub, x, 800, { size: 26, sp: 5, align: 'center', color: C.dim, alpha: p });
        if (i === 1) txt(ctx, '1 BULLET LEFT = 10', x, 840, { size: 22, sp: 4, align: 'center', color: C.dim, alpha: p * 0.8 });
      });
      ctx.restore();
    }
    // C: earned points (Gun and Cure)
    const Cp = ph(14.4, 27.6);
    if (Cp > 0) {
      ctx.save(); ctx.globalAlpha = Cp;
      header(ctx, 'EARNED POINTS', 1, C.gold, 120);
      const rows = [
        { at: 14.5, v: '+40', label: 'SHOOT A ZOMBIE  (every bullet)', col: C.gun, icon: 'gun' },
        { at: 16.6, v: '−20', label: 'SHOOT A HUMAN', col: C.red, icon: 'gun' },
        { at: 18.6, v: '+15', label: 'YOUR ZOMBIE CARD BITES', col: C.green, icon: 'zombie' },
        { at: 20.4, v: '−30', label: 'CURE A ZOMBIE  (the Cure is used up)', col: C.cure, icon: 'cure' },
        { at: 25.0, v: '−40', label: 'WASTE A CURE ON A HUMAN', col: C.red, icon: 'cure' },
      ];
      rows.forEach((r, i) => {
        const p = E(P(t, r.at, r.at + 0.45)); if (p <= 0) return;
        const y = 270 + i * 118;
        ctx.save(); ctx.globalAlpha *= p; ctx.translate((1 - p) * 60, 0);
        rr(ctx, 380, y - 48, 1160, 96, 14); ctx.fillStyle = 'rgba(7,8,12,0.85)'; ctx.fill(); ctx.strokeStyle = hexA(r.col, 0.55); ctx.lineWidth = 2; ctx.stroke();
        card(ctx, 450, y, { kind: r.icon, w: 54, h: 76, glow: 8 });
        txt(ctx, r.v, 640, y + 2, { size: 64, align: 'right', color: r.col, g: 12 });
        txt(ctx, r.label.toUpperCase(), 690, y + 2, { size: 34, sp: 4 });
        ctx.restore();
      });
      ctx.restore();
    }
    // D: time bonus
    const D = ph(27.6, 31.0);
    if (D > 0) {
      ctx.save(); ctx.globalAlpha = D;
      header(ctx, 'TIME BONUS', 1, C.teal, 120);
      const rp = (t - 27.6) % 1.6 / 1.6;
      ring(ctx, W / 2, 440, 130, rp, C.teal, 12);
      txt(ctx, '+10', W / 2, 440, { size: 80, align: 'center', color: C.teal, g: 16 });
      txt(ctx, 'EVERY FULL MINUTE IN YOUR ROLE', W / 2, 660, { size: 44, sp: 6, align: 'center' });
      txt(ctx, 'BITTEN OR CURED: BACK TO 0  ·  MEETINGS PAUSE IT', W / 2, 740, { size: 30, sp: 5, align: 'center', color: C.dim });
      ctx.restore();
    }
    // E: results
    const list = P(t, 31.0, 31.4);
    if (list > 0) {
      ctx.save(); ctx.globalAlpha = list;
      header(ctx, 'RESULTS', 1, C.gold, 110);
      const rows = [['P4', 'HUMAN', 148, VISOR.blue], ['P1', 'HUMAN', 113, VISOR.p1], ['P6', 'ZOMBIE', 96, VISOR.purple], ['P2', 'HUMAN', 71, VISOR.teal], ['P3', 'ZOMBIE', 54, VISOR.pink]];
      rows.forEach(([n, role, s, v], i) => {
        const rp = E(P(t, 31.1 + i * 0.15, 31.5 + i * 0.15)); const y = 260 + i * 120;
        ctx.save(); ctx.globalAlpha *= rp; ctx.translate((1 - rp) * 60, 0);
        rr(ctx, 460, y - 48, 1000, 96, 14); ctx.fillStyle = i === 0 ? 'rgba(240,192,74,0.12)' : 'rgba(7,8,12,0.8)'; ctx.fill();
        ctx.strokeStyle = i === 0 ? C.gold : 'rgba(233,228,214,0.25)'; ctx.lineWidth = i === 0 ? 3 : 2; if (i === 0) glow(ctx, C.gold, 18); ctx.stroke(); noGlow(ctx);
        survivor(ctx, 530, y + 40, { s: 0.42, t: t + i, visor: v });
        txt(ctx, n, 590, y, { size: 40, sp: 4 });
        txt(ctx, role, 720, y, { size: 30, sp: 5, color: role === 'ZOMBIE' ? C.green : C.ink });
        txt(ctx, String(s), 1420, y, { size: 44, align: 'right', color: C.gold });
        if (i === 0) txt(ctx, '★ TOP PLAYER', 1080, y, { size: 32, sp: 4, align: 'center', color: C.gold, g: 14 });
        ctx.restore();
      });
      ctx.restore();
    }
    vignette(ctx);
  },

  outro(ctx, t, d) {
    const flash = Math.max(0, 1 - Math.abs(t - 2.2) * 6);
    sky(ctx, t, flash); rain(ctx, t, 0.8);
    ctx.save(); ctx.translate(W / 2, H / 2 + 40); const z = lerp(1, 0.94, t / d); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
    building(ctx, t, { lightAt: () => 0.45, people: BUILDING_PEOPLE, flicker: Math.sin(t * 3) > 0.9 });
    ctx.restore();
    vignette(ctx);
    ctx.fillStyle = 'rgba(4,5,7,0.66)'; ctx.fillRect(0, 0, W, H);
    const tp = EO(P(t, 0.3, 1.3));
    txt(ctx, 'OUTBREAK DECK', W / 2, 420 + (1 - tp) * 30, { size: 150, sp: 22, align: 'center', color: '#e9fffb', alpha: tp, g: 40, gc: C.teal });
    txt(ctx, '6 – 15 PLAYERS   ·   5 – 8 MINUTE MATCHES', W / 2, 545, { size: 40, sp: 8, align: 'center', color: C.ink, alpha: P(t, 1.6, 2.2) });
    const q = P(t, 5.5, 6.2); const fl = Math.sin(t * 13) > 0.6 && t < 8;
    txt(ctx, 'WHO\'S STILL HUMAN?', W / 2, 680, { size: 64, sp: 12, align: 'center', color: fl ? C.green : C.ink, alpha: q, g: fl ? 24 : 0, gc: C.green });
  },
};
const BUILDING_PEOPLE = [
  { f: 1, a: 0.27, b: 0.7, v: 0.05, o: 0.2, c: VISOR.p1 }, { f: 1, a: 0.3, b: 0.68, v: 0.04, o: 1.3, c: VISOR.pink, z: true },
  { f: 0, a: 0.02, b: 0.5, v: 0.05, o: 0.6, c: VISOR.blue }, { f: 0, a: 0.55, b: 0.97, v: 0.04, o: 1.1, c: VISOR.yellow },
  { f: 2, a: 0.05, b: 0.45, v: 0.05, o: 0.1, c: VISOR.teal }, { f: 2, a: 0.5, b: 0.95, v: 0.035, o: 0.9, c: VISOR.lime, z: true },
  { f: 3, a: 0.28, b: 0.72, v: 0.04, o: 0.4, c: VISOR.white }, { f: 1, a: 0.76, b: 0.98, v: 0.03, o: 0.7, c: VISOR.purple },
];

// ---------- v3 "what's new" scenes (node render.js --v3) ----------
function partIcon(ctx, x, y, s = 1, alpha = 1, t = 0) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha *= alpha;
  const pulse = 0.7 + 0.3 * Math.sin(t * 5);
  const g = ctx.createRadialGradient(0, -26, 2, 0, -26, 60); g.addColorStop(0, hexA('#ffb04a', 0.45 * pulse)); g.addColorStop(1, 'rgba(255,176,74,0)');
  ctx.fillStyle = g; ctx.fillRect(-60, -86, 120, 120);
  rr(ctx, -18, -52, 36, 52, 6); ctx.fillStyle = '#0b0d12'; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#ffb04a'; glow(ctx, '#ffb04a', 16); ctx.fillRect(-9, -42, 18, 24); noGlow(ctx);
  ctx.fillStyle = C.ink; ctx.fillRect(-12, -60, 24, 7);
  ctx.restore();
}
function generator(ctx, x, floorY, fitted, t, n = 4) {
  ctx.save();
  const lit = fitted >= n;
  ctx.strokeStyle = '#ff8c2a'; ctx.lineWidth = 6; glow(ctx, '#ff8c2a', lit ? 60 : 24);
  ctx.beginPath(); ctx.arc(x, floorY - 170, 90, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, floorY - 170, 60 + 6 * Math.sin(t * 3), 0, Math.PI * 2); ctx.stroke(); noGlow(ctx);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 60, floorY); ctx.lineTo(x - 40, floorY - 90); ctx.moveTo(x + 60, floorY); ctx.lineTo(x + 40, floorY - 90); ctx.stroke();
  for (let i = 0; i < n; i++) {
    const sx = x + (i - (n - 1) / 2) * 44, sy = floorY - 320;
    rr(ctx, sx - 16, sy, 32, 20, 4); ctx.fillStyle = i < fitted ? '#ffb04a' : '#1a1d24'; if (i < fitted) glow(ctx, '#ffb04a', 20); ctx.fill(); noGlow(ctx);
    ctx.strokeStyle = '#ffb04a'; ctx.lineWidth = 2; ctx.stroke();
  }
  txt(ctx, 'GENERATOR', x, floorY - 350, { size: 26, sp: 6, align: 'center', color: '#ffb04a', g: 8 });
  ctx.restore();
}
/** One side-view room filling the screen (floor at y = 698). */
function stage(ctx, t, label, accent, draw, o = {}) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  room(ctx, -10, -90, W + 20, 205, { lit: 0.3, accent });
  ctx.fillStyle = C.slab; ctx.fillRect(0, 115, W, 105);
  room(ctx, -10, 220, W + 20, 478, { accent, label, lit: o.lit ?? 1, draw });
  ctx.fillStyle = C.slab; ctx.fillRect(0, 698, W, 80);
  room(ctx, -10, 778, W + 20, 400, { lit: 0.25, accent: '#6a9cff' });
}
const FLOOR_Y = 695;
function strike(ctx, x1, y1, x2, y2, p) {
  if (p <= 0) return;
  ctx.save(); ctx.strokeStyle = C.red; ctx.lineWidth = 8; glow(ctx, C.red, 16); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(lerp(x1, x2, E(p)), lerp(y1, y2, E(p))); ctx.stroke(); ctx.restore();
}
function box(ctx, x, y, w, h, col, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; rr(ctx, x, y, w, h, 18); ctx.fillStyle = 'rgba(7,8,12,0.85)'; ctx.fill();
  ctx.strokeStyle = hexA(col, 0.65); ctx.lineWidth = 2.5; glow(ctx, col, 14); ctx.stroke(); ctx.restore();
}
function bubble(ctx, x, y, text, col, a = 1) {
  ctx.save(); ctx.globalAlpha *= a;
  const w = measure(ctx, text, 30, 700, 3) + 40;
  rr(ctx, x - w / 2, y - 26, w, 52, 12); ctx.fillStyle = col; ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 12, y + 26); ctx.lineTo(x, y + 42); ctx.lineTo(x + 12, y + 26); ctx.fill();
  txt(ctx, text, x, y + 2, { size: 30, sp: 3, align: 'center', color: '#0a0b10' });
  ctx.restore();
}
const ZOMBIE = { line: C.green, glow: C.green, tint: 0.12 };

Object.assign(SCENES, {
  v3intro(ctx, t, d) {
    const flash = Math.max(0, 1 - Math.abs(t - 1.5) * 6) + Math.max(0, 1 - Math.abs(t - 1.75) * 8);
    sky(ctx, t, flash); rain(ctx, t, 0.9);
    ctx.save(); ctx.translate(W / 2, H / 2 + 40); const z = lerp(1.18, 1, EO(P(t, 0, 3))); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
    building(ctx, t, { lightAt: () => (flash > 0.3 ? 1 : 0.4), people: BUILDING_PEOPLE, flicker: t > 4 && t < 4.2 });
    ctx.restore();
    vignette(ctx);
    const tp = P(t, 3.2, 4.2);
    if (tp > 0) {
      ctx.fillStyle = `rgba(4,5,7,${0.7 * tp})`; ctx.fillRect(0, 0, W, H);
      txt(ctx, 'NIGHT SHIFT  ·  STORM LOCKDOWN', W / 2, 330, { size: 34, sp: 12, align: 'center', color: '#7fb8b0', alpha: tp });
      txt(ctx, 'WHAT\'S NEW', W / 2, 470 + (1 - EO(tp)) * 30, { size: 150, sp: 22, align: 'center', color: '#e9fffb', alpha: tp, g: 40, gc: C.teal });
      stamp(ctx, 'VERSION 3.0', W / 2, 640, P(t, 5.0, 5.6), C.gold, 64, 0);
    }
  },

  v3timers(ctx, t) {
    panelBg(ctx);
    header(ctx, 'FEWER TIMERS', P(t, 0.2, 1.0), C.teal, 110);
    const cols = [{ x: 340, t0: 1.4, col: C.cure, title: 'CURE QUARANTINE' }, { x: 960, t0: 7.6, col: C.gun, title: 'STUN AFTER A SHOT' }, { x: 1580, t0: 10.6, col: C.green, title: 'STARVING' }];
    cols.forEach((c, i) => {
      const a = E(P(t, c.t0, c.t0 + 0.6)); if (a <= 0) return;
      ctx.save(); ctx.translate(0, (1 - a) * 40);
      box(ctx, c.x - 270, 220, 540, 640, c.col, a);
      txt(ctx, c.title, c.x, 280, { size: 36, sp: 6, align: 'center', color: c.col, alpha: a, g: 10 });
      if (i === 0) {
        txt(ctx, '60s', c.x, 450, { size: 140, align: 'center', color: C.dim, alpha: a });
        strike(ctx, c.x - 130, 490, c.x + 130, 400, P(t, 3.6, 4.2));
        const n = P(t, 4.4, 5.0); txt(ctx, '30s', c.x, 650, { size: 150, align: 'center', color: C.cure, alpha: a * n, g: 24 });
        txt(ctx, 'CURED PLAYER GAGGED 30s TOO', c.x, 790, { size: 26, sp: 3, align: 'center', color: C.ink, alpha: a * n });
      }
      if (i === 1) {
        txt(ctx, '8s', c.x, 450, { size: 140, align: 'center', color: C.dim, alpha: a });
        strike(ctx, c.x - 110, 490, c.x + 110, 400, P(t, 8.4, 9.0));
        const n = P(t, 9.2, 9.8); txt(ctx, 'NONE', c.x, 650, { size: 130, sp: 10, align: 'center', color: C.gun, alpha: a * n, g: 24 });
        txt(ctx, 'HITTING A HUMAN STILL COSTS -20', c.x, 790, { size: 26, sp: 3, align: 'center', color: C.ink, alpha: a * n });
      }
      if (i === 2) {
        const cyc = ((t - c.t0) % 3) / 3; const fl = cyc < 0.25;
        survivor(ctx, c.x, 700, { s: 1.5, t, visor: VISOR.lime, ...ZOMBIE, glow: fl ? '#b4ff3a' : null, glowBlur: 50, alpha: a });
        ring(ctx, c.x + 170, 380, 44, cyc, C.green, 7);
        if (fl) txt(ctx, 'GRRR…', c.x - 120, 380, { size: 40, sp: 4, align: 'center', color: '#b4ff3a', g: 14 });
        txt(ctx, 'ONE SIGN, EVERY 20s:', c.x, 770, { size: 26, sp: 3, align: 'center', alpha: a });
        txt(ctx, 'A GROWL + A GREEN FLARE', c.x, 810, { size: 26, sp: 3, align: 'center', color: C.green, alpha: a });
      }
      ctx.restore();
    });
    vignette(ctx);
  },

  v3balance(ctx, t) {
    panelBg(ctx);
    header(ctx, 'BALANCED BY LOBBY SIZE', P(t, 0.2, 1.0), C.gold, 110);
    const rows = [['6', 1, 50, 75], ['7 – 8', 1, 20, 45], ['9 – 12', 2, 40, 65], ['13 – 15', 3, 45, 95]];
    const x0 = 260, colX = [x0, x0 + 300, x0 + 560, x0 + 1060];
    const hp = P(t, 1.2, 1.8);
    [['PLAYERS', 0], ['ZOMBIES', 1], ['HUMANS WITH A GUN', 2], ['ZOMBIE CARD REGROW', 3]].forEach(([h, i]) => txt(ctx, h, colX[i], 250, { size: 24, sp: 5, color: C.dim, alpha: hp }));
    rows.forEach((r, i) => {
      const a = E(P(t, 2.0 + i * 0.7, 2.6 + i * 0.7)); if (a <= 0) return;
      const y = 340 + i * 150;
      ctx.save(); ctx.globalAlpha = a; rr(ctx, x0 - 40, y - 55, 1480, 110, 14); ctx.fillStyle = 'rgba(7,8,12,0.7)'; ctx.fill(); ctx.strokeStyle = 'rgba(233,228,214,0.15)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      txt(ctx, r[0], colX[0], y, { size: 54, sp: 4, alpha: a });
      for (let k = 0; k < r[1]; k++) survivor(ctx, colX[1] + 30 + k * 60, y + 45, { s: 0.55, visor: VISOR.purple, ...ZOMBIE, alpha: a, t });
      const gp = E(P(t, 6.2 + i * 0.3, 7.2 + i * 0.3));
      rr(ctx, colX[2], y - 14, 400, 28, 14); ctx.fillStyle = 'rgba(233,228,214,0.1)'; ctx.fill();
      rr(ctx, colX[2], y - 14, 400 * (r[2] / 100) * gp, 28, 14); ctx.fillStyle = C.gun; ctx.save(); glow(ctx, C.gun, 12); ctx.fill(); ctx.restore();
      txt(ctx, `${Math.round(r[2] * gp)}%`, colX[2] + 420, y, { size: 36, color: C.gun, alpha: a });
      const zp = E(P(t, 9.2 + i * 0.3, 10.2 + i * 0.3));
      ring(ctx, colX[3] + 40, y, 36, zp * r[3] / 100, C.green, 7);
      txt(ctx, `${Math.round(r[3] * zp)}s`, colX[3] + 110, y, { size: 40, color: C.green, alpha: a });
    });
    txt(ctx, 'TUNED WITH THE BALANCE SIMULATOR  ·  GOAL: ABOUT 50 / 50', W / 2, 960, { size: 26, sp: 5, align: 'center', color: C.dim, alpha: P(t, 11, 11.6) });
    vignette(ctx);
  },

  v3power(ctx, t) {
    const fitted = t > 13.0 ? 1 : 0;
    stage(ctx, t, 'RESTORE POWER', '#ff8c2a', () => {
      generator(ctx, 1560, FLOOR_Y, fitted, t);
      if (t < 4.6) partIcon(ctx, 620, FLOOR_Y, 1.1, 1, t);
      if (t < 16.6) partIcon(ctx, 230, FLOOR_Y, 1.1, 1, t);
    });
    // the human: walk to the part, pick it up, carry it to the generator
    const w1 = walkX(t, 0.8, 360, 590, 140);
    const w2 = walkX(t, 6.6, 590, 1440, 200);
    const x = t < 6.6 ? w1.x : w2.x;
    const moving = (t < 6.6 && w1.moving) || (t >= 6.6 && w2.moving);
    survivor(ctx, x, FLOOR_Y, { moving, walk: t * 9, t, visor: VISOR.p1 });
    if (t > 2.6 && t < 4.6) ring(ctx, 590, 470, 26, P(t, 2.6, 4.6), '#ffb04a', 7);
    if (t > 4.6 && t < 13.0) partIcon(ctx, x + 34, FLOOR_Y - 60, 0.7, 1, t);
    if (t > 11.0 && t < 13.0) ring(ctx, 1440, 470, 26, P(t, 11.0, 13.0), '#ffb04a', 7);
    if (t > 4.8 && t < 13.0) pill(ctx, x, 395, 'CARRYING A PART', { size: 22, sp: 4, align: 'center', color: '#ffb04a' });
    if (t > 13.0) stamp(ctx, 'PART FITTED  +10', 1000, 330, P(t, 13.0, 13.4) * (1 - P(t, 15.4, 15.8)), '#ffb04a', 56, 0);
    // the zombie: grabs the other part and walks off with it
    const zIn = walkX(t, 14.4, -80, 200, 160); const zOut = walkX(t, 17.0, 200, -100, 160);
    if (t > 14.4) {
      const zx = t < 17.0 ? zIn.x : zOut.x;
      survivor(ctx, zx, FLOOR_Y, { moving: zIn.moving || zOut.moving, walk: t * 9, t, visor: VISOR.purple, ...ZOMBIE, face: t < 17.0 ? 1 : -1 });
      if (t > 16.6) { partIcon(ctx, zx - 34, FLOOR_Y - 60, 0.7, 1, t); pill(ctx, zx + 40, 440, 'HIDING IT', { size: 22, sp: 4, color: C.green }); }
    }
    gameHud(ctx, t, { room: 'REACTOR', floor: 'BASEMENT · THE VATS', timer: '4:12' });
    txt(ctx, `⚡ POWER ${fitted}/4  ·  FIT PARTS AT THE REACTOR`, W / 2, 104, { size: 22, sp: 4, align: 'center', color: '#ffb04a' });
    vignette(ctx);
  },

  v3evac(ctx, t) {
    const left = Math.max(0, 90 - Math.floor(P(t, 2.5, 9.5) * 90));
    const truck = P(t, 8.0, 9.6);
    stage(ctx, t, 'ENTRANCE', '#e8f4ff', () => {
      // exit door + truck headlights
      ctx.save(); rr(ctx, 40, 360, 150, 338, 6); ctx.fillStyle = '#0b0d12'; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.stroke();
      if (truck > 0) { const g = ctx.createRadialGradient(110, 560, 10, 110, 560, 700 * truck); g.addColorStop(0, `rgba(255,245,210,${0.6 * truck})`); g.addColorStop(1, 'rgba(255,245,210,0)'); ctx.fillStyle = g; ctx.fillRect(0, 220, 1300, 478); }
      ctx.restore();
      txt(ctx, 'EVAC POINT', 115, 330, { size: 26, sp: 6, align: 'center', color: C.teal, g: 10 });
    });
    if (t > 0.5) stamp(ctx, 'POWER RESTORED', W / 2, 300, P(t, 0.5, 0.9) * (1 - P(t, 2.6, 3.0)), C.gold, 70, 0);
    const people = [{ v: VISOR.p1, t0: 3.0, x: 560 }, { v: VISOR.teal, t0: 3.8, x: 700 }, { v: VISOR.yellow, t0: 4.6, x: 840 }, { v: VISOR.lime, t0: 5.6, x: 1000, z: true }];
    people.forEach((p) => {
      const w = walkX(t, p.t0, 1980, p.x, 330);
      survivor(ctx, w.x, FLOOR_Y, { moving: w.moving, walk: t * 9, t, visor: p.v, face: -1, ...(p.z ? ZOMBIE : {}) });
    });
    timerPill(ctx, W / 2, 46, '2:31');
    txt(ctx, left > 0 ? `EVAC IN ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}  ·  ENTRANCE` : 'THE EVAC IS HERE', W / 2, 104, { size: 26, sp: 4, align: 'center', color: '#ffd27a' });
    const cp = P(t, 10.0, 10.5);
    if (cp > 0) { box(ctx, W / 2 - 360, 790, 720, 120, C.teal, cp); txt(ctx, '3 HUMANS  vs  1 ZOMBIE', W / 2, 850, { size: 48, sp: 6, align: 'center', alpha: cp }); }
    stamp(ctx, 'HUMANS ESCAPE', W / 2, 330, P(t, 11.6, 12.0), C.teal, 84, -0.05);
    vignette(ctx);
  },

  v3blackout(ctx, t) {
    const cut = t > 7.6; const dark = cut ? E(P(t, 7.6, 8.0)) : 0;
    stage(ctx, t, 'SERVER ROOM', '#3e8bff', () => {
      // breaker panel
      const bx = 520, by = 380;
      rr(ctx, bx - 50, by, 100, 140, 8); ctx.fillStyle = '#0b0d12'; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.stroke();
      const lever = cut ? 1 : 0;
      ctx.save(); ctx.strokeStyle = cut ? C.red : '#b4ff3a'; ctx.lineWidth = 8; glow(ctx, cut ? C.red : '#b4ff3a', 14); ctx.beginPath(); ctx.moveTo(bx, by + 70); ctx.lineTo(bx + (lever ? 0 : 0), by + (lever ? 120 : 20)); ctx.stroke(); ctx.restore();
      txt(ctx, 'BREAKER', bx, by - 24, { size: 26, sp: 6, align: 'center', color: '#b4ff3a', g: 8 });
    });
    const zw = walkX(t, 0.6, 1100, 600, 150);
    if (!cut) survivor(ctx, zw.x, FLOOR_Y, { moving: zw.moving, walk: t * 9, t, visor: VISOR.purple, ...ZOMBIE, face: -1, aim: t > 7.0 && t < 7.8 });
    survivor(ctx, 1450, FLOOR_Y, { t, visor: VISOR.blue, face: -1 });
    if (dark > 0) {
      // humans' view: almost blind, a tiny circle of light
      ctx.save(); ctx.fillStyle = `rgba(2,3,6,${0.94 * dark})`; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(1450, 600, 150, 0, Math.PI * 2, true); ctx.fill('evenodd'); ctx.restore();
      // zombie eyes glow in the dark
      const hunt = walkX(t, 9.8, 600, 1280, 150);
      survivor(ctx, hunt.x, FLOOR_Y, { moving: hunt.moving, walk: t * 9, t, visor: '#b4ff3a', ...ZOMBIE, alpha: 0.2 + 0.2 * Math.sin(t * 6) });
      stamp(ctx, 'BLACKOUT', W / 2, 260, P(t, 7.8, 8.2), '#b4ff3a', 96, 0);
      txt(ctx, `${Math.max(0, 15 - Math.floor((t - 7.8) * 1.8))}s`, W / 2, 380, { size: 50, align: 'center', color: '#b4ff3a', alpha: P(t, 8.2, 8.6) });
      const lp = P(t, 11.0, 11.5);
      box(ctx, 160, 840, 700, 100, C.ink, lp); txt(ctx, 'HUMANS: CAN BARELY SEE', 510, 890, { size: 34, sp: 4, align: 'center', alpha: lp });
      const zp = P(t, 13.0, 13.5);
      box(ctx, 1060, 840, 700, 100, C.green, zp); txt(ctx, 'ZOMBIES: SEE JUST FINE', 1410, 890, { size: 34, sp: 4, align: 'center', color: C.green, alpha: zp });
    }
    if (!cut) txt(ctx, 'ONCE PER MATCH  ·  ZOMBIES ONLY', W / 2, 140, { size: 30, sp: 6, align: 'center', color: '#b4ff3a', alpha: P(t, 1.5, 2.0) });
    vignette(ctx);
  },

  v3cameras(ctx, t) {
    panelBg(ctx);
    header(ctx, 'SECURITY CAMERAS  ·  LOBBY', P(t, 0.2, 1.0), '#9ab8ff', 110);
    // the monitor wall
    const mp = E(P(t, 0.6, 1.3));
    box(ctx, 140, 220, 820, 600, '#9ab8ff', mp);
    const cams = [['REACTOR', '#ff8c2a'], ['LAB 2', '#4dd2ff'], ['MEDBAY', '#ff4a5a'], ['STORAGE', '#d9a441']];
    cams.forEach(([name, col], i) => {
      const x = 170 + (i % 2) * 390, y = 250 + Math.floor(i / 2) * 280;
      ctx.save(); ctx.globalAlpha = mp; rr(ctx, x, y, 370, 260, 8); ctx.fillStyle = '#0d1118'; ctx.fill(); ctx.strokeStyle = hexA(col, 0.6); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = `rgba(154,184,255,${0.03 + 0.03 * Math.sin(t * 20 + i)})`; ctx.fillRect(x, y, 370, 260);
      txt(ctx, name, x + 16, y + 26, { size: 22, sp: 4, color: col });
      ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(x + 345, y + 24, 7, 0, Math.PI * 2); if (Math.sin(t * 4) > 0) ctx.fill();
      const px = x + 80 + ((t * 40 + i * 70) % 220);
      survivor(ctx, px, y + 240, { s: 0.6, t, visor: [VISOR.yellow, VISOR.pink, VISOR.teal, VISOR.white][i], moving: true, walk: t * 9 });
      ctx.restore();
    });
    // the entries list
    const list = [['P4', 'REACTOR', 12, VISOR.yellow], ['P7', 'LAB 2', 19, VISOR.pink], ['P2', 'MEDBAY', 26, VISOR.teal], ['P5', 'STORAGE', 41, VISOR.white], ['P3', 'CAFETERIA', 55, VISOR.lime]];
    const lp = E(P(t, 2.2, 2.8));
    box(ctx, 1040, 220, 740, 600, '#9ab8ff', lp);
    txt(ctx, 'LAST 5 ROOM ENTRIES', 1410, 270, { size: 28, sp: 5, align: 'center', color: '#9ab8ff', alpha: lp });
    list.forEach(([who, where, ago, col], i) => {
      const a = E(P(t, 2.8 + i * 0.4, 3.2 + i * 0.4)); const y = 360 + i * 90;
      txt(ctx, who, 1090, y, { size: 40, color: col, alpha: a });
      txt(ctx, `→  ${where}`, 1190, y, { size: 38, alpha: a });
      txt(ctx, `${ago}s AGO`, 1740, y, { size: 30, align: 'right', color: C.dim, alpha: a });
    });
    vignette(ctx);
  },

  v3bluff(ctx, t) {
    panelBg(ctx);
    header(ctx, 'BLUFF CALL  ·  ONCE PER MATCH', P(t, 0.2, 1.0), C.gold, 100);
    tableGlow(ctx, W / 2, 560, 560, 200);
    txt(ctx, 'VS', W / 2, 560, { size: 54, align: 'center', color: C.dim });
    const on = t > 4.4;
    [['zombie', 'CALL ZOMBIE', C.green], ['gun', 'CALL GUN', C.gun], ['cure', 'CALL CURE', C.cure]].forEach(([k, label, col], i) =>
      button(ctx, W / 2 + (i - 1) * 330, 230, 290, 66, label, col, { on: on && k === 'zombie', alpha: on && k !== 'zombie' ? 0.35 : P(t, 1.2, 1.8) }));
    if (t > 4.4 && t < 7.4) ring(ctx, W / 2 - 330, 230, 0, 0, C.green);
    const flip = P(t, 7.2, 7.8); const fx = Math.cos(flip * Math.PI);
    const cancelled = t > 8.6;
    card(ctx, W / 2 - 300, 560, { v: 6, sc: 1.2, flip: fx < 0 ? -fx : fx, back: flip < 0.5 });
    card(ctx, W / 2 + 300, 560, { kind: 'zombie', sc: 1.2, flip: fx < 0 ? -fx : fx, back: flip < 0.5, crack: cancelled, alpha: cancelled ? 0.6 : 1 });
    txt(ctx, 'YOU', W / 2 - 300, 720, { size: 30, sp: 5, align: 'center', color: VISOR.p1 });
    txt(ctx, 'P6', W / 2 + 300, 720, { size: 30, sp: 5, align: 'center', color: VISOR.purple });
    if (cancelled) txt(ctx, 'CANCELLED', W / 2 + 300, 420, { size: 34, sp: 6, align: 'center', color: C.red, alpha: P(t, 8.6, 9.0), g: 12 });
    stamp(ctx, 'CALLED IT!  +15', W / 2, 860, P(t, 9.2, 9.6) * (1 - P(t, 12.6, 13.0)), C.gold, 70, 0);
    if (t > 9.8 && t < 12.8) txt(ctx, 'ONLY ZOMBIES HOLD ZOMBIE CARDS: NOW YOU KNOW', W / 2, 960, { size: 28, sp: 4, align: 'center', color: C.green, alpha: P(t, 9.8, 10.3) });
    const wp = P(t, 13.2, 13.7);
    if (wp > 0) { box(ctx, W / 2 - 420, 800, 840, 130, C.red, wp); txt(ctx, 'WRONG CALL:  -10', W / 2, 845, { size: 46, sp: 6, align: 'center', color: '#ff7a7a', alpha: wp }); txt(ctx, 'THE DUEL PLAYS OUT AS NORMAL', W / 2, 895, { size: 26, sp: 4, align: 'center', color: C.dim, alpha: wp }); }
    vignette(ctx);
  },

  v3report(ctx, t) {
    hall(ctx, t);
    survivor(ctx, 1420, FLOOR_Y, { t, visor: VISOR.blue, lie: 1, line: '#6a707c', alpha: 0.8 });
    txt(ctx, '☠ P4', 1420, 640, { size: 26, sp: 3, align: 'center', color: '#8a909c' });
    const w = walkX(t, 0.4, 700, 1290, 220);
    survivor(ctx, w.x, FLOOR_Y, { moving: w.moving, walk: t * 9, t, visor: VISOR.p1 });
    gameHud(ctx, t, { timer: '2:48' });
    const bp = P(t, 3.2, 3.6);
    if (bp > 0) {
      const press = t > 4.4 && t < 4.7;
      ctx.save(); ctx.globalAlpha = bp; ctx.translate(W - 420, 940); ctx.scale(press ? 0.92 : 1, press ? 0.92 : 1);
      ctx.beginPath(); ctx.arc(0, 0, 76, 0, Math.PI * 2); ctx.fillStyle = 'rgba(7,8,12,0.9)'; ctx.fill(); ctx.strokeStyle = C.gun; ctx.lineWidth = 6; glow(ctx, C.gun, 24); ctx.stroke(); noGlow(ctx);
      txt(ctx, 'REPORT', 0, -8, { size: 28, sp: 3, align: 'center', color: C.gun }); txt(ctx, 'BODY', 0, 26, { size: 22, sp: 3, align: 'center', color: C.ink });
      ctx.restore();
    }
    if (t > 4.6) {
      const fl = (Math.sin((t - 4.6) * 9) + 1) / 2; ctx.fillStyle = `rgba(255,90,40,${0.1 + 0.1 * fl})`; ctx.fillRect(0, 0, W, H);
      stamp(ctx, 'BODY REPORTED', W / 2, 330, P(t, 4.6, 5.0), C.gun, 84, 0);
      txt(ctx, 'P1 FOUND P4 IN THE CENTRAL HALL  ·  ROLE UNKNOWN', W / 2, 450, { size: 30, sp: 4, align: 'center', alpha: P(t, 5.2, 5.6) });
      pill(ctx, W / 2, 860, 'YOUR EMERGENCY BUTTON IS NOT USED', { size: 28, sp: 4, align: 'center', color: C.teal, alpha: P(t, 6.4, 6.9) });
    }
    vignette(ctx);
  },

  v3last(ctx, t) {
    stage(ctx, t, 'LAST STAND', C.red, null, { lit: 0.7 });
    const red = t > 7.0 && t < 12.5;
    const zs = [[330, VISOR.purple], [620, VISOR.lime], [1420, VISOR.pink], [1700, VISOR.white]];
    zs.forEach(([x, v], i) => {
      const w = walkX(t, 0.5 + i * 0.2, x + (x < 960 ? -200 : 200), x, 120);
      survivor(ctx, w.x, FLOOR_Y, { moving: w.moving, walk: t * 9, t: t + i, visor: v, face: x < 960 ? 1 : -1, line: red ? C.red : C.ink, glow: red ? C.red : null, glowBlur: 34 });
    });
    survivor(ctx, 960, FLOOR_Y, { t, visor: VISOR.p1, aim: t > 5.4 });
    stamp(ctx, 'LAST STAND', W / 2, 300, P(t, 2.4, 2.8) * (1 - P(t, 6.4, 6.8)), C.red, 96, 0);
    if (t > 5.0) card(ctx, 960, 400, { kind: 'gun', bullets: 1, sc: 0.75, alpha: P(t, 5.0, 5.4) * (1 - P(t, 7.0, 7.4)), glow: 24 });
    if (t > 5.2 && t < 7.0) txt(ctx, 'A GUN WITH 1 BULLET', 960, 540, { size: 30, sp: 5, align: 'center', color: C.gun });
    if (red) {
      ring(ctx, 960, 300, 50, P(t, 7.0, 12.0), C.red, 8);
      txt(ctx, `${Math.max(0, 5 - Math.floor((t - 7.0)))}s`, 960, 300, { size: 40, align: 'center', color: C.red });
      txt(ctx, 'EVERY ZOMBIE GLOWS RED', 960, 400, { size: 34, sp: 5, align: 'center', color: C.red, alpha: P(t, 7.2, 7.6) });
    }
    vignette(ctx, red ? 0.4 : 0.1);
  },

  v3extras(ctx, t) {
    panelBg(ctx);
    header(ctx, 'PLUS', P(t, 0.1, 0.8), C.teal, 100);
    const panels = [{ x: 340, t0: 0.6, title: 'LIGHTNING', col: '#c8d8ff' }, { x: 960, t0: 4.6, title: 'EMOTES', col: '#ffb04a' }, { x: 1580, t0: 7.4, title: 'GHOST MODE', col: '#9ab8ff' }];
    panels.forEach((p, i) => {
      const a = E(P(t, p.t0, p.t0 + 0.6)); if (a <= 0) return;
      box(ctx, p.x - 280, 200, 560, 700, p.col, a);
      txt(ctx, p.title, p.x, 260, { size: 40, sp: 8, align: 'center', color: p.col, alpha: a, g: 10 });
      ctx.save(); ctx.globalAlpha = a;
      if (i === 0) {
        const fl = ((t - p.t0) % 2.4) < 0.25;
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
          const x = p.x - 225 + c * 155, y = 330 + r * 150;
          rr(ctx, x, y, 140, 130, 6); ctx.fillStyle = fl ? '#3a4150' : '#0b0d12'; ctx.fill(); ctx.strokeStyle = 'rgba(233,228,214,0.4)'; ctx.lineWidth = 2; ctx.stroke();
          if (fl && (r + c) % 2 === 0) survivor(ctx, x + 70, y + 125, { s: 0.45, visor: VISOR.p1, line: '#fff' });
        }
        txt(ctx, 'EVERY 90s: ALL ROOMS LIT', p.x, 840, { size: 26, sp: 3, align: 'center' });
      }
      if (i === 1) {
        survivor(ctx, p.x - 110, 720, { s: 1.2, t, visor: VISOR.p1 });
        survivor(ctx, p.x + 130, 720, { s: 1.2, t, visor: VISOR.purple, face: -1 });
        bubble(ctx, p.x - 110, 470, (t - p.t0) % 3 < 1.5 ? 'SUS: P6' : 'HELP!', (t - p.t0) % 3 < 1.5 ? '#ffb04a' : '#ff7a7a');
        txt(ctx, 'HELLO · FOLLOW ME · SUS! · HELP!', p.x, 840, { size: 26, sp: 3, align: 'center' });
      }
      if (i === 2) {
        survivor(ctx, p.x, 700 + Math.sin(t * 2) * 14, { s: 1.4, t, visor: '#c8d8ff', line: '#9ab8ff', alpha: 0.4, glow: '#9ab8ff' });
        txt(ctx, 'OUT? WALK ON AND WATCH', p.x, 800, { size: 26, sp: 3, align: 'center' });
        txt(ctx, 'NOBODY SEES OR HEARS YOU', p.x, 840, { size: 26, sp: 3, align: 'center', color: C.dim });
      }
      ctx.restore();
    });
    const fl = panels[0] && ((t - 0.6) % 2.4) < 0.12 && t > 0.6; if (fl) { ctx.fillStyle = 'rgba(200,215,255,0.08)'; ctx.fillRect(0, 0, W, H); }
    vignette(ctx);
  },

  v3points(ctx, t) {
    panelBg(ctx);
    header(ctx, 'NEW POINTS FOR SMART PLAY', P(t, 0.2, 1.0), C.gold, 100);
    const rows = [
      [2.6, '+5', 'WIN A NUMBER DUEL'], [5.0, '+10', 'FIT A GENERATOR PART'], [7.6, '+20', 'A VOTE THAT HELPS YOUR TEAM'],
      [10.2, '-10', 'A VOTE THAT HURTS IT'], [12.0, '+25', 'A ZOMBIE NEVER ACCUSED'], [15.6, '+50', 'SURVIVE YOUR LAST STAND'], [18.4, '+15 / -10', 'BLUFF CALL RIGHT / WRONG'],
    ];
    rows.forEach(([t0, pts, label], i) => {
      const a = E(P(t, t0, t0 + 0.5)); if (a <= 0) return;
      const y = 220 + i * 105; const neg = pts.startsWith('-');
      ctx.save(); ctx.globalAlpha = a; ctx.translate((1 - a) * -60, 0);
      rr(ctx, 360, y - 40, 1200, 80, 14); ctx.fillStyle = 'rgba(7,8,12,0.8)'; ctx.fill(); ctx.strokeStyle = 'rgba(233,228,214,0.15)'; ctx.lineWidth = 2; ctx.stroke();
      txt(ctx, pts, 600, y, { size: 50, align: 'right', color: neg ? '#ff5a68' : '#3ee6a0', g: 10 });
      txt(ctx, label, 650, y, { size: 38, sp: 4 });
      ctx.restore();
    });
    vignette(ctx);
  },

  v3progress(ctx, t) {
    panelBg(ctx);
    header(ctx, 'AFTER THE MATCH', P(t, 0.2, 1.0), C.gold, 100);
    // recap
    const rp = E(P(t, 0.8, 1.4));
    box(ctx, 100, 190, 820, 640, C.gold, rp);
    txt(ctx, 'MATCH RECAP', 140, 240, { size: 30, sp: 6, color: C.gold, alpha: rp });
    const lines = [['0:41', 'P6 bit P3: a zombie now.', C.green], ['1:12', 'P1 fitted a generator part.', '#ffb04a'], ['1:55', 'P6 cut the power: BLACKOUT.', '#b4ff3a'], ['2:30', 'P4 shot P6 (a zombie).', C.gun], ['3:02', 'P2 reported P5\'s body.', C.gold], ['3:40', 'POWER RESTORED.', C.gold], ['5:10', 'HUMANS ESCAPED.', C.teal]];
    lines.forEach(([tm, s, col], i) => {
      const a = E(P(t, 1.4 + i * 0.35, 1.8 + i * 0.35)); const y = 310 + i * 70;
      txt(ctx, tm, 140, y, { size: 28, color: C.dim, alpha: a }); txt(ctx, s, 240, y, { size: 32, color: col, alpha: a });
    });
    // rank + XP
    const kp = E(P(t, 4.2, 4.8));
    box(ctx, 1000, 190, 820, 240, C.teal, kp);
    txt(ctx, 'RANK: ORDERLY', 1040, 250, { size: 40, sp: 6, color: C.teal, alpha: kp });
    const xp = E(P(t, 4.8, 6.6));
    rr(ctx, 1040, 300, 740, 26, 13); ctx.fillStyle = 'rgba(233,228,214,0.1)'; ctx.fill();
    rr(ctx, 1040, 300, 740 * (0.2 + 0.45 * xp), 26, 13); ctx.save(); ctx.fillStyle = C.teal; glow(ctx, C.teal, 14); ctx.globalAlpha = kp; ctx.fill(); ctx.restore();
    txt(ctx, `+${Math.round(150 * xp)} XP`, 1040, 375, { size: 32, color: C.gold, alpha: kp });
    txt(ctx, 'NEXT: RESEARCHER', 1780, 375, { size: 26, sp: 4, align: 'right', color: C.dim, alpha: kp });
    // badges
    const bp = E(P(t, 7.0, 7.6));
    box(ctx, 1000, 460, 820, 170, C.gold, bp);
    txt(ctx, 'BADGES', 1040, 505, { size: 26, sp: 6, color: C.dim, alpha: bp });
    ['ENGINEER', 'DETECTIVE', 'SURVIVOR'].forEach((b, i) => { const a = E(P(t, 7.4 + i * 0.3, 7.8 + i * 0.3)); pill(ctx, 1040 + i * 255, 575, `★ ${b}`, { size: 26, sp: 3, color: C.gold, alpha: a }); });
    // colours + modifier
    const cp = E(P(t, 9.2, 9.8));
    box(ctx, 1000, 660, 820, 170, '#ff5ca8', cp);
    txt(ctx, 'NEW NEON COLOURS', 1040, 705, { size: 26, sp: 6, color: C.dim, alpha: cp });
    Object.values(VISOR).forEach((v, i) => { const a = E(P(t, 9.5 + i * 0.12, 9.8 + i * 0.12)); ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = v; glow(ctx, v, 16); ctx.beginPath(); ctx.arc(1070 + i * 88, 775, 26, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
    pill(ctx, W / 2, 920, 'DAILY MODIFIER:  PITCH BLACK  ·  DOUBLE GUNS  ·  FAST CLAWS  ·  EXTRA CURES', { size: 28, sp: 3, align: 'center', color: C.teal, alpha: P(t, 11.4, 12.0) });
    vignette(ctx);
  },

  v3outro(ctx, t, d) {
    const flash = Math.max(0, 1 - Math.abs(t - 2.2) * 6);
    sky(ctx, t, flash); rain(ctx, t, 0.8);
    ctx.save(); ctx.translate(W / 2, H / 2 + 40); const z = lerp(1, 0.94, t / d); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
    building(ctx, t, { lightAt: () => (flash > 0.3 ? 1 : 0.45), people: BUILDING_PEOPLE, flicker: Math.sin(t * 3) > 0.9 });
    ctx.restore();
    vignette(ctx);
    ctx.fillStyle = 'rgba(4,5,7,0.66)'; ctx.fillRect(0, 0, W, H);
    const tp = EO(P(t, 0.3, 1.3));
    txt(ctx, 'OUTBREAK DECK', W / 2, 400 + (1 - tp) * 30, { size: 150, sp: 22, align: 'center', color: '#e9fffb', alpha: tp, g: 40, gc: C.teal });
    txt(ctx, FULL ? '6 – 15 PLAYERS  ·  5 – 8 MINUTES' : 'VERSION 3.0', W / 2, 525, { size: FULL ? 40 : 48, sp: FULL ? 8 : 14, align: 'center', color: C.gold, alpha: P(t, 1.4, 2.0), g: 14 });
    txt(ctx, 'TRUST NO ONE.', W / 2, 650, { size: 56, sp: 12, align: 'center', color: C.ink, alpha: P(t, 3.0, 3.6) });
    txt(ctx, 'GET TO THE EVAC.', W / 2, 730, { size: 56, sp: 12, align: 'center', color: C.teal, alpha: P(t, 4.6, 5.2), g: 18 });
  },
});

// ---------- timeline ----------
const V3 = process.argv.includes('--v3');
const SCRIPT = JSON.parse(fs.readFileSync(path.join(HERE, FULL ? 'scenes-full.json' : V3 ? 'scenes-v3.json' : 'scenes.json'), 'utf8'));
function wavSeconds(file) { const b = fs.readFileSync(file); const rate = b.readUInt32LE(28); let off = 12; while (off < b.length) { const id = b.toString('ascii', off, off + 4); const sz = b.readUInt32LE(off + 4); if (id === 'data') return sz / rate; off += 8 + sz; } return (b.length - 44) / rate; }
const EXTRA = { f_hook: 0.6, f_outro: 2.6, f_cure: 0.6, f_meeting: 0.4, f_evac: 0.6, f_last: 0.6, hook: 0.6, outro: 2.6, cure: 0.6, meeting: 0.4, v3intro: 0.8, v3outro: 2.6, v3evac: 0.6, v3last: 0.6 };
let acc = 0;
const TL = SCRIPT.map((s) => {
  const file = path.join(HERE, 'audio', `${s.id}.wav`); const a = wavSeconds(file);
  const d = LEAD + a + 0.9 + (EXTRA[s.id] ?? 0); const item = { ...s, file, a, start: acc, d }; acc += d; return item;
});
const TOTAL = acc;

// subtitles: split narration into short chunks timed by length
TL.forEach((s) => {
  const parts = s.say.replace(/\.\.\./g, '…').split(/(?<=[.?!:,…])\s+/).reduce((out, p) => {
    const last = out[out.length - 1]; if (last && (last + ' ' + p).length < 46) out[out.length - 1] = last + ' ' + p; else out.push(p); return out;
  }, []);
  const total = parts.reduce((a, p) => a + p.length, 0); let tt = LEAD;
  s.subs = parts.map((p) => { const dur = (p.length / total) * s.a; const it = { text: p, a: tt, b: tt + dur }; tt += dur; return it; });
});
function subtitles(ctx, s, t) {
  const cur = s.subs.find((x) => t >= x.a && t < x.b + 0.15); if (!cur) return;
  const a = clamp(Math.min((t - cur.a) / 0.12, (cur.b + 0.15 - t) / 0.12));
  ctx.save(); ctx.globalAlpha = a; ctx.font = '600 38px Rajdhani';
  const w = ctx.measureText(cur.text).width + 50;
  rr(ctx, W / 2 - w / 2, 990, w, 60, 10); ctx.fillStyle = 'rgba(5,6,8,0.78)'; ctx.fill();
  ctx.fillStyle = '#f3efe4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(cur.text, W / 2, 1021);
  ctx.restore();
}

function drawFrame(ctx, T) {
  const s = TL.find((x) => T >= x.start && T < x.start + x.d) ?? TL[TL.length - 1];
  const t = T - s.start;
  ctx.save(); ctx.clearRect(0, 0, W, H);
  SCENES[s.scene ?? s.id](ctx, t, s.d);
  ctx.restore();
  subtitles(ctx, s, t);
  // dip to black between scenes
  const fin = 1 - clamp(t / 0.3), fout = s === TL[TL.length - 1] ? clamp((t - (s.d - 1.2)) / 1.2) : clamp((t - (s.d - 0.25)) / 0.25);
  const dark = Math.max(s === TL[0] ? fin : fin * 0.9, fout);
  if (dark > 0) { ctx.fillStyle = `rgba(0,0,0,${dark})`; ctx.fillRect(0, 0, W, H); }
}

// ---------- music + sfx bed ----------
function writeBed(file) {
  const SR = 44100, N = Math.ceil((TOTAL + 0.5) * SR); const out = new Float32Array(N);
  const sceneAt = (T) => { const x = TL.find((y) => T >= y.start && T < y.start + y.d); return x?.scene ?? x?.id; };
  const chords = [[55, 82.41, 130.81], [49, 73.42, 116.54], [43.65, 65.41, 103.83], [51.91, 77.78, 123.47]];
  for (let i = 0; i < N; i++) {
    const T = i / SR; const ch = chords[Math.floor(T / 8) % 4];
    const lfo = 0.6 + 0.4 * Math.sin(T * 0.5);
    let v = 0; ch.forEach((f, k) => { v += Math.sin(2 * Math.PI * f * T + k) * 0.05 + Math.sin(2 * Math.PI * f * 1.003 * T) * 0.03; });
    v *= lfo;
    // pulse: muted 8th-note bass
    const step = 0.25; const ph = (T % step) / step; v += Math.sin(2 * Math.PI * ch[0] * 2 * T) * Math.exp(-ph * 9) * 0.06;
    // heartbeat (louder in the chase)
    const id = sceneAt(T); const beat = id === 'chase' ? 0.42 : 0.84; const hb = T % beat;
    const amp = id === 'chase' ? 0.5 : 0.16;
    v += (Math.sin(2 * Math.PI * 48 * hb) * Math.exp(-hb * 22) + (hb > 0.16 ? Math.sin(2 * Math.PI * 44 * (hb - 0.16)) * Math.exp(-(hb - 0.16) * 26) * 0.7 : 0)) * amp;
    out[i] = v;
  }
  // fade in / out
  for (let i = 0; i < SR * 2; i++) { out[i] *= i / (SR * 2); out[N - 1 - i] *= i / (SR * 2); }
  const V3SFX = [['v3intro', 1.5, 'thunder'], ['v3timers', 3.6, 'tick'], ['v3timers', 8.4, 'tick'], ['v3power', 4.6, 'tick'], ['v3power', 13.0, 'hit'],
    ['v3evac', 0.5, 'hit'], ['v3evac', 11.6, 'hit'], ['v3blackout', 7.6, 'hit'], ['v3bluff', 8.6, 'hit'], ['v3report', 4.6, 'alarm'],
    ['v3last', 2.4, 'hit'], ['v3extras', 0.6, 'thunder'], ['v3outro', 2.2, 'thunder']];
  const OLDSFX = [['gun', 4.6, 'shot'], ['zombie', 5.0, 'hit'], ['chase', 4.05, 'hit'], ['meeting', 3.0, 'alarm'], ['numbers', 6.6, 'tick'], ['cure', 9.5, 'hit'], ['hook', 6.6, 'thunder'], ['outro', 2.2, 'thunder'], ['hunger', 6.0, 'growl'], ['meeting', 10.2, 'hit'], ['talk', 11.0, 'tick'], ['talk', 16.0, 'tick'], ['talk', 16.6, 'hit']];
  const sfx = FULL ? [...OLDSFX.filter(([id]) => id !== 'talk'), ...V3SFX] : V3 ? V3SFX : OLDSFX;
  const R = rng(3);
  sfx.forEach(([sid, at, type]) => {
    const s = TL.find((x) => (x.scene ?? x.id) === sid); if (!s) return; const i0 = Math.floor((s.start + at) * SR);
    const len = { shot: 0.6, hit: 0.5, alarm: 1.6, tick: 0.2, thunder: 2.5, growl: 1.2 }[type] * SR;
    let lp = 0;
    for (let j = 0; j < len && i0 + j < N; j++) {
      const u = j / SR; let v = 0;
      if (type === 'shot') { const n = R() * 2 - 1; lp += (n - lp) * 0.3; v = (n * 0.6 + lp) * Math.exp(-u * 14) * 0.9 + Math.sin(2 * Math.PI * 70 * u) * Math.exp(-u * 10) * 0.5; }
      if (type === 'hit') v = Math.sin(2 * Math.PI * (90 - u * 60) * u) * Math.exp(-u * 8) * 0.6;
      if (type === 'alarm') v = Math.sign(Math.sin(2 * Math.PI * (u % 0.4 < 0.2 ? 660 : 520) * u)) * 0.08 * Math.min(1, (1.6 - u) * 4);
      if (type === 'tick') v = Math.sin(2 * Math.PI * 1200 * u) * Math.exp(-u * 30) * 0.25;
      if (type === 'thunder') { const n = R() * 2 - 1; lp += (n - lp) * 0.02; v = lp * 3.2 * Math.exp(-u * 1.6) * Math.min(1, u * 8); }
      if (type === 'growl') { const n = R() * 2 - 1; lp += (n - lp) * 0.05; v = (lp * 2 + Math.sin(2 * Math.PI * 62 * u) * 0.3) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 9 * u)) * Math.sin(Math.PI * u / 1.2) * 0.8; }
      out[i0 + j] += v;
    }
  });
  const buf = Buffer.alloc(44 + N * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 2, 40);
  for (let i = 0; i < N; i++) buf.writeInt16LE(Math.round(clamp(out[i], -1, 1) * 32000), 44 + i * 2);
  fs.writeFileSync(file, buf);
}

// ---------- main ----------
const outDir = path.join(HERE, 'out'); fs.mkdirSync(outDir, { recursive: true });
const canvas = createCanvas(W, H); const ctx = canvas.getContext('2d');

if (process.argv.includes('--stills')) {
  const dir = path.join(outDir, FULL ? 'stills-full' : V3 ? 'stills-v3' : 'stills'); fs.mkdirSync(dir, { recursive: true });
  const at = process.argv.find((a) => a.startsWith('--at='));
  const picks = at ? at.slice(5).split(',').map((p) => { const [id, tt] = p.split('@'); return [id, +tt]; }) : TL.map((s) => [s.id, s.d * 0.6]);
  for (const [id, tt] of picks) {
    const s = TL.find((x) => x.id === id || x.scene === id); drawFrame(ctx, s.start + tt);
    fs.writeFileSync(path.join(dir, `${id}-${tt.toFixed(1)}.png`), await canvas.encode('png'));
    console.log('still', id, tt.toFixed(1));
  }
  console.log('total', TOTAL.toFixed(1), 's');
  process.exit(0);
}

const bed = path.join(outDir, FULL ? 'bed-full.wav' : V3 ? 'bed-v3.wav' : 'bed.wav'); writeBed(bed);
const outFile = path.join(outDir, FULL ? 'outbreak-deck-full-guide.mp4' : V3 ? 'outbreak-deck-v3-whats-new.mp4' : 'outbreak-deck-explainer.mp4');
const args = ['-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-', '-i', bed];
TL.forEach((s) => args.push('-i', s.file));
const delays = TL.map((s, i) => `[${i + 2}:a]aresample=44100,adelay=${Math.round((s.start + LEAD) * 1000)}:all=1,volume=1.6[v${i}]`).join(';');
const mix = `[1:a]volume=0.55[bg];${delays};[bg]${TL.map((_, i) => `[v${i}]`).join('')}amix=inputs=${TL.length + 1}:normalize=0:duration=first,alimiter=limit=0.95,aformat=channel_layouts=stereo[aout]`;
args.push('-filter_complex', mix, '-map', '0:v', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-t', TOTAL.toFixed(2), '-movflags', '+faststart', outFile);
const ff = spawn(ffmpegPath, args, { stdio: ['pipe', 'ignore', 'pipe'] });
let errTail = ''; ff.stderr.on('data', (d) => { errTail = (errTail + d).slice(-3000); });
const frames = Math.ceil(TOTAL * FPS); const t0 = Date.now();
for (let f = 0; f < frames; f++) {
  drawFrame(ctx, f / FPS);
  const data = ctx.getImageData(0, 0, W, H).data;
  if (!ff.stdin.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength))) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 300 === 0) console.log(`frame ${f}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
ff.on('close', (code) => { if (code) { console.error(errTail); process.exit(code); } console.log('done', outFile, TOTAL.toFixed(1) + 's'); });
