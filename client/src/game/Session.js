import Phaser from 'phaser';
import { PLAYER_COLORS, RULES, PLAYER_SPEED, ROOMS as ROOM_INFO, MODIFIERS, dailyModifier, lobbyRules } from '../../../shared/constants.js';
import { Match, assignRoles, tallyVotes } from '../../../shared/match.js';
import { createRng } from '../../../shared/cards.js';
import {
  ORIGIN_X, FLOORS, ROOMS, DUEL_TABLES, SUPPLY_BOXES, EMERGENCY_BUTTON,
  GENERATOR, BREAKER, SECURITY_DESK, EVAC_ROOM, PART_SPOTS,
} from '../side/facility.js';
import Actor from '../side/Actor.js';
import BotBrain from './BotBrain.js';
import sfx from '../audio/Sfx.js';

const YOU = 'you';
const BOT_DUEL_TIME = 2600;
const ESCAPE_COOLDOWN = 4000; // after a chase, neither can be challenged again straight away

const rand = (a, b) => a + Math.random() * (b - a);
const POINT_REASONS = {
  'vote-right': 'your vote was right', 'vote-wrong': 'your vote was wrong', part: 'part fitted',
  stealth: 'never accused', 'last-stand': 'Last Stand', 'call-right': 'right call', 'call-wrong': 'wrong call',
};
export const EMOTES = { hello: 'HELLO', follow: 'FOLLOW ME', sus: 'SUS!', help: 'HELP!' };
/** Visor face shown while an emote bubble is up. */
const FACE_FOR_EMOTE = { hello: 'happy', follow: 'happy', sus: 'suspicious', help: 'scared' };

/**
 * One match (rules: GAME_GUIDE.txt): players (you + bots), roles, the shared Match rules,
 * challenges, chases, duels, shots, instant bites, cures and the 60s cure cell, hunger,
 * infection signs, refills, emergency meetings + votes, the timer and the win check.
 * Talks to the HUD through scene events: toast, hand-changed, role-changed,
 * duel-open, challenge-request, challenge-cancel, chase, you-died, you-quarantined,
 * meeting (true/false), match-over.
 */
export default class Session {
  constructor(scene, settings = {}) {
    this.scene = scene;
    this.settings = { bots: 7, difficulty: 'normal', minutes: RULES.matchMinutes, ...settings };
    // sim: a headless balance run (tools/simulate.js): a bot plays your seat too, nothing waits for input
    this.sim = !!this.settings.sim;
    const params = new URLSearchParams(this.sim ? '' : window.location.search);
    const seed = this.settings.seed ?? (Number(params.get('seed')) || Date.now());
    const rng = createRng(seed + 1);
    const now = this.now();

    // --- players and roles
    const count = Phaser.Math.Clamp(this.settings.bots, 1, 14) + 1;
    // v3: one optional match modifier (OFF / DAILY / a fixed one)
    const mod = this.settings.modifier === 'daily' ? dailyModifier() : MODIFIERS[this.settings.modifier] ? this.settings.modifier : null;
    this.modifier = mod;
    const lobby = lobbyRules(count);
    const rules = {};
    if (mod === 'double-guns') rules.startGunShare = lobby.startGunShare * 2;
    if (mod === 'fast-claws') rules.zombieRegen = Math.round(lobby.zombieRegen * 0.75);
    if (mod === 'extra-cures') rules.deckCures = RULES.deckCures * 2;
    this.pitchBlack = mod === 'pitch-black';
    const ids = [YOU, ...Array.from({ length: count - 1 }, (_, i) => `p${i + 2}`)];
    const roles = assignRoles(ids, rng);
    const want = params.get('role');
    if (want && roles[YOU] !== want) {
      const other = ids.find((id) => id !== YOU && roles[id] === want);
      if (other) [roles[YOU], roles[other]] = [want, roles[YOU]];
    }
    // your neon colour (unlocked by rank in the menu): whoever had it gets yours
    const colors = ids.map((_, i) => PLAYER_COLORS[i % PLAYER_COLORS.length]);
    const mine = colors.indexOf(this.settings.color);
    if (mine > 0) [colors[0], colors[mine]] = [colors[mine], colors[0]];
    const players = ids.map((id, i) => ({ id, name: id === YOU ? 'YOU' : `P${i + 1}`, color: colors[i], role: roles[id] }));
    this.match = new Match({ players, seed, now, rules });
    this.match.setupParts(PART_SPOTS);
    if (params.has('hand')) this.match.get(YOU).hand.splice(Math.max(0, Number(params.get('hand'))));

    // --- everyone spawns spread across the Central Hall
    const hall = ROOMS.find((r) => r.id === 'hall');
    const order = Phaser.Utils.Array.Shuffle([...ids]);
    this.actors = new Map();
    this.brains = new Map();
    for (const p of players) {
      const slot = order.indexOf(p.id);
      const x = ORIGIN_X + hall.x0 + 50 + ((hall.x1 - hall.x0 - 100) * (slot + 0.5)) / count;
      const actor = new Actor(scene, { ...p, floor: hall.floor, x, isYou: p.id === YOU });
      this.actors.set(p.id, actor);
      if (p.id !== YOU || this.sim) {
        const brain = new BotBrain(this, actor, this.settings.difficulty);
        brain.nextThink = now + 1500 + Math.random() * 3000;
        this.brains.set(p.id, brain);
      }
    }

    this.busy = new Set();
    this.awaiting = new Set(); // challenged bots still deciding
    this.yourDuel = null; // { ids, table } while the duel screen is open
    this.approaches = [];
    this.botDuels = [];
    this.chases = [];
    this.pending = null;
    this.refill = new Map();
    this.signs = new Map();
    this.meeting = null; // see startMeeting()
    this.meetingQueued = null; // caller id, while your duel screen is still open
    this.nextWatchdog = 0;
    this.refillRing = scene.add.graphics().setDepth(12);
    // v3
    this.work = new Map(); // id -> { kind: 'pick'|'fit', target, ms }: standing still at a station
    this.timeline = []; // the end-of-match recap
    this.roomLog = []; // security cameras: { id, room, at }
    this.lastRoom = new Map();
    this.cameraReadyAt = 0;
    this.revealUntil = 0; // Last Stand: the zombies glow red for you until then
    this.ghost = null; // you after you are out: a ghost that can look around
    this.bubbles = new Map(); // emote bubbles: id -> { text, until }
    this.emoteAt = new Map();
    this.blackoutOn = false;
    this.evacWarned = false;
    this.nextLightning = now + RULES.lightningEvery;
    this.partViews = new Map(this.match.parts.map((p) => [p.id, this.makePartView()]));
    this.startedAt = now;
    this.endsAt = now + this.settings.minutes * 60000;
    this.over = false;
    this.updateGlows();
  }

  now() {
    return this.scene.time.now;
  }

  get you() {
    return this.actors.get(YOU);
  }

  get youId() {
    return YOU;
  }

  emit(...args) {
    this.scene.events.emit(...args);
  }

  /**
   * Play a sound effect (never in the headless simulator). With `at` (an actor) it is quieter
   * the further it is from you: same room loud, other floors faint.
   */
  sound(name, at = null, vol = 1) {
    if (this.sim) return;
    if (at) {
      const v = this.view;
      const d = Math.abs(at.x - v.x) / 1600 + Math.abs(at.floor() - v.floor()) * 0.35;
      vol *= Math.max(0.25, Math.min(1, 1 - d * 0.7));
    }
    sfx.play(name, vol);
  }

  /** Message for you only (other players' secrets stay secret). */
  toastFor(id, text, color, ms) {
    if (id === YOU) this.emit('toast', text, color, ms);
  }

  /** Match time for rule checks: frozen at the meeting's start while a meeting runs. */
  clock() {
    return this.meeting ? this.meeting.startedAt : this.now();
  }

  /** The match clock stops during meetings. */
  timeLeft() {
    return Math.max(0, this.endsAt - (this.meeting ? this.meeting.startedAt : this.now()));
  }

  /** Name used in speech and messages. You are "P1" there (your tag says YOU). */
  name(id) {
    if (id === YOU) return 'P1';
    return this.actors.get(id)?.name ?? id;
  }

  /** Id of the room an actor (or a { floor, x } spot) is in, or null. */
  roomOf(actor) {
    const floor = typeof actor.floor === 'function' ? actor.floor() : actor.floor;
    const px = actor.x - ORIGIN_X;
    return ROOMS.find((q) => q.floor === floor && px >= q.x0 && px < q.x1)?.id ?? null;
  }

