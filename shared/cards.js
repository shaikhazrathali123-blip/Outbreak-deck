// Cards and decks. Pure functions, shared by the client and (later) the server.
// Four kinds only: number (1–9), zombie, gun, cure. See CARD_INFO in constants.js.
import { RULES, CARD_INFO } from './constants.js';

/** Small seeded random generator, so matches and tests are reproducible. */
export function createRng(seed = Date.now()) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let nextId = 1;
const newId = () => `c${nextId++}`;

export const numberCard = (value) => ({ id: newId(), kind: 'number', value });
export const zombieCard = () => ({ id: newId(), kind: 'zombie' });
export const gunCard = (bullets = RULES.gunBullets) => ({ id: newId(), kind: 'gun', bullets });
export const cureCard = () => ({ id: newId(), kind: 'cure' });

/**
 * A deck: four of every number 1–9, plus a few Guns and Cures, repeated
 * `copies` times so big matches never run dry. Zombie cards are never in
 * the deck: only infected players grow them.
 */
export function createDeck(rng, copies = 1) {
  const cards = [];
  for (let c = 0; c < copies; c++) {
    for (let v = 1; v <= 9; v++) for (let k = 0; k < 4; k++) cards.push(numberCard(v));
    for (let k = 0; k < RULES.deckGuns; k++) cards.push(gunCard());
    for (let k = 0; k < RULES.deckCures; k++) cards.push(cureCard());
  }
  return shuffle(cards, rng);
}

/** How many deck copies a match needs (7 cards each plus plenty to refill from). */
export const decksFor = (players) => Math.max(1, Math.ceil((players * 7 * 2) / 42));

/** Can this card be played in a duel? Every kind can (a Cure only works when played on a zombie). */
export const isPlayable = (card) => !!card;

/** Guns and Cures are humans-only. */
export const isHumanOnly = (card) => card.kind === 'gun' || card.kind === 'cure';

export function cardName(card) {
  return card.kind === 'number' ? `${card.value}` : CARD_INFO[card.kind].name;
}
