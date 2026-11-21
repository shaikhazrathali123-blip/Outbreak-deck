import Phaser from 'phaser';
import { TILE_SIZE } from '../../../shared/constants.js';
import VisionSystem from '../systems/VisionSystem.js';
import Player from '../objects/Player.js';
import LightingSystem from '../systems/LightingSystem.js';
import FXSystem from '../systems/FXSystem.js';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2 - 120, height / 2, 0, 6, 0x2fd2c0).setOrigin(0, 0.5);
    this.add.rectangle(width / 2, height / 2, 244, 10).setStrokeStyle(1, 0x2fd2c0, 0.5);
    this.load.on('progress', (p) => (bar.width = 240 * p));

    this.load.tilemapTiledJSON('helix', 'assets/maps/helix.json');
    this.load.image('helix_tiles', 'assets/tiles/helix_tiles.png');
    this.load.spritesheet('player', 'assets/sprites/player.png', {
      frameWidth: TILE_SIZE,
      frameHeight: TILE_SIZE,
    });
  }

  create() {
    VisionSystem.createTexture(this);
    LightingSystem.createTexture(this);
    FXSystem.createTextures(this);
    Player.createAnimations(this);
    this.scene.start('MenuScene');
  }
}
