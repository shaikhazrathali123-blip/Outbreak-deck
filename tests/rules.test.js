// Rules from GAME_GUIDE.txt (v2): numbers 1–9, Zombie (instant bite), Gun (2 bullets,
// kills anyone), Cure (played or held; cures zombies, 60s cell for the user),
// secret Gun hand-offs, hunger, fake duels, meetings and votes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberCard, zombieCard, gunCard, cureCard, createDeck, createRng } from '../shared/cards.js';
import { resolveDuel } from '../shared/duel.js';
import { Match, assignRoles, tallyVotes } from '../shared/match.js';
import { RULES } from '../shared/constants.js';

const make = (roles) =>
  new Match({ seed: 3, players: roles.map((role, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, color: '#fff', role })) });
const hand = (m, id, cards) => {
  m.get(id).hand = cards;
  return cards;
};
const has = (m, id, kind) => m.get(id).hand.some((c) => c.kind === kind);

// ------------------------------------------------------------------ cards
test('deck: four of each number 1–9 plus Guns and Cures, no Zombies; Guns have 2 bullets', () => {
  const deck = createDeck(createRng(1));
  const count = (k) => deck.filter((c) => c.kind === k).length;
  assert.equal(count('number'), 36);
  assert.equal(count('gun'), RULES.deckGuns);
  assert.equal(count('cure'), RULES.deckCures);
  assert.equal(count('zombie'), 0);
  assert.ok(deck.filter((c) => c.kind === 'gun').every((g) => g.bullets === 2));
});

test('zombies never start with a Gun or a Cure; a human starts with one of them at most', () => {
  for (let seed = 1; seed < 40; seed++) {
    const m = new Match({ seed, players: Array.from({ length: 15 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: '#fff', role: i < 7 ? 'infected' : 'human' })) });
    for (const p of m.list()) {
      const specials = p.hand.filter((c) => c.kind === 'gun' || c.kind === 'cure').length;
      assert.ok(specials <= (p.role === 'infected' ? 0 : 1), `${p.id} holds ${specials}`);
    }
  }
});

test('a human with a Gun can never get a Cure (and the other way round), even from a refill', () => {
  const m = make(['infected', 'human']);
  const p = m.get('p2');
  for (let i = 0; i < 40; i++) {
    m.trash(...p.hand.splice(0));
    p.hand.push(i % 2 ? gunCard() : cureCard());
    m.refill('p2'); // not exhausted: nothing happens
    p.hand.splice(0, 1).forEach((c) => m.trash(c));
    m.refill('p2');
    assert.ok(p.hand.filter((c) => c.kind === 'gun' || c.kind === 'cure').length <= 1);
  }
  assert.ok(!m.allowed({ role: 'human', hand: [gunCard()] }, cureCard()));
  assert.ok(!m.allowed({ role: 'human', hand: [cureCard()] }, gunCard()));
  assert.ok(m.allowed({ role: 'human', hand: [numberCard(3)] }, cureCard()));
});

// ------------------------------------------------------------------ duel table
test('duel table', () => {
  const k = (a, b) => { const r = resolveDuel(a, b); return [r.winner, r.kind]; };
  assert.deepEqual(k(numberCard(7), numberCard(3)), ['a', 'number']);
  assert.deepEqual(k(numberCard(5), numberCard(5)), [null, 'draw']);
  assert.deepEqual(k(zombieCard(), numberCard(9)), ['a', 'infect']);
  assert.deepEqual(k(gunCard(), zombieCard()), ['a', 'kill']);
  assert.deepEqual(k(numberCard(1), gunCard()), ['b', 'kill']);
  assert.deepEqual(k(cureCard(), zombieCard()), ['a', 'cure']);
  assert.deepEqual(k(cureCard(), numberCard(2)), ['b', 'cure-number']);
  assert.deepEqual(k(gunCard(), cureCard()), ['a', 'kill']);
  assert.deepEqual(k(gunCard(), gunCard()), [null, 'draw']);
  assert.deepEqual(k(cureCard(), cureCard()), [null, 'draw']);
});

// ------------------------------------------------------------------ setup
test('roles: 1 / 2 / 3 infected by lobby size', () => {
  const count = (n) => Object.values(assignRoles(Array.from({ length: n }, (_, i) => `p${i}`), createRng(n))).filter((r) => r === 'infected').length;
  assert.deepEqual([count(6), count(8), count(9), count(12), count(13), count(15)], [1, 1, 2, 2, 3, 3]);
});

