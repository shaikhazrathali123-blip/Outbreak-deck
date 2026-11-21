import Phaser from 'phaser';

export const FONT = '"Rajdhani", "Segoe UI", sans-serif';
export const UI = {
  ink: '#e9e4d6',
  dim: '#8f96a3',
  panel: 0x07080c,
  line: 0xe9e4d6,
};

/** Room banner, location chip, FPS and controls hint. */
export default class HUD {
  constructor(scene) {
    this.scene = scene;
    const touch = scene.sys.game.device.input.touch;

    // location chip (top-left)
    this.chip = scene.add.graphics();
    this.dot = scene.add.circle(0, 0, 4, 0x2fd2c0);
    this.location = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: UI.ink }).setLetterSpacing(2);
    this.floorText = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '11px', fontStyle: '600', color: UI.dim }).setLetterSpacing(2);
    this.fps = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '11px', fontStyle: '500', color: '#4f5866' });

    // big room banner (top-centre)
    this.kicker = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '12px', fontStyle: '600', color: UI.dim })
      .setOrigin(0.5)
      .setLetterSpacing(6)
      .setAlpha(0);
    this.banner = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '34px', fontStyle: '700', color: '#ffffff' })
      .setOrigin(0.5)
      .setLetterSpacing(8)
      .setAlpha(0);
    this.rule = scene.add.graphics().setAlpha(0);

    this.hint = scene.add
      .text(0, 0, touch ? 'DRAG TO WALK  ·  PUSH UP OR DOWN AT A LADDER  ·  TAP MAP' : 'A / D  WALK   ·   W / S  CLIMB   ·   M  MAP', {
        fontFamily: FONT,
        fontSize: '13px',
        fontStyle: '600',
        color: '#c9ced8',
      })
      .setOrigin(0.5, 1)
      .setLetterSpacing(2);
    this.hintBg = scene.add.graphics();
    scene.time.delayedCall(9000, () => this.hideHint());

    this.nextFpsUpdate = 0;
    this.roomColor = '#2fd2c0';
    this.layout(scene.scale.width, scene.scale.height);
  }

  layout(width, height) {
    const small = width < 560;
    this.width = width;
    this.dot.setPosition(26, 27);
    this.location.setPosition(38, 14);
    this.floorText.setPosition(38, 32);
    this.fps.setPosition(18, 54);
    this.drawChip();
    this.kicker.setPosition(width / 2, small ? 44 : 54);
    this.banner.setFontSize(small ? 24 : 34).setPosition(width / 2, small ? 68 : 84);
    this.bannerY = this.banner.y;
    this.hint.setPosition(width / 2, height - 22);
    this.drawHintBg();
  }

  drawChip() {
    const w = Math.max(this.location.width, this.floorText.width) + 40;
    this.chip.clear().fillStyle(UI.panel, 0.78).fillRoundedRect(12, 10, w, 40, 8).lineStyle(1, UI.line, 0.14).strokeRoundedRect(12, 10, w, 40, 8);
  }

  drawHintBg() {
    const b = this.hint.getBounds();
    this.hintBg.clear();
    if (!this.hint.visible || this.hint.alpha === 0) return;
    this.hintBg.fillStyle(UI.panel, 0.72).fillRoundedRect(b.x - 16, b.y - 7, b.width + 32, b.height + 12, 14);
  }

  showRoom(room) {
    const color = room?.color ?? '#8a9aa6';
    this.roomColor = color;
    this.location.setText(room ? room.name.toUpperCase() : 'IN TRANSIT');
    this.floorText.setText(room?.floorName?.toUpperCase() ?? '');
    this.dot.setFillStyle(Phaser.Display.Color.HexStringToColor(color).color);
    this.drawChip();
    if (!room) return;

    const targets = [this.banner, this.kicker, this.rule];
    this.scene.tweens.killTweensOf(targets);
    this.banner.setText(room.name.toUpperCase()).setShadow(0, 0, color, 18, false, true).setY(this.bannerY - 6).setAlpha(0);
    this.kicker.setText((room.floorName ?? 'ENTERING').toUpperCase()).setAlpha(0);
    const half = this.banner.width / 2 + 24;
    const y = this.bannerY + 26;
    const c = Phaser.Display.Color.HexStringToColor(color).color;
    this.rule.clear().fillStyle(c, 1).fillRect(this.width / 2 - half, y, half * 2, 1.5).setAlpha(0);
    this.scene.tweens.add({ targets: this.banner, alpha: 1, y: this.bannerY, duration: 320, ease: 'Cubic.out' });
    this.scene.tweens.add({ targets: [this.kicker, this.rule], alpha: 0.9, duration: 320 });
    this.scene.tweens.add({ targets, alpha: 0, delay: 1800, duration: 700 });
  }

  setVisible(visible) {
    for (const t of [this.chip, this.dot, this.location, this.floorText, this.fps, this.kicker, this.banner, this.rule]) t.setVisible(visible);
    this.hint.setVisible(visible && !this.hintHidden);
    this.hintBg.setVisible(visible && !this.hintHidden);
  }

  hideHint() {
    if (this.hintHidden) return;
    this.hintHidden = true;
    this.scene.tweens.add({ targets: [this.hint, this.hintBg], alpha: 0, duration: 500 });
  }

  update(time) {
    if (time < this.nextFpsUpdate) return;
    this.nextFpsUpdate = time + 500;
    this.fps.setText(`${Math.round(this.scene.game.loop.actualFps)} FPS`);
  }
}
