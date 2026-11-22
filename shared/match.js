// Match state and rules: roles, hands, challenges, duel results, infection,
// special cards, cooldowns, refills and win conditions. Pure logic with no
// rendering, so the server can run it in Phase 4. Times are passed in (ms).
import { RULES, infectedCount } from './constants.js';
import { createRng, createDeck, decksFor, shuffle, isPlayable, randomInfectedCard } from './cards.js';
import { resolveHighCard } from './duel.js';

const CLUES = [
  "Your opponent's hands felt cold...",
  'You caught a faint green glint behind their visor.',
  'Their breathing sounded wrong.',
  'They flinched away from the light.',
];

/** Special cards you can activate from your hand (Vaccine and Wild work on their own). */
export const USABLE = {
  scanner: { target: true },
  swap: { target: true },
  freeze: { target: true },
  decoy: { target: false },
  spore: { target: false },
  mask: { target: false },
  rumor: { target: false },
};

/** Pick which player ids start infected (1 for 6–8 players, 2 for 9–12, 3 for 13–15). */
export function assignRoles(ids, rng) {
  const infected = new Set(shuffle(ids, rng).slice(0, infectedCount(ids.length)));
  return Object.fromEntries(ids.map((id) => [id, infected.has(id) ? 'infected' : 'human']));
}

export class Match {
  /**
   * @param {object} o
   * @param {{id:string,name:string,color:string,role:'human'|'infected'}[]} o.players
   * @param {number} [o.seed]
   */
  constructor({ players, seed = Date.now(), handSize = RULES.handSize, now = 0 }) {
    this.rng = createRng(seed);
    this.deck = createDeck(this.rng, decksFor(players.length));
    this.discard = [];
    this.players = new Map();
    for (const p of players) {
      const player = {
        ...p,
        hand: [],
        cooldownUntil: 0,
        stunnedUntil: 0,
        frozenUntil: 0,
        maskedUntil: 0,
        sporeArmed: false,
        infectedAt: p.role === 'infected' ? now : null,
        startedInfected: p.role === 'infected',
        stats: { duels: 0, won: 0, lost: 0, infections: 0, cardsUsed: 0 },
      };
      player.hand = this.draw(handSize);
      if (player.role === 'infected') player.hand.push(randomInfectedCard(this.rng));
      this.players.set(p.id, player);
    }
  }

  get(id) {
    const p = this.players.get(id);
    if (!p) throw new Error(`Unknown player ${id}`);
    return p;
  }

  list() {
    return [...this.players.values()];
  }

  humans() {
    return this.list().filter((p) => p.role === 'human');
  }

  /** 'infected' once nobody human is left, otherwise null (humans win when time runs out). */
  winner() {
    return this.humans().length === 0 ? 'infected' : null;
  }

  draw(n) {
    const out = [];
    while (out.length < n) {
      if (this.deck.length === 0) {
        if (this.discard.length === 0) break;
        this.deck = shuffle(this.discard, this.rng);
        this.discard = [];
      }
      out.push(this.deck.pop());
    }
    return out;
  }

  /** Exhausted = no card you could play in a duel. */
  isExhausted(id) {
    return !this.get(id).hand.some(isPlayable);
  }

  /** Can `aId` challenge `bId` right now? (Distance is checked by the caller.) */
  canChallenge(aId, bId, now) {
    const a = this.get(aId);
    const b = this.get(bId);
    if (aId === bId) return { ok: false, reason: 'self' };
    if (a.role === 'infected' && b.role === 'infected') return { ok: false, reason: 'ally' };
    if (this.isExhausted(aId)) return { ok: false, reason: 'exhausted' };
    if (this.isExhausted(bId)) return { ok: false, reason: 'target-exhausted' };
    if (now < a.stunnedUntil) return { ok: false, reason: 'stunned' };
    if (now < b.stunnedUntil) return { ok: false, reason: 'target-stunned' };
    if (now < a.cooldownUntil) return { ok: false, reason: 'cooldown', wait: a.cooldownUntil - now };
    if (now < b.cooldownUntil) return { ok: false, reason: 'target-cooldown', wait: b.cooldownUntil - now };
    return { ok: true };
  }

