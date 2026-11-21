// Side-view survivor in the ink & neon style, drawn in code.
// Frames: walk (8), idle (2), climb (4). Facing right; flipX for left.
import { INK } from './inkArt.js';

const FW = 56;
const FH = 84;
const BODY = '#0b0b0e';
const BACK = '#1d1d22';

function limb(c, pts, width, fill) {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
  c.strokeStyle = INK;
  c.lineWidth = width + 3;
  c.stroke();
  c.strokeStyle = fill;
  c.lineWidth = width;
  c.stroke();
}

/** Two-segment limb from a joint: angles in radians from straight down. */
function leg(hip, a1, a2, len = 15) {
  const knee = [hip[0] + Math.sin(a1) * len, hip[1] + Math.cos(a1) * len];
  const foot = [knee[0] + Math.sin(a1 + a2) * len, knee[1] + Math.cos(a1 + a2) * len];
  return [hip, knee, foot];
}

function drawSide(c, ox, phase, accent, walking) {
  const s = Math.sin(phase * Math.PI * 2);
  const cs = Math.cos(phase * Math.PI * 2);
  const bob = walking ? Math.abs(cs) * -2 : Math.sin(phase * Math.PI * 2) * 0.8;
  const hipX = ox + 27;
  const hipY = 52 + bob;
  const swing = walking ? 0.55 : 0;

  // shadow
  c.fillStyle = 'rgba(0,0,0,0.55)';
  c.beginPath();
  c.ellipse(ox + 28, FH - 3, 15, 3, 0, 0, Math.PI * 2);
  c.fill();

  const backLeg = leg([hipX, hipY], -s * swing, walking ? Math.max(0, -cs) * -0.7 : 0);
  const frontLeg = leg([hipX, hipY], s * swing, walking ? Math.max(0, cs) * -0.7 : 0);
  const shoulder = [hipX + 2, hipY - 22];
  const backArm = leg(shoulder, s * swing * 0.8, -0.4, 12);
  const frontArm = leg(shoulder, -s * swing * 0.8, -0.4, 12);

  limb(c, backArm, 5, BACK);
  limb(c, backLeg, 6, BACK);
  // oxygen tank on the back
  c.fillStyle = BODY;
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.beginPath();
  c.roundRect(hipX - 17, hipY - 30, 9, 22, 3);
  c.fill();
  c.stroke();
  // torso
  c.beginPath();
  c.roundRect(hipX - 10, hipY - 28, 22, 30, 6);
  c.fillStyle = BODY;
  c.fill();
  c.lineWidth = 2.5;
  c.stroke();
  // neon chest band
  c.save();
  c.shadowColor = accent;
  c.shadowBlur = 8;
  c.strokeStyle = accent;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(hipX - 8, hipY - 12);
  c.lineTo(hipX + 10, hipY - 12);
  c.stroke();
  c.restore();
  limb(c, frontLeg, 6, BODY);
  // boots
  for (const f of [backLeg[2], frontLeg[2]]) {
    c.fillStyle = BODY;
    c.fillRect(f[0] - 3, f[1] - 3, 10, 5);
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    c.strokeRect(f[0] - 3, f[1] - 3, 10, 5);
  }
  // helmet + glowing visor
  const hx = hipX + 3;
  const hy = hipY - 39;
  c.beginPath();
  c.arc(hx, hy, 11, 0, Math.PI * 2);
  c.fillStyle = BODY;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 2.5;
  c.stroke();
  c.save();
  c.shadowColor = accent;
  c.shadowBlur = 12;
  c.fillStyle = accent;
  c.beginPath();
  c.roundRect(hx + 1, hy - 5, 11, 8, 3);
  c.fill();
  c.restore();
  c.fillStyle = 'rgba(255,255,255,0.8)';
  c.fillRect(hx + 4, hy - 4, 3, 2);
  limb(c, frontArm, 5, BODY);
}

function drawClimb(c, ox, phase, accent) {
  const up = phase < 0.5;
  const cx = ox + 28;
  const hipY = 52;
  limb(c, [[cx - 6, hipY], [cx - 8, hipY + (up ? 10 : 16)], [cx - 8, hipY + (up ? 22 : 30)]], 6, BODY);
  limb(c, [[cx + 6, hipY], [cx + 8, hipY + (up ? 16 : 10)], [cx + 8, hipY + (up ? 30 : 22)]], 6, BODY);
  c.beginPath();
  c.roundRect(cx - 12, hipY - 28, 24, 30, 6);
  c.fillStyle = BODY;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 2.5;
  c.stroke();
  c.beginPath();
  c.roundRect(cx - 6, hipY - 26, 12, 22, 3); // tank seen from behind
  c.stroke();
  limb(c, [[cx - 10, hipY - 24], [cx - 14, hipY - (up ? 38 : 30)], [cx - 12, hipY - (up ? 52 : 40)]], 5, BODY);
  limb(c, [[cx + 10, hipY - 24], [cx + 14, hipY - (up ? 30 : 38)], [cx + 12, hipY - (up ? 40 : 52)]], 5, BODY);
  c.beginPath();
  c.arc(cx, hipY - 39, 11, 0, Math.PI * 2);
  c.fillStyle = BODY;
  c.fill();
  c.stroke();
  c.save();
  c.shadowColor = accent;
  c.shadowBlur = 8;
  c.strokeStyle = accent;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(cx - 10, hipY - 12);
  c.lineTo(cx + 10, hipY - 12);
  c.stroke();
  c.restore();
}

/** Build the sprite sheet texture `key` and its animations. */
export function createSurvivor(scene, key = 'survivor', accent = '#ff8a2a') {
  if (scene.textures.exists(key)) return;
  const frames = [
    ...Array.from({ length: 8 }, (_, i) => ['walk', i, (c, ox) => drawSide(c, ox, i / 8, accent, true)]),
    ...Array.from({ length: 2 }, (_, i) => ['idle', i, (c, ox) => drawSide(c, ox, i / 2, accent, false)]),
    ...Array.from({ length: 4 }, (_, i) => ['climb', i, (c, ox) => drawClimb(c, ox, i / 4, accent)]),
  ];
  const tex = scene.textures.createCanvas(key, FW * frames.length, FH);
  const c = tex.getContext();
  frames.forEach(([, , draw], i) => draw(c, i * FW));
  tex.refresh();
  frames.forEach(([name, n], i) => tex.add(`${name}${n}`, 0, i * FW, 0, FW, FH));

  const anim = (name, count, rate) =>
    scene.anims.create({
      key: `${key}-${name}`,
      frames: Array.from({ length: count }, (_, i) => ({ key, frame: `${name}${i}` })),
      frameRate: rate,
      repeat: -1,
    });
  anim('walk', 8, 12);
  anim('idle', 2, 2);
  anim('climb', 4, 8);
}

export const SURVIVOR_SIZE = { width: FW, height: FH };
