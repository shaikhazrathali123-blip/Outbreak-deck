// Match state and rules (GAME_GUIDE.txt is the rulebook): roles, hands, Zombie
// cards, instant bites, Guns with bullets, Cures and the 60s cure quarantine,
// secret Gun hand-offs, hunger, meetings and votes, cooldowns, refills and win
// conditions. Pure logic with no rendering, so the server can run it in
// Phase 4. Times are passed in (ms).
import { RULES, POINTS, infectedCount, lobbyRules } from './constants.js';
import { createRng, createDeck, decksFor, shuffle, isHumanOnly, zombieCard, gunCard } from './cards.js';
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
  constructor({ players, seed = Date.now(), handSize = RULES.handSize, now = 0, rules = {} }) {
    this.rng = createRng(seed);
    // v3: balance by lobby size (lobbyRules), then the match modifier's overrides on top
    this.rules = { ...RULES, ...lobbyRules(players.length), ...rules };
    this.deck = createDeck(this.rng, decksFor(players.length), { guns: this.rules.deckGuns, cures: this.rules.deckCures });
    this.discard = [];
    this.players = new Map();
    this.meetingReadyAt = now + RULES.meetingFirstDelay;
    this.time = now; // the latest match time seen (tick / duel): the time bonus counts up to it
    this.accused = new Set(); // v3: everyone named in a meeting accusation (zombies never named earn the stealth bonus)
    this.parts = []; // v3: generator parts (setupParts)
    this.powerAt = null; // when the power came back (all parts fitted)
    this.evacAt = null; // when the evac truck reaches the Entrance
    this.blackoutsLeft = RULES.blackouts;
    this.blackoutUntil = 0;
    this.blackoutReadyAt = now + RULES.blackoutFirstDelay;
    this.lastStandFor = null; // the last human, once Last Stand fired
    this.finished = false; // end-of-match bonuses paid
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
        // starving from this time on; only runs while holding a Zombie card (null = no card, not hungry)
        hungerAt: p.role === 'infected' ? now + RULES.hunger : null,
        starving: false,
        nextGrowlAt: 0,
        cellUntil: 0, // Cure user: in the quarantine cell until then (temporary)
        gagUntil: 0, // no quick-chat or voting until then
        recoverUntil: 0, // freshly cured: can't be bitten until then
        meetingsLeft: RULES.meetingsPerPlayer,
        callsLeft: RULES.callsPerPlayer, // v3: bluff calls left
        reported: false, // v3: this body was reported (a shot player)
        nextZombieAt: 0,
        startedInfected: p.role === 'infected',
        stats: { duels: 0, won: 0, lost: 0, infections: 0, kills: 0, cures: 0, timesCured: 0, timesBitten: 0 },
        earned: {}, // banked points by reason: { 'shot-zombie': { count, points }, ... } (results screen)
        finalParts: null, // the score breakdown, frozen with finalScore
        shotBy: null,
        bank: 0, // banked points (shots, bites, wasted Cures); see score()
        finalScore: null, // frozen when shot or voted out
        roleSince: now, // the time bonus counts from here; reset when the role changes
      };
      this.players.set(p.id, player);
    }
    // 40% of the humans start armed: a Gun from the deck (a new one if the deck has none left)
    const humans = shuffle(this.list().filter((p) => p.role === 'human'), this.rng);
    this.armed = new Set(humans.slice(0, Math.round(humans.length * Math.min(1, this.rules.startGunShare))).map((p) => p.id));
    for (const player of this.list()) {
      if (handSize > 0 && this.armed.has(player.id)) {
        const i = this.deck.findIndex((c) => c.kind === 'gun');
        player.hand.push(i >= 0 ? this.deck.splice(i, 1)[0] : gunCard());
        this.deal(player, handSize - 1);
      } else this.deal(player, handSize, (c) => c.kind !== 'gun'); // the rest start without a Gun
      if (player.role === 'infected') this.growZombies(player, RULES.zombieStart);
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

  /**
   * At 0:00 the bigger team wins: more zombies than humans = 'infected', otherwise 'humans'
   * (a tie goes to the humans: they held out). Shot and voted-out players don't count;
   * a Cure user in the cell counts as a human.
   */
  timeUpWinner() {
    return this.living('infected').length > this.living('human').length ? 'infected' : 'humans';
  }

  // ------------------------------------------------------------ score (secret)
  /** Points for the cards in a hand: a number is worth its number, a Gun 10 per bullet left, Cure 30, Zombie 0. */
  handPoints(p) {
    const value = (c) =>
      c.kind === 'number' ? c.value : c.kind === 'gun' ? (c.bullets ?? RULES.gunBullets) * POINTS.perBullet : POINTS[c.kind] ?? 0;
    return p.hand.reduce((sum, c) => sum + value(c), 0);
  }

  /** A player's score: hand points + banked points (frozen once they are shot or voted out). */
  score(id) {
    const p = this.get(id);
    return p.finalScore ?? this.handPoints(p) + p.bank + this.timeBonus(id);
  }

  /** +10 for every full minute in your current role (human or zombie); back to 0 when it changes. */
  timeBonus(id) {
    const p = this.get(id);
    return Math.floor(Math.max(0, this.time - p.roleSince) / 60000) * POINTS.perMinute;
  }

  /**
   * Bank points and report them (only the player's own screen ever shows this).
   * `shown` = the change to their score, when a card leaving the hand is part of it.
   */
  award(p, amount, reason, effects, shown = amount) {
    p.bank += amount;
    const tally = (p.earned[reason] ??= { count: 0, points: 0 });
    tally.count++;
    tally.points += amount;
    effects.push({ type: 'points', player: p.id, amount: shown, reason });
  }

  /** Where a score comes from: card points in hand + time bonus + banked points by reason. Adds up to score(). */
  scoreParts(id) {
    const p = this.get(id);
    if (p.finalParts) return p.finalParts;
    const earned = Object.fromEntries(Object.entries(p.earned).map(([k, v]) => [k, { ...v }]));
    const parts = { cards: this.handPoints(p), timeBonus: this.timeBonus(id), earned };
    return { ...parts, total: parts.cards + parts.timeBonus + p.bank };
  }

  /** Freeze the score (and its breakdown) when a player leaves the match. */
  freezeScore(p) {
    p.finalParts = this.scoreParts(p.id);
    p.finalScore = p.finalParts.total;
  }

  /** Highest score first (ties share a place). */
  ranking() {
    return this.list().map((p) => ({ id: p.id, score: this.score(p.id) })).sort((x, y) => y.score - x.score);
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

  /** May `p` hold this card? Zombies never hold Guns or Cures; a human holds ONE of them at most (a Gun or a Cure). */
  allowed(p, card) {
    if (!isHumanOnly(card)) return true;
    if (p.role === 'infected') return false;
    return p.hand.filter(isHumanOnly).length < RULES.maxSpecials;
  }

  /** Give `p` up to `n` cards they may hold (and `ok` lets through); anything else goes to the discard pile. */
  deal(p, n, ok = () => true) {
    const got = [];
    let guard = 0;
    while (got.length < n && guard++ < 200) {
      const [card] = this.draw(1);
      if (!card) break;
      if (this.allowed(p, card) && ok(card)) {
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

  /** Give an infected player Zombie cards, up to the max (one). */
  growZombies(p, n) {
    for (let i = 0; i < n && this.zombieCount(p) < RULES.zombieMax; i++) p.hand.push(zombieCard());
  }

  /** The Zombie card was used (or the player just turned): the next one grows zombieRegen() from now. */
  startZombieRegrow(p, now) {
    p.nextZombieAt = now + this.zombieRegen();
  }

  /** v3: one regrow time per lobby size (lobbyRules), changed only by a match modifier. */
  zombieRegen() {
    return this.rules.zombieRegen;
  }

  /**
   * Time passes: Zombie cards regrow, zombies start starving and growl, Cure users leave the cell.
   * @returns {{type:'zombie-grew'|'starving'|'growl'|'released', player:string}[]}
   */
  tick(now) {
    this.time = Math.max(this.time, now);
    const events = [];
    for (const p of this.list()) {
      if (!p.alive) continue;
      if (p.cellUntil && now >= p.cellUntil) {
        p.cellUntil = 0;
        events.push({ type: 'released', player: p.id });
      }
      if (p.role !== 'infected') continue;
      // the timer only runs while the hand has no Zombie card (it starts when the card is used)
      if (this.zombieCount(p) < RULES.zombieMax && now >= p.nextZombieAt) {
        this.growZombies(p, 1);
        p.hungerAt = now + RULES.hunger; // the hunger clock starts once they can bite again
        events.push({ type: 'zombie-grew', player: p.id });
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
   * A Zombie card hit a human: they turn AT ONCE. Their Gun or Cure is discarded and
   * secretly handed to a random other human who holds neither (or back to the supply).
   * @returns {{card, to: string|null}[]} where each card went (secret: for the UI of the receiver only)
   */
  bite(p, by, now) {
    by.stats.infections++;
    p.stats.timesBitten++;
    by.hungerAt = null; // fed: no hunger until the next Zombie card grows
    by.starving = false;
    const lost = p.hand.filter(isHumanOnly);
    p.hand = p.hand.filter((c) => !isHumanOnly(c));
    p.role = 'infected';
    p.roleSince = now; // the time bonus earned as a human is gone
    p.infectedAt = now;
    p.hungerAt = null; // their hunger starts when their first Zombie card grows
    p.starving = false;
    p.recoverUntil = 0;
    this.startZombieRegrow(p, now); // a new zombie grows their first Zombie card 75s (+20s per other zombie) after turning
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
    p.roleSince = now; // the time bonus earned as a zombie is gone
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
    this.freezeScore(p); // a shot player keeps the score they had
    p.shotBy = by.id;
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
   *   zombie    bites a human: they turn at once (a Cure in their hand doesn't help; only a played Cure does)
   *   gun       kills whoever it is played on; the shooter is stunned 8s; uses a bullet
   *   cure      on a Zombie card: no bite, zombie cured, Cure user to the cell
   *             on a number: a zombie is cured (but wins the duel), a human just wins (Cure wasted)
   *   two zombies = a fake duel: both keep their cards
   */
  settleDuel(aId, bId, cardIdA, cardIdB, now, calls = {}) {
    this.time = Math.max(this.time, now);
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
    // v3: bluff calls. A right call cancels the named card and wins the duel; a wrong one costs points.
    if (this.resolveCalls(a, b, cardA, cardB, calls, out, now, giveBack)) return out;
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
        const hitZombie = loser.role === 'infected';
        this.spendBullet(winner, wCard);
        this.trash(lCard);
        this.kill(loser, winner);
        if (RULES.shotStun > 0) winner.stunnedUntil = now + RULES.shotStun;
        out.effects.push({ type: 'killed', player: loser.id, by: winner.id, until: winner.stunnedUntil });
        // the spent bullet leaves the Gun's points: a hit on a zombie banks it back (+40 net), a human hit does not (-20 net)
        if (hitZombie) this.award(winner, POINTS.perBullet + POINTS.shotZombie, 'shot-zombie', out.effects, POINTS.shotZombie);
        else this.award(winner, POINTS.shotHuman, 'shot-human', out.effects, POINTS.shotHuman - POINTS.perBullet);
        break;
      }
      case 'infect': {
        // the number card goes back; the Zombie card is what hurts.
        // A Cure in the hand does NOT protect you: you can't use a Cure on yourself.
        loser.hand.push(lCard);
        if (this.isRecovering(loser.id, now)) {
          out.effects.push({ type: 'immune', player: loser.id, by: winner.id });
        } else {
          const moved = this.bite(loser, winner, now);
          out.effects.push({ type: 'bitten', player: loser.id, by: winner.id });
          this.award(winner, POINTS.bite, 'bite', out.effects);
          for (const m of moved) out.effects.push({ type: 'handed', card: m.card, from: loser.id, to: m.to });
        }
        this.startZombieRegrow(winner, now); // after the bite: the regrow counts the new zombie too
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
        } else {
          out.effects.push({ type: 'cure-wasted', player: loser.id });
          this.award(loser, POINTS.cureWasted, 'cure-wasted', out.effects);
        }
        break;
      }
      default: // number vs number
        winner.hand.push(wCard, lCard);
        out.effects.push({ type: 'card-taken', from: loser.id, to: winner.id, card: lCard });
        this.award(winner, POINTS.numberWin, 'number-win', out.effects);
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

  canCall(id) {
    return this.get(id).callsLeft > 0;
  }

  /**
   * Bluff calls (v3): `calls` maps player id -> 'zombie' | 'gun' | 'cure', the card they say the
   * other one is playing. Every call is used up. A right call cancels that card (a Zombie card is
   * spent, a Gun loses a bullet, a Cure is thrown away) and the caller wins the duel; two right
   * calls cancel both cards. A wrong call costs points and the duel plays out as normal.
   * Two infected = a fake duel: calls are ignored (and not used up).
   * @returns {boolean} true when a right call decided the duel
   */
  resolveCalls(a, b, cardA, cardB, calls, out, now, giveBack) {
    const right = [];
    for (const [me, opp, oppCard] of [[a, b, cardB], [b, a, cardA]]) {
      const kind = calls[me.id];
      if (!kind || me.callsLeft <= 0) continue;
      me.callsLeft--;
      if (oppCard.kind === kind) right.push([me, opp, oppCard]);
      else {
        out.effects.push({ type: 'call-wrong', player: me.id, called: kind });
        this.award(me, POINTS.callWrong, 'call-wrong', out.effects);
      }
    }
    if (!right.length) return false;
    const cancel = (owner, card) => {
      if (card.kind === 'zombie') {
        owner.hungerAt = null; // no card, no hunger until the next one grows
        owner.starving = false;
        this.startZombieRegrow(owner, now);
      }
      else if (card.kind === 'gun') this.spendBullet(owner, card);
      else this.trash(card);
    };
    for (const [me, opp, oppCard] of right) {
      cancel(opp, oppCard);
      out.effects.push({ type: 'called', player: me.id, against: opp.id, card: oppCard.kind });
      this.award(me, POINTS.callRight, 'call-right', out.effects);
    }
    if (right.length === 1) {
      const [me, opp] = right[0];
      giveBack(me, me === a ? cardA : cardB);
      out.winnerId = me.id;
      out.loserId = opp.id;
      me.stats.won++;
      opp.stats.lost++;
      out.result = { ...out.result, winner: me === a ? 'a' : 'b', kind: 'called' };
    } else out.result = { ...out.result, winner: null, kind: 'called' };
    return true;
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

  /** v3: a shot body can be reported once; it calls a meeting without using your Emergency Button. */
  canReport(id, bodyId, now) {
    const p = this.get(id);
    const body = this.get(bodyId);
    if (!p.alive) return { ok: false, reason: 'dead' };
    if (this.inCell(id, now)) return { ok: false, reason: 'in-cell' };
    if (!body.shot || body.reported) return { ok: false, reason: 'no-body' };
    if (now < this.meetingReadyAt) return { ok: false, reason: 'cooldown', wait: this.meetingReadyAt - now };
    return { ok: true };
  }

  report(id, bodyId, now) {
    const check = this.canReport(id, bodyId, now);
    if (!check.ok) throw new Error(`Report not allowed: ${check.reason}`);
    this.get(bodyId).reported = true;
  }

  /** v3: someone was accused in a meeting (zombies never accused earn the stealth bonus). */
  noteAccused(id) {
    if (this.players.has(id)) this.accused.add(id);
  }

  /**
   * v3: points for the voters once a player is voted out: +20 when it helped your team
   * (a human voting out a zombie, a zombie voting out a human), -10 when it hurt it.
   * Call before quarantine() (it freezes the target's score). `votes` maps voter -> target.
   */
  rewardVoters(outId, votes) {
    const effects = [];
    const outRole = this.get(outId).role;
    for (const [voter, target] of votes) {
      if (target !== outId || voter === outId || !this.get(voter).alive) continue;
      const v = this.get(voter);
      const good = (v.role === 'human') === (outRole === 'infected');
      this.award(v, good ? POINTS.voteZombie : POINTS.voteHuman, good ? 'vote-right' : 'vote-wrong', effects);
    }
    return effects;
  }

  // ------------------------------------------------------------ v3: Last Stand
  /**
   * Once per match, when exactly one human is left (and a zombie): that human gets a
   * 1-bullet Gun (a bullet more if they already hold one; allowed next to a Cure).
   * @returns {string|null} the last human's id when it fires
   */
  checkLastStand() {
    if (this.lastStandFor) return null;
    const humans = this.living('human');
    if (humans.length !== 1 || !this.living('infected').length) return null;
    const p = humans[0];
    this.lastStandFor = p.id;
    const gun = p.hand.find((c) => c.kind === 'gun');
    if (gun) gun.bullets = (gun.bullets ?? RULES.gunBullets) + 1;
    else p.hand.push(gunCard(1));
    return p.id;
  }

  // ------------------------------------------------------------ v3: Restore Power
  /** Hide the generator parts: `spots` = places on the map ({ floor, x }); RULES.powerParts of them are used. */
  setupParts(spots) {
    this.parts = shuffle(spots, this.rng)
      .slice(0, RULES.powerParts)
      .map((spot, i) => ({ id: `part${i + 1}`, home: { ...spot }, at: { ...spot }, carrier: null, fitted: false }));
  }

  partCarried(id) {
    return this.parts.find((q) => q.carrier === id) ?? null;
  }

  /** Pick up a part lying on the floor (one at a time; anyone can, zombies too: they can hide it). */
  pickPart(id, partId, now = this.time) {
    const p = this.get(id);
    const part = this.parts.find((q) => q.id === partId);
    if (!p.alive || !part || part.fitted || part.carrier || this.partCarried(id)) return false;
    part.carrier = id;
    part.pickedAt = now; // carrying one for ages without fitting it looks suspicious
    part.at = null;
    return true;
  }

  /** Fit the carried part into the generator. All fitted = POWER RESTORED: the evac comes in RULES.evacTime. */
  fitPart(id, now) {
    const p = this.get(id);
    const part = this.partCarried(id);
    if (!p.alive || !part) return null;
    part.carrier = null;
    part.fitted = true;
    const effects = [];
    this.award(p, POINTS.part, 'part', effects);
    const restored = this.parts.every((q) => q.fitted);
    if (restored) {
      this.powerAt = now;
      this.evacAt = now + RULES.evacTime;
    }
    return { effects, restored, left: this.parts.filter((q) => !q.fitted).length };
  }

  /** A carrier left: the part drops where they stood (shot), or goes back home (voted out). */
  dropPart(id, where = null) {
    const part = this.partCarried(id);
    if (!part) return null;
    part.carrier = null;
    part.at = where ? { ...where } : { ...part.home };
    return part;
  }

  // ------------------------------------------------------------ v3: Blackout
  canBlackout(id, now) {
    const p = this.get(id);
    if (!p.alive || p.role !== 'infected') return { ok: false, reason: 'human' };
    if (this.inCell(id, now)) return { ok: false, reason: 'in-cell' };
    if (this.blackoutsLeft <= 0) return { ok: false, reason: 'used' };
    if (now < this.blackoutReadyAt) return { ok: false, reason: 'cooldown', wait: this.blackoutReadyAt - now };
    return { ok: true };
  }

  blackout(id, now) {
    const check = this.canBlackout(id, now);
    if (!check.ok) throw new Error(`Blackout not allowed: ${check.reason}`);
    this.blackoutsLeft--;
    this.blackoutUntil = now + RULES.blackoutTime;
  }

  isBlackout(now) {
    return now < this.blackoutUntil;
  }

  // ------------------------------------------------------------ v3: end of match
  /**
   * Bonuses paid once when the match ends: stealth (zombies still in, never accused) and
   * Last Stand (the last human made it to the end). `reason` = how it ended.
   */
  finish(reason) {
    if (this.finished) return [];
    this.finished = true;
    const effects = [];
    for (const p of this.living('infected')) if (!this.accused.has(p.id)) this.award(p, POINTS.stealth, 'stealth', effects);
    const humans = this.living('human');
    if (this.lastStandFor && humans.length === 1 && humans[0].id === this.lastStandFor && (reason === 'time' || reason === 'evac')) {
      this.award(humans[0], POINTS.lastStand, 'last-stand', effects);
    }
    return effects;
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
      p.roleSince += ms; // the time bonus does not grow during meetings
    }
    this.evacAt = later(this.evacAt);
    for (const part of this.parts) if (part.carrier) part.pickedAt = later(part.pickedAt);
    this.blackoutUntil = later(this.blackoutUntil);
    this.blackoutReadyAt = later(this.blackoutReadyAt);
  }

  /** Voted out: sent to the Quarantine Cell for good. Out of the match, role kept secret. */
  quarantine(id) {
    const p = this.get(id);
    this.freezeScore(p); // a voted-out player keeps the score they had
    p.alive = false;
    p.quarantined = true;
    this.trash(...p.hand.splice(0));
  }
}
