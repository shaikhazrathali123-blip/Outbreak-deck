import Phaser from 'phaser';
import { FONT } from '../ui/HUD.js';
import { WIDTH, ROOM_HEIGHT, ORIGIN_X, FLOORS, TOP, ROOMS, LADDERS, DUEL_TABLES, SUPPLY_BOXES } from './facility.js';
import { ROOMS as ROOM_INFO, DUEL_CHALLENGES } from '../../../shared/constants.js';

const FLOOR_GAP = 300; // world px between floor lines

/**
 * Building schematic. Small in the corner; tap it or press M for the big
 * version with room names and ladders.
 */
export default class SideMap {
  constructor(scene, gameScene) {
    this.scene = scene;
    this.gameScene = gameScene;
    this.big = false;
    this.root = scene.add.container(0, 0).setDepth(1500);
    this.backdrop = scene.add.rectangle(0, 0, 10, 10, 0x020305, 0.86).setOrigin(0).setVisible(false).setInteractive();
    this.backdrop.on('pointerdown', () => this.toggle());
    this.panel = scene.add.graphics();
    this.hit = scene.add.zone(0, 0, 10, 10).setOrigin(0).setInteractive({ useHandCursor: true });
    this.hit.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      this.toggle();
    });
    this.labels = ROOMS.map((r) =>
      scene.add.text(0, 0, ROOM_INFO.find((i) => i.id === r.id).name.toUpperCase(), { fontFamily: FONT, fontSize: '10px', fontStyle: 'bold', color: '#e9e4d6' }).setOrigin(0.5),
    );
    this.title = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '11px', fontStyle: '600', color: '#8f96a3' }).setLetterSpacing(2);
    this.dot = scene.add.circle(0, 0, 3, 0xffffff).setStrokeStyle(2, 0xff8a2a);
    // legend for duel table colours (big map only)
    this.legend = scene.add.container(0, 0);
    this.legend.add(scene.add.text(0, 0, 'DUEL TABLES', { fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#e9e4d6' }));
    Object.values(DUEL_CHALLENGES).forEach((c, i) => {
      this.legend.add(scene.add.circle(8, 30 + i * 22, 6, Phaser.Display.Color.HexStringToColor(c.color).color));
      this.legend.add(scene.add.text(22, 30 + i * 22, c.name, { fontFamily: FONT, fontSize: '11px', color: '#c8c4b8' }).setOrigin(0, 0.5));
    });
    const extra = Object.keys(DUEL_CHALLENGES).length;
    this.legend.add(scene.add.rectangle(8, 30 + extra * 22, 11, 9, 0xf2b84a));
    this.legend.add(scene.add.text(22, 30 + extra * 22, 'Card refill', { fontFamily: FONT, fontSize: '11px', color: '#c8c4b8' }).setOrigin(0, 0.5));
    this.legend.add(scene.add.rectangle(8, 52 + extra * 22, 4, 12, 0xd9b526));
    this.legend.add(scene.add.text(22, 52 + extra * 22, 'Ladder', { fontFamily: FONT, fontSize: '11px', color: '#c8c4b8' }).setOrigin(0, 0.5));
    this.root.add([this.backdrop, this.panel, this.hit, ...this.labels, this.title, this.legend, this.dot]);
    scene.input.keyboard?.on('keydown-M', this.toggle, this);
    scene.input.keyboard?.on('keydown-ESC', () => this.big && this.toggle());
    this.room = null;
    this.layout(scene.scale.width, scene.scale.height);
  }

  toggle() {
    this.big = !this.big;
    this.gameScene.mapOpen = this.big;
    this.scene.events.emit('map-open', this.big);
    this.layout(this.scene.scale.width, this.scene.scale.height);
  }

  setRoom(room) {
    this.room = room;
    this.draw();
  }

  layout(width, height) {
    this.width = width;
    this.height = height;
    if (this.big) {
      this.legendW = width >= 700 ? 190 : 0;
      this.s = Math.min((width - 80 - this.legendW) / WIDTH, (height - 140) / (FLOOR_GAP * FLOORS.length));
      this.ox = (width - this.legendW - WIDTH * this.s) / 2;
      this.oy = (height - FLOOR_GAP * FLOORS.length * this.s) / 2 + 20;
    } else {
      const compact = height < 420;
      this.s = (compact ? 150 : 230) / WIDTH;
      this.ox = width - WIDTH * this.s - 16;
      this.oy = 30;
    }
    this.backdrop.setSize(width, height).setVisible(this.big);
    this.backdrop.input.hitArea.setTo(0, 0, width, height);
    this.draw();
  }

  /** world → map coordinates */
  pt(x, y) {
    const top = FLOORS[TOP].y - ROOM_HEIGHT;
    return { x: this.ox + (x - ORIGIN_X) * this.s, y: this.oy + (y - top) * this.s };
  }

  draw() {
    const g = this.panel.clear();
    const s = this.s;
    const w = WIDTH * s;
    const h = FLOOR_GAP * FLOORS.length * s;
    const pad = this.big ? 16 : 6;
    g.fillStyle(0x07080c, 0.82).fillRoundedRect(this.ox - pad, this.oy - pad - 14, w + pad * 2, h + pad * 2 + 14, this.big ? 12 : 8);
    g.lineStyle(1, 0xe9e4d6, 0.16).strokeRoundedRect(this.ox - pad, this.oy - pad - 14, w + pad * 2, h + pad * 2 + 14, this.big ? 12 : 8);
    this.hit.setPosition(this.ox - pad, this.oy - pad - 14).setSize(w + pad * 2, h + pad * 2 + 14);
    this.hit.input.hitArea.setTo(0, 0, w + pad * 2, h + pad * 2 + 14);
    this.title.setText(this.big ? `HELIX RESEARCH FACILITY - ${FLOORS.length} FLOORS, ${ROOMS.length} ROOMS, ${DUEL_TABLES.length} DUEL TABLES    (M / TAP TO CLOSE)` : 'MAP [M]').setPosition(this.ox - pad + 4, this.oy - pad - 11);

    for (const [i, r] of ROOMS.entries()) {
      const info = ROOM_INFO.find((x) => x.id === r.id);
      const color = Phaser.Display.Color.HexStringToColor(info.color).color;
      const a = this.pt(ORIGIN_X + r.x0, FLOORS[r.floor].y - ROOM_HEIGHT);
      const rw = (r.x1 - r.x0) * s;
      const rh = ROOM_HEIGHT * s;
      const current = this.room?.id === r.id;
      g.fillStyle(color, current ? 0.45 : 0.16).fillRect(a.x + 1, a.y, rw - 2, rh);
      g.lineStyle(current ? 2 : 1, current ? color : 0xe9e4d6, current ? 1 : 0.22).strokeRect(a.x + 1, a.y, rw - 2, rh);
      this.labels[i].setVisible(this.big).setPosition(a.x + rw / 2, a.y + rh / 2).setFontSize(Math.round(Phaser.Math.Clamp(s * 70, 9, 14))).setWordWrapWidth(rw - 8).setAlign('center');
    }
    for (const f of FLOORS) {
      const a = this.pt(ORIGIN_X, f.y);
      g.fillStyle(0xe9e4d6, 0.7).fillRect(a.x, a.y, w, Math.max(1, 3 * s * 3));
    }
    // duel tables and card refills (shown on both sizes)
    for (const d of DUEL_TABLES) {
      const a = this.pt(d.x, FLOORS[d.floor].y - 20);
      g.fillStyle(Phaser.Display.Color.HexStringToColor(DUEL_CHALLENGES[d.challenge].color).color, 1).fillCircle(a.x, a.y, this.big ? 6 : 2.5);
    }
    for (const b of SUPPLY_BOXES) {
      const a = this.pt(b.x, FLOORS[b.floor].y - 20);
      const r = this.big ? 6 : 2.5;
      g.fillStyle(0xf2b84a, 1).fillRect(a.x - r, a.y - r * 0.8, r * 2, r * 1.6);
    }
    this.legend.setVisible(this.big && this.legendW > 0).setPosition(this.ox + w + pad + 24, this.oy);
    for (const l of LADDERS) {
      const a = this.pt(ORIGIN_X + l.x, FLOORS[l.upper].y - 10);
      const b = this.pt(ORIGIN_X + l.x, FLOORS[l.lower].y);
      g.lineStyle(this.big ? 2 : 1, 0xd9b526, 0.9).lineBetween(a.x - 2, a.y, b.x - 2, b.y).lineBetween(a.x + 2, a.y, b.x + 2, b.y);
    }
  }

  update(time) {
    const p = this.gameScene.player;
    const a = this.pt(p.x, p.y - 30);
    this.dot.setPosition(a.x, a.y).setScale((this.big ? 1.6 : 1) * (1 + 0.25 * Math.sin(time * 0.008)));
  }
}
