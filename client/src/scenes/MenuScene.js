import Phaser from 'phaser';
import { FONT, UI, MIN_TEXT } from '../ui/HUD.js';
import { drawSky, drawSkyline } from '../side/inkArt.js';
import { createSurvivor, FACE_ANCHORS, SURVIVOR_SIZE, faceTint, facesKey } from '../side/SideCharacter.js';
import { cardTexture, CARD_W, CARD_H } from '../ui/cardArt.js';
import { MAX_PLAYERS, MIN_PLAYERS, infectedCount, MODIFIERS, PLAYER_COLORS, dailyModifier, rankFor } from '../../../shared/constants.js';
import { loadProfile } from '../game/profile.js';
import sfx from '../audio/Sfx.js';

const DIFFICULTIES = ['easy', 'normal', 'hard'];
const MINUTES = [4, 6, 8];
const MODS = ['off', 'daily', ...Object.keys(MODIFIERS)];
const STORE = 'outbreak-deck-settings';
const RES = 3; // menu survivors are drawn 3x sharper: they are shown big
const hex = (h) => Phaser.Display.Color.HexStringToColor(h).color;
const DARK = 0x1b2029; // the lineup in the dark: silhouettes, only the visors glow
// the fan of cards behind your survivor: one of each kind, all drawn in code (ui/cardArt.js)
const FAN = [{ kind: 'number', value: 7 }, { kind: 'gun', bullets: 2 }, { kind: 'zombie' }, { kind: 'cure' }, { kind: 'number', value: 9 }];

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

/** A soft vertical light cone (the spotlight on your survivor). */
function spotTexture(scene) {
  if (scene.textures.exists('menu-spot')) return;
  const t = scene.textures.createCanvas('menu-spot', 256, 512);
  const c = t.getContext();
  const g = c.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, 'rgba(255,255,255,0.0)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0.12)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(108, 0);
  c.lineTo(148, 0);
  c.lineTo(256, 512);
  c.lineTo(0, 512);
  c.closePath();
  c.fill();
  // soften the edges
  const e = c.createLinearGradient(0, 0, 256, 0);
  e.addColorStop(0, 'rgba(0,0,0,1)');
  e.addColorStop(0.3, 'rgba(0,0,0,0)');
  e.addColorStop(0.7, 'rgba(0,0,0,0)');
  e.addColorStop(1, 'rgba(0,0,0,1)');
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = e;
  c.fillRect(0, 0, 256, 512);
  t.refresh();
}

/**
 * Title screen, a rainy rooftop at night: your survivor under a spotlight in front of a giant
 * fan of cards, a lineup of other survivors in the dark (only their visors glow), lightning,
 * a neon-tube title, and the match options on two glass consoles. Landscape only.
 * Tapping your survivor is where the Locker (Stage 4) will open.
 */