  /** Declining a challenge costs one random card. Returns the card lost (or null). */
  decline(id) {
    const p = this.get(id);
    if (p.hand.length === 0) return null;
    const [lost] = p.hand.splice(Math.floor(this.rng() * p.hand.length), 1);
    this.discard.push(lost);
    return lost;
  }

  takeCard(p, cardId) {
    const i = p.hand.findIndex((c) => c.id === cardId);
    if (i < 0) throw new Error(`${p.id} doesn't hold ${cardId}`);
    const card = p.hand[i];
    if (!isPlayable(card)) throw new Error(`${card.id} can't be played in a duel`);
    p.hand.splice(i, 1);
    return card;
  }

  /** A sensible pick for bots/timeouts: the strongest playable card. */
  bestCard(id) {
    const playable = this.get(id).hand.filter(isPlayable);
    return playable.sort((x, y) => (y.value ?? 8) - (x.value ?? 8))[0] ?? null;
  }

  randomCard(id) {
    const playable = this.get(id).hand.filter(isPlayable);
    return playable[Math.floor(this.rng() * playable.length)] ?? null;
  }

  infect(p, by, now) {
    p.role = 'infected';
    p.infectedAt = now;
    const card = randomInfectedCard(this.rng);
    p.hand.push(card);
    by.stats.infections++;
    return card;
  }

  /**
   * Play out a High Card duel. Returns everything that happened, for the UI.
   * Winner takes the loser's played card. Infected beats human: infection
   * (or a Vaccine is used up, unless the winner armed a Spore).
   * Human beats infected: clue + 15s stun.
   */
  settleDuel(aId, bId, cardIdA, cardIdB, now) {
    const check = this.canChallenge(aId, bId, now);
    if (!check.ok) throw new Error(`Duel not allowed: ${check.reason}`);
    const a = this.get(aId);
    const b = this.get(bId);
    const cardA = this.takeCard(a, cardIdA);
    const cardB = this.takeCard(b, cardIdB);
    const result = resolveHighCard(cardA, cardB);
    const out = { result, cards: { [aId]: cardA, [bId]: cardB }, winnerId: null, loserId: null, effects: [] };
    a.cooldownUntil = now + RULES.duelCooldown;
    b.cooldownUntil = now + RULES.duelCooldown;
    a.stats.duels++;
    b.stats.duels++;

    if (!result.winner) {
      a.hand.push(cardA);
      b.hand.push(cardB);
      out.effects.push({ type: 'draw' });
      return out;
    }
    const [winner, loser, wCard, lCard] = result.winner === 'a' ? [a, b, cardA, cardB] : [b, a, cardB, cardA];
    out.winnerId = winner.id;
    out.loserId = loser.id;
    winner.stats.won++;
    loser.stats.lost++;
    winner.hand.push(wCard, lCard);
    out.effects.push({ type: 'card-taken', from: loser.id, to: winner.id, card: lCard });

    if (winner.role === 'infected' && loser.role === 'human') {
      const vaccineAt = loser.hand.findIndex((c) => c.kind === 'special' && c.type === 'vaccine');
      const spore = winner.sporeArmed;
      winner.sporeArmed = false;
      if (vaccineAt >= 0 && !spore) {
        this.discard.push(...loser.hand.splice(vaccineAt, 1));
        out.effects.push({ type: 'vaccine', player: loser.id });
      } else {
        const card = this.infect(loser, winner, now);
        out.effects.push({ type: 'infected', player: loser.id, by: winner.id, card, spore });
      }
    } else if (winner.role === 'human' && loser.role === 'infected') {
      loser.stunnedUntil = now + RULES.stunTime;
      out.effects.push({ type: 'stunned', player: loser.id, until: loser.stunnedUntil });
      out.effects.push({ type: 'clue', to: winner.id, about: loser.id, text: this.clueText(), genuine: true });
    } else if (winner.role === 'human' && loser.role === 'human' && this.rng() < RULES.falseClueChance) {
      out.effects.push({ type: 'clue', to: winner.id, about: loser.id, text: this.clueText(), genuine: false });
    }
    return out;
  }

