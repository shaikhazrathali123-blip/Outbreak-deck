// Rules v3 (GAME_GUIDE.txt v3.0): bluff calls, Restore Power + evac, Blackout, body reports,
// vote / stealth / Last Stand points, lobby balance, match modifiers and ranks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberCard, zombieCard, gunCard, cureCard } from '../shared/cards.js';
import { Match } from '../shared/match.js';
import { RULES, POINTS, lobbyRules, dailyModifier, MODIFIERS, rankFor, RANKS } from '../shared/constants.js';

const make = (roles, rules) =>
  new Match({ seed: 3, rules, players: roles.map((role, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, color: '#fff', role })) });
const hand = (m, id, cards) => {
  m.get(id).hand = cards;
  return cards;
};
const SPOTS = [1, 2, 3, 4, 5, 6].map((i) => ({ floor: i % 4, x: i * 100 }));

// ------------------------------------------------------------------ bluff calls
test('a right bluff call cancels the Zombie card: no bite, the caller wins, +15, the call is used up', () => {
  const m = make(['infected', 'human', 'human']);
  const z = m.firstOf('p1', 'zombie');
  const [n] = hand(m, 'p2', [numberCard(3), numberCard(5)]);
  const before = m.score('p2');
  const out = m.settleDuel('p1', 'p2', z.id, n.id, 1000, { p2: 'zombie' });
  assert.equal(out.result.kind, 'called');
  assert.equal(out.winnerId, 'p2');
  assert.equal(m.get('p2').role, 'human', 'no bite');
  assert.equal(m.zombieCount(m.get('p1')), 0, 'the Zombie card is spent');
  assert.equal(m.get('p1').nextZombieAt, 1000 + m.zombieRegen());
  assert.equal(m.get('p1').hungerAt, null);
  assert.ok(out.effects.some((e) => e.type === 'called' && e.player === 'p2' && e.card === 'zombie'));
  assert.equal(m.score('p2'), before + POINTS.callRight, 'the number card came back, +15');
  assert.equal(m.canCall('p2'), false);
});

test('a wrong bluff call costs 10 and the duel plays out as normal', () => {
  const m = make(['infected', 'human', 'human']);
  const z = m.firstOf('p1', 'zombie');
  const [n] = hand(m, 'p2', [numberCard(3)]);
  const out = m.settleDuel('p1', 'p2', z.id, n.id, 0, { p2: 'gun' });
  assert.ok(out.effects.some((e) => e.type === 'call-wrong' && e.player === 'p2'));
  assert.ok(out.effects.some((e) => e.type === 'bitten' && e.player === 'p2'), 'still bitten');
  assert.equal(m.get('p2').earned['call-wrong'].points, POINTS.callWrong);
});

test('a called Gun loses a bullet; two right calls cancel both cards (no winner)', () => {
  const m = make(['infected', 'human', 'human']);
  const z = m.firstOf('p1', 'zombie');
  const [g] = hand(m, 'p2', [gunCard(), numberCard(2)]);
  const out = m.settleDuel('p1', 'p2', z.id, g.id, 0, { p1: 'gun', p2: 'zombie' });
  assert.equal(out.result.kind, 'called');
  assert.equal(out.winnerId, null);
  assert.equal(m.get('p1').alive, true, 'the Gun was cancelled');
  assert.equal(m.get('p2').role, 'human', 'the Zombie card was cancelled');
  assert.equal(m.firstOf('p2', 'gun').bullets, 1);
});

test('two infected: a fake duel ignores calls and keeps them', () => {
  const m = make(['infected', 'infected', 'human']);
  const [a] = hand(m, 'p1', [numberCard(4)]);
  const [b] = hand(m, 'p2', [numberCard(6)]);
  const out = m.settleDuel('p1', 'p2', a.id, b.id, 0, { p1: 'zombie' });
  assert.equal(out.result.kind, 'fake');
  assert.ok(m.canCall('p1'));
});

// ------------------------------------------------------------------ Restore Power
test('power parts: 4 are hidden, one carried at a time, all fitted = evac in 90s, +10 each', () => {
  const m = make(['infected', 'human', 'human']);
  m.setupParts(SPOTS);
  assert.equal(m.parts.length, RULES.powerParts);
  const [p1, p2] = m.parts;
  assert.ok(m.pickPart('p2', p1.id, 500));
  assert.ok(!m.pickPart('p2', p2.id), 'one at a time');
  assert.ok(!m.pickPart('p3', p1.id), 'already carried');
  assert.equal(m.partCarried('p2').pickedAt, 500);
  const res = m.fitPart('p2', 1000);
  assert.deepEqual([res.restored, res.left], [false, RULES.powerParts - 1]);
  assert.equal(m.get('p2').earned.part.points, POINTS.part);
  for (const q of m.parts.filter((x) => !x.fitted)) {
    m.pickPart('p3', q.id);
    m.fitPart('p3', 2000);
  }
  assert.equal(m.powerAt, 2000);
  assert.equal(m.evacAt, 2000 + RULES.evacTime);
  m.shiftTimers(2500, 10000);
  assert.equal(m.evacAt, 2000 + RULES.evacTime + 10000, 'meetings pause the evac countdown');
});

