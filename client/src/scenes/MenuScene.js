import Phaser from 'phaser';
import { FONT, UI, MIN_TEXT } from '../ui/HUD.js';
import { drawSky, drawSkyline } from '../side/inkArt.js';
import { createSurvivor, FACE_ANCHORS, SURVIVOR_SIZE, faceTint, facesKey } from '../side/SideCharacter.js';
import { MAX_PLAYERS, MIN_PLAYERS, infectedCount, MODIFIERS, PLAYER_COLORS, dailyModifier, rankFor } from '../../../shared/constants.js';
import { loadProfile } from '../game/profile.js';
import sfx from '../audio/Sfx.js';

const DIFFICULTIES = ['easy', 'normal', 'hard'];
const MINUTES = [4, 6, 8];
const MODS = ['off', 'daily', ...Object.keys(MODIFIERS)];
const STORE = 'outbreak-deck-settings';
const RES = 3; // the menu survivor is drawn 3x sharper: it is shown big

function loadSettings() {
  const base = { bots: 7, difficulty: 'normal', minutes: 6, modifier: 'off', color: PLAYER_COLORS[0] };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(STORE) ?? '{}') };
  } catch {
    return base;
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    /* private mode: settings just won't be remembered */
  }
}

/**
 * Title screen: your survivor big in the middle (idling), the match options around it,
 * "Play vs Bots" below. Tapping the survivor is where the Locker (Stage 4) will open.
 */