  /** Name of the room an actor stands in. */
  roomName(actor) {
    const id = this.roomOf(actor);
    return ROOM_INFO.find((i) => i.id === id)?.name ?? 'facility';
  }

  /** Match clock since the start (meetings excluded), for the recap and the cameras. */
  elapsed() {
    return this.settings.minutes * 60000 - this.timeLeft();
  }

  /** One line of the end-of-match recap (it may name secrets: only shown after the match). */
  log(text, color = '#c9ced8') {
    this.timeline.push({ t: this.elapsed(), text, color });
  }

  /** How far a bot sees: less in Pitch Black, much less for humans in a Blackout. */
  sightOf(brain) {
    let sight = brain.cfg.sight * (this.pitchBlack ? 0.6 : 1);
    if (this.match.isBlackout(this.clock()) && this.match.get(brain.a.id).role === 'human') sight *= 0.35;
    return sight;
  }

  /** Living bots that can see `actor` (same floor, in sight). */
  witnesses(actor) {
    return [...this.brains.values()].filter((b) => b.a !== actor && this.alive(b.a.id) && b.a.floor() === actor.floor() && Math.abs(b.a.x - actor.x) < this.sightOf(b));
  }

  /** The actor the camera follows: you, or your ghost once you are out. */
  get view() {
    return this.ghost ?? this.you;
  }

  /** Points banked outside a duel: tell yourself (only yours). */
  showPoints(effects) {
    for (const e of effects) {
      if (e.type === 'points' && e.player === YOU) this.sound(e.amount > 0 ? 'pointsUp' : 'pointsDown');
      if (e.type === 'points' && e.player === YOU) this.emit('toast', `${e.amount > 0 ? '+' : ''}${e.amount} POINTS  ·  ${POINT_REASONS[e.reason] ?? e.reason}`, e.amount > 0 ? '#3ee6a0' : '#ff5a68', 3500);
    }
  }

  alive(id) {
    return this.match.get(id).alive;
  }

  isBusy(id) {
    return this.busy.has(id);
  }

  chaseOf(id) {
    return this.chases.find((c) => c.chaser.id === id || c.runner.id === id) ?? null;
  }

  /** Stunned players and Cure users in the cell can't move. */
  isFrozen(id) {
    const now = this.now();
    return now < this.match.get(id).stunnedUntil || this.match.inCell(id, now);
  }

  /** Can `a` challenge `b` right now (rules + neither busy or in a chase)? */
  canDuel(a, b) {
    return !this.busy.has(a) && !this.busy.has(b) && !this.chaseOf(a) && !this.chaseOf(b) && this.match.canChallenge(a, b, this.now()).ok;
  }

  /** Other living actors on the same floor within `range` px. */
  visibleActors(actor, range) {
    const out = [];
    for (const o of this.actors.values()) {
      if (o === actor || !this.alive(o.id)) continue;
      if (o.floor() === actor.floor() && Math.abs(o.x - actor.x) < range) out.push(o);
    }
    return out;
  }

  nearestSupply(actor) {
    return [...SUPPLY_BOXES].sort((p, q) => this.cost(actor, p) - this.cost(actor, q))[0];
  }

  cost(actor, spot) {
    return Math.abs(spot.x - actor.x) + Math.abs(spot.floor - actor.floor()) * 700;
  }

  // ------------------------------------------------------------ you
  /** Closest player you could challenge (same floor, in range). */
  nearbyTarget() {
    const you = this.you;
    if (this.meeting || !this.alive(YOU) || this.busy.has(YOU) || this.chaseOf(YOU) || you.state.mode !== 'walk') return null;
    let best = null;
    for (const o of this.actors.values()) {
      if (o === you || !this.alive(o.id) || o.state.mode !== 'walk' || o.floor() !== you.floor()) continue;
      const dx = Math.abs(o.x - you.x);
      if (dx < RULES.challengeRange && (!best || dx < best.dx)) best = { o, dx };
    }
    return best?.o ?? null;
  }

  challengeState(target) {
    if (this.busy.has(target.id) || this.chaseOf(target.id)) return { ok: false, reason: 'busy' };
    return this.match.canChallenge(YOU, target.id, this.now());
  }

  // ------------------------------------------------------------ challenges
  challenge(fromId, toId) {
    if (this.over || this.meeting || !this.canDuel(fromId, toId)) return false;
    const from = this.actors.get(fromId);
    const to = this.actors.get(toId);
    this.busy.add(fromId).add(toId);
    from.face(to.x);
    to.face(from.x);
    from.anim('idle');
    to.anim('idle');
    if (fromId === YOU) {
      this.emit('toast', `Challenging ${to.name}…`, to.color, 1500);
      this.sound('challenge');
    }
    if (toId === YOU && !this.sim) {
      this.sound('challenged');
      this.pending = { from: fromId, expires: this.now() + RULES.answerTime };
      this.emit('challenge-request', { name: from.name, color: from.color, ms: RULES.answerTime });
    } else {
      this.awaiting.add(fromId).add(toId);
      this.scene.time.delayedCall(Phaser.Math.Between(600, 1400), () => this.answerBy(fromId, toId, this.brains.get(toId).respond(fromId)));
    }
    return true;
  }

  /** Your answer to a challenge: accept = duel, run = chase. */
  answer(accept) {
    if (!this.pending) return;
    const { from } = this.pending;
    this.pending = null;
    this.emit('challenge-cancel');
    this.answerBy(from, YOU, accept);
  }

  answerBy(fromId, toId, accept) {
    this.awaiting.delete(fromId);
    this.awaiting.delete(toId);
    if (this.over || this.meeting || !this.alive(fromId) || !this.alive(toId)) {
      this.busy.delete(fromId);
      this.busy.delete(toId);
      return;
    }
    if (!accept) return this.startChase(fromId, toId);
    if (fromId === YOU || toId === YOU) {
      const other = this.actors.get(fromId === YOU ? toId : fromId);
      this.emit('toast', `Duel with ${other.name}. To the table!`, other.color, 2000);
      this.sound('accept');
    }
    this.goToTable(fromId, toId);
  }

  // ------------------------------------------------------------ chases
  /** The challenged player ran: the challenger gets a few seconds to catch them. */
  startChase(chaserId, runnerId) {
    this.busy.delete(chaserId);
    this.busy.delete(runnerId);
    const now = this.now();
    const chase = {
      chaser: this.actors.get(chaserId),
      runner: this.actors.get(runnerId),
      startAt: now + RULES.chaseHeadStart,
      until: now + RULES.chaseHeadStart + RULES.chaseTime,
    };
    this.chases.push(chase);
    this.brains.get(chaserId)?.startChase(runnerId);
    this.brains.get(runnerId)?.startFleeing(chase.chaser);
    if (runnerId === YOU || chaserId === YOU) this.sound('run');
    if (runnerId === YOU) this.emit('chase', { role: 'runner', name: chase.chaser.name, color: chase.chaser.color, until: chase.until });
    if (chaserId === YOU) this.emit('chase', { role: 'chaser', name: chase.runner.name, color: chase.runner.color, until: chase.until, startAt: chase.startAt });
    this.scene.cameras.main.shake(180, 0.004);
  }

  stepChases() {
    const now = this.now();
    for (const c of [...this.chases]) {
      const { chaser, runner } = c;
      const gone = !this.alive(chaser.id) || !this.alive(runner.id) || this.over;
      const close =
        now >= c.startAt &&
        chaser.state.mode === 'walk' && runner.state.mode === 'walk' &&
        chaser.floor() === runner.floor() &&
        Math.abs(chaser.x - runner.x) < RULES.catchRange;
      if (!gone && !close && now < c.until) continue;
      this.chases.splice(this.chases.indexOf(c), 1);
      this.brains.get(chaser.id)?.endChase();
      this.brains.get(runner.id)?.endChase();
      const yours = chaser.id === YOU || runner.id === YOU;
      if (yours) this.emit('chase', null);
      if (gone) continue;
      if (close && this.match.canChallenge(chaser.id, runner.id, now).ok) {
        // caught: the duel is forced
        if (yours) {
          this.emit('toast', runner.id === YOU ? `CAUGHT by ${chaser.name}!` : `You caught ${runner.name}!`, '#ff4a5a', 2200);
          this.sound('caught');
          this.scene.cameras.main.shake(260, 0.01);
        }
        this.busy.add(chaser.id).add(runner.id);
        this.goToTable(chaser.id, runner.id);
      } else {
        for (const p of [chaser, runner]) this.match.get(p.id).cooldownUntil = Math.max(this.match.get(p.id).cooldownUntil, now + ESCAPE_COOLDOWN);
        if (runner.id === YOU) {
          this.emit('toast', 'You got away!', '#3ee6d0');
          this.sound('escaped');
        }
        if (chaser.id === YOU) this.emit('toast', `${runner.name} got away`, '#c9ced8');
      }
    }
  }