export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    drawSky(this);
    drawSkyline(this);
    spotTexture(this);
    this.settings = loadSettings();
    this.profile = loadProfile();
    this.rank = rankFor(this.profile.xp);
    // neon colours unlock with your rank (3 more per rank)
    this.colors = PLAYER_COLORS.slice(0, Math.min(PLAYER_COLORS.length, this.rank.colors));
    if (!this.colors.includes(this.settings.color)) this.settings.color = this.colors[0];
    if (!MODS.includes(this.settings.modifier)) this.settings.modifier = 'off';
    this.touch = this.sys.game.device.input.touch;
    this.parallax = { x: 0, y: 0, tx: 0, ty: 0 };

    // --- backdrop: sky, city, a dark rooftop
    this.sky = this.add.image(0, 0, 'sky').setOrigin(0);
    this.city = this.add.image(0, 0, 'skyline').setOrigin(0, 1);
    this.shade = this.add.rectangle(0, 0, 10, 10, 0x03040a, 0.42).setOrigin(0);
    this.roof = this.add.graphics();
    this.flash = this.add.rectangle(0, 0, 10, 10, 0xc8d8ff, 1).setOrigin(0).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);

    // --- the lineup: other survivors in the dark, only their visors glow
    const others = PLAYER_COLORS.filter((c) => c !== this.settings.color).slice(0, 6);
    this.lineup = others.map((color, i) => {
      const key = `menu-survivor-${color}`;
      createSurvivor(this, key, color, undefined, { res: RES, only: ['idle'] });
      const sprite = this.add.sprite(0, 0, key, 'idle0').setOrigin(0.5, 1).setTint(DARK).setAlpha(0.9);
      sprite.play({ key: `${key}-idle`, startFrame: i % 2 });
      sprite.anims.timeScale = 0.6 + (i % 3) * 0.15;
      const face = this.add.image(0, 0, facesKey(RES), 'neutral').setTint(faceTint(color)).setAlpha(0.95);
      return { sprite, face, color, flip: i < 3 ? false : true };
    });

    // --- fog drifting over the roof
    this.fog = [0, 1, 2].map((i) =>
      this.add.image(0, 0, 'glow').setTint(0x8fa6c8).setAlpha(0.06 + i * 0.015).setBlendMode(Phaser.BlendModes.ADD),
    );

    // --- the fan of cards behind your survivor
    this.fan = FAN.map((card) => this.add.image(0, 0, cardTexture(this, card)).setOrigin(0.5, 1).setAlpha(0.8).setTint(0xb8c2d4));
    this.fanSpread = { v: 0 };

    // --- spotlight + your survivor on a glowing pad
    this.spot = this.add.image(0, 0, 'menu-spot').setOrigin(0.5, 0).setBlendMode(Phaser.BlendModes.ADD).setTint(0xdfe8ff).setAlpha(0.16);
    this.pad = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD);
    this.padRing = this.add.graphics();
    this.hero = this.add.sprite(0, 0, '__DEFAULT').setOrigin(0.5, 1).setInteractive({ useHandCursor: true });
    this.heroFace = this.add.image(0, 0, '__DEFAULT');
    this.hop = { y: 0, sx: 1, sy: 1, drop: 0 };
    this.hero.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      this.openLocker();
    });
    this.setHero();

    // --- rain over everything in the world
    this.rain = this.add.particles(0, -20, 'rain', {
      x: { min: -40, max: 2400 },
      speedY: { min: 620, max: 760 },
      speedX: -60,
      lifespan: 1600,
      quantity: 2,
      frequency: 24,
      alpha: { min: 0.15, max: 0.4 },
    });

    // --- neon title: one tube per letter, "DECK" in your colour
    this.titleLetters = [];
    this.kicker = this.add.text(0, 0, 'HELIX RESEARCH FACILITY  ·  NIGHT SHIFT', { fontFamily: FONT, fontSize: `${MIN_TEXT}px`, fontStyle: '600', color: '#7fb8b0' })
      .setOrigin(0.5).setLetterSpacing(6).setAlpha(0);
    for (const [word, color] of [['OUTBREAK', '#eafffb'], ['DECK', this.settings.color]]) {
      for (const ch of word) {
        const t = this.add.text(0, 0, ch, { fontFamily: FONT, fontSize: '64px', fontStyle: '700', color }).setOrigin(0.5).setAlpha(0);
        t.word = word;
        this.titleLetters.push(t);
      }
    }
    this.buzz = this.titleLetters[this.titleLetters.length - 3]; // the "E" of DECK has a loose wire

    // --- glass consoles: MATCH (left), YOU (right)
    this.panels = [this.add.graphics(), this.add.graphics()];
    this.panelTitles = [
      this.add.text(0, 0, 'MATCH', { fontFamily: FONT, fontSize: `${MIN_TEXT}px`, fontStyle: '700', color: '#9ffff4' }).setOrigin(0.5).setLetterSpacing(6),
      this.add.text(0, 0, 'YOU', { fontFamily: FONT, fontSize: `${MIN_TEXT}px`, fontStyle: '700', color: this.settings.color }).setOrigin(0.5).setLetterSpacing(6),
    ];
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
    ];
    // colour: tap a swatch (unlocked colours; more unlock with your rank)
    this.colorLabel = this.add.text(0, 0, 'COLOUR', { fontFamily: FONT, fontSize: `${MIN_TEXT}px`, fontStyle: '700', color: UI.dim }).setOrigin(0.5).setLetterSpacing(4);
    this.swatchRing = this.add.graphics();
    this.swatches = this.colors.map((color) => {
      const dot = this.add.circle(0, 0, 9, hex(color)).setInteractive({ useHandCursor: true });
      dot.on('pointerdown', (p, x, y, e) => {
        e?.stopPropagation();
        if (this.settings.color === color) return;
        this.settings.color = color;
        sfx.play('tap');
        this.setHero();
        this.cheer();
        this.refresh();
      });
      return dot;
    });
    const locked = PLAYER_COLORS.length - this.colors.length;
    this.lockedText = this.add.text(0, 0, locked ? `+${locked} TO UNLOCK` : '', { fontFamily: FONT, fontSize: `${MIN_TEXT}px`, fontStyle: '600', color: '#5d6573' }).setOrigin(0.5).setLetterSpacing(2);
    this.rankText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: '#ffd27a' }).setOrigin(0.5).setLetterSpacing(3);

    // sound on / off (top right, or the S key)
    this.soundText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: '#9ffff4' }).setOrigin(1, 0).setLetterSpacing(3)
      .setInteractive({ useHandCursor: true });
    const drawSound = () => this.soundText.setText(sfx.enabled ? '♪ ON' : '♪ OFF').setColor(sfx.enabled ? '#9ffff4' : '#6a707c');
    this.soundText.on('pointerdown', (p, x, y, e) => { e?.stopPropagation(); sfx.toggle(); drawSound(); });
    this.input.keyboard.on('keydown-S', () => { sfx.toggle(); drawSound(); });
    drawSound();
    this.info = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: `${MIN_TEXT}px`, fontStyle: '700', color: UI.dim }).setOrigin(0.5).setLetterSpacing(2);

    // --- the big button
    this.buttonGlow = this.add.graphics();
    this.button = this.add.graphics();
    this.prompt = this.add.text(0, 0, 'PLAY VS BOTS', { fontFamily: FONT, fontSize: '19px', fontStyle: '700', color: '#06080c' }).setOrigin(0.5).setLetterSpacing(6);
    this.shine = this.add.rectangle(0, 0, 26, 80, 0xffffff, 0.45).setAngle(20).setBlendMode(Phaser.BlendModes.ADD);
    this.playZone = this.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
    this.playZone.on('pointerup', (p) => this.start(p.wasTouch));
    this.playZone.on('pointerover', () => this.setFace('happy'));
    this.playZone.on('pointerout', () => this.setFace('neutral'));
    this.build = this.add.text(0, 0, 'ENTER  PLAY   ·   ← →  BOTS   ·   S  SOUND', { fontFamily: FONT, fontSize: `${MIN_TEXT}px`, fontStyle: '600', color: '#4f5866' })
      .setOrigin(0.5, 1).setLetterSpacing(2).setVisible(!this.touch);

    this.layout();
    this.refresh();
    this.intro();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    this.input.on('pointermove', (p) => {
      this.parallax.tx = (p.x / this.scale.width - 0.5) * 2;
      this.parallax.ty = (p.y / this.scale.height - 0.5) * 2;
    });

    // life: breathing, glances, a flickering letter, a guilty pair of eyes, lightning
    this.tweens.add({ targets: this.hop, y: -4, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.tweens.add({ targets: this.fanSpread, v: 1, duration: 3200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.tweens.add({ targets: this.spot, alpha: 0.2, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.time.addEvent({ delay: 4200, loop: true, callback: () => this.lookAround() });
    this.time.addEvent({ delay: 90, loop: true, callback: () => this.buzzLetter() });
    this.time.addEvent({ delay: 5200, loop: true, callback: () => this.guiltyEyes() });
    this.time.addEvent({ delay: 2600, loop: true, callback: () => this.sweepShine() });
    this.scheduleLightning();

    this.started = false;
    this.input.keyboard.on('keydown-ENTER', () => this.start(false));
    this.input.keyboard.on('keydown-SPACE', () => this.start(false));
    this.input.keyboard.on('keydown-LEFT', () => this.change(0, -1));
    this.input.keyboard.on('keydown-RIGHT', () => this.change(0, 1));
  }

  // ------------------------------------------------------------ intro + ambience
  /** The sign switches on letter by letter, your survivor drops onto the pad, the consoles slide in. */
  intro() {
    this.titleLetters.forEach((t, i) => {
      this.time.delayedCall(180 + i * 70 + Math.random() * 60, () => {
        t.setAlpha(1);
        this.time.delayedCall(60, () => t.setAlpha(0.3));
        this.time.delayedCall(120, () => t.setAlpha(1));
      });
    });
    this.tweens.add({ targets: this.kicker, alpha: 1, delay: 900, duration: 600 });
    this.hop.drop = -this.scale.height * 0.6;
    for (const f of this.fan) f.setAlpha(0);
    this.fanKick = -1.3; // the fan is closed until you land
    this.tweens.add({ targets: this.hop, drop: 0, duration: 520, delay: 250, ease: 'Quad.in', onComplete: () => this.land() });
    const slide = [...this.leftItems(), ...this.rightItems()];
    for (const o of slide) o.setAlpha(0);
    this.tweens.add({ targets: slide, alpha: 1, delay: 500, duration: 500 });
  }

  land() {
    // the cards snap open behind you
    this.tweens.add({ targets: this.fan, alpha: 0.8, duration: 250 });
    this.tweens.add({ targets: this, fanKick: 0, duration: 650, ease: 'Back.out' });
    Object.assign(this.hop, { sx: 1.18, sy: 0.82 });
    this.tweens.add({ targets: this.hop, sx: 1, sy: 1, duration: 420, ease: 'Back.out' });
    this.cameras.main.shake(120, 0.003);
  }

  leftItems() {
    return [this.panels[0], this.panelTitles[0], ...this.options.slice(0, 3).flatMap((o) => [o.label, o.text, o.minus, o.plus])];
  }

  rightItems() {
    const o = this.options[3];
    return [this.panels[1], this.panelTitles[1], o.label, o.text, o.minus, o.plus, this.colorLabel, this.swatchRing, ...this.swatches, this.lockedText, this.rankText];
  }

  /** The loose letter of the neon sign buzzes now and then. */
  buzzLetter() {
    if (this.buzz.alpha === 0) return;
    if (Math.random() < 0.06) this.buzz.setAlpha(Math.random() < 0.5 ? 0.15 : 0.55);
    else if (this.buzz.alpha < 1 && Math.random() < 0.5) this.buzz.setAlpha(1);
  }

  /** Someone in the lineup glows green for a moment. Which one? */
  guiltyEyes() {
    const m = Phaser.Utils.Array.GetRandom(this.lineup);
    m.face.setTint(0x9dff6a).setFrame('suspicious');
    this.time.delayedCall(260, () => m.face.setTint(faceTint(m.color)));
    this.time.delayedCall(900, () => m.face.setFrame('neutral'));
  }

  scheduleLightning() {
    this.time.delayedCall(6000 + Math.random() * 6000, () => {
      this.lightning();
      this.scheduleLightning();
    });
  }

  /** A double flash lights up the lineup, then thunder rolls in. */
  lightning() {
    const flash = (alpha, at) => this.time.delayedCall(at, () => {
      this.flash.setAlpha(alpha);
      this.tweens.add({ targets: this.flash, alpha: 0, duration: 260 });
      for (const m of this.lineup) m.sprite.setTint(0x9aa6bc);
      this.time.delayedCall(140, () => this.lineup.forEach((m) => m.sprite.setTint(DARK)));
    });
    flash(0.32, 0);
    flash(0.18, 170);
    this.time.delayedCall(650, () => sfx.play('thunder', 0.5));
    this.setFace('scared', 700);
  }

  sweepShine() {
    const b = this.buttonBox;
    if (!b) return;
    this.shine.setPosition(b.x - b.w / 2 - 20, b.y);
    this.tweens.add({ targets: this.shine, x: b.x + b.w / 2 + 20, duration: 700, ease: 'Sine.inOut' });
  }

  // ------------------------------------------------------------ your survivor
  /** (Re)build the big survivor in your colour; the title's DECK, the YOU console and the pad follow it. */
  setHero() {
    const color = this.settings.color;
    const key = `menu-survivor-${color}`;
    createSurvivor(this, key, color, undefined, { res: RES, only: ['idle'] });
    this.hero.setTexture(key, 'idle0').play(`${key}-idle`);
    this.heroFace.setTexture(facesKey(RES), 'neutral').setTint(faceTint(color));
    this.pad.setTint(hex(color));
    for (const t of this.titleLetters ?? []) if (t.word === 'DECK') t.setColor(color).setShadow(0, 0, color, 22, false, true);
    this.panelTitles?.[1].setColor(color);
    this.drawPad();
    this.drawPanels();
  }

  drawPad() {
    if (!this.padW) return;
    const c = hex(this.settings.color);
    this.padRing.clear().lineStyle(2, c, 0.85).strokeEllipse(this.heroX, this.heroY, this.padW, this.padW * 0.16)
      .lineStyle(7, c, 0.14).strokeEllipse(this.heroX, this.heroY, this.padW + 10, this.padW * 0.16 + 5);
  }

  setFace(name, ms = 0) {
    this.heroFace.setFrame(name);
    this.faceTimer?.remove();
    if (ms) this.faceTimer = this.time.delayedCall(ms, () => this.heroFace.setFrame('neutral'));
  }

  /** A happy little hop (colour changed, or you tapped them). The cards fan out. */
  cheer() {
    this.setFace('happy', 1100);
    this.tweens.killTweensOf(this.hop);
    Object.assign(this.hop, { sx: 1.12, sy: 0.86 });
    this.tweens.add({ targets: this.hop, sx: 1, sy: 1, duration: 420, ease: 'Back.out' });
    this.tweens.add({ targets: this.hop, y: -18, duration: 160, yoyo: true, ease: 'Quad.out', onComplete: () => {
      this.tweens.add({ targets: this.hop, y: -4, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    } });
    this.fanKick = 1;
    this.tweens.add({ targets: this, fanKick: 0, duration: 700, ease: 'Cubic.out' });
  }

  /** Now and then the survivor glances around. */
  lookAround() {
    if (this.heroFace.frame.name === 'neutral') this.setFace(Math.random() < 0.6 ? 'suspicious' : 'scared', 700);
  }

  /** Stage 4 opens the Locker from here; for now the survivor just waves back. */
  openLocker() {
    sfx.play('tap');
    this.cheer();
  }

  // ------------------------------------------------------------ options
  /** A "LABEL / ‹ value ›" block with tappable arrows. */
  option(label, value, step) {
    const o = { value, step };
    o.label = this.add.text(0, 0, label, { fontFamily: FONT, fontSize: `${MIN_TEXT}px`, fontStyle: '700', color: UI.dim }).setOrigin(0.5).setLetterSpacing(4);
    o.text = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '21px', fontStyle: '700', color: '#ffffff' }).setOrigin(0.5).setLetterSpacing(2);
    o.minus = this.add.text(0, 0, '‹', { fontFamily: FONT, fontSize: '32px', fontStyle: '700', color: '#9ffff4' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    o.plus = this.add.text(0, 0, '›', { fontFamily: FONT, fontSize: '32px', fontStyle: '700', color: '#9ffff4' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    for (const [t, d] of [[o.minus, -1], [o.plus, 1]]) {
      t.input.hitArea.setTo(-12, -6, t.width + 24, t.height + 12); // bigger touch targets than the glyphs
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
    const total = this.settings.bots + 1;
    this.info.setText(`${total} PLAYERS  ·  ${infectedCount(total)} INFECTED`);
    this.rankText.setText(`${this.rank.name.toUpperCase()}  ·  ${this.profile.xp} XP`);
    this.drawSwatchRing();
    saveSettings(this.settings);
  }

  /** Long values (modifier names) shrink to fit between the arrows. */
  fitOption(o) {
    if (!o.room) return;
    o.text.setScale(1);
    if (o.text.width > o.room) o.text.setScale(o.room / o.text.width);
  }

  drawSwatchRing() {
    const i = this.colors.indexOf(this.settings.color);
    const d = this.swatches[i];
    if (!d) return;
    this.swatchRing.clear().lineStyle(2.5, 0xffffff, 1).strokeCircle(d.x, d.y, 13).lineStyle(6, hex(this.settings.color), 0.25).strokeCircle(d.x, d.y, 15);
  }

  /** The two glass consoles: dark glass, a neon edge, corner ticks. */
  drawPanels() {
    if (!this.panelBoxes) return;
    const edges = [0x9ffff4, hex(this.settings.color)];
    this.panelBoxes.forEach((b, i) => {
      const g = this.panels[i].clear();
      g.fillStyle(0x07080c, 0.62).fillRoundedRect(b.x, b.y, b.w, b.h, 14);
      g.lineStyle(1.5, edges[i], 0.55).strokeRoundedRect(b.x, b.y, b.w, b.h, 14);
      g.lineStyle(3, edges[i], 0.9);
      const t = 12;
      for (const [x, y, dx, dy] of [[b.x, b.y, 1, 1], [b.x + b.w, b.y, -1, 1], [b.x, b.y + b.h, 1, -1], [b.x + b.w, b.y + b.h, -1, -1]]) {
        g.beginPath().moveTo(x + dx * 4, y + dy * t + dy * 4).lineTo(x + dx * 4, y + dy * 4).lineTo(x + dx * t + dx * 4, y + dy * 4).strokePath();
      }
      // a thin scan line under the title
      g.fillStyle(edges[i], 0.35).fillRect(b.x + 18, b.y + 34, b.w - 36, 1);
    });
  }

  // ------------------------------------------------------------ layout (landscape, one layout)
  layout() {
    const { width: W, height: H } = this.scale;
    const small = H < 460;
    this.W = W;
    this.H = H;
    this.sky.setPosition(-(this.sky.width - W) / 2, -260);
    this.city.setPosition(-(this.city.width - W) / 2, H + 200);
    this.shade.setSize(W, H);
    this.flash.setSize(W, H);

    // title: a neon sign of single letters
    const titleY = small ? 36 : H * 0.12;
    const size = small ? 38 : Math.min(72, W / 14);
    let x = 0;
    const gap = size * 0.16;
    const space = size * 0.5;
    const widths = this.titleLetters.map((t) => t.setFontSize(size).width);
    const total = widths.reduce((s, w) => s + w + gap, 0) + space;
    x = W / 2 - total / 2;
    this.titleLetters.forEach((t, i) => {
      if (i > 0 && t.word !== this.titleLetters[i - 1].word) x += space;
      t.setPosition(x + widths[i] / 2, titleY);
      if (t.word === 'OUTBREAK') t.setShadow(0, 0, '#2fd2c0', 22, false, true);
      x += widths[i] + gap;
    });
    this.kicker.setPosition(W / 2, titleY - size * 0.62 - 10).setVisible(!small);
    this.soundText.setPosition(W - 16, 14);

    // the button
    const by = H - (small ? 34 : 58);
    const bw = small ? 230 : 300;
    const bh = small ? 46 : 54;
    this.buttonBox = { x: W / 2, y: by, w: bw, h: bh };
    this.button.clear().fillStyle(0x9ffff4, 1).fillRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, bh / 2);
    this.buttonGlow.clear().lineStyle(10, 0x9ffff4, 0.14).strokeRoundedRect(W / 2 - bw / 2 - 5, by - bh / 2 - 5, bw + 10, bh + 10, bh / 2 + 5);
    this.prompt.setPosition(W / 2, by);
    this.shine.setPosition(-100, by).setSize(26, bh + 20);
    // the shine only shows inside the button
    this.shineMask ??= this.make.graphics({}, false);
    this.shineMask.clear().fillStyle(0xffffff).fillRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, bh / 2);
    if (!this.shine.mask) this.shine.setMask(this.shineMask.createGeometryMask());
    this.playZone.setPosition(W / 2, by).setSize(bw, bh);
    this.playZone.input.hitArea.setTo(0, 0, bw, bh);
    this.build.setPosition(W / 2, H - 6).setVisible(!this.touch && !small);

    // stage: the survivor centre stage, on the rooftop line
    const top = titleY + (small ? 28 : 54);
    const bottom = by - bh / 2 - (small ? 26 : 40);
    const heroH = Math.min((bottom - top) * 0.92, 340);
    this.heroScale = heroH / (SURVIVOR_SIZE.height * RES);
    this.heroH = heroH;
    this.heroX = W / 2;
    this.heroY = bottom;
    this.padW = heroH * 0.62;
    this.pad.setPosition(this.heroX, this.heroY).setDisplaySize(this.padW * 1.7, this.padW * 0.36).setAlpha(0.4);
    this.spot.setPosition(this.heroX, -20).setDisplaySize(heroH * 1.5, this.heroY + 30);
    this.drawPad();
    this.info.setPosition(W / 2, this.heroY + (small ? 16 : 22));
    // the rooftop: a dark slab with a neon edge from side to side
    this.roofY = this.heroY - heroH * 0.05;
    this.roof.clear().fillStyle(0x05060a, 0.9).fillRect(0, this.roofY, W, H - this.roofY)
      .fillStyle(0xffb04a, 0.55).fillRect(0, this.roofY, W, 1.5).fillStyle(0xffb04a, 0.08).fillRect(0, this.roofY + 1.5, W, 6);
    // the lineup stands along the rooftop edge, smaller (further away)
    const lineH = heroH * 0.52;
    const slots = [0.06, 0.17, 0.28, 0.72, 0.83, 0.94];
    this.lineup.forEach((m, i) => {
      m.scale = lineH / (SURVIVOR_SIZE.height * RES);
      m.x = W * slots[i];
      m.y = this.roofY + 2;
      m.sprite.setFlipX(m.flip);
    });
    this.fog.forEach((f, i) => f.setDisplaySize(W * 1.6, heroH * (0.5 + i * 0.2)).setPosition(W / 2, this.roofY - heroH * 0.05 * i));
    this.fan.forEach((f) => f.setScale((heroH * 0.6) / (CARD_H * 2)));

    // consoles left and right of the stage
    const colW = Math.min(250, (W - heroH * 1.15) / 2 - 24);
    const rowGap = Math.min(70, (bottom - top - 40) / 3.2);
    const ph = 58 + rowGap * 3;
    const py = (top + bottom) / 2 - ph / 2;
    const lx = 16 + (W / 2 - heroH * 0.58 - 16 - colW) * 0.35;
    const rx = W - lx - colW;
    this.panelBoxes = [{ x: lx, y: py, w: colW, h: ph }, { x: rx, y: py, w: colW, h: ph }];
    this.panelTitles[0].setPosition(lx + colW / 2, py + 20);
    this.panelTitles[1].setPosition(rx + colW / 2, py + 20);
    const place = (o, cx, y) => {
      const spread = colW / 2 - 22;
      const lift = small ? 12 : 16; // label above, value below
      o.label.setPosition(cx, y - lift);
      o.text.setPosition(cx, y + lift - 4);
      o.minus.setPosition(cx - spread, y + lift - 4);
      o.plus.setPosition(cx + spread, y + lift - 4);
      o.room = spread * 2 - 44;
      this.fitOption(o);
    };
    const row0 = py + 44 + rowGap * 0.45;
    [0, 1, 2].forEach((i) => place(this.options[i], lx + colW / 2, row0 + i * rowGap));
    place(this.options[3], rx + colW / 2, row0);
    // colour swatches, in rows of 5
    const cy = row0 + rowGap - 4;
    this.colorLabel.setPosition(rx + colW / 2, cy - 12);
    const perRow = 5;
    this.swatches.forEach((d, i) => {
      const n = Math.min(perRow, this.swatches.length - Math.floor(i / perRow) * perRow);
      const k = i % perRow;
      d.setPosition(rx + colW / 2 + (k - (n - 1) / 2) * 28, cy + 16 + Math.floor(i / perRow) * 26);
    });
    const rows = Math.ceil(this.swatches.length / perRow);
    this.lockedText.setPosition(rx + colW / 2, cy + 16 + rows * 26 - 4);
    this.rankText.setPosition(rx + colW / 2, py + ph - 18);
    this.drawPanels();
    this.drawSwatchRing();
  }

  // ------------------------------------------------------------ every frame
  update(time, delta) {
    if (!this.heroScale) return;
    const p = this.parallax;
    p.x += (p.tx - p.x) * Math.min(1, delta / 300);
    p.y += (p.ty - p.y) * Math.min(1, delta / 300);
    this.sky.x = -(this.sky.width - this.W) / 2 - p.x * 6;
    this.city.x = -(this.city.width - this.W) / 2 - p.x * 12;

    // your survivor (+ visor face)
    const s = this.heroScale;
    const h = this.hero.setScale(s * this.hop.sx, s * this.hop.sy).setPosition(this.heroX, this.heroY + this.hop.y + this.hop.drop);
    this.placeFace(h, this.heroFace, false);

    // the lineup sways a little with the parallax; their visors glow in the dark
    for (const m of this.lineup) {
      m.sprite.setScale(m.scale).setPosition(m.x - p.x * 16, m.y);
      this.placeFace(m.sprite, m.face, m.flip);
    }

    // the card fan breathes open and shut behind you
    const spread = Math.max(0, 0.32 + this.fanSpread.v * 0.1 + (this.fanKick ?? 0) * 0.25);
    const n = this.fan.length;
    this.fan.forEach((f, i) => {
      const k = i - (n - 1) / 2;
      const a = k * spread;
      f.setRotation(a).setPosition(this.heroX + Math.sin(a) * this.heroH * 0.12 - p.x * 8, this.heroY - this.heroH * 0.22 + Math.abs(k) * 4 - p.y * 4);
    });

    // fog drifts
    this.fog.forEach((f, i) => (f.x = this.W / 2 + Math.sin(time / (5000 + i * 1700) + i) * this.W * 0.08 - p.x * (10 + i * 6)));
  }

  /** Lay a visor face over a survivor sprite (anchors are in 1x frame pixels). */
  placeFace(sprite, face, flip) {
    const a = FACE_ANCHORS[sprite.frame.name];
    if (!a) return;
    let dx = (a.x - SURVIVOR_SIZE.width / 2) * RES * sprite.scaleX;
    const dy = (a.y - SURVIVOR_SIZE.height) * RES * sprite.scaleY;
    if (flip) dx = -dx;
    face.setPosition(sprite.x + dx, sprite.y + dy).setScale(sprite.scaleX, sprite.scaleY).setFlipX(flip);
  }

  start(fromTouch) {
    if (this.started) return;
    this.started = true;
    sfx.unlock();
    sfx.play('accept');
    this.setFace('happy');
    this.tweens.add({ targets: this.hop, y: -30, duration: 220, yoyo: true, ease: 'Quad.out' });
    if (fromTouch && this.scale.fullscreen.available && !this.scale.isFullscreen) {
      try {
        this.scale.startFullscreen();
        // phones: hold it sideways (works in fullscreen on Android; iOS shows the turn-your-phone screen)
        screen.orientation?.lock?.('landscape').catch(() => {});
      } catch {
        /* not allowed here; keep playing windowed */
      }
    }
    this.cameras.main.fadeOut(450, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('SideScene', { ...this.settings }));
  }
}
