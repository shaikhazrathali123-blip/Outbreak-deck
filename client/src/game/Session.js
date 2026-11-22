import Phaser from 'phaser';
import { PLAYER_COLORS, RULES, PLAYER_SPEED, ROOMS as ROOM_INFO } from '../../../shared/constants.js';
import { Match, assignRoles, tallyVotes } from '../../../shared/match.js';
import { createRng } from '../../../shared/cards.js';
import { ORIGIN_X, FLOORS, ROOMS, DUEL_TABLES, SUPPLY_BOXES, BLOOD_TEST, CURE_STATION, EMERGENCY_BUTTON } from '../side/facility.js';
import Actor from '../side/Actor.js';
import BotBrain from './BotBrain.js';

const YOU = 'you';
const BOT_DUEL_TIME = 2600;
const ESCAPE_COOLDOWN = 4000; // after a chase, neither can be challenged again straight away

const rand = (a, b) => a + Math.random() * (b - a);

/**
 * One match: players (you + bots), roles, the shared Match rules, challenges,
 * chases, duels, kills, bites and incubation, hunger, infection signs, refills,
 * the Blood Test and Cure machine, emergency meetings + votes, the timer and the win check.
 * Talks to the HUD through scene events: toast, hand-changed, role-changed,
 * duel-open, challenge-request, challenge-cancel, chase, you-died, you-quarantined,
 * meeting (true/false), match-over.
 */
