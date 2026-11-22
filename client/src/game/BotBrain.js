import { RULES } from '../../../shared/constants.js';
import { ORIGIN_X, WIDTH, ROOMS, LADDERS, EMERGENCY_BUTTON } from '../side/facility.js';
import { navigate } from '../side/Navigator.js';

// How each difficulty plays.
//   aggression  how often humans challenge someone they can see
//   accept      chance to accept a challenge instead of running
//   smart       chance to play their highest number instead of a random one
//   hunt / lurk how often infected chase a visible human / ms they "act normal" after a bite
//   notice      how well humans read infection signs
//   zombieUse   chance an infected plays their Zombie card against a human
//   gunNerve    how suspicious a human must be before firing a Gun (it kills humans too)
//   cureNerve   how suspicious a human must be before playing a Cure on someone
//   voteNerve   how suspicious a human must be to vote someone out (lower = sloppier votes)
//   callNerve   how suspicious a human must be to walk to the Emergency Button
//   fakeDuel    chance per think that an infected starts a fake duel with an ally in front of humans
export const DIFFICULTY = {
  easy: { think: [1500, 2800], aggression: 0.12, accept: 0.55, smart: 0.2, sight: 280, speed: 0.8, hunt: 0.45, lurk: 35000, notice: 0.35, zombieUse: 0.7, gunNerve: 4, cureNerve: 1.8, voteNerve: 1.2, callNerve: 5, fakeDuel: 0.08 },
  normal: { think: [900, 1800], aggression: 0.2, accept: 0.65, smart: 0.65, sight: 400, speed: 0.92, hunt: 0.55, lurk: 25000, notice: 0.5, zombieUse: 0.85, gunNerve: 3.2, cureNerve: 1.5, voteNerve: 1.8, callNerve: 4, fakeDuel: 0.15 },
  hard: { think: [500, 1100], aggression: 0.28, accept: 0.7, smart: 1, sight: 540, speed: 1, hunt: 0.7, lurk: 18000, notice: 0.75, zombieUse: 0.95, gunNerve: 2.8, cureNerve: 1.2, voteNerve: 2.4, callNerve: 3.5, fakeDuel: 0.22 },
};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// bots don't wander into the Quarantine Cell for fun
const WANDER_ROOMS = ROOMS.filter((r) => r.id !== 'quarantine');
const FAKE_REASONS = [
  (n) => `I got a clue about ${n} after our duel. Cold hands.`,
  (n) => `${n} ran from me twice. Why run if you're clean?`,
  (n) => `I saw a green glint behind ${n}'s visor.`,
  (n) => `${n} was alone near the Quarantine Cell. Very strange.`,
  (n) => `${n} keeps avoiding duels. What are they hiding?`,
];

