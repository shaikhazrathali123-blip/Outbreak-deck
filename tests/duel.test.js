import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberCard, specialCard } from '../shared/cards.js';
import { suitBeats, scoreCard, resolveHighCard } from '../shared/duel.js';

const n = (suit, value) => numberCard(suit, value);

test('suit cycle: Blade > Shield > Toxin > Mind > Blade', () => {
  assert.ok(suitBeats('blade', 'shield'));
  assert.ok(suitBeats('shield', 'toxin'));
  assert.ok(suitBeats('toxin', 'mind'));
  assert.ok(suitBeats('mind', 'blade'));
  assert.ok(!suitBeats('shield', 'blade'));
  assert.ok(!suitBeats('blade', 'toxin')); // not neighbours: no advantage either way
  assert.ok(!suitBeats('toxin', 'blade'));
  assert.ok(!suitBeats('blade', 'blade'));
});

test('README example: Blade 5 vs Shield 7 -> Blade 8 wins', () => {
  const r = resolveHighCard(n('blade', 5), n('shield', 7));
  assert.equal(r.a.total, 8);
  assert.equal(r.b.total, 7);
  assert.equal(r.winner, 'a');
});

test('suit bonus only goes to the strong suit', () => {
  const r = resolveHighCard(n('shield', 9), n('blade', 7));
  assert.deepEqual([r.a.bonus, r.b.bonus], [0, 3]);
  assert.equal(r.winner, 'b'); // 9 vs 10
});

test('equal totals are a draw', () => {
  assert.equal(resolveHighCard(n('blade', 6), n('toxin', 6)).winner, null);
  assert.equal(resolveHighCard(n('mind', 4), n('blade', 7)).winner, null); // 4+3 vs 7
});

test('Wild counts as 8 with the best suit against a number card', () => {
  const wild = specialCard('wild');
  assert.equal(scoreCard(wild, n('mind', 10)).total, 11);
  assert.equal(resolveHighCard(wild, n('mind', 10)).winner, 'a');
  assert.equal(resolveHighCard(n('toxin', 10), wild).winner, 'b');
  assert.equal(resolveHighCard(wild, specialCard('wild')).winner, null);
});

test('non-duel cards cannot be scored', () => {
  assert.throws(() => scoreCard(specialCard('vaccine'), n('blade', 1)));
});