  // ------------------------------------------------------------ duels
  /** Both walk to the nearest free duel table on their floor, one each side. */
  goToTable(aId, bId) {
    const a = this.actors.get(aId);
    const b = this.actors.get(bId);
    const floor = a.floor();
    const mid = (a.x + b.x) / 2;
    const taken = new Set([...this.approaches, ...this.botDuels, ...(this.yourDuel ? [this.yourDuel] : [])].map((d) => d.table));
    const tables = DUEL_TABLES.filter((t) => t.floor === floor).sort((p, q) => Math.abs(p.x - mid) - Math.abs(q.x - mid));
    const table = tables.find((t) => !taken.has(t)) ?? tables[0];
    const aLeft = a.x <= b.x;
    this.approaches.push({ a, b, table, ax: table.x + (aLeft ? -64 : 64), bx: table.x + (aLeft ? 64 : -64) });
  }

  stepApproaches(dt) {
    for (const ap of [...this.approaches]) {
      const doneA = ap.a.walkTo(ap.ax, dt);
      const doneB = ap.b.walkTo(ap.bx, dt);
      if (!doneA || !doneB) continue;
      this.approaches.splice(this.approaches.indexOf(ap), 1);
      ap.a.face(ap.b.x);
      ap.b.face(ap.a.x);
      if (!this.sim && (ap.a.id === YOU || ap.b.id === YOU)) {
        // reserve the duel now, so nobody else grabs either player before the screen opens
        this.yourDuel = { ids: [ap.a.id, ap.b.id], table: ap.table };
        this.scene.time.delayedCall(250, () => this.startYourDuel(ap));
      }
      else this.botDuels.push({ ...ap, until: this.now() + BOT_DUEL_TIME });
    }
  }

  startYourDuel(ap) {
    const opp = ap.a.id === YOU ? ap.b : ap.a;
    if (!this.match.canChallenge(YOU, opp.id, this.now()).ok) {
      this.yourDuel = null;
      this.busy.delete(YOU);
      this.busy.delete(opp.id);
      return;
    }
    const brain = this.brains.get(opp.id);
    this.emit('duel-open', true);
    this.scene.scene.launch('DuelScene', {
      match: this.match,
      youId: YOU,
      table: ap.table,
      now: () => this.now(),
      opp: { id: opp.id, name: opp.name, color: opp.color, pickCard: () => brain.pickCard(YOU), pickCall: () => brain.pickCall(YOU) },
      onDone: (out) => {
        this.yourDuel = null;
        this.emit('duel-open', false);
        this.afterDuel(YOU, opp.id, out);
        if (this.meetingQueued && !this.over) {
          const { caller, body } = this.meetingQueued;
          this.meetingQueued = null;
          this.startMeeting(caller, body);
        }
      },
    });
  }

  stepBotDuels() {
    const now = this.now();
    for (const d of [...this.botDuels]) {
      if (now < d.until) continue;
      this.botDuels.splice(this.botDuels.indexOf(d), 1);
      const ba = this.brains.get(d.a.id);
      const bb = this.brains.get(d.b.id);
      const ca = ba?.pickCard(d.b.id);
      const cb = bb?.pickCard(d.a.id);
      if (!ca || !cb || !this.match.canChallenge(d.a.id, d.b.id, now).ok) {
        this.busy.delete(d.a.id);
        this.busy.delete(d.b.id);
        continue;
      }
      const calls = {};
      const callA = ba.pickCall(d.b.id);
      const callB = bb.pickCall(d.a.id);
      if (callA) calls[d.a.id] = callA;
      if (callB) calls[d.b.id] = callB;
      this.afterDuel(d.a.id, d.b.id, this.match.settleDuel(d.a.id, d.b.id, ca.id, cb.id, now, calls));
    }
  }

  afterDuel(aId, bId, out) {
    this.busy.delete(aId);
    this.busy.delete(bId);
    for (const e of out.effects) {
      if (e.type === 'bitten') this.onBitten(e.player, e.by);
      if (e.type === 'killed') this.onKilled(e.player, e.by);
      if (e.type === 'cured') this.onCured(e.player, e.by);
      if (e.type === 'cell') this.toCell(e.player);
      if (e.type === 'handed' && e.to === YOU) this.emit('hand-changed'); // no announcement, no hint
      if (e.type === 'cure-wasted') this.brains.get(e.player)?.onCureWasted(e.player === aId ? bId : aId);
      if (e.type === 'clue') {
        if (e.to === YOU) this.emit('toast', `CLUE about ${this.actors.get(e.about).name}: ${e.text}`, '#ffd27a', 7000);
        else this.brains.get(e.to)?.noteClue(e.about, e.genuine);
      }
      if (e.type === 'stunned') this.toastFor(e.player, `You are stunned for ${RULES.stunTime / 1000} seconds`, '#ffb04a', 4000);
      if (e.type === 'called') {
        this.log(`${this.name(e.player)} called ${this.name(e.against)}'s ${e.card.toUpperCase()} card and cancelled it.`, '#ffd27a');
        this.brains.get(e.player)?.noteCalled(e.against, e.card);
      }
    }
    if (aId === YOU || bId === YOU) this.emit('hand-changed');
    this.checkWin();
  }

  /** Someone was shot: they drop to the floor. Everyone hears who fired, nobody learns the target's role. */
  onKilled(id, by) {
    const a = this.actors.get(id);
    const shooter = this.actors.get(by);
    this.log(`${this.name(by)} shot ${this.name(id)} (${this.match.get(id).role === 'infected' ? 'a zombie' : 'a human'}).`, '#ff7a3a');
    const dropped = this.match.dropPart(id, { floor: a.floor(), x: a.x });
    if (dropped) this.emit('toast', 'A generator part fell to the floor.', '#ffb04a', 3500);
    this.work.delete(id);
    a.down(); // the 'down' pose: on their back, visor dark
    a.sprite.setTint(0x6a707c);
    if (a.glow) a.sprite.preFX?.remove(a.glow);
    a.glow = null;
    a.glowKind = null;
    this.scene.tweens.add({ targets: a.sprite, alpha: 0.85, duration: 450 });
    a.tag?.setText(`☠ ${a.name}`).setColor('#8a909c');
    this.brains.delete(id);
    for (const b of this.brains.values()) b.onShot(by, id);
    this.emit('toast', `☠ ${this.name(by)} shot ${this.name(id)}.`, '#ff7a3a', 5000);
    if (by !== YOU && id !== YOU) this.sound('gunshot', a); // your own shot is heard in the duel screen
    if (RULES.shotStun > 0) this.toastFor(by, `You are stunned for ${RULES.shotStun / 1000} seconds after the shot`, '#ffb04a', 3500);
    if (id === YOU) {
      this.emit('you-died', { by: shooter.name });
      this.scene.cameras.main.shake(400, 0.015);
      this.sound('death');
      this.makeGhost();
    }
  }

  /** A Zombie card bit a human: they are a zombie now. Nobody else is told. */
  onBitten(id, by) {
    this.log(`${this.name(by)} bit ${this.name(id)}: a zombie now.`, '#3ee67a');
    const hunter = this.brains.get(by);
    if (hunter) hunter.lurkUntil = this.now() + hunter.cfg.lurk;
    this.brains.get(id)?.onTurned();
    if (id === YOU) {
      this.youInfected(by);
      this.emit('hand-changed');
    }
    if (by === YOU) this.emit('toast', `You bit ${this.name(id)}. They are one of you now.`, '#3ee67a', 4000);
    this.updateGlows();
  }

