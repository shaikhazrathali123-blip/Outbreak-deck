import Phaser from 'phaser';
import { FONT } from './HUD.js';
import { ROOMS } from '../../../shared/constants.js';

/** Draw the legend/map icons once as textures. */
function makeIcons(scene) {
  if (scene.textures.exists('icon-duel')) return;
  const S = 22;
  const icon = (key, draw) => {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, S, S);
    g.destroy();
  };
  const frame = (g, color, fill) => {
    g.fillStyle(fill, 1).fillRoundedRect(1, 1, S - 2, S - 2, 4);
    g.lineStyle(2, color, 1).strokeRoundedRect(1, 1, S - 2, S - 2, 4);
  };
  icon('icon-duel', (g) => {
    frame(g, 0x3e8bff, 0x0d1a33);
    g.lineStyle(2.5, 0xbcd6ff, 1).lineBetween(6, 6, 16, 16).lineBetween(16, 6, 6, 16);
  });
  icon('icon-box', (g) => {
    frame(g, 0x3ee67a, 0x0b2416);
    g.lineStyle(1.5, 0x3ee67a, 1).strokeRect(6, 7, 10, 9).lineBetween(6, 11, 16, 11).lineBetween(11, 7, 11, 16);
  });
  icon('icon-vent', (g) => {
    frame(g, 0xff3b4a, 0x2a0a0e);
    g.fillStyle(0xff3b4a, 1);
    for (let x = 6; x < 17; x += 4) g.fillRect(x, 6, 2, 10);
  });
  icon('icon-door', (g) => {
    g.fillStyle(0x1a1f27, 1).fillRoundedRect(1, 1, S - 2, S - 2, 3);
    g.fillStyle(0xff9a2a, 1).fillRect(5, 3, 4, 16).fillRect(13, 3, 4, 16);
  });
  icon('icon-spawn', (g) => {
    g.fillStyle(0xe8f4ff, 1).fillTriangle(11, 2, 3, 11, 19, 11).fillRect(7, 11, 8, 9);
  });
  icon('icon-you', (g) => {
    g.fillStyle(0xe0892a, 0.35).fillCircle(11, 11, 10);
    g.fillStyle(0xffffff, 1).fillCircle(11, 11, 5);
    g.lineStyle(2, 0xe0892a, 1).strokeCircle(11, 11, 6);
  });
}

/**
 * Full-screen facility map (M key or tap the minimap). The real map is drawn
 * by GameScene's overview camera; this adds the title, room labels, icons and legend.
 */
