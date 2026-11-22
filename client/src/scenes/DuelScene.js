import Phaser from 'phaser';
import { FONT, UI } from '../ui/HUD.js';
import { cardTexture, cardScale } from '../ui/cardArt.js';
import { cardName, isPlayable } from '../../../shared/cards.js';
import { RULES, CARD_INFO } from '../../../shared/constants.js';

const hex = (h) => Phaser.Display.Color.HexStringToColor(h).color;

/**
 * Card-table close-up for a duel: pick one card in 5 seconds, both flip.
 * Highest number wins · Zombie beats numbers and infects · Gun kills a Zombie.
 * data: { match, youId, opp: {id, name, color, pickCard}, table, now: () => ms, onDone(outcome) }
 */
export default class DuelScene extends Phaser.Scene {
  constructor() {
    super('DuelScene');
  }

  init(data) {
    this.d = data;
    this.picked = null;
    this.finished = false;
    this.outcome = null; // Phaser reuses this scene: clear the last duel's result
    this.canClose = false;
  }

  create() {
    const { width: W, height: H } = this.scale;
    const small = H < 480;
    this.small = small;
    this.tableColor = '#2fd2e0';

    this.backdrop = this.add.rectangle(0, 0, W, H, 0x020308, 0.88).setOrigin(0).setInteractive();
    this.backdrop.setAlpha(0);
    this.tweens.add({ targets: this.backdrop, alpha: 1, duration: 250 });

    // header
    this.title = this.add.text(W / 2, small ? 26 : 44, 'DUEL', { fontFamily: FONT, fontSize: small ? '24px' : '34px', fontStyle: '700', color: '#ffffff' })
      .setOrigin(0.5).setLetterSpacing(10).setShadow(0, 0, this.tableColor, 18, false, true);
    const sub = 'HIGHEST NUMBER WINS  ·  ZOMBIE BITES  ·  GUN KILLS ANYONE  ·  CURE CURES ZOMBIES';
    this.subtitle = this.add.text(W / 2, small ? 50 : 76, sub, { fontFamily: FONT, fontSize: '12px', fontStyle: '600', color: UI.dim }).setOrigin(0.5).setLetterSpacing(3);

    // table
    const ty = small ? H * 0.4 : H * 0.42;
    this.tableY = ty;
    const g = this.add.graphics();
    g.fillStyle(0x0b0d12, 1).fillEllipse(W / 2, ty + 10, Math.min(W * 0.7, 620), small ? 150 : 220);
    g.lineStyle(3, hex(this.tableColor), 0.9).strokeEllipse(W / 2, ty + 10, Math.min(W * 0.7, 620), small ? 150 : 220);
    g.lineStyle(10, hex(this.tableColor), 0.12).strokeEllipse(W / 2, ty + 10, Math.min(W * 0.7, 620) + 10, (small ? 150 : 220) + 10);

    // slots: you on the left, opponent on the right
    this.slotH = small ? 112 : 168;
    this.youSlot = { x: W / 2 - (small ? 90 : 130), y: ty };
    this.oppSlot = { x: W / 2 + (small ? 90 : 130), y: ty };
    this.drawSlot(this.youSlot, 'YOU', '#ff8a2a');
    this.drawSlot(this.oppSlot, this.d.opp.name, this.d.opp.color);
    this.add.text(W / 2, ty, 'VS', { fontFamily: FONT, fontSize: small ? '18px' : '24px', fontStyle: '700', color: UI.dim }).setOrigin(0.5).setLetterSpacing(4);

    // opponent's card arrives face down straight away
    this.oppCard = this.add.image(this.oppSlot.x, -100, cardTexture(this, 'back')).setScale(cardScale(this.slotH));
    this.tweens.add({ targets: this.oppCard, y: this.oppSlot.y, duration: 450, delay: 300, ease: 'Cubic.out' });

    // timer bar
    this.timerBg = this.add.rectangle(W / 2, small ? 64 : 96, 220, 4, 0xffffff, 0.12);
    this.timer = this.add.rectangle(W / 2 - 110, small ? 64 : 96, 220, 4, hex(this.tableColor)).setOrigin(0, 0.5);
    this.tweens.add({ targets: this.timer, width: 0, duration: RULES.pickTime, onComplete: () => this.timeout() });

    this.buildHand();
    this.help = this.add.text(W / 2, H - this.handH - (small ? 20 : 34), 'PICK A CARD  ·  TAP OR PRESS 1–9', { fontFamily: FONT, fontSize: '13px', fontStyle: '700', color: '#ffd27a' })
      .setOrigin(0.5).setLetterSpacing(3);

    this.input.keyboard?.on('keydown', (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 9) this.pickPlayable(n - 1);
      if ((e.key === 'Enter' || e.key === ' ') && this.canClose) this.close();
    });
  }

  drawSlot(slot, name, color) {
    const h = this.slotH;
    const w = h * (88 / 128);
    const g = this.add.graphics();
    g.lineStyle(1.5, 0xe9e4d6, 0.25).strokeRoundedRect(slot.x - w / 2, slot.y - h / 2, w, h, 10);
    this.add.circle(slot.x - 30, slot.y + h / 2 + 16, 4, hex(color));
    this.add.text(slot.x - 20, slot.y + h / 2 + 16, name, { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color }).setOrigin(0, 0.5).setLetterSpacing(2);
  }

  buildHand() {
    const { width: W, height: H } = this.scale;
    const you = this.d.match.get(this.d.youId);
    this.handH = this.small ? 92 : 128;
    const scale = cardScale(this.handH);
    const cw = this.handH * (88 / 128);
    const n = you.hand.length;
    const step = Math.min(cw + 10, (Math.min(W * 0.9, 900) - cw) / Math.max(1, n - 1));
    this.handCards = [];
    this.playable = [];
    you.hand.forEach((card, i) => {
      const x = W / 2 + (i - (n - 1) / 2) * step;
      const y = H - this.handH / 2 - (this.small ? 10 : 18);
      const img = this.add.image(x, y + 60, cardTexture(this, card)).setScale(scale).setAlpha(0);
      this.tweens.add({ targets: img, y, alpha: isPlayable(card) ? 1 : 0.35, duration: 300, delay: 120 + i * 40, ease: 'Cubic.out' });
      img.card = card;
      img.homeY = y;
      if (isPlayable(card)) {
        this.playable.push(img);
        img.setInteractive({ useHandCursor: true });
        img.on('pointerover', () => !this.picked && this.tweens.add({ targets: img, y: y - 14, duration: 120 }));
        img.on('pointerout', () => !this.picked && this.tweens.add({ targets: img, y, duration: 120 }));
        img.on('pointerdown', () => this.pick(img));
      }
      this.handCards.push(img);
    });
  }

  pickPlayable(i) {
    if (this.playable[i]) this.pick(this.playable[i]);
  }

  timeout() {
    if (this.picked) return;
    // out of time: a random playable card is played for you
    const img = Phaser.Utils.Array.GetRandom(this.playable);
    this.help.setText('TIME UP  ·  RANDOM CARD PLAYED');
    this.pick(img);
  }

  pick(img) {
    if (this.picked || !img) return;
    this.picked = img;
    this.tweens.killTweensOf(this.timer);
    this.help.setText('');
    for (const other of this.handCards) if (other !== img) this.tweens.add({ targets: other, alpha: 0.15, duration: 200 });
    // your card slides to the table face down
    const scale = cardScale(this.slotH);
    img.disableInteractive();
    this.tweens.add({
      targets: img,
      x: this.youSlot.x,
      y: this.youSlot.y,
      scale,
      duration: 380,
      ease: 'Cubic.inOut',
      onComplete: () => {
        img.setTexture(cardTexture(this, 'back'));
        this.time.delayedCall(450, () => this.reveal());
      },
    });
  }

  flip(img, texture) {
    return new Promise((resolve) => {
      const sx = img.scaleX;
      this.tweens.add({
        targets: img,
        scaleX: 0,
        duration: 160,
        ease: 'Sine.in',
        onComplete: () => {
          img.setTexture(texture);
          this.tweens.add({ targets: img, scaleX: sx, duration: 180, ease: 'Sine.out', onComplete: resolve });
        },
      });
    });
  }

  async reveal() {
    const { match, youId, opp } = this.d;
    const oppCard = opp.pickCard();
    let out;
    try {
      out = match.settleDuel(youId, opp.id, this.picked.card.id, oppCard?.id, this.d.now());
    } catch {
      // the duel can no longer happen (e.g. the opponent ran out of cards): cancel it cleanly
      this.outcome = { result: { winner: null, kind: 'draw' }, winnerId: null, loserId: null, effects: [] };
      this.title.setText('DUEL CANCELLED');
      this.time.delayedCall(1200, () => this.close());
      return;
    }
    this.outcome = out;
    await Promise.all([this.flip(this.picked, cardTexture(this, this.picked.card)), this.flip(this.oppCard, cardTexture(this, oppCard))]);

    const r = out.result; // a = you, b = opponent
    this.scoreLabel(this.youSlot, this.picked.card, r.a);
    this.scoreLabel(this.oppSlot, oppCard, r.b);
    const youWon = out.winnerId === youId;
    const draw = !out.winnerId;
    const fake = r.kind === 'fake';
    const winnerImg = draw ? null : youWon ? this.picked : this.oppCard;
    const loserImg = draw ? null : youWon ? this.oppCard : this.picked;
    if (winnerImg) {
      this.tweens.add({ targets: winnerImg, scale: winnerImg.scale * 1.08, duration: 220, yoyo: true });
      winnerImg.preFX?.addGlow(0xffffff, 4, 0, false, 0.1, 12);
    }
    if (loserImg) this.tweens.add({ targets: loserImg, alpha: 0.45, duration: 300, delay: 200 });

    const { width: W } = this.scale;
    const kind = r.kind;
    const cured = kind === 'cure' || (kind === 'cure-number' && out.effects.some((e) => e.type === 'cured'));
    const headline = fake ? 'FAKE DUEL' : draw ? 'DRAW' : kind === 'kill' ? (youWon ? 'BANG!' : 'SHOT') : kind === 'infect' ? (youWon ? 'BITE!' : 'BITTEN') : cured ? 'CURED' : youWon ? 'YOU WIN' : 'YOU LOSE';
    const color = fake ? '#3ee67a' : draw ? '#e9e4d6' : kind === 'kill' ? '#ff7a3a' : kind === 'infect' ? '#3ee67a' : cured ? '#3e8bff' : youWon ? '#3ee6d0' : '#ff4a5a';
    if (kind === 'kill' || kind === 'infect') this.cameras.main.shake(260, 0.012);
    this.title.setText(headline).setColor(color).setShadow(0, 0, color, 22, false, true).setAlpha(0);
    this.tweens.add({ targets: this.title, alpha: 1, duration: 250 });
    this.timer.setVisible(false);
    this.timerBg.setVisible(false);
    this.subtitle.setText('');

    const lines = this.describe(out);
    const y0 = this.tableY + this.slotH / 2 + (this.small ? 40 : 56);
    lines.forEach(([text, c, size], i) => {
      const t = this.add.text(W / 2, y0 + i * (this.small ? 20 : 26), text, { fontFamily: FONT, fontSize: `${size ?? 15}px`, fontStyle: '700', color: c })
        .setOrigin(0.5).setLetterSpacing(2).setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, duration: 250, delay: 350 + i * 220 });
    });
    for (const img of this.handCards) if (img !== this.picked) this.tweens.add({ targets: img, alpha: 0, duration: 250 });

    this.time.delayedCall(1100, () => {
      this.canClose = true;
      this.add.text(W / 2, this.scale.height - 24, 'TAP TO CONTINUE', { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color: UI.dim }).setOrigin(0.5).setLetterSpacing(4);
      this.backdrop.on('pointerdown', () => this.close());
    });
    this.time.delayedCall(7000, () => this.close());
  }

  scoreLabel(slot, card, score) {
    const color = CARD_INFO[card.kind].color;
    const t = this.add.text(slot.x, slot.y - this.slotH / 2 - 16, score.label, { fontFamily: FONT, fontSize: '18px', fontStyle: '700', color })
      .setOrigin(0.5).setLetterSpacing(3).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 250 });
  }

  /** Human-readable result lines, from your point of view only. */
  describe(out) {
    const { youId, opp } = this.d;
    const lines = [];
    for (const e of out.effects) {
      if (e.type === 'card-taken') {
        lines.push(e.to === youId ? [`You took their ${cardName(e.card)}`, '#e9e4d6'] : [`${opp.name} took your ${cardName(e.card)}`, '#c9ced8']);
      } else if (e.type === 'draw') lines.push(['Draw. Both cards go back to your hands', '#c9ced8']);
      else if (e.type === 'fake') lines.push(['You are both infected: nobody loses a card.', '#3ee67a'], ['To anyone watching it looked like a real duel.', '#c9ced8']);
      else if (e.type === 'killed' && e.player === youId) lines.push(['YOU WERE SHOT', '#ff4a5a', 22], ['You are out of the match. Your role stays secret.', '#ff6a78']);
      else if (e.type === 'killed') {
        const theyZombie = out.cards[opp.id]?.kind === 'zombie';
        lines.push(theyZombie ? ['ZOMBIE KILLED', '#ff7a3a', 22] : [`You shot ${opp.name}`, '#ff7a3a', 22]);
        lines.push([theyZombie ? 'They played a Zombie card. Everyone heard the shot.' : 'Were they a zombie? Nobody will ever know. Everyone heard it.', '#e9e4d6']);
        lines.push([`You are stunned ${RULES.shotStun / 1000}s.`, '#ffb04a']);
      } else if (e.type === 'cured' && e.player === youId) lines.push(['YOU WERE CURED', '#3e8bff', 22], [`Human again. Gagged ${RULES.gagTime / 1000}s, and you forget the other zombies.`, '#c9ced8']);
      else if (e.type === 'cured') lines.push([`${opp.name} WAS A ZOMBIE: NOW CURED`, '#3e8bff', 20], [e.via === 'held' ? 'Your Cure stopped the bite.' : 'Your Cure worked.', '#c9ced8']);
      else if (e.type === 'cell' && e.player === youId) lines.push([`You go to quarantine for ${RULES.cureQuarantine / 1000}s (gagged, can't move).`, '#ff9a5a']);
      else if (e.type === 'cure-wasted' && e.player === youId) lines.push(['CURE WASTED', '#ff9a5a', 20], [`${opp.name} is human. You lose the duel.`, '#c9ced8']);
      else if (e.type === 'cure-wasted') lines.push([`${opp.name} wasted a Cure on you.`, '#c9ced8']);
      else if (e.type === 'immune') lines.push([e.player === youId ? 'Still recovering from the cure: the bite did nothing.' : `${opp.name} is still recovering: no bite.`, '#c9ced8']);
      else if (e.type === 'bitten' && e.player === youId) lines.push(['YOU WERE BITTEN', '#3ee67a', 22], ['You are a ZOMBIE now. Spread the strain.', '#3ee67a']);
      else if (e.type === 'bitten' && e.by === youId) lines.push([`You bit ${opp.name}`, '#3ee67a', 20], ['They are one of you now.', '#c9ced8']);
      else if (e.type === 'stunned') lines.push([e.player === youId ? `You are stunned for ${RULES.stunTime / 1000} seconds` : `${opp.name} is stunned`, '#ffb04a']);
      else if (e.type === 'clue' && e.to === youId) lines.push([`CLUE: ${e.text}`, '#ffd27a']);
    }
    lines.push([`Duel cooldown ${RULES.duelCooldown / 1000}s`, UI.dim, 12]);
    return lines;
  }

  close() {
    if (this.finished || !this.outcome) return;
    this.finished = true;
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      const done = this.d.onDone;
      const out = this.outcome;
      this.scene.stop();
      done?.(out);
    });
  }
}
