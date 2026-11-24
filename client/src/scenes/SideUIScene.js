import Phaser from 'phaser';
import HUD, { FONT, UI } from '../ui/HUD.js';
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
    this.grain = this.add
      .tileSprite(0, 0, this.scale.width, this.scale.height, 'grain')
      .setOrigin(0)
      .setAlpha(0.025)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.hud = new HUD(this);
    this.map = new SideMap(this, gs);
    this.joystick = new Joystick(this);
    this.hand = new HandUI(this);
    this.toasts = new Toasts(this);
    this.challenge = new ChallengeButton(this, () => gs.challenge(gs.nearbyTarget()));
    this.action = new ActionButton(this, () => session.doAction());

    // role badge under the location chip
    this.roleBg = this.add.graphics();
    this.role = this.add.text(22, 0, '', { fontFamily: FONT, fontSize: '11px', fontStyle: '700', color: '#ffffff' }).setOrigin(0, 0.5).setLetterSpacing(3);
    this.setRole(gs.match.get(gs.youId).role);

    // your secret score (nobody else can see it until the results)
    this.scoreBg = this.add.graphics();
    this.scoreText = this.add.text(22, 0, '', { fontFamily: FONT, fontSize: '11px', fontStyle: '700', color: '#ffd27a' }).setOrigin(0, 0.5).setLetterSpacing(3);
    this.lastScore = null;

    // match timer (top centre)
    this.timerBg = this.add.graphics();
    this.timer = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '18px', fontStyle: '700', color: '#ffffff' }).setOrigin(0.5).setLetterSpacing(3);
    // v3: power / evac / blackout line under the timer
    this.status = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '11px', fontStyle: '700', color: '#ffb04a' }).setOrigin(0.5).setLetterSpacing(3);
    this.buildEmotes(session);

    // bottom prompt pill (ladders, refills)
    this.promptBg = this.add.graphics().setVisible(false);
    this.prompt = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: '#ffd27a' }).setOrigin(0.5).setLetterSpacing(3).setVisible(false);

    this.buildRequestPanel(session);

    // chase: red heartbeat at the edges + RUN / CATCH banner
    this.danger = this.add.image(0, 0, 'danger').setOrigin(0).setAlpha(0).setDepth(140);
    this.chaseText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '26px', fontStyle: '700', color: '#ff4a5a' })
      .setOrigin(0.5).setLetterSpacing(6).setDepth(141).setVisible(false);
    this.chaseSub = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '13px', fontStyle: '700', color: '#ffd0d4' })
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

    this.events.on('map-open', (open) => (this.dead ? this.joystick.setEnabled(!open) : this.setPlaying(!open)));
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
    this.grain.setSize(width, height);
    this.hud.hint.setY(height - this.hand.height - 8);
    this.hud.drawHintBg();
    this.role.setY(70);
    this.scoreText.setY(98);
    this.hud.fps.setY(118);
    this.drawRole();
    this.drawScore();
    this.timer.setPosition(width / 2, 22);
    this.status.setPosition(width / 2, 46);
    this.layoutEmotes(width, height);
    this.timerBg.clear().fillStyle(UI.panel, 0.8).fillRoundedRect(width / 2 - 46, 8, 92, 28, 14).lineStyle(1, UI.line, 0.18).strokeRoundedRect(width / 2 - 46, 8, 92, 28, 14);
    this.hud.kicker.setY((height < 480 ? 44 : 54) + 12);
    this.hud.banner.setY((height < 480 ? 68 : 84) + 12);
    this.hud.bannerY = this.hud.banner.y;
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
    else if (me.role === 'infected' && session.match.isStarving(me.id, now)) [text, color] = ['ZOMBIE  ·  STARVING', '#b4ff3a'];
    else if (me.role === 'infected' && me.hungerAt === null) [text, color] = [`ZOMBIE  ·  FED  ·  CLAW IN ${clockText(me.nextZombieAt - now)}`, '#3ee67a'];
    else if (me.role === 'infected') [text, color] = [`ZOMBIE  ·  HUNGER ${clockText(me.hungerAt - now)}`, '#3ee67a'];
    else if (session.match.inCell(me.id, now)) [text, color] = [`HUMAN  ·  IN QUARANTINE ${clockText(me.cellUntil - now)}`, '#ff9a5a'];
    else if (session.match.isGagged(me.id, now)) [text, color] = [`HUMAN  ·  GAGGED ${clockText(me.gagUntil - now)}${session.match.isRecovering(me.id, now) ? '  ·  RECOVERING' : ''}`, '#9ab8d8'];
    if (text === this.role.text && color === this.roleColor) return;
    this.roleColor = color;
    this.role.setText(text).setColor(color);
    this.drawRole();
  }

  drawRole() {
    const color = Phaser.Display.Color.HexStringToColor(this.roleColor ?? '#e9e4d6').color;
    const w = this.role.width + 26;
    this.roleBg.clear().fillStyle(UI.panel, 0.78).fillRoundedRect(12, 59, w, 22, 11).lineStyle(1, color, 0.6).strokeRoundedRect(12, 59, w, 22, 11);
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
    this.scoreText.setText(`SCORE ${score}  ·  SECRET`);
    this.drawScore();
    if (!delta || !this.scoreText.visible) return;
    const pop = this.add
      .text(this.scoreText.x + this.scoreText.width + 22, this.scoreText.y, `${delta > 0 ? '+' : ''}${delta}${why}`, {
        fontFamily: FONT, fontSize: why ? '13px' : '16px', fontStyle: '700', color: delta > 0 ? '#3ee6a0' : '#ff5a68',
      })
      .setOrigin(0, 0.5)
      .setDepth(60);
    this.tweens.add({ targets: pop, y: pop.y - 18, alpha: 0, duration: 1600, ease: 'Cubic.out', onComplete: () => pop.destroy() });
    this.tweens.add({ targets: this.scoreText, scale: 1.15, duration: 120, yoyo: true });
  }

  drawScore() {
    if (!this.scoreText.text) return;
    const w = this.scoreText.width + 26;
    this.scoreBg.clear().fillStyle(UI.panel, 0.78).fillRoundedRect(12, 87, w, 22, 11).lineStyle(1, 0xf2b84a, 0.6).strokeRoundedRect(12, 87, w, 22, 11);
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
    this.emoteButtons = Object.entries(EMOTES).map(([kind, text], i) => {
      const c = this.add.container(0, 0).setDepth(60);
      const g = this.add.graphics();
      const color = kind === 'sus' ? 0xffb04a : kind === 'help' ? 0xff7a7a : 0xe9e4d6;
      g.fillStyle(UI.panel, 0.85).fillRoundedRect(-44, -12, 88, 24, 12).lineStyle(1, color, 0.7).strokeRoundedRect(-44, -12, 88, 24, 12);
      const t = this.add.text(0, 0, `${i + 1} ${text}`, { fontFamily: FONT, fontSize: '11px', fontStyle: '700', color: Phaser.Display.Color.IntegerToColor(color).rgba }).setOrigin(0.5).setLetterSpacing(1);
      const z = this.add.zone(0, 0, 88, 24).setInteractive({ useHandCursor: true });
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
    const top = Math.max(150, height * 0.34);
    this.emoteButtons.forEach((c, i) => c.setPosition(width - 58, top + i * 30));
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
    c.add(this.add.text(0, 16, 'SECURITY CAMERAS  ·  LAST ROOM ENTRIES', { fontFamily: FONT, fontSize: '11px', fontStyle: '700', color: '#9ab8ff' }).setOrigin(0.5).setLetterSpacing(2));
    lines.forEach((e, i) => {
      const y = 38 + i * 20;
      c.add(this.add.text(-150, y, e.name, { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: e.color }).setOrigin(0, 0.5));
      c.add(this.add.text(-100, y, `→ ${e.room}`, { fontFamily: FONT, fontSize: '14px', fontStyle: '600', color: '#e9e4d6' }).setOrigin(0, 0.5));
      if (e.ago !== null) c.add(this.add.text(150, y, `${e.ago}s ago`, { fontFamily: FONT, fontSize: '12px', fontStyle: '600', color: UI.dim }).setOrigin(1, 0.5));
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
    if (m.isBlackout(now)) [text, color] = [`⚠ BLACKOUT ${Math.ceil((m.blackoutUntil - now) / 1000)}s`, '#b4ff3a'];
    else if (m.evacAt !== null) [text, color] = [`EVAC IN ${clockText(m.evacAt - now)}  ·  ENTRANCE`, '#ffd27a'];
    else if (m.powerAt !== null) [text, color] = ['POWER ON  ·  THE EVAC HAS GONE', '#8f96a3'];
    else text = `⚡ POWER ${m.parts.filter((p) => p.fitted).length}/${m.parts.length}  ·  FIT PARTS AT THE REACTOR`;
    if (this.status.text !== text) this.status.setText(text).setColor(color);
  }

  /** Big card at the start telling you your secret role. */
  showRoleIntro(session) {
    const { width: W, height: H } = this.scale;
    const you = session.match.get(session.youId);
    const infected = you.role === 'infected';
    const color = infected ? '#3ee67a' : '#2fd2e0';
    const allies = session.match.list().filter((p) => p.role === 'infected' && p.id !== session.youId).map((p) => p.name);
    const lines = infected
      ? ['Bite humans with your ZOMBIE card: they turn at once. Outnumber them when the timer ends. Mind your HUNGER.', 'Beware of Guns and Cures.' + (allies.length ? `  Fellow infected: ${allies.join(', ')}` : '')]
      : ['Shoot, cure or vote out every zombie, or restore the power (4 parts) and escape in the evac truck.', (() => { const n = session.match.list().filter((p) => p.role === 'infected').length; return `${n} infected ${n === 1 ? 'hides' : 'hide'} among you. Emergency Button in the Central Hall.`; })()];
    if (infected) lines[1] += '  Cut the power once at the BREAKER (Server Room).';
    if (session.modifier) lines.push(`TODAY: ${MODIFIERS[session.modifier].name.toUpperCase()}  ·  ${MODIFIERS[session.modifier].text}`);
    const items = [];
    const bg = this.add.rectangle(0, 0, W, H, 0x020308, 0.78).setOrigin(0).setInteractive();
    items.push(bg);
    items.push(this.add.text(W / 2, H * 0.36 - 34, 'NIGHT SHIFT  ·  STORM LOCKDOWN', { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color: '#7fb8b0' }).setOrigin(0.5).setLetterSpacing(6));
    items.push(this.add.text(W / 2, H * 0.36, 'YOU ARE P1  ·  YOUR ROLE', { fontFamily: FONT, fontSize: '14px', fontStyle: '600', color: UI.dim }).setOrigin(0.5).setLetterSpacing(8));
    items.push(
      this.add.text(W / 2, H * 0.36 + 44, infected ? 'INFECTED' : 'HUMAN', { fontFamily: FONT, fontSize: H < 480 ? '40px' : '56px', fontStyle: '700', color })
        .setOrigin(0.5).setLetterSpacing(12).setShadow(0, 0, color, 24, false, true),
    );
    lines.forEach((l, i) => items.push(this.add.text(W / 2, H * 0.36 + 96 + i * 24, l, { fontFamily: FONT, fontSize: '15px', fontStyle: '600', color: '#c9ced8' }).setOrigin(0.5).setLetterSpacing(1)));
    items.push(this.add.text(W / 2, H * 0.36 + 112 + lines.length * 24, 'TAP TO BEGIN', { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color: UI.dim }).setOrigin(0.5).setLetterSpacing(4));
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
      const t = this.add.text(x, 24, label, { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: '#0a0b10' }).setOrigin(0.5).setLetterSpacing(2);
      const z = this.add.zone(x, 24, 124, 36).setInteractive({ useHandCursor: true });
      z.on('pointerdown', (p, lx, ly, e) => {
        e?.stopPropagation();
        session.answer(accept);
      });
      return [g, t, z];
    };
    const note = this.add.text(0, 58, 'Run, and they get 8 seconds to catch you', { fontFamily: FONT, fontSize: '11px', fontStyle: '600', color: UI.dim }).setOrigin(0.5).setLetterSpacing(2);
    c.add([bg, title, bar, ...button(-70, 'ACCEPT  ·  Y', 0x9ffff4, true), ...button(70, 'RUN  ·  N', 0xff7a3a, false), note]);
    bg.fillStyle(UI.panel, 0.95).fillRoundedRect(-160, -70, 320, 146, 14).lineStyle(1.5, 0xff4a5a, 0.8).strokeRoundedRect(-160, -70, 320, 146, 14);
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
    this.add.text(W / 2, H / 2, text, { fontFamily: FONT, fontSize: '64px', fontStyle: '700', color }).setOrigin(0.5).setLetterSpacing(14).setShadow(0, 0, color, 28, false, true).setDepth(301);
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
      this.chaseSub.setText(`${c.name} IS CHASING YOU  ·  CLIMB A LADDER TO LOSE THEM`);
      const beat = (time % 800) / 800;
      if (beat < this.lastBeat) sfx.play('heartbeat');
      this.lastBeat = beat;
      const pulse = Math.max(0, 1 - Math.abs(beat - 0.1) * 9) + 0.7 * Math.max(0, 1 - Math.abs(beat - 0.32) * 9);
      this.danger.setAlpha(0.22 + 0.45 * pulse);
      this.chaseText.setScale(1 + 0.06 * pulse);
    } else {
      this.chaseText.setText(now < c.startAt ? 'GET READY…' : `CATCH ${c.name}  ${left}`);
      this.chaseSub.setText('TOUCH THEM TO FORCE THE DUEL');
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
    const line = quarantined ? 'The others voted you out. Watch the rest from the Quarantine Cell.' : `${by} had a Gun. Your team plays on without you.`;
    const color = quarantined ? '#ff9a5a' : '#ff4a5a';
    const items = [
      this.add.rectangle(0, 0, W, H, 0x120206, 0.55).setOrigin(0),
      this.add.text(W / 2, H * 0.38, title, { fontFamily: FONT, fontSize: '48px', fontStyle: '700', color }).setOrigin(0.5).setLetterSpacing(10).setShadow(0, 0, color, 24, false, true),
      this.add.text(W / 2, H * 0.38 + 46, line, { fontFamily: FONT, fontSize: '15px', fontStyle: '600', color: '#e9c9cc' }).setOrigin(0.5).setLetterSpacing(1),
    ];
    for (const it of items) it.setDepth(250);
    this.time.delayedCall(3500, () => this.tweens.add({ targets: items, alpha: 0, duration: 600 }));
    // v3: you walk on as a ghost: every room is lit for you, nobody can hear you
    this.joystick.setEnabled(true);
    this.time.delayedCall(3800, () => this.toasts.show('You are a GHOST now: walk anywhere and watch. Nobody can see or hear you.', '#9ab8ff', 5000));
    const g = this.add.graphics().setDepth(250).fillStyle(0x30343d, 0.95).fillRoundedRect(W / 2 - 130, 58, 260, 30, 15);
    const t = this.add.text(W / 2, 73, 'GHOST  ·  YOU ARE OUT  ·  LEAVE (L)', { fontFamily: FONT, fontSize: '13px', fontStyle: '700', color: '#e9e4d6' }).setOrigin(0.5).setLetterSpacing(2).setDepth(251);
    const leave = () => this.gameScene.scene.start('MenuScene');
    this.add.zone(W / 2, 73, 260, 30).setInteractive({ useHandCursor: true }).setDepth(252).on('pointerup', leave);
    this.input.keyboard?.once('keydown-L', leave);
    this.deathChip = [g, t];
  }

  /** Hide the gameplay HUD while a duel or the big map is open. */
  setPlaying(on) {
    this.playing = on;
    this.hud.setVisible(on);
    this.hand.setVisible(on);
    this.joystick.setEnabled(on);
    for (const o of [this.role, this.roleBg, this.scoreText, this.scoreBg, ...this.emoteButtons]) o.setVisible(on);
    if (!on) {
      this.challenge.set(null);
      this.action.set(null);
      this.showPrompt(null);
    }
  }

  showPrompt(text) {
    if (!text) {
      this.prompt.setVisible(false);
      this.promptBg.setVisible(false);
      return;
    }
    const y = this.scale.height - this.hand.height - 44;
    if (this.prompt.text !== text || !this.prompt.visible || this.prompt.y !== y) {
      this.prompt.setText(text).setPosition(this.scale.width / 2, y).setVisible(true);
      const b = this.prompt.getBounds();
      this.promptBg
        .clear()
        .fillStyle(UI.panel, 0.88)
        .fillRoundedRect(b.x - 18, b.y - 8, b.width + 36, b.height + 16, 16)
        .lineStyle(1, 0xffb04a, 0.6)
        .strokeRoundedRect(b.x - 18, b.y - 8, b.width + 36, b.height + 16, 16)
        .setVisible(true);
    }
  }

  update(time) {
    this.grain.setTilePosition(Math.random() * 128, Math.random() * 128);
    this.hud.update(time);
    this.map.update(time);
    if (this.joystick.vector.lengthSq() > 0) this.hud.hideHint();
    const gs = this.gameScene;
    const session = gs.session;

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
    if (gs.match.inCell(me.id, now)) this.showPrompt(`IN QUARANTINE  ${Math.ceil((me.cellUntil - now) / 1000)}  ·  GAGGED`);
    else if (now < me.stunnedUntil) this.showPrompt(`STUNNED  ${Math.ceil((me.stunnedUntil - now) / 1000)}`);
    else if (gs.refillHint) this.showPrompt(gs.refillHint);
    else if (session.work.has(me.id)) this.showPrompt(session.work.get(me.id).kind === 'fit' ? 'FITTING THE PART…  STAND STILL' : 'PICKING UP THE PART…  STAND STILL');
    else if (gs.match.partCarried(me.id) && !ladder) this.showPrompt('CARRYING A POWER PART  ·  FIT IT AT THE GENERATOR (REACTOR, BASEMENT)');
    else if (ladder && !gs.busy) {
      const up = ladder.lower === gs.state.floor;
      this.showPrompt(up ? `▲  ${touch ? 'PUSH UP' : 'W'}  TO CLIMB` : `▼  ${touch ? 'PUSH DOWN' : 'S'}  TO CLIMB DOWN`);
    } else this.showPrompt(null);
  }
}
