// The hazmat survivor in the ink & neon style, drawn in code at startup.
// Pear-shaped slate suit with 3-tone cel shading, chunky boots and gloves, reflective bands,
// twin air tanks with a ribbed hose to a big helmet (collar ring, cheek filter, head lamp)
// and a deep glass visor that glows in the player's colour.
//
// Built from named LAYERS (suit, trim, visor, helmetTop, backpack). Each layer has styles
// keyed by id; today every slot only has 'default'. A look is { suit: 'default', ... }.
//
// Frames (facing right; flipX for left): walk (8), idle (2), climb (6, seen from behind, no arms; reversed as 'climbdown'),
// duel (2, holding a card up) and down (1, a body on the floor).
// The visor is the face: expressions are a separate shared texture ('visor-faces') that
// Actor lays over the visor, using FACE_ANCHORS (where the visor centre is in each frame).
import { INK } from './inkArt.js';

const FW = 80;
const FH = 92;
const CX = 40; // frame centre
const FOOT = 86; // floor line inside the frame
export const LAYERS = ['suit', 'trim', 'visor', 'helmetTop', 'backpack'];
export const DEFAULT_LOOK = { suit: 'default', trim: 'default', visor: 'default', helmetTop: 'default', backpack: 'default' };
export const EXPRESSIONS = ['neutral', 'scared', 'angry', 'happy', 'suspicious', 'ko'];
/** Visor centre in each frame (frame pixels), its rotation and whether the face shows. */
export const FACE_ANCHORS = {};
const FACE_W = 30;
const FACE_H = 22;

// palette: slate suit (3 tones), rubber boots/gloves, helmet shell, visor glass
const C = {
  suit: '#3a4252', suitSh: '#252b37', suitHi: '#5b6679',
  far: '#2b313d', farSh: '#1b2029', farHi: '#3d4555',
  rubber: '#1c2029', rubberSh: '#111419', rubberHi: '#3a414e',
  shell: '#4a5467', shellSh: '#2b3240', shellHi: '#7a869a',
  tank: '#323947', tankSh: '#1f242d', tankHi: '#566173',
  glass: '#04060a',
};
const GLASS = C.glass;

// ------------------------------------------------------------ pen helpers
function outline(c, w = 2.2) {
  c.strokeStyle = INK;
  c.lineWidth = w;
  c.stroke();
}

function glowStroke(c, color, blur, draw) {
  c.save();
  c.shadowColor = color;
  c.shadowBlur = blur;
  c.strokeStyle = color;
  draw();
  c.restore();
}

/**
 * Fill a shape with 3-tone cel shading (light from the top-front), then ink it.
 * `path` builds the shape; s = shadow depth, hk = rim-light width.
 */
function cel(c, path, { base, sh, hi, s = 4, hk = 1.4, lw = 2.2 }) {
  c.save();
  path();
  c.clip();
  c.fillStyle = sh;
  path();
  c.fill();
  c.translate(s, -s);
  c.fillStyle = base;
  path();
  c.fill();
  c.translate(-s - hk, s + hk);
  if (hi) {
    c.strokeStyle = hi;
    c.lineWidth = hk * 2.2;
    path();
    c.stroke();
  }
  c.restore();
  path();
  outline(c, lw);
}

/** A tapered tube with round ends from a to b (limbs, sleeves). */
function tubePath(c, a, b, w0, w1) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  const ang = Math.atan2(dy, dx);
  c.beginPath();
  c.moveTo(a[0] + (nx * w0) / 2, a[1] + (ny * w0) / 2);
  c.lineTo(b[0] + (nx * w1) / 2, b[1] + (ny * w1) / 2);
  c.arc(b[0], b[1], w1 / 2, ang + Math.PI / 2, ang - Math.PI / 2, true);
  c.lineTo(a[0] - (nx * w0) / 2, a[1] - (ny * w0) / 2);
  c.arc(a[0], a[1], w0 / 2, ang - Math.PI / 2, ang + Math.PI / 2, true);
  c.closePath();
}

/** A reflective band across a tube at t (0..1 from a to b), in the player's colour. */
function band(c, a, b, t, width, accent) {
  const x = a[0] + (b[0] - a[0]) * t;
  const y = a[1] + (b[1] - a[1]) * t;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = (-(b[1] - a[1]) / L) * (width / 2);
  const ny = ((b[0] - a[0]) / L) * (width / 2);
  glowStroke(c, accent, 5, () => {
    c.lineWidth = 2.2;
    c.lineCap = 'butt';
    c.beginPath();
    c.moveTo(x + nx, y + ny);
    c.lineTo(x - nx, y - ny);
    c.stroke();
  });
}

/** Point on a limb: `len` from `from`, angle in radians from straight down (positive = forward). */
const reach = (from, a, len) => [from[0] + Math.sin(a) * len, from[1] + Math.cos(a) * len];

