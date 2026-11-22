import { RULES, SUITS } from '../../../shared/constants.js';
import { ORIGIN_X, ROOMS } from '../side/facility.js';
import { navigate } from '../side/Navigator.js';

// How each difficulty plays.
export const DIFFICULTY = {
// hunt: how often infected bots chase a human they can see · lurk: ms an infected bot "acts normal"
  // after infecting someone · notice: how well humans read infection signs
  easy: { think: [1500, 2800], aggression: 0.12, accept: 0.55, smart: 0.15, sight: 280, speed: 0.8, useCards: 0.15, hunt: 0.45, lurk: 35000, notice: 0.35 },
  normal: { think: [900, 1800], aggression: 0.2, accept: 0.65, smart: 0.65, sight: 400, speed: 0.92, useCards: 0.3, hunt: 0.55, lurk: 25000, notice: 0.5 },
  hard: { think: [500, 1100], aggression: 0.28, accept: 0.7, smart: 1, sight: 540, speed: 1, useCards: 0.5, hunt: 0.7, lurk: 18000, notice: 0.75 },
};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
// bots don't wander into the Quarantine Cell for fun
const WANDER_ROOMS = ROOMS.filter((r) => r.id !== 'quarantine');

/**
 * Decides what one bot does. Each frame it returns joystick-style input;
 * every so often it "thinks" and picks a new goal:
 * refill when out of cards · infected hunt visible humans · humans avoid
 * suspicious players, sometimes challenge others · otherwise wander.
 */
export default class BotBrain {
  constructor(session, actor, difficulty = 'normal') {
    this.s = session;
    this.a = actor;
    this.cfg = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
    this.mode = 'idle';
    this.goal = null;
    this.target = null;
    this.nextThink = 0;
    this.idleUntil = 0;
    this.suspicion = new Map(); // playerId -> how suspicious they seem
    this.lurkUntil = 0; // infected bots lie low for a while after infecting someone
  }

  get me() {
    return this.s.match.get(this.a.id);
  }

  suspect(id, amount) {
    if (id === this.a.id) return;
    this.suspicion.set(id, (this.suspicion.get(id) ?? 0) + amount);
  }

  input(now) {
    if (now >= this.nextThink) {
      this.think(now);
      this.nextThink = now + rand(...this.cfg.think);
    }
    if (this.mode === 'hunt') {
      const t = this.s.actors.get(this.target);
      if (!t || !t.sprite.visible || !this.s.canDuel(this.a.id, t.id)) {
        this.mode = 'idle';
        this.goal = null;
      } else if (t.floor() === this.a.floor() && this.a.state.mode === 'walk' && t.state.mode === 'walk' && Math.abs(t.x - this.a.x) < RULES.challengeRange * 0.8) {
        this.mode = 'idle';
        this.goal = null;
        this.idleUntil = now + 2500;
        this.s.challenge(this.a.id, t.id);
        return { x: 0, y: 0 };
      } else this.goal = { floor: t.floor(), x: t.x };
    }
    if (!this.goal) return { x: 0, y: 0 };
    const nav = navigate(this.a, this.goal, this.mode === 'refill' ? 6 : 14);
    if (nav.arrived && this.mode === 'wander') {
      this.mode = 'idle';
      this.goal = null;
      this.idleUntil = now + rand(1500, 5000);
    }
    return nav.arrived ? { x: 0, y: 0 } : nav;
  }

  think(now) {
    const m = this.s.match;
    // suspicion fades unless something keeps feeding it
    for (const [id, v] of this.suspicion) this.suspicion.set(id, v * 0.96);
    if (m.isExhausted(this.a.id)) {
      const box = this.s.nearestSupply(this.a);
      this.mode = 'refill';
      this.goal = { floor: box.floor, x: box.x };
      return;
    }
    if (this.mode === 'refill') {
      this.mode = 'idle';
      this.goal = null;
    }
    this.maybeUseCard(now);
    if (this.mode === 'hunt') return;

    const seen = this.s.visibleActors(this.a, this.cfg.sight);
    if (this.me.role === 'infected') {
      const prey = seen.filter((o) => m.get(o.id).role === 'human' && this.s.canDuel(this.a.id, o.id));
      if (prey.length && now > this.lurkUntil && Math.random() < this.cfg.hunt) return this.hunt(prey);
    } else {
      // humans notice infection signs (green tint, twitching, glowing footprints)
      for (const o of seen) {
        const strength = this.s.signStrength(o.id);
        if (strength > 0.3 && Math.random() < this.cfg.notice) this.suspect(o.id, strength * 0.4);
      }
      const scary = seen.find((o) => (this.suspicion.get(o.id) ?? 0) >= 2.5);
      if (scary && Math.random() < 0.5) return this.wander(scary);
      const others = seen.filter((o) => this.s.canDuel(this.a.id, o.id) && (this.suspicion.get(o.id) ?? 0) < 2);
      if (others.length && Math.random() < this.cfg.aggression) return this.hunt(others);
    }
    if (this.mode === 'idle' && now > this.idleUntil) this.wander();
  }

