import Phaser from 'phaser';

/**
 * Ambient effects read from the map's "FX" object layer:
 *   sparks - broken wiring that spits sparks every few seconds
 *   steam  - leaking vents
 *   leds   - blinking lights on server racks (rectangle objects)
 *   screen - monitors that flicker and refresh (rectangle objects)
 *   holo   - rotating DNA hologram
 * Plus floating dust around the player everywhere.
 */
export default class FXSystem {
  static createTextures(scene) {
    if (!scene.textures.exists('spark')) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1).fillCircle(4, 4, 2);
      g.fillStyle(0xffffff, 0.35).fillCircle(4, 4, 4);
      g.generateTexture('spark', 8, 8);
      g.destroy();
    }
    if (!scene.textures.exists('holo')) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      const c = 0x6ff8ff;
      g.lineStyle(1.5, c, 0.9).strokeEllipse(32, 70, 56, 14);
      g.lineStyle(1, c, 0.5).strokeEllipse(32, 70, 40, 9);
      for (let y = 6; y <= 62; y += 1) {
        const s = Math.sin(y / 7) * 12;
        g.fillStyle(c, 0.85).fillRect(32 + s - 1, y, 2.5, 1.2);
        g.fillStyle(c, 0.55).fillRect(32 - s - 1, y, 2.5, 1.2);
        if (y % 6 === 0) g.lineStyle(1, c, 0.35).lineBetween(32 - s, y, 32 + s, y);
      }
      g.generateTexture('holo', 64, 80);
      g.destroy();
    }
    if (!scene.textures.exists('puff')) {
      const tex = scene.textures.createCanvas('puff', 32, 32);
      const ctx = tex.getContext();
      const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 32, 32);
      tex.refresh();
    }
  }

  constructor(scene, map, player) {
    this.scene = scene;
    this.leds = [];
    this.screens = [];
    this.holos = [];

    for (const obj of map.getObjectLayer('FX')?.objects ?? []) {
      if (obj.name === 'sparks') this.addSparks(obj.x, obj.y);
      else if (obj.name === 'steam') this.addSteam(obj.x, obj.y);
      else if (obj.name === 'leds') this.addLeds(obj);
      else if (obj.name === 'screen') this.addScreen(obj);
      else if (obj.name === 'holo') this.addHolo(obj.x, obj.y);
    }
    this.dust = this.addDust(player);

    if (this.screens.length) {
      scene.time.addEvent({
        delay: 140,
        loop: true,
        callback: () => {
          for (const s of this.screens) {
            if (Math.random() < 0.04) s.setAlpha(0.45); // refresh flash
            else s.setAlpha(Math.max(0.04, s.alpha * 0.7 + (Math.random() - 0.5) * 0.06));
          }
        },
      });
    }

    if (this.leds.length) {
      scene.time.addEvent({
        delay: 120,
        loop: true,
        callback: () => {
          for (const led of this.leds) if (Math.random() < 0.12) led.setVisible(!led.visible);
        },
      });
    }
  }

  addSparks(x, y) {
    const emitter = this.scene.add.particles(x, y, 'spark', {
      lifespan: { min: 250, max: 700 },
      speed: { min: 50, max: 170 },
      angle: { min: 20, max: 160 },
      gravityY: 420,
      scale: { start: 0.9, end: 0 },
      tint: [0xffe27a, 0xffffff, 0xffb347],
      blendMode: 'ADD',
      emitting: false,
    });
    emitter.setDepth(16);
    const burst = () => {
      emitter.explode(Phaser.Math.Between(6, 16));
      this.scene.time.delayedCall(Phaser.Math.Between(1200, 5000), burst);
    };
    this.scene.time.delayedCall(Phaser.Math.Between(200, 3000), burst);
  }

  addSteam(x, y) {
    this.scene.add
      .particles(x, y, 'puff', {
        lifespan: 2400,
        speedY: { min: -32, max: -14 },
        speedX: { min: -10, max: 10 },
        scale: { start: 0.5, end: 2.2 },
        alpha: { start: 0.22, end: 0 },
        tint: 0xc8d8e0,
        frequency: 160,
      })
      .setDepth(14);
  }

  addLeds(rect) {
    const colors = [0x3ee67a, 0x3e8bff, 0xe6b23e, 0x2fd2e0, 0xe0443e];
    for (let y = rect.y; y < rect.y + rect.height; y += 5) {
      for (let x = rect.x; x < rect.x + rect.width; x += 3) {
        if (Math.random() < 0.7) continue; // keep the object count low for phones
        const led = this.scene.add
          .rectangle(x, y, 2, 1, Phaser.Utils.Array.GetRandom(colors))
          .setOrigin(0)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(5);
        this.leds.push(led);
      }
    }
  }

  addScreen(rect) {
    const screen = this.scene.add
      .rectangle(rect.x, rect.y, rect.width, rect.height, 0x9ff6ff)
      .setOrigin(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(Math.random() * 0.15)
      .setDepth(5);
    this.screens.push(screen);
  }

  addHolo(x, y) {
    const holo = this.scene.add.image(x, y - 34, 'holo').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.7).setDepth(18);
    this.holos.push(holo);
    this.scene.tweens.add({ targets: holo, y: y - 40, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.scene.tweens.add({ targets: holo, scaleX: 0.75, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.scene.time.addEvent({
      delay: 90,
      loop: true,
      callback: () => holo.setAlpha(Math.random() < 0.05 ? 0.25 : 0.6 + Math.random() * 0.15),
    });
  }

  addDust(player) {
    return this.scene.add
      .particles(0, 0, 'puff', {
        follow: player,
        x: { min: -420, max: 420 },
        y: { min: -320, max: 320 },
        lifespan: { min: 4000, max: 7000 },
        speedX: { min: -8, max: 8 },
        speedY: { min: -6, max: 4 },
        scale: { min: 0.06, max: 0.14 },
        alpha: { start: 0.35, end: 0 },
        frequency: 90,
        blendMode: 'ADD',
      })
      .setDepth(17);
  }
}
