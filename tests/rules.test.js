// Rules for the simple card set (numbers 1–9, Zombie, Gun, Cure) and the
// mind-game rules: incubation, Blood Test + Clean badge, hunger, public
// misfires, fake duels between infected, meetings and votes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberCard, zombieCard, gunCard, cureCard, createDeck, createRng, isPlayable } from '../shared/cards.js';
import { resolveDuel } from '../shared/duel.js';
import { Match, assignRoles, tallyVotes } from '../shared/match.js';
import { RULES } from '../shared/constants.js';

const make = (roles) =>
  new Match({ seed: 3, players: roles.map((role, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, color: '#fff', role })) });
const hand = (m, id, cards) => {
  m.get(id).hand = cards;
  return cards;
};

// ------------------------------------------------------------------ cards
test('deck: four of each number 1–9 plus Guns and Cures, no Zombies', () => {
  const deck = createDeck(createRng(1));
  const count = (k) => deck.filter((c) => c.kind === k).length;
  assert.equal(count('number'), 36);
  assert.equal(count('gun'), RULES.deckGuns);
  assert.equal(count('cure'), RULES.deckCures);
  assert.equal(count('zombie'), 0);
  assert.ok(deck.every((c) => c.kind !== 'number' || (c.value >= 1 && c.value <= 9)));
});

test('Cure is not a duel card; everything else is', () => {
  assert.ok(isPlayable(numberCard(3)) && isPlayable(zombieCard()) && isPlayable(gunCard()));
  assert.ok(!isPlayable(cureCard()));
});

// ------------------------------------------------------------------ duel table
test('numbers: higher wins, equal is a draw', () => {
  assert.equal(resolveDuel(numberCard(7), numberCard(3)).winner, 'a');
  assert.equal(resolveDuel(numberCard(2), numberCard(9)).winner, 'b');
  assert.equal(resolveDuel(numberCard(5), numberCard(5)).kind, 'draw');
});

test('Zombie beats any number, even a 9', () => {
  const r = resolveDuel(zombieCard(), numberCard(9));
  assert.deepEqual([r.winner, r.kind], ['a', 'infect']);
});

test('Gun kills a Zombie; against a number it misfires', () => {
  assert.deepEqual(Object.values(resolveDuel(gunCard(), zombieCard())).slice(0, 2), ['a', 'kill']);
  assert.deepEqual(Object.values(resolveDuel(numberCard(1), gunCard())).slice(0, 2), ['a', 'misfire']);
  assert.equal(resolveDuel(gunCard(), gunCard()).kind, 'draw');
});

// ------------------------------------------------------------------ match
test('roles: 1 / 2 / 3 infected by lobby size', () => {
  const count = (n) => Object.values(assignRoles(Array.from({ length: n }, (_, i) => `p${i}`), createRng(n))).filter((r) => r === 'infected').length;
  assert.deepEqual([count(6), count(8), count(9), count(12), count(13), count(15)], [1, 1, 2, 2, 3, 3]);
});

test('infected start with Zombie cards; humans never get them', () => {
  const m = make(['infected', 'human']);
  assert.equal(m.zombieCount(m.get('p1')), RULES.zombieStart);
  assert.equal(m.zombieCount(m.get('p2')), 0);
});

test('Zombie cards regrow over time, up to the max', () => {
  const m = make(['infected', 'human']);
  const p = m.get('p1');
  p.hand = p.hand.filter((c) => c.kind !== 'zombie');
  const grew = (t) => m.tick(t).filter((e) => e.type === 'zombie-grew').map((e) => e.player);
  assert.deepEqual(grew(RULES.zombieRegen - 1), []);
  assert.deepEqual(grew(RULES.zombieRegen), ['p1']);
  for (let t = 2; t < 6; t++) m.tick(RULES.zombieRegen * t);
  assert.equal(m.zombieCount(p), RULES.zombieMax);
});