  hunt(list) {
    const nearest = list.sort((p, q) => this.distance(p) - this.distance(q))[0];
    this.mode = 'hunt';
    this.target = nearest.id;
  }

  distance(o) {
    return Math.abs(o.x - this.a.x) + Math.abs(o.floor() - this.a.floor()) * 600;
  }

  /** Go to a random room; when fleeing, pick one on another floor. */
  wander(fleeFrom = null) {
    const rooms = fleeFrom ? WANDER_ROOMS.filter((r) => r.floor !== fleeFrom.floor()) : WANDER_ROOMS;
    const r = pick(rooms);
    this.mode = 'wander';
    this.goal = { floor: r.floor, x: ORIGIN_X + r.x0 + 40 + Math.random() * (r.x1 - r.x0 - 80) };
  }

  /** Accept a challenge from `fromId`? */
  respond(fromId) {
    const me = this.me;
    const from = this.s.match.get(fromId);
    if (me.role === 'infected' && from.role === 'human') return Math.random() < 0.95;
    if (me.role === 'human' && (this.suspicion.get(fromId) ?? 0) >= 2) return Math.random() < 0.35;
    return Math.random() < this.cfg.accept;
  }

  /** Which card to play against `oppId`. */
  pickCard(oppId) {
    const m = this.s.match;
    if (Math.random() >= this.cfg.smart) return m.randomCard(this.a.id);
    // smart: play the card with the best expected total against a random opponent suit
    const playable = this.me.hand.filter((c) => c.kind === 'number' || c.type === 'wild');
    const score = (c) => {
      if (c.kind !== 'number') return 8 + 2.25; // wild nearly always gets +3
      const beats = SUITS[c.suit].beats;
      return c.value + (beats ? 0.75 : 0);
    };
    return playable.sort((x, y) => score(y) - score(x))[0] ?? m.randomCard(this.a.id);
  }

  noteClue(aboutId, genuine) {
    this.suspect(aboutId, genuine ? 2.5 : 2);
  }

  /** Bots use a few special cards when it makes sense. */
  maybeUseCard(now) {
    if (Math.random() > this.cfg.useCards) return;
    const me = this.me;
    const has = (type) => me.hand.find((c) => c.type === type);
    if (me.role === 'infected') {
      const spore = has('spore');
      if (spore && !me.sporeArmed) return this.s.useCard(this.a.id, spore.id, null);
      const mask = has('mask');
      if (mask && now - me.infectedAt > RULES.signsTime * 0.3 && now > me.maskedUntil) return this.s.useCard(this.a.id, mask.id, null);
      const rumor = has('rumor');
      if (rumor && Math.random() < 0.4) return this.s.useCard(this.a.id, rumor.id, null);
      const freeze = has('freeze');
      if (freeze) {
        const runner = this.s.visibleActors(this.a, RULES.cardRange).find((o) => this.s.match.get(o.id).role === 'human');
        if (runner) return this.s.useCard(this.a.id, freeze.id, runner.id);
      }
      return;
    }
    const scanner = has('scanner');
    if (scanner) {
      const near = this.s.visibleActors(this.a, RULES.cardRange);
      const target = near.sort((p, q) => (this.suspicion.get(q.id) ?? 0) - (this.suspicion.get(p.id) ?? 0))[0];
      if (target) return this.s.useCard(this.a.id, scanner.id, target.id);
    }
    const freeze = has('freeze');
    if (freeze) {
      const threat = this.s.visibleActors(this.a, RULES.cardRange).find((o) => (this.suspicion.get(o.id) ?? 0) >= 2);
      if (threat) return this.s.useCard(this.a.id, freeze.id, threat.id);
    }
  }
}
