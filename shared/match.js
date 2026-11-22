// Match state and rules: roles, hands, Zombie cards, duel results, bites and
// incubation, Cures, kills, hunger, Blood Tests and Clean badges, meetings and
// quarantine, cooldowns, refills and win conditions. Pure logic with no
// rendering, so the server can run it in Phase 4. Times are passed in (ms).
import { RULES, infectedCount } from './constants.js';
import { createRng, createDeck, decksFor, shuffle, isPlayable, zombieCard } from './cards.js';
import { resolveDuel } from './duel.js';

const CLUES = [
  "Your opponent's hands felt cold...",
  'You caught a faint green glint behind their visor.',
  'Their breathing sounded wrong.',
  'They flinched away from the light.',
];

/** Pick which player ids start infected (1 for 6–8 players, 2 for 9–12, 3 for 13–15). */
export function assignRoles(ids, rng) {
  const infected = new Set(shuffle(ids, rng).slice(0, infectedCount(ids.length)));
  return Object.fromEntries(ids.map((id) => [id, infected.has(id) ? 'infected' : 'human']));
}

/**
 * Count a meeting's votes. `votes` maps voter id -> target id or 'skip'.
 * The top target is quarantined only if they have strictly more votes than
 * anyone else AND more than the skips. Otherwise nobody is.
 * @returns {{ counts: Record<string, number>, skips: number, out: string|null }}
 */
