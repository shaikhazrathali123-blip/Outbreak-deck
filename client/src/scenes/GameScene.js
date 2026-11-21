import Phaser from 'phaser';
import Player from '../objects/Player.js';
import VisionSystem from '../systems/VisionSystem.js';
import LightingSystem from '../systems/LightingSystem.js';
import FXSystem from '../systems/FXSystem.js';
import SignSystem from '../systems/SignSystem.js';

const prop = (obj, name) => obj.properties?.find((p) => p.name === name)?.value;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    // --- map
    this.map = this.make.tilemap({ key: 'helix' });
    const tiles = this.map.addTilesetImage('helix_tiles', 'helix_tiles');
    this.map.createLayer('Outside', tiles, 0, 0)?.setDepth(-1); // machinery between rooms
    this.floorLayer = this.map.createLayer('Floor', tiles, 0, 0).setDepth(0);
    this.decorLayer = this.map.createLayer('Decor', tiles, 0, 0).setDepth(1);
    this.map.createLayer('Shade', tiles, 0, 0)?.setDepth(1.5); // soft shadows at wall bases
    this.wallLayer = this.map.createLayer('Walls', tiles, 0, 0).setDepth(2);
    this.propLayer = this.map.createLayer('Props', tiles, 0, 0).setDepth(3);
    // Anything on the Walls or Props layers is solid, except angled wall tiles
    // (half floor), which you can step onto.
    this.wallLayer.setCollisionByExclusion([-1]);
    this.wallLayer.forEachTile((t) => {
      if (t.properties?.diagonal) t.setCollision(false, false, false, false, false);
    });
    this.wallLayer.calculateFacesWithin(0, 0, this.map.width, this.map.height);
    this.propLayer.setCollisionByExclusion([-1]);

    const { widthInPixels: mapW, heightInPixels: mapH } = this.map;
    this.physics.world.setBounds(0, 0, mapW, mapH);

    this.rooms = this.map.getObjectLayer('Rooms').objects.map((o) => ({
      id: prop(o, 'roomId') ?? o.name,
      name: o.name,
      color: prop(o, 'color') ?? '#2fd2c0',
      rect: new Phaser.Geom.Rectangle(o.x, o.y, o.width, o.height),
    }));
    this.roomsById = Object.fromEntries(this.rooms.map((r) => [r.id, r]));
    this.currentRoom = undefined;

    // --- player
    const spawn = this.map.findObject('Spawns', (o) => o.name === 'player');
    this.player = new Player(this, spawn.x, spawn.y);
    this.player.facing = 'up';
    this.player.move(0, 0);
    this.physics.add.collider(this.player, this.wallLayer);
    this.physics.add.collider(this.player, this.propLayer);

    // --- atmosphere
    this.lighting = new LightingSystem(this, this.map);
    this.fx = new FXSystem(this, this.map, this.player);
    this.signs = new SignSystem(this, this.map);

    // --- camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, mapW, mapH);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.fadeIn(600, 0, 0, 0);
    this.setupPostFX(cam);
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);

    // --- vision (darkness outside a circle around the player)
    this.vision = new VisionSystem(this, this.player);

    // --- overview camera for the full map screen (hidden until opened)
    this.mapCam = this.cameras.add(0, 0, 10, 10, false, 'map').setVisible(false).setBackgroundColor('#070a10');
    this.mapCam.ignore([this.vision.image, this.fx.dust, ...this.signs.objects, ...this.fx.holos]);
    this.mapOpen = false;

    // --- input
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');

    // --- HUD + joystick live in their own scene so camera zoom doesn't affect them
    this.scene.launch('UIScene', { gameScene: this });
    this.ui = this.scene.get('UIScene');

    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyZoom, this);
      this.scene.stop('UIScene');
    });
  }

  /**
   * Glow + vignette for a cinematic look (WebGL only). Bloom is skipped on
   * phones to keep 60 FPS; add ?fx=high or ?fx=low to the URL to force it.
   */
  setupPostFX(cam) {
    if (this.game.renderer.type !== Phaser.WEBGL || !cam.postFX) return;
    const fx = new URLSearchParams(window.location.search).get('fx');
    const mobile = this.sys.game.device.input.touch && !this.sys.game.device.os.desktop;
    const high = fx === 'high' || (fx !== 'low' && !mobile);
    if (high) cam.postFX.addBloom(0xffffff, 1, 1, 0.8, 0.35, 4);
    cam.postFX.addVignette(0.5, 0.5, 0.92, 0.35);
  }

  /** Zoom so phones and big monitors both see a similar slice of the map. */
  applyZoom() {
    const { width, height } = this.scale;
    const zoom = Phaser.Math.Clamp(Math.min(width, height) / 560, 0.7, 1.6);
    this.cameras.main.setZoom(zoom);
  }

  /** Show the whole facility in the given screen rectangle. Returns the zoom used. */
  openMap(view) {
    const { widthInPixels: mapW, heightInPixels: mapH } = this.map;
    const zoom = Math.min(view.width / mapW, view.height / mapH);
    this.mapCam.setViewport(view.x, view.y, view.width, view.height).setZoom(zoom).centerOn(mapW / 2, mapH / 2);
    this.mapCam.setVisible(true);
    this.cameras.main.setVisible(false);
    this.mapOpen = true;
    return zoom;
  }

  closeMap() {
    this.mapCam.setVisible(false);
    this.cameras.main.setVisible(true);
    this.mapOpen = false;
  }

  readMovement() {
    if (this.mapOpen) return { x: 0, y: 0 };
    // Joystick wins when it is being used; otherwise keyboard.
    const stick = this.ui?.joystick?.vector;
    if (stick && stick.lengthSq() > 0) return { x: stick.x, y: stick.y };

    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.LEFT.isDown || k.A.isDown) x -= 1;
    if (k.RIGHT.isDown || k.D.isDown) x += 1;
    if (k.UP.isDown || k.W.isDown) y -= 1;
    if (k.DOWN.isDown || k.S.isDown) y += 1;
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  update() {
    const move = this.readMovement();
    this.player.move(move.x, move.y);
    this.updateRoom();
  }

  /** Which room are we in? Read from the floor tile under the player's feet. */
  updateRoom() {
    const tile = this.floorLayer.getTileAtWorldXY(this.player.x, this.player.y + 8);
    const id = tile?.properties?.room;
    if (!id) return; // doorway: keep the previous room
    const room = id === 'corridor' ? null : (this.roomsById[id] ?? null);
    if (room === this.currentRoom) return;
    this.currentRoom = room;
    this.events.emit('room-changed', room);
  }
}