function tones(far) {
  return far ? { base: C.far, sh: C.farSh, hi: C.farHi } : { base: C.suit, sh: C.suitSh, hi: C.suitHi };
}

// ------------------------------------------------------------ parts
/** Chunky boot, toe forward. `at` = the ankle on the floor line. */
function boot(c, at, far) {
  const [x, y] = at;
  const path = () => {
    c.beginPath();
    c.moveTo(x - 6, y + 2);
    c.lineTo(x + 7, y + 2);
    c.quadraticCurveTo(x + 11, y + 2, x + 10, y - 2);
    c.quadraticCurveTo(x + 8, y - 6, x + 2, y - 6);
    c.lineTo(x - 5, y - 6);
    c.quadraticCurveTo(x - 7.5, y - 6, x - 7.5, y - 2);
    c.closePath();
  };
  cel(c, path, { base: far ? C.rubberSh : C.rubber, sh: C.rubberSh, hi: C.rubberHi, s: 2, hk: 1, lw: 1.8 });
  // sole
  c.strokeStyle = 'rgba(233,228,214,0.35)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x - 6, y);
  c.lineTo(x + 9, y);
  c.stroke();
}

/** A rubber glove with a thumb. */
function glove(c, at, far, open = false) {
  const [x, y] = at;
  const t = { base: far ? C.rubberSh : C.rubber, sh: C.rubberSh, hi: C.rubberHi, s: 2, hk: 1, lw: 1.8 };
  cel(c, () => {
    c.beginPath();
    c.arc(x + 2.6, y - 1.5, 2.4, 0, Math.PI * 2);
  }, t);
  cel(c, () => {
    c.beginPath();
    c.ellipse(x, y, open ? 4.6 : 5, open ? 5.4 : 5, 0, 0, Math.PI * 2);
  }, t);
}

/** Leg i (0 = far, 1 = near): suit tube, knee band, boot. */
function leg(c, p, i, accent) {
  const far = i === 0;
  const l = p.legs[i];
  const hip = [p.hip[0] + (far ? -2 : 2), p.hip[1] - 1];
  const foot = reach(hip, l.a, 11);
  foot[1] -= l.lift;
  cel(c, () => tubePath(c, hip, foot, 11, 9), { ...tones(far), s: 3 });
  band(c, hip, foot, 0.62, 9, accent);
  boot(c, [foot[0], foot[1] + 1], far);
}

/** Arm i (0 = far, 1 = near): sleeve, cuff band, glove. Holds a card in a duel. */
function arm(c, p, i, accent) {
  const far = i === 0;
  const s = [p.shoulder[0] + (far ? -3 : 0), p.shoulder[1]];
  const wrist = reach(s, p.arms[i], 10);
  const hand = reach(s, p.arms[i], 13.5);
  cel(c, () => tubePath(c, s, wrist, 10, 8), { ...tones(far), s: 3 });
  band(c, s, wrist, 0.9, 8, accent);
  if (!far && p.card) {
    c.save();
    c.translate(hand[0] + 2, hand[1] - 5);
    c.rotate(0.25);
    c.beginPath();
    c.roundRect(-6, -9, 12, 16, 2);
    c.fillStyle = INK;
    c.fill();
    c.strokeStyle = '#0a0c12';
    c.lineWidth = 1.2;
    c.stroke();
    c.fillStyle = '#20263a';
    c.fillRect(-3.5, -6.5, 7, 11);
    c.restore();
  }
  glove(c, hand, far, !far && p.card);
}

// ------------------------------------------------------------ climbing joints

/** The climbing rhythm at time t (-1..1): the right leg steps up while it is above 0, then the left. */
const reachOf = (t) => Math.sin(t * Math.PI * 2);

/** A climbing leg: hip, knee, foot on a rung. */
function climbLeg(p, side) {
  const u = reachOf(p.climbT) * side;
  const step = Math.max(0, u);
  const hip = [p.hip[0] + side * 6, p.hip[1] - 1];
  const foot = [side * 8, hip[1] + 15 - step * 9];
  const knee = [hip[0] + side * (3 + step * 4), hip[1] + 7 - step * 6];
  return { hip, knee, foot };
}

/** The pear-shaped suit body (wider at the hips). */
function torsoPath(c, p) {
  const [x, y] = p.hip;
  const top = y - 27;
  const bot = y + 3;
  c.beginPath();
  c.moveTo(x - 10, top + 2);
  c.quadraticCurveTo(x, top - 3, x + 10, top + 2);
  c.bezierCurveTo(x + 15.5, top + 10, x + 15.5, bot - 7, x + 11, bot);
  c.quadraticCurveTo(x, bot + 3, x - 11, bot);
  c.bezierCurveTo(x - 15.5, bot - 7, x - 15, top + 10, x - 10, top + 2);
  c.closePath();
}

