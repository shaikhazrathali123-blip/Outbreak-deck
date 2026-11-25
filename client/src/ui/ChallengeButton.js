import Phaser from 'phaser';
import { FONT, UI } from './HUD.js';

const ACTIVE = 0xff4a5a;
const IDLE = 0x5a606c;

/** Round ⚔ button in the bottom-right. Also triggered with E. */
export default class ChallengeButton {
  constructor(scene, onPress) {
    this.scene = scene;
    this.onPress = onPress;
    this.enabled = false;
    this.root = scene.add.container(0, 0).setDepth(60).setVisible(false);
    this.ring = scene.add.graphics();
    this.icon = scene.add.graphics();
    this.label = scene.add.text(0, 56, 'CHALLENGE', { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: '#ffffff' }).setOrigin(0.5).setLetterSpacing(2);
    this.chip = scene.add.graphics();
    this.target = scene.add.text(0, -64, '', { fontFamily: FONT, fontSize: '16px', fontStyle: '700', color: '#ffffff' }).setOrigin(0.5).setLetterSpacing(2);
    this.zone = scene.add.zone(0, 0, 96, 96).setInteractive({ useHandCursor: true });
    this.zone.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      this.press();
    });
    this.root.add([this.ring, this.icon, this.label, this.chip, this.target, this.zone]);
    scene.input.keyboard?.on('keydown-E', () => this.press());
    this.drawIcon();
    this.layout(scene.scale.width, scene.scale.height);
  }

  press() {
    if (this.root.visible && this.enabled) this.onPress?.();
  }

  layout(width, height, bottomInset = 0) {
    this.root.setPosition(width - 70, height - 82 - Math.max(0, bottomInset - 40));
  }

  drawIcon() {
    const g = this.icon.clear().lineStyle(4, 0xffffff, 1);
    g.lineBetween(-14, -14, 12, 12).lineBetween(14, -14, -12, 12);
    g.lineBetween(-16, 6, -6, 16).lineBetween(16, 6, 6, 16);
    g.setPosition(0, 0);
  }

  /** state: null to hide, or { name, color, enabled, note } */
  set(state) {
    if (!state) {
      this.root.setVisible(false);
      return;
    }
    this.root.setVisible(true);
    this.enabled = state.enabled;
    const color = state.enabled ? ACTIVE : IDLE;
    this.ring
      .clear()
      .fillStyle(UI.panel, 0.88)
      .fillCircle(0, 0, 42)
      .lineStyle(3, color, 1)
      .strokeCircle(0, 0, 42);
    if (state.enabled) this.ring.lineStyle(8, color, 0.18).strokeCircle(0, 0, 47);
    this.icon.setAlpha(state.enabled ? 1 : 0.45);
    this.label.setText(state.note ?? 'CHALLENGE').setAlpha(state.enabled ? 1 : 0.7);
    this.target.setText(state.name).setColor(state.color);
    const w = this.target.width + 30;
    const c = Phaser.Display.Color.HexStringToColor(state.color).color;
    this.chip.clear().fillStyle(UI.panel, 0.88).fillRoundedRect(-w / 2, -78, w, 28, 14).fillStyle(c, 1).fillCircle(-w / 2 + 11, -64, 3.5);
    this.target.setX(5);
  }
}
