import Phaser from 'phaser';
import { ROOMS as ROOM_INFO, RULES } from '../../../shared/constants.js';
import { ROOM_HEIGHT, ORIGIN_X, WORLD, FLOORS, GROUND, ROOMS, LADDERS, GENERATOR, BREAKER, SECURITY_DESK, EVAC_SPOT } from '../side/facility.js';
import { drawFacility, drawSky, drawSkyline } from '../side/inkArt.js';
import { FONT } from '../ui/HUD.js';
import Session from '../game/Session.js';
import sfx from '../audio/Sfx.js';

// v3 theme: "Night Shift, Storm Lockdown". Each floor has a name and a mood.
const FLOOR_NAMES = ['Basement · The Vats', 'Ground · Street Level', 'Floor 2 · The Core', 'Floor 3 · The Labs'];
const hex = (h) => Phaser.Display.Color.HexStringToColor(h).color;

/**
 * Side-view cutaway of the Helix facility: draws the world (lights, signs,
 * weather, room darkness, camera) and runs a match Session (you + bots).
 * Only the room you're in is lit; neighbours are dim and the rest are dark.
 * data: { bots, difficulty, minutes } from the menu.
 */
export default class SideScene extends Phaser.Scene {
  constructor() {
    super('SideScene');
  }

  init(data) {
    this.settings = data ?? {};
  }

