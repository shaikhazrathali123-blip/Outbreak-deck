import Phaser from 'phaser';
import { icon } from './icons.js';
import { needsHint, hintDone } from '../game/hints.js';
import { showFps } from '../game/fx.js';

export const FONT = '"Rajdhani", "Segoe UI", sans-serif';
export const UI = {
  ink: '#e9e4d6',
  dim: '#8f96a3',
  panel: 0x07080c,
  line: 0xe9e4d6,
};
/** Smallest text on the HUD (px at a 375 px wide phone). */
export const MIN_TEXT = 14;

const BANNER_TIME = 1500; // the big room name, before it shrinks into the chip
const CHIP = { x: 12, y: 10, h: 34 };

/** Location chip, room banner, control hints (icons) and the FPS counter. */
export default class HUD {
  constructor(scene) {
    this.scene = scene;
    const touch = scene.sys.game.device.input.touch;

    // location chip (top-left): just the room name
    this.chip = scene.add.graphics();
    this.dot = scene.add.circle(0, 0, 5, 0x2fd2c0);
    this.location = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '17px', fontStyle: '700', color: UI.ink }).setOrigin(0, 0.5).setLetterSpacing(2);
    this.chipParts = [this.chip, this.dot, this.location];
    this.fps = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: `${MIN_TEXT}px`, fontStyle: '600', color: '#4f5866' }).setVisible(showFps());

    // big room banner (centre), shrinks into the chip
    this.kicker = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: `${MIN_TEXT}px`, fontStyle: '600', color: UI.dim }).setOrigin(0.5).setLetterSpacing(6).setAlpha(0);
    this.banner = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '40px', fontStyle: '700', color: '#ffffff' }).setOrigin(0.5).setLetterSpacing(8).setAlpha(0);
    this.rule = scene.add.graphics().setAlpha(0);
    for (const o of [this.kicker, this.banner, this.rule]) o.setDepth(90); // over toasts

    // control hints: an icon + key per action, each gone once you have done it (first match only)
    const keys = touch ? { walk: 'DRAG', climb: 'UP / DOWN', map: 'TAP MAP' } : { walk: 'A  D', climb: 'W  S', map: 'M' };
    this.hintItems = ['walk', 'climb', 'map'].filter(needsHint).map((action) => {
      const bg = scene.add.graphics();
      const ic = icon(scene, 0, 0, action, 24, 0x9ffff4);
      const t = scene.add.text(0, 0, keys[action], { fontFamily: FONT, fontSize: '16px', fontStyle: '700', color: '#e9e4d6' }).setOrigin(0, 0.5).setLetterSpacing(2);
      const c = scene.add.container(0, 0, [bg, ic, t]);
      const w = t.width + 54;
      bg.fillStyle(UI.panel, 0.82).fillRoundedRect(-w / 2, -18, w, 36, 18).lineStyle(1, 0x9ffff4, 0.35).strokeRoundedRect(-w / 2, -18, w, 36, 18);
      ic.setPosition(-w / 2 + 22, 0);
      t.setX(-w / 2 + 40);
      c.hintW = w;
      c.action = action;
      return c;
    });

    this.nextFpsUpdate = 0;
    this.roomColor = '#2fd2c0';
    this.layout(scene.scale.width, scene.scale.height);
  }

  layout(width, height) {
    this.width = width;
    this.height = height;
    this.dot.setPosition(CHIP.x + 16, CHIP.y + CHIP.h / 2);
    this.location.setPosition(CHIP.x + 28, CHIP.y + CHIP.h / 2);
    this.drawChip();
    const small = height < 480;
    this.bannerY = height * (small ? 0.3 : 0.28);
    this.kicker.setPosition(width / 2, this.bannerY - (small ? 30 : 38));
    this.banner.setFontSize(small ? 32 : 44).setPosition(width / 2, this.bannerY);
    this.fitBanner();
    this.placeHints(height - 60);
  }

  /** Long room names shrink to fit narrow screens. */
  fitBanner() {
    const max = this.width - 40;
    this.banner.setScale(1);
    if (this.banner.width > max) this.banner.setScale(max / this.banner.width);
  }

  /** Hints sit in a row at `y` (just above your cards). */
  placeHints(y, cx = this.hintX ?? this.width / 2) {
    this.hintY = y;
    this.hintX = cx;
    const gap = 10;
    const total = this.hintItems.reduce((s, c) => s + c.hintW, 0) + gap * Math.max(0, this.hintItems.length - 1);
    let x = cx - total / 2;
    for (const c of this.hintItems) {
      c.setPosition(x + c.hintW / 2, y);
      x += c.hintW + gap;
    }
  }

  drawChip() {
    const w = this.location.width + 44;
    this.chipW = w;
    this.chip.clear().fillStyle(UI.panel, 0.8).fillRoundedRect(CHIP.x, CHIP.y, w, CHIP.h, CHIP.h / 2)
      .lineStyle(1.5, Phaser.Display.Color.HexStringToColor(this.roomColor).color, 0.55).strokeRoundedRect(CHIP.x, CHIP.y, w, CHIP.h, CHIP.h / 2);
  }

  /** Entering a room: its name big in the middle for 1.5s, then it flies into the chip. */
  showRoom(room) {
    const s = this.scene;
    const color = room?.color ?? '#8a9aa6';
    this.roomColor = color;
    this.location.setText(room ? room.name.toUpperCase() : 'IN TRANSIT');
    this.dot.setFillStyle(Phaser.Display.Color.HexStringToColor(color).color);
    this.drawChip();
    const targets = [this.banner, this.kicker, this.rule, ...this.chipParts];
    s.tweens.killTweensOf(targets);
    this.bannerTimer?.remove();
    if (!room || this.hidden) {
      this.onBanner?.(0);
      this.banner.setAlpha(0);
      this.kicker.setAlpha(0);
      this.rule.setAlpha(0);
      for (const o of this.chipParts) o.setAlpha(1);
      return;
    }
    for (const o of this.chipParts) o.setAlpha(0);
    this.onBanner?.(this.bannerY + 44 - (this.scene.toasts?.y ?? 0));
    this.banner.setText(room.name.toUpperCase()).setShadow(0, 0, color, 18, false, true).setPosition(this.width / 2, this.bannerY + 8).setAlpha(0);
    this.fitBanner();
    this.kicker.setText((room.floorName ?? '').toUpperCase()).setAlpha(0);
    const half = this.banner.displayWidth / 2 + 20;
    this.rule.clear().fillStyle(Phaser.Display.Color.HexStringToColor(color).color, 1).fillRect(this.width / 2 - half, this.bannerY + 28, half * 2, 2).setAlpha(0);
    s.tweens.add({ targets: this.banner, alpha: 1, y: this.bannerY, duration: 280, ease: 'Cubic.out' });
    s.tweens.add({ targets: [this.kicker, this.rule], alpha: 0.9, duration: 280 });
    this.bannerTimer = s.time.delayedCall(BANNER_TIME, () => {
      // shrink into the chip: same text, chip size, chip place
      const end = this.location.height / (this.banner.height || 1);
      const ex = this.location.x + (this.banner.width * end) / 2;
      s.tweens.add({ targets: this.banner, x: ex, y: this.location.y, scale: end, alpha: 0, duration: 420, ease: 'Cubic.in' });
      s.tweens.add({ targets: [this.kicker, this.rule], alpha: 0, duration: 250 });
      s.tweens.add({ targets: this.chipParts, alpha: 1, delay: 300, duration: 200 });
      this.onBanner?.(0);
    });
  }

  setVisible(visible) {
    this.hidden = !visible;
    for (const t of [...this.chipParts, this.kicker, this.banner, this.rule, ...this.hintItems]) t.setVisible(visible);
    this.fps.setVisible(visible && showFps());
  }

  /** You did `action`: drop its hint for good. */
  done(action) {
    const c = this.hintItems.find((h) => h.action === action);
    hintDone(action);
    if (!c) return;
    this.hintItems = this.hintItems.filter((h) => h !== c);
    this.scene.tweens.add({ targets: c, alpha: 0, y: c.y + 10, duration: 300, onComplete: () => c.destroy() });
    this.placeHints(this.hintY);
  }

  update(time) {
    if (!this.fps.visible || time < this.nextFpsUpdate) return;
    this.nextFpsUpdate = time + 500;
    this.fps.setText(`${Math.round(this.scene.game.loop.actualFps)} FPS`);
  }
}