test('a zombie holds ONE Zombie card; after a bite the next grows 40s later', () => {
  const m = make(['infected', 'human', 'human']);
  const p = m.get('p1');
  assert.equal(m.zombieCount(p), 1, 'starts with one');
  const grew = (t) => m.tick(t).filter((e) => e.type === 'zombie-grew').map((e) => e.player);
  assert.deepEqual(grew(500000), [], 'never more than one, however long you wait');
  // bite at t=1000: the card is used, the next one grows at 1000 + 40s
  hand(m, 'p2', [numberCard(5)]);
  m.settleDuel('p1', 'p2', m.firstOf('p1', 'zombie').id, m.get('p2').hand[0].id, 1000);
  assert.equal(m.zombieCount(p), 0);
  assert.deepEqual(grew(1000 + RULES.zombieRegen - 1), []);
  assert.deepEqual(grew(1000 + RULES.zombieRegen).sort(), ['p1', 'p2'], 'the biter, and the new zombie 40s after turning');
  assert.equal(m.zombieCount(p), 1);
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

// ------------------------------------------------------------------ bites
test('a bite turns the human AT ONCE; the biter is fed', () => {
  const m = make(['infected', 'human', 'human']);
  const z = m.firstOf('p1', 'zombie');
  const [b] = hand(m, 'p2', [numberCard(9)]);
  m.get('p1').hungerAt = 1;
  const out = m.settleDuel('p1', 'p2', z.id, b.id, 500);
  assert.ok(out.effects.some((e) => e.type === 'bitten' && e.player === 'p2'));
  assert.equal(m.get('p2').role, 'infected');
  assert.equal(m.zombieCount(m.get('p2')), 0, 'no Zombie card yet: it grows 40s after turning');
  assert.ok(m.get('p2').hand.includes(b), 'they keep their number card');
  assert.equal(m.get('p1').hungerAt, 500 + RULES.hunger);
  assert.equal(m.get('p2').hungerAt, 500 + RULES.hunger, 'their own hunger starts now');
});

test('a bitten Gun holder loses the Gun: it goes secretly to a human holding no Gun or Cure', () => {
  const m = make(['infected', 'human', 'human', 'human', 'human']);
  const z = m.firstOf('p1', 'zombie');
  const gun = gunCard();
  const [n] = hand(m, 'p2', [numberCard(3), gun]);
  hand(m, 'p3', [numberCard(5), gunCard()]); // already armed: can't receive
  hand(m, 'p5', [numberCard(5), cureCard()]); // holds a Cure: can't receive a Gun either
  hand(m, 'p4', [numberCard(5)]);
  const out = m.settleDuel('p1', 'p2', z.id, n.id, 0);
  assert.ok(!has(m, 'p2', 'gun'));
  assert.ok(m.get('p4').hand.includes(gun));
  assert.deepEqual(out.effects.filter((e) => e.type === 'handed').map((e) => e.to), ['p4']);
});

test('with no human to take it, a lost Gun goes back to the supply', () => {
  const m = make(['infected', 'human']);
  const z = m.firstOf('p1', 'zombie');
  const gun = gunCard();
  const [n] = hand(m, 'p2', [numberCard(3), gun]);
  m.settleDuel('p1', 'p2', z.id, n.id, 0);
  assert.ok(m.deck.includes(gun));
});

// ------------------------------------------------------------------ cures
test("you can't cure yourself: a Cure in your hand doesn't stop a bite, it is handed to another human", () => {
  const m = make(['infected', 'human', 'human']);
  const z = m.firstOf('p1', 'zombie');
  const cure = cureCard();
  const [b] = hand(m, 'p2', [numberCard(5), cure]);
  hand(m, 'p3', [numberCard(2)]);
  const out = m.settleDuel('p1', 'p2', z.id, b.id, 0);
  assert.equal(m.get('p2').role, 'infected', 'bitten anyway');
  assert.equal(m.get('p1').role, 'infected', 'the biter is not cured');
  assert.ok(!m.inCell('p2', 10));
  assert.ok(m.get('p3').hand.includes(cure), 'the Cure went secretly to the other human');
  assert.ok(!out.effects.some((e) => e.type === 'cured'));
});

test('Cure played on a Zombie card: zombie cured (no Zombie cards, no hunger, gagged, recovering), user in the cell', () => {
  const m = make(['infected', 'human']);
  const z = m.firstOf('p1', 'zombie');
  const [c] = hand(m, 'p2', [cureCard(), numberCard(4)]);
  const out = m.settleDuel('p2', 'p1', c.id, z.id, 0);
  const zp = m.get('p1');
  assert.equal(out.winnerId, 'p2');
  assert.equal(zp.role, 'human');
  assert.equal(m.zombieCount(zp), 0);
  assert.equal(zp.hungerAt, null);
  assert.ok(m.isGagged('p1', RULES.gagTime - 1) && !m.isGagged('p1', RULES.gagTime));
  assert.ok(m.isRecovering('p1', RULES.recoverTime - 1) && !m.isRecovering('p1', RULES.recoverTime));
  assert.ok(m.inCell('p2', RULES.cureQuarantine - 1));
  assert.ok(m.isGagged('p2', RULES.cureQuarantine - 1), 'the Cure user is gagged too');
  assert.equal(m.winner(), 'humans', 'the last zombie is cured');
});

test('Cure played on a zombie\'s number: zombie cured but wins the duel; user in the cell', () => {
  const m = make(['infected', 'human', 'human']);
  const [n] = hand(m, 'p1', [numberCard(2), zombieCard()]);
  const [c] = hand(m, 'p2', [cureCard(), numberCard(4)]);
  const out = m.settleDuel('p2', 'p1', c.id, n.id, 0);
  assert.equal(out.winnerId, 'p1');
  assert.equal(m.get('p1').role, 'human');
  assert.ok(m.inCell('p2', 10));
});

test('Cure played on a human: wasted, you lose, no cell', () => {
  const m = make(['human', 'human', 'infected']);
  const [n] = hand(m, 'p1', [numberCard(2)]);
  const [c] = hand(m, 'p2', [cureCard(), numberCard(4)]);
  const out = m.settleDuel('p2', 'p1', c.id, n.id, 0);
  assert.equal(out.winnerId, 'p1');
  assert.ok(out.effects.some((e) => e.type === 'cure-wasted'));
  assert.ok(!m.inCell('p2', 10));
  assert.ok(!has(m, 'p2', 'cure'));
});

test('in the cell: no duels, no meetings, can\'t be voted out, released after 60s', () => {
  const m = make(['infected', 'human', 'human']);
  m.sendToCell(m.get('p2'), 0);
  assert.equal(m.canChallenge('p1', 'p2', 10).reason, 'target-in-cell');
  assert.equal(m.canCallMeeting('p2', RULES.meetingFirstDelay).reason, 'in-cell');
  assert.ok(!m.canBeVoted('p2', 10) && !m.canVote('p2', 10));
  assert.ok(m.tick(RULES.cureQuarantine).some((e) => e.type === 'released' && e.player === 'p2'));
  assert.ok(m.canBeVoted('p2', RULES.cureQuarantine));
  assert.equal(m.living('human').length, 2, 'still counts as a human');
});

test('a freshly cured player cannot be bitten while recovering', () => {
  const m = make(['infected', 'infected', 'human']);
  m.cureZombie(m.get('p2'), m.get('p3'), 0);
  const z = m.firstOf('p1', 'zombie');
  const [n] = hand(m, 'p2', [numberCard(3)]);
  const out = m.settleDuel('p1', 'p2', z.id, n.id, 100);
  assert.ok(out.effects.some((e) => e.type === 'immune'));
  assert.equal(m.get('p2').role, 'human');
});

// ------------------------------------------------------------------ guns
test('Gun kills a zombie: shot is public, shooter stunned 8s, one bullet used', () => {
  const m = make(['infected', 'human', 'human']);
  const z = m.firstOf('p1', 'zombie');
  const [g] = hand(m, 'p2', [gunCard(), numberCard(3)]);
  const out = m.settleDuel('p2', 'p1', g.id, z.id, 100);
  assert.equal(m.get('p1').alive, false);
  assert.ok(out.effects.some((e) => e.type === 'killed' && e.player === 'p1'));
  assert.equal(m.get('p2').stunnedUntil, 100 + RULES.shotStun);
  assert.equal(m.firstOf('p2', 'gun').bullets, 1);
  assert.equal(m.winner(), 'humans');
});

test('Gun on a number kills that player, human or zombie; the second shot uses the Gun up', () => {
  const m = make(['human', 'human', 'human', 'infected']);
  const g = gunCard();
  hand(m, 'p1', [g, numberCard(1)]);
  const [n2] = hand(m, 'p2', [numberCard(9)]);
  m.settleDuel('p1', 'p2', g.id, n2.id, 0);
  assert.equal(m.get('p2').alive, false, 'a human can be shot');
  const [n3] = hand(m, 'p3', [numberCard(9)]);
  m.settleDuel('p1', 'p3', g.id, n3.id, 50000);
  assert.equal(m.get('p3').alive, false);
  assert.ok(!has(m, 'p1', 'gun'), 'both bullets gone');
});

test('human beats a zombie with numbers: clue + 12s stun', () => {
  const m = make(['human', 'infected']);
  const [a] = hand(m, 'p1', [numberCard(9)]);
  const [b] = hand(m, 'p2', [numberCard(3), numberCard(4)]);
  const out = m.settleDuel('p1', 'p2', a.id, b.id, 100);
  assert.ok(out.effects.some((e) => e.type === 'clue' && e.genuine));
  assert.equal(m.get('p2').stunnedUntil, 100 + RULES.stunTime);
});

// ------------------------------------------------------------------ zombies
test('two infected duel: a fake duel, both keep their cards', () => {
  const m = make(['infected', 'infected', 'human']);
  const z = m.firstOf('p1', 'zombie');
  const [n] = hand(m, 'p2', [numberCard(4)]);
  const before = m.get('p1').hand.length;
  const out = m.settleDuel('p1', 'p2', z.id, n.id, 0);
  assert.equal(out.result.kind, 'fake');
  assert.equal(m.get('p1').hand.length, before);
  assert.ok(m.get('p2').hand.includes(n));
});

test('hunger: starving after 60s without a bite, then growls (and flares) every RULES.growlEvery', () => {
  assert.equal(RULES.hunger, 60000);
  const m = make(['infected', 'human']);
  assert.ok(!m.isStarving('p1', RULES.hunger - 1));
  assert.ok(m.tick(RULES.hunger).some((e) => e.type === 'starving'));
  assert.ok(m.tick(RULES.hunger + RULES.growlEvery).some((e) => e.type === 'growl'));
});

test('refills never give a zombie a Gun or a Cure', () => {
  const m = make(['infected', 'human']);
  for (let i = 0; i < 30; i++) {
    m.trash(...m.get('p1').hand.splice(0));
    m.refill('p1');
    assert.ok(m.get('p1').hand.length >= 1);
    assert.ok(!has(m, 'p1', 'gun') && !has(m, 'p1', 'cure'));
  }
});

test('Zombie cards never end up in the deck', () => {
  const m = make(['infected', 'human', 'human']);
  const z = m.firstOf('p1', 'zombie');
  const [g] = hand(m, 'p2', [gunCard()]);
  m.settleDuel('p2', 'p1', g.id, z.id, 0); // the zombie dies holding Zombie cards
  assert.ok(![...m.deck, ...m.discard].some((c) => c.kind === 'zombie'));
});

test('a hand with only a Cure can still duel', () => {
  const m = make(['infected', 'human']);
  hand(m, 'p2', [cureCard()]);
  assert.ok(m.canChallenge('p1', 'p2', 0).ok);
  hand(m, 'p2', []);
  assert.equal(m.canChallenge('p1', 'p2', 0).reason, 'target-exhausted');
});

// ------------------------------------------------------------------ meetings and winning
test('votes: most votes is quarantined; ties and skips save everyone', () => {
  const v = (pairs) => new Map(pairs);
  assert.equal(tallyVotes(v([['a', 'x'], ['b', 'x'], ['c', 'y'], ['d', 'skip']])).out, 'x');
  assert.equal(tallyVotes(v([['a', 'x'], ['b', 'y']])).out, null);
  assert.equal(tallyVotes(v([['a', 'x'], ['b', 'skip']])).out, null);
});

test('meetings: once per player, not too early; voting out the last zombie wins for humans', () => {
  const m = make(['infected', 'human', 'human']);
  assert.equal(m.canCallMeeting('p2', 0).reason, 'cooldown');
  m.callMeeting('p2', RULES.meetingFirstDelay);
  assert.equal(m.canCallMeeting('p2', RULES.meetingFirstDelay).reason, 'used');
  m.quarantine('p1');
  assert.equal(m.winner(), 'humans');
});

test('meetings pause the cell, gag and hunger timers', () => {
  const m = make(['infected', 'human']);
  m.sendToCell(m.get('p2'), 1000);
  m.shiftTimers(2000, 40000);
  assert.equal(m.get('p2').cellUntil, 1000 + RULES.cureQuarantine + 40000);
  assert.equal(m.get('p1').hungerAt, RULES.hunger + 40000);
});

test('at 0:00 the bigger team wins; a tie goes to the humans', () => {
  const m = make(['infected', 'infected', 'infected', 'human', 'human']);
  assert.equal(m.timeUpWinner(), 'infected', '3 zombies vs 2 humans');
  m.quarantine('p1');
  assert.equal(m.timeUpWinner(), 'humans', '2 vs 2: a tie');
  m.kill(m.get('p2'), m.get('p4'));
  assert.equal(m.timeUpWinner(), 'humans', '1 zombie vs 2 humans');
  m.sendToCell(m.get('p4'), 0);
  m.kill(m.get('p5'), m.get('p4'));
  assert.equal(m.timeUpWinner(), 'humans', 'a Cure user in the cell counts: 1 vs 1');
});

test('infected win once no human is left', () => {
  const m = make(['infected', 'human']);
  const z = m.firstOf('p1', 'zombie');
  const [n] = hand(m, 'p2', [numberCard(1)]);
  m.settleDuel('p1', 'p2', z.id, n.id, 0);
  assert.equal(m.winner(), 'infected');
});