  create() {
    this.art = drawFacility(this);
    drawSky(this);
    drawSkyline(this);

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
    this.createStations();
    this.createWeather();

    // --- the match: you + bots, roles, cards (see game/Session.js)
    this.session = new Session(this, this.settings);
    sfx.startAmbient(); // the quiet night-shift music pad
    this.mapOpen = false;

    // --- room darkness (above the players so dark rooms hide whoever is inside)
    this.shades = this.rooms.map((r) =>
      this.add.rectangle(r.rect.x, r.rect.y, r.rect.width, r.rect.height, 0x020308, 0.84).setOrigin(0).setDepth(20),
    );
    this.currentRoom = undefined;
    this.blackout = false;
    this.flashing = false;

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
    // emergency meetings draw on top of everything
    const onMeeting = (open) => {
      if (open) this.scene.launch('MeetingScene', { session: this.session });
      else this.scene.stop('MeetingScene');
    };
    this.events.on('meeting', onMeeting);
    // v3: blackout, lightning, your ghost
    const onBlackout = (on) => {
      this.blackout = on;
      this.applyShades(this.currentRoom, on ? 150 : 600);
      if (on && this.match.get(this.youId).role === 'human') this.cameras.main.flash(120, 0, 0, 0);
    };
    const onLightning = () => this.bigStrike();
    const onGhost = (ghost) => {
      this.cameras.main.startFollow(ghost.sprite, true, 0.08, 0.1);
      this.applyShades(this.currentRoom);
    };
    this.events.on('blackout', onBlackout);
    this.events.on('lightning', onLightning);
    this.events.on('ghost', onGhost);
    const onPart = () => this.drawPartSlots();
    this.events.on('part-fitted', onPart);
    this.events.once('match-over', (result) => {
      this.time.delayedCall(1600, () => {
        this.scene.stop('MeetingScene');
        this.scene.stop('DuelScene');
        this.scene.stop('SideUIScene');
        this.scene.start('ResultScene', result);
      });
    });
    this.events.once('shutdown', () => {
      sfx.stopAmbient();
      this.events.off('meeting', onMeeting);
      this.events.off('blackout', onBlackout);
      this.events.off('lightning', onLightning);
      this.events.off('ghost', onGhost);
      this.events.off('part-fitted', onPart);
      this.scene.stop('MeetingScene');
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

  /** v3 stations: the generator (Reactor), the breaker (Server Room), the security desk (Lobby), the evac door (Entrance). */
  createStations() {
    const label = (x, y, text, color) =>
      this.add.text(x, y, text, { fontFamily: FONT, fontSize: '10px', fontStyle: '700', color, resolution: 3 }).setOrigin(0.5).setLetterSpacing(2).setDepth(6);
    const fy = (spot) => FLOORS[spot.floor].y;
    // generator: a label over the reactor core and a ring of part slots that light up as parts are fitted
    label(GENERATOR.x, fy(GENERATOR) - 214, 'GENERATOR  ·  FIT PARTS HERE', '#ffb04a');
    this.partSlots = this.add.graphics().setDepth(6);
    this.drawPartSlots();
    // breaker panel
    const b = this.add.graphics().setDepth(6);
    const bx = BREAKER.x;
    const by = fy(BREAKER) - 222; // high on the wall, clear of the door sign
    b.fillStyle(0x0b0d12, 1).fillRoundedRect(bx - 18, by, 36, 52, 4).lineStyle(1.5, 0xe9e4d6, 0.8).strokeRoundedRect(bx - 18, by, 36, 52, 4);
    b.fillStyle(0xb4ff3a, 0.9).fillRect(bx - 10, by + 10, 6, 14).fillRect(bx + 4, by + 10, 6, 14);
    b.lineStyle(2, 0xffb04a, 1).lineBetween(bx - 12, by + 38, bx + 12, by + 38);
    label(bx, by - 10, 'BREAKER', '#b4ff3a');
    // security desk monitor
    const m = this.add.graphics().setDepth(6);
    const mx = SECURITY_DESK.x;
    const my = fy(SECURITY_DESK) - 118;
    m.fillStyle(0x0b0d12, 1).fillRoundedRect(mx - 26, my, 52, 34, 3).lineStyle(1.5, 0xe9e4d6, 0.8).strokeRoundedRect(mx - 26, my, 52, 34, 3);
    m.fillStyle(0x9ab8ff, 0.5).fillRect(mx - 22, my + 4, 21, 12).fillRect(mx + 1, my + 4, 21, 12).fillRect(mx - 22, my + 18, 21, 12).fillRect(mx + 1, my + 18, 21, 12);
    label(mx, my - 10, 'SECURITY CAMERAS', '#9ab8ff');
    // evac sign over the exit
    label(EVAC_SPOT.x, fy(EVAC_SPOT) - 214, 'EVAC POINT', '#2fd2e0');
  }

  /** Four slots over the generator: lit = a fitted part. */
  drawPartSlots() {
    const parts = this.session?.match.parts ?? [];
    const g = this.partSlots.clear();
    const n = RULES.powerParts;
    const y = FLOORS[GENERATOR.floor].y - 196;
    for (let i = 0; i < n; i++) {
      const x = GENERATOR.x + (i - (n - 1) / 2) * 20;
      const lit = parts.filter((p) => p.fitted).length > i;
      g.fillStyle(lit ? 0xffb04a : 0x1a1d24, 1).fillRoundedRect(x - 6, y, 12, 8, 2).lineStyle(1, 0xffb04a, 0.8).strokeRoundedRect(x - 6, y, 12, 8, 2);
    }
  }

  /**
   * v3: a big lightning strike lights EVERY room for a moment, so everyone's silhouette shows
   * (dark rooms included). Then the darkness comes back.
   */
  bigStrike() {
    this.strike?.(0.55);
    this.flashing = true;
    for (const s of this.shades) {
      this.tweens.killTweensOf(s);
      s.fillAlpha = 0.05;
    }
    this.cameras.main.flash(160, 200, 215, 255);
    this.time.delayedCall(RULES.lightningFlash, () => {
      this.flashing = false;
      this.applyShades(this.currentRoom, 350);
    });
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
    this.strike = (power = 0.3) => {
      this.tweens.chain({
        targets: flash,
        tweens: [
          { alpha: power, duration: 60 },
          { alpha: 0.04, duration: 90 },
          { alpha: power * 0.66, duration: 50 },
          { alpha: 0, duration: 700 },
        ],
      });
    };
    const strike = () => {
      this.strike();
      this.time.delayedCall(Phaser.Math.Between(300, 1200), () => sfx.play('thunder', 0.3));
      this.time.delayedCall(Phaser.Math.Between(7000, 18000), strike);
    };
    this.time.delayedCall(3500, strike);
  }

  // ---------------------------------------------------------------- what the HUD asks about
  get match() {
    return this.session.match;
  }

  get youId() {
    return this.session.youId;
  }

  /** The sprite the camera follows: you, or your ghost once you are out. */
  get player() {
    return this.session.view.sprite;
  }

  get state() {
    return this.session.view.state;
  }

  get busy() {
    return this.session.isBusy(this.youId);
  }

  get refillHint() {
    return this.session.refillHint;
  }

  now() {
    return this.time.now;
  }

  nearbyLadder() {
    return this.session.view.nearbyLadder();
  }

  nearbyTarget() {
    return this.session.nearbyTarget();
  }

  challengeState(target) {
    return this.session.challengeState(target);
  }

  challenge(target) {
    if (target) this.session.challenge(this.youId, target.id);
  }

  isStunned() {
    return this.session.isFrozen(this.youId);
  }

  // ---------------------------------------------------------------- input + loop
  readMovement() {
    if (this.mapOpen) return { x: 0, y: 0 };
    const stick = this.ui?.joystick?.vector;
    if (stick && stick.lengthSq() > 0) return { x: stick.x, y: stick.y };
    const k = this.keys;
    return {
      x: (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0),
      y: (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0),
    };
  }

  update(time, delta) {
    this.session.update(delta / 1000, this.readMovement());
    this.animateLights(time);
    this.updateRoom();
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

  updateRoom() {
    const floor = this.session.view.floor();
    const px = this.player.x - ORIGIN_X;
    const room = this.rooms.find((r) => r.floor === floor && px >= r.x0 && px < r.x1) ?? null;
    if (room === this.currentRoom) return;
    this.currentRoom = room;
    this.applyShades(room);
    this.events.emit('room-changed', room);
  }

  /**
   * Light the current room, dim the neighbours (doorways and ladders), darken the rest.
   * Ghosts see everything; a Blackout (humans only) and Pitch Black make it all darker.
   */
  applyShades(room, ms = 500) {
    if (this.flashing) return;
    const ghost = !!this.session.ghost;
    const dark = this.blackout && !ghost && this.match.get(this.youId).role === 'human';
    const pitch = this.session.pitchBlack;
    const [lit, near, far] = ghost ? [0.12, 0.12, 0.2] : dark ? [0.8, 0.93, 0.95] : pitch ? [0.3, 0.75, 0.92] : [0, 0.5, 0.84];
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
      const target = r === room ? lit : neighbours.has(r) ? near : far;
      this.tweens.killTweensOf(this.shades[i]);
      this.tweens.add({ targets: this.shades[i], fillAlpha: target, duration: ms, ease: 'Sine.out' });
    });
  }
}
