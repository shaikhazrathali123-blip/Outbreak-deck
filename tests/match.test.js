import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../shared/match.js';
import { numberCard, specialCard, isPlayable } from '../shared/cards.js';
import { RULES } from '../shared/constants.js';

const make = (roles = ['human', 'human']) =>
  new Match({
    seed: 42,
    players: roles.map((role, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, color: '#fff', role })),
  });

/** Give a player an exact hand. */
const hand = (m, id, cards) => {
  m.get(id).hand = cards;
  return cards;
};

test('everyone is dealt 7 cards; the infected also get an infected-only card', () => {
  const m = make(['human', 'infected']);
  assert.equal(m.get('p1').hand.length, 7);
  assert.equal(m.get('p2').hand.length, 8);
  assert.equal(m.get('p2').hand.filter((c) => c.kind === 'infected').length, 1);
});

test('human vs human: winner takes the loser\'s card, both get a cooldown', () => {
  const m = make();
  const [a] = hand(m, 'p1', [numberCard('blade', 9), numberCard('mind', 2)]);
  const [b] = hand(m, 'p2', [numberCard('toxin', 4), numberCard('mind', 1)]);
  const out = m.settleDuel('p1', 'p2', a.id, b.id, 1000);
  assert.equal(out.winnerId, 'p1');
  assert.equal(m.get('p1').hand.length, 3);
  assert.equal(m.get('p2').hand.length, 1);
  assert.equal(m.get('p1').cooldownUntil, 1000 + RULES.duelCooldown);
  assert.equal(m.canChallenge('p1', 'p2', 5000).reason, 'cooldown');
  assert.ok(m.canChallenge('p1', 'p2', 1000 + RULES.duelCooldown).ok);
});

test('a draw returns both cards', () => {
  const m = make();
  const [a] = hand(m, 'p1', [numberCard('blade', 6)]);
  const [b] = hand(m, 'p2', [numberCard('toxin', 6)]);
  const out = m.settleDuel('p1', 'p2', a.id, b.id, 0);
  assert.equal(out.winnerId, null);
  assert.deepEqual([m.get('p1').hand.length, m.get('p2').hand.length], [1, 1]);
});

test('infected winner infects a human without a vaccine', () => {
  const m = make(['infected', 'human']);
  const [a] = hand(m, 'p1', [numberCard('blade', 10)]);
  const [b] = hand(m, 'p2', [numberCard('blade', 2), numberCard('mind', 3)]);
  const out = m.settleDuel('p1', 'p2', a.id, b.id, 0);
  assert.equal(m.get('p2').role, 'infected');
  assert.ok(out.effects.some((e) => e.type === 'infected' && e.player === 'p2'));
  assert.ok(m.get('p2').hand.some((c) => c.kind === 'infected'));
});

test('a vaccine blocks the infection and is used up', () => {
  const m = make(['infected', 'human']);
  const [a] = hand(m, 'p1', [numberCard('blade', 10)]);
  const [b] = hand(m, 'p2', [numberCard('blade', 2), specialCard('vaccine'), numberCard('mind', 3)]);
  const out = m.settleDuel('p1', 'p2', a.id, b.id, 0);
  assert.equal(m.get('p2').role, 'human');
  assert.ok(out.effects.some((e) => e.type === 'vaccine'));
  assert.ok(!m.get('p2').hand.some((c) => c.type === 'vaccine'));
});

test('human beating an infected: genuine clue + 15s stun', () => {
  const m = make(['human', 'infected']);
  const [a] = hand(m, 'p1', [numberCard('mind', 10)]);
  const [b] = hand(m, 'p2', [numberCard('mind', 1), numberCard('toxin', 5)]);
  const out = m.settleDuel('p1', 'p2', a.id, b.id, 100);
  const clue = out.effects.find((e) => e.type === 'clue');
  assert.ok(clue && clue.genuine && clue.to === 'p1' && clue.about === 'p2');
  assert.equal(m.get('p2').stunnedUntil, 100 + RULES.stunTime);
  assert.equal(m.canChallenge('p1', 'p2', 200 + RULES.duelCooldown).reason, 'target-stunned');
});

test('infected players cannot duel each other', () => {
  const m = make(['infected', 'infected']);
  assert.equal(m.canChallenge('p1', 'p2', 0).reason, 'ally');
});

test('exhausted (no playable card) blocks challenges; refill fixes it', () => {
  const m = make();
  hand(m, 'p1', [specialCard('vaccine')]);
  assert.ok(m.isExhausted('p1'));
  assert.equal(m.canChallenge('p1', 'p2', 0).reason, 'exhausted');
  assert.equal(m.canChallenge('p2', 'p1', 0).reason, 'target-exhausted');
  m.refill('p1');
  assert.ok(m.get('p1').hand.length >= RULES.refillTo);
  assert.ok(m.get('p1').hand.some(isPlayable));
  assert.ok(m.get('p1').hand.some((c) => c.type === 'vaccine'), 'keeps the vaccine');
});

test('declining costs one random card', () => {
  const m = make();
  const before = m.get('p2').hand.length;
  assert.ok(m.decline('p2'));
  assert.equal(m.get('p2').hand.length, before - 1);
});

test('the deck reshuffles the discard pile when it runs out', () => {
  const m = make();
  m.discard.push(...m.deck.splice(0));
  assert.equal(m.draw(3).length, 3);
});
