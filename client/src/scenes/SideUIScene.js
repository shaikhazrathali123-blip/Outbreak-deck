import Phaser from 'phaser';
import HUD, { FONT } from '../ui/HUD.js';
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
    this.createGrain();
    this.hud = new HUD(this);
    this.hud.hint.setText(
      this.sys.game.device.input.touch ? 'DRAG LEFT/RIGHT TO WALK - UP/DOWN AT A LADDER TO CLIMB' : 'A/D WALK - W/S CLIMB LADDERS - M MAP',
    );
    this.map = new SideMap(this, this.gameScene);
    this.joystick = new Joystick(this);
    this.prompt = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#ffd27a', backgroundColor: '#0b0b0ecc', padding: { x: 8, y: 4 } })
      .setOrigin(0.5)
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
      this.prompt.setVisible(false);
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

  createGrain() {
    if (!this.textures.exists('grain')) {
      const t = this.textures.createCanvas('grain', 128, 128);
      const c = t.getContext();
      const img = c.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      c.putImageData(img, 0, 0);
      t.refresh();
    }
    this.grain = this.add
      .tileSprite(0, 0, this.scale.width, this.scale.height, 'grain')
      .setOrigin(0)
      .setAlpha(0.06)
      .setBlendMode(Phaser.BlendModes.SCREEN);
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
      this.prompt
        .setText(up ? `${touch ? 'PUSH UP' : 'W'}  ▲  CLIMB UP` : `${touch ? 'PUSH DOWN' : 'S'}  ▼  CLIMB DOWN`)
        .setPosition(this.scale.width / 2, this.scale.height - 64)
        .setVisible(true);
    } else this.prompt.setVisible(false);
  }
}
