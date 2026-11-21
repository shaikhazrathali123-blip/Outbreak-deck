import Phaser from 'phaser';
import { FONT } from '../ui/HUD.js';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    this.title = this.add
      .text(0, 0, 'OUTBREAK DECK', { fontFamily: FONT, fontSize: '44px', fontStyle: 'bold', color: '#e8fffb' })
      .setOrigin(0.5)
      .setShadow(0, 0, '#2fd2c0', 18, true, true);
    this.tagline = this.add
      .text(0, 0, 'Trust no one. Play your cards. Survive the outbreak.', {
        fontFamily: FONT,
        fontSize: '15px',
        color: '#7fb8b0',
      })
      .setOrigin(0.5);
    this.prompt = this.add
      .text(0, 0, 'TAP OR PRESS ENTER TO ENTER THE FACILITY', {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#3ee6a0',
      })
      .setOrigin(0.5);
    this.build = this.add
      .text(0, 0, 'Phase 1 build: side-view facility', { fontFamily: FONT, fontSize: '11px', color: '#4a5a66' })
      .setOrigin(0.5, 1);

    this.tweens.add({ targets: this.prompt, alpha: 0.25, duration: 800, yoyo: true, repeat: -1 });
    // occasional neon flicker on the title
    this.time.addEvent({
      delay: 140,
      loop: true,
      callback: () => this.title.setAlpha(Math.random() < 0.06 ? 0.45 : 1),
    });

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
    const small = width < 520;
    this.title.setFontSize(small ? 30 : 44).setPosition(width / 2, height * 0.38);
    this.tagline.setFontSize(small ? 12 : 15).setPosition(width / 2, height * 0.38 + (small ? 36 : 48));
    this.prompt.setFontSize(small ? 11 : 14).setPosition(width / 2, height * 0.62);
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
    this.cameras.main.fadeOut(300, 0, 0, 0);
    const view = new URLSearchParams(window.location.search).get('view');
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(view === 'top' ? 'GameScene' : 'SideScene'));
  }
}
