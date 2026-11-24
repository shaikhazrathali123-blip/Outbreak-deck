import Phaser from 'phaser';
import { FONT, UI } from '../ui/HUD.js';
import { drawSky, drawSkyline } from '../side/inkArt.js';
import { MAX_PLAYERS, MIN_PLAYERS, infectedCount, MODIFIERS, PLAYER_COLORS, dailyModifier, rankFor } from '../../../shared/constants.js';
import { loadProfile } from '../game/profile.js';
import sfx from '../audio/Sfx.js';

const DIFFICULTIES = ['easy', 'normal', 'hard'];
const MINUTES = [4, 6, 8];
const MODS = ['off', 'daily', ...Object.keys(MODIFIERS)];
const STORE = 'outbreak-deck-settings';

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

/** Title screen with "Play vs Bots": bot count, difficulty and match length. */
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
    this.sky = this.add.image(0, 0, 'sky').setOrigin(0);
    this.city = this.add.image(0, 0, 'skyline').setOrigin(0, 1);
    this.shade = this.add.rectangle(0, 0, 10, 10, 0x03040a, 0.5).setOrigin(0);

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

    // options
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
      // v3: one match modifier, and your neon colour
      this.option('MODIFIER', () => {
        const m = this.settings.modifier;
        if (m === 'off') return 'OFF';
        if (m === 'daily') return `DAILY: ${MODIFIERS[dailyModifier()].name.toUpperCase()}`;
        return MODIFIERS[m].name.toUpperCase();
      }, (d) => {
        this.settings.modifier = MODS[(MODS.indexOf(this.settings.modifier) + d + MODS.length) % MODS.length];
      }),
      this.option('COLOUR', () => `● ${this.colors.indexOf(this.settings.color) + 1} / ${this.colors.length}`, (d) => {
        const i = this.colors.indexOf(this.settings.color);
        this.settings.color = this.colors[(i + d + this.colors.length) % this.colors.length];
      }),
    ];
    // sound on / off (top right, or the S key)
    this.soundText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '13px', fontStyle: '700', color: '#9ffff4' }).setOrigin(1, 0).setLetterSpacing(3)
      .setInteractive({ useHandCursor: true });
    const drawSound = () => this.soundText.setText(sfx.enabled ? '♪ SOUND ON  ·  S' : '♪ SOUND OFF  ·  S').setColor(sfx.enabled ? '#9ffff4' : '#6a707c');
    this.soundText.on('pointerdown', (p, x, y, e) => { e?.stopPropagation(); sfx.toggle(); drawSound(); });
    this.input.keyboard.on('keydown-S', () => { sfx.toggle(); drawSound(); });
    drawSound();
    this.rankText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color: '#ffd27a' }).setOrigin(0.5).setLetterSpacing(3);
    this.info = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '12px', fontStyle: '600', color: UI.dim }).setOrigin(0.5).setLetterSpacing(2);

    this.button = this.add.graphics();
    this.prompt = this.add.text(0, 0, 'PLAY VS BOTS', { fontFamily: FONT, fontSize: '17px', fontStyle: '700', color: '#0a0b10' }).setOrigin(0.5).setLetterSpacing(5);
    this.playZone = this.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
    this.playZone.on('pointerup', (p) => this.start(p.wasTouch));
    this.build = this.add.text(0, 0, 'v0.4  ·  ENTER TO PLAY  ·  ←/→ CHANGE BOTS', { fontFamily: FONT, fontSize: '11px', fontStyle: '500', color: '#4f5866' }).setOrigin(0.5, 1).setLetterSpacing(3);

    this.tweens.add({ targets: [this.button, this.prompt], alpha: 0.8, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.time.addEvent({ delay: 160, loop: true, callback: () => this.title.setAlpha(Math.random() < 0.04 ? 0.55 : 1) });

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

  /** A "LABEL  ‹ value ›" row with tappable arrows. */
  option(label, value, step) {
    const o = { value, step };
    o.label = this.add.text(0, 0, label, { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color: UI.dim }).setOrigin(0.5).setLetterSpacing(4);
    o.text = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '20px', fontStyle: '700', color: '#ffffff' }).setOrigin(0.5).setLetterSpacing(3);
    o.minus = this.add.text(0, 0, '‹', { fontFamily: FONT, fontSize: '28px', fontStyle: '700', color: '#9ffff4' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    o.plus = this.add.text(0, 0, '›', { fontFamily: FONT, fontSize: '28px', fontStyle: '700', color: '#9ffff4' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    o.minus.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      step(-1);
      sfx.play('tap');
      this.refresh();
    });
    o.plus.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      step(1);
      sfx.play('tap');
      this.refresh();
    });
    return o;
  }

  change(i, d) {
    this.options[i].step(d);
    this.refresh();
  }

  refresh() {
    for (const o of this.options) o.text.setText(o.value());
    this.options[4].text.setColor(this.settings.color);
    const total = this.settings.bots + 1;
    const inf = infectedCount(total);
    const m = this.settings.modifier === 'daily' ? dailyModifier() : this.settings.modifier;
    this.info.setText(`${total} PLAYERS  ·  ${inf} START INFECTED${MODIFIERS[m] ? `  ·  ${MODIFIERS[m].text.toUpperCase()}` : ''}`);
    const r = this.rank;
    const locked = PLAYER_COLORS.length - this.colors.length;
    this.rankText.setText(`RANK ${r.name.toUpperCase()}  ·  ${this.profile.xp} XP${r.next ? `  ·  ${r.next.xp - this.profile.xp} TO ${r.next.name.toUpperCase()}` : ''}${locked ? `  ·  ${locked} COLOURS LOCKED` : ''}`);
    saveSettings(this.settings);
  }

  layout() {
    const { width, height } = this.scale;
    const small = width < 620 || height < 460;
    this.sky.setPosition(-(this.sky.width - width) / 2, -260);
    this.city.setPosition(-(this.city.width - width) / 2, height + 220);
    this.shade.setSize(width, height);
    const cy = height * (small ? 0.24 : 0.3);
    this.kicker.setFontSize(small ? 11 : 14).setPosition(width / 2, cy - (small ? 40 : 66));
    this.title.setFontSize(small ? 38 : 72).setPosition(width / 2, cy);
    this.rule.clear().fillStyle(0x2fd2c0, 0.8).fillRect(width / 2 - (small ? 90 : 160), cy + (small ? 28 : 50), small ? 180 : 320, 1.5);
    this.tagline.setFontSize(small ? 10 : 14).setPosition(width / 2, cy + (small ? 46 : 76));

    // two rows: bots / difficulty / time, then modifier / colour
    const oy = height * (small ? 0.48 : 0.5);
    const rowGap = small ? 56 : 70;
    const gap = Math.min(190, width / 3.4);
    this.options.forEach((o, i) => {
      const row = i < 3 ? 0 : 1;
      const col = i < 3 ? i - 1 : (i - 3) * 2 - 1;
      const x = width / 2 + col * (row ? gap * 0.85 : gap);
      const y = oy + row * rowGap;
      const spread = row && i === 3 ? (small ? 86 : 110) : small ? 52 : 62;
      o.label.setPosition(x, y - 20);
      o.text.setPosition(x, y + 8).setFontSize(row && i === 3 ? (small ? 14 : 16) : 20);
      o.minus.setPosition(x - spread, y + 8);
      o.plus.setPosition(x + spread, y + 8);
    });
    this.info.setPosition(width / 2, oy + rowGap + 40);
    this.rankText.setPosition(width / 2, oy + rowGap + 60);

    const by = height * (small ? 0.88 : 0.86);
    const bw = small ? 230 : 290;
    this.button.clear().fillStyle(0x9ffff4, 1).fillRoundedRect(width / 2 - bw / 2, by - 23, bw, 46, 23);
    this.prompt.setFontSize(small ? 15 : 17).setPosition(width / 2, by);
    this.playZone.setPosition(width / 2, by).setSize(bw, 46);
    this.playZone.input.hitArea.setTo(0, 0, bw, 46);
    this.build.setPosition(width / 2, height - 10);
    this.soundText.setPosition(width - 18, 16);
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
