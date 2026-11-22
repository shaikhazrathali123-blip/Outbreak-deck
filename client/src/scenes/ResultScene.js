import Phaser from 'phaser';
import { FONT, UI } from '../ui/HUD.js';
import { drawSky, drawSkyline } from '../side/inkArt.js';

const hex = (h) => Phaser.Display.Color.HexStringToColor(h).color;

/**
 * End of match: winning team, your result, and everyone's role and stats.
 * data: { winner: 'humans'|'infected', youWon, youRole, players, settings, duration }
 */
export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  init(data) {
    this.r = data;
  }

  create() {
    drawSky(this);
    drawSkyline(this);
    const { width: W, height: H } = this.scale;
    const small = H < 520;
    const r = this.r;
    const teamColor = r.winner === 'infected' ? '#3ee67a' : '#2fd2e0';
    this.add.image(W / 2, 0, 'sky').setOrigin(0.5, 0.2);
    this.add.image(W / 2, H + 200, 'skyline').setOrigin(0.5, 1).setAlpha(0.6);
    this.add.rectangle(0, 0, W, H, 0x020308, 0.72).setOrigin(0);

    let y = small ? 26 : 50;
    this.add.text(W / 2, y, r.youWon ? 'VICTORY' : 'DEFEAT', { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: r.youWon ? '#ffd27a' : '#ff6a78' })
      .setOrigin(0.5).setLetterSpacing(8);
    y += small ? 32 : 44;
    this.add.text(W / 2, y, r.winner === 'infected' ? 'THE INFECTED WIN' : 'HUMANS SURVIVED', { fontFamily: FONT, fontSize: small ? '30px' : '44px', fontStyle: '700', color: teamColor })
      .setOrigin(0.5).setLetterSpacing(8).setShadow(0, 0, teamColor, 22, false, true);
    y += small ? 28 : 40;
    const mins = Math.floor(r.duration / 60000);
    const secs = String(Math.floor((r.duration % 60000) / 1000)).padStart(2, '0');
    const sub = r.winner === 'infected' ? `Every human was infected in ${mins}:${secs}` : 'At least one human made it to the end';
    this.add.text(W / 2, y, `${sub}  ·  you finished ${r.youRole === 'infected' ? 'INFECTED' : 'HUMAN'}`, { fontFamily: FONT, fontSize: '13px', fontStyle: '600', color: '#c9ced8' })
      .setOrigin(0.5).setLetterSpacing(1);

    // player table
    const players = [...r.players].sort((a, b) => (a.role === b.role ? b.stats.won - a.stats.won : a.role === 'infected' ? -1 : 1));
    const cols = players.length > 8 && W > 700 ? 2 : 1;
    const rowH = small ? 22 : 28;
    const colW = Math.min(420, (W - 60) / cols);
    const top = y + (small ? 26 : 40);
    const perCol = Math.ceil(players.length / cols);
    for (let c = 0; c < cols; c++) {
      const x0 = W / 2 - (colW * cols) / 2 + c * colW + 10;
      this.add.text(x0 + 24, top, 'PLAYER', { fontFamily: FONT, fontSize: '10px', fontStyle: '700', color: UI.dim }).setLetterSpacing(2);
      this.add.text(x0 + colW * 0.42, top, 'ROLE', { fontFamily: FONT, fontSize: '10px', fontStyle: '700', color: UI.dim }).setLetterSpacing(2);
      this.add.text(x0 + colW * 0.7, top, 'W-L', { fontFamily: FONT, fontSize: '10px', fontStyle: '700', color: UI.dim }).setLetterSpacing(2);
      this.add.text(x0 + colW * 0.86, top, 'INF', { fontFamily: FONT, fontSize: '10px', fontStyle: '700', color: UI.dim }).setLetterSpacing(2);
    }
    players.forEach((p, i) => {
      const c = Math.floor(i / perCol);
      const x0 = W / 2 - (colW * cols) / 2 + c * colW + 10;
      const ry = top + 18 + (i % perCol) * rowH;
      const you = p.id === 'you';
      if (you) this.add.graphics().fillStyle(0xffffff, 0.06).fillRoundedRect(x0 - 6, ry - 2, colW - 20, rowH - 4, 6);
      this.add.circle(x0 + 10, ry + rowH / 2 - 3, 4, hex(p.color));
      const style = { fontFamily: FONT, fontSize: small ? '13px' : '15px', fontStyle: '700', color: you ? '#ffffff' : '#c9ced8' };
      this.add.text(x0 + 24, ry + rowH / 2 - 3, p.name, style).setOrigin(0, 0.5).setLetterSpacing(1);
      const roleText = p.role === 'infected' ? (p.startedInfected ? 'PATIENT ZERO' : 'INFECTED') : 'HUMAN';
      this.add.text(x0 + colW * 0.42, ry + rowH / 2 - 3, roleText, { ...style, fontSize: '11px', color: p.role === 'infected' ? '#3ee67a' : '#e9e4d6' }).setOrigin(0, 0.5).setLetterSpacing(2);
      this.add.text(x0 + colW * 0.7, ry + rowH / 2 - 3, `${p.stats.won}-${p.stats.lost}`, style).setOrigin(0, 0.5);
      this.add.text(x0 + colW * 0.86, ry + rowH / 2 - 3, String(p.stats.infections), { ...style, color: p.stats.infections ? '#3ee67a' : '#6a707c' }).setOrigin(0, 0.5);
    });

    // buttons
    const by = H - (small ? 34 : 56);
    this.button(W / 2 - 110, by, 'PLAY AGAIN', 0x9ffff4, '#0a0b10', () => this.scene.start('SideScene', r.settings));
    this.button(W / 2 + 110, by, 'MENU', 0x30343d, '#e9e4d6', () => this.scene.start('MenuScene'));
    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start('SideScene', r.settings));
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('MenuScene'));
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  button(x, y, label, fill, color, onClick) {
    this.add.graphics().fillStyle(fill, 1).fillRoundedRect(x - 95, y - 21, 190, 42, 21);
    this.add.text(x, y, label, { fontFamily: FONT, fontSize: '15px', fontStyle: '700', color }).setOrigin(0.5).setLetterSpacing(4);
    this.add.zone(x, y, 190, 42).setInteractive({ useHandCursor: true }).on('pointerup', onClick);
  }
}
