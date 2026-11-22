import Phaser from 'phaser';
import { ROOMS as ROOM_INFO, PLAYER_SPEED, PLAYER_COLORS, MAX_PLAYERS, RULES } from '../../../shared/constants.js';
import { Match } from '../../../shared/match.js';
import { WIDTH, ROOM_HEIGHT, ORIGIN_X, WORLD, FLOORS, GROUND, ROOMS, LADDERS, SPAWN, DUEL_TABLES, SUPPLY_BOXES } from '../side/facility.js';
import { drawFacility, drawSky, drawSkyline } from '../side/inkArt.js';
import { createSurvivor } from '../side/SideCharacter.js';
import { FONT } from '../ui/HUD.js';

const CLIMB_SPEED = 140;
const LADDER_REACH = 26; // how close to a ladder you must be to grab it
const FLOOR_NAMES = ['Basement', 'Ground floor', 'Floor 2', 'Floor 3'];
const hex = (h) => Phaser.Display.Color.HexStringToColor(h).color;

/**
 * Side-view cutaway of the Helix facility. Walk left/right on each floor,
 * climb ladders between floors. Only the room you're in is lit; neighbours are
 * dim and everything else is dark.
 */
export default class SideScene extends Phaser.Scene {
  constructor() {
    super('SideScene');
  }

  create() {
    this.art = drawFacility(this);
    drawSky(this);
    drawSkyline(this);
    createSurvivor(this);

    this.createBackdrop();
    this.add.image(0, 0, 'facility').setOrigin(0).setDepth(0);

    this.rooms = ROOMS.map((r) => {
      const info = ROOM_INFO.find((i) => i.id === r.id);
      const fy = FLOORS[r.floor].y;
      return {
        ...r,
        name: info.name,
        color: info.color,
        floorName: FLOOR_NAMES[r.floor],
        rect: new Phaser.Geom.Rectangle(ORIGIN_X + r.x0, fy - ROOM_HEIGHT, r.x1 - r.x0, ROOM_HEIGHT),
      };
    });
    this.roomsById = Object.fromEntries(this.rooms.map((r) => [r.id, r]));

    this.createLights();
    this.createSigns();
    this.createWeather();

    // --- player
    this.player = this.add.sprite(ORIGIN_X + SPAWN.x, FLOORS[SPAWN.floor].y, 'survivor', 'idle0').setOrigin(0.5, 1).setDepth(10);
    this.player.play('survivor-idle');
    this.state = { mode: 'walk', floor: SPAWN.floor, ladder: null };

    // ?crowd=15 previews a full lobby standing in the Central Hall (emergency meeting)
    const crowd = Number(new URLSearchParams(window.location.search).get('crowd'));
    if (crowd > 1) this.spawnCrowd(Math.min(crowd, MAX_PLAYERS));

    // --- match: cards, roles and the dummy players to duel
    this.setupMatch();

    // --- room darkness (above the player so dark rooms hide whoever is inside)
    this.shades = this.rooms.map((r) =>
      this.add.rectangle(r.rect.x, r.rect.y, r.rect.width, r.rect.height, 0x020308, 0.84).setOrigin(0).setDepth(20),
    );
    this.currentRoom = undefined;

    // --- camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD.width, WORLD.height);
    cam.startFollow(this.player, true, 0.08, 0.1);
    cam.setFollowOffset(0, 120); // keep the room (not the floor below) in view
    cam.setBackgroundColor('#03040a');
    cam.fadeIn(800, 0, 0, 0);
    this.setupPostFX(cam);
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);

    // --- input
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');

