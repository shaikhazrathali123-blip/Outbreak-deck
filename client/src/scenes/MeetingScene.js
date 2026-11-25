import Phaser from 'phaser';
import { FONT, UI } from '../ui/HUD.js';
import { createPortrait } from '../side/SideCharacter.js';
import sfx from '../audio/Sfx.js';

const hex = (h) => Phaser.Display.Color.HexStringToColor(h).color;
const PHASES = { talk: 'DISCUSS', vote: 'VOTE', result: 'RESULT' };

/**
 * Emergency meeting overlay: everyone's tile (badge, voted, out), the meeting
 * chat, quick-chat buttons while discussing and voting buttons while voting.
 * Reads session.meeting every frame; Session drives the timing and the bots.
 * data: { session }
 */
export default class MeetingScene extends Phaser.Scene {
  constructor() {
    super('MeetingScene');
  }

  init(data) {
    this.session = data.session;
    this.selected = null;
    this.logShown = -1;
    this.phaseShown = null;
  }

  create() {
    const { width: W, height: H } = this.scale;
    this.small = H < 480;
    this.backdrop = this.add.rectangle(0, 0, W, H, 0x020308, 0.86).setOrigin(0).setInteractive();
    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.cameras.main.shake(220, 0.006);

    const s = this.session;
    const caller = s.actors.get(s.meeting.caller);
    this.title = this.add.text(W / 2, this.small ? 20 : 32, 'EMERGENCY MEETING', { fontFamily: FONT, fontSize: this.small ? '22px' : '30px', fontStyle: '700', color: '#ff4a5a' })
      .setOrigin(0.5).setLetterSpacing(8).setShadow(0, 0, '#ff2a3a', 18, false, true);
    const body = s.meeting.body ? s.actors.get(s.meeting.body) : null;
    this.title.setText(body ? 'BODY REPORTED' : 'EMERGENCY MEETING');
    this.sub = this.add.text(W / 2, this.small ? 42 : 60, body ? `${caller.name} FOUND ${body.name}  ·  SHOT, ROLE UNKNOWN` : `CALLED BY ${caller.name}`, { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color: caller.color })
      .setOrigin(0.5).setLetterSpacing(3);
    this.phase = this.add.text(W / 2, this.small ? 58 : 80, '', { fontFamily: FONT, fontSize: '13px', fontStyle: '700', color: '#ffd27a' }).setOrigin(0.5).setLetterSpacing(3);
    this.barBg = this.add.rectangle(W / 2, this.small ? 70 : 94, 240, 3, 0xffffff, 0.12);
    this.bar = this.add.rectangle(W / 2 - 120, this.small ? 70 : 94, 240, 3, 0xffd27a).setOrigin(0, 0.5);

    // layout: tiles on the left, chat on the right, buttons at the bottom
    this.top = this.small ? 82 : 110;
    this.btnY = H - (this.small ? 24 : 34);
    this.bottom = this.btnY - (this.small ? 26 : 34);
    const wide = W >= 640;
    this.leftX = 16;
    this.leftW = wide ? Math.min(560, W * 0.52) : W - 32;
    this.chatX = wide ? this.leftX + this.leftW + 20 : 16;
    this.chatW = wide ? W - this.chatX - 16 : W - 32;
    this.chatTop = wide ? this.top : this.bottom - 90;
    if (!wide) this.bottom = this.chatTop - 8;
    this.buildTiles();
    this.chatBg = this.add.graphics();
    this.chatBg.fillStyle(UI.panel, 0.7).fillRoundedRect(this.chatX - 8, this.chatTop - 6, this.chatW + 16, this.bottom - this.chatTop + 12 + (wide ? 0 : 90 + 8), 10);
    this.chatItems = [];
    this.buildButtons();
    this.events.once('shutdown', () => this.tweens.killAll());
  }