  /** A Cure hit a zombie: human again, gagged 60s, recovering 20s. They aren't told who did it. */
  onCured(id, by) {
    this.log(`${this.name(by)} cured ${this.name(id)}: human again.`, '#3e8bff');
    this.brains.get(id)?.onCured();
    if (id === YOU) {
      this.emit('role-changed', 'human');
      this.emit('hand-changed');
      this.emit('toast', 'You were CURED. You are human again, and you forget the other zombies.', '#3e8bff', 6000);
      this.emit('toast', `You are gagged for ${RULES.gagTime / 1000}s: no quick-chat, no voting.`, '#c9ced8', 6000);
      if (this.match.partCarried(YOU)) this.emit('toast', 'You are still carrying a generator part: fit it at the Reactor.', '#ffb04a', 5000);
    }
    this.updateGlows();
  }

  /** The Cure user goes to the quarantine cell for 60s. Everyone sees it, without a reason. */
  toCell(id) {
    const a = this.actors.get(id);
    const cell = ROOMS.find((r) => r.id === 'quarantine');
    const busyHere = this.match.list().filter((p) => p.quarantined || (p.id !== id && this.match.inCell(p.id, this.now()))).length;
    a.state.mode = 'walk';
    a.state.floor = cell.floor;
    a.state.ladder = null;
    a.sprite.setPosition(ORIGIN_X + cell.x0 + 60 + (busyHere % 8) * 30, FLOORS[cell.floor].y);
    a.anim('idle');
    this.brains.get(id)?.toCell();
    this.emit('toast', '⛔ A player was quarantined.', '#ff9a5a', 4000);
    this.sound('cell', null, id === YOU ? 1 : 0.5);
    if (id === YOU) {
      this.emit('toast', `Your Cure worked. You are in quarantine for ${RULES.cureQuarantine / 1000}s (gagged, can't move).`, '#3e8bff', 6000);
      this.scene.cameras.main.flash(300, 60, 120, 255);
    }
  }

  youInfected(byId) {
    this.emit('role-changed', 'infected');
    this.emit('toast', `${this.name(byId)} BIT you. You are a ZOMBIE now. Your first Zombie card grows in ${Math.round(this.match.zombieRegen() / 1000)}s.`, '#3ee67a', 6000);
    const allies = this.match.living('infected').filter((p) => p.id !== YOU).map((p) => this.name(p.id));
    if (allies.length) this.emit('toast', `Fellow infected: ${allies.join(', ')}`, '#3ee67a', 6000);
    this.scene.cameras.main.flash(500, 40, 200, 110);
  }

  /** Infected players see fellow infected with a green outline; a STARVING zombie glows for everyone. */
  updateGlows() {
    const now = this.now();
    const youInfected = this.match.get(YOU).role === 'infected';
    const reveal = !youInfected && now < this.revealUntil; // Last Stand: you see every zombie for a moment
    for (const a of this.actors.values()) {
      const alive = this.alive(a.id);
      // a starving zombie only flares up for a moment, each time it growls
      const starving = alive && this.match.isStarving(a.id, now) && now < (a.growlFlashUntil ?? 0);
      const ally = a.id !== YOU && youInfected && alive && this.match.get(a.id).role === 'infected';
      const shown = reveal && alive && this.match.get(a.id).role === 'infected';
      const want = shown ? 'reveal' : starving ? 'starving' : ally ? 'ally' : null;
      if ((a.glowKind ?? null) === want) continue;
      if (a.glow) a.sprite.preFX?.remove(a.glow);
      a.glow = null;
      a.glowKind = want;
      if (want === 'starving') a.glow = a.sprite.preFX?.addGlow(0xb4ff3a, 6, 0, false, 0.1, 14);
      if (want === 'ally') a.glow = a.sprite.preFX?.addGlow(0x3ee67a, 3, 0, false, 0.1, 10);
      if (want === 'reveal') a.glow = a.sprite.preFX?.addGlow(0xff3b4a, 6, 0, false, 0.1, 14);
    }
  }

  /** Rule events from Match.tick: Zombie cards regrow, the bitten turn or are cured, zombies starve. */
  onTick(events) {
    for (const e of events) {
      const you = e.player === YOU;
      const actor = this.actors.get(e.player);
      if (e.type === 'zombie-grew' && you) {
        this.sound('zombieGrew');
        this.emit('hand-changed');
        this.emit('toast', 'A new ZOMBIE card grew in your hand', '#3ee67a');
      }
      if (e.type === 'released') {
        if (you) this.sound('escaped');
        this.brains.get(e.player)?.released();
        if (you) this.emit('toast', 'You are out of quarantine. Back to it.', '#3ee6d0', 3500);
      }
      if (e.type === 'starving') {
        if (you) this.emit('toast', `You are STARVING. Every ${RULES.growlEvery / 1000}s you growl and flare green for a moment. Bite someone!`, '#b4ff3a', 6000);
        this.updateGlows();
      }
      if (e.type === 'growl' || e.type === 'starving') {
        this.emit('toast', `A hungry growl echoes from the ${this.roomName(actor)}…`, '#b4ff3a', 3500);
        this.sound('growl', actor);
        actor.growlFlashUntil = this.now() + 2500;
        this.updateGlows();
        for (const b of this.witnesses(actor)) b.suspect(e.player, 2, `${actor.name} is glowing and growling. Starving zombie!`);
      }
    }
  }

  // ------------------------------------------------------------ per frame
  update(dt, youInput) {
    const now = this.now();
    if (this.over) return;
    if (this.meeting) {
      this.updateMeeting(now);
      return;
    }
    this.stepApproaches(dt);
    this.stepBotDuels();
    this.stepChases();
    this.onTick(this.match.tick(now));
    this.updateBlackout(now);
    this.updateEvac(now);
    if (now >= this.nextLightning) {
      // v3: a big strike lights every room for a moment: everyone's silhouette shows
      this.nextLightning = now + RULES.lightningEvery;
      this.emit('lightning');
      this.sound('thunder');
    }
    if (this.ghost && !this.sim) this.ghost.control(youInput, dt, PLAYER_SPEED * 1.4);

    const inApproach = new Set(this.approaches.flatMap((a) => [a.a.id, a.b.id]));
    let youMoving = false;
    for (const actor of this.actors.values()) {
      if (inApproach.has(actor.id) || !this.alive(actor.id)) continue;
      const chase = this.chaseOf(actor.id);
      let speed = PLAYER_SPEED;
      let held = this.isFrozen(actor.id) || this.busy.has(actor.id);
      if (chase) {
        const chasing = chase.chaser === actor;
        if (chasing && now < chase.startAt) held = true; // the runner's head start
        speed *= chasing ? RULES.chaserSpeed : RULES.runnerSpeed;
      }
      if (actor.id === YOU && !this.sim) {
        youMoving = actor.control(held ? { x: 0, y: 0 } : youInput, dt, speed);
      } else {
        const brain = this.brains.get(actor.id);
        actor.control(held ? { x: 0, y: 0 } : brain.input(now), dt, speed * brain.cfg.speed);
      }
    }
    if (this.pending && now > this.pending.expires) this.answer(false); // no answer = you run
    if (now > this.nextWatchdog) {
      this.nextWatchdog = now + 500;
      this.releaseOrphans();
      this.updateGlows();
    }

    this.refillRing.clear();
    this.updateRefills(dt, youMoving);
    this.updateWork(dt, youMoving);
    this.updateParts();
    this.updateRoomLog();
    this.updateSigns(now);
    this.updateLabels(now);
    this.updateFaces(now);
    this.checkWin();
  }

  /**
   * Visor expressions and the duel pose. Only states every player can be in (chases, duels,
   * challenges, emotes), never hunger or role: a face must not give anyone away.
   */
  updateFaces(now) {
    if (this.sim) return;
    const atTable = new Set([...this.botDuels.flatMap((d) => [d.a.id, d.b.id]), ...(this.yourDuel?.ids ?? [])]);
    const walking = new Set(this.approaches.flatMap((d) => [d.a.id, d.b.id]));
    for (const actor of this.actors.values()) {
      if (!this.alive(actor.id)) continue;
      actor.setPose(atTable.has(actor.id) ? 'duel' : null);
      const bubble = this.bubbles.get(actor.id);
      const chase = this.chaseOf(actor.id);
      let face = 'neutral';
      if (bubble && now < bubble.until) face = FACE_FOR_EMOTE[bubble.kind] ?? 'happy';
      else if (chase) face = chase.runner === actor ? 'scared' : 'angry';
      else if (atTable.has(actor.id) || walking.has(actor.id)) face = 'scared';
      else if (this.busy.has(actor.id) || (this.pending && (this.pending.from === actor.id || actor.id === YOU))) face = 'suspicious';
      actor.setExpression(face);
    }
  }

