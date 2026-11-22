// Match state and rules (GAME_GUIDE.txt is the rulebook): roles, hands, Zombie
// cards, instant bites, Guns with bullets, Cures and the 60s cure quarantine,
// secret Gun hand-offs, hunger, meetings and votes, cooldowns, refills and win
// conditions. Pure logic with no rendering, so the server can run it in
// Phase 4. Times are passed in (ms).
import { RULES, infectedCount } from './constants.js';
import { createRng, createDeck, decksFor, shuffle, isHumanOnly, zombieCard } from './cards.js';
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
    this.meetingReadyAt = now + RULES.meetingFirstDelay;
    for (const p of players) {
      const player = {
        ...p,
        alive: true,
        quarantined: false, // voted out (permanent)
        shot: false,
        hand: [],
        cooldownUntil: 0,
        stunnedUntil: 0,
        infectedAt: p.role === 'infected' ? now : null, // when they turned (infection signs grow from here)
        hungerAt: p.role === 'infected' ? now + RULES.hunger : null, // starving from this time on
        starving: false,
        nextGrowlAt: 0,
        cellUntil: 0, // Cure user: in the quarantine cell until then (temporary)
        gagUntil: 0, // no quick-chat or voting until then
        recoverUntil: 0, // freshly cured: can't be bitten until then
        meetingsLeft: RULES.meetingsPerPlayer,
        nextZombieAt: 0,
        startedInfected: p.role === 'infected',
        stats: { duels: 0, won: 0, lost: 0, infections: 0, kills: 0, cures: 0, timesCured: 0 },
      };
      this.players.set(p.id, player);
      this.deal(player, handSize);
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

  /** Players still in the match on a team (a human in the cure quarantine still counts). */
  living(role) {
    return this.list().filter((p) => p.alive && p.role === role);
  }

  inCell(id, now) {
    return now < this.get(id).cellUntil;
  }

  isGagged(id, now) {
    return now < this.get(id).gagUntil;
  }

  isRecovering(id, now) {
    return now < this.get(id).recoverUntil;
  }

  isStarving(id, now) {
    const p = this.get(id);
    return p.alive && p.role === 'infected' && p.hungerAt !== null && now >= p.hungerAt;
  }

  /** 'infected' once no human is left, 'humans' once every zombie is shot, voted out or cured, otherwise null. */
  winner() {
    if (this.living('human').length === 0) return 'infected';
    if (this.living('infected').length === 0) return 'humans';
    return null;
  }

  /** At 0:00 humans win if at least one human is left. */
  timeUpWinner() {
    return this.living('human').length ? 'humans' : 'infected';
  }

  // ------------------------------------------------------------ cards
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

  /** May `p` hold this card? Zombies never hold Guns or Cures; nobody holds more than one Gun. */
  allowed(p, card) {
    if (isHumanOnly(card) && p.role === 'infected') return false;
    if (card.kind === 'gun' && p.hand.filter((c) => c.kind === 'gun').length >= RULES.maxGuns) return false;
    return true;
  }

  /** Give `p` up to `n` cards they may hold; anything else goes to the discard pile. */
  deal(p, n) {
    const got = [];
    let guard = 0;
    while (got.length < n && guard++ < 200) {
      const [card] = this.draw(1);
      if (!card) break;
      if (this.allowed(p, card)) {
        p.hand.push(card);
        got.push(card);
      } else this.trash(card);
    }
    return got;
  }

  /** Throw cards away. Zombie cards just vanish: they never go into the deck. */
  trash(...cards) {
    this.discard.push(...cards.filter((c) => c.kind !== 'zombie'));
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
   * Time passes: Zombie cards regrow, zombies start starving and growl, Cure users leave the cell.
   * @returns {{type:'zombie-grew'|'starving'|'growl'|'released', player:string}[]}
   */
  tick(now) {
    const events = [];
    for (const p of this.list()) {
      if (!p.alive) continue;
      if (p.cellUntil && now >= p.cellUntil) {
        p.cellUntil = 0;
        events.push({ type: 'released', player: p.id });
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

  /** Exhausted = no card at all to play in a duel. */
  isExhausted(id) {
    return this.get(id).hand.length === 0;
  }

  /** Can `aId` challenge `bId` right now? (Distance is checked by the caller.) */
  canChallenge(aId, bId, now) {
    const a = this.get(aId);
    const b = this.get(bId);
    if (aId === bId) return { ok: false, reason: 'self' };
    if (!a.alive || !b.alive) return { ok: false, reason: 'dead' };
    if (this.inCell(aId, now)) return { ok: false, reason: 'in-cell' };
    if (this.inCell(bId, now)) return { ok: false, reason: 'target-in-cell' };
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
    return p.hand.splice(i, 1)[0];
  }

  /** Highest number card (or null). */
  bestNumber(id) {
    return this.get(id).hand.filter((c) => c.kind === 'number').sort((x, y) => y.value - x.value)[0] ?? null;
  }

  firstOf(id, kind) {
    return this.get(id).hand.find((c) => c.kind === kind) ?? null;
  }

  randomCard(id) {
    const hand = this.get(id).hand;
    return hand[Math.floor(this.rng() * hand.length)] ?? null;
  }

  // ------------------------------------------------------------ what can happen to a player
  /**
   * A Zombie card hit a human: they turn AT ONCE. Their Guns (and any Cures) are
   * discarded and secretly handed to random other humans (or back to the supply).
   * @returns {{card, to: string|null}[]} where each card went (secret: for the UI of the receiver only)
   */
  bite(p, by, now) {
    by.stats.infections++;
    by.hungerAt = now + RULES.hunger;
    by.starving = false;
    const lost = p.hand.filter(isHumanOnly);
    p.hand = p.hand.filter((c) => !isHumanOnly(c));
    p.role = 'infected';
    p.infectedAt = now;
    p.hungerAt = now + RULES.hunger;
    p.starving = false;
    p.recoverUntil = 0;
    this.growZombies(p, 1, now);
    return lost.map((card) => {
      const takers = this.list().filter((q) => q.alive && q.role === 'human' && q.id !== p.id && this.allowed(q, card));
      const to = takers.length ? takers[Math.floor(this.rng() * takers.length)] : null;
      if (to) to.hand.push(card);
      else this.deck.splice(Math.floor(this.rng() * (this.deck.length + 1)), 0, card); // back to the refill supply
      return { card, to: to?.id ?? null };
    });
  }

  /** A Cure hit a zombie: they become human, lose their Zombie cards, are gagged and recovering. */
  cureZombie(p, by, now) {
    p.role = 'human';
    p.hand = p.hand.filter((c) => c.kind !== 'zombie');
    p.infectedAt = null;
    p.hungerAt = null;
    p.starving = false;
    p.gagUntil = now + RULES.gagTime;
    p.recoverUntil = now + RULES.recoverTime;
    p.stats.timesCured++;
    by.stats.cures++;
  }

  /** The Cure user goes to the quarantine cell for 60s: can't move, duel, chat, vote or be voted out. */
  sendToCell(p, now) {
    p.cellUntil = now + RULES.cureQuarantine;
    p.gagUntil = Math.max(p.gagUntil, p.cellUntil);
    p.cooldownUntil = Math.max(p.cooldownUntil, p.cellUntil);
  }

  kill(p, by) {
    p.alive = false;
    p.shot = true;
    by.stats.kills++;
    this.trash(...p.hand.splice(0));
  }

  /** A played Gun loses a bullet; it goes back to the hand while bullets are left. */
  spendBullet(p, card) {
    card.bullets = (card.bullets ?? RULES.gunBullets) - 1;
    if (card.bullets > 0) p.hand.push(card);
    else this.trash({ ...card, bullets: RULES.gunBullets }); // reloaded if it is ever drawn again
  }

  /**
   * Play out a duel. Returns everything that happened, for the UI.
   *   numbers   winner takes the loser's card; a human beating a zombie gets a clue, the zombie is stunned
   *   zombie    bites a human (they turn at once) unless they hold a Cure: then the zombie is cured
   *             and the Cure holder goes to the cell
   *   gun       kills whoever it is played on; the shooter is stunned 8s; uses a bullet
   *   cure      on a Zombie card: no bite, zombie cured, Cure user to the cell
   *             on a number: a zombie is cured (but wins the duel), a human just wins (Cure wasted)
   *   two zombies = a fake duel: both keep their cards
   */
  settleDuel(aId, bId, cardIdA, cardIdB, now) {
    const check = this.canChallenge(aId, bId, now);
    if (!check.ok) throw new Error(`Duel not allowed: ${check.reason}`);
    const a = this.get(aId);
    const b = this.get(bId);
    const cardA = this.takeCard(a, cardIdA);
    const cardB = this.takeCard(b, cardIdB);
    let result = resolveDuel(cardA, cardB);
    const out = { result, cards: { [aId]: { ...cardA }, [bId]: { ...cardB } }, winnerId: null, loserId: null, effects: [] };
    a.cooldownUntil = now + RULES.duelCooldown;
    b.cooldownUntil = now + RULES.duelCooldown;
    a.stats.duels++;
    b.stats.duels++;
    // a played card goes back to its owner (Guns lose a bullet)
    const giveBack = (p, card) => (card.kind === 'gun' ? this.spendBullet(p, card) : p.hand.push(card));

    if (a.role === 'infected' && b.role === 'infected') {
      // allies put on a show: from outside it looks like any duel
      out.result = result = { ...result, winner: null, kind: 'fake' };
      giveBack(a, cardA);
      giveBack(b, cardB);
      out.effects.push({ type: 'fake' });
      return out;
    }
    if (!result.winner) {
      giveBack(a, cardA);
      giveBack(b, cardB);
      out.effects.push({ type: 'draw' });
      return out;
    }
    const [winner, loser, wCard, lCard] = result.winner === 'a' ? [a, b, cardA, cardB] : [b, a, cardB, cardA];
    out.winnerId = winner.id;
    out.loserId = loser.id;
    winner.stats.won++;
    loser.stats.lost++;

    switch (result.kind) {
      case 'kill': {
        this.spendBullet(winner, wCard);
        this.trash(lCard);
        this.kill(loser, winner);
        winner.stunnedUntil = now + RULES.shotStun;
        out.effects.push({ type: 'killed', player: loser.id, by: winner.id, until: winner.stunnedUntil });
        break;
      }
      case 'infect': {
        // the number card goes back; the Zombie card is what hurts
        loser.hand.push(lCard);
        const cure = loser.hand.findIndex((c) => c.kind === 'cure');
        if (this.isRecovering(loser.id, now)) {
          out.effects.push({ type: 'immune', player: loser.id, by: winner.id });
        } else if (cure >= 0) {
          this.trash(...loser.hand.splice(cure, 1));
          this.cureZombie(winner, loser, now);
          this.sendToCell(loser, now);
          out.effects.push({ type: 'cured', player: winner.id, by: loser.id, via: 'held' });
          out.effects.push({ type: 'cell', player: loser.id, until: loser.cellUntil });
        } else {
          const moved = this.bite(loser, winner, now);
          out.effects.push({ type: 'bitten', player: loser.id, by: winner.id });
          for (const m of moved) out.effects.push({ type: 'handed', card: m.card, from: loser.id, to: m.to });
        }
        break; // the Zombie card is used up
      }
      case 'cure': {
        // Cure vs Zombie card: no bite, the zombie is cured, the Cure user goes to the cell
        this.trash(wCard);
        this.cureZombie(loser, winner, now);
        this.sendToCell(winner, now);
        out.effects.push({ type: 'cured', player: loser.id, by: winner.id, via: 'played' });
        out.effects.push({ type: 'cell', player: winner.id, until: winner.cellUntil });
        break;
      }
      case 'cure-number': {
        // the number wins the duel; the Cure only works on a zombie (either way it is used up)
        winner.hand.push(wCard);
        this.trash(lCard);
        if (winner.role === 'infected') {
          this.cureZombie(winner, loser, now);
          this.sendToCell(loser, now);
          out.effects.push({ type: 'cured', player: winner.id, by: loser.id, via: 'played' });
          out.effects.push({ type: 'cell', player: loser.id, until: loser.cellUntil });
        } else out.effects.push({ type: 'cure-wasted', player: loser.id });
        break;
      }
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

  /** Exhausted players refill to 4 cards at a supply box. Zombies never get a Gun or a Cure. */
  refill(id) {
    const p = this.get(id);
    if (!this.isExhausted(id)) return [];
    return this.deal(p, Math.max(1, RULES.refillTo - p.hand.length));
  }

  // ------------------------------------------------------------ meetings
  canCallMeeting(id, now) {
    const p = this.get(id);
    if (!p.alive) return { ok: false, reason: 'dead' };
    if (this.inCell(id, now)) return { ok: false, reason: 'in-cell' };
    if (p.meetingsLeft <= 0) return { ok: false, reason: 'used' };
    if (now < this.meetingReadyAt) return { ok: false, reason: 'cooldown', wait: this.meetingReadyAt - now };
    return { ok: true };
  }

  callMeeting(id, now) {
    const check = this.canCallMeeting(id, now);
    if (!check.ok) throw new Error(`Meeting not allowed: ${check.reason}`);
    this.get(id).meetingsLeft--;
  }

  /** Who may vote / speak in a meeting: in the match and not gagged. */
  canVote(id, now) {
    const p = this.get(id);
    return p.alive && !this.isGagged(id, now);
  }

  /** Who may be voted out: in the match and not inside the 60s cure quarantine. */
  canBeVoted(id, now) {
    return this.get(id).alive && !this.inCell(id, now);
  }

  /** Meetings pause the match: push every running timer back by `ms` (those still pending after `from`). */
  shiftTimers(from, ms) {
    const later = (t) => (t !== null && t > from ? t + ms : t);
    for (const p of this.list()) {
      p.cooldownUntil = later(p.cooldownUntil);
      p.stunnedUntil = later(p.stunnedUntil);
      p.nextZombieAt = later(p.nextZombieAt);
      p.hungerAt = later(p.hungerAt);
      p.nextGrowlAt = later(p.nextGrowlAt);
      p.cellUntil = later(p.cellUntil);
      p.gagUntil = later(p.gagUntil);
      p.recoverUntil = later(p.recoverUntil);
      if (p.infectedAt !== null) p.infectedAt += ms; // signs keep the strength they had
    }
  }

  /** Voted out: sent to the Quarantine Cell for good. Out of the match, role kept secret. */
  quarantine(id) {
    const p = this.get(id);
    p.alive = false;
    p.quarantined = true;
    this.trash(...p.hand.splice(0));
  }
}