  // ------------------------------------------------------------ tiles
  buildTiles() {
    const s = this.session;
    const players = s.match.list();
    const n = players.length;
    const cols = n > 10 ? 3 : 2;
    const rows = Math.ceil(n / cols);
    const gap = 6;
    const tileW = (this.leftW - (cols - 1) * gap) / cols;
    const tileH = Phaser.Math.Clamp((this.bottom - this.top) / rows - gap, 22, 40);
    this.tiles = players.map((p, i) => {
      const x = this.leftX + (i % cols) * (tileW + gap);
      const y = this.top + Math.floor(i / cols) * (tileH + gap);
      const g = this.add.graphics();
      const ps = Math.min(tileH - 4, 30);
      const dot = this.add.image(x + 6 + ps / 2, y + tileH / 2, createPortrait(this, p.color)).setDisplaySize(ps, ps);
      const name = this.add.text(x + 12 + ps, y + tileH / 2, p.id === s.youId ? 'P1 · YOU' : p.name, { fontFamily: FONT, fontSize: this.small ? '13px' : '15px', fontStyle: '700', color: '#ffffff' })
        .setOrigin(0, 0.5).setLetterSpacing(1);
      const info = this.add.text(x + tileW - 10, y + tileH / 2, '', { fontFamily: FONT, fontSize: '11px', fontStyle: '700', color: '#3ee6d0' }).setOrigin(1, 0.5).setLetterSpacing(1);
      const zone = this.add.zone(x, y, tileW, tileH).setOrigin(0).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => this.select(p.id));
      return { p, x, y, w: tileW, h: tileH, g, dot, name, info, zone, drawn: '' };
    });
  }

  select(id) {
    const s = this.session;
    const m = s.meeting;
    if (!m || m.phase === 'result' || id === s.youId || !s.match.get(id).alive) return;
    this.selected = this.selected === id ? null : id;
    sfx.play('tap', 0.6);
  }

  updateTiles(now) {
    const s = this.session;
    const m = s.meeting;
    const you = s.match.get(s.youId);
    for (const t of this.tiles) {
      const p = t.p;
      const out = !p.alive;
      const ally = you.role === 'infected' && p.role === 'infected' && p.id !== s.youId;
      // the match clock is paused during the meeting, so the cell and gag timers are frozen too
      const t0 = m.startedAt;
      const cell = p.cellUntil > t0 ? Math.ceil((p.cellUntil - t0) / 1000) : 0;
      const gag = p.gagUntil > t0 ? Math.ceil((p.gagUntil - t0) / 1000) : 0;
      let info = '';
      let infoColor = '#3ee6d0';
      if (out) [info, infoColor] = [p.quarantined ? '⛔ QUARANTINED' : '☠ SHOT', '#8a909c'];
      else if (m.phase === 'result') {
        const votes = m.result.counts[p.id] ?? 0;
        [info, infoColor] = [votes ? `${votes} VOTE${votes > 1 ? 'S' : ''}` : '', p.id === m.result.out ? '#ff4a5a' : '#ffd27a'];
      } else if (m.phase === 'vote' && m.votes.has(p.id)) [info, infoColor] = ['✔ VOTED', '#ffd27a'];
      else if (cell) [info, infoColor] = [`● IN QUARANTINE ${cell}s`, '#ff9a5a'];
      else if (gag) [info, infoColor] = [`GAGGED ${gag}s`, '#8f96a3'];
      const selected = this.selected === p.id;
      const key = `${info}|${infoColor}|${selected}|${out}|${ally}|${m.result?.out === p.id}`;
      if (key === t.drawn) continue;
      t.drawn = key;
      const line = selected ? 0xffd27a : m.result?.out === p.id ? 0xff4a5a : ally ? 0x3ee67a : 0xe9e4d6;
      t.g.clear().fillStyle(selected ? 0x2a2410 : UI.panel, 0.92).fillRoundedRect(t.x, t.y, t.w, t.h, 8)
        .lineStyle(selected ? 2 : 1, line, selected || ally || m.result?.out === p.id ? 0.95 : 0.2).strokeRoundedRect(t.x, t.y, t.w, t.h, 8);
      t.info.setText(info).setColor(infoColor);
      for (const o of [t.dot, t.name, t.info]) o.setAlpha(out ? 0.4 : 1);
      t.g.setAlpha(out ? 0.5 : 1);
      t.zone.input.cursor = out || p.id === s.youId ? 'default' : 'pointer';
    }
  }

  // ------------------------------------------------------------ chat
  updateChat() {
    const log = this.session.meeting.log;
    if (log.length === this.logShown) return;
    this.logShown = log.length;
    for (const it of this.chatItems) it.destroy();
    this.chatItems = [];
    const s = this.session;
    let y = this.bottom + (this.chatTop === this.top ? 0 : 90);
    const minY = this.chatTop;
    for (let i = log.length - 1; i >= 0; i--) {
      const msg = log[i];
      const actor = msg.from ? s.actors.get(msg.from) : null;
      const body = this.add.text(this.chatX, 0, msg.text, {
        fontFamily: FONT, fontSize: this.small ? '12px' : '14px', fontStyle: actor ? '600' : '700',
        color: actor ? '#e9e4d6' : '#ffd27a', wordWrap: { width: this.chatW }, lineSpacing: 1,
      }).setLetterSpacing(actor ? 0.5 : 2);
      const name = actor
        ? this.add.text(this.chatX, 0, actor.id === s.youId ? 'YOU' : actor.name, { fontFamily: FONT, fontSize: '11px', fontStyle: '700', color: actor.color }).setLetterSpacing(2)
        : null;
      const h = body.height + (name ? name.height : 0);
      if (y - h < minY) {
        body.destroy();
        name?.destroy();
        break;
      }
      y -= h + 7;
      name?.setY(y);
      body.setY(y + (name ? name.height : 0));
      const items = name ? [name, body] : [body];
      this.chatItems.push(...items);
      if (i === log.length - 1) this.tweens.add({ targets: items, alpha: { from: 0, to: 1 }, duration: 250 });
    }
  }

  // ------------------------------------------------------------ buttons
  buildButtons() {
    const s = this.session;
    const make = (label, color, onClick) => {
      const c = this.add.container(0, this.btnY);
      const g = this.add.graphics();
      const t = this.add.text(0, 0, label, { fontFamily: FONT, fontSize: this.small ? '12px' : '13px', fontStyle: '700', color: '#0a0b10' }).setOrigin(0.5).setLetterSpacing(2);
      const z = this.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
      z.on('pointerdown', (p, lx, ly, e) => {
        e?.stopPropagation();
        if (c.enabled) sfx.play('tap');
        if (c.enabled) onClick();
      });
      c.add([g, t, z]);
      const b = { c, g, t, z, color, label, enabled: null };
      return b;
    };
    const target = () => this.selected;
    this.talkButtons = [
      make('ACCUSE', 0xff7a7a, () => s.youSay('accuse', target())),
      make('VOUCH', 0x9ffff4, () => s.youSay('vouch', target())),
      make("I'M CLEAN", 0x3ee6d0, () => s.youSay('clean')),
      make('SKIP', 0xc9ced8, () => s.youSay('skip')),
    ];
    this.voteButtons = [
      make('VOTE', 0xff4a5a, () => this.selected && s.vote(this.selected)),
      make('SKIP VOTE', 0xc9ced8, () => s.vote('skip')),
    ];
    this.note = this.add.text(this.scale.width / 2, this.btnY, '', { fontFamily: FONT, fontSize: '13px', fontStyle: '700', color: UI.dim }).setOrigin(0.5).setLetterSpacing(3);
  }

  layoutRow(buttons) {
    const W = this.scale.width;
    const gap = 8;
    const widths = buttons.map((b) => Math.max(this.small ? 84 : 100, b.t.width + 28));
    const total = widths.reduce((a, b) => a + b, 0) + gap * (buttons.length - 1);
    let x = W / 2 - total / 2;
    buttons.forEach((b, i) => {
      b.w = widths[i];
      b.c.setX(x + widths[i] / 2);
      b.z.setSize(widths[i], 34);
      x += widths[i] + gap;
    });
  }

  setEnabled(b, on, label = b.label) {
    if (b.enabled === on && b.t.text === label) return;
    b.enabled = on;
    b.c.enabled = on;
    b.t.setText(label);
    const h = this.small ? 28 : 32;
    const w = Math.max(this.small ? 84 : 100, b.t.width + 28);
    b.g.clear().fillStyle(on ? b.color : 0x30343d, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    b.t.setColor(on ? '#0a0b10' : '#6a707c');
  }

  updateButtons(now) {
    const s = this.session;
    const m = s.meeting;
    const youIn = s.match.get(s.youId).alive;
    const gagged = youIn && !s.match.canVote(s.youId, m.startedAt);
    const talk = m.phase === 'talk' && youIn && !gagged;
    const vote = m.phase === 'vote' && youIn && !gagged && !m.votes.has(s.youId);
    for (const b of this.talkButtons) b.c.setVisible(talk);
    for (const b of this.voteButtons) b.c.setVisible(vote);
    const cooling = now - m.yourLastSay < 1500 || m.yourSays >= 8;
    if (talk) {
      const [accuse, vouch, clean, skip] = this.talkButtons;
      const sel = this.selected ? s.name(this.selected) : null;
      this.setEnabled(accuse, !!sel && !cooling, sel ? `ACCUSE ${sel}` : 'ACCUSE');
      this.setEnabled(vouch, !!sel && !cooling, sel ? `VOUCH ${sel}` : 'VOUCH');
      this.setEnabled(clean, !cooling);
      this.setEnabled(skip, !cooling);
      this.layoutRow(this.talkButtons);
    }
    if (vote) {
      const ok = this.selected && s.match.canBeVoted(this.selected, m.startedAt);
      const sel = this.selected ? s.name(this.selected) : null;
      this.setEnabled(this.voteButtons[0], !!ok, ok ? `VOTE ${sel}` : sel ? `${sel} CAN'T BE VOTED` : 'TAP A PLAYER');
      this.setEnabled(this.voteButtons[1], true);
      this.layoutRow(this.voteButtons);
    }
    let note = '';
    if (!youIn) note = 'YOU ARE OUT  ·  WATCHING';
    else if (gagged && m.phase !== 'result') note = s.match.inCell(s.youId, m.startedAt) ? 'IN QUARANTINE  ·  GAGGED: NO CHAT, NO VOTE' : 'GAGGED: NO CHAT, NO VOTE';
    else if (m.phase === 'talk' && !this.selected) note = '';
    else if (m.phase === 'vote' && m.votes.has(s.youId)) note = m.votes.get(s.youId) === 'skip' ? 'YOU SKIPPED  ·  WAITING FOR THE OTHERS' : `YOU VOTED ${s.name(m.votes.get(s.youId))}  ·  WAITING`;
    else if (m.phase === 'result') note = m.result.skips ? `SKIPPED: ${m.result.skips}` : '';
    this.note.setText(note).setVisible(!!note && !talk && !vote);
  }

  // ------------------------------------------------------------ loop
  update() {
    const s = this.session;
    const m = s.meeting;
    if (!m) return;
    const now = s.now();
    if (m.phase !== this.phaseShown) {
      this.phaseShown = m.phase;
      if (m.phase !== 'talk') this.selected = m.phase === 'vote' ? this.selected : null;
      const total = m.phaseEnds - now;
      this.bar.width = 240;
      this.tweens.killTweensOf(this.bar);
      this.tweens.add({ targets: this.bar, width: 0, duration: total });
      this.bar.setFillStyle(m.phase === 'vote' ? 0xff4a5a : 0xffd27a);
      if (m.phase === 'vote') sfx.play('vote');
      if (m.phase === 'result') {
        this.showResult(m);
        this.time.delayedCall(550, () => sfx.play(m.result.out ? 'voteOut' : 'noVote'));
      }
    }
    const left = Math.max(0, Math.ceil((m.phaseEnds - now) / 1000));
    const tip = m.phase === 'talk' ? 'TAP A PLAYER, THEN ACCUSE OR VOUCH' : m.phase === 'vote' ? 'TAP A PLAYER, THEN VOTE  ·  TIES SAVE EVERYONE' : '';
    this.phase.setText(m.phase === 'result' ? 'RESULT' : `${PHASES[m.phase]}  ${left}s${tip ? `  ·  ${tip}` : ''}`).setColor(m.phase === 'vote' ? '#ff9aa4' : '#ffd27a');
    this.updateTiles(now);
    this.updateChat();
    this.updateButtons(now);
  }

  showResult(m) {
    const { width: W, height: H } = this.scale;
    const out = m.result.out;
    const text = out ? `${this.session.name(out)} WAS QUARANTINED` : 'NO ONE WAS QUARANTINED';
    const sub = out ? 'Was it the right call? Their role stays secret.' : m.result.skips ? 'Not enough votes: skip wins.' : 'A tie: nobody goes.';
    const color = out ? '#ff9a5a' : '#e9e4d6';
    const panel = this.add.graphics().fillStyle(UI.panel, 0.95).fillRoundedRect(W / 2 - 230, H / 2 - 46, 460, 92, 14).lineStyle(1.5, hex(color), 0.8).strokeRoundedRect(W / 2 - 230, H / 2 - 46, 460, 92, 14);
    const t1 = this.add.text(W / 2, H / 2 - 12, text, { fontFamily: FONT, fontSize: this.small ? '20px' : '26px', fontStyle: '700', color }).setOrigin(0.5).setLetterSpacing(4);
    const t2 = this.add.text(W / 2, H / 2 + 20, sub, { fontFamily: FONT, fontSize: '13px', fontStyle: '600', color: '#c9ced8' }).setOrigin(0.5).setLetterSpacing(1);
    for (const o of [panel, t1, t2]) {
      o.setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 300, delay: 600 });
    }
  }
}