test("number duel: winner takes the loser's card; both get a cooldown", () => {
  const m = make(['human', 'human']);
  const [a] = hand(m, 'p1', [numberCard(8), numberCard(2)]);
  const [b] = hand(m, 'p2', [numberCard(4), numberCard(1)]);
  const out = m.settleDuel('p1', 'p2', a.id, b.id, 1000);
  assert.equal(out.winnerId, 'p1');
  assert.deepEqual([m.get('p1').hand.length, m.get('p2').hand.length], [3, 1]);
  assert.equal(m.canChallenge('p1', 'p2', 2000).reason, 'cooldown');
});

// ------------------------------------------------------------------ incubation
test('Zombie card bites a human: they turn only after the incubation', () => {
  const m = make(['infected', 'human', 'human']);
  const z = m.firstOf('p1', 'zombie');
  const [b] = hand(m, 'p2', [numberCard(9)]);
  const out = m.settleDuel('p1', 'p2', z.id, b.id, 0);
  assert.ok(out.effects.some((e) => e.type === 'bitten' && e.turnsAt === RULES.incubation));
  assert.equal(m.get('p2').role, 'human', 'still human while incubating');
  assert.ok(m.isBitten('p2'));
  assert.equal(m.zombieCount(m.get('p1')), RULES.zombieStart - 1);
  assert.ok(m.get('p2').hand.includes(b), 'the human keeps their number card');
  assert.equal(m.get('p1').stats.infections, 1);
  assert.ok(!m.tick(RULES.incubation - 1).some((e) => e.type === 'turned'));
  assert.ok(m.tick(RULES.incubation).some((e) => e.type === 'turned' && e.player === 'p2'));
  assert.equal(m.get('p2').role, 'infected');
  assert.equal(m.zombieCount(m.get('p2')), 1, 'the newly turned grow a Zombie card');
});

test('a Cure card in hand blocks the bite and is used up', () => {
  const m = make(['infected', 'human']);
  const z = m.firstOf('p1', 'zombie');
  const [b] = hand(m, 'p2', [numberCard(5), cureCard()]);
  const out = m.settleDuel('p1', 'p2', z.id, b.id, 0);
  assert.ok(out.effects.some((e) => e.type === 'cured'));
  assert.ok(!m.isBitten('p2') && m.get('p2').role === 'human');
  assert.ok(!m.get('p2').hand.some((c) => c.kind === 'cure'));
});

test('a bitten player is saved by the Cure Lab machine, which then recharges', () => {
  const m = make(['infected', 'human', 'human']);
  m.bite(m.get('p2'), m.get('p1'), 0);
  m.bite(m.get('p3'), m.get('p1'), 0);
  assert.equal(m.useCureStation('p2', 1000).cured, true);
  assert.ok(!m.isBitten('p2'));
  assert.equal(m.useCureStation('p3', 2000).reason, 'recharging');
  assert.equal(m.useCureStation('p3', 1000 + RULES.cureStationRecharge).cured, true);
  assert.equal(m.useCureStation('p1', 999999).reason, 'too-late');
});

test('a bitten player who picks up a Cure card is cured automatically', () => {
  const m = make(['infected', 'human']);
  m.bite(m.get('p2'), m.get('p1'), 0);
  hand(m, 'p2', [numberCard(3), cureCard()]);
  assert.ok(m.tick(10).some((e) => e.type === 'cured' && e.player === 'p2'));
  assert.ok(!m.isBitten('p2') && m.get('p2').role === 'human');
});

test('a Zombie card on someone already bitten does nothing more', () => {
  const m = make(['infected', 'human']);
  m.bite(m.get('p2'), m.get('p1'), 0);
  const z = m.firstOf('p1', 'zombie');
  const [b] = hand(m, 'p2', [numberCard(2), cureCard()]);
  const out = m.settleDuel('p1', 'p2', z.id, b.id, 100);
  assert.ok(out.effects.some((e) => e.type === 'already-bitten'));
  assert.ok(m.get('p2').hand.some((c) => c.kind === 'cure'), 'the Cure is not wasted');
});