  /** Safety net: free anyone marked busy who is no longer in any challenge or duel. */
  releaseOrphans() {
    const involved = new Set([
      ...this.awaiting,
      ...(this.pending ? [this.pending.from, YOU] : []),
      ...this.approaches.flatMap((a) => [a.a.id, a.b.id]),
      ...this.botDuels.flatMap((d) => [d.a.id, d.b.id]),
      ...(this.yourDuel?.ids ?? []),
    ]);
    for (const id of [...this.busy]) if (!involved.has(id)) this.busy.delete(id);
  }

  // ------------------------------------------------------------ v3: stations
  /** What `actor` could use right here: a body, the generator, a part, the Emergency Button, the breaker, the security desk. */
  stationFor(actor) {
    if (actor.state.mode !== 'walk' || !this.alive(actor.id)) return null;
    const near = (spot, range = RULES.stationRange) => spot.floor === actor.floor() && Math.abs(spot.x - actor.x) < range;
    for (const o of this.actors.values()) {
      const p = this.match.get(o.id);
      if (p.shot && !p.reported && near({ floor: o.floor(), x: o.x }, RULES.reportRange)) return { kind: 'report', target: o.id };
    }
    const carrying = this.match.partCarried(actor.id);
    if (carrying && near(GENERATOR, 90)) return { kind: 'fit', target: carrying.id };
    if (!carrying) {
      const part = this.match.parts.find((q) => q.at && !q.fitted && near(q.at));
      if (part) return { kind: 'pick', target: part.id };
    }
    if (near(EMERGENCY_BUTTON, RULES.meetingRange)) return { kind: 'meeting' };
    if (near(BREAKER) && this.match.get(actor.id).role === 'infected') return { kind: 'blackout' };
    if (near(SECURITY_DESK)) return { kind: 'camera' };
    return null;
  }

  /** 'meeting' when an actor stands at the Emergency Button, else null. */
  stationAt(actor) {
    if (actor.state.mode !== 'walk') return null;
    const b = EMERGENCY_BUTTON;
    return b.floor === actor.floor() && Math.abs(b.x - actor.x) < RULES.meetingRange ? 'meeting' : null;
  }

  /** The action button for you right now: { kind, label, note, enabled, color } or null. */
  yourAction() {
    if (this.meeting || this.over || !this.alive(YOU) || this.busy.has(YOU) || this.chaseOf(YOU)) return null;
    if (this.work.has(YOU)) return { kind: 'work', label: 'WORKING', note: 'STAND STILL', enabled: false, color: '#ffb04a' };
    const st = this.stationFor(this.you);
    if (!st) return null;
    const now = this.now();
    const wait = (c) => (c.reason === 'in-cell' ? 'QUARANTINED' : c.reason === 'used' ? 'USED' : c.wait ? `WAIT ${Math.ceil(c.wait / 1000)}s` : 'NOT NOW');
    if (st.kind === 'report') {
      const c = this.match.canReport(YOU, st.target, now);
      return { ...st, label: 'REPORT', note: this.meetingQueued ? 'CALLED' : c.ok ? 'BODY' : wait(c), enabled: c.ok && !this.meetingQueued, color: '#ff7a3a' };
    }
    if (st.kind === 'fit') return { ...st, label: 'FIT PART', note: 'GENERATOR', enabled: true, color: '#ffb04a' };
    if (st.kind === 'pick') return { ...st, label: 'PICK UP', note: 'POWER PART', enabled: true, color: '#ffb04a' };
    if (st.kind === 'meeting') {
      const c = this.match.canCallMeeting(YOU, now);
      return { ...st, label: 'MEETING', note: this.meetingQueued ? 'CALLED' : c.ok ? 'CALL MEETING' : wait(c), enabled: c.ok && !this.meetingQueued, color: '#ff3b4a' };
    }
    if (st.kind === 'blackout') {
      const c = this.match.canBlackout(YOU, now);
      return { ...st, label: 'BLACKOUT', note: c.ok ? 'CUT POWER' : wait(c), enabled: c.ok, color: '#b4ff3a' };
    }
    const ready = now >= this.cameraReadyAt;
    return { ...st, label: 'CAMERAS', note: ready ? 'CHECK' : `WAIT ${Math.ceil((this.cameraReadyAt - now) / 1000)}s`, enabled: ready, color: '#9ab8ff' };
  }

  /** You pressed the action button (Space). */
  doAction() {
    const a = this.yourAction();
    if (a?.enabled) this.useStation(YOU, a);
  }

  /** Use a station (you or a bot). */
  useStation(id, st) {
    if (st.kind === 'report') return this.reportBody(id, st.target);
    if (st.kind === 'fit' || st.kind === 'pick') return this.startWork(id, st.kind, st.target);
    if (st.kind === 'meeting') return this.callMeeting(id);
    if (st.kind === 'blackout') return this.doBlackout(id);
    if (st.kind === 'camera' && id === YOU) {
      this.sound('camera');
      this.cameraReadyAt = this.now() + RULES.cameraCooldown;
      this.emit('camera', this.cameraEntries());
      return true;
    }
    return false;
  }

  /** Start standing still at a part (pick it up) or the generator (fit it). Moving cancels. */
  startWork(id, kind, target) {
    if (this.work.has(id) || this.busy.has(id) || this.chaseOf(id)) return false;
    this.work.set(id, { kind, target, ms: 0 });
    return true;
  }

  updateWork(dt, youMoving) {
    const g = this.refillRing;
    const now = this.now();
    for (const [id, w] of [...this.work]) {
      const actor = this.actors.get(id);
      const st = this.alive(id) ? this.stationFor(actor) : null;
      const moving = id === YOU && !this.sim ? youMoving : actor.sprite.anims.currentAnim?.key.endsWith('walk');
      if (!st || st.kind !== w.kind || st.target !== w.target || moving || this.busy.has(id) || this.chaseOf(id) || this.isFrozen(id)) {
        this.work.delete(id);
        continue;
      }
      w.ms += dt * 1000;
      const need = w.kind === 'pick' ? RULES.partPickTime : RULES.partDeliverTime;
      const t = Math.min(1, w.ms / need);
      g.lineStyle(4, 0xffffff, 0.15).strokeCircle(actor.x, actor.y - 120, 12);
      g.lineStyle(4, 0xffb04a, 1).beginPath().arc(actor.x, actor.y - 120, 12, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2).strokePath();
      if (t < 1) continue;
      this.work.delete(id);
      if (w.kind === 'pick' && this.match.pickPart(id, w.target, now)) {
        this.toastFor(id, 'You picked up a generator part. Fit it at the generator in the Reactor (basement).', '#ffb04a', 5000);
        if (id === YOU) this.sound('partPick');
        this.log(`${this.name(id)} picked up a generator part (${this.match.get(id).role === 'infected' ? 'a zombie hiding it' : 'a human'}).`, '#ffb04a');
      }
      if (w.kind === 'fit') this.onPartFitted(id, this.match.fitPart(id, now));
    }
  }

  onPartFitted(id, res) {
    if (!res) return;
    this.showPoints(res.effects);
    this.emit('part-fitted', res.left);
    if (!res.restored) this.sound('partFit', this.actors.get(id), id === YOU ? 1 : 0.7);
    this.log(`${this.name(id)} fitted a generator part.`, '#ffb04a');
    if (!res.restored) {
      this.emit('toast', `⚡ A part was fitted at the generator. ${res.left} to go.`, '#ffb04a', 4000);
      return;
    }
    this.emit('toast', `⚡ POWER RESTORED. The evac truck reaches the Entrance in ${RULES.evacTime / 1000}s. More humans than zombies inside = humans win!`, '#ffd27a', 7000);
    this.log('POWER RESTORED: the evac truck is on its way.', '#ffd27a');
    this.emit('power');
    this.sound('power');
    this.scene.cameras.main.flash(400, 255, 210, 120);
  }

