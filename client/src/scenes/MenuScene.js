import Phaser from 'phaser';
import { FONT } from '../ui/HUD.js';
import { drawSky, drawSkyline } from '../side/inkArt.js';

/** Title screen: night sky, skyline, title and a start button. */
export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    drawSky(this);
    drawSkyline(this);
    this.sky = this.add.image(0, 0, 'sky').setOrigin(0);
    this.city = this.add.image(0, 0, 'skyline').setOrigin(0, 1);
    this.shade = this.add.rectangle(0, 0, 10, 10, 0x03040a, 0.45).setOrigin(0);

    this.kicker = this.add.text(0, 0, 'HELIX RESEARCH FACILITY', { fontFamily: FONT, fontSize: '14px', fontStyle: '600', color: '#7fb8b0' }).setOrigin(0.5).setLetterSpacing(8);
    this.title = this.add
      .text(0, 0, 'OUTBREAK DECK', { fontFamily: FONT, fontSize: '72px', fontStyle: '700', color: '#ffffff' })
      .setOrigin(0.5)
      .setLetterSpacing(10)
      .setShadow(0, 0, '#2fd2c0', 28, false, true);
    this.rule = this.add.graphics();
    this.tagline = this.add
      .text(0, 0, 'TRUST NO ONE  ·  PLAY YOUR CARDS  ·  SURVIVE THE OUTBREAK', { fontFamily: FONT, fontSize: '14px', fontStyle: '500', color: '#a9b0bc' })
      .setOrigin(0.5)
      .setLetterSpacing(4);
    this.button = this.add.graphics();
    this.prompt = this.add.text(0, 0, 'ENTER THE FACILITY', { fontFamily: FONT, fontSize: '16px', fontStyle: '700', color: '#0a0b10' }).setOrigin(0.5).setLetterSpacing(5);
    this.build = this.add.text(0, 0, 'v0.1  ·  6–15 PLAYERS', { fontFamily: FONT, fontSize: '11px', fontStyle: '500', color: '#4f5866' }).setOrigin(0.5, 1).setLetterSpacing(3);

    this.tweens.add({ targets: [this.button, this.prompt], alpha: 0.75, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.time.addEvent({ delay: 160, loop: true, callback: () => this.title.setAlpha(Math.random() < 0.04 ? 0.55 : 1) });

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));

    this.started = false;
    this.input.once('pointerup', (pointer) => this.start(pointer.wasTouch));
    this.input.keyboard.once('keydown-ENTER', () => this.start(false));
    this.input.keyboard.once('keydown-SPACE', () => this.start(false));
  }

  layout() {
    const { width, height } = this.scale;
    const small = width < 620 || height < 420;
    this.sky.setPosition(-(this.sky.width - width) / 2, -260);
    this.city.setPosition(-(this.city.width - width) / 2, height + 220);
    this.shade.setSize(width, height);
    const cy = height * (small ? 0.4 : 0.42);
    this.kicker.setFontSize(small ? 11 : 14).setPosition(width / 2, cy - (small ? 48 : 70));
    this.title.setFontSize(small ? 40 : 72).setPosition(width / 2, cy);
    this.rule.clear().fillStyle(0x2fd2c0, 0.8).fillRect(width / 2 - (small ? 90 : 160), cy + (small ? 30 : 50), small ? 180 : 320, 1.5);
    this.tagline.setFontSize(small ? 10 : 14).setPosition(width / 2, cy + (small ? 50 : 78));
    const by = height * (small ? 0.74 : 0.68);
    const bw = small ? 220 : 280;
    this.button.clear().fillStyle(0x9ffff4, 1).fillRoundedRect(width / 2 - bw / 2, by - 22, bw, 44, 22);
    this.prompt.setFontSize(small ? 14 : 16).setPosition(width / 2, by);
    this.build.setPosition(width / 2, height - 12);
  }

  start(fromTouch) {
    if (this.started) return;
    this.started = true;
    // On phones, go fullscreen so browser bars don't eat the screen.
    if (fromTouch && this.scale.fullscreen.available && !this.scale.isFullscreen) {
      try {
        this.scale.startFullscreen();
      } catch {
        /* not allowed here; keep playing windowed */
      }
    }
    this.cameras.main.fadeOut(350, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('SideScene'));
  }
}
