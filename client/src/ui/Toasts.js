import Phaser from 'phaser';
import { FONT, UI } from './HUD.js';

/** Short messages that stack under the room banner and fade out. */
export default class Toasts {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.y = 118;
  }

  layout(width, height) {
    this.width = width;
    this.y = height < 480 ? 100 : 124;
    this.restack();
  }

  show(text, color = '#e9e4d6', duration = 3200) {
    const s = this.scene;
    const label = s.add
      .text(0, 0, text, { fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: '#ffffff', align: 'center', wordWrap: { width: Math.min(520, (this.width ?? s.scale.width) - 60) } })
      .setOrigin(0.5)
      .setLetterSpacing(1);
    const bg = s.add.graphics();
    const w = label.width + 40;
    const h = label.height + 16;
    const c = Phaser.Display.Color.HexStringToColor(color).color;
    bg.fillStyle(UI.panel, 0.9).fillRoundedRect(-w / 2, -h / 2, w, h, 10).fillStyle(c, 1).fillRoundedRect(-w / 2, -h / 2, 4, h, 2);
    const item = s.add.container(s.scale.width / 2, this.y, [bg, label]).setDepth(80).setAlpha(0);
    item.h = h;
    this.items.unshift(item);
    if (this.items.length > 3) this.remove(this.items[this.items.length - 1]);
    this.restack();
    s.tweens.add({ targets: item, alpha: 1, duration: 200 });
    s.time.delayedCall(duration, () => this.remove(item));
  }

  remove(item) {
    if (!this.items.includes(item)) return;
    this.items = this.items.filter((i) => i !== item);
    this.scene.tweens.add({ targets: item, alpha: 0, duration: 300, onComplete: () => item.destroy() });
    this.restack();
  }

  restack() {
    let y = this.y;
    for (const item of this.items) {
      this.scene.tweens.add({ targets: item, x: this.scene.scale.width / 2, y: y + item.h / 2, duration: 180 });
      y += item.h + 6;
    }
  }
}
