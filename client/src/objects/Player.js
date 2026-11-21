import Phaser from 'phaser';
import { PLAYER_SPEED } from '../../../shared/constants.js';

// Row order in player.png
const DIRECTIONS = ['down', 'left', 'right', 'up'];
const FRAMES_PER_DIR = 4;

export default class Player extends Phaser.Physics.Arcade.Sprite {
  /** Called once from BootScene after the sprite sheet is loaded. */
  static createAnimations(scene) {
    DIRECTIONS.forEach((dir, row) => {
      scene.anims.create({
        key: `walk-${dir}`,
        frames: scene.anims.generateFrameNumbers('player', {
          start: row * FRAMES_PER_DIR,
          end: row * FRAMES_PER_DIR + FRAMES_PER_DIR - 1,
        }),
        frameRate: 9,
        repeat: -1,
      });
    });
  }

  constructor(scene, x, y, texture = 'player') {
    super(scene, x, y, texture, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Collide with the feet only, so the head can overlap walls above (top-down look).
    this.body.setSize(14, 9);
    this.body.setOffset(9, 21);
    this.setCollideWorldBounds(true);
    this.setDepth(10);

    this.facing = 'down';
    this.speed = PLAYER_SPEED;
  }

  /**
   * @param {number} vx -1..1
   * @param {number} vy -1..1 (length may be < 1 for analog joystick input)
   */
  move(vx, vy) {
    let len = Math.hypot(vx, vy);
    if (len > 1) {
      vx /= len;
      vy /= len;
      len = 1;
    }
    this.setVelocity(vx * this.speed, vy * this.speed);

    if (len < 0.05) {
      this.anims.stop();
      this.setFrame(DIRECTIONS.indexOf(this.facing) * FRAMES_PER_DIR);
      return;
    }

    this.facing = this.pickFacing(vx, vy);
    this.anims.play(`walk-${this.facing}`, true);
    this.anims.timeScale = 0.5 + 0.5 * len; // slower steps when the stick is barely pushed
  }

  /** Keep the current facing on diagonals so the sprite doesn't flicker. */
  pickFacing(vx, vy) {
    const stillValid = {
      left: vx < -0.3,
      right: vx > 0.3,
      up: vy < -0.3,
      down: vy > 0.3,
    };
    const horizontal = Math.abs(vx) > Math.abs(vy);
    const best = horizontal ? (vx < 0 ? 'left' : 'right') : vy < 0 ? 'up' : 'down';
    const diagonal = Math.abs(Math.abs(vx) - Math.abs(vy)) < 0.35;
    return diagonal && stillValid[this.facing] ? this.facing : best;
  }
}
