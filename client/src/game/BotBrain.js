import { RULES } from '../../../shared/constants.js';
import { ORIGIN_X, WIDTH, ROOMS, LADDERS, BLOOD_TEST, CURE_STATION, EMERGENCY_BUTTON } from '../side/facility.js';
import { navigate } from '../side/Navigator.js';

// How each difficulty plays.
//   aggression  how often humans challenge someone they can see
//   accept      chance to accept a challenge instead of running
//   smart       chance to play their highest number instead of a random one
//   hunt / lurk how often infected chase a visible human / ms they "act normal" after a bite
//   notice      how well humans read infection signs
//   zombieUse   chance an infected plays their Zombie card against a human
//   gunNerve    how suspicious a human must be before firing a Gun
//   voteNerve   how suspicious a human must be to vote someone out (lower = sloppier votes)
//   callNerve   how suspicious a human must be to walk to the Emergency Button
//   testChance  chance per think that a human without a badge goes for a Blood Test
//   fakeDuel    chance per think that an infected starts a fake duel with an ally in front of humans
export const DIFFICULTY = {
  easy: { think: [1500, 2800], aggression: 0.12, accept: 0.55, smart: 0.2, sight: 280, speed: 0.8, hunt: 0.45, lurk: 35000, notice: 0.35, zombieUse: 0.7, gunNerve: 3.5, voteNerve: 1.2, callNerve: 5, testChance: 0.03, fakeDuel: 0.08 },
  normal: { think: [900, 1800], aggression: 0.2, accept: 0.65, smart: 0.65, sight: 400, speed: 0.92, hunt: 0.55, lurk: 25000, notice: 0.5, zombieUse: 0.85, gunNerve: 2.5, voteNerve: 1.8, callNerve: 4, testChance: 0.06, fakeDuel: 0.15 },
  hard: { think: [500, 1100], aggression: 0.28, accept: 0.7, smart: 1, sight: 540, speed: 1, hunt: 0.7, lurk: 18000, notice: 0.75, zombieUse: 0.95, gunNerve: 2, voteNerve: 2.4, callNerve: 3.5, testChance: 0.09, fakeDuel: 0.22 },
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
  (n) => `${n} has no badge and won't go near the Blood Test.`,
];

