import Phaser from 'phaser';
import { FONT, UI } from '../ui/HUD.js';
import { drawSky, drawSkyline } from '../side/inkArt.js';
import { recordMatch } from '../game/profile.js';

const hex = (h) => Phaser.Display.Color.HexStringToColor(h).color;

/**
 * End of match: winning team, your result, the top player, and everyone's role, stats and score.
 * data: { winner: 'humans'|'infected', youWon, youRole, players, settings, duration }
 */
export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  init(data) {
    this.r = data;
    this.info = null;
    this.progress = null;
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
    // at 0:00 the bigger team wins (a tie goes to the humans)
    const left = (role) => r.players.filter((p) => p.alive && p.role === role).length;
    const count = `${left('infected')} zombie${left('infected') === 1 ? '' : 's'} vs ${left('human')} human${left('human') === 1 ? '' : 's'}`;
    const sub = r.reason === 'evac'
      ? `The humans restored the power and escaped in the evac truck at ${mins}:${secs}`
      : r.reason === 'time'
      ? `Time up: ${count}. ${r.winner === 'infected' ? 'The zombies outnumber the humans' : 'The humans hold the majority'}`
      : r.winner === 'infected' ? `Every human was turned, shot or voted out in ${mins}:${secs}` : `Every zombie was shot, cured or voted out in ${mins}:${secs}`;
    this.add.text(W / 2, y, `${sub}  ·  you finished ${r.youRole === 'infected' ? 'INFECTED' : 'HUMAN'}`, { fontFamily: FONT, fontSize: '13px', fontStyle: '600', color: '#c9ced8' })
      .setOrigin(0.5).setLetterSpacing(1);

    // secret scores are revealed: the highest is the top player (ties share the trophy)
    const players = [...r.players].sort((a, b) => b.score - a.score || b.stats.won - a.stats.won);
    const best = players[0]?.score ?? 0;
    const tops = players.filter((p) => p.score === best);
    const me = players.find((p) => p.id === 'you');
    const myRank = me ? players.filter((p) => p.score > me.score).length + 1 : 0;
    y += small ? 22 : 28;
    const topLine = `★ TOP PLAYER${tops.length > 1 ? 'S' : ''}: ${tops.map((p) => p.name).join(', ')}  ·  ${best} PTS`;
    this.add.text(W / 2, y, me ? `${topLine}     YOU: ${me.score} PTS (#${myRank})` : topLine, { fontFamily: FONT, fontSize: small ? '13px' : '15px', fontStyle: '700', color: '#ffd27a' })
      .setOrigin(0.5).setLetterSpacing(2);

    // player table
    const cols = players.length > 8 && W > 700 ? 2 : 1;
    const rowH = small ? 22 : 28;
    const colW = Math.min(420, (W - 60) / cols);
    const top = y + (small ? 26 : 40);
    const perCol = Math.ceil(players.length / cols);
    const cw = colW - 40; // the columns; the last 40px of each row hold the ⓘ button
    for (let c = 0; c < cols; c++) {
      const x0 = W / 2 - (colW * cols) / 2 + c * colW + 10;
      const head = (x, label) => this.add.text(x, top, label, { fontFamily: FONT, fontSize: '10px', fontStyle: '700', color: UI.dim }).setLetterSpacing(2);
      head(x0 + 24, 'PLAYER');
      head(x0 + cw * 0.33, 'ROLE');
      head(x0 + cw * 0.57, 'W-L');
      head(x0 + cw * 0.665, 'INF');
      head(x0 + cw * 0.75, 'SHOT');
      head(x0 + cw * 0.87, 'SCORE');
    }
    players.forEach((p, i) => {
      const c = Math.floor(i / perCol);
      const x0 = W / 2 - (colW * cols) / 2 + c * colW + 10;
      const ry = top + 18 + (i % perCol) * rowH;
      const you = p.id === 'you';
      if (you) this.add.graphics().fillStyle(0xffffff, 0.06).fillRoundedRect(x0 - 6, ry - 2, colW - 20, rowH - 4, 6);
      this.add.circle(x0 + 10, ry + rowH / 2 - 3, 4, hex(p.color));
      const style = { fontFamily: FONT, fontSize: small ? '13px' : '15px', fontStyle: '700', color: you ? '#ffffff' : '#c9ced8' };
      this.add.text(x0 + 24, ry + rowH / 2 - 3, `${p.score === best ? '★ ' : ''}${p.name}`, style).setOrigin(0, 0.5).setLetterSpacing(1);
      // roles of shot and voted-out players stay secret during the match; here they are revealed
      const team = p.role === 'infected' ? (p.startedInfected ? 'PATIENT ZERO' : 'INFECTED') : p.stats.timesCured ? 'HUMAN (CURED)' : 'HUMAN';
      const roleText = p.quarantined ? `⛔ ${team}` : p.shot ? `☠ ${team}` : team;
      this.add.text(x0 + cw * 0.33, ry + rowH / 2 - 3, roleText, { ...style, fontSize: '11px', color: p.quarantined ? '#ff9a5a' : p.shot ? '#ff7a3a' : p.role === 'infected' ? '#3ee67a' : '#e9e4d6' }).setOrigin(0, 0.5).setLetterSpacing(2);
      this.add.text(x0 + cw * 0.57, ry + rowH / 2 - 3, `${p.stats.won}-${p.stats.lost}`, style).setOrigin(0, 0.5);
      this.add.text(x0 + cw * 0.665, ry + rowH / 2 - 3, String(p.stats.infections), { ...style, color: p.stats.infections ? '#3ee67a' : '#6a707c' }).setOrigin(0, 0.5);
      this.add.text(x0 + cw * 0.75, ry + rowH / 2 - 3, String(p.stats.kills), { ...style, color: p.stats.kills ? '#ff7a3a' : '#6a707c' }).setOrigin(0, 0.5);
      this.add.text(x0 + cw * 0.87, ry + rowH / 2 - 3, String(p.score), { ...style, color: p.score === best ? '#ffd27a' : p.score < 0 ? '#ff5a68' : style.color }).setOrigin(0, 0.5);
      // ⓘ: this player's details (score breakdown, duels, actions)
      const ix = x0 + colW - 32;
      const iy = ry + rowH / 2 - 3;
      const ring = this.add.graphics();
      const drawRing = (hover) => ring.clear().lineStyle(1.5, hover ? 0x9ffff4 : 0x6a707c, 1).strokeCircle(ix, iy, 8);
      drawRing(false);
      this.add.text(ix, iy, 'i', { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color: '#c9ced8' }).setOrigin(0.5);
      this.add.zone(ix, iy, 30, rowH).setInteractive({ useHandCursor: true })
        .on('pointerover', () => drawRing(true))
        .on('pointerout', () => drawRing(false))
        .on('pointerup', () => this.showInfo(p, players, best));
    });

    // v3: your progress (XP, rank, badges), saved once per match
    const by = H - (small ? 34 : 56);
    if (me) {
      this.progress ??= recordMatch(me, r.youWon);
      const pr = this.progress;
      const next = pr.rank.next ? `  (${pr.total} / ${pr.rank.next.xp} TO ${pr.rank.next.name.toUpperCase()})` : '  (TOP RANK)';
      const line = `${pr.rankUp ? 'RANK UP!  ' : ''}RANK: ${pr.rank.name.toUpperCase()}  ·  +${pr.xp} XP${next}${pr.badges.length ? `  ·  BADGES: ${pr.badges.join(', ').toUpperCase()}` : ''}`;
      this.add.text(W / 2, by - (small ? 30 : 42), line, { fontFamily: FONT, fontSize: small ? '11px' : '13px', fontStyle: '700', color: pr.rankUp ? '#ffd27a' : '#9ffff4', wordWrap: { width: W - 40 }, align: 'center' })
        .setOrigin(0.5).setLetterSpacing(2);
    }
    // buttons
    const gap = Math.min(205, W / 3.1);
    this.button(W / 2 - gap, by, 'PLAY AGAIN', 0x9ffff4, '#0a0b10', () => this.scene.start('SideScene', r.settings));
    this.button(W / 2, by, 'RECAP', 0xffd27a, '#0a0b10', () => this.showRecap());
    this.button(W / 2 + gap, by, 'MENU', 0x30343d, '#e9e4d6', () => this.scene.start('MenuScene'));
    // Enter / Esc close an open info card first
    this.input.keyboard?.on('keydown-ENTER', () => (this.info ? this.closeInfo() : this.scene.start('SideScene', r.settings)));
    this.input.keyboard?.on('keydown-ESC', () => (this.info ? this.closeInfo() : this.scene.start('MenuScene')));
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  /** A card with one player's details: where their score came from, their duels and what they did. */
  showInfo(p, players, best) {
    this.closeInfo();
    const { width: W, height: H } = this.scale;
    const box = this.add.container(0, 0).setDepth(100);
    this.info = box;
    // dim the table; tapping outside closes
    box.add(this.add.rectangle(0, 0, W, H, 0x020308, 0.7).setOrigin(0).setInteractive().on('pointerup', () => this.closeInfo()));

    const wide = W >= 520;
    const pw = Math.min(wide ? 560 : 360, W - 32);
    const s = p.stats;
    const parts = p.parts ?? { cards: p.score, timeBonus: 0, earned: {} };
    const rank = players.filter((q) => q.score > p.score).length + 1;
    const team = p.role === 'infected' ? (p.startedInfected ? 'PATIENT ZERO' : 'INFECTED') : s.timesCured ? 'HUMAN (CURED)' : 'HUMAN';
    const fate = p.shot ? `Shot by ${p.shotBy ?? 'a Gun'}` : p.quarantined ? 'Voted out to the Quarantine Cell' : p.inCell ? 'In the cure cell at the end' : 'Made it to the end';
    const when = p.shot ? 'when shot' : p.quarantined ? 'when voted out' : 'at the end';
    const sign = (n) => (n > 0 ? `+${n}` : String(n));
    const EARNED = {
      'shot-zombie': ['Zombies shot', 'bullet kept + 40 each'],
      'shot-human': ['Humans shot', 'and the bullet lost'],
      bite: ['Bites', '+15 each'],
      'cure-wasted': ['Cures wasted', 'and the Cure lost'],
      'number-win': ['Number duels won', '+5 each'],
      'vote-right': ['Right votes', '+20 each'],
      'vote-wrong': ['Wrong votes', '-10 each'],
      part: ['Parts fitted', '+10 each'],
      stealth: ['Never accused', 'zombie bonus'],
      'call-right': ['Right bluff calls', '+15 each'],
      'call-wrong': ['Wrong bluff calls', '-10 each'],
      'last-stand': ['Last Stand survived', 'last human'],
    };
    const scoreRows = [
      [`Cards in hand ${when}`, sign(parts.cards)],
      [`Time bonus (${parts.timeBonus / 10} min as ${p.role === 'infected' ? 'zombie' : 'human'})`, sign(parts.timeBonus)],
      ...Object.entries(parts.earned).map(([k, v]) => [`${EARNED[k]?.[0] ?? k} ×${v.count}  ·  ${EARNED[k]?.[1] ?? ''}`, sign(v.points)]),
    ];
    const draws = Math.max(0, s.duels - s.won - s.lost);
    const duelRows = [
      ['Duels played', s.duels],
      ['Won', s.won],
      ['Lost', s.lost],
      ['Draws', draws],
      ['Win rate', s.duels ? `${Math.round((s.won / s.duels) * 100)}%` : '–'],
    ];
    const actionRows = [
      ['Humans bitten', s.infections],
      ['Players shot', s.kills],
      ['Zombies cured', s.cures],
      ['Times bitten', s.timesBitten ?? 0],
      ['Times cured', s.timesCured],
    ];

    const lineH = 19;
    const colH = (n) => 22 + n * lineH;
    const leftH = colH(scoreRows.length) + 30;
    const rightH = colH(duelRows.length) + 12 + colH(actionRows.length);
    const bodyH = wide ? Math.max(leftH, rightH) : leftH + 12 + rightH;
    const ph = Math.min(H - 24, 112 + bodyH + 20);
    const px = W / 2 - pw / 2;
    const py = H / 2 - ph / 2;
    const g = this.add.graphics();
    g.fillStyle(0x0b0e16, 0.97).fillRoundedRect(px, py, pw, ph, 14).lineStyle(1.5, hex(p.color), 0.8).strokeRoundedRect(px, py, pw, ph, 14);
    box.add(g);
    box.add(this.add.zone(px + pw / 2, py + ph / 2, pw, ph).setInteractive()); // taps on the card don't close it

    const txt = (x, y, str, size, color, style = {}) => {
      const t = this.add.text(x, y, String(str), { fontFamily: FONT, fontSize: `${size}px`, fontStyle: '700', color, ...style });
      box.add(t);
      return t;
    };
    // header
    box.add(this.add.circle(px + 24, py + 30, 6, hex(p.color)));
    txt(px + 38, py + 30, `${p.score === best ? '★ ' : ''}${p.name}${p.id === 'you' && p.name !== 'YOU' ? '  (YOU)' : ''}`, 20, '#ffffff').setOrigin(0, 0.5).setLetterSpacing(2);
    txt(px + pw - 20, py + 22, `${p.score} PTS`, 22, p.score === best ? '#ffd27a' : '#e9e4d6').setOrigin(1, 0.5);
    txt(px + pw - 20, py + 42, `#${rank} of ${players.length}`, 11, UI.dim).setOrigin(1, 0.5).setLetterSpacing(2);
    txt(px + 24, py + 56, team, 12, p.role === 'infected' ? '#3ee67a' : '#e9e4d6').setLetterSpacing(3);
    txt(px + 24, py + 74, fate, 13, p.shot ? '#ff7a3a' : p.quarantined ? '#ff9a5a' : '#c9ced8');
    const close = txt(px + pw - 18, py + 74, 'CLOSE ✕', 11, '#9ffff4').setOrigin(1, 0).setLetterSpacing(2);
    close.setInteractive({ useHandCursor: true }).on('pointerup', () => this.closeInfo());
    g.lineStyle(1, 0xffffff, 0.08).lineBetween(px + 16, py + 100, px + pw - 16, py + 100);

    const section = (x, y, w, title, rows, total) => {
      txt(x, y, title, 10, UI.dim).setLetterSpacing(3);
      rows.forEach(([label, value], i) => {
        const ly = y + 22 + i * lineH;
        txt(x, ly, label, 13, '#c9ced8', { fontStyle: '600' });
        const v = String(value);
        txt(x + w, ly, v, 13, v.startsWith('-') ? '#ff5a68' : v.startsWith('+') && v !== '+0' ? '#3ee6a0' : '#e9e4d6').setOrigin(1, 0);
      });
      if (total === undefined) return;
      const ty = y + 22 + rows.length * lineH + 6;
      g.lineStyle(1, 0xffffff, 0.15).lineBetween(x, ty, x + w, ty);
      txt(x, ty + 6, 'TOTAL', 12, '#ffd27a').setLetterSpacing(3);
      txt(x + w, ty + 6, total, 14, '#ffd27a').setOrigin(1, 0);
    };
    const top = py + 114;
    if (wide) {
      const half = (pw - 72) / 2;
      section(px + 24, top, half + 20, 'SCORE BREAKDOWN', scoreRows, p.score);
      section(px + pw / 2 + 24, top, half - 20, 'DUELS', duelRows);
      section(px + pw / 2 + 24, top + colH(duelRows.length) + 12, half - 20, 'ACTIONS', actionRows);
    } else {
      section(px + 20, top, pw - 40, 'SCORE BREAKDOWN', scoreRows, p.score);
      section(px + 20, top + leftH + 12, pw - 40, 'DUELS', duelRows);
      section(px + 20, top + leftH + 12 + colH(duelRows.length) + 12, pw - 40, 'ACTIONS', actionRows);
    }
    box.setAlpha(0);
    this.tweens.add({ targets: box, alpha: 1, duration: 150 });
  }

  /** v3: the match as a timeline (secrets included: the match is over). */
  showRecap() {
    this.closeInfo();
    const { width: W, height: H } = this.scale;
    const box = this.add.container(0, 0).setDepth(100);
    this.info = box;
    box.add(this.add.rectangle(0, 0, W, H, 0x020308, 0.75).setOrigin(0).setInteractive().on('pointerup', () => this.closeInfo()));
    const pw = Math.min(620, W - 32);
    const lineH = 19;
    const all = this.r.timeline ?? [];
    const fit = Math.max(4, Math.floor((H - 120) / lineH));
    const shown = all.length > fit ? all.slice(all.length - fit + 1) : all;
    const rows = all.length > fit ? [{ t: null, text: `… ${all.length - shown.length} earlier events`, color: '#8f96a3' }, ...shown] : shown;
    const ph = 64 + Math.max(1, rows.length) * lineH;
    const px = W / 2 - pw / 2;
    const py = Math.max(12, H / 2 - ph / 2);
    box.add(this.add.graphics().fillStyle(0x0b0e16, 0.97).fillRoundedRect(px, py, pw, ph, 14).lineStyle(1.5, 0xffd27a, 0.8).strokeRoundedRect(px, py, pw, ph, 14));
    box.add(this.add.zone(px + pw / 2, py + ph / 2, pw, ph).setInteractive());
    box.add(this.add.text(px + 20, py + 18, 'MATCH RECAP', { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: '#ffd27a' }).setLetterSpacing(4));
    const close = this.add.text(px + pw - 18, py + 18, 'CLOSE ✕', { fontFamily: FONT, fontSize: '11px', fontStyle: '700', color: '#9ffff4' }).setOrigin(1, 0).setLetterSpacing(2);
    close.setInteractive({ useHandCursor: true }).on('pointerup', () => this.closeInfo());
    box.add(close);
    if (!rows.length) rows.push({ t: null, text: 'Nothing happened. A very quiet night.', color: '#c9ced8' });
    rows.forEach((e, i) => {
      const y = py + 48 + i * lineH;
      if (e.t !== null) {
        const t = Math.floor(e.t / 1000);
        box.add(this.add.text(px + 20, y, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color: UI.dim }));
      }
      box.add(this.add.text(px + 64, y, e.text, { fontFamily: FONT, fontSize: '13px', fontStyle: '600', color: e.color ?? '#c9ced8' }));
    });
    box.setAlpha(0);
    this.tweens.add({ targets: box, alpha: 1, duration: 150 });
  }

  closeInfo() {
    this.info?.destroy();
    this.info = null;
  }

  button(x, y, label, fill, color, onClick) {
    this.add.graphics().fillStyle(fill, 1).fillRoundedRect(x - 95, y - 21, 190, 42, 21);
    this.add.text(x, y, label, { fontFamily: FONT, fontSize: '15px', fontStyle: '700', color }).setOrigin(0.5).setLetterSpacing(4);
    this.add.zone(x, y, 190, 42).setInteractive({ useHandCursor: true }).on('pointerup', onClick);
  }
}