export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    drawSky(this);
    drawSkyline(this);
    this.settings = loadSettings();
    this.profile = loadProfile();
    this.rank = rankFor(this.profile.xp);
    // neon colours unlock with your rank (3 more per rank)
    this.colors = PLAYER_COLORS.slice(0, Math.min(PLAYER_COLORS.length, this.rank.colors));
    if (!this.colors.includes(this.settings.color)) this.settings.color = this.colors[0];
    if (!MODS.includes(this.settings.modifier)) this.settings.modifier = 'off';
    this.touch = this.sys.game.device.input.touch;
    this.sky = this.add.image(0, 0, 'sky').setOrigin(0);
    this.city = this.add.image(0, 0, 'skyline').setOrigin(0, 1);
    this.shade = this.add.rectangle(0, 0, 10, 10, 0x03040a, 0.5).setOrigin(0);

    this.kicker = this.add.text(0, 0, 'HELIX RESEARCH FACILITY', { fontFamily: FONT, fontSize: `${MIN_TEXT}px`, fontStyle: '600', color: '#7fb8b0' }).setOrigin(0.5).setLetterSpacing(8);
    this.title = this.add
      .text(0, 0, 'OUTBREAK DECK', { fontFamily: FONT, fontSize: '72px', fontStyle: '700', color: '#ffffff' })
      .setOrigin(0.5)
      .setLetterSpacing(10)
      .setShadow(0, 0, '#2fd2c0', 28, false, true);

    // your survivor on a glowing pad
    this.pad = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD);
    this.padRing = this.add.graphics();
    this.hero = this.add.sprite(0, 0, '__DEFAULT').setOrigin(0.5, 1).setInteractive({ useHandCursor: true });
    this.heroFace = this.add.image(0, 0, '__DEFAULT');
    this.hop = { y: 0, sx: 1, sy: 1 };
    this.hero.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      this.openLocker();
    });
    this.setHero();

    // options: a "LABEL / ‹ value ›" block each
    this.options = [
      this.option('BOTS', () => `${this.settings.bots}`, (d) => {
        this.settings.bots = Phaser.Math.Clamp(this.settings.bots + d, MIN_PLAYERS - 1, MAX_PLAYERS - 1);
      }),
      this.option('DIFFICULTY', () => this.settings.difficulty.toUpperCase(), (d) => {
        this.settings.difficulty = DIFFICULTIES[(DIFFICULTIES.indexOf(this.settings.difficulty) + d + 3) % 3];
      }),
      this.option('TIME', () => `${this.settings.minutes} MIN`, (d) => {
        this.settings.minutes = MINUTES[(MINUTES.indexOf(this.settings.minutes) + d + 3) % 3];
      }),
      this.option('MODIFIER', () => {
        const m = this.settings.modifier;
        if (m === 'off') return 'OFF';
        if (m === 'daily') return MODIFIERS[dailyModifier()].name.toUpperCase();
        return MODIFIERS[m].name.toUpperCase();
      }, (d) => {
        this.settings.modifier = MODS[(MODS.indexOf(this.settings.modifier) + d + MODS.length) % MODS.length];
      }),
      this.option('COLOUR', () => `${this.colors.indexOf(this.settings.color) + 1} / ${this.colors.length}`, (d) => {
        const i = this.colors.indexOf(this.settings.color);
        this.settings.color = this.colors[(i + d + this.colors.length) % this.colors.length];
        this.setHero();
        this.cheer();
      }),
    ];
    // sound on / off (top right, or the S key)
    this.soundText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: '#9ffff4' }).setOrigin(1, 0).setLetterSpacing(3)
      .setInteractive({ useHandCursor: true });
    const drawSound = () => this.soundText.setText(sfx.enabled ? '♪ ON' : '♪ OFF').setColor(sfx.enabled ? '#9ffff4' : '#6a707c');
    this.soundText.on('pointerdown', (p, x, y, e) => { e?.stopPropagation(); sfx.toggle(); drawSound(); });
    this.input.keyboard.on('keydown-S', () => { sfx.toggle(); drawSound(); });
    drawSound();
    this.rankText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: '#ffd27a' }).setOrigin(0, 0).setLetterSpacing(3);
    this.info = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: `${MIN_TEXT}px`, fontStyle: '700', color: UI.dim }).setOrigin(0.5).setLetterSpacing(2);

    this.button = this.add.graphics();
    this.prompt = this.add.text(0, 0, 'PLAY VS BOTS', { fontFamily: FONT, fontSize: '18px', fontStyle: '700', color: '#0a0b10' }).setOrigin(0.5).setLetterSpacing(5);
    this.playZone = this.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
    this.playZone.on('pointerup', (p) => this.start(p.wasTouch));
    // keyboard help only where there is a keyboard
    this.build = this.add.text(0, 0, 'ENTER  PLAY   ·   ← →  BOTS   ·   S  SOUND', { fontFamily: FONT, fontSize: `${MIN_TEXT}px`, fontStyle: '600', color: '#4f5866' })
      .setOrigin(0.5, 1).setLetterSpacing(2).setVisible(!this.touch);

    this.tweens.add({ targets: [this.button, this.prompt], alpha: 0.8, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.time.addEvent({ delay: 160, loop: true, callback: () => this.title.setAlpha(Math.random() < 0.04 ? 0.55 : 1) });
    this.tweens.add({ targets: this.hop, y: -4, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' }); // breathing bob
    this.time.addEvent({ delay: 4200, loop: true, callback: () => this.lookAround() });

    this.layout();
    this.refresh();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));

    this.started = false;
    this.input.keyboard.on('keydown-ENTER', () => this.start(false));
    this.input.keyboard.on('keydown-SPACE', () => this.start(false));
    this.input.keyboard.on('keydown-LEFT', () => this.change(0, -1));
    this.input.keyboard.on('keydown-RIGHT', () => this.change(0, 1));
  }

  /** (Re)build the big survivor in your colour. */
  setHero() {
    const color = this.settings.color;
    const key = `menu-survivor-${color}`;
    createSurvivor(this, key, color, undefined, { res: RES, only: ['idle'] });
    this.hero.setTexture(key, 'idle0').play(`${key}-idle`);
    this.heroFace.setTexture(facesKey(RES), 'neutral').setTint(faceTint(color));
    this.pad.setTint(Phaser.Display.Color.HexStringToColor(color).color);
    this.drawPad();
  }

  drawPad() {
    if (!this.padW) return;
    const c = Phaser.Display.Color.HexStringToColor(this.settings.color).color;
    this.padRing.clear().lineStyle(2, c, 0.8).strokeEllipse(this.heroX, this.heroY, this.padW, this.padW * 0.16)
      .lineStyle(6, c, 0.15).strokeEllipse(this.heroX, this.heroY, this.padW + 8, this.padW * 0.16 + 4);
  }

  setFace(name, ms = 0) {
    this.heroFace.setFrame(name);
    this.faceTimer?.remove();
    if (ms) this.faceTimer = this.time.delayedCall(ms, () => this.heroFace.setFrame('neutral'));
  }

  /** A happy little hop (colour changed, or you tapped them). */
  cheer() {
    this.setFace('happy', 1100);
    this.tweens.killTweensOf(this.hop);
    Object.assign(this.hop, { sx: 1.12, sy: 0.86 });
    this.tweens.add({ targets: this.hop, sx: 1, sy: 1, duration: 420, ease: 'Back.out' });
    this.tweens.add({ targets: this.hop, y: -18, duration: 160, yoyo: true, ease: 'Quad.out', onComplete: () => {
      this.tweens.add({ targets: this.hop, y: -4, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    } });
  }

  /** Now and then the survivor glances around (a suspicious squint). */
  lookAround() {
    if (this.heroFace.frame.name === 'neutral') this.setFace(Math.random() < 0.5 ? 'suspicious' : 'scared', 700);
  }

  /** Stage 4 opens the Locker from here; for now the survivor just waves back. */
  openLocker() {
    sfx.play('tap');
    this.cheer();
  }

  /** A "LABEL / ‹ value ›" block with tappable arrows. */
  option(label, value, step) {
    const o = { value, step };
    o.label = this.add.text(0, 0, label, { fontFamily: FONT, fontSize: `${MIN_TEXT}px`, fontStyle: '700', color: UI.dim }).setOrigin(0.5).setLetterSpacing(4);
    o.text = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '20px', fontStyle: '700', color: '#ffffff' }).setOrigin(0.5).setLetterSpacing(2);
    o.minus = this.add.text(0, 0, '‹', { fontFamily: FONT, fontSize: '32px', fontStyle: '700', color: '#9ffff4' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    o.plus = this.add.text(0, 0, '›', { fontFamily: FONT, fontSize: '32px', fontStyle: '700', color: '#9ffff4' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    // bigger touch targets than the glyphs
    for (const [t, d] of [[o.minus, -1], [o.plus, 1]]) {
      t.input.hitArea.setTo(-12, -6, t.width + 24, t.height + 12);
      t.on('pointerdown', (p, x, y, e) => {
        e?.stopPropagation();
        step(d);
        sfx.play('tap');
        this.refresh();
      });
    }
    return o;
  }

  change(i, d) {
    this.options[i].step(d);
    this.refresh();
  }

  refresh() {
    for (const o of this.options) {
      o.text.setText(o.value());
      this.fitOption(o);
    }
    this.options[4].text.setColor(this.settings.color);
    const total = this.settings.bots + 1;
    this.info.setText(`${total} PLAYERS  ·  ${infectedCount(total)} INFECTED`);
    this.rankText.setText(`${this.rank.name.toUpperCase()}  ·  ${this.profile.xp} XP`);
    saveSettings(this.settings);
  }

  /** Long values (modifier names) shrink to fit between the arrows. */
  fitOption(o) {
    if (!o.room) return;
    o.text.setScale(1);
    if (o.text.width > o.room) o.text.setScale(o.room / o.text.width);
  }

  layout() {
    const { width: W, height: H } = this.scale;
    const wide = W / H >= 1.15;
    const small = H < 460 || W < 420;
    this.sky.setPosition(-(this.sky.width - W) / 2, -260);
    this.city.setPosition(-(this.city.width - W) / 2, H + 220);
    this.shade.setSize(W, H);

    // title
    const titleY = small ? 34 : H * 0.12;
    this.title.setFontSize(small ? 36 : 64).setPosition(W / 2, titleY);
    if (this.title.width > W - 30) this.title.setScale((W - 30) / this.title.width);
    else this.title.setScale(1);
    this.kicker.setPosition(W / 2, titleY - (small ? 0 : 46)).setVisible(!small);
    this.rankText.setPosition(16, 14);
    this.soundText.setPosition(W - 16, 14);

    // play button
    const by = H - (small ? 34 : 56);
    const bw = small ? 220 : 290;
    const bh = small ? 44 : 50;
    this.button.clear().fillStyle(0x9ffff4, 1).fillRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, bh / 2);
    this.prompt.setPosition(W / 2, by);
    this.playZone.setPosition(W / 2, by).setSize(bw, bh);
    this.playZone.input.hitArea.setTo(0, 0, bw, bh);
    this.build.setPosition(W / 2, H - 6).setVisible(!this.touch && !small);

    // the survivor: centre stage
    const top = titleY + (small ? 26 : 50);
    const bottom = by - bh / 2 - (small ? 28 : 40);
    const heroH = Math.min(wide ? (bottom - top) * 0.92 : (bottom - top) * 0.42, 340);
    this.heroScale = heroH / (SURVIVOR_SIZE.height * RES);
    this.heroX = W / 2;
    this.heroY = wide ? bottom : top + heroH + 6;
    this.padW = heroH * 0.62;
    this.pad.setPosition(this.heroX, this.heroY).setDisplaySize(this.padW * 1.6, this.padW * 0.34).setAlpha(0.35);
    this.drawPad();
    this.info.setPosition(W / 2, this.heroY + (small ? 16 : 22));

    // options: left and right of the survivor (wide), or a grid under it (tall)
    const colW = wide ? Math.min(240, (W - heroH * 0.7) / 2 - 30) : Math.min(200, W / 2 - 16);
    const place = (o, x, y) => {
      const spread = colW / 2 - 14;
      o.label.setPosition(x, y - 20);
      o.text.setPosition(x, y + 10);
      o.minus.setPosition(x - spread, y + 10);
      o.plus.setPosition(x + spread, y + 10);
      o.room = spread * 2 - 44;
      this.fitOption(o);
    };
    if (wide) {
      const lx = W / 2 - heroH * 0.35 - colW / 2 - 20;
      const rx = W / 2 + heroH * 0.35 + colW / 2 + 20;
      const gap = Math.min(76, (bottom - top) / 3);
      const mid = (top + bottom) / 2;
      [0, 1, 2].forEach((i) => place(this.options[i], lx, mid + (i - 1) * gap));
      [3, 4].forEach((i, k) => place(this.options[i], rx, mid + (k - 0.5) * gap));
    } else {
      const y0 = this.heroY + 56;
      const gap = Math.min(70, (bottom - y0) / 3);
      this.options.forEach((o, i) => place(o, i === 4 ? W / 2 : W / 2 + (i % 2 ? 1 : -1) * (colW / 2 + 6), y0 + Math.floor(i / 2) * gap));
    }
  }

  update() {
    if (!this.heroScale) return;
    const s = this.heroScale;
    const h = this.hero.setScale(s * this.hop.sx, s * this.hop.sy).setPosition(this.heroX, this.heroY + this.hop.y);
    const a = FACE_ANCHORS[h.frame.name];
    if (!a) return;
    // the visor face rides on the visor (anchors are in 1x frame pixels)
    const dx = (a.x - SURVIVOR_SIZE.width / 2) * RES * h.scaleX;
    const dy = (a.y - SURVIVOR_SIZE.height) * RES * h.scaleY;
    this.heroFace.setPosition(h.x + dx, h.y + dy).setScale(h.scaleX, h.scaleY);
  }

  start(fromTouch) {
    if (this.started) return;
    this.started = true;
    sfx.unlock();
    sfx.play('accept');
    if (fromTouch && this.scale.fullscreen.available && !this.scale.isFullscreen) {
      try {
        this.scale.startFullscreen();
      } catch {
        /* not allowed here; keep playing windowed */
      }
    }
    this.cameras.main.fadeOut(350, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('SideScene', { ...this.settings }));
  }
}
