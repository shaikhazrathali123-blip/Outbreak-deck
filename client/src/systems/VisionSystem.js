import { VISION_RADIUS } from '../../../shared/constants.js';

const TEXTURE = 'vision';
const SIZE = 1024; // texture size
const HOLE = 56; // radius of the clear circle inside the texture

/**
 * Darkness that covers everything except a soft circle around a target.
 * It is one big black image with a transparent hole, kept on the target in
 * world space. Change the radius with setRadius() (e.g. Lights Out in Phase 5).
 */
export default class VisionSystem {
  static createTexture(scene) {
    if (scene.textures.exists(TEXTURE)) return;
    const tex = scene.textures.createCanvas(TEXTURE, SIZE, SIZE);
    const ctx = tex.getContext();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.globalCompositeOperation = 'destination-out';
    const c = SIZE / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, HOLE);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.55, 'rgba(0,0,0,1)');
    g.addColorStop(0.8, 'rgba(0,0,0,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, HOLE, 0, Math.PI * 2);
    ctx.fill();
    tex.refresh();
  }

  constructor(scene, target, radius = VISION_RADIUS) {
    this.scene = scene;
    this.target = target;
    this.radius = radius;
    this.darkness = 0.86; // 1 = pitch black outside the circle
    this.image = scene.add.image(target.x, target.y, TEXTURE).setDepth(1000).setAlpha(this.darkness);

    // Run after physics has moved the player this frame, so the circle never lags.
    scene.events.on('postupdate', this.update, this);
    scene.events.once('shutdown', () => scene.events.off('postupdate', this.update, this));
  }

  setRadius(radius) {
    this.radius = radius;
  }

  update(time) {
    // faint flicker, like failing facility lights
    let flicker = 1 + Math.sin(time * 0.011) * 0.008;
    if (Math.random() < 0.008) flicker -= 0.05;
    this.image.setPosition(this.target.x, this.target.y - 4);
    this.image.setScale((this.radius / HOLE) * flicker);
  }
}
