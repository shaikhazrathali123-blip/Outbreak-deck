import Phaser from 'phaser';
import { PLAYER_COLORS, RULES, PLAYER_SPEED, ROOMS as ROOM_INFO } from '../../../shared/constants.js';
import { Match, assignRoles, tallyVotes } from '../../../shared/match.js';
import { createRng } from '../../../shared/cards.js';
import { ORIGIN_X, FLOORS, ROOMS, DUEL_TABLES, SUPPLY_BOXES, EMERGENCY_BUTTON } from '../side/facility.js';
import Actor from '../side/Actor.js';
import BotBrain from './BotBrain.js';

const YOU = 'you';
const BOT_DUEL_TIME = 2600;
const ESCAPE_COOLDOWN = 4000; // after a chase, neither can be challenged again straight away

const rand = (a, b) => a + Math.random() * (b - a);

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
    }
    if (aId === YOU || bId === YOU) this.emit('hand-changed');
    this.checkWin();
  }

  /** Someone was shot: they drop to the floor. Everyone hears who fired, nobody learns the target's role. */
  onKilled(id, by) {
    const a = this.actors.get(id);
    const shooter = this.actors.get(by);
    a.sprite.anims.stop();
    a.sprite.setTint(0x6a707c).setFlipX(false);
    if (a.glow) a.sprite.preFX?.remove(a.glow);
    a.glow = null;
    a.glowKind = null;
    this.scene.tweens.add({ targets: a.sprite, angle: -90, alpha: 0.85, duration: 450, ease: 'Bounce.out' });
    a.tag?.setText(`☠ ${a.name}`).setColor('#8a909c');
    this.brains.delete(id);
    for (const b of this.brains.values()) b.onShot(by, id);
    this.emit('toast', `☠ ${this.name(by)} shot ${this.name(id)}.`, '#ff7a3a', 5000);
    this.toastFor(by, `You are stunned for ${RULES.shotStun / 1000} seconds after the shot`, '#ffb04a', 3500);
    if (id === YOU) {
      this.emit('you-died', { by: shooter.name });
      this.scene.cameras.main.shake(400, 0.015);
    }
  }

  /** A Zombie card bit a human: they are a zombie now. Nobody else is told. */
  onBitten(id, by) {
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
    this.brains.get(id)?.onCured();
    if (id === YOU) {
      this.emit('role-changed', 'human');
      this.emit('hand-changed');
      this.emit('toast', 'You were CURED. You are human again, and you forget the other zombies.', '#3e8bff', 6000);
      this.emit('toast', `You are gagged for ${RULES.gagTime / 1000}s: no quick-chat, no voting.`, '#c9ced8', 6000);
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
    if (id === YOU) {
      this.emit('toast', `Your Cure worked. You are in quarantine for ${RULES.cureQuarantine / 1000}s (gagged, can't move).`, '#3e8bff', 6000);
      this.scene.cameras.main.flash(300, 60, 120, 255);
    }
  }

  youInfected(byId) {
    this.emit('role-changed', 'infected');
    this.emit('toast', `${this.name(byId)} BIT you. You are a ZOMBIE now. Your first Zombie card grows in ${RULES.zombieRegen / 1000}s.`, '#3ee67a', 6000);
    const allies = this.match.living('infected').filter((p) => p.id !== YOU).map((p) => this.name(p.id));
    if (allies.length) this.emit('toast', `Fellow infected: ${allies.join(', ')}`, '#3ee67a', 6000);
    this.scene.cameras.main.flash(500, 40, 200, 110);
  }

  /** Infected players see fellow infected with a green outline; a STARVING zombie glows for everyone. */
  updateGlows() {
    const now = this.now();
    const youInfected = this.match.get(YOU).role === 'infected';
    for (const a of this.actors.values()) {
      const alive = this.alive(a.id);
      // a starving zombie only flares up for a moment, each time it growls
      const starving = alive && this.match.isStarving(a.id, now) && now < (a.growlFlashUntil ?? 0);
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
      if (e.type === 'released') {
        this.brains.get(e.player)?.released();
        if (you) this.emit('toast', 'You are out of quarantine. Back to it.', '#3ee6d0', 3500);
      }
      if (e.type === 'starving') {
        if (you) this.emit('toast', `You are STARVING. Every ${RULES.growlEvery / 1000}s you growl and flare green for a moment. Bite someone!`, '#b4ff3a', 6000);
        this.updateGlows();
      }
      if (e.type === 'growl' || e.type === 'starving') {
        this.emit('toast', `A hungry growl echoes from the ${this.roomName(actor)}…`, '#b4ff3a', 3500);
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

  // ------------------------------------------------------------ the Emergency Button
  /** 'meeting' when an actor stands at the Emergency Button, else null. */
  stationAt(actor) {
    if (actor.state.mode !== 'walk') return null;
    const b = EMERGENCY_BUTTON;
    return b.floor === actor.floor() && Math.abs(b.x - actor.x) < RULES.meetingRange ? 'meeting' : null;
  }

  /** The action button for you right now: { kind, label, note, enabled, color } or null. */
  yourAction() {
    if (this.meeting || this.over || !this.alive(YOU) || this.busy.has(YOU) || this.chaseOf(YOU)) return null;
    if (this.stationAt(this.you) !== 'meeting') return null;
    const c = this.match.canCallMeeting(YOU, this.now());
    const note = this.meetingQueued ? 'CALLED' : c.ok ? 'CALL MEETING' : c.reason === 'used' ? 'USED' : c.reason === 'in-cell' ? 'QUARANTINED' : `WAIT ${Math.ceil(c.wait / 1000)}s`;
    return { kind: 'meeting', label: 'MEETING', note, enabled: c.ok && !this.meetingQueued, color: '#ff3b4a' };
  }

  /** You pressed the action button (Space). */
  doAction() {
    if (this.yourAction()?.enabled) this.callMeeting(YOU);
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
      else if (this.match.isExhausted(actor.id)) text = 'NO CARDS';
      actor.updateLabels(text);
    }
  }

  checkWin() {
    if (this.over) return;
    const w = this.match.winner();
    if (w) return this.end(w, w === 'infected' ? 'all-infected' : 'all-zombies-gone');
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
      shot: p.shot,
      startedInfected: p.startedInfected,
      stats: { ...p.stats },
      score: this.match.score(p.id),
    }));
    this.emit('match-over', { winner, reason, youWon, youRole: you.role, players, settings: this.settings, duration: this.now() - this.startedAt });
  }
}
