// Secret score: card points in hand + banked points (GAME_GUIDE "Points").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberCard, zombieCard, gunCard, cureCard } from '../shared/cards.js';
import { Match } from '../shared/match.js';
import { POINTS, lobbyRules } from '../shared/constants.js';

const make = (roles) =>
  new Match({ seed: 5, players: roles.map((role, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, color: '#fff', role })) });
const hand = (m, id, cards) => {
  m.get(id).hand = cards;
  return cards;
};

test('card points: a number is worth its number, Gun 10 per bullet, Cure 30, Zombie 0', () => {
  const m = make(['human', 'infected']);
  hand(m, 'p1', [numberCard(7), numberCard(4), numberCard(2), gunCard()]);
  assert.equal(m.score('p1'), 33);
  hand(m, 'p1', [cureCard(), numberCard(1)]);
  assert.equal(m.score('p1'), 31);
  hand(m, 'p2', [zombieCard(), numberCard(5)]);
  assert.equal(m.score('p2'), 5);
  hand(m, 'p1', [gunCard(1)]);
  assert.equal(m.score('p1'), 10);
});

test('winning a number duel takes their card, and their points', () => {
  const m = make(['human', 'human']);
  const [a] = hand(m, 'p1', [numberCard(8)]);
  const [b] = hand(m, 'p2', [numberCard(6), numberCard(1)]);
  m.settleDuel('p1', 'p2', a.id, b.id, 0);
  assert.deepEqual([m.score('p1'), m.score('p2')], [14 + POINTS.numberWin, 1], '+5 for winning a number duel (v3)');
});

test('Gun shot on a zombie: +40 (the spent bullet is banked back)', () => {
  const m = make(['human', 'infected']);
  const [g] = hand(m, 'p1', [gunCard(), numberCard(3)]);
  const [n] = hand(m, 'p2', [numberCard(9)]);
  const before = m.score('p1');
  const out = m.settleDuel('p1', 'p2', g.id, n.id, 0);
  assert.equal(m.score('p1'), before + POINTS.shotZombie);
  assert.ok(out.effects.some((e) => e.type === 'points' && e.reason === 'shot-zombie' && e.amount === 40));
});

test('Gun shot on a human: -20 (the bullet is lost and -10)', () => {
  const m = make(['human', 'human']);
  const [g] = hand(m, 'p1', [gunCard()]);
  const [n] = hand(m, 'p2', [numberCard(2)]);
  m.settleDuel('p1', 'p2', g.id, n.id, 0);
  assert.equal(m.score('p1'), 20 - 20);
});

test('the last bullet on a zombie still pays +40', () => {
  const m = make(['human', 'infected']);
  const [g] = hand(m, 'p1', [gunCard(1)]);
  const [n] = hand(m, 'p2', [numberCard(4)]);
  m.settleDuel('p1', 'p2', g.id, n.id, 0);
  assert.equal(m.score('p1'), 10 + POINTS.shotZombie); // 1 bullet (10) -> empty Gun gone, 10 banked back + 40
});

test('two zombie shots: +40 each, and every shot shows +40', () => {
  const m = make(['human', 'infected', 'infected']);
  const [g] = hand(m, 'p1', [gunCard(), numberCard(7), numberCard(4), numberCard(2)]);
  assert.equal(m.score('p1'), 33);
  const [a] = hand(m, 'p2', [numberCard(5)]);
  const first = m.settleDuel('p1', 'p2', g.id, a.id, 0);
  assert.equal(m.score('p1'), 73);
  const [b] = hand(m, 'p3', [numberCard(5)]);
  m.get('p1').stunnedUntil = 0;
  m.get('p1').cooldownUntil = 0;
  const second = m.settleDuel('p1', 'p3', g.id, b.id, 0);
  assert.equal(m.score('p1'), 113);
  for (const out of [first, second]) assert.ok(out.effects.some((e) => e.type === 'points' && e.player === 'p1' && e.amount === 40));
});

test('a shot player keeps the score they had', () => {
  const m = make(['human', 'infected']);
  const [g] = hand(m, 'p1', [gunCard()]);
  const [n] = hand(m, 'p2', [numberCard(9), numberCard(6)]);
  m.settleDuel('p1', 'p2', g.id, n.id, 0);
  assert.equal(m.score('p2'), 6); // the 9 they played is gone; the 6 still counts
  m.get('p2').hand.push(numberCard(9)); // nothing changes a frozen score
  assert.equal(m.score('p2'), 6);
});

test('a bite banks +15 for the zombie', () => {
  const m = make(['infected', 'human']);
  const z = m.firstOf('p1', 'zombie');
  hand(m, 'p1', [z, numberCard(2)]);
  const [n] = hand(m, 'p2', [numberCard(9)]);
  m.settleDuel('p1', 'p2', z.id, n.id, 0);
  assert.equal(m.get('p2').role, 'infected');
  assert.equal(m.score('p1'), 2 + POINTS.bite);
});

test('curing a zombie costs the Cure user 30 in total', () => {
  const m = make(['human', 'infected']);
  const [cure] = hand(m, 'p1', [cureCard(), numberCard(5)]);
  const z = m.firstOf('p2', 'zombie');
  const before = m.score('p1');
  m.settleDuel('p1', 'p2', cure.id, z.id, 0);
  assert.equal(m.get('p2').role, 'human');
  assert.equal(m.score('p1'), before - 30);
});

