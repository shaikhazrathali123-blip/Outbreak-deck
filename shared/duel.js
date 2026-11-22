// Duel maths. Pure functions, shared by the client and (later) the server.
import { SUITS, RULES } from './constants.js';

/** True if suit `a` is strong against suit `b`. */
export const suitBeats = (a, b) => SUITS[a]?.beats === b;

/**
 * Value of `card` when played against `other` in High Card.
 * Number cards get +3 when their suit is strong against the other suit.
 * Wild counts as value 8 in the best suit, so it gets +3 against any number card.
 */
export function scoreCard(card, other) {
  if (card.kind === 'special' && card.type === 'wild') {
    const bonus = other.kind === 'number' ? RULES.suitBonus : 0;
    return { base: RULES.wildValue, bonus, total: RULES.wildValue + bonus };
  }
  if (card.kind !== 'number') throw new Error(`Card ${card.id} can't be played in a duel`);
  const bonus = other.kind === 'number' && suitBeats(card.suit, other.suit) ? RULES.suitBonus : 0;
  return { base: card.value, bonus, total: card.value + bonus };
}

/** High Card: both cards are revealed, highest total wins. winner is 'a', 'b' or null (draw). */
export function resolveHighCard(cardA, cardB) {
  const a = scoreCard(cardA, cardB);
  const b = scoreCard(cardB, cardA);
  const winner = a.total > b.total ? 'a' : b.total > a.total ? 'b' : null;
  return { winner, a, b };
}
