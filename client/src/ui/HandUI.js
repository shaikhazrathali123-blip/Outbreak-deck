import Phaser from 'phaser';
import { FONT, UI } from './HUD.js';
import { cardTexture, cardScale, CARD_W, CARD_H } from './cardArt.js';
import { cardName, isPlayable } from '../../../shared/cards.js';
import { USABLE } from '../../../shared/match.js';
import { SPECIAL_CARDS, INFECTED_CARDS, SUITS } from '../../../shared/constants.js';

function describe(card) {
  if (card.kind === 'number') {
    const s = SUITS[card.suit];
    return `Duel card. Strong against ${SUITS[s.beats].name} (+3).`;
  }
  const info = card.kind === 'special' ? SPECIAL_CARDS[card.type] : INFECTED_CARDS[card.type];
  if (card.type === 'flare') return `${info.text} (Lights Out arrives in a later update.)`;
  if (USABLE[card.type]?.target) return `${info.text} Works on the nearest player.`;
  return info.text;
}

/** Your cards, fanned along the bottom. Tap (or 1–9) to inspect; USE (or U) for special cards. */
export default class HandUI {
  constructor(scene, { onUse } = {}) {
    this.scene = scene;
    this.onUse = onUse;
    this.root = scene.add.container(0, 0).setDepth(50);
    this.cards = [];
    this.selected = -1;

    this.status = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color: UI.dim })
      .setOrigin(0.5, 1)
      .setLetterSpacing(3);
    this.tipBg = scene.add.graphics();
    this.tipTitle = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: '#ffffff' }).setOrigin(0.5, 0).setLetterSpacing(2);
    this.tipText = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '13px', fontStyle: '500', color: '#c9ced8', align: 'center', wordWrap: { width: 260 } })
      .setOrigin(0.5, 0);
    this.useBg = scene.add.graphics();
    this.useText = scene.add.text(0, 0, 'USE CARD  ·  U', { fontFamily: FONT, fontSize: '13px', fontStyle: '700', color: '#0a0b10' }).setOrigin(0.5).setLetterSpacing(2);
    this.useZone = scene.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
    this.useZone.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      this.useSelected();
    });
    this.root.add([this.status, this.tipBg, this.tipTitle, this.tipText, this.useBg, this.useText, this.useZone]);
    this.hideTip();

    scene.input.keyboard?.on('keydown', (e) => {
      if (!this.root.visible) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9) this.select(n - 1);
      if (e.key === 'u' || e.key === 'U') this.useSelected();
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
    this.cardH = Phaser.Math.Clamp(height * 0.19, 70, 118);
    this.place();
  }

  setHand(hand, exhausted) {
    const keep = this.selected >= 0 ? this.hand?.[this.selected]?.id : null;
    this.hand = hand;
    for (const c of this.cards) c.destroy();
    this.cards = hand.map((card, i) => {
      const img = this.scene.add.image(0, 0, cardTexture(this.scene, card)).setInteractive({ useHandCursor: true });
      img.on('pointerdown', (p, x, y, e) => {
        e?.stopPropagation();
        this.select(i);
      });
      if (!isPlayable(card) && !USABLE[card.type]) img.setTint(0xb8b8b8);
      return img;
    });
    this.root.add(this.cards);
    for (const o of [this.tipBg, this.tipTitle, this.tipText, this.useBg, this.useText, this.useZone]) this.root.bringToTop(o);
    const playable = hand.filter(isPlayable).length;
    this.status
      .setText(exhausted ? 'NO DUEL CARDS  ·  FIND A CARD REFILL' : `${hand.length} CARDS  ·  ${playable} FOR DUELS`)
      .setColor(exhausted ? '#ff6a78' : UI.dim);
    this.selected = -1;
    this.hideTip();
    this.place();
    const again = hand.findIndex((c) => c.id === keep);
    if (again >= 0) this.select(again);
  }

  place() {
    const n = this.cards.length;
    const scale = cardScale(this.cardH);
    const cw = CARD_W * (this.cardH / CARD_H);
    const step = Math.min(cw * 0.78, (Math.min(this.width * 0.62, 640) - cw) / Math.max(1, n - 1));
    const baseY = this.screenH - this.cardH * 0.3;
    this.cards.forEach((img, i) => {
      const t = i - (n - 1) / 2;
      const lift = i === this.selected ? this.cardH * 0.3 : 0;
      img.setScale(scale).setPosition(this.width / 2 + t * step, baseY + Math.abs(t) * 3 - lift).setRotation(t * 0.045);
    });
    this.status.setPosition(this.width / 2, baseY - this.cardH * 0.55 - 6);
  }

  select(i) {
    if (!this.hand || i >= this.hand.length) return;
    this.selected = this.selected === i ? -1 : i;
    this.place();
    if (this.selected < 0) return this.hideTip();
    const card = this.hand[i];
    const img = this.cards[i];
    const usable = !!USABLE[card.type];
    this.tipTitle.setText(cardName(card).toUpperCase());
    this.tipText.setText(describe(card));
    const extra = usable ? 40 : 0;
    const y = img.y - this.cardH * 0.62 - this.tipText.height - 34 - extra;
    this.tipTitle.setPosition(this.width / 2, y + 8);
    this.tipText.setPosition(this.width / 2, y + 30);
    const w = Math.max(this.tipTitle.width, this.tipText.width, usable ? 150 : 0) + 32;
    const h = this.tipText.height + 42 + extra;
    this.tipBg.clear().fillStyle(UI.panel, 0.95).fillRoundedRect(this.width / 2 - w / 2, y, w, h, 10).lineStyle(1, UI.line, 0.2).strokeRoundedRect(this.width / 2 - w / 2, y, w, h, 10);
    for (const o of [this.tipBg, this.tipTitle, this.tipText]) o.setVisible(true);
    if (usable) {
      const by = y + h - 24;
      this.useBg.clear().fillStyle(0xf2b84a, 1).fillRoundedRect(this.width / 2 - 75, by - 14, 150, 28, 14);
      this.useText.setPosition(this.width / 2, by);
      this.useZone.setPosition(this.width / 2, by).setSize(150, 28);
      this.useZone.input.hitArea.setTo(0, 0, 150, 28);
    }
    for (const o of [this.useBg, this.useText, this.useZone]) o.setVisible(usable);
    this.useZone.input.enabled = usable;
    this.status.setVisible(false);
  }

  useSelected() {
    const card = this.hand?.[this.selected];
    if (card && USABLE[card.type]) this.onUse?.(card.id);
  }

  hideTip() {
    for (const o of [this.tipBg, this.tipTitle, this.tipText, this.useBg, this.useText, this.useZone]) o.setVisible(false);
    if (this.useZone.input) this.useZone.input.enabled = false;
    this.status.setVisible(true);
  }

  setVisible(v) {
    this.root.setVisible(v);
  }
}
