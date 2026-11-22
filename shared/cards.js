// Cards and decks. Pure functions, shared by the client and (later) the server.
import { SUITS, SPECIAL_CARDS, INFECTED_CARDS } from './constants.js';

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

export const numberCard = (suit, value) => ({ id: newId(), kind: 'number', suit, value });
export const specialCard = (type) => ({ id: newId(), kind: 'special', type });
export const infectedCard = (type) => ({ id: newId(), kind: 'infected', type });

/**
 * A deck: every suit 1–10 plus one of each special card (~1 in 7), repeated
 * `copies` times so big matches never run dry.
 */
export function createDeck(rng, copies = 1) {
  const cards = [];
  for (let c = 0; c < copies; c++) {
    for (const suit of Object.keys(SUITS)) for (let v = 1; v <= 10; v++) cards.push(numberCard(suit, v));
    for (const type of Object.keys(SPECIAL_CARDS)) cards.push(specialCard(type));
  }
  return shuffle(cards, rng);
}

/** How many deck copies a match needs (7 cards each plus plenty to refill from). */
export const decksFor = (players) => Math.max(1, Math.ceil((players * 7 * 2) / 47));

/** Can this card be played in a High Card duel? */
export const isPlayable = (card) => card.kind === 'number' || (card.kind === 'special' && card.type === 'wild');

export const randomInfectedCard = (rng) => {
  const types = Object.keys(INFECTED_CARDS);
  return infectedCard(types[Math.floor(rng() * types.length)]);
};

export function cardName(card) {
  if (card.kind === 'number') return `${SUITS[card.suit].name} ${card.value}`;
  if (card.kind === 'special') return SPECIAL_CARDS[card.type].name;
  return INFECTED_CARDS[card.type].name;
}
