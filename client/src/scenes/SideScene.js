import Phaser from 'phaser';
import { ROOMS as ROOM_INFO, PLAYER_SPEED, PLAYER_COLORS, MAX_PLAYERS } from '../../../shared/constants.js';
import { WIDTH, ROOM_HEIGHT, ORIGIN_X, WORLD, FLOORS, GROUND, ROOMS, LADDERS, SPAWN } from '../side/facility.js';
import { drawFacility } from '../side/inkArt.js';
import { createSurvivor } from '../side/SideCharacter.js';

const CLIMB_SPEED = 140;
const LADDER_REACH = 26; // how close to a ladder you must be to grab it

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
    createSurvivor(this);
    this.add.image(0, 0, 'facility').setOrigin(0).setDepth(0);

    this.rooms = ROOMS.map((r) => {
      const info = ROOM_INFO.find((i) => i.id === r.id);
      const fy = FLOORS[r.floor].y;
      return {
        ...r,
        name: info.name,
        color: info.color,
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

    // --- room darkness (above the player so dark rooms hide whoever is inside)
    this.shades = this.rooms.map((r) =>
      this.add.rectangle(r.rect.x, r.rect.y, r.rect.width, r.rect.height, 0x000000, 0.85).setOrigin(0).setDepth(20),
    );
    this.currentRoom = undefined;

    // --- camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD.width, WORLD.height);
    cam.startFollow(this.player, true, 0.1, 0.12);
    cam.setFollowOffset(0, 120); // keep the room (not the floor below) in view
    cam.setBackgroundColor('#04050a');
    cam.fadeIn(700, 0, 0, 0);
    if (this.game.renderer.type === Phaser.WEBGL && cam.postFX) cam.postFX.addVignette(0.5, 0.5, 0.88, 0.45);
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

  /** Test helper: idle survivors in every player colour, spread across the Central Hall. */
  spawnCrowd(count) {
    const hall = this.roomsById.hall;
    const fy = FLOORS[hall.floor].y;
    this.crowd = [];
    for (let i = 1; i < count; i++) {
      const key = `survivor-${i}`;
      createSurvivor(this, key, PLAYER_COLORS[i % PLAYER_COLORS.length]);
      const x = hall.rect.x + 40 + ((hall.rect.width - 80) * i) / count;
      const s = this.add.sprite(x, fy, key, 'idle0').setOrigin(0.5, 1).setDepth(9).setFlipX(i % 2 === 0);
      s.play({ key: `${key}-idle`, startFrame: i % 2 });
      const tag = this.add
        .text(x, fy - 92, `P${i + 1}`, { fontFamily: '"Consolas", monospace', fontSize: '10px', fontStyle: 'bold', color: PLAYER_COLORS[i % PLAYER_COLORS.length], resolution: 3 })
        .setOrigin(0.5)
        .setDepth(9);
      this.crowd.push(s, tag);
    }
    this.state.floor = hall.floor;
    this.player.setPosition(hall.rect.x + 40, fy);
  }

  applyZoom() {
    const { height } = this.scale;
    this.cameras.main.setZoom(Phaser.Math.Clamp(height / 440, 0.8, 2.4));
  }

  // ---------------------------------------------------------------- lights
  createLights() {
    // ceiling lamp light cones
    if (!this.textures.exists('cone')) {
      const t = this.textures.createCanvas('cone', 256, 256);
      const c = t.getContext();
      const g = c.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(112, 0);
      c.lineTo(144, 0);
      c.lineTo(256, 256);
      c.lineTo(0, 256);
      c.closePath();
      c.fill();
      t.refresh();
    }
    this.lights = [];
    const add = (img, intensity, mode) => this.lights.push({ img, intensity, mode, phase: Math.random() * 6, until: 0 });
    for (const lamp of this.art.lamps) {
      const img = this.add
        .image(lamp.x, lamp.y, 'cone')
        .setOrigin(0.5, 0)
        .setDisplaySize(230, ROOM_HEIGHT - 32)
        .setTint(Phaser.Display.Color.HexStringToColor(lamp.color).color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(15);
      add(img, 0.32, lamp.mode);
    }
    for (const g of this.art.glows) {
      const img = this.add
        .image(g.x, g.y, 'glow')
        .setScale((g.radius * 2) / 256)
        .setTint(Phaser.Display.Color.HexStringToColor(g.color).color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(14);
      add(img, g.intensity, g.mode);
    }
    // blinking server LEDs
    this.leds = [];
    for (const r of this.art.leds) {
      for (let y = r.y; y < r.y + r.h; y += 14) {
        for (let x = r.x; x < r.x + r.w; x += 8) {
          if (Math.random() < 0.5) continue;
          this.leds.push(
            this.add.rectangle(x + 2, y + 5, 3, 3, Phaser.Utils.Array.GetRandom([0x3ee67a, 0x3e8bff, 0xe6b23e])).setOrigin(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(5),
          );
        }
      }
    }
    this.time.addEvent({ delay: 130, loop: true, callback: () => this.leds.forEach((l) => Math.random() < 0.15 && l.setVisible(!l.visible)) });
    // holograms
    for (const h of this.art.holos) {
      const img = this.add.image(h.x, h.y - 40, 'holo').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.75).setDepth(16);
      this.tweens.add({ targets: img, y: h.y - 46, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.tweens.add({ targets: img, scaleX: 0.7, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    // rooftop neon sign + antenna beacon
    const sign = this.add
      .text(this.art.roofSign.x, this.art.roofSign.y, 'HELIX', { fontFamily: '"Consolas", monospace', fontSize: '54px', fontStyle: 'bold', color: '#7ffff0' })
      .setOrigin(0.5)
      .setShadow(0, 0, '#2fd2c0', 24, true, true)
      .setDepth(3);
    add(sign, 1, 'flicker');
    const beacon = this.add.image(this.art.antenna.x, this.art.antenna.y, 'glow').setScale(0.35).setTint(0xff3b4a).setBlendMode(Phaser.BlendModes.ADD).setDepth(3);
    this.tweens.add({ targets: beacon, alpha: 0.1, duration: 700, yoyo: true, repeat: -1 });
  }

  createSigns() {
    for (const s of this.art.signs) {
      const t = this.add
        .text(s.x, s.y, s.text, { fontFamily: '"Consolas", monospace', fontSize: '9px', fontStyle: 'bold', color: '#ffd08a', resolution: 3 })
        .setOrigin(0.5)
        .setShadow(0, 0, '#ff9a2a', 6, false, true)
        .setDepth(6);
      this.add.rectangle(s.x, s.y, t.width + 10, t.height + 4, 0x070a10, 0.9).setStrokeStyle(1, 0xff9a2a, 0.8).setDepth(5.9);
    }
  }

  createWeather() {
    if (!this.textures.exists('rain')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xbfd8ff, 0.5).fillRect(0, 0, 1.5, 16);
      g.generateTexture('rain', 2, 16);
      g.destroy();
    }
    const b = this.art.building;
    this.add
      .particles(0, -20, 'rain', {
        x: { min: 0, max: WORLD.width },
        speedY: { min: 520, max: 680 },
        speedX: -60,
        lifespan: 2200,
        quantity: 3,
        frequency: 16,
        alpha: { min: 0.25, max: 0.6 },
        deathZone: [
          { type: 'onEnter', source: new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height) },
          { type: 'onEnter', source: new Phaser.Geom.Rectangle(0, FLOORS[GROUND].y, WORLD.width, WORLD.height) },
        ],
      })
      .setDepth(25);
    // lightning: flash the sky behind the building
    const gy = FLOORS[GROUND].y;
    this.sky = [
      [0, 0, b.x, gy],
      [b.x + b.width, 0, WORLD.width - b.x - b.width, gy],
      [b.x, 0, b.width, b.y],
    ].map(([x, y, w, h]) => this.add.rectangle(x, y, w, h, 0xc8d8ff, 1).setOrigin(0).setAlpha(0).setDepth(0.5).setBlendMode(Phaser.BlendModes.ADD));
    const strike = () => {
      this.tweens.chain({
        targets: this.sky,
        tweens: [
          { alpha: 0.35, duration: 60 },
          { alpha: 0.05, duration: 90 },
          { alpha: 0.25, duration: 50 },
          { alpha: 0, duration: 600 },
        ],
      });
      this.time.delayedCall(Phaser.Math.Between(6000, 16000), strike);
    };
    this.time.delayedCall(3000, strike);
  }

  // ---------------------------------------------------------------- input
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
  }

  animateLights(time) {
    for (const l of this.lights) {
      let a = l.intensity;
      if (l.mode === 'pulse') a *= 0.65 + 0.35 * Math.sin(time * 0.002 + l.phase);
      else if (l.mode === 'flicker') {
        if (time > l.until && Math.random() < 0.006) l.until = time + 60 + Math.random() * 200;
        a *= time < l.until ? 0.25 + Math.random() * 0.2 : 0.94 + Math.random() * 0.06;
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
      const target = r === room ? 0 : neighbours.has(r) ? 0.55 : 0.86;
      this.tweens.add({ targets: this.shades[i], fillAlpha: target, duration: 450, ease: 'Sine.out' });
    });
    this.events.emit('room-changed', room);
  }
}
