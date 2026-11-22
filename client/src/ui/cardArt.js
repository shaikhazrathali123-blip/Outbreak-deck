// Card faces in the ink & neon style, drawn on canvases at 2x for crisp text.
// cardTexture(scene, card) returns a texture key (cached per face).
import { SUITS, SPECIAL_CARDS, INFECTED_CARDS } from '../../../shared/constants.js';

export const CARD_W = 88; // logical size; textures are 2x
export const CARD_H = 128;
const S = 2;
const W = CARD_W * S;
const H = CARD_H * S;
const INK = '#e9e4d6';
const FONT = '"Rajdhani", "Segoe UI", sans-serif';
const SPECIAL_COLOR = '#f2b84a';
const INFECTED_COLOR = '#3ee67a';

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function frame(c, color) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#151821');
  g.addColorStop(1, '#090a0e');
  roundRect(c, 4, 4, W - 8, H - 8, 18);
  c.fillStyle = g;
  c.fill();
  c.save();
  c.shadowColor = color;
  c.shadowBlur = 14;
  c.lineWidth = 4;
  c.strokeStyle = color;
  c.stroke();
  c.restore();
  roundRect(c, 14, 14, W - 28, H - 28, 10);
  c.lineWidth = 1.5;
  c.strokeStyle = 'rgba(233,228,214,0.18)';
  c.stroke();
}

function text(c, str, x, y, size, color, align = 'center', weight = 700, spacing = 0) {
  c.font = `${weight} ${size}px ${FONT}`;
  if ('letterSpacing' in c) c.letterSpacing = `${spacing}px`;
  c.textAlign = align;
  c.textBaseline = 'middle';
  c.fillStyle = color;
  c.fillText(str, x, y);
  if ('letterSpacing' in c) c.letterSpacing = '0px';
}

/** Neon line icon. (x, y) centre, s = size. */
function icon(c, name, x, y, s, color) {
  c.save();
  c.translate(x, y);
  c.scale(s / 100, s / 100);
  c.lineWidth = 7;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = color;
  c.fillStyle = color;
  c.shadowColor = color;
  c.shadowBlur = 16;
  const P = (pts, close = true) => {
    c.beginPath();
    pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
    if (close) c.closePath();
  };
  const circle = (cx, cy, r) => {
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
  };
  switch (name) {
    case 'blade': // dagger
      P([[0, -46], [12, -10], [7, 14], [-7, 14], [-12, -10]]);
      c.stroke();
      P([[-24, 16], [24, 16]], false);
      c.stroke();
      P([[0, 18], [0, 40]], false);
      c.stroke();
      circle(0, 46, 5);
      c.fill();
      break;
    case 'shield': // crest
      P([[0, -44], [36, -30], [32, 10], [0, 44], [-32, 10], [-36, -30]]);
      c.stroke();
      P([[0, -24], [0, 26]], false);
      c.stroke();
      P([[-18, -6], [18, -6]], false);
      c.stroke();
      break;
    case 'toxin': // three spores around a core
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
        circle(Math.cos(a) * 24, Math.sin(a) * 24, 16);
        c.stroke();
      }
      circle(0, 0, 7);
      c.fill();
      break;
    case 'mind': // eye
      c.beginPath();
      c.moveTo(-42, 0);
      c.quadraticCurveTo(0, -40, 42, 0);
      c.quadraticCurveTo(0, 40, -42, 0);
      c.stroke();
      circle(0, 0, 13);
      c.stroke();
      circle(0, 0, 5);
      c.fill();
      for (const a of [-2.2, -1.57, -0.94]) P([[Math.cos(a) * 30, Math.sin(a) * 30], [Math.cos(a) * 44, Math.sin(a) * 44]], false), c.stroke();
      break;
    case 'vaccine': // syringe
      c.rotate(-Math.PI / 4);
      c.strokeRect(-12, -30, 24, 52);
      P([[0, 22], [0, 44]], false);
      c.stroke();
      P([[-18, -30], [18, -30]], false);
      c.stroke();
      P([[0, -30], [0, -46], [-12, -46], [12, -46]], false);
      c.stroke();
      c.fillRect(-8, -4, 16, 22);
      break;
    case 'scanner': // magnifier
      circle(-8, -8, 26);
      c.stroke();
      P([[12, 12], [38, 38]], false);
      c.stroke();
      break;
    case 'swap':
      P([[-34, -14], [30, -14]], false);
      c.stroke();
      P([[18, -28], [32, -14], [18, 0]], false);
      c.stroke();
      P([[34, 16], [-30, 16]], false);
      c.stroke();
      P([[-18, 2], [-32, 16], [-18, 30]], false);
      c.stroke();
      break;
    case 'freeze': // six-armed crystal
      for (let i = 0; i < 3; i++) {
        c.save();
        c.rotate((i * Math.PI) / 3);
        P([[0, -42], [0, 42]], false);
        c.stroke();
        P([[-10, -30], [0, -20], [10, -30]], false);
        c.stroke();
        P([[-10, 30], [0, 20], [10, 30]], false);
        c.stroke();
        c.restore();
      }
      break;
    case 'decoy': // two overlapping silhouettes
      for (const [dx, a] of [[-12, 0.45], [12, 1]]) {
        c.globalAlpha = a;
        circle(dx, -20, 13);
        c.stroke();
        P([[dx - 22, 36], [dx - 18, 6], [dx + 18, 6], [dx + 22, 36]], false);
        c.stroke();
      }
      break;
    case 'wild': // four-point star
      P([[0, -44], [10, -10], [44, 0], [10, 10], [0, 44], [-10, 10], [-44, 0], [-10, -10]]);
      c.stroke();
      circle(0, 0, 6);
      c.fill();
      break;
    case 'flare':
      P([[-10, 40], [10, 40], [14, -6], [-14, -6]]);
      c.stroke();
      P([[0, -12], [0, -42]], false);
      c.stroke();
      P([[-20, -22], [-32, -36]], false);
      c.stroke();
      P([[20, -22], [32, -36]], false);
      c.stroke();
      break;
    case 'spore':
      circle(0, 0, 20);
      c.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        circle(Math.cos(a) * 34, Math.sin(a) * 34, 5);
        c.fill();
      }
      break;
    case 'mask':
      c.beginPath();
      c.moveTo(-38, -20);
      c.quadraticCurveTo(0, -36, 38, -20);
      c.quadraticCurveTo(36, 30, 0, 40);
      c.quadraticCurveTo(-36, 30, -38, -20);
      c.stroke();
      P([[-24, -4], [-8, -4]], false);
      c.stroke();
      P([[8, -4], [24, -4]], false);
      c.stroke();
      break;
    case 'rumor': // megaphone
      P([[-36, -10], [-12, -10], [30, -34], [30, 34], [-12, 10], [-36, 10]]);
      c.stroke();
      P([[-24, 10], [-18, 34]], false);
      c.stroke();
      break;
    default:
      break;
  }
  c.restore();
}

