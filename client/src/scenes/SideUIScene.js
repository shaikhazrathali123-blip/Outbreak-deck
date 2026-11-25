import Phaser from 'phaser';
import HUD, { FONT, UI, MIN_TEXT } from '../ui/HUD.js';
import { icon } from '../ui/icons.js';
import { fxLevel } from '../game/fx.js';
import { needsHint } from '../game/hints.js';
import Joystick from '../ui/Joystick.js';
import SideMap from '../side/SideMap.js';
import HandUI from '../ui/HandUI.js';
import ChallengeButton from '../ui/ChallengeButton.js';
import ActionButton from '../ui/ActionButton.js';
import Toasts from '../ui/Toasts.js';
import { RULES, MODIFIERS } from '../../../shared/constants.js';
import { EMOTES } from '../game/Session.js';
import sfx from '../audio/Sfx.js';

const REASONS = {
  exhausted: 'NO CARDS',
  'target-exhausted': 'NO CARDS',
  stunned: 'STUNNED',
  'target-stunned': 'STUNNED',
  'in-cell': 'QUARANTINED',
  'target-in-cell': 'QUARANTINED',
  busy: 'BUSY',
  dead: 'DEAD',
};

const clockText = (ms) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/** Screen overlay: HUD, timer, hand, role chip, challenge + station buttons, prompts, map, joystick, film grain. */
export default class SideUIScene extends Phaser.Scene {
  constructor() {
    super('SideUIScene');
  }

  init(data) {
    this.gameScene = data.gameScene;
  }

  create() {
    const gs = this.gameScene;
    const session = gs.session;
    // film grain: a full-screen blend every frame, so only on fx=high
    this.grain = fxLevel(this.game) === 'high'
      ? this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'grain').setOrigin(0).setAlpha(0.025).setBlendMode(Phaser.BlendModes.SCREEN)
      : null;
    this.vignette = fxLevel(this.game) === 'low' ? this.add.image(0, 0, 'vignette').setOrigin(0) : null;
    this.hud = new HUD(this);
    this.map = new SideMap(this, gs);
    this.joystick = new Joystick(this);
    this.hand = new HandUI(this);
    this.toasts = new Toasts(this);
    this.hud.onBanner = (px) => this.toasts.setOffset(Math.max(0, px)); // toasts make room for the big room name
    this.challenge = new ChallengeButton(this, () => gs.challenge(gs.nearbyTarget()));
    this.action = new ActionButton(this, () => session.doAction());

    // role badge under the location chip
    this.roleBg = this.add.graphics();
    this.role = this.add.text(26, 0, '', { fontFamily: FONT, fontSize: '17px', fontStyle: '700', color: '#ffffff' }).setOrigin(0, 0.5).setLetterSpacing(3);
    this.setRole(gs.match.get(gs.youId).role);

    // your secret score (nobody else can see it until the results)
    this.scoreBg = this.add.graphics();
    this.scoreIcon = icon(this, 30, 0, 'lock', 16, 0xffd27a);
    this.scoreText = this.add.text(44, 0, '', { fontFamily: FONT, fontSize: '16px', fontStyle: '700', color: '#ffd27a' }).setOrigin(0, 0.5).setLetterSpacing(2);
    this.lastScore = null;