  /** The evac truck arrives: humans win if more humans than zombies stand in the Entrance. */
  updateEvac(now) {
    const at = this.match.evacAt;
    if (at === null) return;
    if (!this.evacWarned && at - now <= 20000) {
      this.evacWarned = true;
      this.emit('toast', 'The evac truck is 20 seconds out. Everyone to the Entrance!', '#ffd27a', 5000);
      this.sound('evacWarn');
    }
    if (now < at) return;
    this.match.evacAt = null;
    const inside = [...this.actors.values()].filter((a) => this.alive(a.id) && a.state.mode === 'walk' && this.roomOf(a) === EVAC_ROOM);
    const humans = inside.filter((a) => this.match.get(a.id).role === 'human').length;
    const zombies = inside.length - humans;
    if (humans >= 1 && humans > zombies) {
      this.log(`The evac truck took ${humans} human${humans > 1 ? 's' : ''} out (${zombies} zombie${zombies === 1 ? '' : 's'} at the door).`, '#2fd2e0');
      this.end('humans', 'evac');
      return;
    }
    this.sound('evacFail');
    this.emit('toast', `The evac truck left without anyone: ${humans} human${humans === 1 ? '' : 's'} vs ${zombies} zombie${zombies === 1 ? '' : 's'} at the Entrance.`, '#ff9a5a', 6000);
    this.log(`The evac failed: ${humans} human${humans === 1 ? '' : 's'} vs ${zombies} zombie${zombies === 1 ? '' : 's'} at the Entrance.`, '#ff9a5a');
  }

  /** The zombies' one Blackout: every room goes dark for humans for 15s. */
  doBlackout(id) {
    const now = this.now();
    if (this.over || this.meeting || !this.match.canBlackout(id, now).ok) return false;
    this.match.blackout(id, now);
    this.blackoutOn = true;
    this.emit('toast', '⚠ BLACKOUT! The lights are out.', '#b4ff3a', 4000);
    this.sound('blackout');
    if (!this.sim) sfx.ambientDark(true);
    this.toastFor(id, `You cut the power for ${RULES.blackoutTime / 1000}s. Zombies see fine in the dark.`, '#3ee67a', 4000);
    this.log(`${this.name(id)} cut the power: BLACKOUT.`, '#b4ff3a');
    this.emit('blackout', true);
    return true;
  }

  updateBlackout(now) {
    if (!this.blackoutOn || this.match.isBlackout(now)) return;
    this.blackoutOn = false;
    this.emit('blackout', false);
    this.emit('toast', 'The emergency lights come back on.', '#c9ced8', 2500);
    this.sound('lightsOn');
    if (!this.sim) sfx.ambientDark(false);
  }

  /** Report a shot body: calls a meeting (doesn't use your Emergency Button). */
  reportBody(id, bodyId) {
    if (this.over || this.meeting || this.meetingQueued || this.busy.has(id) || this.chaseOf(id)) return false;
    if (!this.match.canReport(id, bodyId, this.now()).ok) return false;
    if (this.yourDuel) this.meetingQueued = { caller: id, body: bodyId };
    else this.startMeeting(id, bodyId);
    return true;
  }

  /** Security cameras: the last few room entries (not yours), newest first. */
  cameraEntries() {
    const now = this.elapsed();
    return this.roomLog
      .filter((e) => e.id !== YOU)
      .slice(-RULES.cameraEntries)
      .reverse()
      .map((e) => ({ name: this.name(e.id), color: this.actors.get(e.id).color, room: ROOM_INFO.find((i) => i.id === e.room)?.name ?? e.room, ago: Math.max(0, Math.round((now - e.at) / 1000)) }));
  }

  updateRoomLog() {
    for (const a of this.actors.values()) {
      if (!this.alive(a.id) || a.state.mode !== 'walk') continue;
      const room = this.roomOf(a);
      if (!room || this.lastRoom.get(a.id) === room) continue;
      const first = !this.lastRoom.has(a.id);
      this.lastRoom.set(a.id, room);
      if (first) continue;
      this.roomLog.push({ id: a.id, room, at: this.elapsed() });
      if (this.roomLog.length > 60) this.roomLog.shift();
    }
  }

