// World labels (door signs, station names, name tags) packed into ONE shared texture.
// Phones draw with a single-texture pipeline, where every separate Text object costs its own
// draw call; images cut from one atlas batch together. Labels are cached by text + style.
import { FONT } from '../ui/HUD.js';

const KEY = 'labels';
const W = 2048;
const H = 1024;
const RES = 3; // drawn 3x, shown at 1/3: as sharp as a Text with resolution 3
const PAD = 4;

let atlas = null; // { tex, ctx, x, y, row, cache }

function open(scene) {
  if (atlas && scene.textures.exists(KEY) && atlas.tex === scene.textures.get(KEY)) return atlas;
  if (scene.textures.exists(KEY)) scene.textures.remove(KEY);
  const tex = scene.textures.createCanvas(KEY, W, H);
  atlas = { tex, ctx: tex.getContext(), x: 0, y: 0, row: 0, cache: new Map(), dirty: false };
  return atlas;
}

/** Draw `text` once into the atlas; returns its frame name, or null when the atlas is full. */
function frameFor(scene, text, { size = 10, color = '#e9e4d6', weight = 700, spacing = 0, shadow = null, blur = 0 }) {
  const a = open(scene);
  const id = `${text}|${size}|${color}|${weight}|${spacing}|${shadow}|${blur}`;
  if (a.cache.has(id)) return a.cache.get(id);
  const c = a.ctx;
  c.font = `${weight} ${size * RES}px ${FONT}`;
  const chars = [...text];
  const widths = chars.map((ch) => c.measureText(ch).width);
  const glow = shadow ? blur * RES : 0;
  const w = Math.ceil(widths.reduce((s, v) => s + v, 0) + spacing * RES * Math.max(0, chars.length - 1) + glow * 2 + PAD);
  const h = Math.ceil(size * RES * 1.35 + glow * 2 + PAD);
  if (a.x + w > W) {
    a.x = 0;
    a.y += a.row;
    a.row = 0;
  }
  if (a.y + h > H) return null; // full: the caller falls back to a Text
  c.save();
  c.fillStyle = color;
  c.textBaseline = 'middle';
  if (shadow) {
    c.shadowColor = shadow;
    c.shadowBlur = glow;
  }
  let x = a.x + glow + PAD / 2;
  const y = a.y + h / 2;
  chars.forEach((ch, i) => {
    c.fillText(ch, x, y);
    x += widths[i] + spacing * RES;
  });
  c.restore();
  const name = `l${a.cache.size}`;
  a.tex.add(name, 0, a.x, a.y, w, h);
  a.cache.set(id, name);
  a.x += w + 1;
  a.row = Math.max(a.row, h + 1);
  a.dirty = true;
  return name;
}

/** Upload the atlas after adding labels (once per batch of new labels). */
export function flushLabels() {
  if (atlas?.dirty) {
    atlas.tex.refresh();
    atlas.dirty = false;
  }
}

/** Upload once before the next frame is drawn, however many labels were added. */
function schedule(scene) {
  if (!atlas.dirty || atlas.scheduled) return;
  atlas.scheduled = true;
  scene.events.once('prerender', () => {
    atlas.scheduled = false;
    flushLabels();
  });
}

/** A label image at (x, y). `style`: size, color, weight, spacing, shadow (glow colour), blur. */
export function label(scene, x, y, text, style = {}) {
  const frame = frameFor(scene, text, style);
  if (!frame) {
    return scene.add.text(x, y, text, { fontFamily: FONT, fontSize: `${style.size ?? 10}px`, fontStyle: String(style.weight ?? 700), color: style.color ?? '#e9e4d6', resolution: RES })
      .setLetterSpacing(style.spacing ?? 0);
  }
  schedule(scene);
  return scene.add.image(x, y, KEY, frame).setScale(1 / RES);
}

/** Swap an existing label image to new text (name tags: '☠ P4'). */
export function relabel(img, text, style = {}) {
  if (img.type === 'Text') return img.setText(text).setColor(style.color ?? img.style.color);
  const frame = frameFor(img.scene, text, style);
  if (!frame) return img;
  schedule(img.scene);
  return img.setFrame(frame);
}
