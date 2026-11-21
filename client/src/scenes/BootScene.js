import Phaser from 'phaser';
import { createTextures } from '../side/textures.js';

/** Everything is drawn in code, so booting just builds the shared textures. */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    createTextures(this);
    this.scene.start('MenuScene');
  }
}