  clueText() {
    return CLUES[Math.floor(this.rng() * CLUES.length)];
  }

  /** Can this player use this card from their hand right now? */
  canUse(id, cardId) {
    const card = this.get(id).hand.find((c) => c.id === cardId);
    if (!card || !USABLE[card.type]) return { ok: false, reason: 'not-usable' };
    return { ok: true, card, needsTarget: USABLE[card.type].target };
  }

  /**
   * Activate a special or infected-only card. Returns the effect (or throws).
   * scanner: 90% accurate read on the target · swap: trade a random card each ·
   * freeze: target can't move 5s · decoy: a fake you for 10s · spore: next win
   * ignores Vaccines · mask: hide infection signs 60s · rumor: fake clue about a random human.
   */
  useCard(id, cardId, targetId, now) {
    const check = this.canUse(id, cardId);
    if (!check.ok) throw new Error(`Can't use ${cardId}`);
    if (check.needsTarget && (!targetId || targetId === id)) throw new Error(`${check.card.type} needs a target`);
    const p = this.get(id);
    const card = check.card;
    p.hand.splice(p.hand.indexOf(card), 1);
    this.discard.push(card);
    p.stats.cardsUsed++;
    const target = targetId ? this.get(targetId) : null;
    switch (card.type) {
      case 'scanner': {
        const truth = target.role === 'infected';
        const accurate = this.rng() < RULES.scannerAccuracy;
        return { type: 'scan', by: id, target: targetId, infected: accurate ? truth : !truth };
      }
      case 'swap': {
        if (!p.hand.length || !target.hand.length) return { type: 'swap', by: id, target: targetId, gave: null, got: null };
        const [gave] = p.hand.splice(Math.floor(this.rng() * p.hand.length), 1);
        const [got] = target.hand.splice(Math.floor(this.rng() * target.hand.length), 1);
        p.hand.push(got);
        target.hand.push(gave);
        return { type: 'swap', by: id, target: targetId, gave, got };
      }
      case 'freeze':
        target.frozenUntil = now + RULES.freezeTime;
        return { type: 'freeze', by: id, target: targetId, until: target.frozenUntil };
      case 'decoy':
        return { type: 'decoy', by: id, until: now + RULES.decoyTime };
      case 'spore':
        p.sporeArmed = true;
        return { type: 'spore', by: id };
      case 'mask':
        p.maskedUntil = now + RULES.maskTime;
        return { type: 'mask', by: id, until: p.maskedUntil };
      case 'rumor': {
        const humans = this.humans().filter((h) => h.id !== id);
        const about = humans[Math.floor(this.rng() * humans.length)]?.id ?? null;
        return { type: 'rumor', by: id, about, text: this.clueText() };
      }
      default:
        throw new Error(`Unhandled card ${card.type}`);
    }
  }

  /** Exhausted players refill to 4 cards at a supply box (always with a playable card). */
  refill(id) {
    const p = this.get(id);
    if (!this.isExhausted(id)) return [];
    const drawn = this.draw(Math.max(0, RULES.refillTo - p.hand.length));
    p.hand.push(...drawn);
    let guard = 0;
    while (this.isExhausted(id) && guard++ < 20) {
      const [extra] = this.draw(1);
      if (!extra) break;
      if (isPlayable(extra)) {
        const swapAt = p.hand.findIndex((c) => !isPlayable(c) && c.kind === 'special' && c.type !== 'vaccine');
        if (swapAt >= 0) this.discard.push(...p.hand.splice(swapAt, 1));
        p.hand.push(extra);
        drawn.push(extra);
      } else this.discard.push(extra);
    }
    return drawn;
  }
}