export function tallyVotes(votes) {
  const counts = {};
  let skips = 0;
  for (const target of votes.values()) {
    if (!target || target === 'skip') skips++;
    else counts[target] = (counts[target] ?? 0) + 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  const out = top && top[1] > skips && (!second || top[1] > second[1]) ? top[0] : null;
  return { counts, skips, out };
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
    this.cureStationReadyAt = 0;
    this.meetingReadyAt = now + RULES.meetingFirstDelay;
    for (const p of players) {
      const player = {
        ...p,
        alive: true,
        quarantined: false,
        hand: this.draw(handSize),
        cooldownUntil: 0,
        stunnedUntil: 0,
        infectedAt: p.role === 'infected' ? now : null, // when they turned (infection signs grow from here)
        turnsAt: null, // set while bitten: when the incubation ends
        bittenBy: null,
        hungerAt: p.role === 'infected' ? now + RULES.hunger : null, // starving from this time on
        starving: false,
        nextGrowlAt: 0,
        cleanUntil: 0, // Clean badge from the Blood Test
        meetingsLeft: RULES.meetingsPerPlayer,
        nextZombieAt: 0,
        startedInfected: p.role === 'infected',
        stats: { duels: 0, won: 0, lost: 0, infections: 0, kills: 0, tests: 0, misfires: 0 },
      };
      this.players.set(p.id, player);
      if (player.role === 'infected') this.growZombies(player, RULES.zombieStart, now);
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

  /** Living players on a team (bitten players are still 'human' until they turn). */
  living(role) {
    return this.list().filter((p) => p.alive && p.role === role);
  }

  isBitten(id) {
    return this.get(id).turnsAt !== null;
  }

  hasBadge(id, now) {
    return now < this.get(id).cleanUntil;
  }

  isStarving(id, now) {
    const p = this.get(id);
    return p.alive && p.role === 'infected' && p.hungerAt !== null && now >= p.hungerAt;
  }

  /**
   * 'infected' once no living human is left (bitten humans still count until they turn),
   * 'humans' once every infected is gone and nobody is left bitten, otherwise null.
   */
  winner() {
    if (this.living('human').length === 0) return 'infected';
    if (this.living('infected').length === 0 && !this.living('human').some((p) => p.turnsAt !== null)) return 'humans';
    return null;
  }

  /** At 0:00 humans win only if someone is still human and NOT bitten. */
  timeUpWinner() {
    return this.living('human').some((p) => p.turnsAt === null) ? 'humans' : 'infected';
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

  zombieCount(p) {
    return p.hand.filter((c) => c.kind === 'zombie').length;
  }

  /** Give an infected player Zombie cards (up to the max) and restart their growth timer. */
  growZombies(p, n, now) {
    for (let i = 0; i < n && this.zombieCount(p) < RULES.zombieMax; i++) p.hand.push(zombieCard());
    p.nextZombieAt = now + RULES.zombieRegen;
  }

  /**
   * Time passes: Zombie cards regrow, bitten players turn (or are saved by a Cure
   * card they picked up), zombies start starving and growl.
   * @returns {{type:'zombie-grew'|'turned'|'cured'|'starving'|'growl', player:string}[]}
   */
  tick(now) {
    const events = [];
    for (const p of this.list()) {
      if (!p.alive) continue;
      if (p.turnsAt !== null) {
        const cure = p.hand.findIndex((c) => c.kind === 'cure');
        if (cure >= 0) {
          this.discard.push(...p.hand.splice(cure, 1));
          this.cureBite(p);
          events.push({ type: 'cured', player: p.id, via: 'card' });
        } else if (now >= p.turnsAt) {
          this.turn(p, now);
          events.push({ type: 'turned', player: p.id });
        }
        continue;
      }
      if (p.role !== 'infected') continue;
      if (now >= p.nextZombieAt) {
        const before = this.zombieCount(p);
        this.growZombies(p, 1, now);
        if (this.zombieCount(p) > before) events.push({ type: 'zombie-grew', player: p.id });
      }
      const starving = this.isStarving(p.id, now);
      if (starving && !p.starving) {
        p.nextGrowlAt = now + RULES.growlEvery;
        events.push({ type: 'starving', player: p.id });
      } else if (starving && now >= p.nextGrowlAt) {
        p.nextGrowlAt = now + RULES.growlEvery;
        events.push({ type: 'growl', player: p.id });
      }
      p.starving = starving;
    }
    return events;
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
    if (!a.alive || !b.alive) return { ok: false, reason: 'dead' };
    if (this.isExhausted(aId)) return { ok: false, reason: 'exhausted' };
    if (this.isExhausted(bId)) return { ok: false, reason: 'target-exhausted' };
    if (now < a.stunnedUntil) return { ok: false, reason: 'stunned' };
    if (now < b.stunnedUntil) return { ok: false, reason: 'target-stunned' };
    if (now < a.cooldownUntil) return { ok: false, reason: 'cooldown', wait: a.cooldownUntil - now };
    if (now < b.cooldownUntil) return { ok: false, reason: 'target-cooldown', wait: b.cooldownUntil - now };
    return { ok: true };
  }

  takeCard(p, cardId) {
    const i = p.hand.findIndex((c) => c.id === cardId);
    if (i < 0) throw new Error(`${p.id} doesn't hold ${cardId}`);
    const card = p.hand[i];
    if (!isPlayable(card)) throw new Error(`${card.id} can't be played in a duel`);
    p.hand.splice(i, 1);
    return card;
  }

  /** Highest number card (or null). */
  bestNumber(id) {
    return this.get(id).hand.filter((c) => c.kind === 'number').sort((x, y) => y.value - x.value)[0] ?? null;
  }

  firstOf(id, kind) {
    return this.get(id).hand.find((c) => c.kind === kind) ?? null;
  }

  randomCard(id) {
    const playable = this.get(id).hand.filter(isPlayable);
    return playable[Math.floor(this.rng() * playable.length)] ?? null;
  }

  /** A Zombie card hit a human: the incubation starts. The biter is fed. */
  bite(p, by, now) {
    p.turnsAt = now + RULES.incubation;
    p.bittenBy = by.id;
    by.stats.infections++;
    by.hungerAt = now + RULES.hunger;
    by.starving = false;
  }

  cureBite(p) {
    p.turnsAt = null;
    p.bittenBy = null;
  }

  /** The incubation is over: they join the infected. */
  turn(p, now) {
    p.role = 'infected';
    p.infectedAt = now;
    p.turnsAt = null;
    p.hungerAt = now + RULES.hunger;
    this.growZombies(p, 1, now);
  }

  kill(p, by) {
    p.alive = false;
    by.stats.kills++;
    this.discard.push(...p.hand.splice(0));
  }

  /**
   * Play out a duel. Returns everything that happened, for the UI.
   * Numbers: the winner takes the loser's card. Zombie beats a number and bites
   * (a Cure blocks it). Gun kills a Zombie; against a number it misfires and the
   * shooter is stunned. Two infected = a fake duel: both keep their cards.
   * A human who beats an infected with a number gets a clue; the infected is stunned.
   */
  settleDuel(aId, bId, cardIdA, cardIdB, now) {
    const check = this.canChallenge(aId, bId, now);
    if (!check.ok) throw new Error(`Duel not allowed: ${check.reason}`);
    const a = this.get(aId);
    const b = this.get(bId);
    const cardA = this.takeCard(a, cardIdA);
    const cardB = this.takeCard(b, cardIdB);
    let result = resolveDuel(cardA, cardB);
    const out = { result, cards: { [aId]: cardA, [bId]: cardB }, winnerId: null, loserId: null, effects: [] };
    a.cooldownUntil = now + RULES.duelCooldown;
    b.cooldownUntil = now + RULES.duelCooldown;
    a.stats.duels++;
    b.stats.duels++;

    if (a.role === 'infected' && b.role === 'infected') {
      // allies put on a show: from outside it looks like any duel
      out.result = result = { ...result, winner: null, kind: 'fake' };
      a.hand.push(cardA);
      b.hand.push(cardB);
      out.effects.push({ type: 'fake' });
      return out;
    }
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

    switch (result.kind) {
      case 'kill':
        this.discard.push(wCard, lCard);
        this.kill(loser, winner);
        out.effects.push({ type: 'killed', player: loser.id, by: winner.id });
        break;
      case 'infect': {
        this.discard.push(wCard);
        loser.hand.push(lCard); // the number card goes back; the Zombie is what hurts
        const cure = loser.hand.findIndex((c) => c.kind === 'cure');
        if (loser.turnsAt !== null) {
          out.effects.push({ type: 'already-bitten', player: loser.id, by: winner.id });
        } else if (cure >= 0) {
          this.discard.push(...loser.hand.splice(cure, 1));
          out.effects.push({ type: 'cured', player: loser.id, by: winner.id });
        } else {
          this.bite(loser, winner, now);
          out.effects.push({ type: 'bitten', player: loser.id, by: winner.id, turnsAt: loser.turnsAt });
        }
        break;
      }
      case 'misfire':
        // public: everyone hears the shot, and the shooter is stunned
        this.discard.push(lCard);
        winner.hand.push(wCard);
        loser.stunnedUntil = now + RULES.stunTime;
        loser.stats.misfires++;
        out.effects.push({ type: 'misfire', player: loser.id, target: winner.id, until: loser.stunnedUntil });
        break;
      default: // number vs number
        winner.hand.push(wCard, lCard);
        out.effects.push({ type: 'card-taken', from: loser.id, to: winner.id, card: lCard });
        if (winner.role === 'human' && loser.role === 'infected') {
          loser.stunnedUntil = now + RULES.stunTime;
          out.effects.push({ type: 'stunned', player: loser.id, until: loser.stunnedUntil });
          out.effects.push({ type: 'clue', to: winner.id, about: loser.id, text: this.clueText(), genuine: true });
        } else if (winner.role === 'human' && loser.role === 'human' && this.rng() < RULES.falseClueChance) {
          out.effects.push({ type: 'clue', to: winner.id, about: loser.id, text: this.clueText(), genuine: false });
        }
    }
    return out;
  }

  clueText() {
    return CLUES[Math.floor(this.rng() * CLUES.length)];
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
        p.hand.push(extra);
        drawn.push(extra);
      } else this.discard.push(extra);
    }
    return drawn;
  }

  /**
   * Blood Test (Medbay). Positive for infected AND bitten players; the result is public.
   * Negative gives a Clean badge for 60s. The badge says nothing about what happens after.
   */
  bloodTest(id, now) {
    const p = this.get(id);
    p.stats.tests++;
    const positive = p.role === 'infected' || p.turnsAt !== null;
    p.cleanUntil = positive ? 0 : now + RULES.cleanBadge;
    return { positive, cleanUntil: p.cleanUntil };
  }

  /** Cure Lab machine: saves a bitten player, then needs to recharge. */
  useCureStation(id, now) {
    const p = this.get(id);
    if (now < this.cureStationReadyAt) return { cured: false, reason: 'recharging', wait: this.cureStationReadyAt - now };
    if (p.turnsAt === null) return { cured: false, reason: p.role === 'infected' ? 'too-late' : 'not-bitten' };
    this.cureBite(p);
    this.cureStationReadyAt = now + RULES.cureStationRecharge;
    return { cured: true };
  }

  // ------------------------------------------------------------ meetings
  canCallMeeting(id, now) {
    const p = this.get(id);
    if (!p.alive) return { ok: false, reason: 'dead' };
    if (p.meetingsLeft <= 0) return { ok: false, reason: 'used' };
    if (now < this.meetingReadyAt) return { ok: false, reason: 'cooldown', wait: this.meetingReadyAt - now };
    return { ok: true };
  }

  callMeeting(id, now) {
    const check = this.canCallMeeting(id, now);
    if (!check.ok) throw new Error(`Meeting not allowed: ${check.reason}`);
    this.get(id).meetingsLeft--;
  }

  /** Meetings pause the match: push every running timer back by `ms` (those still pending after `from`). */
  shiftTimers(from, ms) {
    const later = (t) => (t !== null && t > from ? t + ms : t);
    for (const p of this.list()) {
      p.cooldownUntil = later(p.cooldownUntil);
      p.stunnedUntil = later(p.stunnedUntil);
      p.nextZombieAt = later(p.nextZombieAt);
      p.turnsAt = later(p.turnsAt);
      p.hungerAt = later(p.hungerAt);
      p.cleanUntil = later(p.cleanUntil);
      p.nextGrowlAt = later(p.nextGrowlAt);
      if (p.infectedAt !== null) p.infectedAt += ms; // signs keep the strength they had
    }
    this.cureStationReadyAt = later(this.cureStationReadyAt);
  }

  /** Voted out: sent to the Quarantine Cell. Out of the match, role kept secret. */
  quarantine(id) {
    const p = this.get(id);
    p.alive = false;
    p.quarantined = true;
    this.discard.push(...p.hand.splice(0));
  }
}