function drawTorso(c, p, far) {
  const [x, y] = p.hip;
  cel(c, () => torsoPath(c, p), { ...tones(far), s: 6, hk: 1.5, lw: 2.4 });
  // zip seam (front in side view, middle from behind) and a fold at the hip
  const zx = p.view === 'back' ? x : x + 7;
  c.strokeStyle = 'rgba(233,228,214,0.4)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(zx, y - 21);
  c.quadraticCurveTo(zx + (p.view === 'back' ? 0 : 1.5), y - 10, zx, y - 2);
  c.stroke();
  c.setLineDash([1, 2]);
  c.beginPath();
  c.moveTo(zx + 1.6, y - 20);
  c.lineTo(zx + 1.6, y - 4);
  c.stroke();
  c.setLineDash([]);
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(x - 9, y - 2);
  c.quadraticCurveTo(x - 5, y - 5, x - 2, y - 2);
  c.stroke();
}

/** Rubber collar ring the helmet sits in. */
function collar(c, p) {
  const [x, y] = p.head;
  cel(c, () => {
    c.beginPath();
    c.ellipse(x - 1, y + 18, 14, 4.8, 0, 0, Math.PI * 2);
  }, { base: C.rubber, sh: C.rubberSh, hi: C.rubberHi, s: 1.5, hk: 1, lw: 2 });
}

/** The helmet shell, with a seam and (side view) a filter canister low at the back. */
function drawHelmet(c, p) {
  const [x, y] = p.head;
  cel(c, () => {
    c.beginPath();
    c.arc(x, y, 19.5, 0, Math.PI * 2);
  }, { base: C.shell, sh: C.shellSh, hi: C.shellHi, s: 6, hk: 1.6, lw: 2.6 });
  c.strokeStyle = 'rgba(233,228,214,0.28)';
  c.lineWidth = 1.1;
  c.beginPath();
  if (p.view === 'back') c.arc(x, y + 30, 32, Math.PI * 1.32, Math.PI * 1.68);
  else c.arc(x + 12, y + 3, 22, Math.PI * 1.02, Math.PI * 1.42);
  c.stroke();
}

/** Side view: a filter canister low on the cheek, over the visor's edge. */
function drawFilter(c, p) {
  const [x, y] = p.head;
  {
    c.save();
    c.translate(x - 13, y + 10);
    c.rotate(-0.45);
    cel(c, () => {
      c.beginPath();
      c.roundRect(-5, -4.5, 10, 9, 3);
    }, { base: C.tank, sh: C.tankSh, hi: C.tankHi, s: 2, hk: 1, lw: 1.8 });
    c.strokeStyle = 'rgba(233,228,214,0.45)';
    c.lineWidth = 0.9;
    for (const dx of [-2, 0.5, 3]) {
      c.beginPath();
      c.moveTo(dx, -3);
      c.lineTo(dx, 3);
      c.stroke();
    }
    c.restore();
  }
}

/** Visor glass shape: a big rounded window on the front of the helmet. */
function visorPath(c, x, y) {
  c.beginPath();
  c.roundRect(x - 9, y - 15, 30, 26, 11);
}

