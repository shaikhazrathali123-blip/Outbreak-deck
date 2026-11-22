// Phase 3 rules: roles, stats, special cards, win condition.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match, assignRoles } from '../shared/match.js';
import { createRng, numberCard, specialCard, infectedCard } from '../shared/cards.js';
import { RULES } from '../shared/constants.js';

const make = (roles) =>
  new Match({ seed: 9, players: roles.map((role, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, color: '#fff', role })) });

test('assignRoles: 1 / 2 / 3 infected by lobby size', () => {
  const count = (n) => Object.values(assignRoles(Array.from({ length: n }, (_, i) => `p${i}`), createRng(n))).filter((r) => r === 'infected').length;
  assert.equal(count(6), 1);
  assert.equal(count(8), 1);
  assert.equal(count(9), 2);
  assert.equal(count(12), 2);
  assert.equal(count(13), 3);
  assert.equal(count(15), 3);
});

test('stats track duels, wins and infections', () => {
  const m = make(['infected', 'human']);
  const a = numberCard('blade', 10);
  const b = numberCard('blade', 1);
  m.get('p1').hand = [a];
  m.get('p2').hand = [b, numberCard('mind', 2)];
  m.settleDuel('p1', 'p2', a.id, b.id, 0);
  assert.deepEqual([m.get('p1').stats.won, m.get('p1').stats.infections, m.get('p2').stats.lost], [1, 1, 1]);
  assert.equal(m.winner(), 'infected');
});

test('winner() stays null while any human is left', () => {
  assert.equal(make(['infected', 'human']).winner(), null);
});

test('spore lets the next win infect through a vaccine', () => {
  const m = make(['infected', 'human']);
  const spore = infectedCard('spore');
  const a = numberCard('blade', 10);
  const b = numberCard('blade', 1);
  m.get('p1').hand = [a, spore];
  m.get('p2').hand = [b, specialCard('vaccine')];
  assert.equal(m.useCard('p1', spore.id, null, 0).type, 'spore');
  const out = m.settleDuel('p1', 'p2', a.id, b.id, 0);
  assert.equal(m.get('p2').role, 'infected');
  assert.ok(out.effects.find((e) => e.type === 'infected').spore);
  assert.equal(m.get('p1').sporeArmed, false);
});

test('scanner reads the target (90% accurate) and is used up', () => {
  let right = 0;
  for (let i = 0; i < 200; i++) {
    const m = new Match({ seed: i + 1, players: [{ id: 'a', role: 'human' }, { id: 'b', role: 'infected' }] });
    const scan = specialCard('scanner');
    m.get('a').hand.push(scan);
    if (m.useCard('a', scan.id, 'b', 0).infected) right++;
    assert.ok(!m.get('a').hand.includes(scan));
  }
  assert.ok(right > 160 && right < 200, `accuracy looked like ${right}/200`);
});

test('freeze, mask and decoy set timers; swap trades one card each way', () => {
  const m = make(['human', 'infected']);
  const [freeze, swap, decoy] = [specialCard('freeze'), specialCard('swap'), specialCard('decoy')];
  const mine = numberCard('mind', 3);
  const theirs = numberCard('toxin', 9);
  m.get('p1').hand = [freeze, swap, decoy, mine];
  m.get('p2').hand = [theirs];
  assert.equal(m.useCard('p1', freeze.id, 'p2', 100).until, 100 + RULES.freezeTime);
  assert.equal(m.get('p2').frozenUntil, 100 + RULES.freezeTime);
  assert.equal(m.useCard('p1', decoy.id, null, 0).until, RULES.decoyTime);
  const s = m.useCard('p1', swap.id, 'p2', 0);
  assert.equal(m.get('p1').hand.length, 1);
  assert.ok(m.get('p1').hand.includes(s.got) && m.get('p2').hand.includes(s.gave));
  assert.equal(s.got, theirs);
  const mask = infectedCard('mask');
  m.get('p2').hand.push(mask);
  m.useCard('p2', mask.id, null, 50);
  assert.equal(m.get('p2').maskedUntil, 50 + RULES.maskTime);
});

test('rumor names a random human, never the user', () => {
  const m = make(['infected', 'human', 'human']);
  const rumor = infectedCard('rumor');
  m.get('p1').hand.push(rumor);
  const r = m.useCard('p1', rumor.id, null, 0);
  assert.ok(['p2', 'p3'].includes(r.about));
});

test('targeted cards need a target; Vaccine and Wild are not "used"', () => {
  const m = make(['human', 'human']);
  const freeze = specialCard('freeze');
  m.get('p1').hand.push(freeze, specialCard('vaccine'));
  assert.throws(() => m.useCard('p1', freeze.id, null, 0));
  assert.equal(m.canUse('p1', m.get('p1').hand.find((c) => c.type === 'vaccine').id).ok, false);
});