function drawFace(c, card) {
  if (card.kind === 'number') {
    const suit = SUITS[card.suit];
    frame(c, suit.color);
    text(c, String(card.value), 30, 44, 50, '#ffffff', 'left');
    icon(c, card.suit, 44, 90, 30, suit.color);
    icon(c, card.suit, W / 2 + 12, H / 2 + 22, 78, suit.color);
    text(c, suit.name.toUpperCase(), W / 2, H - 34, 17, suit.color, 'center', 700, 4);
    return;
  }
  const special = card.kind === 'special';
  const info = special ? SPECIAL_CARDS[card.type] : INFECTED_CARDS[card.type];
  const color = special ? SPECIAL_COLOR : INFECTED_COLOR;
  frame(c, color);
  text(c, special ? 'SPECIAL' : 'INFECTED', W / 2, 34, 14, color, 'center', 700, 5);
  icon(c, card.type, W / 2, H / 2 - 4, 86, color);
  text(c, info.name.toUpperCase(), W / 2, H - 52, 24, '#ffffff', 'center', 700, 3);
  if (card.type === 'wild') text(c, 'ANY SUIT  ·  8', W / 2, H - 28, 13, color, 'center', 600, 2);
}

function drawBack(c) {
  frame(c, '#2fd2c0');
  c.save();
  c.translate(W / 2, H / 2);
  c.strokeStyle = 'rgba(47,210,192,0.55)';
  c.lineWidth = 3;
  c.beginPath();
  c.arc(0, 0, 54, 0, Math.PI * 2);
  c.stroke();
  for (let y = -40; y <= 40; y += 2) {
    const s = Math.sin(y / 11) * 20;
    c.fillStyle = 'rgba(127,255,240,0.8)';
    c.fillRect(s - 2, y, 4, 2);
    c.fillStyle = 'rgba(127,255,240,0.45)';
    c.fillRect(-s - 2, y, 4, 2);
  }
  c.restore();
  text(c, 'OUTBREAK', W / 2, H - 34, 15, 'rgba(233,228,214,0.6)', 'center', 700, 5);
}

const faceKey = (card) =>
  card === 'back' ? 'card-back' : card.kind === 'number' ? `card-${card.suit}-${card.value}` : `card-${card.kind}-${card.type}`;

/** Texture key for a card (or 'back'), drawing it the first time it's needed. */
export function cardTexture(scene, card) {
  const key = faceKey(card);
  if (!scene.textures.exists(key)) {
    const t = scene.textures.createCanvas(key, W, H);
    const c = t.getContext();
    if (card === 'back') drawBack(c);
    else drawFace(c, card);
    t.refresh();
  }
  return key;
}

/** Display scale so a card is `height` px tall on screen. */
export const cardScale = (height) => height / H;