test('bitten humans still count as human: the last human bitten is not yet a loss', () => {
  const m = make(['infected', 'human']);
  hand(m, 'p2', [numberCard(4)]);
  m.bite(m.get('p2'), m.get('p1'), 0);
  assert.equal(m.winner(), null);
  assert.equal(m.timeUpWinner(), 'infected', 'at 0:00 a bitten human does not save the team');
  m.tick(RULES.incubation);
  assert.equal(m.winner(), 'infected');
});

test('all infected shot, but someone is still bitten: the match goes on', () => {
  const m = make(['infected', 'human', 'human']);
  m.bite(m.get('p2'), m.get('p1'), 0);
  m.kill(m.get('p1'), m.get('p3'));
  assert.equal(m.winner(), null);
  m.useCureStation('p2', 10);
  assert.equal(m.winner(), 'humans');
});

// ------------------------------------------------------------------ blood test
test('Blood Test: clean gives a 60s badge, bitten and infected test positive', () => {
  const m = make(['infected', 'human', 'human']);
  assert.equal(m.bloodTest('p2', 1000).positive, false);
  assert.ok(m.hasBadge('p2', 1000 + RULES.cleanBadge - 1));
  assert.ok(!m.hasBadge('p2', 1000 + RULES.cleanBadge));
  assert.equal(m.bloodTest('p1', 0).positive, true);
  m.bite(m.get('p3'), m.get('p1'), 0);
  assert.equal(m.bloodTest('p3', 0).positive, true);
});

test('the badge does not vanish when its owner is bitten later', () => {
  const m = make(['infected', 'human']);
  m.bloodTest('p2', 0);
  m.bite(m.get('p2'), m.get('p1'), 100);
  assert.ok(m.hasBadge('p2', 200));
});

// ------------------------------------------------------------------ hunger
test('hunger: an infected who does not bite starts starving; a bite feeds them', () => {
  const m = make(['infected', 'human', 'human']);
  assert.ok(!m.isStarving('p1', RULES.hunger - 1));
  assert.ok(m.tick(RULES.hunger).some((e) => e.type === 'starving' && e.player === 'p1'));
  assert.ok(m.tick(RULES.hunger + RULES.growlEvery).some((e) => e.type === 'growl'));
  m.bite(m.get('p2'), m.get('p1'), RULES.hunger + 1000);
  assert.ok(!m.isStarving('p1', RULES.hunger + 2000));
});

// ------------------------------------------------------------------ guns
test('Gun vs Zombie kills the infected player; killing all infected wins for humans', () => {
  const m = make(['infected', 'human', 'human']);
  const z = m.firstOf('p1', 'zombie');
  const [g] = hand(m, 'p2', [gunCard()]);
  const out = m.settleDuel('p2', 'p1', g.id, z.id, 0);
  assert.equal(m.get('p1').alive, false);
  assert.ok(out.effects.some((e) => e.type === 'killed' && e.player === 'p1'));
  assert.equal(m.get('p2').stats.kills, 1);
  assert.equal(m.winner(), 'humans');
  assert.equal(m.canChallenge('p3', 'p1', 0).reason, 'dead');
});

test('Gun misfires against a number: the number wins, it is public and the shooter is stunned', () => {
  const m = make(['human', 'human']);
  const [g] = hand(m, 'p1', [gunCard(), numberCard(2)]);
  const [n] = hand(m, 'p2', [numberCard(1)]);
  const out = m.settleDuel('p1', 'p2', g.id, n.id, 500);
  assert.equal(out.winnerId, 'p2');
  assert.ok(m.get('p2').hand.includes(n));
  assert.ok(!m.get('p1').hand.includes(g));
  const e = out.effects.find((x) => x.type === 'misfire');
  assert.deepEqual([e.player, e.target], ['p1', 'p2']);
  assert.equal(m.get('p1').stunnedUntil, 500 + RULES.stunTime);
});

