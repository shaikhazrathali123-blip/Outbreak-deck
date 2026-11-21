export const FONT = '"Consolas", "Menlo", "Courier New", monospace';

/** Room name banner, current location, FPS counter and controls hint. */
export default class HUD {
  constructor(scene) {
    this.scene = scene;
    const touch = scene.sys.game.device.input.touch;

    this.location = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '13px', color: '#8fe9dc' });
    this.fps = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '11px', color: '#4f6b70' });

    this.kicker = scene.add
      .text(0, 0, 'ENTERING', { fontFamily: FONT, fontSize: '11px', color: '#3ee6a0' })
      .setOrigin(0.5)
      .setAlpha(0);
    this.banner = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#e8fffb' })
      .setOrigin(0.5)
      .setShadow(0, 0, '#2fd2c0', 14, true, true)
      .setAlpha(0);

    this.hint = scene.add
      .text(0, 0, touch ? 'DRAG ON THE LEFT SIDE TO MOVE  -  TAP MAP TO OPEN' : 'WASD / ARROW KEYS TO MOVE  -  M FOR MAP', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#7fb8b0',
        backgroundColor: '#0b141acc',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5, 1);
    scene.time.delayedCall(8000, () => this.hideHint());

    this.nextFpsUpdate = 0;
    this.layout(scene.scale.width, scene.scale.height);
  }

  layout(width, height) {
    const small = width < 520;
    this.location.setPosition(14, 12);
    this.fps.setPosition(14, 30);
    this.kicker.setPosition(width / 2, small ? 44 : 50);
    this.banner.setFontSize(small ? 20 : 28).setPosition(width / 2, small ? 64 : 76);
    this.bannerY = this.banner.y;
    this.hint.setPosition(width / 2, height - 24);
  }

  showRoom(room) {
    this.location.setText(`LOCATION: ${room ? room.name : 'Corridor'}`);
    if (!room) return;

    const targets = [this.banner, this.kicker];
    this.scene.tweens.killTweensOf(targets);
    this.banner
      .setText(room.name.toUpperCase())
      .setShadow(0, 0, room.color ?? '#2fd2c0', 16, true, true)
      .setY(this.bannerY - 8)
      .setAlpha(0);
    this.kicker.setColor(room.color ?? '#3ee6a0').setAlpha(0);
    this.location.setColor(room.color ?? '#8fe9dc');
    this.scene.tweens.add({ targets: this.banner, alpha: 1, y: this.bannerY, duration: 250, ease: 'Quad.out' });
    this.scene.tweens.add({ targets: this.kicker, alpha: 0.9, duration: 250 });
    this.scene.tweens.add({ targets, alpha: 0, delay: 1700, duration: 600 });
  }

  setVisible(visible) {
    for (const t of [this.location, this.fps, this.kicker, this.banner]) t.setVisible(visible);
    this.hint.setVisible(visible && !this.hintHidden);
  }

  hideHint() {
    if (this.hintHidden) return;
    this.hintHidden = true;
    this.scene.tweens.add({ targets: this.hint, alpha: 0, duration: 500 });
  }

  update(time) {
    if (time < this.nextFpsUpdate) return;
    this.nextFpsUpdate = time + 500;
    this.fps.setText(`FPS ${Math.round(this.scene.game.loop.actualFps)}`);
  }
}
