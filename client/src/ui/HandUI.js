import Phaser from 'phaser';
import { FONT, UI, MIN_TEXT } from './HUD.js';
import { cardTexture, cardScale, CARD_W, CARD_H } from './cardArt.js';
import { cardName, isPlayable } from '../../../shared/cards.js';
import { CARD_INFO } from '../../../shared/constants.js';

const BUTTONS_W = 236; // the station + challenge buttons' corner

/** Your cards, fanned along the bottom. Tap (or 1–9) to see what a card does. */
export default class HandUI {
  constructor(scene) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setDepth(50);
    this.cards = [];
    this.selected = -1;

    this.status = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '16px', fontStyle: '700', color: '#ff6a78' })
      .setOrigin(0.5, 1)
      .setLetterSpacing(3);
    this.tipBg = scene.add.graphics();
    this.tipTitle = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '17px', fontStyle: '700', color: '#ffffff' }).setOrigin(0.5, 0).setLetterSpacing(2);
    this.tipText = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: `${MIN_TEXT + 1}px`, fontStyle: '600', color: '#c9ced8', align: 'center', wordWrap: { width: 280 } })
      .setOrigin(0.5, 0);
    this.root.add([this.status, this.tipBg, this.tipTitle, this.tipText]);
    this.hideTip();

    scene.input.keyboard?.on('keydown', (e) => {
      const n = Number(e.key);
      if (this.root.visible && n >= 1 && n <= 9) this.select(n - 1);
    });
    this.layout(scene.scale.width, scene.scale.height);
  }

  /** Height of the area the hand uses at the bottom of the screen. */
  get height() {
    return this.cardH * 0.72 + 30;
  }

  layout(width, height) {
    this.width = width;
    this.screenH = height;
    // phones get bigger cards: they are read at arm's length
    const touch = this.scene.sys.game.device.input.touch;
    this.cardH = touch ? Phaser.Math.Clamp(height * 0.26, 92, 132) : Phaser.Math.Clamp(height * 0.19, 76, 118);
    this.place();
  }

  setHand(hand, exhausted) {
    this.hand = [...hand].sort(order);
    for (const c of this.cards) c.destroy();
    this.cards = this.hand.map((card, i) => {
      const img = this.scene.add.image(0, 0, cardTexture(this.scene, card)).setInteractive({ useHandCursor: true });
      img.on('pointerdown', (p, x, y, e) => {
        e?.stopPropagation();
        this.select(i);
      });
      return img;
    });
    this.root.add(this.cards);
    for (const o of [this.tipBg, this.tipTitle, this.tipText]) this.root.bringToTop(o);
    // the cards speak for themselves: a line only when you have none
    this.status.setText(exhausted || !hand.some(isPlayable) ? 'NO CARDS  ·  FIND A REFILL' : '');
    this.selected = -1;
    this.hideTip();
    this.place();
  }

  place() {
    const n = this.cards.length;
    const scale = cardScale(this.cardH);
    const cw = CARD_W * (this.cardH / CARD_H);
    // keep the fan clear of the round buttons in the bottom-right (station + challenge)
    const right = this.width - BUTTONS_W;
    const fan = Math.min(this.width * 0.62, 640, right - 16);
    const cx = Math.max(16 + fan / 2, Math.min(this.width / 2, right - fan / 2));
    this.centerX = cx;
    const step = Math.min(cw * 0.78, (fan - cw) / Math.max(1, n - 1));
    const baseY = this.screenH - this.cardH * 0.3;
    this.cards.forEach((img, i) => {
      const t = i - (n - 1) / 2;
      const lift = i === this.selected ? this.cardH * 0.3 : 0;
      img.setScale(scale).setPosition(cx + t * step, baseY + Math.abs(t) * 3 - lift).setRotation(t * 0.045);
    });
    this.status.setPosition(cx, baseY - this.cardH * 0.55 - 6);
  }

  select(i) {
    if (!this.hand || i >= this.hand.length) return;
    this.selected = this.selected === i ? -1 : i;
    this.place();
    if (this.selected < 0) return this.hideTip();
    const card = this.hand[i];
    const img = this.cards[i];
    const bullets = card.kind === 'gun' ? `  ·  ${card.bullets} BULLET${card.bullets === 1 ? '' : 'S'}` : '';
    this.tipTitle.setText(card.kind === 'number' ? `NUMBER ${card.value}` : cardName(card).toUpperCase() + bullets);
    this.tipText.setText(CARD_INFO[card.kind].text);
    const y = img.y - this.cardH * 0.62 - this.tipText.height - 34;
    this.tipTitle.setPosition(this.width / 2, y + 8);
    this.tipText.setPosition(this.width / 2, y + 30);
    const w = Math.max(this.tipTitle.width, this.tipText.width) + 32;
    const h = this.tipText.height + 42;
    this.tipBg.clear().fillStyle(UI.panel, 0.95).fillRoundedRect(this.width / 2 - w / 2, y, w, h, 10).lineStyle(1, UI.line, 0.2).strokeRoundedRect(this.width / 2 - w / 2, y, w, h, 10);
    for (const o of [this.tipBg, this.tipTitle, this.tipText]) o.setVisible(true);
    this.status.setVisible(false);
  }

  hideTip() {
    for (const o of [this.tipBg, this.tipTitle, this.tipText]) o.setVisible(false);
    this.status.setVisible(true);
  }

  setVisible(v) {
    this.root.setVisible(v);
  }
}

/** Show special cards first, then numbers from high to low. */
const RANK = { zombie: 0, gun: 1, cure: 2, number: 3 };
function order(a, b) {
  return RANK[a.kind] - RANK[b.kind] || (b.value ?? 0) - (a.value ?? 0);
}