test('human beats an infected with numbers: clue + stun', () => {
  const m = make(['human', 'infected']);
  const [a] = hand(m, 'p1', [numberCard(9)]);
  const [b] = hand(m, 'p2', [numberCard(3), numberCard(4)]);
  const out = m.settleDuel('p1', 'p2', a.id, b.id, 100);
  assert.ok(out.effects.some((e) => e.type === 'clue' && e.genuine));
  assert.equal(m.get('p2').stunnedUntil, 100 + RULES.stunTime);
});

test('infected win when no living human is left', () => {
  const m = make(['infected', 'human']);
  assert.equal(m.winner(), null);
  m.get('p2').role = 'infected';
  assert.equal(m.winner(), 'infected');
});

// ------------------------------------------------------------------ fake duels
test('two infected can duel: it is a fake duel and both keep their cards', () => {
  const m = make(['infected', 'infected', 'human']);
  assert.ok(m.canChallenge('p1', 'p2', 0).ok);
  const z = m.firstOf('p1', 'zombie');
  const [n] = hand(m, 'p2', [numberCard(4)]);
  const before = m.get('p1').hand.length;
  const out = m.settleDuel('p1', 'p2', z.id, n.id, 0);
  assert.equal(out.result.kind, 'fake');
  assert.equal(out.winnerId, null);
  assert.equal(m.get('p1').hand.length, before);
  assert.ok(m.get('p2').hand.includes(n));
  assert.equal(m.get('p1').stats.duels, 1, 'it counts as a duel, like any other');
});

test('exhausted players cannot duel; refill fixes it', () => {
  const m = make(['infected', 'human']);
  hand(m, 'p2', [cureCard()]);
  assert.equal(m.canChallenge('p1', 'p2', 0).reason, 'target-exhausted');
  m.refill('p2');
  assert.ok(m.get('p2').hand.length >= RULES.refillTo && !m.isExhausted('p2'));
  assert.ok(m.get('p2').hand.some((c) => c.kind === 'cure'), 'keeps the Cure');
});

// ------------------------------------------------------------------ meetings
test('votes: most votes is quarantined; ties and skips save everyone', () => {
  const v = (pairs) => new Map(pairs);
  assert.equal(tallyVotes(v([['a', 'x'], ['b', 'x'], ['c', 'y'], ['d', 'skip']])).out, 'x');
  assert.equal(tallyVotes(v([['a', 'x'], ['b', 'y']])).out, null, 'tie');
  assert.equal(tallyVotes(v([['a', 'x'], ['b', 'skip'], ['c', 'skip']])).out, null, 'skips win');
  assert.equal(tallyVotes(v([['a', 'x'], ['b', 'skip']])).out, null, 'skips tie');
  assert.equal(tallyVotes(v([])).out, null);
});

test('meetings: once per player, not too early, and quarantine removes the player', () => {
  const m = make(['infected', 'human', 'human']);
  assert.equal(m.canCallMeeting('p2', 0).reason, 'cooldown');
  m.callMeeting('p2', RULES.meetingFirstDelay);
  assert.equal(m.canCallMeeting('p2', RULES.meetingFirstDelay).reason, 'used');
  m.quarantine('p1');
  assert.ok(m.get('p1').quarantined && !m.get('p1').alive);
  assert.equal(m.winner(), 'humans');
});

test('meetings pause the match: pending timers move back, finished ones stay', () => {
  const m = make(['infected', 'human']);
  m.bite(m.get('p2'), m.get('p1'), 1000);
  m.get('p1').cooldownUntil = 500;
  m.shiftTimers(2000, 40000);
  assert.equal(m.get('p2').turnsAt, 1000 + RULES.incubation + 40000);
  assert.equal(m.get('p1').cooldownUntil, 500);
});

test('the deck reshuffles the discard pile when it runs out', () => {
  const m = make(['human', 'human']);
  m.discard.push(...m.deck.splice(0));
  assert.equal(m.draw(3).length, 3);
});