test('a carried part drops where its carrier was shot, or goes home when they are voted out; zombies can carry one', () => {
  const m = make(['infected', 'human', 'human']);
  m.setupParts(SPOTS);
  const [a, b] = m.parts;
  assert.ok(m.pickPart('p1', a.id), 'a zombie can hide a part');
  m.dropPart('p1', { floor: 2, x: 999 });
  assert.deepEqual(a.at, { floor: 2, x: 999 });
  m.pickPart('p2', b.id);
  m.dropPart('p2');
  assert.deepEqual(b.at, b.home);
});

// ------------------------------------------------------------------ Blackout
test('Blackout: zombies only, once per match, not in the first 45s, lasts 15s', () => {
  const m = make(['infected', 'human', 'human']);
  assert.equal(m.canBlackout('p2', 60000).reason, 'human');
  assert.equal(m.canBlackout('p1', 1000).reason, 'cooldown');
  m.blackout('p1', 50000);
  assert.ok(m.isBlackout(50000 + RULES.blackoutTime - 1) && !m.isBlackout(50000 + RULES.blackoutTime));
  assert.equal(m.canBlackout('p1', 90000).reason, 'used');
});

// ------------------------------------------------------------------ body reports
test('a shot body can be reported once: it calls a meeting without using your Emergency Button', () => {
  const m = make(['infected', 'human', 'human']);
  m.kill(m.get('p1'), m.get('p2'));
  assert.equal(m.canReport('p3', 'p2', 100000).reason, 'no-body', 'p2 is alive');
  assert.equal(m.canReport('p3', 'p1', 0).reason, 'cooldown', 'meeting cooldowns still apply');
  m.report('p3', 'p1', RULES.meetingFirstDelay);
  assert.equal(m.get('p3').meetingsLeft, RULES.meetingsPerPlayer);
  assert.equal(m.canReport('p2', 'p1', RULES.meetingFirstDelay).reason, 'no-body', 'already reported');
});

// ------------------------------------------------------------------ points
test('voters: +20 when the vote helped their team, -10 when it hurt it', () => {
  const m = make(['infected', 'infected', 'human', 'human']);
  const votes = new Map([['p2', 'p1'], ['p3', 'p1'], ['p4', 'skip']]);
  m.rewardVoters('p1', votes);
  assert.equal(m.get('p3').earned['vote-right'].points, POINTS.voteZombie, 'a human voted out a zombie');
  assert.equal(m.get('p2').earned['vote-wrong'].points, POINTS.voteHuman, 'a zombie voted out its ally');
  assert.equal(m.get('p4').bank, 0, 'skips earn nothing');
  m.rewardVoters('p4', new Map([['p1', 'p4']]));
  assert.equal(m.get('p1').earned['vote-right'].points, POINTS.voteZombie, 'a zombie voted out a human');
});

test('Last Stand: the last human gets a 1-bullet Gun (once) and +50 if they make it to 0:00', () => {
  const m = make(['infected', 'human', 'human']);
  assert.equal(m.checkLastStand(), null);
  m.kill(m.get('p2'), m.get('p3'));
  assert.equal(m.checkLastStand(), 'p3');
  assert.equal(m.firstOf('p3', 'gun').bullets, 1);
  assert.equal(m.checkLastStand(), null, 'only once');
  m.finish('time');
  assert.equal(m.get('p3').earned['last-stand'].points, POINTS.lastStand);
  assert.deepEqual(m.finish('time'), [], 'paid once');
});

test('Last Stand next to a Cure, or on top of a Gun', () => {
  const m = make(['infected', 'human', 'human']);
  hand(m, 'p3', [cureCard()]);
  m.kill(m.get('p2'), m.get('p3'));
  m.checkLastStand();
  assert.ok(m.firstOf('p3', 'cure') && m.firstOf('p3', 'gun'));
  const n = make(['infected', 'human', 'human']);
  hand(n, 'p3', [gunCard()]);
  n.kill(n.get('p2'), n.get('p3'));
  n.checkLastStand();
  assert.equal(n.firstOf('p3', 'gun').bullets, RULES.gunBullets + 1);
});

test('stealth: zombies still in at the end who were never accused get +25', () => {
  const m = make(['infected', 'infected', 'human', 'human', 'human']);
  m.noteAccused('p2');
  m.finish('time');
  assert.equal(m.get('p1').earned.stealth.points, POINTS.stealth);
  assert.equal(m.get('p2').earned.stealth, undefined);
});

// ------------------------------------------------------------------ balance, modifiers, ranks
test('lobby rules: one regrow time and Gun share per lobby size; modifiers override', () => {
  for (const n of [6, 7, 8, 9, 12, 13, 15]) {
    const r = lobbyRules(n);
    assert.ok(r.zombieRegen >= 30000 && r.zombieRegen <= 120000);
    assert.ok(r.startGunShare > 0 && r.startGunShare < 1);
  }
  const m = make(['infected', 'human', 'human', 'human', 'human', 'human'], { deckCures: 6 });
  assert.equal(m.rules.deckCures, 6);
  assert.ok(MODIFIERS[dailyModifier(new Date(2026, 10, 24))]);
  assert.equal(dailyModifier(new Date(2026, 10, 24)), dailyModifier(new Date(2026, 10, 24, 23, 59)), 'the same all day');
});

test('ranks: by total XP, each unlocks 3 more colours', () => {
  assert.equal(rankFor(0).name, RANKS[0].name);
  assert.equal(rankFor(RANKS[1].xp).name, RANKS[1].name);
  assert.equal(rankFor(1e9).next, null);
  assert.equal(rankFor(RANKS[2].xp).colors, 9);
});