// ------------------------------------------------------------ layer styles
// Every drawer works in local coordinates: (0, 0) = between the feet, y up is negative.
// `p` is the pose: { view, bob, hip, shoulder, head, arms, legs, card } (see pose()).
const STYLES = {
  suit: {
    default: {
      back(c, p, accent) {
        arm(c, p, 0, accent);
        leg(c, p, 0, accent);
      },
      front(c, p, accent) {
        leg(c, p, 1, accent);
      },
      torso(c, p) {
        drawTorso(c, p, p.view === 'back');
        collar(c, p);
      },
      arm(c, p, accent) {
        arm(c, p, 1, accent);
      },
      /** Climbing, seen from behind: the legs step up rung by rung. `p.climbT` (0..1) runs the cycle. */
      climb(c, p, accent) {
        for (const side of [-1, 1]) {
          const { hip, knee, foot } = climbLeg(p, side);
          cel(c, () => tubePath(c, hip, knee, 11, 10), { ...tones(true), s: 3 });
          cel(c, () => tubePath(c, knee, foot, 10, 9), { ...tones(true), s: 3 });
          band(c, knee, foot, 0.25, 9, accent);
          // boot sole on the rung
          cel(c, () => {
            c.beginPath();
            c.roundRect(foot[0] - 6, foot[1] - 2, 12, 7, 3);
          }, { base: C.rubber, sh: C.rubberSh, hi: C.rubberHi, s: 2, hk: 1, lw: 1.8 });
        }
      },
    },
  },
  trim: {
    default(c, p, accent) {
      const [hx, hy] = p.hip;
      // belt: a glowing band around the waist, with a buckle at the front
      glowStroke(c, accent, 8, () => {
        c.lineWidth = 2.6;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(hx - 13, hy - 6);
        c.quadraticCurveTo(hx, hy - 3.5, hx + 13.5, hy - 6);
        c.stroke();
      });
      if (p.view === 'side') {
        c.fillStyle = INK;
        c.fillRect(hx + 6, hy - 7.5, 4, 3.5);
        // reflective shoulder chevron
        glowStroke(c, accent, 5, () => {
          c.lineWidth = 2;
          c.lineCap = 'round';
          c.beginPath();
          c.moveTo(hx + 2, hy - 21);
          c.lineTo(hx + 6, hy - 18);
          c.lineTo(hx + 10, hy - 21);
          c.stroke();
        });
      }
    },
  },
  backpack: {
    default(c, p, accent) {
      const [hx, hy] = p.hip;
      const tank = (x, w) => {
        cel(c, () => {
          c.beginPath();
          c.roundRect(x, hy - 30, w, 26, w / 2);
        }, { base: C.tank, sh: C.tankSh, hi: C.tankHi, s: 3, hk: 1.2, lw: 2 });
        // straps
        c.fillStyle = 'rgba(0,0,0,0.45)';
        c.fillRect(x + 1, hy - 24, w - 2, 2);
        c.fillRect(x + 1, hy - 11, w - 2, 2);
        // valve
        c.fillStyle = INK;
        c.fillRect(x + w / 2 - 1.5, hy - 33, 3, 3);
      };
      // ribbed hose from a valve up to the helmet
      const hose = (from, ctrl, to) => {
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(from[0], from[1]);
        c.quadraticCurveTo(ctrl[0], ctrl[1], to[0], to[1]);
        c.strokeStyle = INK;
        c.lineWidth = 6;
        c.stroke();
        c.strokeStyle = C.rubber;
        c.lineWidth = 3.4;
        c.stroke();
        c.setLineDash([1, 2.2]);
        c.strokeStyle = 'rgba(0,0,0,0.55)';
        c.lineWidth = 3.4;
        c.stroke();
        c.setLineDash([]);
      };
      const [x, y] = p.head;
      if (p.view === 'back') {
        tank(hx - 10, 9);
        tank(hx + 1, 9);
        hose([hx - 5.5, hy - 32], [hx - 16, hy - 40], [x - 13, y + 12]);
        hose([hx + 5.5, hy - 32], [hx + 16, hy - 40], [x + 13, y + 12]);
      } else {
        tank(hx - 24, 12);
        hose([hx - 18, hy - 32], [hx - 28, hy - 46], [x - 16, y + 6]);
      }
      // a tiny status light (the same colour as the suit trim: says nothing about the wearer)
      c.save();
      c.shadowColor = accent;
      c.shadowBlur = 6;
      c.fillStyle = accent;
      c.beginPath();
      c.arc(p.view === 'back' ? hx : hx - 18, hy - 8, 1.6, 0, Math.PI * 2);
      c.fill();
      c.restore();
    },
  },
  visor: {
    default(c, p, accent) {
      const [x, y] = p.head;
      c.save();
      c.beginPath();
      c.arc(x, y, 17.8, 0, Math.PI * 2);
      c.clip();
      visorPath(c, x, y);
      const g = c.createLinearGradient(x, y - 15, x, y + 11);
      g.addColorStop(0, '#0a0f18');
      g.addColorStop(0.55, GLASS);
      g.addColorStop(1, '#0d1624');
      c.fillStyle = g;
      c.fill();
      // the visor light pooling low in the glass
      c.globalAlpha = 0.32;
      const r = c.createRadialGradient(x + 8, y + 8, 1, x + 8, y + 8, 18);
      r.addColorStop(0, accent);
      r.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = r;
      c.fill();
      c.globalAlpha = 1;
      // inner shadow under the rim
      c.strokeStyle = 'rgba(0,0,0,0.8)';
      c.lineWidth = 3;
      visorPath(c, x + 0.8, y + 1);
      c.stroke();
      // highlights: a long streak, a small spark, a faint lower reflection
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(255,255,255,0.75)';
      c.lineWidth = 2.2;
      c.beginPath();
      c.arc(x + 6, y - 1, 11.5, Math.PI * 1.12, Math.PI * 1.42);
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.beginPath();
      c.arc(x + 15, y - 10, 1.4, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.14)';
      c.lineWidth = 1.6;
      c.beginPath();
      c.arc(x + 5, y - 6, 15, Math.PI * 0.18, Math.PI * 0.42);
      c.stroke();
      c.restore();
      // neon rim
      c.save();
      c.beginPath();
      c.arc(x, y, 18.8, 0, Math.PI * 2);
      c.clip();
      glowStroke(c, accent, 12, () => {
        c.lineWidth = 2.2;
        visorPath(c, x, y);
        c.stroke();
      });
      c.restore();
    },
  },
  helmetTop: {
    default(c, p, accent) {
      const [x, y] = p.head;
      // a small head lamp on the crown (a dim glow, the same for everyone)
      const back = p.view === 'back';
      c.save();
      c.translate(x + (back ? 0 : 6), y - 18.5);
      c.rotate(back ? 0 : 0.32);
      cel(c, () => {
        c.beginPath();
        c.roundRect(-5, -3.5, 10, 6, 2.5);
      }, { base: C.tank, sh: C.tankSh, hi: C.tankHi, s: 1.5, hk: 0.8, lw: 1.7 });
      if (!back) {
        c.shadowColor = accent;
        c.shadowBlur = 7;
        c.fillStyle = INK;
        c.beginPath();
        c.ellipse(5, -0.5, 1.4, 2.2, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    },
  },
};

function shadow(c, rx = 17) {
  c.fillStyle = 'rgba(0,0,0,0.55)';
  c.beginPath();
  c.ellipse(0, -1, rx, 3, 0, 0, Math.PI * 2);
  c.fill();
}

// ------------------------------------------------------------ poses
/** Joint positions for a pose. lean tilts the upper body forward around the hip. */
function pose({ view = 'side', bob = 0, arms = [0.1, -0.1], legs = [{ a: 0, lift: 0 }, { a: 0, lift: 0 }], lean = 0, card = false, climbUp = false, climbT = 0, sway = 0 }) {
  const hip = [sway, -13 + bob];
  const tilt = ([dx, dy]) => [hip[0] + dx * Math.cos(lean) - dy * Math.sin(lean), hip[1] + dx * Math.sin(lean) + dy * Math.cos(lean)];
  const p = { view, bob, lean, arms, legs, card, climbUp, climbT, hip, shoulder: tilt([3, -21]), head: tilt([1, -40]) };
  if (view === 'back') p.head = [sway * 0.5, -53 + bob]; // seen from behind: centred on the ladder
  return p;
}

const style = (layer, look) => STYLES[layer][look[layer]] ?? STYLES[layer].default;

function drawSideBody(c, p, accent, look) {
  const suit = style('suit', look);
  suit.back(c, p, accent);
  style('backpack', look)(c, p, accent);
  suit.front(c, p, accent);
  suit.torso(c, p);
  style('trim', look)(c, p, accent);
  drawHelmet(c, p);
  style('visor', look)(c, p, accent);
  drawFilter(c, p);
  style('helmetTop', look)(c, p, accent);
  suit.arm(c, p, accent);
}

function drawBackBody(c, p, accent, look) {
  const suit = style('suit', look);
  suit.climb(c, p, accent);
  suit.torso(c, p);
  style('trim', look)(c, p, accent);
  style('backpack', look)(c, p, accent);
  drawHelmet(c, p);
  style('helmetTop', look)(c, p, accent);
  // no arms from behind: at this size they read as long sticks, the stepping legs carry the motion
}

export const CLIMB_FRAMES = 6;

/** Frame list: [name, index, poseOptions, kind]. */
function frameList() {
  const list = [];
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    const s = Math.sin(t);
    const cs = Math.cos(t);
    list.push(['walk', i, {
      bob: -Math.abs(cs) * 2.2,
      lean: 0.07,
      arms: [s * 0.75, -s * 0.75],
      legs: [{ a: -s * 0.62, lift: Math.max(0, -cs) * 4 }, { a: s * 0.62, lift: Math.max(0, cs) * 4 }],
    }, 'side']);
  }
  list.push(['idle', 0, { bob: 0, arms: [0.12, -0.08] }, 'side']);
  list.push(['idle', 1, { bob: 0.9, arms: [0.16, -0.04] }, 'side']);
  for (let i = 0; i < CLIMB_FRAMES; i++) {
    const t = (i + 0.5) / CLIMB_FRAMES; // half a step in: one leg is always up
    // the body rises with each step and sways a little
    list.push(['climb', i, { view: 'back', climbT: t, bob: -Math.abs(Math.cos(t * Math.PI * 2)) * 1.5, sway: -Math.sin(t * Math.PI * 2) * 1.2 }, 'back']);
  }
  list.push(['duel', 0, { lean: 0.12, arms: [0.3, 1.35], card: true }, 'side']);
  list.push(['duel', 1, { lean: 0.1, bob: 0.8, arms: [0.35, 1.25], card: true }, 'side']);
  list.push(['down', 0, { arms: [0.5, -0.5], legs: [{ a: -0.15, lift: 0 }, { a: 0.15, lift: 0 }] }, 'down']);
  return list;
}

const DOWN_SHIFT = [36, -22]; // where the lying body sits (local, after turning it on its back)

/** Draw one frame into the sheet at x offset `ox`. Records the visor anchor. */
function drawFrame(c, ox, name, n, opts, kind, accent, look) {
  const p = pose(opts);
  c.save();
  c.translate(ox + CX, FOOT);
  if (kind === 'down') {
    c.save();
    c.scale(1.5, 1);
    shadow(c, 22);
    c.restore();
    c.translate(DOWN_SHIFT[0], DOWN_SHIFT[1]);
    c.rotate(-Math.PI / 2); // lying on the back: head to the left, visor up
    drawSideBody(c, p, accent, look);
  } else {
    shadow(c);
    if (kind === 'back') drawBackBody(c, p, accent, look);
    else drawSideBody(c, p, accent, look);
  }
  c.restore();
  const fx = p.head[0] + 6.5; // the face sits a little forward on the visor
  const fy = p.head[1] - 2; // the visor sits a little high on the helmet
  FACE_ANCHORS[`${name}${n}`] =
    kind === 'down'
      ? { x: CX + DOWN_SHIFT[0] + fy, y: FOOT + DOWN_SHIFT[1] - fx, rot: -Math.PI / 2, show: true }
      : { x: CX + fx, y: FOOT + fy, rot: 0, show: kind !== 'back' };
}

/**
 * Build the sprite sheet texture `key` and its animations. `look` picks a style per layer.
 * `res` draws it sharper for big displays (the menu); `only` limits it to some animations.
 */
export function createSurvivor(scene, key = 'survivor', accent = '#ff8a2a', look = DEFAULT_LOOK, { res = 1, only = null } = {}) {
  createVisorFaces(scene, res);
  if (scene.textures.exists(key)) return;
  const frames = frameList().filter(([name]) => !only || only.includes(name));
  const tex = scene.textures.createCanvas(key, FW * res * frames.length, FH * res);
  const c = tex.getContext();
  const full = { ...DEFAULT_LOOK, ...look };
  frames.forEach(([name, n, opts, kind], i) => {
    c.save();
    c.translate(i * FW * res, 0);
    c.scale(res, res);
    drawFrame(c, 0, name, n, opts, kind, accent, full);
    c.restore();
  });
  tex.refresh();
  frames.forEach(([name, n], i) => tex.add(`${name}${n}`, 0, i * FW * res, 0, FW * res, FH * res));
  const has = (name) => frames.some(([f]) => f === name);

  const anim = (name, count, rate) =>
    scene.anims.create({
      key: `${key}-${name}`,
      frames: Array.from({ length: count }, (_, i) => ({ key, frame: `${name}${i}` })),
      frameRate: rate,
      repeat: -1,
    });
  if (has('walk')) anim('walk', 8, 12);
  if (has('idle')) anim('idle', 2, 2);
  if (has('climb')) {
    anim('climb', CLIMB_FRAMES, 10);
    climbDown(scene, key, key);
  }
  if (has('duel')) anim('duel', 2, 3);
}

// ------------------------------------------------------------ the shared in-game sheet
// Every survivor in a match lives in shared pages ('survivors-0', 'survivors-1'), 8 per page,
// a row per colour + look, so the whole cast batches into one or two draw calls on phones
// (their pipeline uses one texture at a time). Drawn at 2x and shown at half size, so the
// shading stays crisp when the camera zooms in (1x on GPUs with small texture limits).
const PAGE_ROWS = 8;
let sheet = null; // { res, rows: Map(key -> { page, row }), pages: [] }

export const survivorKey = (accent, look = DEFAULT_LOOK) => `surv-${accent}-${LAYERS.map((l) => look[l] ?? 'default').join('.')}`;

function openSheet(scene) {
  if (sheet && scene.textures.exists(sheet.pages[0])) return sheet;
  const max = scene.renderer?.getMaxTextureSize?.() ?? 4096;
  const res = FW * 2 * frameList().length <= max ? 2 : 1;
  sheet = { res, rows: new Map(), pages: [] };
  addPage(scene);
  return sheet;
}

function addPage(scene) {
  const key = `survivors-${sheet.pages.length}`;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.createCanvas(key, FW * sheet.res * frameList().length, FH * sheet.res * PAGE_ROWS);
  sheet.pages.push(key);
}

/** Make sure the survivor in `accent` (+ look) is in the shared sheet. Returns its key. */
export function createSurvivorRow(scene, accent, look = DEFAULT_LOOK) {
  const key = survivorKey(accent, look);
  const sh = openSheet(scene);
  createVisorFaces(scene, sh.res);
  if (sh.rows.has(key)) return key;
  const index = sh.rows.size;
  if (Math.floor(index / PAGE_ROWS) >= sh.pages.length) addPage(scene);
  const page = sh.pages[Math.floor(index / PAGE_ROWS)];
  const row = index % PAGE_ROWS;
  sh.rows.set(key, { page, row });
  const tex = scene.textures.get(page);
  const c = tex.getContext();
  const r = sh.res;
  const full = { ...DEFAULT_LOOK, ...look };
  frameList().forEach(([name, n, opts, kind], i) => {
    c.save();
    c.translate(i * FW * r, row * FH * r);
    c.scale(r, r);
    drawFrame(c, 0, name, n, opts, kind, accent, full);
    c.restore();
    const frame = `${key}:${name}${n}`;
    tex.add(frame, 0, i * FW * r, row * FH * r, FW * r, FH * r);
    FACE_ANCHORS[frame] = FACE_ANCHORS[`${name}${n}`];
  });
  // upload once before the next frame, however many rows were added
  if (!tex.pendingRefresh) {
    tex.pendingRefresh = true;
    scene.events.once('prerender', () => {
      tex.pendingRefresh = false;
      tex.refresh();
    });
  }
  const anim = (name, count, rate) =>
    scene.anims.exists(`${key}-${name}`) ||
    scene.anims.create({
      key: `${key}-${name}`,
      frames: Array.from({ length: count }, (_, i) => ({ key: page, frame: `${key}:${name}${i}` })),
      frameRate: rate,
      repeat: -1,
    });
  anim('walk', 8, 12);
  anim('idle', 2, 2);
  anim('climb', CLIMB_FRAMES, 10);
  climbDown(scene, key, page);
  anim('duel', 2, 3);
  return key;
}

/** Going down a ladder: the climb cycle played backwards. */
function climbDown(scene, key, texture) {
  if (scene.anims.exists(`${key}-climbdown`)) return;
  const prefix = texture === key ? '' : `${key}:`;
  scene.anims.create({
    key: `${key}-climbdown`,
    frames: Array.from({ length: CLIMB_FRAMES }, (_, i) => ({ key: texture, frame: `${prefix}climb${CLIMB_FRAMES - 1 - i}` })),
    frameRate: 10,
    repeat: -1,
  });
}

/** Texture + first frame for a survivor made by createSurvivorRow. */
export const survivorTexture = (scene, key) => [sheet.rows.get(key).page, `${key}:idle0`];

/** How much sharper than 1x the in-game sheet is drawn (sprites show at 1 / this). */
export const survivorRes = () => sheet?.res ?? 1;

// ------------------------------------------------------------ visor faces (shared, white: tinted per player)
const FACE_DRAW = {
  neutral(c) {
    for (const x of [10, 21]) {
      c.beginPath();
      c.roundRect(x - 2, 6, 4, 9, 2);
      c.fill();
    }
  },
  scared(c) {
    c.lineWidth = 1.8;
    for (const x of [10, 21]) {
      c.beginPath();
      c.arc(x, 10, 3.8, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(x + 0.8, 10, 1.3, 0, Math.PI * 2);
      c.fill();
    }
    c.lineWidth = 1.5;
    c.beginPath();
    c.ellipse(16, 18, 2.2, 1.6, 0, 0, Math.PI * 2);
    c.stroke();
  },
  angry(c) {
    const eye = (x, hiLeft) => {
      c.beginPath();
      c.moveTo(x - 3.5, hiLeft ? 6 : 9);
      c.lineTo(x + 3.5, hiLeft ? 9 : 6);
      c.lineTo(x + 3.5, 14);
      c.lineTo(x - 3.5, 14);
      c.closePath();
      c.fill();
    };
    eye(10, true);
    eye(21, false);
  },
  happy(c) {
    c.lineWidth = 2.4;
    c.lineCap = 'round';
    for (const x of [10, 21]) {
      c.beginPath();
      c.arc(x, 12, 3.6, Math.PI * 1.05, Math.PI * 1.95);
      c.stroke();
    }
    c.lineWidth = 1.6;
    c.beginPath();
    c.arc(16, 15, 3.2, Math.PI * 0.15, Math.PI * 0.85);
    c.stroke();
  },
  suspicious(c) {
    c.beginPath();
    c.roundRect(6.5, 10, 7, 3, 1.5);
    c.fill();
    c.beginPath();
    c.roundRect(17.5, 9, 7, 4.5, 1.5);
    c.fill();
    c.lineWidth = 1.6;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(17, 5.5);
    c.lineTo(25, 7);
    c.stroke();
  },
  ko(c) {
    c.lineWidth = 2;
    c.lineCap = 'round';
    for (const x of [10, 21]) {
      c.beginPath();
      c.moveTo(x - 3, 7);
      c.lineTo(x + 3, 13);
      c.moveTo(x + 3, 7);
      c.lineTo(x - 3, 13);
      c.stroke();
    }
  },
};

export const facesKey = (res = 1) => (res === 1 ? 'visor-faces' : `visor-faces@${res}`);

/** One shared sheet of glowing visor expressions (white, so each player tints it). */
export function createVisorFaces(scene, res = 1) {
  const key = facesKey(res);
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, FACE_W * res * EXPRESSIONS.length, FACE_H * res);
  const c = tex.getContext();
  EXPRESSIONS.forEach((name, i) => {
    c.save();
    c.translate(i * FACE_W * res, 0);
    c.scale(res, res);
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#ffffff';
    c.shadowColor = '#ffffff';
    c.shadowBlur = 5;
    FACE_DRAW[name](c);
    c.restore();
  });
  tex.refresh();
  EXPRESSIONS.forEach((name, i) => tex.add(name, 0, i * FACE_W * res, 0, FACE_W * res, FACE_H * res));
}

/** The visor-face colour for a player: their accent, washed towards white so it reads as light. */
export function faceTint(accent) {
  const n = parseInt(accent.replace('#', ''), 16);
  const mix = (v) => Math.round(v + (255 - v) * 0.55);
  return (mix((n >> 16) & 255) << 16) | (mix((n >> 8) & 255) << 8) | mix(n & 255);
}

// ------------------------------------------------------------ portraits (meeting tiles, result rows)
/** A small front-view portrait of a player's helmet + visor. Returns its texture key. */
export function createPortrait(scene, accent, look = DEFAULT_LOOK) {
  const key = `portrait-${accent}`;
  if (scene.textures.exists(key)) return key;
  const S = 64;
  const tex = scene.textures.createCanvas(key, S, S);
  const c = tex.getContext();
  const x = S / 2;
  const y = S / 2 - 1;
  // collar + shoulders
  cel(c, () => {
    c.beginPath();
    c.ellipse(x, y + 25, 22, 7, 0, 0, Math.PI * 2);
  }, { base: C.suit, sh: C.suitSh, hi: C.suitHi, s: 2, hk: 1, lw: 2.4 });
  cel(c, () => {
    c.beginPath();
    c.ellipse(x, y + 20, 15, 5, 0, 0, Math.PI * 2);
  }, { base: C.rubber, sh: C.rubberSh, hi: C.rubberHi, s: 1.5, hk: 1, lw: 2.2 });
  // filter canisters on both cheeks
  for (const side of [-1, 1]) {
    c.save();
    c.translate(x + side * 17, y + 12);
    c.rotate(side * 0.5);
    cel(c, () => {
      c.beginPath();
      c.roundRect(-5, -5, 10, 10, 3);
    }, { base: C.tank, sh: C.tankSh, hi: C.tankHi, s: 2, hk: 1, lw: 2 });
    c.restore();
  }
  // shell
  cel(c, () => {
    c.beginPath();
    c.arc(x, y, 22, 0, Math.PI * 2);
  }, { base: C.shell, sh: C.shellSh, hi: C.shellHi, s: 6, hk: 1.8, lw: 3 });
  // head lamp
  cel(c, () => {
    c.beginPath();
    c.roundRect(x - 6, y - 26, 12, 7, 3);
  }, { base: C.tank, sh: C.tankSh, hi: C.tankHi, s: 1.5, hk: 1, lw: 2 });
  c.save();
  c.shadowColor = accent;
  c.shadowBlur = 8;
  c.fillStyle = INK;
  c.beginPath();
  c.ellipse(x, y - 22.5, 3, 1.8, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // visor, front on
  const visor = () => {
    c.beginPath();
    c.roundRect(x - 16, y - 12, 32, 24, 11);
  };
  visor();
  const g = c.createLinearGradient(x, y - 12, x, y + 12);
  g.addColorStop(0, '#0a0f18');
  g.addColorStop(0.55, GLASS);
  g.addColorStop(1, '#0d1624');
  c.fillStyle = g;
  c.fill();
  c.save();
  visor();
  c.clip();
  c.globalAlpha = 0.32;
  const r = c.createRadialGradient(x, y + 8, 1, x, y + 8, 18);
  r.addColorStop(0, accent);
  r.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = r;
  c.fill();
  c.restore();
  glowStroke(c, accent, 10, () => {
    c.lineWidth = 2.4;
    visor();
    c.stroke();
  });
  // neutral eyes in the face colour
  const t = faceTint(accent);
  const eye = `rgb(${(t >> 16) & 255},${(t >> 8) & 255},${t & 255})`;
  c.save();
  c.fillStyle = eye;
  c.shadowColor = eye;
  c.shadowBlur = 6;
  for (const ex of [x - 6, x + 6]) {
    c.beginPath();
    c.roundRect(ex - 2.4, y - 5, 4.8, 10, 2.4);
    c.fill();
  }
  c.restore();
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineWidth = 2;
  c.lineCap = 'round';
  c.beginPath();
  c.arc(x - 1, y + 2, 13, Math.PI * 1.08, Math.PI * 1.36);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.beginPath();
  c.arc(x + 10, y - 7, 1.4, 0, Math.PI * 2);
  c.fill();
  tex.refresh();
  return key;
}

export const SURVIVOR_SIZE = { width: FW, height: FH };