  // ------------------------------------------------------------ v3: generator parts (drawn)
  makePartView() {
    const s = this.scene;
    const g = s.add.graphics();
    g.fillStyle(0x0b0d12, 1).fillRoundedRect(-8, -22, 16, 22, 3).lineStyle(1.5, 0xe9e4d6, 0.9).strokeRoundedRect(-8, -22, 16, 22, 3);
    g.fillStyle(0xffb04a, 1).fillRect(-4, -17, 8, 10).fillStyle(0xe9e4d6, 1).fillRect(-5, -25, 10, 3);
    const glow = s.add.image(0, -11, 'glow').setScale(0.22).setTint(0xffb04a).setBlendMode(Phaser.BlendModes.ADD);
    s.tweens.add({ targets: glow, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    return s.add.container(0, 0, [glow, g]).setDepth(11);
  }

  updateParts() {
    for (const part of this.match.parts) {
      const v = this.partViews.get(part.id);
      if (!v) continue;
      if (part.fitted) v.setVisible(false);
      else if (part.carrier) {
        const a = this.actors.get(part.carrier);
        v.setVisible(true).setPosition(a.x + 16, a.y - 52).setScale(0.8); // in their hands: everyone can see who carries one
      } else v.setVisible(true).setPosition(part.at.x, FLOORS[part.at.floor].y).setScale(1);
    }
  }

  // ------------------------------------------------------------ v3: Last Stand, ghost, emotes
  /** When one human is left they get a 1-bullet Gun and see the zombies for 5 seconds. */
  checkLastStand() {
    const id = this.match.checkLastStand();
    if (!id) return;
    this.emit('toast', '⚡ LAST STAND! One human is left.', '#ff4a5a', 5000);
    this.sound('lastStand');
    this.log(`LAST STAND: ${this.name(id)} is the last human and got a 1-bullet Gun.`, '#ff4a5a');
    if (id === YOU) {
      this.revealUntil = this.now() + RULES.lastStandReveal;
      this.emit('hand-changed');
      this.emit('last-stand');
      this.emit('toast', `You got a Gun bullet. The zombies glow red for ${RULES.lastStandReveal / 1000} seconds.`, '#ff7a3a', 6000);
      this.updateGlows();
    }
    const brain = this.brains.get(id);
    if (brain) for (const z of this.match.living('infected')) brain.suspect(z.id, 6, `${this.name(z.id)} is a zombie. I saw it at my Last Stand.`);
  }

  /** You are out: a see-through ghost you can walk around with (all rooms lit, no talking). */
  makeGhost() {
    if (this.sim || this.ghost) return;
    const a = this.you;
    this.ghost = new Actor(this.scene, { id: 'ghost', name: '', color: '#9ab8ff', floor: a.floor(), x: a.x, isYou: false, ghost: true });
    this.ghost.sprite.setAlpha(0.45).setDepth(21).setTint(0xc8d8ff);
    this.emit('ghost', this.ghost);
  }

  /** Show an emote over a player's head. `sus` names the nearest player (or `target`). Bots react. */
  emote(id, kind, target = null) {
    const now = this.now();
    const actor = this.actors.get(id);
    if (!EMOTES[kind] || !actor || !this.alive(id) || this.meeting || now < (this.emoteAt.get(id) ?? 0)) return false;
    this.emoteAt.set(id, now + 1500);
    if (kind === 'sus' && !target) {
      const near = this.visibleActors(actor, 350).sort((p, q) => Math.abs(p.x - actor.x) - Math.abs(q.x - actor.x))[0];
      target = near?.id ?? null;
    }
    const text = kind === 'sus' && target ? `SUS: ${this.name(target)}` : EMOTES[kind];
    this.bubbles.set(id, { text, kind, until: now + 2200 });
    this.sound('emote', actor, id === YOU ? 1 : 0.5);
    for (const b of this.witnesses(actor)) b.seeEmote(id, kind, target);
    return true;
  }

  /** Exhausted players refill by standing still at a card refill for 5 seconds. */
  updateRefills(dt, youMoving) {
    const g = this.refillRing;
    this.refillHint = null;
    for (const actor of this.actors.values()) {
      const id = actor.id;
      if (!this.alive(id)) continue;
      const box = SUPPLY_BOXES.find((b) => b.floor === actor.floor() && Math.abs(b.x - actor.x) < RULES.refillRange);
      const moving = id === YOU && !this.sim ? youMoving : actor.sprite.anims.currentAnim?.key.endsWith('walk');
      if (!box || this.busy.has(id) || actor.state.mode !== 'walk' || !this.match.isExhausted(id)) {
        this.refill.delete(id);
        continue;
      }
      const ms = moving ? 0 : (this.refill.get(id) ?? 0) + dt * 1000;
      this.refill.set(id, ms);
      if (id === YOU) this.refillHint = moving ? 'STAND STILL TO REFILL' : 'REFILLING…';
      const t = Math.min(1, ms / RULES.refillTime);
      g.lineStyle(4, 0xffffff, 0.15).strokeCircle(actor.x, actor.y - 120, 12);
      g.lineStyle(4, 0xf2b84a, 1).beginPath().arc(actor.x, actor.y - 120, 12, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2).strokePath();
      if (t >= 1) {
        const drawn = this.match.refill(id);
        this.refill.delete(id);
        if (id === YOU) {
          this.emit('hand-changed');
          this.emit('toast', `Refilled: +${drawn.length} cards`, '#f2b84a');
          this.sound('refill');
        }
      }
    }
  }

  // ------------------------------------------------------------ meetings
  /** Press the Emergency Button (Central Hall). Everyone is pulled into a meeting. */
  callMeeting(id) {
    const actor = this.actors.get(id);
    if (this.over || this.meeting || this.meetingQueued || this.busy.has(id) || this.chaseOf(id)) return false;
    if (this.stationAt(actor) !== 'meeting' || !this.match.canCallMeeting(id, this.now()).ok) return false;
    if (this.yourDuel) this.meetingQueued = { caller: id, body: null }; // starts when your duel screen closes
    else this.startMeeting(id);
    return true;
  }

  /** A meeting: from the Emergency Button, or from a reported body (`bodyId`). */
  startMeeting(callerId, bodyId = null) {
    const now = this.now();
    if (this.over || !this.alive(callerId)) return;
    if (bodyId) {
      if (!this.match.canReport(callerId, bodyId, now).ok) return;
      this.match.report(callerId, bodyId, now);
    } else {
      if (!this.match.canCallMeeting(callerId, now).ok) return;
      this.match.callMeeting(callerId, now);
    }
    const opening = bodyId
      ? `${this.name(callerId)} reported ${this.name(bodyId)}'s body in the ${this.roomName(this.actors.get(bodyId))}.`
      : `${this.name(callerId)} pressed the Emergency Button.`;
    this.log(bodyId ? opening : `${this.name(callerId)} called a meeting.`, '#ffd27a');
    for (const id of [...this.work.keys()]) this.work.delete(id);
    // stop everything that was going on
    if (this.pending) this.emit('challenge-cancel');
    if (this.chaseOf(YOU)) this.emit('chase', null);
    for (const c of this.chases) {
      this.brains.get(c.chaser.id)?.endChase();
      this.brains.get(c.runner.id)?.endChase();
    }
    this.pending = null;
    this.approaches = [];
    this.botDuels = [];
    this.chases = [];
    this.awaiting.clear();
    this.busy.clear();
    this.refill.clear();
    this.refillRing.clear();
    // everyone still in the match gathers in the Central Hall (Cure users stay in the cell)
    const hall = ROOMS.find((r) => r.id === 'hall');
    const present = Phaser.Utils.Array.Shuffle([...this.actors.values()].filter((a) => this.alive(a.id) && !this.match.inCell(a.id, now)));
    present.forEach((a, i) => {
      a.state.mode = 'walk';
      a.state.floor = hall.floor;
      a.state.ladder = null;
      a.sprite.setPosition(ORIGIN_X + hall.x0 + 60 + ((hall.x1 - hall.x0 - 120) * (i + 0.5)) / present.length, FLOORS[hall.floor].y);
      a.sprite.anims.resume();
      a.anim('idle');
      a.face(ORIGIN_X + (hall.x0 + hall.x1) / 2);
    });
    this.meeting = {
      caller: callerId,
      body: bodyId,
      startedAt: now,
      phase: 'talk',
      phaseEnds: now + RULES.meetingTalk,
      log: [{ from: null, text: opening }],
      votes: new Map(),
      result: null,
      yourLastSay: 0,
      yourSays: 0,
    };
    for (const b of this.brains.values()) b.meetingStart(now, b.a.id === callerId);
    this.sound(bodyId ? 'caught' : 'meeting');
    if (bodyId) this.sound('meeting', null, 0.8);
    this.emit('meeting', true);
  }

  /** Players still in the match. */
  present() {
    return this.match.list().filter((p) => p.alive);
  }

  /** Who may vote right now (not gagged). */
  voters() {
    return this.present().filter((p) => this.match.canVote(p.id, this.clock()));
  }

  /** Who may be voted out (not inside the 60s cure quarantine). */
  candidates() {
    return this.present().filter((p) => this.match.canBeVoted(p.id, this.clock()));
  }

  updateMeeting(now) {
    const m = this.meeting;
    if (m.phase === 'talk') {
      for (const b of this.brains.values()) {
        if (!this.alive(b.a.id) || this.match.isGagged(b.a.id, this.clock()) || now < b.nextSpeakAt) continue;
        const msg = b.speak(m);
        b.afterSpeak(now, !!msg);
        if (msg) this.say({ ...msg, from: b.a.id });
      }
      if (now >= m.phaseEnds) {
        m.phase = 'vote';
        m.phaseEnds = now + RULES.meetingVote;
        m.log.push({ from: null, text: 'Voting has started.' });
        for (const b of this.brains.values()) b.voteAt = now + rand(1500, RULES.meetingVote - 2500);
      }
    } else if (m.phase === 'vote') {
      for (const b of this.brains.values()) {
        if (!this.match.canVote(b.a.id, this.clock()) || m.votes.has(b.a.id) || now < b.voteAt) continue;
        this.castVote(b.a.id, b.castVote(m));
      }
      const everyone = this.voters().every((p) => m.votes.has(p.id));
      if (everyone || now >= m.phaseEnds) {
        for (const p of this.voters()) if (!m.votes.has(p.id)) m.votes.set(p.id, 'skip');
        m.result = tallyVotes(m.votes);
        m.phase = 'result';
        m.phaseEnds = now + RULES.meetingResult;
        m.log.push({ from: null, text: m.result.out ? `${this.name(m.result.out)} is sent to the Quarantine Cell.` : 'No one is quarantined.' });
      }
    } else if (now >= m.phaseEnds) this.endMeeting(now);
  }

  /** Something said in the meeting (by you or a bot). Bots listen and update their suspicion. */
  say(msg) {
    const m = this.meeting;
    if (!m || m.phase !== 'talk') return;
    m.log.push(msg);
    if (msg.kind === 'accuse' && msg.target) this.match.noteAccused(msg.target);
    for (const b of this.brains.values()) if (b.a.id !== msg.from && this.alive(b.a.id)) b.hear(msg, m);
  }

  /** Quick chat: kind = accuse | vouch | clean | skip; target = a player id for accuse / vouch. Gagged players can't. */
  youSay(kind, target = null) {
    const m = this.meeting;
    const now = this.now();
    if (!m || m.phase !== 'talk' || !this.match.canVote(YOU, this.clock()) || now - m.yourLastSay < 1500 || m.yourSays >= 8) return false;
    if ((kind === 'accuse' || kind === 'vouch') && !target) return false;
    const t = target ? this.name(target) : '';
    const text = {
      accuse: `I think ${t} is infected.`,
      vouch: `${t} is fine. I trust them.`,
      clean: "I'm clean, trust me.",
      skip: "No idea yet. Let's skip unless someone is sure.",
    }[kind];
    if (!text) return false;
    m.yourLastSay = now;
    m.yourSays++;
    this.say({ from: YOU, kind, target, text });
    return true;
  }

  castVote(id, target) {
    const m = this.meeting;
    if (!m || m.phase !== 'vote' || m.votes.has(id) || !this.match.canVote(id, this.clock())) return false;
    if (target !== 'skip' && !(this.match.players.has(target) && this.match.canBeVoted(target, this.clock()))) return false;
    m.votes.set(id, target);
    return true;
  }

  /** Your vote: a player id or 'skip'. */
  vote(target) {
    return this.castVote(YOU, target);
  }

  endMeeting(now) {
    const m = this.meeting;
    const dur = now - m.startedAt;
    // the match was paused: every running timer moves back
    this.match.shiftTimers(m.startedAt, dur);
    this.endsAt += dur;
    this.match.meetingReadyAt = now + RULES.meetingCooldown;
    this.nextLightning += dur;
    this.cameraReadyAt += dur;
    if (this.revealUntil > m.startedAt) this.revealUntil += dur;
    for (const b of this.brains.values()) b.meetingEnd(now, dur, m);
    this.meeting = null;
    this.emit('meeting', false);
    if (m.result?.out) {
      this.showPoints(this.match.rewardVoters(m.result.out, m.votes));
      this.quarantine(m.result.out);
    }
    this.updateGlows();
    this.checkWin();
  }

  /** Voted out: locked in the Quarantine Cell for the rest of the match. Their role stays secret. */
  quarantine(id) {
    this.log(`${this.name(id)} was voted out (${this.match.get(id).role === 'infected' ? 'a zombie' : 'a human'}).`, '#ff9a5a');
    if (this.match.dropPart(id)) this.emit('toast', 'Their generator part went back where it was found.', '#ffb04a', 3500);
    this.work.delete(id);
    this.match.quarantine(id);
    const a = this.actors.get(id);
    const cell = ROOMS.find((r) => r.id === 'quarantine');
    const locked = this.match.list().filter((p) => p.quarantined).length;
    a.state.mode = 'walk';
    a.state.floor = cell.floor;
    a.state.ladder = null;
    a.sprite.setPosition(ORIGIN_X + cell.x1 - 50 - ((locked - 1) % 6) * 28, FLOORS[cell.floor].y).setAlpha(0.75);
    a.anim('idle');
    a.tag?.setText(`⛔ ${a.name}`).setColor('#ff9a5a');
    this.brains.delete(id);
    for (const b of this.brains.values()) b.suspicion.delete(id);
    this.emit('toast', `⛔ ${a.name} was quarantined. Nobody knows if they were infected.`, '#ff9a5a', 6000);
    if (id === YOU) {
      this.emit('you-quarantined');
      this.makeGhost();
    }
  }

  // ------------------------------------------------------------ signs
  /** How visible someone's infection signs are right now (0 = none, 1 = obvious). Starving = 1. */
  signStrength(id) {
    const p = this.match.get(id);
    if (p.role !== 'infected' || !p.alive) return 0;
    if (this.match.isStarving(id, this.now())) return 1;
    return Phaser.Math.Clamp((this.now() - p.infectedAt) / RULES.signsTime, 0, 1);
  }

  /**
   * Infection signs, visible to everyone but subtle: a faint tint, a rare green
   * flicker, an occasional twitch and faintly glowing footprints.
   */
  updateSigns(now) {
    for (const actor of this.actors.values()) {
      if (!this.alive(actor.id)) continue;
      let sign = this.signs.get(actor.id);
      if (!sign) this.signs.set(actor.id, (sign = { nextTwitch: now + 4000 + Math.random() * 5000, stepX: actor.x }));
      const t = this.signStrength(actor.id);
      if (t === 0) {
        // human: no signs. A freshly cured player looks pale while recovering.
        if (this.match.isRecovering(actor.id, now)) actor.sprite.setTint(0xc8ccd6);
        else if (actor.sprite.isTinted) actor.sprite.clearTint();
        continue;
      }
      // Kept subtle on purpose: a barely-there tint and a rare green flicker, never a plain green suit.
      if (t > 0.3 && now > (sign.nextFlicker ?? 0)) {
        sign.nextFlicker = now + 8000 + Math.random() * 7000;
        sign.flickerUntil = now + 160;
      }
      const flicker = now < (sign.flickerUntil ?? 0);
      const c = flicker ? { r: 170, g: 255, b: 190 } : Phaser.Display.Color.Interpolate.ColorWithColor({ r: 255, g: 255, b: 255 }, { r: 235, g: 255, b: 238 }, 1, t);
      actor.sprite.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      if (t > 0.25 && now > sign.nextTwitch && !this.busy.has(actor.id)) {
        sign.nextTwitch = now + 4000 + Math.random() * 6000;
        this.scene.tweens.add({ targets: actor.sprite, angle: Phaser.Math.Between(-6, 6), duration: 60, yoyo: true, repeat: 1 });
      }
      if (t > 0.5 && actor.state.mode === 'walk' && Math.abs(actor.x - sign.stepX) > 60) {
        sign.stepX = actor.x;
        this.footprint(actor.x, actor.y);
      }
    }
  }

  footprint(x, y) {
    const f = this.scene.add.ellipse(x, y - 1, 9, 3, 0x3ee67a, 0.3).setDepth(8.5).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: f, alpha: 0, duration: 3500, onComplete: () => f.destroy() });
  }

