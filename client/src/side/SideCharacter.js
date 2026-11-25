// The hazmat survivor in the ink & neon style, drawn in code at startup.
// Chunky suit, big rounded helmet with a wide glowing visor, short limbs, small backpack.
//
// Built from named LAYERS (suit, trim, visor, helmetTop, backpack). Each layer has styles
// keyed by id; today every slot only has 'default'. A look is { suit: 'default', ... }.
//
// Frames (facing right; flipX for left): walk (8), idle (2), climb (4, seen from behind),
// duel (2, holding a card up) and down (1, a body on the floor).
// The visor is the face: expressions are a separate shared texture ('visor-faces') that
// Actor lays over the visor, using FACE_ANCHORS (where the visor centre is in each frame).
import { INK } from './inkArt.js';

const FW = 80;
const FH = 92;
const CX = 40; // frame centre
const FOOT = 86; // floor line inside the frame
const SUIT = '#1c212b';
const SUIT_BACK = '#12161d';
const SUIT_HI = 'rgba(233,228,214,0.10)';
const GLASS = '#05070b';

export const LAYERS = ['suit', 'trim', 'visor', 'helmetTop', 'backpack'];
export const DEFAULT_LOOK = { suit: 'default', trim: 'default', visor: 'default', helmetTop: 'default', backpack: 'default' };
export const EXPRESSIONS = ['neutral', 'scared', 'angry', 'happy', 'suspicious', 'ko'];
/** Visor centre in each frame (frame pixels), its rotation and whether the face shows. */
export const FACE_ANCHORS = {};
const FACE_W = 30;
const FACE_H = 22;

// ------------------------------------------------------------ pen helpers
function outline(c, w = 2.2) {
  c.strokeStyle = INK;
  c.lineWidth = w;
  c.stroke();
}

