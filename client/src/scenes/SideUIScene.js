import Phaser from 'phaser';
import HUD, { FONT, UI } from '../ui/HUD.js';
import Joystick from '../ui/Joystick.js';
import SideMap from '../side/SideMap.js';

/** Screen overlay for the side view: HUD, joystick, building map, ladder prompt, film grain. */
export default class SideUIScene extends Phaser.Scene {
  constructor() {
    super('SideUIScene');
  }

  init(data) {
    this.gameScene = data.gameScene;
  }

  create() {
    this.grain = this.add
      .tileSprite(0, 0, this.scale.width, this.scale.height, 'grain')
      .setOrigin(0)
      .setAlpha(0.025)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.hud = new HUD(this);
    this.map = new SideMap(this, this.gameScene);
    this.joystick = new Joystick(this);

    // ladder prompt: a small pill above the bottom edge
    this.promptBg = this.add.graphics().setVisible(false);
    this.prompt = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: '#ffd27a' })
      .setOrigin(0.5)
      .setLetterSpacing(3)
      .setVisible(false);

    const onRoom = (room) => {
      this.hud.showRoom(room);
      this.map.setRoom(room);
    };
    this.gameScene.events.on('room-changed', onRoom);
    if (this.gameScene.currentRoom !== undefined) onRoom(this.gameScene.currentRoom);

    this.events.on('map-open', (open) => {
      this.hud.setVisible(!open);
      this.joystick.setEnabled(!open);
      this.showPrompt(null);
    });

    const onResize = (size) => {
      this.hud.layout(size.width, size.height);
      this.map.layout(size.width, size.height);
      this.joystick.layout(size.width, size.height);
      this.grain.setSize(size.width, size.height);
    };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.gameScene.events.off('room-changed', onRoom);
      this.scale.off('resize', onResize);
      this.joystick.destroy();
    });
  }

  showPrompt(text) {
    if (!text) {
      this.prompt.setVisible(false);
      this.promptBg.setVisible(false);
      return;
    }
    if (this.prompt.text !== text || !this.prompt.visible) {
      this.prompt.setText(text).setPosition(this.scale.width / 2, this.scale.height - 70).setVisible(true);
      const b = this.prompt.getBounds();
      this.promptBg
        .clear()
        .fillStyle(UI.panel, 0.85)
        .fillRoundedRect(b.x - 18, b.y - 8, b.width + 36, b.height + 16, 16)
        .lineStyle(1, 0xffb04a, 0.6)
        .strokeRoundedRect(b.x - 18, b.y - 8, b.width + 36, b.height + 16, 16)
        .setVisible(true);
    }
  }

  update(time) {
    this.grain.setTilePosition(Math.random() * 128, Math.random() * 128);
    this.hud.update(time);
    this.map.update(time);
    if (this.joystick.vector.lengthSq() > 0) this.hud.hideHint();

    const gs = this.gameScene;
    const ladder = !gs.mapOpen && gs.nearbyLadder();
    if (ladder) {
      const up = ladder.lower === gs.state.floor;
      const touch = this.sys.game.device.input.touch;
      this.showPrompt(up ? `▲  ${touch ? 'PUSH UP' : 'W'}  TO CLIMB` : `▼  ${touch ? 'PUSH DOWN' : 'S'}  TO CLIMB DOWN`);
    } else this.showPrompt(null);
  }
}