test('wasting a Cure on a human costs 40 in total', () => {
  const m = make(['human', 'human']);
  const [cure] = hand(m, 'p1', [cureCard(), numberCard(5)]);
  const [n] = hand(m, 'p2', [numberCard(3)]);
  const before = m.score('p1');
  const out = m.settleDuel('p1', 'p2', cure.id, n.id, 0);
  assert.equal(m.score('p1'), before - 40);
  assert.ok(out.effects.some((e) => e.type === 'points' && e.reason === 'cure-wasted'));
});

test('a voted-out player keeps their score; the ranking puts the highest first', () => {
  const m = make(['human', 'human', 'infected']);
  hand(m, 'p1', [numberCard(9)]);
  hand(m, 'p2', [gunCard(), numberCard(1)]);
  hand(m, 'p3', [numberCard(4)]);
  m.quarantine('p3');
  m.get('p3').hand.push(numberCard(9)); // can't change a frozen score
  assert.equal(m.score('p3'), 4);
  assert.deepEqual(m.ranking().map((r) => r.id), ['p2', 'p1', 'p3']);
});

test('time bonus: +10 for every full minute in your role', () => {
  const m = make(['human', 'infected']);
  hand(m, 'p1', [numberCard(3)]);
  hand(m, 'p2', []);
  m.tick(59_000);
  assert.equal(m.score('p1'), 3);
  m.tick(60_000);
  assert.deepEqual([m.score('p1'), m.score('p2')], [13, 10]);
  m.tick(185_000);
  assert.equal(m.timeBonus('p1'), 30);
});

test('time bonus: lost when a human is bitten, then counts again as a zombie', () => {
  const m = make(['infected', 'human']);
  m.tick(150_000); // both have 2 minutes = +20
  const z = m.firstOf('p1', 'zombie');
  hand(m, 'p1', [z]);
  const [n] = hand(m, 'p2', [numberCard(4)]);
  assert.equal(m.timeBonus('p2'), 20);
  m.settleDuel('p1', 'p2', z.id, n.id, 150_000);
  assert.equal(m.timeBonus('p2'), 0);
  m.tick(210_000);
  assert.equal(m.timeBonus('p2'), 10);
});

test('time bonus: lost when a zombie is cured', () => {
  const m = make(['human', 'infected']);
  m.tick(130_000);
  const [cure] = hand(m, 'p1', [cureCard()]);
  const z = m.firstOf('p2', 'zombie');
  assert.equal(m.timeBonus('p2'), 20);
  m.settleDuel('p1', 'p2', cure.id, z.id, 130_000);
  assert.equal(m.get('p2').role, 'human');
  assert.equal(m.timeBonus('p2'), 0);
});

test('time bonus: meetings pause it, and a shot player keeps theirs', () => {
  const m = make(['human', 'infected', 'human']);
  hand(m, 'p2', [numberCard(1)]);
  m.tick(50_000);
  m.shiftTimers(50_000, 30_000); // a 30s meeting
  m.tick(85_000); // 55s of match time since the start
  assert.equal(m.timeBonus('p1'), 0);
  m.tick(110_000);
  assert.equal(m.timeBonus('p1'), 10);
  const [g] = hand(m, 'p3', [gunCard()]);
  const [n] = hand(m, 'p2', [numberCard(5), numberCard(2)]);
  m.settleDuel('p3', 'p2', g.id, n.id, 110_000);
  m.tick(400_000);
  assert.equal(m.score('p2'), 2 + 10); // frozen at the shot
});

test('the score breakdown adds up, and freezes with the score', () => {
  const m = make(['human', 'infected', 'infected']);
  const [g] = hand(m, 'p1', [gunCard(), numberCard(6)]);
  const [n] = hand(m, 'p2', [numberCard(3), numberCard(2)]);
  m.tick(70_000);
  m.settleDuel('p1', 'p2', g.id, n.id, 70_000);
  const parts = m.scoreParts('p1');
  assert.deepEqual(parts.earned['shot-zombie'], { count: 1, points: 50 });
  assert.equal(parts.total, m.score('p1'));
  assert.equal(parts.total, parts.cards + parts.timeBonus + 50);
  const dead = m.scoreParts('p2');
  assert.equal(dead.total, m.score('p2'));
  assert.equal(m.get('p2').shotBy, 'p1');
  m.tick(300_000);
  assert.equal(m.scoreParts('p2').timeBonus, dead.timeBonus); // frozen
});

test('lobbyRules().startGunShare of the humans (rounded) start with a Gun, nobody else does', () => {
  for (const [humans, zombies] of [[5, 1], [7, 1], [10, 2], [12, 3]]) {
    const armed = Math.round(humans * lobbyRules(humans + zombies).startGunShare);
    for (const seed of [1, 2, 3]) {
      const roles = [...Array(humans).fill('human'), ...Array(zombies).fill('infected')];
      const m = new Match({ seed, players: roles.map((role, i) => ({ id: `p${i}`, name: `P${i}`, color: '#fff', role })) });
      const withGun = m.list().filter((p) => p.hand.some((c) => c.kind === 'gun'));
      assert.equal(withGun.length, armed);
      assert.ok(withGun.every((p) => p.role === 'human' && p.hand.length === 7));
      assert.ok(m.list().every((p) => p.hand.filter((c) => c.kind !== 'zombie').length === 7));
    }
  }
});