/**
 * Decides what one bot does. Each frame it returns joystick-style input;
 * every so often it "thinks" and picks a new goal:
 * refill when out of cards · bitten bots pick a plan (cure / warn / hide) ·
 * humans call meetings and take Blood Tests · infected hunt visible humans while
 * they hold a Zombie card (always when starving) and stage fake duels with allies ·
 * humans with a Gun hunt players they strongly suspect · otherwise wander.
 * Chases override all of that. In meetings, bots talk (true or lying) and vote.
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
    this.plan = null; // while bitten: 'cure' | 'warn' | 'hide'
    this.wantTest = false;
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

  // ------------------------------------------------------------ bites
  onBitten(byId) {
    this.suspect(byId, 10, `${this.s.name(byId)} BIT me with a Zombie card!`);
    const r = Math.random();
    this.plan = r < 0.55 ? 'cure' : r < 0.8 ? 'warn' : 'hide';
    this.mode = 'idle';
    this.goal = null;
    this.nextThink = 0;
  }

  onCured() {
    this.plan = null;
  }

  onTurned() {
    this.plan = null;
    this.suspicion.clear();
    this.evidence.clear();
    this.mode = 'idle';
    this.goal = null;
    this.lurkUntil = this.s.now() + 8000;
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
    if (this.s.using.has(this.a.id)) return { x: 0, y: 0 }; // standing at a machine
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
    const precise = ['refill', 'test', 'cure', 'meeting'].includes(this.mode);
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
    } else if (this.mode === 'test' || this.mode === 'cure') {
      if (this.mode === 'cure' && this.s.match.cureStationReadyAt > now) return; // wait for the recharge
      this.s.useStation(this.a.id, this.mode);
    }
  }

  /** The Blood Test / Cure machine finished (res) or was interrupted (null). */
  stationDone(kind, res) {
    if (this.mode === kind) {
      this.mode = 'idle';
      this.goal = null;
    }
    if (kind === 'test' && res) this.wantTest = false;
  }

  goTo(mode, spot) {
    this.mode = mode;
    this.goal = { floor: spot.floor, x: spot.x };
  }

  think(now) {
    const m = this.s.match;
    for (const [id, v] of this.suspicion) this.suspicion.set(id, v * 0.97); // suspicion fades
    const bitten = m.isBitten(this.a.id);
    if (this.mode === 'cure' && !bitten) this.mode = 'idle';
    if (bitten && this.plan === 'cure') return this.goTo('cure', CURE_STATION);
    if (bitten && this.plan === 'warn' && m.canCallMeeting(this.a.id, now).ok) return this.goTo('meeting', EMERGENCY_BUTTON);
    if (bitten && this.plan === 'warn') this.plan = 'cure'; // can't call a meeting: try the machine instead
    if (m.isExhausted(this.a.id)) {
      const box = this.s.nearestSupply(this.a);
      return this.goTo('refill', box);
    }
    if (this.mode === 'refill') {
      this.mode = 'idle';
      this.goal = null;
    }
    if (['hunt', 'test', 'meeting'].includes(this.mode)) return;

    const seen = this.s.visibleActors(this.a, this.cfg.sight);
    if (this.me.role === 'infected') {
      // hunt while holding a Zombie card; hunger makes them reckless
      const starving = m.isStarving(this.a.id, now);
      const prey = seen.filter((o) => m.get(o.id).role === 'human' && !m.isBitten(o.id) && this.s.canDuel(this.a.id, o.id));
      if (prey.length && this.has('zombie') && (starving || (now > this.lurkUntil && Math.random() < this.cfg.hunt))) return this.hunt(prey);
      // put on a show: a fake duel with an ally while humans are watching
      const humansWatching = seen.some((o) => m.get(o.id).role === 'human');
      const allies = seen.filter((o) => m.get(o.id).role === 'infected' && this.s.canDuel(this.a.id, o.id));
      if (humansWatching && allies.length && Math.random() < this.cfg.fakeDuel) return this.hunt(allies);
    } else {
      // humans notice infection signs (green tint, twitching, glowing footprints)
      for (const o of seen) {
        const strength = this.s.signStrength(o.id);
        if (strength > 0.3 && Math.random() < this.cfg.notice) this.suspect(o.id, strength * 0.4, `${o.name} looks green and keeps twitching.`);
        if (m.hasBadge(o.id, now)) this.suspicion.set(o.id, this.sus(o.id) * 0.9);
      }
      // strong suspicion: call a meeting
      const top = this.topSuspect();
      if (top && this.sus(top) >= this.cfg.callNerve && m.canCallMeeting(this.a.id, now).ok && !this.s.meeting) return this.goTo('meeting', EMERGENCY_BUTTON);
      // no badge (or accused in a meeting): go and get tested
      if (!m.hasBadge(this.a.id, now) && !bitten && (this.wantTest || Math.random() < this.cfg.testChance)) return this.goTo('test', BLOOD_TEST);
      const suspects = seen.filter((o) => this.sus(o.id) >= this.cfg.gunNerve && this.s.canDuel(this.a.id, o.id));
      if (suspects.length && this.has('gun')) return this.hunt(suspects); // armed: go after them
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
    if (this.sus(fromId) >= 2) {
      // a suspect challenges me: accept only if I can shoot them
      return this.has('gun') && this.sus(fromId) >= this.cfg.gunNerve ? true : Math.random() < 0.25;
    }
    return Math.random() < this.cfg.accept;
  }

  /** Which card to play against `oppId`. */
  pickCard(oppId) {
    const m = this.s.match;
    const id = this.a.id;
    const opp = m.get(oppId);
    if (this.me.role === 'infected' && opp.role === 'infected') return this.randomNumber() ?? m.randomCard(id); // fake duel
    if (this.me.role === 'infected' && this.has('zombie') && !m.isBitten(oppId) && Math.random() < this.cfg.zombieUse) return m.firstOf(id, 'zombie');
    if (this.me.role === 'human' && this.has('gun') && this.sus(oppId) >= this.cfg.gunNerve) return m.firstOf(id, 'gun');
    const number = Math.random() < this.cfg.smart ? m.bestNumber(id) : this.randomNumber();
    return number ?? m.randomCard(id);
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
    // accused humans want a Clean badge to clear their name
    if (this.human && meeting.log.some((x) => x.kind === 'accuse' && x.target === this.a.id)) this.wantTest = true;
  }

  /** Listen to something said in the meeting. Infected bots know the truth and ignore it all. */
  hear(msg, meeting) {
    if (!this.human || !msg.from) return;
    const now = this.s.clock();
    const m = this.s.match;
    const from = msg.from;
    const t = msg.target;
    const name = this.s.name(from);
    const trust = clamp(1 - this.sus(from) / 4, 0.15, 1) * (m.hasBadge(from, now) ? 1.3 : 1);
    if (msg.kind === 'accuse') {
      if (t === this.a.id) {
        this.suspect(from, 1.5, `${name} accused me, and I know I'm human.`);
        this.nextSpeakAt = Math.min(this.nextSpeakAt, this.s.now() + rand(1200, 2800));
        this.maxSpeak = 3;
      } else if (t) this.suspect(t, 1.1 * trust);
    }
    if (msg.kind === 'vouch' && t && t !== this.a.id) this.suspicion.set(t, Math.max(0, this.sus(t) - 0.8 * trust));
    if (msg.kind === 'clean') {
      if (m.hasBadge(from, now)) this.suspicion.set(from, Math.max(0, this.sus(from) - 2));
      else this.suspect(from, 2, `${name} claimed to be clean, but has no badge.`);
    }
    if (msg.kind === 'bitten') {
      this.suspect(from, 3, `${name} admitted being bitten. They will turn.`);
      if (t === this.a.id) this.suspect(from, 2);
      else if (t) this.suspect(t, 2.5 * trust, `${name} says ${this.s.name(t)} bit them.`);
    }
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
      // frame a human: join the crowd if one is already accused, else pick one without a badge
      const humans = this.s.present().filter((p) => p.role === 'human' && p.id !== myId);
      const accused = meeting.log.filter((x) => x.kind === 'accuse' && humans.some((h) => h.id === x.target)).map((x) => x.target);
      const unbadged = humans.filter((h) => !m.hasBadge(h.id, now));
      const target = accused.length && Math.random() < 0.6 ? pick(accused) : unbadged.length ? pick(unbadged).id : null;
      if (target && Math.random() < 0.75) return { kind: 'accuse', target, text: pick(FAKE_REASONS)(nameOf(target)) };
      return Math.random() < 0.5 ? { kind: 'skip', text: 'We have no proof. Skip, or we lose a human.' } : null;
    }

    // human (maybe bitten)
    if (m.isBitten(myId) && this.plan === 'warn' && !this.warned) {
      this.warned = true;
      const by = this.me.bittenBy;
      return { kind: 'bitten', target: by, text: `I was BITTEN by ${nameOf(by)}! Vote ${nameOf(by)} out. I'm going to the Cure Lab.` };
    }
    if (accusers.length && !this.denied) {
      this.denied = true;
      const left = Math.ceil((this.me.cleanUntil - now) / 1000);
      if (left > 0) return { kind: 'clean', text: `I tested CLEAN ${Math.round((RULES.cleanBadge / 1000) - left)}s ago. Check my badge.` };
      return { kind: 'deny', text: "It's not me! I'll take a Blood Test after this." };
    }
    const top = this.topSuspect([myId]);
    if (top && this.sus(top) >= 1.5 && !meeting.log.some((x) => x.from === myId && x.target === top && x.kind === 'accuse')) {
      const why = this.evidence.get(top)?.text ?? `${nameOf(top)} has been acting strange.`;
      return { kind: 'accuse', target: top, text: `${why} I vote ${nameOf(top)}.` };
    }
    if (m.hasBadge(myId, now) && !meeting.log.some((x) => x.from === myId && x.kind === 'clean')) {
      return { kind: 'clean', text: `I'm clean: tested ${Math.round((now - (this.me.cleanUntil - RULES.cleanBadge)) / 1000)}s ago.` };
    }
    return Math.random() < 0.5 ? { kind: 'skip', text: 'No idea yet. Skip unless someone is sure.' } : null;
  }

  /** Vote: a player id or 'skip'. */
  castVote(meeting) {
    const now = this.s.clock();
    const m = this.s.match;
    const myId = this.a.id;
    const present = this.s.present().filter((p) => p.id !== myId);
    if (this.me.role === 'infected') {
      // vote with the crowd against a human; never let an ally go
      const score = (id) => [...meeting.votes.values()].filter((v) => v === id).length * 2 + meeting.log.filter((x) => x.kind === 'accuse' && x.target === id).length;
      const humans = present.filter((p) => p.role === 'human').sort((a, b) => score(b.id) - score(a.id));
      if (humans[0] && score(humans[0].id) > 0) return humans[0].id;
      const unbadged = humans.filter((h) => !m.hasBadge(h.id, now));
      return unbadged.length && Math.random() < 0.4 ? pick(unbadged).id : 'skip';
    }
    if (m.isBitten(myId) && this.me.bittenBy && m.get(this.me.bittenBy).alive) return this.me.bittenBy;
    const top = this.topSuspect([myId]);
    if (!top) return 'skip';
    const nerve = this.cfg.voteNerve + (m.hasBadge(top, now) ? 2 : 0); // badges protect, a little
    return this.sus(top) >= nerve ? top : 'skip';
  }
}
