import Phaser from 'phaser';

/**
 * Floating virtual joystick: touch anywhere on the left half of the screen
 * and drag. `vector` is the output, x/y in -1..1 (zero when released).
 * Also works with a mouse, which is handy for testing on PC.
 */
export default class Joystick {
  constructor(scene, { radius = 58, deadZone = 0.15 } = {}) {
    this.scene = scene;
    this.radius = radius;
    this.deadZone = deadZone;
    this.vector = new Phaser.Math.Vector2();
    this.pointerId = null;
    this.origin = new Phaser.Math.Vector2();
    this.showRest = scene.sys.game.device.input.touch; // show a resting stick on phones
    this.enabled = true;

    this.base = scene.add
      .circle(0, 0, radius, 0x0b1a22, 0.45)
      .setStrokeStyle(2, 0x3ee6d0, 0.6)
      .setDepth(1000);
    this.thumb = scene.add.circle(0, 0, radius * 0.42, 0x3ee6d0, 0.55).setDepth(1001);

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);

    this.layout(scene.scale.width, scene.scale.height);
  }

  layout(width, height) {
    this.restX = 40 + this.radius;
    this.restY = height - 40 - this.radius;
    if (this.pointerId === null) this.rest();
  }

  rest() {
    this.base.setPosition(this.restX, this.restY).setVisible(this.showRest).setAlpha(0.35);
    this.thumb.setPosition(this.restX, this.restY).setVisible(this.showRest).setAlpha(0.35);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled && this.pointerId !== null) this.onUp({ id: this.pointerId });
    this.base.setVisible(enabled && this.showRest);
    this.thumb.setVisible(enabled && this.showRest);
  }

  onDown(pointer) {
    if (!this.enabled || this.pointerId !== null) return;
    if (pointer.x > this.scene.scale.width * 0.5) return; // right half is for buttons (Phase 2+)
    this.pointerId = pointer.id;
    this.origin.set(pointer.x, pointer.y);
    this.base.setPosition(pointer.x, pointer.y).setVisible(true).setAlpha(1);
    this.thumb.setPosition(pointer.x, pointer.y).setVisible(true).setAlpha(1);
    this.vector.set(0, 0);
  }

  onMove(pointer) {
    if (pointer.id !== this.pointerId) return;
    const dx = pointer.x - this.origin.x;
    const dy = pointer.y - this.origin.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, this.radius);
    const nx = dist > 0 ? dx / dist : 0;
    const ny = dist > 0 ? dy / dist : 0;
    this.thumb.setPosition(this.origin.x + nx * clamped, this.origin.y + ny * clamped);

    const strength = clamped / this.radius;
    if (strength < this.deadZone) this.vector.set(0, 0);
    else this.vector.set(nx * strength, ny * strength);
  }

  onUp(pointer) {
    if (pointer.id !== this.pointerId) return;
    this.pointerId = null;
    this.vector.set(0, 0);
    this.base.setVisible(false);
    this.thumb.setVisible(false);
    if (this.enabled) this.rest();
  }

  destroy() {
    const input = this.scene.input;
    input.off('pointerdown', this.onDown, this);
    input.off('pointermove', this.onMove, this);
    input.off('pointerup', this.onUp, this);
    input.off('pointerupoutside', this.onUp, this);
  }
}
