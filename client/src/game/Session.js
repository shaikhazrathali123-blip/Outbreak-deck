import Phaser from 'phaser';
import { PLAYER_COLORS, RULES, PLAYER_SPEED } from '../../../shared/constants.js';
import { Match, assignRoles } from '../../../shared/match.js';
import { createRng, cardName } from '../../../shared/cards.js';
import { FLOORS, ORIGIN_X, ROOMS, DUEL_TABLES, SUPPLY_BOXES } from '../side/facility.js';
import Actor from '../side/Actor.js';
import BotBrain, { DIFFICULTY } from './BotBrain.js';

const YOU = 'you';
const BOT_DUEL_TIME = 2600;

/**
 * One match: players (you + bots), roles, the shared Match rules, challenges,
 * duels, special cards, infection signs, refills, the timer and the win check.
 * Talks to the HUD through scene events: toast, hand-changed, role-changed,
 * duel-open, challenge-request, challenge-cancel, match-over.
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
        this.brains.set(p.id, new BotBrain(this, actor, this.settings.difficulty));
        this.brains.get(p.id).nextThink = now + 1500 + Math.random() * 3000;
      }
    }

    this.busy = new Set();
    this.awaiting = new Set(); // challenged bots still deciding
    this.yourDuel = null; // { ids, table } while the duel screen is open
    this.nextWatchdog = 0;
    this.approaches = [];
    this.botDuels = [];
    this.pending = null;
    this.refill = new Map();
    this.decoys = [];
    this.signs = new Map();
    this.footprints = [];
    this.refillRing = scene.add.graphics().setDepth(12);
    this.startedAt = now;
    this.endsAt = now + this.settings.minutes * 60000;
    this.over = false;
    this.updateAllyGlow();
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

  timeLeft() {
    return Math.max(0, this.endsAt - this.now());
  }

  isBusy(id) {
    return this.busy.has(id);
  }

  isFrozen(id) {
    const p = this.match.get(id);
    const now = this.now();
    return now < p.stunnedUntil || now < p.frozenUntil;
  }

  /** Can `a` challenge `b` right now (rules + neither is already busy)? */
  canDuel(a, b) {
    return !this.busy.has(a) && !this.busy.has(b) && this.match.canChallenge(a, b, this.now()).ok;
  }

  /** Other actors on the same floor within `range` px. */
  visibleActors(actor, range) {
    const out = [];
    for (const o of this.actors.values()) {
      if (o === actor || !o.sprite.visible) continue;
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
    if (this.busy.has(YOU) || you.state.mode !== 'walk') return null;
    let best = null;
    for (const o of this.actors.values()) {
      if (o === you || !o.sprite.visible || o.state.mode !== 'walk' || o.floor() !== you.floor()) continue;
      const dx = Math.abs(o.x - you.x);
      if (dx < RULES.challengeRange && (!best || dx < best.dx)) best = { o, dx };
    }
    return best?.o ?? null;
  }

  challengeState(target) {
    if (this.busy.has(target.id)) return { ok: false, reason: 'busy' };
    return this.match.canChallenge(YOU, target.id, this.now());
  }

  /** Nearest player your targeted cards can reach. */
  cardTarget() {
    return this.visibleActors(this.you, RULES.cardRange).sort((p, q) => Math.abs(p.x - this.you.x) - Math.abs(q.x - this.you.x))[0] ?? null;
  }

  // ------------------------------------------------------------ challenges
  challenge(fromId, toId) {
    if (this.over || !this.canDuel(fromId, toId)) return false;
    const from = this.actors.get(fromId);
    const to = this.actors.get(toId);
    this.busy.add(fromId);
    this.busy.add(toId);
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

  /** Your answer to a challenge (from the HUD buttons / keys). */
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
    if (this.over) return;
    const from = this.actors.get(fromId);
    const to = this.actors.get(toId);
    if (!accept) {
      const lost = this.match.decline(toId);
      this.busy.delete(fromId);
      this.busy.delete(toId);
      if (toId === YOU) {
        this.emit('toast', `You declined and lost ${lost ? cardName(lost) : 'nothing'}`, '#c9ced8');
        this.emit('hand-changed');
      }
      this.toastFor(fromId, `${to.name} declined and lost a card`, '#c9ced8');
      return;
    }
    if (fromId === YOU || toId === YOU) {
      const other = fromId === YOU ? to : from;
      this.emit('toast', `Duel with ${other.name}. To the table!`, other.color, 2000);
    }
    this.goToTable(fromId, toId);
  }

  /** Both walk to the nearest duel table on their floor, one each side. */
  goToTable(aId, bId) {
    const a = this.actors.get(aId);
    const b = this.actors.get(bId);
    const floor = a.floor();
    const mid = (a.x + b.x) / 2;
    const taken = new Set([...this.approaches, ...this.botDuels, ...(this.yourDuel ? [this.yourDuel] : [])].map((d) => d.table));
    const tables = DUEL_TABLES.filter((t) => t.floor === floor).sort((p, q) => Math.abs(p.x - mid) - Math.abs(q.x - mid));
    const table = tables.find((t) => !taken.has(t)) ?? tables[0];
    const aLeft = a.x <= b.x;
    this.approaches.push({ a, b, table, ax: table.x + (aLeft ? -64 : 64), bx: table.x + (aLeft ? 64 : -64), aLeft });
  }

  stepApproaches(dt) {
    for (const ap of [...this.approaches]) {
      const doneA = ap.a.walkTo(ap.ax, dt);
      const doneB = ap.b.walkTo(ap.bx, dt);
      if (!doneA || !doneB) continue;
      this.approaches.splice(this.approaches.indexOf(ap), 1);
      ap.a.face(ap.b.x);
      ap.b.face(ap.a.x);
      if (ap.a.id === YOU || ap.b.id === YOU) this.scene.time.delayedCall(250, () => this.startYourDuel(ap));
      else this.botDuels.push({ ...ap, until: this.now() + BOT_DUEL_TIME });
    }
  }

  startYourDuel(ap) {
    const opp = ap.a.id === YOU ? ap.b : ap.a;
    const brain = this.brains.get(opp.id);
    this.yourDuel = { ids: [YOU, opp.id], table: ap.table };
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
      if (e.type === 'infected') {
        if (e.player === YOU) this.youInfected();
        const hunter = this.brains.get(e.by);
        if (hunter) hunter.lurkUntil = this.now() + hunter.cfg.lurk;
        this.updateAllyGlow();
      }
      if (e.type === 'clue') {
        if (e.to === YOU) this.emit('toast', `CLUE about ${this.actors.get(e.about).name}: ${e.text}`, '#ffd27a', 7000);
        else this.brains.get(e.to)?.noteClue(e.about, e.genuine);
      }
      if (e.type === 'stunned') this.toastFor(e.player, 'You are stunned for 15 seconds', '#ffb04a', 4000);
      if (e.type === 'vaccine') this.toastFor(e.player, 'Your Vaccine blocked the infection', '#3e8bff', 4000);
    }
    if (aId === YOU || bId === YOU) this.emit('hand-changed');
    this.checkWin();
  }

  youInfected() {
    this.emit('role-changed', 'infected');
    this.emit('toast', 'You have been infected. Spread the strain.', '#3ee67a', 6000);
    const allies = this.match.list().filter((p) => p.role === 'infected' && p.id !== YOU).map((p) => p.name);
    if (allies.length) this.emit('toast', `Fellow infected: ${allies.join(', ')}`, '#3ee67a', 6000);
    this.scene.cameras.main.flash(500, 40, 200, 110);
  }

  /** Infected players see fellow infected with a green outline. */
  updateAllyGlow() {
    const youInfected = this.match.get(YOU).role === 'infected';
    for (const a of this.actors.values()) {
      if (a.id === YOU) continue;
      const show = youInfected && this.match.get(a.id).role === 'infected';
      if (show && !a.glow) a.glow = a.sprite.preFX?.addGlow(0x3ee67a, 3, 0, false, 0.1, 10);
      if (!show && a.glow) {
        a.sprite.preFX?.remove(a.glow);
        a.glow = null;
      }
    }
  }

  // ------------------------------------------------------------ special cards
  /** You use a card from your hand. */
  useYourCard(cardId) {
    const check = this.match.canUse(YOU, cardId);
    if (!check.ok || this.over) return;
    let target = null;
    if (check.needsTarget) {
      target = this.cardTarget();
      if (!target) return this.emit('toast', 'Nobody close enough for that card', '#c9ced8');
    }
    this.useCard(YOU, cardId, target?.id ?? null);
  }

  useCard(id, cardId, targetId) {
    let e;
    try {
      e = this.match.useCard(id, cardId, targetId, this.now());
    } catch {
      return;
    }
    const user = this.actors.get(id);
    const target = targetId ? this.actors.get(targetId) : null;
    switch (e.type) {
      case 'scan':
        if (id === YOU) this.emit('toast', `SCANNER: ${target.name} reads ${e.infected ? 'INFECTED' : 'CLEAN'} (90% accurate)`, e.infected ? '#3ee67a' : '#2fd2e0', 6000);
        else this.brains.get(id)?.suspect(targetId, e.infected ? 3 : -1.5);
        if (targetId === YOU) this.emit('toast', `${user.name} scanned you`, '#c9ced8');
        break;
      case 'swap':
        if (id === YOU || targetId === YOU) {
          const other = id === YOU ? target : user;
          const got = id === YOU ? e.got : e.gave;
          this.emit('toast', `Swapped a card with ${other.name}${got ? `: you got ${cardName(got)}` : ''}`, '#f2b84a');
          this.emit('hand-changed');
        }
        break;
      case 'freeze':
        this.flash(target, 0x7fd0ff);
        if (targetId === YOU) this.emit('toast', `${user.name} froze you for 5 seconds`, '#7fd0ff', 4000);
        if (id === YOU) this.emit('toast', `${target.name} is frozen for 5 seconds`, '#7fd0ff');
        break;
      case 'decoy':
        this.spawnDecoy(user, e.until);
        if (id === YOU) this.emit('toast', 'Decoy deployed for 10 seconds', '#f2b84a');
        break;
      case 'spore':
        if (id === YOU) this.emit('toast', 'Spore armed: your next win ignores Vaccines', '#3ee67a');
        break;
      case 'mask':
        if (id === YOU) this.emit('toast', 'Masked: your infection signs are hidden for 60s', '#3ee67a');
        break;
      case 'rumor': {
        if (!e.about) break;
        const about = this.actors.get(e.about);
        this.emit('toast', `RUMOR about ${about.name}: ${e.text}`, '#ffd27a', 6000);
        for (const b of this.brains.values()) if (b.a.id !== id) b.suspect(e.about, 1.2);
        break;
      }
      default:
        break;
    }
    if (id === YOU) this.emit('hand-changed');
  }

  flash(actor, color) {
    actor.sprite.setTintFill(color);
    this.scene.time.delayedCall(140, () => actor.sprite.clearTint());
  }

  spawnDecoy(user, until) {
    const s = this.scene.add.sprite(user.x + (user.sprite.flipX ? 40 : -40), user.y, user.key, 'idle0').setOrigin(0.5, 1).setDepth(9).setAlpha(0.92);
    s.play(`${user.key}-idle`);
    const tag = user.tag ? this.scene.add.text(s.x, s.y - 94, user.name, user.tag.style).setOrigin(0.5).setDepth(9) : null;
    this.decoys.push({ s, tag, until });
  }

  /** How visible someone's infection signs are right now (0 = none, 1 = obvious). */
  signStrength(id) {
    const p = this.match.get(id);
    const now = this.now();
    if (p.role !== 'infected' || now < p.maskedUntil) return 0;
    return Phaser.Math.Clamp((now - p.infectedAt) / RULES.signsTime, 0, 1);
  }

  // ------------------------------------------------------------ per frame
  update(dt, youInput) {
    const now = this.now();
    if (this.over) return;
    this.stepApproaches(dt);
    this.stepBotDuels();

    const inApproach = new Set(this.approaches.flatMap((a) => [a.a.id, a.b.id]));
    let youMoving = false;
    for (const actor of this.actors.values()) {
      if (inApproach.has(actor.id)) continue;
      const frozen = this.isFrozen(actor.id) || this.busy.has(actor.id);
      if (actor.id === YOU) {
        youMoving = actor.control(frozen ? { x: 0, y: 0 } : youInput, dt);
      } else {
        const brain = this.brains.get(actor.id);
        const input = frozen ? { x: 0, y: 0 } : brain.input(now);
        actor.control(input, dt, PLAYER_SPEED * brain.cfg.speed);
      }
    }
    if (this.pending && now > this.pending.expires) this.answer(false);
    if (now > this.nextWatchdog) {
      this.nextWatchdog = now + 500;
      this.releaseOrphans();
    }

    this.updateRefills(dt, youMoving);
    this.updateSigns(now, dt);
    this.updateDecoys(now);
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
    const g = this.refillRing.clear();
    this.refillHint = null;
    for (const actor of this.actors.values()) {
      const id = actor.id;
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
      if (id === YOU || actor.sprite.visible) {
        g.lineStyle(4, 0xffffff, 0.15).strokeCircle(actor.x, actor.y - 120, 12);
        g.lineStyle(4, 0xf2b84a, 1).beginPath().arc(actor.x, actor.y - 120, 12, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2).strokePath();
      }
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

  /**
   * Infection signs, visible to everyone: a slow green tint, an occasional
   * twitch and faintly glowing footprints. A Mask hides them for 60s.
   */
  updateSigns(now, dt) {
    for (const actor of this.actors.values()) {
      const p = this.match.get(actor.id);
      let sign = this.signs.get(actor.id);
      if (!sign) this.signs.set(actor.id, (sign = { nextTwitch: now + 4000 + Math.random() * 5000, stepX: actor.x }));
      const masked = now < p.maskedUntil;
      if (p.role !== 'infected' || masked) {
        if (sign.tinted) {
          actor.sprite.clearTint();
          sign.tinted = false;
        }
        continue;
      }
      const t = Phaser.Math.Clamp((now - p.infectedAt) / RULES.signsTime, 0, 1);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor({ r: 255, g: 255, b: 255 }, { r: 175, g: 255, b: 195 }, 1, t);
      actor.sprite.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      sign.tinted = true;
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

  updateDecoys(now) {
    for (const d of [...this.decoys]) {
      if (now < d.until) continue;
      this.scene.tweens.add({ targets: [d.s, d.tag].filter(Boolean), alpha: 0, duration: 400, onComplete: () => [d.s, d.tag].forEach((o) => o?.destroy()) });
      this.decoys.splice(this.decoys.indexOf(d), 1);
    }
  }

  updateLabels(now) {
    const inDuel = new Set(this.botDuels.flatMap((d) => [d.a.id, d.b.id]));
    for (const actor of this.actors.values()) {
      if (actor.id === YOU) continue;
      const p = this.match.get(actor.id);
      let text = '';
      if (inDuel.has(actor.id)) text = '⚔ DUEL';
      else if (now < p.stunnedUntil) text = `STUNNED ${Math.ceil((p.stunnedUntil - now) / 1000)}`;
      else if (now < p.frozenUntil) text = 'FROZEN';
      else if (this.match.isExhausted(actor.id)) text = 'NO CARDS';
      actor.updateLabels(text);
    }
  }

  checkWin() {
    if (this.over) return;
    if (this.match.winner() === 'infected') return this.end('infected');
    if (this.now() >= this.endsAt) this.end('humans');
  }

  end(winner) {
    this.over = true;
    this.emit('challenge-cancel');
    const you = this.match.get(YOU);
    const youWon = (winner === 'humans') === (you.role === 'human');
    const players = this.match.list().map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      role: p.role,
      startedInfected: p.startedInfected,
      stats: { ...p.stats },
    }));
    this.emit('match-over', { winner, youWon, youRole: you.role, players, settings: this.settings, duration: this.now() - this.startedAt });
  }
}

export { DIFFICULTY };
