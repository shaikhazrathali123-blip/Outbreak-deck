import Phaser from 'phaser';
import { FONT } from './HUD.js';

const TEXTURE = 'minimap';

/**
 * Small facility map in the top-right corner: layout, current room and you
 * (never other players). On short phone screens it shrinks to a MAP button.
 * Tapping it calls onTap (opens the full map).
 */
export default class Minimap {
  constructor(scene, gameScene, onTap) {
    this.scene = scene;
    this.gameScene = gameScene;
    this.tileSize = gameScene.map.tileWidth;
    this.buildTexture();

    this.panel = scene.add.rectangle(0, 0, 10, 10, 0x05070a, 0.72).setOrigin(0).setStrokeStyle(1, 0x2fd2c0, 0.45);
    this.image = scene.add.image(0, 0, TEXTURE).setOrigin(0);
    this.highlight = scene.add.graphics();
    this.dot = scene.add.circle(0, 0, 3, 0xffffff).setStrokeStyle(1.5, 0xe0892a);
    this.title = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '10px', color: '#5f8f8a' });
    this.parts = [this.panel, this.image, this.highlight, this.dot, this.title];

    this.panel.setInteractive({ useHandCursor: true }).on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      onTap?.();
    });

    this.room = null;
    this.layout(scene.scale.width, scene.scale.height);
  }

  buildTexture() {
    const gs = this.gameScene;
    const { width: W, height: H } = gs.map;
    if (this.scene.textures.exists(TEXTURE)) this.scene.textures.remove(TEXTURE);
    const tex = this.scene.textures.createCanvas(TEXTURE, W, H);
    const ctx = tex.getContext();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const wall = gs.wallLayer.getTileAt(x, y);
        const floor = gs.floorLayer.getTileAt(x, y);
        const prop = gs.propLayer.getTileAt(x, y);
        let color = null;
        if (wall && !wall.properties?.diagonal) color = '#56638a';
        else if (floor || wall) {
          const id = (floor ?? wall).properties?.room;
          const room = gs.roomsById[id];
          const base = Phaser.Display.Color.HexStringToColor(room?.color ?? '#3a4458');
          const k = room ? (prop ? 0.25 : 0.45) : 0.75;
          color = Phaser.Display.Color.RGBToString(base.red * k, base.green * k, base.blue * k);
        }
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  layout(width, height) {
    const { width: W, height: H } = this.gameScene.map;
    this.compact = height < 420;
    this.scaleBy = width < 900 ? 2 : 2.8;
    const pad = 6;
    const w = this.compact ? 70 : W * this.scaleBy;
    const h = this.compact ? 0 : H * this.scaleBy;
    this.x = width - w - 14;
    this.y = 28;
    const pw = w + pad * 2;
    const ph = h + pad * 2 + 14;
    this.panel.setPosition(this.x - pad, this.y - pad - 14).setSize(pw, ph);
    this.panel.input.hitArea.setTo(0, 0, pw, ph);
    this.image.setPosition(this.x, this.y).setScale(this.scaleBy);
    this.title.setText(this.compact ? 'MAP [M]' : 'HELIX - MEDICAL WING   [M]').setPosition(this.x, this.y - 16);
    for (const p of [this.image, this.highlight, this.dot]) p.setVisible(!this.compact);
    this.drawHighlight();
  }

  setVisible(visible) {
    for (const p of this.parts) p.setVisible(visible);
    if (visible) this.layout(this.scene.scale.width, this.scene.scale.height);
  }

  setRoom(room) {
    this.room = room;
    this.drawHighlight();
  }

  drawHighlight() {
    this.highlight.clear();
    if (!this.room || this.compact) return;
    const s = this.scaleBy / this.tileSize;
    const r = this.room.rect;
    const color = Phaser.Display.Color.HexStringToColor(this.room.color).color;
    this.highlight.lineStyle(1.5, color, 1).strokeRect(this.x + r.x * s, this.y + r.y * s, r.width * s, r.height * s);
  }

  update(time) {
    if (this.compact || !this.dot.visible) return;
    const p = this.gameScene.player;
    const s = this.scaleBy / this.tileSize;
    this.dot.setPosition(this.x + p.x * s, this.y + p.y * s).setScale(1 + 0.25 * Math.sin(time * 0.008));
  }
}