/**
 * Decides what one bot does. Each frame it returns joystick-style input;
 * every so often it "thinks" and picks a new goal:
 * refill when out of cards · humans call meetings · infected hunt visible humans
 * while they hold a Zombie card (always when starving) and stage fake duels with
 * allies · humans with a Gun or a Cure go after players they suspect · otherwise
 * wander. Chases override all of that; the cure cell holds them still.
 * In meetings, bots talk (true or lying) and vote.
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
    this.lurkUntil = 0; // infected bots lie low for a while after biting someone
    this.suspicion = new Map(); // playerId -> how suspicious they seem
    this.evidence = new Map(); // playerId -> { text, weight }: what they would say in a meeting
    this.nextSpeakAt = Infinity;
    this.voteAt = Infinity;
  }

  get id() {
    return this.a.id;
  }

  get me() {
    return this.s.match.get(this.a.id);
  }

  get human() {
    return this.me.role === 'human';
  }

  sus(id) {
    return this.suspicion.get(id) ?? 0;
  }

  /** Raise (or lower) suspicion. `why` is remembered as evidence to say in a meeting. */
  suspect(id, amount, why = null) {
    if (id === this.a.id || !this.s.match.players.has(id)) return;
    this.suspicion.set(id, Math.max(0, this.sus(id) + amount));
    if (why && amount > 0 && amount >= (this.evidence.get(id)?.weight ?? 0)) this.evidence.set(id, { text: why, weight: amount });
  }

  has(kind) {
    return this.me.hand.some((c) => c.kind === kind);
  }

  /** Most suspicious living player (or null). */
  topSuspect(exclude = []) {
    let best = null;
    for (const [id, v] of this.suspicion) {
      if (exclude.includes(id) || !this.s.alive(id)) continue;
      if (!best || v > best.v) best = { id, v };
    }
    return best?.id ?? null;
  }

  // ------------------------------------------------------------ what happened to me / around me
  /** Bitten: a zombie now, at once. */
  onTurned() {
    this.suspicion.clear();
    this.evidence.clear();
    this.mode = 'idle';
    this.goal = null;
    this.lurkUntil = this.s.now() + 8000;
  }

  /** Cured: human again, and the other zombies are forgotten. */
  onCured() {
    this.suspicion.clear();
    this.evidence.clear();
    this.mode = 'idle';
    this.goal = null;
    this.target = null;
  }

  /** Used a Cure on a zombie: 60s in the cell. */
  toCell() {
    this.mode = 'cell';
    this.goal = null;
    this.target = null;
  }

  released() {
    this.mode = 'idle';
    this.nextThink = 0;
  }

  /** My Cure was wasted: that player is human. */
  onCureWasted(oppId) {
    this.suspicion.set(oppId, 0);
    this.evidence.delete(oppId);
  }

  /** Every shot is announced (shooter only, never the target's role). */
  onShot(shooterId, victimId) {
    this.suspicion.delete(victimId);
    if (!this.human || shooterId === this.a.id) return;
    if (this.sus(victimId) >= 2) this.suspicion.set(shooterId, Math.max(0, this.sus(shooterId) - 1));
    else this.suspect(shooterId, 1.5, `${this.s.name(shooterId)} shot ${this.s.name(victimId)}, who seemed fine to me.`);
  }

  // ------------------------------------------------------------ chases
  startChase(targetId) {
    this.mode = 'chase';
    this.target = targetId;
  }

  startFleeing(chaser) {
    this.mode = 'flee';
    this.fleeFrom = chaser;
    this.goal = this.fleeGoal(chaser);
  }

  endChase() {
    this.mode = 'idle';
    this.goal = null;
    this.target = null;
    this.idleUntil = this.s.now() + 800;
  }

  /** Somewhere away from the chaser: up/down a ladder if one is handy, else the far end of the floor. */
  fleeGoal(chaser) {
    const floor = this.a.floor();
    const away = Math.sign(this.a.x - chaser.x) || 1;
    const ladder = LADDERS.filter((l) => (l.lower === floor || l.upper === floor) && Math.sign(ORIGIN_X + l.x - this.a.x) === away)
      .sort((p, q) => Math.abs(ORIGIN_X + p.x - this.a.x) - Math.abs(ORIGIN_X + q.x - this.a.x))[0];
    if (ladder && Math.abs(ORIGIN_X + ladder.x - this.a.x) < 500) {
      const other = ladder.lower === floor ? ladder.upper : ladder.lower;
      return { floor: other, x: ORIGIN_X + ladder.x + away * 140 };
    }
    return { floor, x: away > 0 ? ORIGIN_X + WIDTH - 30 : ORIGIN_X + 30 };
  }

  // ------------------------------------------------------------ per frame
  input(now) {
    if (this.mode === 'chase') {
      const t = this.s.actors.get(this.target);
      return t ? navigate(this.a, { floor: t.floor(), x: t.x }, 2) : { x: 0, y: 0 };
    }
    if (this.mode === 'flee') {
      const nav = navigate(this.a, this.goal, 10);
      if (nav.arrived) this.goal = this.fleeGoal(this.fleeFrom);
      return nav;
    }
    if (this.mode === 'cell') return { x: 0, y: 0 }; // locked in the quarantine cell
    if (now >= this.nextThink) {
      this.think(now);
      this.nextThink = now + rand(...this.cfg.think);
    }
    if (this.mode === 'hunt') {
      const t = this.s.actors.get(this.target);
      if (!t || !this.s.canDuel(this.a.id, t.id)) {
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
    const precise = ['refill', 'meeting'].includes(this.mode);
    const nav = navigate(this.a, this.goal, precise ? 6 : 14);
    if (nav.arrived) this.arrive(now);
    return nav.arrived ? { x: 0, y: 0 } : nav;
  }

  /** Reached the goal: use the station there, or idle a little after wandering. */
  arrive(now) {
    if (this.mode === 'wander') {
      this.mode = 'idle';
      this.goal = null;
      this.idleUntil = now + rand(1500, 5000);
    } else if (this.mode === 'meeting') {
      this.mode = 'idle';
      this.goal = null;
      this.s.callMeeting(this.a.id);
    }
  }

  goTo(mode, spot) {
    this.mode = mode;
    this.goal = { floor: spot.floor, x: spot.x };
  }

  think(now) {
    const m = this.s.match;
    for (const [id, v] of this.suspicion) this.suspicion.set(id, v * 0.97); // suspicion fades
    if (this.mode === 'cell') return;
    if (m.isExhausted(this.a.id)) {
      const box = this.s.nearestSupply(this.a);
      return this.goTo('refill', box);
    }
    if (this.mode === 'refill') {
      this.mode = 'idle';
      this.goal = null;
    }
    if (['hunt', 'meeting'].includes(this.mode)) return;

    const seen = this.s.visibleActors(this.a, this.cfg.sight);
    if (this.me.role === 'infected') {
      // hunt while holding a Zombie card; hunger makes them reckless
      const starving = m.isStarving(this.a.id, now);
      const prey = seen.filter((o) => m.get(o.id).role === 'human' && !m.isRecovering(o.id, now) && this.s.canDuel(this.a.id, o.id));
      if (prey.length && this.has('zombie') && (starving || (now > this.lurkUntil && Math.random() < this.cfg.hunt))) return this.hunt(prey);
      // put on a show: a fake duel with an ally while humans are watching
      const humansWatching = seen.some((o) => m.get(o.id).role === 'human');
      const allies = seen.filter((o) => m.get(o.id).role === 'infected' && this.s.canDuel(this.a.id, o.id));
      if (humansWatching && allies.length && Math.random() < this.cfg.fakeDuel) return this.hunt(allies);
    } else {
      // humans notice infection signs (green tint, twitching, glowing footprints)
      for (const o of seen) {
        const strength = this.s.signStrength(o.id);
        if (strength > 0.3 && Math.random() < this.cfg.notice) this.suspect(o.id, strength * 0.4, `${o.name} keeps twitching, and I saw a green flicker.`);
      }
      // strong suspicion: call a meeting
      const top = this.topSuspect();
      if (top && this.sus(top) >= this.cfg.callNerve && m.canCallMeeting(this.a.id, now).ok && !this.s.meeting) return this.goTo('meeting', EMERGENCY_BUTTON);
      // armed with a Gun or a Cure: go after the players they suspect
      const nerve = Math.min(this.has('gun') ? this.cfg.gunNerve : Infinity, this.has('cure') ? this.cfg.cureNerve : Infinity);
      const suspects = seen.filter((o) => this.sus(o.id) >= nerve && this.s.canDuel(this.a.id, o.id));
      if (suspects.length) return this.hunt(suspects);
      const scary = seen.find((o) => this.sus(o.id) >= 2.5);
      if (scary && Math.random() < 0.5) return this.wander(scary);
      const others = seen.filter((o) => this.s.canDuel(this.a.id, o.id) && this.sus(o.id) < 2);
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

  /** Go to a random room; when avoiding someone, pick one on another floor. */
  wander(avoid = null) {
    const rooms = avoid ? WANDER_ROOMS.filter((r) => r.floor !== avoid.floor()) : WANDER_ROOMS;
    const r = pick(rooms);
    this.mode = 'wander';
    this.goal = { floor: r.floor, x: ORIGIN_X + r.x0 + 40 + Math.random() * (r.x1 - r.x0 - 80) };
  }

  // ------------------------------------------------------------ duels
  /** Accept a challenge from `fromId`? (false = run) */
  respond(fromId) {
    const me = this.me;
    const from = this.s.match.get(fromId);
    if (me.role === 'infected' && from.role === 'infected') return true; // a fake duel with an ally
    if (me.role === 'infected') return Math.random() < (this.has('zombie') ? 0.9 : 0.45);
    const sus = this.sus(fromId);
    if (sus >= 2) {
      // a suspect challenges me: accept only if I can shoot or cure them (a bite turns me at once)
      if ((this.has('gun') && sus >= this.cfg.gunNerve) || this.has('cure')) return true;
      return Math.random() < 0.15;
    }
    return Math.random() < this.cfg.accept;
  }

  /** Which card to play against `oppId`. Humans never waste a Gun or Cure on someone they trust. */
  pickCard(oppId) {
    const m = this.s.match;
    const id = this.a.id;
    const opp = m.get(oppId);
    const now = this.s.now();
    if (this.me.role === 'infected') {
      if (opp.role === 'infected') return this.randomNumber() ?? m.randomCard(id); // fake duel
      if (this.has('zombie') && !m.isRecovering(oppId, now) && Math.random() < this.cfg.zombieUse) return m.firstOf(id, 'zombie');
      return (Math.random() < this.cfg.smart ? m.bestNumber(id) : this.randomNumber()) ?? m.randomCard(id);
    }
    const sus = this.sus(oppId);
    if (this.has('gun') && sus >= this.cfg.gunNerve) return m.firstOf(id, 'gun');
    if (this.has('cure') && sus >= this.cfg.cureNerve) return m.firstOf(id, 'cure');
    const number = Math.random() < this.cfg.smart ? m.bestNumber(id) : this.randomNumber();
    // nothing but specials left: a wasted Cure beats shooting someone I trust
    return number ?? m.firstOf(id, 'cure') ?? m.firstOf(id, 'gun');
  }

  randomNumber() {
    const numbers = this.me.hand.filter((c) => c.kind === 'number');
    return numbers.length ? pick(numbers) : null;
  }

  noteClue(aboutId, genuine) {
    this.suspect(aboutId, genuine ? 2.5 : 2, `I beat ${this.s.name(aboutId)} in a duel and got a clue. Something is off.`);
  }

  // ------------------------------------------------------------ meetings
  meetingStart(now, isCaller) {
    this.mode = 'idle';
    this.goal = null;
    this.target = null;
    this.spoke = 0;
    this.maxSpeak = 2;
    this.denied = false;
    this.nextSpeakAt = now + (isCaller ? 1200 : rand(2500, RULES.meetingTalk * 0.6));
    this.voteAt = Infinity;
  }

  afterSpeak(now, said) {
    this.spoke++;
    this.nextSpeakAt = said && this.spoke < this.maxSpeak ? now + rand(6000, 11000) : Infinity;
  }

  meetingEnd(now, dur, meeting) {
    this.nextThink = now + rand(500, 1500);
    this.lurkUntil += dur;
    this.idleUntil = now;
    this.nextSpeakAt = Infinity;
    this.voteAt = Infinity;
  }

  /** Listen to something said in the meeting. Infected bots know the truth and ignore it all. */
  hear(msg, meeting) {
    if (!this.human || !msg.from) return;
    const now = this.s.clock();
    const m = this.s.match;
    const from = msg.from;
    const t = msg.target;
    const name = this.s.name(from);
    const trust = clamp(1 - this.sus(from) / 4, 0.15, 1);
    if (msg.kind === 'accuse') {
      if (t === this.a.id) {
        this.suspect(from, 1.5, `${name} accused me, and I know I'm human.`);
        this.nextSpeakAt = Math.min(this.nextSpeakAt, this.s.now() + rand(1200, 2800));
        this.maxSpeak = 3;
      } else if (t) this.suspect(t, 1.1 * trust);
    }
    if (msg.kind === 'vouch' && t && t !== this.a.id) this.suspicion.set(t, Math.max(0, this.sus(t) - 0.8 * trust));
    // "I'm clean" is only a claim now: it helps a little, from someone you already trust
    if (msg.kind === 'clean') this.suspicion.set(from, Math.max(0, this.sus(from) - 0.5 * trust));
  }

  /** Something to say right now (or null). Humans share evidence; infected lie and deflect. */
  speak(meeting) {
    const now = this.s.clock();
    const m = this.s.match;
    const myId = this.a.id;
    const nameOf = (id) => this.s.name(id);
    const accusers = meeting.log.filter((x) => x.kind === 'accuse' && x.target === myId).map((x) => x.from);

    if (this.me.role === 'infected') {
      if (accusers.length && !this.denied) {
        this.denied = true;
        const accuser = accusers[accusers.length - 1];
        if (m.get(accuser).role === 'human') return { kind: 'accuse', target: accuser, text: `${nameOf(accuser)} is lying. ${nameOf(accuser)} is the infected one!` };
        return { kind: 'deny', text: "It's not me. I've been in the labs the whole time." };
      }
      const accusedAlly = meeting.log.find((x) => x.kind === 'accuse' && x.target !== myId && m.get(x.target)?.role === 'infected' && m.get(x.target).alive);
      if (accusedAlly && Math.random() < 0.3) return { kind: 'vouch', target: accusedAlly.target, text: `${nameOf(accusedAlly.target)} was with me the whole time. They're fine.` };
      // frame a human: join the crowd if one is already accused, else pick one who can be voted out
      const humans = this.s.candidates().filter((p) => p.role === 'human' && p.id !== myId);
      const accused = meeting.log.filter((x) => x.kind === 'accuse' && humans.some((h) => h.id === x.target)).map((x) => x.target);
      const target = accused.length && Math.random() < 0.6 ? pick(accused) : humans.length ? pick(humans).id : null;
      if (target && Math.random() < 0.75) return { kind: 'accuse', target, text: pick(FAKE_REASONS)(nameOf(target)) };
      return Math.random() < 0.5 ? { kind: 'skip', text: 'We have no proof. Skip, or we lose a human.' } : null;
    }

    // human
    if (accusers.length && !this.denied) {
      this.denied = true;
      return Math.random() < 0.5 ? { kind: 'clean', text: "I'm clean, I swear. Check my duels." } : { kind: 'deny', text: "It's not me! I'm human." };
    }
    const top = this.topSuspect([myId]);
    if (top && this.sus(top) >= 1.5 && !meeting.log.some((x) => x.from === myId && x.target === top && x.kind === 'accuse')) {
      const why = this.evidence.get(top)?.text ?? `${nameOf(top)} has been acting strange.`;
      return { kind: 'accuse', target: top, text: `${why} I vote ${nameOf(top)}.` };
    }
    return Math.random() < 0.5 ? { kind: 'skip', text: 'No idea yet. Skip unless someone is sure.' } : null;
  }

  /** Vote: a player id or 'skip'. Nobody in the 60s cure quarantine can be voted out. */
  castVote(meeting) {
    const myId = this.a.id;
    const choices = this.s.candidates().filter((p) => p.id !== myId);
    if (this.me.role === 'infected') {
      // vote with the crowd against a human; never let an ally go
      const score = (id) => [...meeting.votes.values()].filter((v) => v === id).length * 2 + meeting.log.filter((x) => x.kind === 'accuse' && x.target === id).length;
      const humans = choices.filter((p) => p.role === 'human').sort((a, b) => score(b.id) - score(a.id));
      if (humans[0] && score(humans[0].id) > 0) return humans[0].id;
      return humans.length && Math.random() < 0.4 ? pick(humans).id : 'skip';
    }
    const top = this.topSuspect([myId, ...this.s.present().filter((p) => !choices.includes(p)).map((p) => p.id)]);
    return top && this.sus(top) >= this.cfg.voteNerve ? top : 'skip';
  }
}
