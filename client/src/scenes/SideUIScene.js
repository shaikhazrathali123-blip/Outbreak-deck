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
};

/** Screen overlay for the side view: HUD, hand, challenge button, map, prompts, film grain. */
export default class SideUIScene extends Phaser.Scene {
  constructor() {
    super('SideUIScene');
  }

  init(data) {
    this.gameScene = data.gameScene;
  }

  create() {
    const gs = this.gameScene;
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

    // role badge under the location chip
    this.roleBg = this.add.graphics();
    this.role = this.add.text(22, 0, '', { fontFamily: FONT, fontSize: '11px', fontStyle: '700', color: '#ffffff' }).setOrigin(0, 0.5).setLetterSpacing(3);
    this.setRole(gs.match.get(gs.youId).role);

    // bottom prompt pill (ladders, refills)
    this.promptBg = this.add.graphics().setVisible(false);
    this.prompt = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: '#ffd27a' })
      .setOrigin(0.5)
      .setLetterSpacing(3)
      .setVisible(false);

    const onRoom = (room) => {
      this.hud.showRoom(room);
      this.map.setRoom(room);
    };
    const onHand = () => this.hand.setHand(gs.match.get(gs.youId).hand, gs.match.isExhausted(gs.youId));
    const onToast = (text, color, ms) => this.toasts.show(text, color, ms);
    const onRole = (role) => this.setRole(role);
    const onDuel = (open) => this.setPlaying(!open);
    gs.events.on('room-changed', onRoom);
    gs.events.on('hand-changed', onHand);
    gs.events.on('toast', onToast);
    gs.events.on('role-changed', onRole);
    gs.events.on('duel-open', onDuel);
    if (gs.currentRoom !== undefined) onRoom(gs.currentRoom);
    onHand();

    this.events.on('map-open', (open) => this.setPlaying(!open));

    const onResize = (size) => this.layout(size.width, size.height);
    this.scale.on('resize', onResize);
    this.layout(this.scale.width, this.scale.height);
    this.events.once('shutdown', () => {
      gs.events.off('room-changed', onRoom);
      gs.events.off('hand-changed', onHand);
      gs.events.off('toast', onToast);
      gs.events.off('role-changed', onRole);
      gs.events.off('duel-open', onDuel);
      this.scale.off('resize', onResize);
      this.joystick.destroy();
    });
    this.time.delayedCall(1200, () => this.toasts.show('Find another survivor and challenge them to a duel', '#2fd2c0', 4500));
  }

  layout(width, height) {
    this.hud.layout(width, height);
    this.map.layout(width, height);
    this.joystick.layout(width, height);
    this.hand.layout(width, height);
    this.toasts.layout(width, height);
    this.challenge.layout(width, height, 0);
    this.grain.setSize(width, height);
    // keep the controls hint above the cards
    this.hud.hint.setY(height - this.hand.height - 8);
    this.hud.drawHintBg();
    this.role.setY(70);
    this.hud.fps.setY(88);
    this.drawRole();
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
    if (this.playing === false || gs.mapOpen) return;

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
    if (gs.isStunned()) this.showPrompt(`STUNNED  ${Math.ceil((gs.match.get(gs.youId).stunnedUntil - gs.now()) / 1000)}`);
    else if (gs.refillHint) this.showPrompt(gs.refillHint);
    else if (ladder && !gs.busy) {
      const up = ladder.lower === gs.state.floor;
      this.showPrompt(up ? `▲  ${touch ? 'PUSH UP' : 'W'}  TO CLIMB` : `▼  ${touch ? 'PUSH DOWN' : 'S'}  TO CLIMB DOWN`);
    } else this.showPrompt(null);
  }
}