    this.scene.launch('SideUIScene', { gameScene: this });
    this.ui = this.scene.get('SideUIScene');
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyZoom, this);
      this.scene.stop('SideUIScene');
    });
  }

  /** Soft bloom on desktop (skipped on phones for speed; ?fx=high / ?fx=low to force) + vignette. */
  setupPostFX(cam) {
    if (this.game.renderer.type !== Phaser.WEBGL || !cam.postFX) return;
    const fx = new URLSearchParams(window.location.search).get('fx');
    const mobile = this.sys.game.device.input.touch && !this.sys.game.device.os.desktop;
    if (fx === 'high' || (fx !== 'low' && !mobile)) cam.postFX.addBloom(0xffffff, 1, 1, 0.8, 0.32, 4);
    cam.postFX.addVignette(0.5, 0.5, 0.95, 0.38);
  }

  applyZoom() {
    const { height } = this.scale;
    this.cameras.main.setZoom(Phaser.Math.Clamp(height / 470, 0.8, 2.2));
  }

  /** Sky and distant city move slower than the building, which gives depth. */
  createBackdrop() {
    this.add.image(0, 0, 'sky').setOrigin(0).setScrollFactor(0.15).setDepth(-3);
    // tuned so the city's base meets the horizon when you're on the ground floor
    this.add.image(0, FLOORS[GROUND].y - 616, 'skyline').setOrigin(0).setScrollFactor(0.45, 0.75).setDepth(-2);
  }

  /** Test helper: idle survivors in every player colour, spread across the Central Hall. */
  spawnCrowd(count) {
    const hall = this.roomsById.hall;
    const fy = FLOORS[hall.floor].y;
    this.crowd = [];
    for (let i = 1; i < count; i++) {
      const key = `survivor-${i}`;
      const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
      createSurvivor(this, key, color);
      const x = hall.rect.x + 40 + ((hall.rect.width - 80) * i) / count;
      const s = this.add.sprite(x, fy, key, 'idle0').setOrigin(0.5, 1).setDepth(9).setFlipX(i % 2 === 0);
      s.play({ key: `${key}-idle`, startFrame: i % 2 });
      const tag = this.add
        .text(x, fy - 94, `P${i + 1}`, { fontFamily: FONT, fontSize: '11px', fontStyle: '700', color, resolution: 3 })
        .setOrigin(0.5)
        .setDepth(9);
      this.crowd.push(s, tag);
    }
    this.state.floor = hall.floor;
    this.player.setPosition(hall.rect.x + 40, fy);
  }

  // ---------------------------------------------------------------- lights
  floorBelow(y) {
    return FLOORS.reduce((best, f) => (f.y >= y - 2 && (best === null || f.y < best.y) ? f : best), null);
  }

  createLights() {
    this.lights = [];
    const add = (img, intensity, mode) => this.lights.push({ img, intensity, mode, phase: Math.random() * 6, until: 0 });

    for (const lamp of this.art.lamps) {
      const tint = hex(lamp.color);
      // wash on the back wall under each LED strip
      const wash = this.add
        .image(lamp.x, lamp.y, 'wash')
        .setOrigin(0.5, 0)
        .setDisplaySize(300, ROOM_HEIGHT - 26)
        .setTint(tint)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(15);
      add(wash, 0.26, lamp.mode);
      // light pool on the floor
      const fy = this.floorBelow(lamp.y).y;
      const pool = this.add.image(lamp.x, fy - 1, 'glow').setScale(1.15, 0.1).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(15);
      add(pool, 0.3, lamp.mode);
    }

    for (const g of this.art.glows) {
      const tint = hex(g.color);
      const img = this.add
        .image(g.x, g.y, 'glow')
        .setScale((g.radius * 2) / 256)
        .setTint(tint)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(14);
      add(img, g.intensity, g.mode);
      // reflection on the polished floor
      const floor = this.floorBelow(g.y);
      if (floor && floor.y - g.y < 230) {
        const refl = this.add
          .image(g.x, floor.y + 1, 'glow')
          .setScale((g.radius * 1.6) / 256, (g.radius * 0.16) / 256)
          .setTint(tint)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(14);
        add(refl, g.intensity * 0.55, g.mode);
      }
    }

    // blinking server LEDs
    this.leds = [];
    for (const r of this.art.leds) {
      for (let y = r.y; y < r.y + r.h; y += 14) {
        for (let x = r.x; x < r.x + r.w; x += 8) {
          if (Math.random() < 0.5) continue;
          this.leds.push(
            this.add
              .rectangle(x + 2, y + 5, 3, 3, Phaser.Utils.Array.GetRandom([0x3ee67a, 0x3e8bff, 0xe6b23e]))
              .setOrigin(0)
              .setBlendMode(Phaser.BlendModes.ADD)
              .setDepth(5),
          );
        }
      }
    }
    this.time.addEvent({ delay: 130, loop: true, callback: () => this.leds.forEach((l) => Math.random() < 0.15 && l.setVisible(!l.visible)) });

    // holograms
    for (const h of this.art.holos) {
      const img = this.add.image(h.x, h.y - 42, 'holo').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8).setDepth(16);
      this.tweens.add({ targets: img, y: h.y - 48, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.tweens.add({ targets: img, scaleX: 0.7, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }

    // rooftop neon sign + antenna beacon
    const sign = this.add
      .text(this.art.roofSign.x, this.art.roofSign.y, 'H E L I X', { fontFamily: FONT, fontSize: '58px', fontStyle: '700', color: '#9ffff4' })
      .setOrigin(0.5)
      .setShadow(0, 0, '#2fd2c0', 26, true, true)
      .setDepth(3);
    add(sign, 1, 'flicker');
    this.add
      .text(this.art.roofSign.x, this.art.roofSign.y + 40, 'RESEARCH  FACILITY', { fontFamily: FONT, fontSize: '14px', fontStyle: '600', color: '#7fb8b0' })
      .setOrigin(0.5)
      .setDepth(3);
    const beacon = this.add.image(this.art.antenna.x, this.art.antenna.y, 'glow').setScale(0.32).setTint(0xff3b4a).setBlendMode(Phaser.BlendModes.ADD).setDepth(3);
    this.tweens.add({ targets: beacon, alpha: 0.1, duration: 800, yoyo: true, repeat: -1 });
  }

  /** Clean plates over each doorway naming the rooms on either side. */
  createSigns() {
    for (const s of this.art.signs) {
      const style = { fontFamily: FONT, fontSize: '10px', fontStyle: '600', color: '#e9e4d6', resolution: 3 };
      const left = this.add.text(s.x - 10, s.y, `‹  ${s.left}`, style).setOrigin(1, 0.5).setDepth(6).setAlpha(0.85);
      const right = this.add.text(s.x + 10, s.y, `${s.right}  ›`, style).setOrigin(0, 0.5).setDepth(6).setAlpha(0.85);
      const w = left.width + right.width + 34;
      const g = this.add.graphics().setDepth(5.9);
      g.fillStyle(0x07080c, 0.92).fillRoundedRect(s.x - w / 2, s.y - 9, w, 18, 4);
      g.lineStyle(1, 0xe9e4d6, 0.22).strokeRoundedRect(s.x - w / 2, s.y - 9, w, 18, 4);
      g.fillStyle(0xffb04a, 1).fillRect(s.x - 0.75, s.y - 5, 1.5, 10);
      left.setX(s.x - 8);
      right.setX(s.x + 8);
    }
  }

  createWeather() {
    const b = this.art.building;
    this.add
      .particles(0, -20, 'rain', {
        x: { min: 0, max: WORLD.width },
        speedY: { min: 560, max: 700 },
        speedX: -50,
        lifespan: 2400,
        quantity: 2,
        frequency: 18,
        alpha: { min: 0.2, max: 0.5 },
        deathZone: [
          { type: 'onEnter', source: new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height) },
          { type: 'onEnter', source: new Phaser.Geom.Rectangle(0, FLOORS[GROUND].y, WORLD.width, WORLD.height) },
        ],
      })
      .setDepth(25);
    // lightning lights up the sky behind the building
    const flash = this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0xc8d8ff, 1).setOrigin(0).setAlpha(0).setScrollFactor(0.15).setDepth(-1).setBlendMode(Phaser.BlendModes.ADD);
    const strike = () => {
      this.tweens.chain({
        targets: flash,
        tweens: [
          { alpha: 0.3, duration: 60 },
          { alpha: 0.04, duration: 90 },
          { alpha: 0.2, duration: 50 },
          { alpha: 0, duration: 700 },
        ],
      });
      this.time.delayedCall(Phaser.Math.Between(7000, 18000), strike);
    };
    this.time.delayedCall(3500, strike);
  }

  // ================================================================ duels
  /** You + two dummy players. P2 is human (Lobby), P3 is secretly infected (Central Hall). */
  setupMatch() {
    const params = new URLSearchParams(window.location.search);
    const youRole = params.get('role') === 'infected' ? 'infected' : 'human';
    const dummyDefs = [
      { id: 'p2', name: 'P2', color: PLAYER_COLORS[1], role: 'human', floor: GROUND, x: 500 },
      { id: 'p3', name: 'P3', color: PLAYER_COLORS[2], role: 'infected', floor: 2, x: 1250 },
    ];
    this.youId = 'you';
    this.match = new Match({
      seed: Number(params.get('seed')) || Date.now(),
      players: [
        { id: 'you', name: 'YOU', color: PLAYER_COLORS[0], role: youRole },
        ...dummyDefs.map(({ id, name, color, role }) => ({ id, name, color, role })),
      ],
    });
    // ?hand=1 starts you with fewer cards (to test running out)
    if (params.has('hand')) this.match.get('you').hand.splice(Math.max(0, Number(params.get('hand'))));
    this.dummies = dummyDefs.map((d) => this.createDummy(d));
    this.busy = false;
    this.refillMs = 0;
    this.refillRing = this.add.graphics().setDepth(12);
    this.updateAllyGlow();
  }

  createDummy(d) {
    const key = `survivor-${d.id}`;
    createSurvivor(this, key, d.color);
    const sprite = this.add.sprite(ORIGIN_X + d.x, FLOORS[d.floor].y, key, 'idle0').setOrigin(0.5, 1).setDepth(9).setFlipX(true);
    sprite.play({ key: `${key}-idle`, startFrame: 1 });
    const tag = this.add.text(sprite.x, sprite.y - 94, d.name, { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color: d.color, resolution: 3 }).setOrigin(0.5).setDepth(9);
    const status = this.add.text(sprite.x, sprite.y - 110, '', { fontFamily: FONT, fontSize: '11px', fontStyle: '700', color: '#ffb04a', resolution: 3 }).setOrigin(0.5).setDepth(9);
    return { ...d, key, sprite, tag, status };
  }

  now() {
    return this.time.now;
  }

  /** Infected players see fellow infected with a green outline. */
  updateAllyGlow() {
    const youInfected = this.match.get(this.youId).role === 'infected';
    for (const d of this.dummies) {
      const show = youInfected && this.match.get(d.id).role === 'infected';
      if (show && !d.glow) d.glow = d.sprite.preFX?.addGlow(0x3ee67a, 3, 0, false, 0.1, 10);
      if (!show && d.glow) {
        d.sprite.preFX?.remove(d.glow);
        d.glow = null;
      }
    }
  }

  /** Closest dummy you could challenge (same floor, in range). */
  nearbyTarget() {
    if (this.busy || this.state.mode !== 'walk') return null;
    let best = null;
    for (const d of this.dummies) {
      const dx = Math.abs(d.sprite.x - this.player.x);
      if (d.floor === this.state.floor && dx < RULES.challengeRange && (!best || dx < best.dx)) best = { d, dx };
    }
    return best?.d ?? null;
  }

  challengeState(d) {
    return this.match.canChallenge(this.youId, d.id, this.now());
  }

  challenge(d) {
    if (this.busy || !d) return;
    const check = this.challengeState(d);
    if (!check.ok) return;
    this.busy = true;
    this.player.play('survivor-idle', true);
    d.sprite.setFlipX(d.sprite.x > this.player.x);
    this.player.setFlipX(this.player.x > d.sprite.x);
    this.events.emit('toast', `Challenging ${d.name}…`, d.color, 1500);
    this.time.delayedCall(Phaser.Math.Between(700, 1400), () => {
      if (Math.random() < 0.2) {
        const lost = this.match.decline(d.id);
        this.events.emit('toast', `${d.name} declined and lost a card${lost ? '' : ' (had none)'}`, '#c9ced8');
        this.busy = false;
        return;
      }
      this.events.emit('toast', `${d.name} accepted. To the duel table!`, d.color, 2000);
      this.goToTable(d);
    });
  }

  /** Both players walk to the nearest duel table on this floor, one each side. */
  goToTable(d) {
    const mid = (this.player.x + d.sprite.x) / 2;
    const table = DUEL_TABLES.filter((t) => t.floor === this.state.floor).sort((a, b) => Math.abs(a.x - mid) - Math.abs(b.x - mid))[0];
    const youLeft = this.player.x <= d.sprite.x;
    this.walkers = [
      { sprite: this.player, anim: 'survivor', target: table.x + (youLeft ? -64 : 64) },
      { sprite: d.sprite, anim: d.key, target: table.x + (youLeft ? 64 : -64) },
    ];
    this.onArrive = () => {
      this.player.setFlipX(!youLeft);
      d.sprite.setFlipX(youLeft);
      this.time.delayedCall(250, () => this.startDuel(d, table));
    };
  }

  stepWalkers(dt) {
    let done = true;
    for (const w of this.walkers) {
      const dx = w.target - w.sprite.x;
      if (Math.abs(dx) > 2) {
        done = false;
        w.sprite.x += Math.sign(dx) * Math.min(Math.abs(dx), 240 * dt);
        w.sprite.setFlipX(dx < 0);
        w.sprite.play(`${w.anim}-walk`, true);
      } else w.sprite.play(`${w.anim}-idle`, true);
    }
    if (done) {
      this.walkers = null;
      this.onArrive?.();
    }
  }

  startDuel(d, table) {
    this.events.emit('duel-open', true);
    this.scene.launch('DuelScene', {
      match: this.match,
      youId: this.youId,
      table,
      now: () => this.now(),
      opp: {
        id: d.id,
        name: d.name,
        color: d.color,
        // the infected play their strongest card; humans pick at random
        pickCard: () => (this.match.get(d.id).role === 'infected' ? this.match.bestCard(d.id) : this.match.randomCard(d.id)),
      },
      onDone: (out) => this.afterDuel(d, out),
    });
  }

  afterDuel(d, out) {
    this.busy = false;
    this.events.emit('duel-open', false);
    this.events.emit('hand-changed');
    for (const e of out.effects) {
      if (e.type === 'infected' && e.player === this.youId) this.becomeInfected();
      if (e.type === 'infected' && e.player !== this.youId) this.updateAllyGlow();
      if (e.type === 'clue' && e.to === this.youId) this.events.emit('toast', `CLUE about ${d.name}: ${e.text}`, '#ffd27a', 7000);
      if (e.type === 'stunned' && e.player === this.youId) this.events.emit('toast', 'You are stunned for 15 seconds', '#ffb04a', 4000);
      if (e.type === 'vaccine' && e.player === this.youId) this.events.emit('toast', 'Your Vaccine blocked the infection', '#3e8bff', 4000);
    }
  }

  becomeInfected() {
    this.events.emit('role-changed', 'infected');
    this.events.emit('toast', 'You have been infected. Spread the strain.', '#3ee67a', 6000);
    this.cameras.main.flash(500, 40, 200, 110);
    // subtle sign: a slow green tint over 60 seconds (others will learn to spot it)
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 60000,
      onUpdate: (tw) => {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor({ r: 255, g: 255, b: 255 }, { r: 190, g: 255, b: 205 }, 1, tw.getValue());
        this.player.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      },
    });
    this.updateAllyGlow();
  }

  isStunned() {
    return this.now() < this.match.get(this.youId).stunnedUntil;
  }

  updateDummies() {
    const now = this.now();
    for (const d of this.dummies) {
      d.tag.setPosition(d.sprite.x, d.sprite.y - 94);
      const p = this.match.get(d.id);
      const stun = p.stunnedUntil - now;
      const text = stun > 0 ? `STUNNED ${Math.ceil(stun / 1000)}` : this.match.isExhausted(d.id) ? 'EXHAUSTED' : '';
      d.status.setText(text).setPosition(d.sprite.x, d.sprite.y - 110);
      // idle dummies glance at you when you're close
      if (!this.walkers && !this.busy && d.floor === this.state.floor && Math.abs(d.sprite.x - this.player.x) < 220) {
        d.sprite.setFlipX(this.player.x < d.sprite.x);
      }
    }
  }

  /** Exhausted? Stand still at a card refill for 5 seconds to get back to 4 cards. */
  updateRefill(dt, input) {
    const g = this.refillRing.clear();
    this.refillHint = null;
    if (this.busy || !this.match.isExhausted(this.youId) || this.state.mode !== 'walk') {
      this.refillMs = 0;
      return;
    }
    const box = SUPPLY_BOXES.find((b) => b.floor === this.state.floor && Math.abs(b.x - this.player.x) < RULES.refillRange);
    if (!box) {
      this.refillMs = 0;
      return;
    }
    const moving = Math.abs(input.x) > 0.15;
    this.refillMs = moving ? 0 : this.refillMs + dt * 1000;
    this.refillHint = moving ? 'STAND STILL TO REFILL' : 'REFILLING…';
    const t = Math.min(1, this.refillMs / RULES.refillTime);
    const x = this.player.x;
    const y = this.player.y - 118;
    g.lineStyle(4, 0xffffff, 0.15).strokeCircle(x, y, 14);
    g.lineStyle(4, 0xf2b84a, 1).beginPath().arc(x, y, 14, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2).strokePath();
    if (t >= 1) {
      const drawn = this.match.refill(this.youId);
      this.refillMs = 0;
      this.events.emit('hand-changed');
      this.events.emit('toast', `Refilled: +${drawn.length} cards`, '#f2b84a');
    }
  }

  // ---------------------------------------------------------------- input
  readMovement() {
    if (this.mapOpen || this.busy || this.isStunned()) return { x: 0, y: 0 };
    const stick = this.ui?.joystick?.vector;
    if (stick && stick.lengthSq() > 0) return { x: stick.x, y: stick.y };
    const k = this.keys;
    return {
      x: (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0),
      y: (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0),
    };
  }

  /** Ladder you could use right now (player near it, on one of its floors). */
  nearbyLadder() {
    if (this.state.mode !== 'walk') return null;
    const px = this.player.x - ORIGIN_X;
    return LADDERS.find((l) => Math.abs(l.x - px) < LADDER_REACH && (l.lower === this.state.floor || l.upper === this.state.floor)) ?? null;
  }

  update(time, delta) {
    const dt = delta / 1000;
    const input = this.readMovement();
    const p = this.player;
    const st = this.state;

    if (this.walkers) {
      this.stepWalkers(dt);
      this.animateLights(time);
      this.updateRoom();
      this.updateDummies();
      return;
    }

    if (st.mode === 'walk') {
      const ladder = this.nearbyLadder();
      const wantsUp = input.y < -0.5 && Math.abs(input.y) > Math.abs(input.x);
      const wantsDown = input.y > 0.5 && Math.abs(input.y) > Math.abs(input.x);
      if (ladder && ((wantsUp && ladder.lower === st.floor) || (wantsDown && ladder.upper === st.floor))) {
        st.mode = 'climb';
        st.ladder = ladder;
        p.x = ORIGIN_X + ladder.x;
        p.play('survivor-climb', true);
      } else {
        const vx = Math.abs(input.x) > 0.15 ? input.x : 0;
        p.x = Phaser.Math.Clamp(p.x + vx * PLAYER_SPEED * dt, ORIGIN_X + 18, ORIGIN_X + WIDTH - 18);
        p.y = FLOORS[st.floor].y;
        if (vx !== 0) {
          p.setFlipX(vx < 0);
          p.play('survivor-walk', true);
          p.anims.timeScale = 0.5 + 0.5 * Math.min(1, Math.abs(vx));
        } else {
          p.play('survivor-idle', true);
          p.anims.timeScale = 1;
        }
      }
    }

    if (st.mode === 'climb') {
      const l = st.ladder;
      const top = FLOORS[l.upper].y;
      const bottom = FLOORS[l.lower].y;
      const vy = Math.abs(input.y) > 0.2 ? input.y : 0;
      p.y = Phaser.Math.Clamp(p.y + vy * CLIMB_SPEED * dt, top, bottom);
      if (vy !== 0) p.anims.resume();
      else p.anims.pause();
      const atTop = p.y <= top + 0.5;
      const atBottom = p.y >= bottom - 0.5;
      // step off when you reach a floor (or walk sideways at a floor)
      if ((atTop && (vy < 0 || Math.abs(input.x) > 0.5)) || (atBottom && (vy > 0 || Math.abs(input.x) > 0.5))) {
        st.mode = 'walk';
        st.floor = atTop ? l.upper : l.lower;
        st.ladder = null;
        p.y = FLOORS[st.floor].y;
        p.anims.resume();
        p.play('survivor-idle', true);
      }
    }

    this.animateLights(time);
    this.updateRoom();
    this.updateDummies();
    this.updateRefill(dt, input);
  }

  animateLights(time) {
    for (const l of this.lights) {
      let a = l.intensity;
      if (l.mode === 'pulse') a *= 0.7 + 0.3 * Math.sin(time * 0.002 + l.phase);
      else if (l.mode === 'flicker') {
        if (time > l.until && Math.random() < 0.005) l.until = time + 60 + Math.random() * 180;
        a *= time < l.until ? 0.3 + Math.random() * 0.2 : 0.95 + Math.random() * 0.05;
      } else if (l.mode === 'broken') {
        if (time > l.until && Math.random() < 0.012) l.until = time + 40 + Math.random() * 160;
        a *= time < l.until ? 0.8 : 0.06;
      }
      l.img.setAlpha(a);
    }
  }

  floorOfPlayer() {
    if (this.state.mode === 'walk') return this.state.floor;
    let best = 0;
    FLOORS.forEach((f, i) => {
      if (Math.abs(f.y - this.player.y) < Math.abs(FLOORS[best].y - this.player.y)) best = i;
    });
    return best;
  }

  updateRoom() {
    const floor = this.floorOfPlayer();
    const px = this.player.x - ORIGIN_X;
    const room = this.rooms.find((r) => r.floor === floor && px >= r.x0 && px < r.x1) ?? null;
    if (room === this.currentRoom) return;
    this.currentRoom = room;
    // light the current room, dim the neighbours (doorways and ladders), darken the rest
    const neighbours = new Set();
    if (room) {
      for (const r of this.rooms) {
        const sameFloorNext = r.floor === room.floor && (r.x0 === room.x1 || r.x1 === room.x0);
        const byLadder = LADDERS.some(
          (l) => [l.lower, l.upper].includes(room.floor) && [l.lower, l.upper].includes(r.floor) && r !== room &&
            l.x >= r.x0 && l.x < r.x1 && l.x >= room.x0 && l.x < room.x1,
        );
        if (sameFloorNext || byLadder) neighbours.add(r);
      }
    }
    this.rooms.forEach((r, i) => {
      const target = r === room ? 0 : neighbours.has(r) ? 0.5 : 0.84;
      this.tweens.add({ targets: this.shades[i], fillAlpha: target, duration: 500, ease: 'Sine.out' });
    });
    this.events.emit('room-changed', room);
  }
}