function limb(c, from, to, width, fill) {
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(from[0], from[1]);
  c.lineTo(to[0], to[1]);
  c.strokeStyle = INK;
  c.lineWidth = width + 3.2;
  c.stroke();
  c.strokeStyle = fill;
  c.lineWidth = width;
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

/** Point on a limb: `len` from `from`, angle in radians from straight down (positive = forward). */
const reach = (from, a, len) => [from[0] + Math.sin(a) * len, from[1] + Math.cos(a) * len];

// ------------------------------------------------------------ layer styles
// Every drawer works in local coordinates: (0, 0) = between the feet, y up is negative.
// `p` is the pose: { view, bob, hip, shoulder, head, arms, legs, card } (see pose()).
const STYLES = {
  suit: {
    default: {
      /** Limbs behind the body (side view) */
      back(c, p) {
        limb(c, p.shoulder, reach(p.shoulder, p.arms[0], 11), 8, SUIT_BACK);
        mitten(c, reach(p.shoulder, p.arms[0], 12), SUIT_BACK);
        const foot = legEnd(p, 0);
        limb(c, [p.hip[0] - 2, p.hip[1]], foot, 9, SUIT_BACK);
        boot(c, foot, SUIT_BACK);
      },
      front(c, p) {
        const foot = legEnd(p, 1);
        limb(c, [p.hip[0] + 2, p.hip[1]], foot, 9, SUIT);
        boot(c, foot, SUIT);
      },
      torso(c, p) {
        const [hx, hy] = p.hip;
        c.beginPath();
        c.roundRect(hx - 13, hy - 26, 26, 30, 11);
        c.fillStyle = p.view === 'back' ? SUIT_BACK : SUIT;
        c.fill();
        outline(c, 2.4);
        // soft fold highlight and a seam
        c.fillStyle = SUIT_HI;
        c.beginPath();
        c.roundRect(hx - 9, hy - 22, 6, 18, 3);
        c.fill();
        c.strokeStyle = 'rgba(233,228,214,0.35)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(hx + (p.view === 'back' ? 0 : 5), hy - 22);
        c.lineTo(hx + (p.view === 'back' ? 0 : 5), hy - 2);
        c.stroke();
      },
      /** The arm in front of everything (side view): also holds the card in a duel. */
      arm(c, p) {
        const hand = reach(p.shoulder, p.arms[1], 12);
        limb(c, p.shoulder, reach(p.shoulder, p.arms[1], 11), 8, SUIT);
        if (p.card) {
          c.save();
          c.translate(hand[0] + 2, hand[1] - 4);
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
        mitten(c, hand, SUIT);
      },
      /** Climbing: everything seen from behind. */
      climb(c, p) {
        const up = p.climbUp;
        const [hx, hy] = p.hip;
        for (const [side, high] of [[-1, up], [1, !up]]) {
          const foot = [hx + side * 7, hy + (high ? 8 : 14)];
          limb(c, [hx + side * 6, hy], foot, 9, SUIT_BACK);
          c.beginPath();
          c.roundRect(foot[0] - 5, foot[1] - 3, 10, 6, 2);
          c.fillStyle = SUIT_BACK;
          c.fill();
          outline(c, 1.6);
        }
      },
      climbArms(c, p) {
        const up = p.climbUp;
        const [sx, sy] = p.shoulder;
        for (const [side, high] of [[-1, up], [1, !up]]) {
          const hand = [sx + side * 15, sy - (high ? 26 : 16)];
          limb(c, [sx + side * 9, sy], hand, 8, SUIT);
          mitten(c, hand, SUIT);
        }
      },
    },
  },
  trim: {
    default(c, p, accent) {
      const [hx, hy] = p.hip;
      glowStroke(c, accent, 8, () => {
        c.lineWidth = 2.4;
        c.lineCap = 'round';
        // belt band
        c.beginPath();
        c.moveTo(hx - 11, hy - 7);
        c.lineTo(hx + 11, hy - 7);
        c.stroke();
        // collar ring under the helmet
        c.lineWidth = 2;
        c.beginPath();
        c.ellipse(p.head[0] - 1, p.head[1] + 19, 11, 3, 0, 0, Math.PI);
        c.stroke();
      });
      if (p.view === 'side') {
        // little reflective chest patch
        c.fillStyle = accent;
        c.globalAlpha = 0.85;
        c.beginPath();
        c.roundRect(hx + 6, hy - 19, 5, 5, 1.5);
        c.fill();
        c.globalAlpha = 1;
      }
    },
  },
  backpack: {
    default(c, p, accent) {
      const [hx, hy] = p.hip;
      c.beginPath();
      if (p.view === 'back') c.roundRect(hx - 9, hy - 25, 18, 22, 5);
      else c.roundRect(hx - 22, hy - 25, 12, 22, 5);
      c.fillStyle = '#161a22';
      c.fill();
      outline(c, 2);
      // vent lines + a tiny status LED (same colour for everyone: says nothing about the wearer)
      const x0 = p.view === 'back' ? hx - 5 : hx - 19;
      c.strokeStyle = 'rgba(233,228,214,0.45)';
      c.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(x0, hy - 19 + i * 4);
        c.lineTo(x0 + (p.view === 'back' ? 10 : 6), hy - 19 + i * 4);
        c.stroke();
      }
      c.save();
      c.shadowColor = accent;
      c.shadowBlur = 6;
      c.fillStyle = accent;
      c.beginPath();
      c.arc(x0 + (p.view === 'back' ? 5 : 3), hy - 6, 1.6, 0, Math.PI * 2);
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
      c.beginPath();
      c.roundRect(x - 9, y - 14, 30, 28, 11);
      const g = c.createLinearGradient(x, y - 14, x, y + 14);
      g.addColorStop(0, GLASS);
      g.addColorStop(1, '#0c1119');
      c.fillStyle = g;
      c.fill();
      // inner glow of the visor light
      c.globalAlpha = 0.22;
      const r = c.createRadialGradient(x + 7, y, 1, x + 7, y, 16);
      r.addColorStop(0, accent);
      r.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = r;
      c.fill();
      c.globalAlpha = 1;
      c.restore();
      // neon rim
      glowStroke(c, accent, 12, () => {
        c.lineWidth = 2.2;
        c.beginPath();
        c.roundRect(x - 9, y - 14, 29, 28, 11);
        c.save();
        c.beginPath();
        c.arc(x, y, 18.6, 0, Math.PI * 2);
        c.clip();
        c.beginPath();
        c.roundRect(x - 9, y - 14, 29, 28, 11);
        c.stroke();
        c.restore();
      });
      // gloss
      c.strokeStyle = 'rgba(255,255,255,0.55)';
      c.lineWidth = 1.6;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(x + 4, y - 1, 9, Math.PI * 1.1, Math.PI * 1.45);
      c.stroke();
    },
  },
  helmetTop: {
    default(c, p, accent) {
      const [x, y] = p.head;
      // a small filter vent on the crown
      c.beginPath();
      c.roundRect(x - 6, y - 23, 12, 6, 3);
      c.fillStyle = '#161a22';
      c.fill();
      outline(c, 1.8);
      c.fillStyle = accent;
      c.globalAlpha = 0.7;
      c.fillRect(x - 3, y - 21, 6, 1.5);
      c.globalAlpha = 1;
    },
  },
};

function mitten(c, at, fill) {
  c.beginPath();
  c.arc(at[0], at[1], 4.6, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  outline(c, 1.8);
}

function boot(c, at, fill) {
  c.beginPath();
  c.roundRect(at[0] - 5, at[1] - 3, 12, 6, [2, 4, 2, 2]);
  c.fillStyle = fill;
  c.fill();
  outline(c, 1.6);
}

function legEnd(p, i) {
  const l = p.legs[i];
  const f = reach([p.hip[0] + (i ? 2 : -2), p.hip[1]], l.a, 11);
  return [f[0], f[1] - l.lift];
}

function drawHelmet(c, p) {
  const [x, y] = p.head;
  c.beginPath();
  c.arc(x, y, 19, 0, Math.PI * 2);
  const g = c.createRadialGradient(x - 6, y - 8, 2, x, y, 20);
  g.addColorStop(0, '#2c3240');
  g.addColorStop(1, p.view === 'back' ? SUIT_BACK : SUIT);
  c.fillStyle = g;
  c.fill();
  outline(c, 2.6);
  if (p.view === 'back') {
    // seam across the back of the helmet
    c.strokeStyle = 'rgba(233,228,214,0.3)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(x, y + 30, 32, Math.PI * 1.32, Math.PI * 1.68);
    c.stroke();
  }
}

function shadow(c, rx = 17) {
  c.fillStyle = 'rgba(0,0,0,0.55)';
  c.beginPath();
  c.ellipse(0, -1, rx, 3, 0, 0, Math.PI * 2);
  c.fill();
}

// ------------------------------------------------------------ poses
/** Joint positions for a pose. lean tilts the upper body forward around the hip. */
function pose({ view = 'side', bob = 0, arms = [0.1, -0.1], legs = [{ a: 0, lift: 0 }, { a: 0, lift: 0 }], lean = 0, card = false, climbUp = false }) {
  const hip = [0, -13 + bob];
  const tilt = ([dx, dy]) => [hip[0] + dx * Math.cos(lean) - dy * Math.sin(lean), hip[1] + dx * Math.sin(lean) + dy * Math.cos(lean)];
  return { view, bob, lean, arms, legs, card, climbUp, hip, shoulder: tilt([3, -20]), head: tilt([1, -40]) };
}

function drawSideBody(c, p, accent, look) {
  const suit = STYLES.suit[look.suit] ?? STYLES.suit.default;
  suit.back(c, p);
  (STYLES.backpack[look.backpack] ?? STYLES.backpack.default)(c, p, accent);
  suit.front(c, p);
  suit.torso(c, p);
  (STYLES.trim[look.trim] ?? STYLES.trim.default)(c, p, accent);
  drawHelmet(c, p);
  (STYLES.visor[look.visor] ?? STYLES.visor.default)(c, p, accent);
  (STYLES.helmetTop[look.helmetTop] ?? STYLES.helmetTop.default)(c, p, accent);
  suit.arm(c, p);
}

function drawBackBody(c, p, accent, look) {
  const suit = STYLES.suit[look.suit] ?? STYLES.suit.default;
  suit.climb(c, p);
  suit.torso(c, p);
  (STYLES.trim[look.trim] ?? STYLES.trim.default)(c, p, accent);
  drawHelmet(c, p);
  (STYLES.helmetTop[look.helmetTop] ?? STYLES.helmetTop.default)(c, p, accent);
  (STYLES.backpack[look.backpack] ?? STYLES.backpack.default)(c, p, accent);
  suit.climbArms(c, p);
}

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
  for (let i = 0; i < 4; i++) list.push(['climb', i, { view: 'back', climbUp: i < 2, bob: i % 2 ? -1 : 0 }, 'back']);
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
  const fy = p.head[1];
  FACE_ANCHORS[`${name}${n}`] =
    kind === 'down'
      ? { x: CX + DOWN_SHIFT[0] + fy, y: FOOT + DOWN_SHIFT[1] - fx, rot: -Math.PI / 2, show: true }
      : { x: CX + fx, y: FOOT + fy, rot: 0, show: kind !== 'back' };
}

/** Build the sprite sheet texture `key` and its animations. `look` picks a style per layer. */
export function createSurvivor(scene, key = 'survivor', accent = '#ff8a2a', look = DEFAULT_LOOK) {
  createVisorFaces(scene);
  if (scene.textures.exists(key)) return;
  const frames = frameList();
  const tex = scene.textures.createCanvas(key, FW * frames.length, FH);
  const c = tex.getContext();
  const full = { ...DEFAULT_LOOK, ...look };
  frames.forEach(([name, n, opts, kind], i) => drawFrame(c, i * FW, name, n, opts, kind, accent, full));
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
  anim('duel', 2, 3);
}

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

/** One shared sheet of glowing visor expressions (white, so each player tints it). */
export function createVisorFaces(scene) {
  if (scene.textures.exists('visor-faces')) return;
  const tex = scene.textures.createCanvas('visor-faces', FACE_W * EXPRESSIONS.length, FACE_H);
  const c = tex.getContext();
  EXPRESSIONS.forEach((name, i) => {
    c.save();
    c.translate(i * FACE_W, 0);
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#ffffff';
    c.shadowColor = '#ffffff';
    c.shadowBlur = 5;
    FACE_DRAW[name](c);
    c.restore();
  });
  tex.refresh();
  EXPRESSIONS.forEach((name, i) => tex.add(name, 0, i * FACE_W, 0, FACE_W, FACE_H));
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
  const y = S / 2 + 1;
  // collar
  c.beginPath();
  c.roundRect(x - 18, y + 17, 36, 14, 7);
  c.fillStyle = SUIT;
  c.fill();
  outline(c, 2.4);
  glowStroke(c, accent, 8, () => {
    c.lineWidth = 2.4;
    c.beginPath();
    c.ellipse(x, y + 20, 14, 3.5, 0, 0, Math.PI);
    c.stroke();
  });
  // shell
  c.beginPath();
  c.arc(x, y, 23, 0, Math.PI * 2);
  const g = c.createRadialGradient(x - 8, y - 10, 2, x, y, 24);
  g.addColorStop(0, '#2c3240');
  g.addColorStop(1, SUIT);
  c.fillStyle = g;
  c.fill();
  outline(c, 3);
  (STYLES.helmetTop[look.helmetTop] ?? STYLES.helmetTop.default)(c, { head: [x, y - 5] }, accent);
  // visor, front on
  c.beginPath();
  c.roundRect(x - 17, y - 11, 34, 25, 11);
  c.fillStyle = GLASS;
  c.fill();
  glowStroke(c, accent, 10, () => {
    c.lineWidth = 2.4;
    c.stroke();
  });
  c.save();
  c.globalAlpha = 0.25;
  const r = c.createRadialGradient(x, y + 1, 1, x, y + 1, 17);
  r.addColorStop(0, accent);
  r.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = r;
  c.fill();
  c.restore();
  // neutral eyes in the face colour
  const t = faceTint(accent);
  const eye = `rgb(${(t >> 16) & 255},${(t >> 8) & 255},${t & 255})`;
  c.save();
  c.fillStyle = eye;
  c.shadowColor = eye;
  c.shadowBlur = 6;
  for (const ex of [x - 6, x + 6]) {
    c.beginPath();
    c.roundRect(ex - 2.4, y - 5, 4.8, 11, 2.4);
    c.fill();
  }
  c.restore();
  c.strokeStyle = 'rgba(255,255,255,0.5)';
  c.lineWidth = 1.8;
  c.lineCap = 'round';
  c.beginPath();
  c.arc(x - 2, y + 2, 13, Math.PI * 1.08, Math.PI * 1.38);
  c.stroke();
  tex.refresh();
  return key;
}

export const SURVIVOR_SIZE = { width: FW, height: FH };