    // match timer (top centre)
    this.timerBg = this.add.graphics();
    this.timer = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '30px', fontStyle: '700', color: '#ffffff' }).setOrigin(0.5).setLetterSpacing(3);
    // v3: power / evac / blackout under the timer: an icon + a number
    this.statusIcon = icon(this, 0, 0, 'bolt', 18, 0xffb04a);
    this.status = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '17px', fontStyle: '700', color: '#ffb04a' }).setOrigin(0, 0.5).setLetterSpacing(2);
    this.buildEmotes(session);

    // bottom prompt pill (ladders, refills)
    this.promptBg = this.add.graphics().setVisible(false);
    this.prompt = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '16px', fontStyle: '700', color: '#ffd27a' }).setOrigin(0.5).setLetterSpacing(3).setVisible(false);
    this.promptIcon = icon(this, 0, 0, 'climb', 22, 0xffd27a).setVisible(false);

    this.buildRequestPanel(session);

    // chase: red heartbeat at the edges + RUN / CATCH banner
    this.danger = this.add.image(0, 0, 'danger').setOrigin(0).setAlpha(0).setDepth(140);
    this.chaseText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '26px', fontStyle: '700', color: '#ff4a5a' })
      .setOrigin(0.5).setLetterSpacing(6).setDepth(141).setVisible(false);
    this.chaseSub = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: '#ffd0d4' })
      .setOrigin(0.5).setLetterSpacing(3).setDepth(141).setVisible(false);
    this.chase = null;

    const onRoom = (room) => {
      this.hud.showRoom(room);
      this.map.setRoom(room);
    };
    const onHand = () => this.hand.setHand(gs.match.get(gs.youId).hand, gs.match.isExhausted(gs.youId));
    const onToast = (text, color, ms) => this.toasts.show(text, color, ms);
    const onRole = (role) => this.setRole(role);
    const onDuel = (open) => this.setPlaying(!open);
    const onRequest = (req) => this.showRequest(req);
    const onCancel = () => this.hideRequest();
    const onOver = (r) => this.showOver(r);
    const subs = [
      ['room-changed', onRoom], ['hand-changed', onHand], ['toast', onToast], ['role-changed', onRole],
      ['duel-open', onDuel], ['chase', (c) => this.setChase(c)], ['you-died', (d) => this.showDeath(d)], ['challenge-request', onRequest], ['challenge-cancel', onCancel], ['match-over', onOver],
      ['meeting', (open) => this.onMeeting(open)], ['you-quarantined', () => this.showDeath({ quarantined: true })],
      ['camera', (entries) => this.showCameras(entries)], ['last-stand', () => this.showBanner('LAST STAND', 'One bullet. You see them for 5 seconds.', '#ff4a5a')],
      ['power', () => this.showBanner('POWER RESTORED', `Evac at the Entrance in ${RULES.evacTime / 1000}s`, '#ffd27a')],
      ['blackout', (on) => on && this.showBanner('BLACKOUT', session.match.get(session.youId).role === 'infected' ? 'You see fine. They do not.' : 'Stay close to someone you trust.', '#b4ff3a')],
    ];
    for (const [ev, fn] of subs) gs.events.on(ev, fn);
    if (gs.currentRoom !== undefined) onRoom(gs.currentRoom);
    onHand();

    this.events.on('map-open', (open) => {
      if (open) this.hud.done('map');
      if (this.dead) this.joystick.setEnabled(!open);
      else this.setPlaying(!open);
    });
    const onResize = (size) => this.layout(size.width, size.height);
    this.scale.on('resize', onResize);
    this.layout(this.scale.width, this.scale.height);
    this.events.once('shutdown', () => {
      for (const [ev, fn] of subs) gs.events.off(ev, fn);
      this.scale.off('resize', onResize);
      this.joystick.destroy();
    });
    this.showRoleIntro(session);
  }

  layout(width, height) {
    this.hud.layout(width, height);
    this.map.layout(width, height);
    this.joystick.layout(width, height);
    this.hand.layout(width, height);
    this.toasts.layout(width, height);
    this.challenge.layout(width, height, 0);
    this.action.layout(width, height);
    this.grain?.setSize(width, height);
    this.vignette?.setDisplaySize(width, height);
    this.hud.placeHints(height - this.hand.height - 30, this.hand.centerX);
    this.role.setY(67);
    this.scoreText.setY(104);
    this.scoreIcon.setY(104);
    this.hud.fps.setPosition(14, 124);
    this.drawRole();
    this.drawScore();
    this.timer.setPosition(width / 2, 30);
    this.statusY = 70;
    this.placeStatus();
    this.layoutEmotes(width, height);
    this.timerBg.clear().fillStyle(UI.panel, 0.82).fillRoundedRect(width / 2 - 60, 8, 120, 44, 22).lineStyle(1.5, UI.line, 0.22).strokeRoundedRect(width / 2 - 60, 8, 120, 44, 22);
    this.request.setPosition(width / 2, height * 0.42);
    this.danger.setDisplaySize(width, height);
    this.chaseText.setPosition(width / 2, height * 0.24);
    this.chaseSub.setPosition(width / 2, height * 0.24 + 28);
  }

  setRole(role) {
    this.roleName = role;
    this.updateRoleChip();
  }

  /** Role chip: HUMAN (+ quarantine / gag / recovering), ZOMBIE (+ hunger). */
  updateRoleChip() {
    const session = this.gameScene.session;
    const me = session.match.get(session.youId);
    const now = session.clock();
    let text = 'HUMAN';
    let color = '#e9e4d6';
    if (!me.alive) [text, color] = [me.quarantined ? 'QUARANTINED' : 'OUT', '#8a909c'];
    else if (me.role === 'infected' && session.match.isStarving(me.id, now)) [text, color] = ['ZOMBIE · STARVING', '#b4ff3a'];
    else if (me.role === 'infected' && me.hungerAt === null) [text, color] = [`ZOMBIE · CLAW ${clockText(me.nextZombieAt - now)}`, '#3ee67a'];
    else if (me.role === 'infected') [text, color] = [`ZOMBIE · HUNGER ${clockText(me.hungerAt - now)}`, '#3ee67a'];
    else if (session.match.inCell(me.id, now)) [text, color] = [`HUMAN · CELL ${clockText(me.cellUntil - now)}`, '#ff9a5a'];
    else if (session.match.isGagged(me.id, now)) [text, color] = [`HUMAN · GAGGED ${clockText(me.gagUntil - now)}`, '#9ab8d8'];
    if (text === this.role.text && color === this.roleColor) return;
    this.roleColor = color;
    this.role.setText(text).setColor(color);
    this.drawRole();
  }

  drawRole() {
    const color = Phaser.Display.Color.HexStringToColor(this.roleColor ?? '#e9e4d6').color;
    const w = this.role.width + 30;
    this.roleBg.clear().fillStyle(UI.panel, 0.82).fillRoundedRect(12, 51, w, 32, 16).lineStyle(1.5, color, 0.7).strokeRoundedRect(12, 51, w, 32, 16);
  }

  /** Your score chip; a floating +N / -N whenever it changes. */
  updateScore() {
    const session = this.gameScene.session;
    const score = session.match.score(session.youId);
    if (score === this.lastScore) return;
    const delta = this.lastScore === null ? 0 : score - this.lastScore;
    this.lastScore = score;
    // the time bonus: +10 per full minute in your role, lost when the role changes
    const bonus = session.match.timeBonus(session.youId);
    const bonusDelta = this.lastBonus === undefined || session.match.get(session.youId).finalScore !== null ? 0 : bonus - this.lastBonus;
    this.lastBonus = bonus;
    const role = session.match.get(session.youId).role === 'infected' ? 'ZOMBIE' : 'HUMAN';
    const why = bonusDelta > 0 ? `  ·  ${bonus / 10} MIN AS ${role}` : bonusDelta < 0 ? '  ·  TIME BONUS LOST' : '';
    this.scoreText.setText(`${score} PTS`);
    this.drawScore();
    if (!delta || !this.scoreText.visible) return;
    const pop = this.add
      .text(this.scoreText.x + this.scoreText.width + 22, this.scoreText.y, `${delta > 0 ? '+' : ''}${delta}${why}`, {
        fontFamily: FONT, fontSize: why ? `${MIN_TEXT}px` : '17px', fontStyle: '700', color: delta > 0 ? '#3ee6a0' : '#ff5a68',
      })
      .setOrigin(0, 0.5)
      .setDepth(60);
    this.tweens.add({ targets: pop, y: pop.y - 18, alpha: 0, duration: 1600, ease: 'Cubic.out', onComplete: () => pop.destroy() });
    this.tweens.add({ targets: this.scoreText, scale: 1.15, duration: 120, yoyo: true });
  }

  drawScore() {
    if (!this.scoreText.text) return;
    const w = this.scoreText.width + 44;
    this.scoreBg.clear().fillStyle(UI.panel, 0.82).fillRoundedRect(12, 90, w, 28, 14).lineStyle(1.5, 0xf2b84a, 0.6).strokeRoundedRect(12, 90, w, 28, 14);
  }

  /** A meeting pulls everyone to the Central Hall: hide the gameplay HUD while it runs. */
  onMeeting(open) {
    if (open) {
      this.hideRequest();
      this.setChase(null);
    }
    if (!this.dead) this.setPlaying(!open);
  }

  // ------------------------------------------------------------ v3: emotes, cameras, banners
  /** Four quick emotes on the right edge (keys 1–4). Bots nearby see them. */
  buildEmotes(session) {
    // icons instead of words: HELLO (hand), FOLLOW ME (arrows), SUS! (eye), HELP! (warning)
    this.emoteButtons = Object.keys(EMOTES).map((kind) => {
      const c = this.add.container(0, 0).setDepth(60);
      const g = this.add.graphics();
      const color = kind === 'sus' ? 0xffb04a : kind === 'help' ? 0xff7a7a : 0xe9e4d6;
      g.fillStyle(UI.panel, 0.85).fillCircle(0, 0, 20).lineStyle(1.5, color, 0.7).strokeCircle(0, 0, 20);
      const t = icon(this, 0, 0, kind, 22, color);
      const z = this.add.zone(0, 0, 44, 44).setInteractive({ useHandCursor: true });
      z.on('pointerdown', (p, lx, ly, e) => {
        e?.stopPropagation();
        session.emote(session.youId, kind);
      });
      c.add([g, t, z]);
      return c;
    });
    ['ONE', 'TWO', 'THREE', 'FOUR'].forEach((k, i) =>
      this.input.keyboard?.on(`keydown-${k}`, () => this.playing !== false && session.emote(session.youId, Object.keys(EMOTES)[i])),
    );
  }

  layoutEmotes(width, height) {
    const top = Math.max(130, height * 0.28);
    this.emoteButtons.forEach((c, i) => c.setPosition(width - 76 + (i % 2) * 48, top + Math.floor(i / 2) * 48));
  }

  /** Security cameras: the last room entries, for a few seconds. */
  showCameras(entries) {
    this.cameraPanel?.destroy();
    const { width: W, height: H } = this.scale;
    const c = this.add.container(W / 2, H * 0.3).setDepth(160);
    const lines = entries.length ? entries : [{ name: '', room: 'Nobody moved yet', ago: null, color: '#c9ced8' }];
    const h = 46 + lines.length * 20;
    const g = this.add.graphics().fillStyle(UI.panel, 0.95).fillRoundedRect(-170, 0, 340, h, 12).lineStyle(1.5, 0x9ab8ff, 0.8).strokeRoundedRect(-170, 0, 340, h, 12);
    c.add(g);
    c.add(this.add.text(0, 16, 'CAMERAS  ·  LAST ENTRIES', { fontFamily: FONT, fontSize: `${MIN_TEXT}px`, fontStyle: '700', color: '#9ab8ff' }).setOrigin(0.5).setLetterSpacing(2));
    lines.forEach((e, i) => {
      const y = 38 + i * 20;
      c.add(this.add.text(-150, y, e.name, { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: e.color }).setOrigin(0, 0.5));
      c.add(this.add.text(-100, y, `→ ${e.room}`, { fontFamily: FONT, fontSize: '14px', fontStyle: '600', color: '#e9e4d6' }).setOrigin(0, 0.5));
      if (e.ago !== null) c.add(this.add.text(150, y, `${e.ago}s`, { fontFamily: FONT, fontSize: `${MIN_TEXT}px`, fontStyle: '600', color: UI.dim }).setOrigin(1, 0.5));
    });
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 150 });
    this.cameraPanel = c;
    this.time.delayedCall(6000, () => c.active && this.tweens.add({ targets: c, alpha: 0, duration: 300, onComplete: () => c.destroy() }));
  }

  /** A big moment: LAST STAND, POWER RESTORED, BLACKOUT. */
  showBanner(title, sub, color) {
    const { width: W, height: H } = this.scale;
    const t = this.add.text(W / 2, H * 0.3, title, { fontFamily: FONT, fontSize: H < 480 ? '36px' : '52px', fontStyle: '700', color })
      .setOrigin(0.5).setLetterSpacing(10).setShadow(0, 0, color, 24, false, true).setDepth(170).setAlpha(0);
    const s = this.add.text(W / 2, H * 0.3 + (H < 480 ? 32 : 42), sub, { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: '#e9e4d6' })
      .setOrigin(0.5).setLetterSpacing(2).setDepth(170).setAlpha(0);
    this.tweens.add({ targets: [t, s], alpha: 1, duration: 200 });
    this.tweens.add({ targets: [t, s], alpha: 0, duration: 500, delay: 2600, onComplete: () => { t.destroy(); s.destroy(); } });
  }

  /** Power parts, the evac countdown or the blackout, under the timer. */
  updateStatus(session) {
    const m = session.match;
    const now = session.clock();
    let text = '';
    let color = '#ffb04a';
    let ico = 'bolt';
    if (m.isBlackout(now)) [text, color, ico] = [`${Math.ceil((m.blackoutUntil - now) / 1000)}s`, '#b4ff3a', 'dark'];
    else if (m.evacAt !== null) [text, color, ico] = [clockText(m.evacAt - now), '#ffd27a', 'exit'];
    else if (m.powerAt !== null) text = ''; // the evac has gone: nothing left to track
    else text = `${m.parts.filter((p) => p.fitted).length}/${m.parts.length}`;
    if (this.status.text === text && this.statusKind === ico) return;
    this.statusKind = ico;
    this.status.setText(text).setColor(color);
    this.statusIcon.setTexture(`ico-${ico}`).setDisplaySize(18, 18).setTint(Phaser.Display.Color.HexStringToColor(color).color);
    this.placeStatus();
  }

  /** Icon + number, centred under the timer. */
  placeStatus() {
    const w = this.status.width + 24;
    const x = this.scale.width / 2 - w / 2;
    const on = !!this.status.text && this.playing !== false;
    this.statusIcon.setPosition(x + 9, this.statusY ?? 70).setVisible(on);
    this.status.setPosition(x + 24, this.statusY ?? 70).setVisible(on);
  }

  /** Big card at the start telling you your secret role. */
  showRoleIntro(session) {
    const { width: W, height: H } = this.scale;
    const you = session.match.get(session.youId);
    const infected = you.role === 'infected';
    const color = infected ? '#3ee67a' : '#2fd2e0';
    const allies = session.match.list().filter((p) => p.role === 'infected' && p.id !== session.youId).map((p) => p.name);
    const n = session.match.list().filter((p) => p.role === 'infected').length;
    const lines = infected
      ? ['Bite humans with your ZOMBIE card. Outnumber them by the end.', allies.length ? `Fellow infected: ${allies.join(', ')}` : 'Mind your hunger. Beware of Guns.']
      : ['Find the zombies, or restore the power and escape.', `${n} infected ${n === 1 ? 'hides' : 'hide'} among you.`];
    if (session.modifier) lines.push(`TODAY: ${MODIFIERS[session.modifier].name.toUpperCase()}`);
    const items = [];
    const bg = this.add.rectangle(0, 0, W, H, 0x020308, 0.78).setOrigin(0).setInteractive();
    items.push(bg);
    items.push(this.add.text(W / 2, H * 0.36, 'YOU ARE', { fontFamily: FONT, fontSize: '16px', fontStyle: '600', color: UI.dim }).setOrigin(0.5).setLetterSpacing(8));
    items.push(
      this.add.text(W / 2, H * 0.36 + 44, infected ? 'INFECTED' : 'HUMAN', { fontFamily: FONT, fontSize: H < 480 ? '40px' : '56px', fontStyle: '700', color })
        .setOrigin(0.5).setLetterSpacing(12).setShadow(0, 0, color, 24, false, true),
    );
    lines.forEach((l, i) => items.push(this.add.text(W / 2, H * 0.36 + 96 + i * 26, l, { fontFamily: FONT, fontSize: '17px', fontStyle: '600', color: '#c9ced8', align: 'center', wordWrap: { width: W - 40 } }).setOrigin(0.5).setLetterSpacing(1)));
    items.push(this.add.text(W / 2, H * 0.36 + 112 + lines.length * 26, 'TAP TO BEGIN', { fontFamily: FONT, fontSize: `${MIN_TEXT}px`, fontStyle: '700', color: UI.dim }).setOrigin(0.5).setLetterSpacing(4));
    for (const it of items) it.setDepth(200);
    const close = () => {
      if (!items[0].active) return;
      this.tweens.add({ targets: items, alpha: 0, duration: 350, onComplete: () => items.forEach((i) => i.destroy()) });
    };
    bg.on('pointerdown', close);
    this.input.keyboard?.once('keydown', close);
    this.time.delayedCall(5000, close);
  }

  /** "P5 challenges you" panel with Accept / Decline and a countdown. */
  buildRequestPanel(session) {
    const c = this.add.container(0, 0).setDepth(150).setVisible(false);
    const bg = this.add.graphics();
    const title = this.add.text(0, -40, '', { fontFamily: FONT, fontSize: '20px', fontStyle: '700', color: '#ffffff' }).setOrigin(0.5).setLetterSpacing(3);
    const bar = this.add.rectangle(-130, -14, 260, 3, 0xff4a5a).setOrigin(0, 0.5);
    const button = (x, label, color, accept) => {
      const g = this.add.graphics().fillStyle(color, 1).fillRoundedRect(x - 62, 6, 124, 36, 18);
      const t = this.add.text(x, 24, label, { fontFamily: FONT, fontSize: '16px', fontStyle: '700', color: '#0a0b10' }).setOrigin(0.5).setLetterSpacing(2);
      const z = this.add.zone(x, 24, 124, 36).setInteractive({ useHandCursor: true });
      z.on('pointerdown', (p, lx, ly, e) => {
        e?.stopPropagation();
        session.answer(accept);
      });
      return [g, t, z];
    };
    const touch = this.sys.game.device.input.touch;
    c.add([bg, title, bar, ...button(-70, touch ? 'ACCEPT' : 'ACCEPT  ·  Y', 0x9ffff4, true), ...button(70, touch ? 'RUN' : 'RUN  ·  N', 0xff7a3a, false)]);
    bg.fillStyle(UI.panel, 0.95).fillRoundedRect(-160, -70, 320, 128, 14).lineStyle(1.5, 0xff4a5a, 0.8).strokeRoundedRect(-160, -70, 320, 128, 14);
    this.request = c;
    this.requestTitle = title;
    this.requestBar = bar;
    this.input.keyboard?.on('keydown-Y', () => this.request.visible && session.answer(true));
    this.input.keyboard?.on('keydown-N', () => this.request.visible && session.answer(false));
  }

  showRequest({ name, color, ms }) {
    this.requestTitle.setText(`${name} CHALLENGES YOU`).setColor(color);
    this.request.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.request, alpha: 1, duration: 150 });
    this.requestBar.width = 260;
    this.tweens.killTweensOf(this.requestBar);
    this.tweens.add({ targets: this.requestBar, width: 0, duration: ms });
  }

  hideRequest() {
    this.request.setVisible(false);
  }

  showOver(r) {
    this.setPlaying(false);
    const { width: W, height: H } = this.scale;
    const text = r.winner === 'infected' ? 'OUTBREAK' : r.reason === 'time' ? 'TIME UP' : 'CONTAINED';
    const color = r.winner === 'infected' ? '#3ee67a' : '#2fd2e0';
    this.add.rectangle(0, 0, W, H, 0x020308, 0.6).setOrigin(0).setDepth(300);
    const t = this.add.text(W / 2, H / 2, text, { fontFamily: FONT, fontSize: '64px', fontStyle: '700', color }).setOrigin(0.5).setLetterSpacing(14).setShadow(0, 0, color, 28, false, true).setDepth(301);
    if (t.width > W - 40) t.setScale((W - 40) / t.width);
  }

  setChase(c) {
    this.chase = c;
    if (!c) {
      this.chaseText.setVisible(false);
      this.chaseSub.setVisible(false);
      this.tweens.add({ targets: this.danger, alpha: 0, duration: 300 });
      return;
    }
    const runner = c.role === 'runner';
    this.chaseText.setColor(runner ? '#ff4a5a' : '#ff9a3a').setShadow(0, 0, runner ? '#ff2a3a' : '#ff7a1a', 16, false, true).setVisible(true);
    this.chaseSub.setVisible(true);
  }

  /** Countdown text and a heartbeat pulse (two quick beats) while the chase lasts. */
  updateChase(now, time) {
    const c = this.chase;
    if (!c || this.playing === false) {
      if (!c) this.danger.setAlpha(Math.max(0, this.danger.alpha - 0.05));
      return;
    }
    const left = Math.max(0, Math.ceil((c.until - now) / 1000));
    if (c.role === 'runner') {
      this.chaseText.setText(`RUN!  ${left}`);
      this.chaseSub.setText('CLIMB A LADDER TO LOSE THEM');
      const beat = (time % 800) / 800;
      if (beat < this.lastBeat) sfx.play('heartbeat');
      this.lastBeat = beat;
      const pulse = Math.max(0, 1 - Math.abs(beat - 0.1) * 9) + 0.7 * Math.max(0, 1 - Math.abs(beat - 0.32) * 9);
      this.danger.setAlpha(0.22 + 0.45 * pulse);
      this.chaseText.setScale(1 + 0.06 * pulse);
    } else {
      this.chaseText.setText(now < c.startAt ? 'GET READY…' : `CATCH ${c.name}  ${left}`);
      this.chaseSub.setText('TOUCH THEM');
      this.danger.setAlpha(0);
    }
  }

  /** You were shot or quarantined: show it, then let you watch or leave. */
  showDeath({ by, quarantined = false }) {
    this.dead = true;
    this.setPlaying(false);
    this.updateRoleChip();
    const { width: W, height: H } = this.scale;
    const title = quarantined ? 'QUARANTINED' : 'YOU WERE SHOT';
    const line = quarantined ? 'The others voted you out.' : `${by} had a Gun.`;
    const color = quarantined ? '#ff9a5a' : '#ff4a5a';
    const items = [
      this.add.rectangle(0, 0, W, H, 0x120206, 0.55).setOrigin(0),
      this.add.text(W / 2, H * 0.38, title, { fontFamily: FONT, fontSize: '48px', fontStyle: '700', color }).setOrigin(0.5).setLetterSpacing(10).setShadow(0, 0, color, 24, false, true),
      this.add.text(W / 2, H * 0.38 + 46, line, { fontFamily: FONT, fontSize: '17px', fontStyle: '600', color: '#e9c9cc', align: 'center', wordWrap: { width: W - 40 } }).setOrigin(0.5).setLetterSpacing(1),
    ];
    if (items[1].width > W - 40) items[1].setScale((W - 40) / items[1].width);
    for (const it of items) it.setDepth(250);
    this.time.delayedCall(3500, () => this.tweens.add({ targets: items, alpha: 0, duration: 600 }));
    // v3: you walk on as a ghost: every room is lit for you, nobody can hear you
    this.joystick.setEnabled(true);
    this.time.delayedCall(3800, () => this.toasts.show('You are a GHOST: walk anywhere and watch.', '#9ab8ff', 4000));
    const touch = this.sys.game.device.input.touch;
    const g = this.add.graphics().setDepth(250).fillStyle(0x30343d, 0.95).fillRoundedRect(W / 2 - 110, 82, 220, 34, 17);
    const t = this.add.text(W / 2, 99, touch ? 'GHOST  ·  TAP TO LEAVE' : 'GHOST  ·  LEAVE (L)', { fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: '#e9e4d6' }).setOrigin(0.5).setLetterSpacing(2).setDepth(251);
    const leave = () => this.gameScene.scene.start('MenuScene');
    this.add.zone(W / 2, 99, 220, 34).setInteractive({ useHandCursor: true }).setDepth(252).on('pointerup', leave);
    this.input.keyboard?.once('keydown-L', leave);
    this.deathChip = [g, t];
  }

  /** Hide the gameplay HUD while a duel or the big map is open. */
  setPlaying(on) {
    this.playing = on;
    this.hud.setVisible(on);
    this.hand.setVisible(on);
    this.joystick.setEnabled(on);
    for (const o of [this.role, this.roleBg, this.scoreText, this.scoreBg, this.scoreIcon, ...this.emoteButtons]) o.setVisible(on);
    this.placeStatus();
    if (!on) {
      this.challenge.set(null);
      this.action.set(null);
      this.showPrompt(null);
    }
  }

  /** The pill above your cards: an optional icon and a few words. */
  showPrompt(text, ico = null) {
    if (!text && !ico) {
      this.prompt.setVisible(false);
      this.promptBg.setVisible(false);
      this.promptIcon.setVisible(false);
      return;
    }
    text ??= '';
    const y = this.scale.height - this.hand.height - (this.hud.hintItems.length ? 76 : 36);
    if (this.prompt.text === text && this.prompt.visible && this.promptY === y && this.promptKind === ico) return;
    this.promptKind = ico;
    this.promptY = y;
    this.prompt.setText(text).setVisible(true);
    const iw = ico ? 30 : 0;
    const w = this.prompt.width + iw;
    const x0 = (this.hand.centerX ?? this.scale.width / 2) - w / 2;
    this.prompt.setPosition(x0 + iw + this.prompt.width / 2, y);
    if (ico) this.promptIcon.setTexture(`ico-${ico}`).setDisplaySize(22, 22).setPosition(x0 + 11, y).setVisible(true);
    else this.promptIcon.setVisible(false);
    const h = 36;
    this.promptBg.clear().fillStyle(UI.panel, 0.88).fillRoundedRect(x0 - 18, y - h / 2, w + 36, h, h / 2)
      .lineStyle(1, 0xffb04a, 0.6).strokeRoundedRect(x0 - 18, y - h / 2, w + 36, h, h / 2).setVisible(true);
  }

  update(time) {
    this.grain?.setTilePosition(Math.random() * 128, Math.random() * 128);
    this.hud.update(time);
    this.map.update(time);
    const gs = this.gameScene;
    const session = gs.session;
    // a hint goes for good once you have done the thing
    if (this.hud.hintItems.length && !this.dead) {
      const mv = gs.readMovement();
      if (Math.abs(mv.x) > 0.3 && this.playing !== false) this.hud.done('walk');
      if (session.you.state.mode === 'climb') this.hud.done('climb');
    }

    const left = Math.ceil(session.timeLeft() / 1000);
    if (left !== this.lastLeft && left <= 10 && left > 0 && !session.meeting && !session.over) sfx.play('tick');
    this.lastLeft = left;
    this.timer.setText(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`).setColor(left <= 30 ? '#ff4a5a' : '#ffffff');
    this.updateChase(gs.now(), time);
    this.updateRoleChip();
    this.updateScore();
    this.updateStatus(session);
    if (this.playing === false || gs.mapOpen || session.over || session.meeting) return;
    this.action.set(session.yourAction());

    // challenge button
    const target = gs.nearbyTarget();
    if (target) {
      const check = gs.challengeState(target);
      const note = check.ok ? 'CHALLENGE' : check.wait ? `WAIT ${Math.ceil(check.wait / 1000)}s` : REASONS[check.reason] ?? 'BUSY';
      this.challenge.set({ name: target.name, color: target.color, enabled: check.ok, note });
    } else this.challenge.set(null);

    // prompts: stunned > refill > ladder
    const touch = this.sys.game.device.input.touch;
    const ladder = gs.nearbyLadder();
    const me = gs.match.get(gs.youId);
    const now = gs.now();
    if (gs.match.inCell(me.id, now)) this.showPrompt(`QUARANTINE  ${Math.ceil((me.cellUntil - now) / 1000)}`);
    else if (now < me.stunnedUntil) this.showPrompt(`STUNNED  ${Math.ceil((me.stunnedUntil - now) / 1000)}`);
    else if (gs.refillHint) this.showPrompt(gs.refillHint.startsWith('STAND') ? 'HOLD STILL TO REFILL' : 'REFILLING…');
    else if (session.work.has(me.id)) this.showPrompt('HOLD STILL…', 'part');
    else if (gs.match.partCarried(me.id) && !ladder) this.showPrompt('TO THE REACTOR', 'part');
    else if (ladder && !gs.busy) {
      // a ladder: the key until you have climbed once, then just the arrow
      const up = ladder.lower === gs.state.floor;
      const key = touch ? (up ? 'PUSH UP' : 'PUSH DOWN') : up ? 'W' : 'S';
      this.showPrompt(needsHint('climb') ? `${up ? '▲' : '▼'}  ${key}` : up ? '▲' : '▼', 'climb');
    } else this.showPrompt(null);
  }
}
