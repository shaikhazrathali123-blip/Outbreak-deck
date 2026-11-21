import Phaser from 'phaser';

const TEXTURE = 'glow';
const SIZE = 256;

const prop = (obj, name, fallback) => obj.properties?.find((p) => p.name === name)?.value ?? fallback;

/**
 * Coloured light pools read from the map's "Lights" object layer.
 * Each light is an additive glow sprite. Modes:
 *   steady  - constant
 *   flicker - mostly on, random dips (old fluorescent tube)
 *   pulse   - slow breathing glow
 *   strobe  - alarm beacon, on/off
 *   broken  - mostly dark with short bursts
 */
export default class LightingSystem {
  static createTexture(scene) {
    if (scene.textures.exists(TEXTURE)) return;
    const tex = scene.textures.createCanvas(TEXTURE, SIZE, SIZE);
    const ctx = tex.getContext();
    const c = SIZE / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
    tex.refresh();
  }

  constructor(scene, map, depth = 15) {
    this.scene = scene;
    this.lights = [];
    const layer = map.getObjectLayer('Lights');
    for (const obj of layer?.objects ?? []) {
      const radius = prop(obj, 'radius', 160);
      const intensity = prop(obj, 'intensity', 0.5);
      const mode = prop(obj, 'mode', 'steady');
      const color = Phaser.Display.Color.HexStringToColor(prop(obj, 'color', '#ffffff')).color;
      const image = scene.add
        .image(obj.x, obj.y, TEXTURE)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(color)
        .setScale((radius * 2) / SIZE)
        .setAlpha(intensity)
        .setDepth(depth);
      this.lights.push({
        image,
        mode,
        intensity,
        phase: Math.random() * Math.PI * 2,
        speed: 0.0015 + Math.random() * 0.0015,
        dipUntil: 0,
        burstUntil: 0,
      });
    }
    this.animated = this.lights.filter((l) => l.mode !== 'steady');
    scene.events.on('update', this.update, this);
    scene.events.once('shutdown', () => scene.events.off('update', this.update, this));
  }

  update(time) {
    for (const l of this.animated) {
      let a = l.intensity;
      switch (l.mode) {
        case 'pulse':
          a *= 0.65 + 0.35 * Math.sin(time * l.speed + l.phase);
          break;
        case 'strobe':
          a *= Math.sin(time * 0.006 + l.phase) > 0.2 ? 1 : 0.08;
          break;
        case 'flicker':
          if (time > l.dipUntil && Math.random() < 0.006) l.dipUntil = time + 60 + Math.random() * 220;
          a *= time < l.dipUntil ? 0.25 + Math.random() * 0.2 : 0.92 + Math.random() * 0.08;
          break;
        case 'broken':
          if (time > l.burstUntil && Math.random() < 0.012) l.burstUntil = time + 40 + Math.random() * 160;
          a *= time < l.burstUntil ? 0.7 + Math.random() * 0.3 : 0.08;
          break;
        default:
          break;
      }
      l.image.setAlpha(a);
    }
  }
}