export default class Session {
  constructor(scene, settings = {}) {
    this.scene = scene;
    this.settings = { bots: 7, difficulty: 'normal', minutes: RULES.matchMinutes, ...settings };
    const params = new URLSearchParams(window.location.search);
    const seed = Number(params.get('seed')) || Date.now();
    const rng = createRng(seed + 1);
    const now = this.now();

    // --- players and roles
    const count = Phaser.Math.Clamp(this.settings.bots, 1, 14) + 1;
    const ids = [YOU, ...Array.from({ length: count - 1 }, (_, i) => `p${i + 2}`)];
    const roles = assignRoles(ids, rng);
    const want = params.get('role');
    if (want && roles[YOU] !== want) {
      const other = ids.find((id) => id !== YOU && roles[id] === want);
      if (other) [roles[YOU], roles[other]] = [want, roles[YOU]];
    }
    const players = ids.map((id, i) => ({ id, name: id === YOU ? 'YOU' : `P${i + 1}`, color: PLAYER_COLORS[i % PLAYER_COLORS.length], role: roles[id] }));
    this.match = new Match({ players, seed, now });
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
      if (p.id !== YOU) {
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
    this.using = new Map(); // id -> { kind: 'test'|'cure', ms } while standing at a station
    this.meeting = null; // see startMeeting()
    this.meetingQueued = null; // caller id, while your duel screen is still open
    this.nextWatchdog = 0;
    this.refillRing = scene.add.graphics().setDepth(12);
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

  /** Name of the room an actor stands in. */
  roomName(actor) {
    const px = actor.x - ORIGIN_X;
    const r = ROOMS.find((q) => q.floor === actor.floor() && px >= q.x0 && px < q.x1);
    return ROOM_INFO.find((i) => i.id === r?.id)?.name ?? 'facility';
  }

  /** Living bots that can see `actor` (same floor, in sight). */
  witnesses(actor) {
    return [...this.brains.values()].filter((b) => b.a !== actor && this.alive(b.a.id) && b.a.floor() === actor.floor() && Math.abs(b.a.x - actor.x) < b.cfg.sight);
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

  /** Stunned players can't move. */
  isFrozen(id) {
    return this.now() < this.match.get(id).stunnedUntil;
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
    this.using.delete(fromId);
    this.using.delete(toId);
    const from = this.actors.get(fromId);
    const to = this.actors.get(toId);
    this.busy.add(fromId).add(toId);
    from.face(to.x);
    to.face(from.x);
    from.anim('idle');
    to.anim('idle');
    if (fromId === YOU) this.emit('toast', `Challenging ${to.name}…`, to.color, 1500);
    if (toId === YOU) {
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
          this.scene.cameras.main.shake(260, 0.01);
        }
        this.busy.add(chaser.id).add(runner.id);
        this.goToTable(chaser.id, runner.id);
      } else {
        for (const p of [chaser, runner]) this.match.get(p.id).cooldownUntil = Math.max(this.match.get(p.id).cooldownUntil, now + ESCAPE_COOLDOWN);
        if (runner.id === YOU) this.emit('toast', 'You got away!', '#3ee6d0');
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
      if (ap.a.id === YOU || ap.b.id === YOU) {
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
      opp: { id: opp.id, name: opp.name, color: opp.color, pickCard: () => brain.pickCard(YOU) },
      onDone: (out) => {
        this.yourDuel = null;
        this.emit('duel-open', false);
        this.afterDuel(YOU, opp.id, out);
        if (this.meetingQueued && !this.over) {
          const caller = this.meetingQueued;
          this.meetingQueued = null;
          this.startMeeting(caller);
        }
      },
    });
  }

  stepBotDuels() {
    const now = this.now();
    for (const d of [...this.botDuels]) {
      if (now < d.until) continue;
      this.botDuels.splice(this.botDuels.indexOf(d), 1);
      const ca = this.brains.get(d.a.id).pickCard(d.b.id);
      const cb = this.brains.get(d.b.id).pickCard(d.a.id);
      if (!ca || !cb || !this.match.canChallenge(d.a.id, d.b.id, now).ok) {
        this.busy.delete(d.a.id);
        this.busy.delete(d.b.id);
        continue;
      }
      this.afterDuel(d.a.id, d.b.id, this.match.settleDuel(d.a.id, d.b.id, ca.id, cb.id, now));
    }
  }

  afterDuel(aId, bId, out) {
    this.busy.delete(aId);
    this.busy.delete(bId);
    for (const e of out.effects) {
      if (e.type === 'bitten') {
        if (e.player === YOU) this.youBitten(e.by);
        this.brains.get(e.player)?.onBitten(e.by);
        const hunter = this.brains.get(e.by);
        if (hunter) hunter.lurkUntil = this.now() + hunter.cfg.lurk;
        if (e.by === YOU) this.emit('toast', `You bit ${this.name(e.player)}. They turn in ${RULES.incubation / 1000}s.`, '#3ee67a', 4000);
      }
      if (e.type === 'killed') this.onKilled(e.player, e.by);
      if (e.type === 'cured') {
        // the Zombie card gave the attacker away
        this.brains.get(e.player)?.suspect(e.by, 10, `My Cure stopped ${this.name(e.by)}'s Zombie card!`);
        if (e.player === YOU) this.emit('toast', `Your Cure saved you. ${this.actors.get(e.by).name} is INFECTED!`, '#3e8bff', 6000);
      }
      if (e.type === 'clue') {
        if (e.to === YOU) this.emit('toast', `CLUE about ${this.actors.get(e.about).name}: ${e.text}`, '#ffd27a', 7000);
        else this.brains.get(e.to)?.noteClue(e.about, e.genuine);
      }
      if (e.type === 'misfire') this.onMisfire(e.player, e.target);
      if (e.type === 'stunned') this.toastFor(e.player, `You are stunned for ${RULES.stunTime / 1000} seconds`, '#ffb04a', 4000);
    }
    if (aId === YOU || bId === YOU) this.emit('hand-changed');
    this.checkWin();
  }

  /** A Gun killed an infected player: they drop to the floor for everyone to see. */
  onKilled(id, by) {
    const a = this.actors.get(id);
    const shooter = this.actors.get(by);
    a.sprite.anims.stop();
    a.sprite.setTint(0x6a707c).setFlipX(false);
    a.sprite.preFX?.clear();
    a.glow = null;
    this.scene.tweens.add({ targets: a.sprite, angle: -90, alpha: 0.85, duration: 450, ease: 'Bounce.out' });
    a.tag?.setText(`☠ ${a.name}`).setColor('#8a909c');
    this.brains.delete(id);
    for (const b of this.brains.values()) b.suspicion.delete(id);
    // everyone hears the shot
    this.emit('toast', `☠ ${shooter.name} shot ${a.name}. ${a.name} was INFECTED.`, '#ff7a3a', 5000);
    if (id === YOU) {
      this.emit('you-died', { by: shooter.name });
      this.scene.cameras.main.shake(400, 0.015);
    }
  }

  /** A misfire is loud: everyone hears it, and the shooter is stunned. */
  onMisfire(shooterId, targetId) {
    const shooter = this.name(shooterId);
    const target = this.name(targetId);
    this.emit('toast', `💥 ${shooter}'s Gun MISFIRED on ${target}. ${shooter} is stunned ${RULES.stunTime / 1000}s.`, '#ff9a5a', 5000);
    for (const b of this.brains.values()) {
      if (b.a.id === targetId) b.suspect(shooterId, 1.5, `${shooter} pulled a Gun on me. Why so sure?`);
      else if (b.a.id !== shooterId) {
        b.suspect(targetId, 0.6, `${shooter} was sure enough about ${target} to shoot`);
        b.suspect(shooterId, 0.3);
      }
    }
  }

  youBitten(byId) {
    this.emit('role-changed', 'bitten');
    this.emit('toast', `YOU WERE BITTEN by ${this.name(byId)}. You turn in ${RULES.incubation / 1000}s!`, '#c6f03a', 7000);
    this.emit('toast', 'Get to the CURE LAB machine (floor 2), or warn the others in a meeting.', '#3ee6d0', 7000);
    this.scene.cameras.main.flash(400, 120, 200, 40);
  }

  youInfected() {
    this.emit('role-changed', 'infected');
    this.emit('toast', 'You have turned. Spread the strain.', '#3ee67a', 6000);
    const allies = this.match.living('infected').filter((p) => p.id !== YOU).map((p) => p.name);
    if (allies.length) this.emit('toast', `Fellow infected: ${allies.join(', ')}`, '#3ee67a', 6000);
    this.scene.cameras.main.flash(500, 40, 200, 110);
  }

  /** Infected players see fellow infected with a green outline; a STARVING zombie glows for everyone. */
  updateGlows() {
    const now = this.now();
    const youInfected = this.match.get(YOU).role === 'infected';
    for (const a of this.actors.values()) {
      const alive = this.alive(a.id);
      const starving = alive && this.match.isStarving(a.id, now);
      const ally = a.id !== YOU && youInfected && alive && this.match.get(a.id).role === 'infected';
      const want = starving ? 'starving' : ally ? 'ally' : null;
      if ((a.glowKind ?? null) === want) continue;
      if (a.glow) a.sprite.preFX?.remove(a.glow);
      a.glow = null;
      a.glowKind = want;
      if (want === 'starving') a.glow = a.sprite.preFX?.addGlow(0xb4ff3a, 6, 0, false, 0.1, 14);
      if (want === 'ally') a.glow = a.sprite.preFX?.addGlow(0x3ee67a, 3, 0, false, 0.1, 10);
    }
  }

  /** Rule events from Match.tick: Zombie cards regrow, the bitten turn or are cured, zombies starve. */
  onTick(events) {
    for (const e of events) {
      const you = e.player === YOU;
      const actor = this.actors.get(e.player);
      if (e.type === 'zombie-grew' && you) {
        this.emit('hand-changed');
        this.emit('toast', 'A new ZOMBIE card grew in your hand', '#3ee67a');
      }
      if (e.type === 'turned') {
        if (you) {
          this.youInfected();
          this.emit('hand-changed');
        }
        this.brains.get(e.player)?.onTurned();
        this.updateGlows();
      }
      if (e.type === 'cured' && you) {
        this.emit('role-changed', 'human');
        this.emit('hand-changed');
        this.emit('toast', 'A Cure card stopped the infection. You are safe!', '#3e8bff', 5000);
      }
      if (e.type === 'cured') this.brains.get(e.player)?.onCured();
      if (e.type === 'starving') {
        if (you) this.emit('toast', 'You are STARVING. Everyone can see you glow. Bite someone!', '#b4ff3a', 6000);
        this.updateGlows();
      }
      if (e.type === 'growl' || e.type === 'starving') {
        this.emit('toast', `A hungry growl echoes from the ${this.roomName(actor)}…`, '#b4ff3a', 3500);
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
      if (actor.id === YOU) {
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
    this.updateStations(dt, youMoving);
    this.updateSigns(now);
    this.updateLabels(now);
    this.checkWin();
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

  /** Exhausted players refill by standing still at a card refill for 5 seconds. */
  updateRefills(dt, youMoving) {
    const g = this.refillRing;
    this.refillHint = null;
    for (const actor of this.actors.values()) {
      const id = actor.id;
      if (!this.alive(id)) continue;
      const box = SUPPLY_BOXES.find((b) => b.floor === actor.floor() && Math.abs(b.x - actor.x) < RULES.refillRange);
      const moving = id === YOU ? youMoving : actor.sprite.anims.currentAnim?.key.endsWith('walk');
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
        }
      }
    }
  }

  // ------------------------------------------------------------ stations
  /** Which station (if any) an actor stands at: the Emergency Button, the Blood Test or the Cure machine. */
  stationAt(actor) {
    if (actor.state.mode !== 'walk') return null;
    const near = (spot, range) => spot.floor === actor.floor() && Math.abs(spot.x - actor.x) < range;
    if (near(EMERGENCY_BUTTON, RULES.meetingRange)) return 'meeting';
    if (near(BLOOD_TEST, RULES.stationRange)) return 'test';
    if (near(CURE_STATION, RULES.stationRange)) return 'cure';
    return null;
  }

  /** The action button for you right now: { kind, label, note, enabled, color } or null. */
  yourAction() {
    const you = this.you;
    if (this.meeting || this.over || !this.alive(YOU) || this.busy.has(YOU) || this.chaseOf(YOU)) return null;
    const kind = this.stationAt(you);
    const now = this.now();
    if (kind === 'meeting') {
      const c = this.match.canCallMeeting(YOU, now);
      const note = this.meetingQueued ? 'CALLED' : c.ok ? 'CALL MEETING' : c.reason === 'used' ? 'USED' : `WAIT ${Math.ceil(c.wait / 1000)}s`;
      return { kind, label: 'MEETING', note, enabled: c.ok && !this.meetingQueued, color: '#ff3b4a' };
    }
    if (kind === 'test') return { kind, label: 'BLOOD TEST', note: this.using.has(YOU) ? 'TESTING…' : 'TEST ME', enabled: !this.using.has(YOU), color: '#ff6a78' };
    if (kind === 'cure') {
      const wait = this.match.cureStationReadyAt - now;
      const note = this.using.has(YOU) ? 'CURING…' : wait > 0 ? `RECHARGE ${Math.ceil(wait / 1000)}s` : 'USE CURE';
      return { kind, label: 'CURE', note, enabled: !this.using.has(YOU) && wait <= 0, color: '#3ee6d0' };
    }
    return null;
  }

  /** You pressed the action button (Space). */
  doAction() {
    const a = this.yourAction();
    if (!a?.enabled) return;
    if (a.kind === 'meeting') this.callMeeting(YOU);
    else this.useStation(YOU, a.kind);
  }

  /** Start using the Blood Test / Cure machine: stand still to finish. */
  useStation(id, kind) {
    const actor = this.actors.get(id);
    if (this.meeting || !this.alive(id) || this.busy.has(id) || this.stationAt(actor) !== kind || this.using.has(id)) return false;
    this.using.set(id, { kind, ms: 0 });
    return true;
  }

  updateStations(dt, youMoving) {
    const g = this.refillRing;
    this.stationHint = null;
    for (const [id, use] of [...this.using]) {
      const actor = this.actors.get(id);
      const moving = id === YOU ? youMoving : actor.sprite.anims.currentAnim?.key.endsWith('walk');
      if (!this.alive(id) || this.busy.has(id) || this.chaseOf(id) || moving || this.stationAt(actor) !== use.kind) {
        this.using.delete(id);
        this.brains.get(id)?.stationDone(use.kind, null);
        if (id === YOU && moving) this.emit('toast', 'Stand still to use the machine', '#c9ced8', 1500);
        continue;
      }
      use.ms += dt * 1000;
      const total = use.kind === 'test' ? RULES.bloodTestTime : RULES.cureStationTime;
      const t = Math.min(1, use.ms / total);
      const color = use.kind === 'test' ? 0xff6a78 : 0x3ee6d0;
      g.lineStyle(4, 0xffffff, 0.15).strokeCircle(actor.x, actor.y - 120, 12);
      g.lineStyle(4, color, 1).beginPath().arc(actor.x, actor.y - 120, 12, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2).strokePath();
      if (id === YOU) this.stationHint = use.kind === 'test' ? 'BLOOD TEST…  STAND STILL' : 'CURE MACHINE…  STAND STILL';
      if (t < 1) continue;
      this.using.delete(id);
      if (use.kind === 'test') this.finishTest(id);
      else this.finishCure(id);
    }
  }

  /** Blood Test result: a positive is announced to everyone; clean gives a visible badge. */
  finishTest(id) {
    const now = this.now();
    const actor = this.actors.get(id);
    const res = this.match.bloodTest(id, now);
    this.brains.get(id)?.stationDone('test', res);
    if (res.positive) {
      this.emit('toast', `🩸 BLOOD TEST POSITIVE: ${actor.name} carries the strain!`, '#ff4a5a', 7000);
      this.scene.cameras.main.shake(200, 0.005);
      for (const b of this.brains.values()) b.suspect(id, 8, `${actor.name} tested POSITIVE at the Blood Test!`);
    } else if (id === YOU) {
      this.emit('toast', `CLEAN. Everyone can see your badge for ${RULES.cleanBadge / 1000}s.`, '#3ee6d0', 4500);
    }
  }

  /** Cure machine: saves a bitten player. Anyone nearby sees who used it. */
  finishCure(id) {
    const actor = this.actors.get(id);
    const res = this.match.useCureStation(id, this.now());
    this.brains.get(id)?.stationDone('cure', res);
    for (const b of this.witnesses(actor)) b.suspect(id, 1.5, `I saw ${actor.name} use the Cure machine. Why would they need it?`);
    if (id !== YOU) return;
    if (res.cured) {
      this.emit('role-changed', 'human');
      this.emit('toast', 'The cure worked. You are fully human again.', '#3ee6d0', 5000);
    } else if (res.reason === 'recharging') this.emit('toast', 'The machine is recharging', '#c9ced8');
    else if (res.reason === 'too-late') this.emit('toast', 'Too late: the strain has already taken you.', '#3ee67a');
    else this.emit('toast', 'Nothing happens. You were not bitten.', '#c9ced8');
  }

  // ------------------------------------------------------------ meetings
  /** Press the Emergency Button (Central Hall). Everyone is pulled into a meeting. */
  callMeeting(id) {
    const actor = this.actors.get(id);
    if (this.over || this.meeting || this.meetingQueued || this.busy.has(id) || this.chaseOf(id)) return false;
    if (this.stationAt(actor) !== 'meeting' || !this.match.canCallMeeting(id, this.now()).ok) return false;
    if (this.yourDuel) this.meetingQueued = id; // starts when your duel screen closes
    else this.startMeeting(id);
    return true;
  }

  startMeeting(callerId) {
    const now = this.now();
    if (this.over || !this.alive(callerId) || !this.match.canCallMeeting(callerId, now).ok) return;
    this.match.callMeeting(callerId, now);
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
    this.using.clear();
    this.refill.clear();
    this.refillRing.clear();
    // everyone still in the match gathers in the Central Hall
    const hall = ROOMS.find((r) => r.id === 'hall');
    const present = Phaser.Utils.Array.Shuffle([...this.actors.values()].filter((a) => this.alive(a.id)));
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
      startedAt: now,
      phase: 'talk',
      phaseEnds: now + RULES.meetingTalk,
      log: [{ from: null, text: `${this.name(callerId)} pressed the Emergency Button.` }],
      votes: new Map(),
      result: null,
      yourLastSay: 0,
      yourSays: 0,
    };
    for (const b of this.brains.values()) b.meetingStart(now, b.a.id === callerId);
    this.emit('meeting', true);
  }

  /** Living players (the voters, and the people you can vote for). */
  present() {
    return this.match.list().filter((p) => p.alive);
  }

  updateMeeting(now) {
    const m = this.meeting;
    if (m.phase === 'talk') {
      for (const b of this.brains.values()) {
        if (!this.alive(b.a.id) || now < b.nextSpeakAt) continue;
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
        if (!this.alive(b.a.id) || m.votes.has(b.a.id) || now < b.voteAt) continue;
        this.castVote(b.a.id, b.castVote(m));
      }
      const everyone = this.present().every((p) => m.votes.has(p.id));
      if (everyone || now >= m.phaseEnds) {
        for (const p of this.present()) if (!m.votes.has(p.id)) m.votes.set(p.id, 'skip');
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
    for (const b of this.brains.values()) if (b.a.id !== msg.from && this.alive(b.a.id)) b.hear(msg, m);
  }

  /** Quick chat: kind = accuse | vouch | clean | bitten | skip; target = a player id for accuse / vouch / bitten. */
  youSay(kind, target = null) {
    const m = this.meeting;
    const now = this.now();
    if (!m || m.phase !== 'talk' || !this.alive(YOU) || now - m.yourLastSay < 1500 || m.yourSays >= 8) return false;
    if ((kind === 'accuse' || kind === 'vouch') && !target) return false;
    const t = target ? this.name(target) : '';
    const badge = this.match.get(YOU).cleanUntil - this.clock();
    const text = {
      accuse: `I think ${t} is infected.`,
      vouch: `${t} is fine. I trust them.`,
      clean: badge > 0 ? `I tested CLEAN. Look at my badge (${Math.ceil(badge / 1000)}s left).` : "I'm clean, trust me.",
      bitten: target ? `I was bitten by ${t}! I'll turn soon.` : "I was bitten! I'll turn soon.",
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
    if (!m || m.phase !== 'vote' || m.votes.has(id) || !this.alive(id)) return false;
    if (target !== 'skip' && !this.match.players.get(target)?.alive) return false;
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
    for (const b of this.brains.values()) b.meetingEnd(now, dur, m);
    this.meeting = null;
    this.emit('meeting', false);
    if (m.result?.out) this.quarantine(m.result.out);
    this.updateGlows();
    this.checkWin();
  }

  /** Voted out: locked in the Quarantine Cell for the rest of the match. Their role stays secret. */
  quarantine(id) {
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
    if (id === YOU) this.emit('you-quarantined');
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
   * Infection signs, visible to everyone: a slow green tint, an occasional
   * twitch and faintly glowing footprints.
   */
  updateSigns(now) {
    for (const actor of this.actors.values()) {
      if (!this.alive(actor.id)) continue;
      let sign = this.signs.get(actor.id);
      if (!sign) this.signs.set(actor.id, (sign = { nextTwitch: now + 4000 + Math.random() * 5000, stepX: actor.x }));
      const t = this.signStrength(actor.id);
      if (t === 0) continue;
      const c = Phaser.Display.Color.Interpolate.ColorWithColor({ r: 255, g: 255, b: 255 }, { r: 175, g: 255, b: 195 }, 1, t);
      actor.sprite.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      if (t > 0.25 && now > sign.nextTwitch && !this.busy.has(actor.id)) {
        sign.nextTwitch = now + 4000 + Math.random() * 6000;
        this.scene.tweens.add({ targets: actor.sprite, angle: Phaser.Math.Between(-6, 6), duration: 60, yoyo: true, repeat: 1 });
      }
      if (t > 0.4 && actor.state.mode === 'walk' && Math.abs(actor.x - sign.stepX) > 26) {
        sign.stepX = actor.x;
        this.footprint(actor.x, actor.y);
      }
    }
  }

  footprint(x, y) {
    const f = this.scene.add.ellipse(x, y - 1, 9, 3, 0x3ee67a, 0.55).setDepth(8.5).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: f, alpha: 0, duration: 5000, onComplete: () => f.destroy() });
  }

  updateLabels(now) {
    const inDuel = new Set(this.botDuels.flatMap((d) => [d.a.id, d.b.id]));
    for (const actor of this.actors.values()) {
      if (actor.id === YOU) continue;
      const p = this.match.get(actor.id);
      if (!p.alive) {
        if (p.quarantined) actor.updateLabels('QUARANTINED', '');
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
      else if (now < p.stunnedUntil) text = `STUNNED ${Math.ceil((p.stunnedUntil - now) / 1000)}`;
      else if (this.using.has(actor.id)) text = this.using.get(actor.id).kind === 'test' ? 'TESTING…' : 'CURE MACHINE…';
      else if (this.match.isExhausted(actor.id)) text = 'NO CARDS';
      const badge = this.match.hasBadge(actor.id, now) ? `✚ CLEAN ${Math.ceil((p.cleanUntil - now) / 1000)}` : '';
      actor.updateLabels(text, badge);
    }
  }

  checkWin() {
    if (this.over) return;
    const w = this.match.winner();
    if (w) return this.end(w, w === 'infected' ? 'all-infected' : 'all-killed');
    if (this.now() >= this.endsAt) this.end(this.match.timeUpWinner(), 'time');
  }

  end(winner, reason) {
    this.over = true;
    this.emit('challenge-cancel');
    this.emit('chase', null);
    if (this.meeting) this.emit('meeting', false);
    const you = this.match.get(YOU);
    const youWon = (winner === 'humans') === (you.role === 'human');
    const players = this.match.list().map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      role: p.role,
      alive: p.alive,
      quarantined: p.quarantined,
      bitten: p.turnsAt !== null,
      startedInfected: p.startedInfected,
      stats: { ...p.stats },
    }));
    this.emit('match-over', { winner, reason, youWon, youRole: you.role, players, settings: this.settings, duration: this.now() - this.startedAt });
  }
}
