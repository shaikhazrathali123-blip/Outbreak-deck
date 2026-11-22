import Phaser from 'phaser';
import HUD, { FONT, UI } from '../ui/HUD.js';
import Joystick from '../ui/Joystick.js';
import SideMap from '../side/SideMap.js';
import HandUI from '../ui/HandUI.js';
import ChallengeButton from '../ui/ChallengeButton.js';
import Toasts from '../ui/Toasts.js';

const REASONS = {
  exhausted: 'NO CARDS',
  'target-exhausted': 'NO CARDS',
  stunned: 'STUNNED',
  'target-stunned': 'STUNNED',
  ally: 'ALLY',
  busy: 'BUSY',
};

/** Screen overlay: HUD, timer, hand, challenge button/prompts, map, joystick, film grain. */
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
    this.hand = new HandUI(this, { onUse: (cardId) => session.useYourCard(cardId) });
    this.toasts = new Toasts(this);
    this.challenge = new ChallengeButton(this, () => gs.challenge(gs.nearbyTarget()));

    // role badge under the location chip
    this.roleBg = this.add.graphics();
    this.role = this.add.text(22, 0, '', { fontFamily: FONT, fontSize: '11px', fontStyle: '700', color: '#ffffff' }).setOrigin(0, 0.5).setLetterSpacing(3);
    this.setRole(gs.match.get(gs.youId).role);

    // match timer (top centre)
    this.timerBg = this.add.graphics();
    this.timer = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '18px', fontStyle: '700', color: '#ffffff' }).setOrigin(0.5).setLetterSpacing(3);

    // bottom prompt pill (ladders, refills)
    this.promptBg = this.add.graphics().setVisible(false);
    this.prompt = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: '#ffd27a' }).setOrigin(0.5).setLetterSpacing(3).setVisible(false);

    this.buildRequestPanel(session);

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
      ['duel-open', onDuel], ['challenge-request', onRequest], ['challenge-cancel', onCancel], ['match-over', onOver],
    ];
    for (const [ev, fn] of subs) gs.events.on(ev, fn);
    if (gs.currentRoom !== undefined) onRoom(gs.currentRoom);
    onHand();

    this.events.on('map-open', (open) => this.setPlaying(!open));
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
    this.grain.setSize(width, height);
    this.hud.hint.setY(height - this.hand.height - 8);
    this.hud.drawHintBg();
    this.role.setY(70);
    this.hud.fps.setY(88);
    this.drawRole();
    this.timer.setPosition(width / 2, 22);
    this.timerBg.clear().fillStyle(UI.panel, 0.8).fillRoundedRect(width / 2 - 46, 8, 92, 28, 14).lineStyle(1, UI.line, 0.18).strokeRoundedRect(width / 2 - 46, 8, 92, 28, 14);
    this.hud.kicker.setY((height < 480 ? 44 : 54) + 12);
    this.hud.banner.setY((height < 480 ? 68 : 84) + 12);
    this.hud.bannerY = this.hud.banner.y;
    this.request.setPosition(width / 2, height * 0.42);
  }

  setRole(role) {
    this.roleName = role;
    this.role.setText(role === 'infected' ? 'INFECTED' : 'HUMAN').setColor(role === 'infected' ? '#3ee67a' : '#e9e4d6');
    this.drawRole();
  }

  drawRole() {
    const color = this.roleName === 'infected' ? 0x3ee67a : 0xe9e4d6;
    const w = this.role.width + 26;
    this.roleBg.clear().fillStyle(UI.panel, 0.78).fillRoundedRect(12, 59, w, 22, 11).lineStyle(1, color, 0.6).strokeRoundedRect(12, 59, w, 22, 11);
  }

  /** Big card at the start telling you your secret role. */
  showRoleIntro(session) {
    const { width: W, height: H } = this.scale;
    const you = session.match.get(session.youId);
    const infected = you.role === 'infected';
    const color = infected ? '#3ee67a' : '#2fd2e0';
    const allies = session.match.list().filter((p) => p.role === 'infected' && p.id !== session.youId).map((p) => p.name);
    const lines = infected
      ? ['Infect every human before the timer ends.', allies.length ? `Fellow infected: ${allies.join(', ')}` : 'You are the only infected. Spread the strain.']
      : ['Stay human until the timer ends.', (() => { const n = session.match.list().filter((p) => p.role === 'infected').length; return `${n} infected ${n === 1 ? 'hides' : 'hide'} among you. Trust no one.`; })()];
    const items = [];
    const bg = this.add.rectangle(0, 0, W, H, 0x020308, 0.78).setOrigin(0).setInteractive();
    items.push(bg);
    items.push(this.add.text(W / 2, H * 0.36, 'YOUR ROLE', { fontFamily: FONT, fontSize: '14px', fontStyle: '600', color: UI.dim }).setOrigin(0.5).setLetterSpacing(8));
    items.push(
      this.add.text(W / 2, H * 0.36 + 44, infected ? 'INFECTED' : 'HUMAN', { fontFamily: FONT, fontSize: H < 480 ? '40px' : '56px', fontStyle: '700', color })
        .setOrigin(0.5).setLetterSpacing(12).setShadow(0, 0, color, 24, false, true),
    );
    lines.forEach((l, i) => items.push(this.add.text(W / 2, H * 0.36 + 96 + i * 24, l, { fontFamily: FONT, fontSize: '15px', fontStyle: '600', color: '#c9ced8' }).setOrigin(0.5).setLetterSpacing(1)));
    items.push(this.add.text(W / 2, H * 0.36 + 160, 'TAP TO BEGIN', { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color: UI.dim }).setOrigin(0.5).setLetterSpacing(4));
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
    const note = this.add.text(0, 58, 'Declining costs a random card', { fontFamily: FONT, fontSize: '11px', fontStyle: '600', color: UI.dim }).setOrigin(0.5).setLetterSpacing(2);
    c.add([bg, title, bar, ...button(-70, 'ACCEPT  ·  Y', 0x9ffff4, true), ...button(70, 'DECLINE  ·  N', 0x6a707c, false), note]);
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
    const text = r.winner === 'infected' ? 'OUTBREAK' : 'TIME UP';
    const color = r.winner === 'infected' ? '#3ee67a' : '#2fd2e0';
    this.add.rectangle(0, 0, W, H, 0x020308, 0.6).setOrigin(0).setDepth(300);
    this.add.text(W / 2, H / 2, text, { fontFamily: FONT, fontSize: '64px', fontStyle: '700', color }).setOrigin(0.5).setLetterSpacing(14).setShadow(0, 0, color, 28, false, true).setDepth(301);
  }

  /** Hide the gameplay HUD while a duel or the big map is open. */
  setPlaying(on) {
    this.playing = on;
    this.hud.setVisible(on);
    this.hand.setVisible(on);
    this.joystick.setEnabled(on);
    for (const o of [this.role, this.roleBg]) o.setVisible(on);
    if (!on) {
      this.challenge.set(null);
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
    this.timer.setText(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`).setColor(left <= 30 ? '#ff4a5a' : '#ffffff');
    if (this.playing === false || gs.mapOpen || session.over) return;

    // challenge button
    const target = gs.nearbyTarget();
    if (target) {
      const check = gs.challengeState(target);
      const note = check.ok ? 'CHALLENGE' : check.wait ? `WAIT ${Math.ceil(check.wait / 1000)}s` : REASONS[check.reason] ?? 'BUSY';
      this.challenge.set({ name: target.name, color: target.color, enabled: check.ok, note });
    } else this.challenge.set(null);

    // prompts: stunned/frozen > refill > ladder
    const touch = this.sys.game.device.input.touch;
    const ladder = gs.nearbyLadder();
    const me = gs.match.get(gs.youId);
    const now = gs.now();
    if (now < me.stunnedUntil) this.showPrompt(`STUNNED  ${Math.ceil((me.stunnedUntil - now) / 1000)}`);
    else if (now < me.frozenUntil) this.showPrompt(`FROZEN  ${Math.ceil((me.frozenUntil - now) / 1000)}`);
    else if (gs.refillHint) this.showPrompt(gs.refillHint);
    else if (ladder && !gs.busy) {
      const up = ladder.lower === gs.state.floor;
      this.showPrompt(up ? `▲  ${touch ? 'PUSH UP' : 'W'}  TO CLIMB` : `▼  ${touch ? 'PUSH DOWN' : 'S'}  TO CLIMB DOWN`);
    } else this.showPrompt(null);
  }
}