export default class MapView {
  constructor(scene, gameScene) {
    this.scene = scene;
    this.gameScene = gameScene;
    this.isOpen = false;
    makeIcons(scene);

    this.root = scene.add.container(0, 0).setDepth(2000).setVisible(false);
    this.backdrop = scene.add.zone(0, 0, 10, 10).setOrigin(0).setInteractive();
    this.backdrop.on('pointerdown', () => this.close());
    this.root.add(this.backdrop);

    // title block, like the reference sheet
    this.logo = scene.add.graphics();
    this.titleBig = scene.add.text(0, 0, 'HELIX', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#e8f4ff' });
    this.titleSub = scene.add.text(0, 0, 'RESEARCH FACILITY', { fontFamily: FONT, fontSize: '11px', color: '#9ab8d8' });
    this.titleWing = scene.add.text(0, 0, 'MEDICAL WING', { fontFamily: FONT, fontSize: '10px', fontStyle: 'italic', color: '#6f8aa6' });
    this.closeHint = scene.add.text(0, 0, 'TAP OR PRESS M TO CLOSE', { fontFamily: FONT, fontSize: '10px', color: '#5f7a90' }).setOrigin(1, 1);
    this.root.add([this.logo, this.titleBig, this.titleSub, this.titleWing, this.closeHint]);

    // markers on the map
    const map = gameScene.map;
    const objs = (layer) => map.getObjectLayer(layer)?.objects ?? [];
    this.markers = [
      ...objs('DuelTables').map((o) => ({ key: 'icon-duel', x: o.x + o.width / 2, y: o.y + o.height / 2 })),
      ...objs('SupplyBoxes').map((o) => ({ key: 'icon-box', x: o.x, y: o.y })),
      ...objs('Vents').map((o) => ({ key: 'icon-vent', x: o.x, y: o.y })),
      ...objs('Spawns').map((o) => ({ key: 'icon-spawn', x: o.x - 64, y: o.y })),
    ].map((m) => ({ ...m, image: scene.add.image(0, 0, m.key) }));
    this.root.add(this.markers.map((m) => m.image));

    this.labels = gameScene.rooms.map((room) => {
      const text = scene.add
        .text(0, 0, room.name.toUpperCase(), { fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#f2f6fa' })
        .setOrigin(0.5)
        .setStroke('#05070a', 4)
        .setShadow(0, 0, room.color, 8, false, true);
      return { room, text };
    });
    this.root.add(this.labels.map((l) => l.text));

    this.you = scene.add.image(0, 0, 'icon-you');
    this.youText = scene.add.text(0, 0, 'YOU', { fontFamily: FONT, fontSize: '9px', fontStyle: 'bold', color: '#ffd08a' }).setOrigin(0.5, 0);
    this.root.add([this.you, this.youText]);

    // legend panel
    this.legend = scene.add.container(0, 0);
    this.legendBg = scene.add.graphics();
    this.legend.add(this.legendBg);
    const rows = [
      ['icon-duel', 'Duel Table'],
      ['icon-box', 'Supply Box'],
      ['icon-vent', 'Vent'],
      ['icon-door', 'Door'],
      ['icon-spawn', 'Spawn Point'],
      ['icon-you', 'You'],
    ];
    const head = (y, t) => scene.add.text(16, y, t, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#cfe4f5' });
    this.legend.add(head(14, 'LEGEND'));
    rows.forEach(([key, label], i) => {
      const y = 46 + i * 28;
      this.legend.add(scene.add.image(28, y, key));
      this.legend.add(scene.add.text(48, y, label, { fontFamily: FONT, fontSize: '12px', color: '#dfe9f2' }).setOrigin(0, 0.5));
    });
    this.roomsTop = 46 + rows.length * 28;
    this.roomList = scene.add.container(0, 0);
    this.roomList.add(head(0, 'ROOMS'));
    ROOMS.filter((r) => gameScene.roomsById[r.id]).forEach((r, i) => {
      this.roomList.add(
        scene.add.text(16, 26 + i * 18, `${String(i + 1).padStart(2, ' ')}. ${r.name}`, { fontFamily: FONT, fontSize: '11px', color: '#b9cbd9' }),
      );
    });
    this.legend.add(this.roomList);
    this.root.add(this.legend);

    scene.input.keyboard?.on('keydown-M', this.toggle, this);
    scene.input.keyboard?.on('keydown-ESC', this.close, this);
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.root.setVisible(true);
    this.scene.events.emit('map-open', true);
    this.layout(this.scene.scale.width, this.scene.scale.height);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.setVisible(false);
    this.gameScene.closeMap();
    this.scene.events.emit('map-open', false);
  }

  layout(width, height) {
    this.backdrop.setSize(width, height);
    this.backdrop.input.hitArea.setTo(0, 0, width, height);
    const small = width < 700 || height < 480;
    const showLegend = width >= 620 && width > height;
    const legendW = showLegend ? (small ? 170 : 220) : 0;
    const top = small ? 44 : 78;
    const view = { x: 12, y: top, width: width - legendW - 36, height: height - top - 24 };

    // title
    this.titleBig.setFontSize(small ? 18 : 26).setPosition(small ? 40 : 58, small ? 8 : 16);
    this.titleSub.setPosition(this.titleBig.x + (small ? 70 : 0), small ? 14 : 48).setFontSize(small ? 9 : 11);
    this.titleWing.setPosition(this.titleBig.x + (small ? 70 : 0), small ? 26 : 62).setFontSize(small ? 8 : 10);
    this.logo.clear().lineStyle(2, 0xcfe4f5, 1);
    const lx = small ? 20 : 30;
    const ly = small ? 22 : 40;
    const lr = small ? 13 : 20;
    const hex = [];
    for (let i = 0; i < 6; i++) hex.push(new Phaser.Math.Vector2(lx + lr * Math.cos((Math.PI / 3) * i - Math.PI / 2), ly + lr * Math.sin((Math.PI / 3) * i - Math.PI / 2)));
    this.logo.strokePoints(hex, true, true);
    this.logo.fillStyle(0xcfe4f5, 1).fillRect(lx - lr * 0.35, ly - lr * 0.45, lr * 0.2, lr * 0.9).fillRect(lx + lr * 0.15, ly - lr * 0.45, lr * 0.2, lr * 0.9).fillRect(lx - lr * 0.35, ly - lr * 0.08, lr * 0.7, lr * 0.16);
    this.closeHint.setPosition(width - 14, height - 6);

    // map
    const zoom = this.gameScene.openMap(view);
    const mapW = this.gameScene.map.widthInPixels;
    const mapH = this.gameScene.map.heightInPixels;
    this.toScreen = (wx, wy) => ({
      x: view.x + view.width / 2 + (wx - mapW / 2) * zoom,
      y: view.y + view.height / 2 + (wy - mapH / 2) * zoom,
    });
    const iconScale = Phaser.Math.Clamp(zoom * 3, 0.55, 1);
    for (const m of this.markers) {
      const p = this.toScreen(m.x, m.y);
      m.image.setPosition(p.x, p.y).setScale(iconScale);
    }
    const fontSize = Math.round(Phaser.Math.Clamp(zoom * 42, 8, 14));
    for (const { room, text } of this.labels) {
      // the Entrance holds the spawn arrow, so its label goes underneath the room
      const below = room.id === 'entrance';
      const p = this.toScreen(room.rect.centerX, below ? room.rect.bottom + 56 : room.rect.centerY);
      text.setFontSize(fontSize).setPosition(p.x, p.y);
    }
    this.you.setScale(iconScale);

    // legend
    this.legend.setVisible(showLegend);
    if (showLegend) {
      const showRooms = height >= 520;
      const lh = showRooms ? this.roomsTop + 30 + this.gameScene.rooms.length * 18 : this.roomsTop;
      this.legend.setPosition(width - legendW - 14, top);
      this.roomList.setVisible(showRooms).setPosition(0, this.roomsTop + 8);
      this.legendBg.clear().fillStyle(0x0a1018, 0.92).fillRoundedRect(0, 0, legendW, lh, 8).lineStyle(1.5, 0x2a4a66, 1).strokeRoundedRect(0, 0, legendW, lh, 8);
      if (showRooms) this.legendBg.lineStyle(1, 0x2a4a66, 1).lineBetween(14, this.roomsTop, legendW - 14, this.roomsTop);
    }
  }

  update(time) {
    if (!this.isOpen || !this.toScreen) return;
    const p = this.toScreen(this.gameScene.player.x, this.gameScene.player.y);
    const pulse = 1 + 0.2 * Math.sin(time * 0.008);
    this.you.setPosition(p.x, p.y).setScale((this.markers[0]?.image.scaleX ?? 1) * pulse);
    this.youText.setPosition(p.x, p.y + 10);
  }
}