  updateLabels(now) {
    const inDuel = new Set(this.botDuels.flatMap((d) => [d.a.id, d.b.id]));
    this.drawBubbles(now);
    for (const actor of this.actors.values()) {
      if (actor.id === YOU) continue;
      const p = this.match.get(actor.id);
      if (!p.alive) {
        if (p.quarantined) actor.updateLabels('QUARANTINED');
        else {
          actor.tag?.setPosition(actor.x + 40, actor.y - 30);
          actor.status?.setText('');
          actor.badge?.setText('');
        }
        continue;
      }
      const chase = this.chaseOf(actor.id);
      let text = '';
      if (inDuel.has(actor.id)) text = '⚔ DUEL';
      else if (chase) text = chase.runner === actor ? 'RUNNING!' : 'CHASING';
      else if (this.match.inCell(actor.id, now)) text = `● QUARANTINE ${Math.ceil((p.cellUntil - now) / 1000)}`;
      else if (now < p.stunnedUntil) text = `STUNNED ${Math.ceil((p.stunnedUntil - now) / 1000)}`;
      else if (this.work.has(actor.id)) text = this.work.get(actor.id).kind === 'fit' ? 'FITTING PART' : 'PICKING UP';
      else if (this.match.isExhausted(actor.id)) text = 'NO CARDS';
      actor.updateLabels(text);
    }
  }

  /** Emote bubbles over heads (hidden in dark rooms like everything else). */
  drawBubbles(now) {
    this.bubbleViews ??= new Map();
    for (const [id, b] of this.bubbles) {
      const actor = this.actors.get(id);
      let v = this.bubbleViews.get(id);
      if (now >= b.until || !this.alive(id)) {
        v?.destroy();
        this.bubbleViews.delete(id);
        this.bubbles.delete(id);
        continue;
      }
      if (!v) {
        v = this.scene.add.text(0, 0, '', { fontFamily: '"Rajdhani", sans-serif', fontSize: '13px', fontStyle: '700', color: '#0a0b10', backgroundColor: '#e9e4d6', padding: { x: 8, y: 3 }, resolution: 3 })
          .setOrigin(0.5).setDepth(19);
        this.bubbleViews.set(id, v);
      }
      if (v.text !== b.text) v.setText(b.text).setBackgroundColor(b.text.startsWith('SUS') ? '#ffb04a' : b.text === 'HELP!' ? '#ff7a7a' : '#e9e4d6');
      v.setPosition(actor.x, actor.y - (id === YOU ? 112 : 136));
    }
  }

  checkWin() {
    if (this.over) return;
    this.checkLastStand();
    const w = this.match.winner();
    if (w) return this.end(w, w === 'infected' ? 'all-infected' : 'all-zombies-gone');
    if (this.now() >= this.endsAt) this.end(this.match.timeUpWinner(), 'time');
  }

  end(winner, reason) {
    this.over = true;
    this.emit('challenge-cancel');
    this.emit('chase', null);
    if (this.meeting) this.emit('meeting', false);
    this.match.finish(reason); // stealth + Last Stand bonuses
    this.log(reason === 'evac' ? 'HUMANS ESCAPED.' : winner === 'infected' ? 'THE INFECTED WIN.' : 'THE HUMANS WIN.', winner === 'infected' ? '#3ee67a' : '#2fd2e0');
    const you = this.match.get(YOU);
    const youWon = (winner === 'humans') === (you.role === 'human');
    if (reason === 'evac') this.sound('power', null, 0.6);
    this.sound(youWon ? 'matchWin' : 'matchLose');
    const players = this.match.list().map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      role: p.role,
      alive: p.alive,
      quarantined: p.quarantined,
      shot: p.shot,
      startedInfected: p.startedInfected,
      stats: { ...p.stats },
      score: this.match.score(p.id),
      parts: this.match.scoreParts(p.id),
      shotBy: p.shotBy ? this.match.get(p.shotBy).name : null,
      inCell: this.match.inCell(p.id, this.clock()),
      accused: this.match.accused.has(p.id),
    }));
    this.emit('match-over', {
      winner, reason, youWon, youRole: you.role, players, settings: this.settings, duration: this.now() - this.startedAt,
      timeline: this.timeline, modifier: this.modifier,
    });
  }
}
