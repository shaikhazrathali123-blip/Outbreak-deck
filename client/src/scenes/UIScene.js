import Phaser from 'phaser';
import HUD from '../ui/HUD.js';
import Joystick from '../ui/Joystick.js';
import Minimap from '../ui/Minimap.js';
import MapView from '../ui/MapView.js';

/** Screen-space overlay that runs on top of GameScene. */
export default class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }

  init(data) {
    this.gameScene = data.gameScene;
  }

  create() {
    this.hud = new HUD(this);
    this.mapView = new MapView(this, this.gameScene);
    this.minimap = new Minimap(this, this.gameScene, () => this.mapView.open());
    this.joystick = new Joystick(this);

    const onRoom = (room) => {
      this.hud.showRoom(room);
      this.minimap.setRoom(room);
    };
    this.gameScene.events.on('room-changed', onRoom);
    if (this.gameScene.currentRoom !== undefined) onRoom(this.gameScene.currentRoom);

    // While the full map is open, hide the normal HUD and stop the joystick.
    this.events.on('map-open', (open) => {
      this.hud.setVisible(!open);
      this.minimap.setVisible(!open);
      this.joystick.setEnabled(!open);
    });

    const onResize = (size) => {
      this.hud.layout(size.width, size.height);
      this.minimap.layout(size.width, size.height);
      this.joystick.layout(size.width, size.height);
      if (this.mapView.isOpen) this.mapView.layout(size.width, size.height);
    };
    this.scale.on('resize', onResize);

    this.events.once('shutdown', () => {
      this.gameScene.events.off('room-changed', onRoom);
      this.scale.off('resize', onResize);
      this.joystick.destroy();
    });
  }

  update(time) {
    this.hud.update(time);
    this.minimap.update(time);
    this.mapView.update(time);
    if (this.joystick.vector.lengthSq() > 0) this.hud.hideHint();
  }
}
