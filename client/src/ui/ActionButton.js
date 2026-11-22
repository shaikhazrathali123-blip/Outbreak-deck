import Phaser from 'phaser';
import { FONT, UI } from './HUD.js';

const IDLE = 0x5a606c;

/**
 * Round button left of the challenge button for stations: call a meeting at the
 * Emergency Button, take a Blood Test, use the Cure machine. Also triggered with Space.
 */
export default class ActionButton {
  constructor(scene, onPress) {
    this.scene = scene;
    this.onPress = onPress;
    this.enabled = false;
    this.key = '';
    this.root = scene.add.container(0, 0).setDepth(60).setVisible(false);
    this.ring = scene.add.graphics();
    this.title = scene.add.text(0, -4, '', { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color: '#ffffff', align: 'center' }).setOrigin(0.5).setLetterSpacing(1);
    this.label = scene.add.text(0, 30, '', { fontFamily: FONT, fontSize: '11px', fontStyle: '700', color: '#ffffff' }).setOrigin(0.5).setLetterSpacing(2);
    this.zone = scene.add.zone(0, 0, 90, 90).setInteractive({ useHandCursor: true });
    this.zone.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      this.press();
    });
    this.root.add([this.ring, this.title, this.label, this.zone]);
    scene.input.keyboard?.on('keydown-SPACE', () => this.press());
    this.layout(scene.scale.width, scene.scale.height);
  }

  press() {
    if (this.root.visible && this.enabled) this.onPress?.();
  }

  layout(width, height) {
    this.root.setPosition(width - 180, height - 70);
  }

  /** state: null to hide, or { label, note, enabled, color } */
  set(state) {
    if (!state) {
      this.root.setVisible(false);
      this.key = '';
      return;
    }
    this.root.setVisible(true);
    this.enabled = state.enabled;
    const key = `${state.label}|${state.note}|${state.enabled}`;
    if (key === this.key) return;
    this.key = key;
    const color = state.enabled ? Phaser.Display.Color.HexStringToColor(state.color).color : IDLE;
    this.ring.clear().fillStyle(UI.panel, 0.88).fillCircle(0, 0, 38).lineStyle(3, color, 1).strokeCircle(0, 0, 38);
    if (state.enabled) this.ring.lineStyle(8, color, 0.18).strokeCircle(0, 0, 43);
    this.title.setText(state.label.replace(' ', '\n')).setColor(state.enabled ? state.color : '#8a909c');
    this.label.setText(state.note).setAlpha(state.enabled ? 1 : 0.7);
  }
}
