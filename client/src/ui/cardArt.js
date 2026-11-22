// Card faces in the ink & neon style, drawn on canvases at 2x for crisp text.
// Four kinds only: numbers 1–9, Zombie, Gun, Cure. cardTexture() returns a key (cached).
import { CARD_INFO } from '../../../shared/constants.js';

export const CARD_W = 88; // logical size; textures are 2x
export const CARD_H = 128;
const S = 2;
const W = CARD_W * S;
const H = CARD_H * S;
const FONT = '"Rajdhani", "Segoe UI", sans-serif';

function frame(c, color) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#151821');
  g.addColorStop(1, '#090a0e');
  c.beginPath();
  c.roundRect(4, 4, W - 8, H - 8, 18);
  c.fillStyle = g;
  c.fill();
  c.save();
  c.shadowColor = color;
  c.shadowBlur = 14;
  c.lineWidth = 4;
  c.strokeStyle = color;
  c.stroke();
  c.restore();
  c.beginPath();
  c.roundRect(14, 14, W - 28, H - 28, 10);
  c.lineWidth = 1.5;
  c.strokeStyle = 'rgba(233,228,214,0.18)';
  c.stroke();
}

function text(c, str, x, y, size, color, weight = 700, spacing = 0) {
  c.font = `${weight} ${size}px ${FONT}`;
  if ('letterSpacing' in c) c.letterSpacing = `${spacing}px`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = color;
  c.fillText(str, x, y);
  if ('letterSpacing' in c) c.letterSpacing = '0px';
}

/** Neon line icon centred on (x, y), drawn in a 100-unit box scaled to s px. */
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
  const path = (pts, close = false) => {
    c.beginPath();
    pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
    if (close) c.closePath();
    c.stroke();
  };
  if (name === 'zombie') {
    // a clawed hand reaching up, dripping
    path([[-26, 46], [-26, 4], [-30, -18], [-24, -40]]);
    path([[-12, 4], [-10, -30], [-6, -48]]);
    path([[4, 4], [8, -28], [14, -46]]);
    path([[18, 6], [26, -18], [34, -32]]);
    path([[22, 46], [24, 18], [36, 4], [42, -6]]);
    path([[-26, 46], [22, 46]]);
    for (const [dx, dy] of [[-18, 26], [0, 34], [14, 22]]) {
      c.beginPath();
      c.ellipse(dx, dy, 3.5, 6, 0, 0, Math.PI * 2);
      c.fill();
    }
  } else if (name === 'gun') {
    // side-on pistol with a muzzle flash
    path([[-40, -14], [26, -14], [26, 4], [-6, 4], [-10, 30], [-30, 30], [-24, 4], [-40, 4]], true);
    path([[-6, 4], [2, 16], [-8, 16]]);
    path([[32, -5], [46, -16]]);
    path([[32, -5], [48, -5]]);
    path([[32, -5], [46, 6]]);
  } else if (name === 'cure') {
    // syringe with a cross
    c.rotate(-Math.PI / 4);
    c.strokeRect(-12, -30, 24, 52);
    path([[0, 22], [0, 44]]);
    path([[-18, -30], [18, -30]]);
    path([[0, -30], [0, -46], [-12, -46], [12, -46]]);
    c.rotate(Math.PI / 4);
    c.fillRect(-4, -20, 8, 24);
    c.fillRect(-12, -12, 24, 8);
  }
  c.restore();
}

function drawFace(c, card) {
  const info = CARD_INFO[card.kind];
  frame(c, info.color);
  if (card.kind === 'number') {
    // one big number, with pips showing its power
    text(c, String(card.value), W / 2, H / 2 - 12, 120, '#ffffff');
    for (let i = 0; i < 9; i++) {
      c.beginPath();
      c.arc(W / 2 - 64 + i * 16, H - 44, 4.5, 0, Math.PI * 2);
      c.fillStyle = i < card.value ? info.color : 'rgba(233,228,214,0.14)';
      c.fill();
    }
    return;
  }
  icon(c, card.kind, W / 2, H / 2 - 14, 104, info.color);
  text(c, info.name.toUpperCase(), W / 2, H - 46, 28, '#ffffff', 700, 4);
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
  text(c, 'OUTBREAK', W / 2, H - 34, 15, 'rgba(233,228,214,0.6)', 700, 5);
}

const faceKey = (card) => (card === 'back' ? 'card-back' : card.kind === 'number' ? `card-n${card.value}` : `card-${card.kind}`);

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
