import Phaser from 'phaser';
import { PLAYER_SPEED } from '../../../shared/constants.js';
import { WIDTH, ORIGIN_X, FLOORS, LADDERS } from './facility.js';
import { createSurvivorRow, survivorTexture, FACE_ANCHORS, SURVIVOR_SIZE, faceTint } from './SideCharacter.js';
import { label, relabel } from './labels.js';
import { FONT } from '../ui/HUD.js';

export const CLIMB_SPEED = 140;
export const LADDER_REACH = 26; // how close to a ladder you must be to grab it

/**
 * A survivor in the world (you or a bot): sprite, name tag and the
 * walk/climb controller. Input is { x, y } in -1..1, like the joystick.
 */
export default class Actor {
  constructor(scene, { id, name, color, floor, x, isYou = false, ghost = false }) {
    this.scene = scene;
    this.id = id;
    this.name = name;
    this.color = color;
    this.isYou = isYou;
    // one shared sheet for the whole cast, a row per colour (see createSurvivorRow)
    this.key = createSurvivorRow(scene, color);
    this.sprite = scene.add.sprite(x, FLOORS[floor].y, ...survivorTexture(scene, this.key)).setOrigin(0.5, 1).setDepth(isYou ? 10 : 9);
    this.sprite.play({ key: `${this.key}-idle`, startFrame: Phaser.Math.Between(0, 1) });
    this.state = { mode: 'walk', floor, ladder: null };
    this.offsetX = 0; // twitch animation offset
    this.pose = null; // 'duel' replaces idle at a duel table; 'down' = a body on the floor
    this.ghostly = ghost; // see-through ghost with a floating wobble
    this.sq = { x: 1, y: 1 }; // squash & stretch (landing, turning)
    // the visor is the face: a shared glowing-expression texture laid over it every frame
    this.expression = 'neutral';
    this.faceColor = faceTint(color);
    this.visor = scene.add.image(x, 0, 'visor-faces', 'neutral').setTint(this.faceColor).setDepth((isYou ? 10 : 9) + 0.05);
    // a soft back-light, the same for everyone: lifts the dark suit off the wall (dark rooms still hide it)
    this.halo = scene.add.image(x, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xcfe0ff).setAlpha(0.15).setScale(0.42, 0.5).setDepth(8.8);
    scene.events.on('postupdate', this.sync, this);
    this.sprite.once('destroy', () => {
      scene.events.off('postupdate', this.sync, this);
      this.visor.destroy();
      this.halo.destroy();
    });
    if (!isYou) {
      const style = { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color, resolution: 3 };
      // the name tag comes from the shared label sheet (batches); status changes a lot, so it stays a Text
      this.tag = label(scene, x, 0, name || ' ', { size: 12, color }).setOrigin(0.5).setDepth(9.6);
      this.status = scene.add.text(x, 0, '', { ...style, fontSize: '11px', color: '#ffb04a' }).setOrigin(0.5).setDepth(9.7).setVisible(false);
      // Clean badge from the Blood Test, visible to everyone
      this.badge = scene.add.text(x, 0, '', { ...style, fontSize: '10px', color: '#3ee6d0' }).setOrigin(0.5).setDepth(9.7).setVisible(false);
    }
  }

  get x() {
    return this.sprite.x;
  }

  get y() {
    return this.sprite.y;
  }

  /** Floor index, also while climbing (nearest floor). */
  floor() {
    if (this.state.mode === 'walk') return this.state.floor;
    let best = 0;
    FLOORS.forEach((f, i) => {
      if (Math.abs(f.y - this.y) < Math.abs(FLOORS[best].y - this.y)) best = i;
    });
    return best;
  }

  /** Ladder this actor could grab right now. */
  nearbyLadder() {
    if (this.state.mode !== 'walk') return null;
    const px = this.x - ORIGIN_X;
    return LADDERS.find((l) => Math.abs(l.x - px) < LADDER_REACH && (l.lower === this.state.floor || l.upper === this.state.floor)) ?? null;
  }

  anim(name) {
    if (this.pose === 'down') return;
    if (name === 'idle' && this.pose) name = this.pose;
    this.sprite.play(`${this.key}-${name}`, true);
  }

  /** Turn left/right, with a quick squash when the facing changes. */
  turn(left) {
    if (left === this.sprite.flipX) return;
    this.sprite.setFlipX(left);
    this.squash(0.88, 1.08, 150);
  }

  face(x) {
    if (Math.abs(x - this.x) > 1) this.turn(x < this.x);
  }

  /** Squash (or stretch) the sprite and spring back. */
  squash(sx, sy, ms = 200) {
    this.sqTween?.stop();
    this.sq.x = sx;
    this.sq.y = sy;
    this.sqTween = this.scene.tweens.add({ targets: this.sq, x: 1, y: 1, duration: ms, ease: 'Back.out' });
  }

  /** 'duel' (at a duel table) or null. Seen by everyone, so it says nothing about roles. */
  setPose(p) {
    if (this.pose === p || this.pose === 'down') return;
    this.pose = p;
    if (this.state.mode === 'walk' && !this.sprite.anims.currentAnim?.key.endsWith('walk')) this.anim('idle');
  }

  /** A body on the floor. */
  down() {
    this.pose = 'down';
    this.sprite.anims.stop();
    this.sprite.setFlipX(false).setFrame('down0');
    this.setExpression('ko');
    this.faceColor = 0x8a909c;
    this.visor.setTint(this.faceColor);
    this.squash(1.15, 0.8, 300);
  }

  setExpression(name) {
    if (this.expression === name || (this.pose === 'down' && name !== 'ko')) return;
    this.expression = name;
    this.visor.setFrame(name);
  }

  /** Every frame: squash, ghost wobble and the visor face following the body. */
  sync() {
    const s = this.sprite;
    const f = this.visor;
    if (!s.active) return;
    if (this.ghostly) {
      const t = this.scene.time.now;
      s.setOrigin(0.5, 1 + (7 + Math.sin(t / 380) * 4) / SURVIVOR_SIZE.height);
      s.setRotation(Math.sin(t / 610) * 0.06);
    }
    s.setScale(this.sq.x, this.sq.y);
    const down = this.pose === 'down';
    this.halo.setVisible(s.visible && !this.ghostly).setPosition(s.x, s.y - (down ? 22 : 40)).setScale(down ? 0.55 : 0.42, down ? 0.3 : 0.5).setAlpha(0.15 * s.alpha);
    const a = FACE_ANCHORS[s.frame.name];
    if (!a || !a.show || !s.visible) {
      f.setVisible(false);
      return;
    }
    let dx = (a.x - SURVIVOR_SIZE.width * s.originX) * s.scaleX;
    const dy = (a.y - SURVIVOR_SIZE.height * s.originY) * s.scaleY;
    if (s.flipX) dx = -dx;
    const cos = Math.cos(s.rotation);
    const sin = Math.sin(s.rotation);
    f.setPosition(s.x + dx * cos - dy * sin, s.y + dx * sin + dy * cos)
      .setRotation(s.rotation + (s.flipX ? -a.rot : a.rot))
      .setFlipX(s.flipX)
      .setScale(s.scaleX, s.scaleY)
      .setAlpha(s.alpha)
      .setDepth(s.depth + 0.05)
      .setVisible(true);
  }

  /** Walk / climb from input. Returns true if the actor moved. */
  control(input, dt, speed = PLAYER_SPEED) {
    const s = this.sprite;
    const st = this.state;
    if (st.mode === 'walk') {
      const ladder = this.nearbyLadder();
      const wantsUp = input.y < -0.5 && Math.abs(input.y) > Math.abs(input.x);
      const wantsDown = input.y > 0.5 && Math.abs(input.y) > Math.abs(input.x);
      if (ladder && ((wantsUp && ladder.lower === st.floor) || (wantsDown && ladder.upper === st.floor))) {
        st.mode = 'climb';
        st.ladder = ladder;
        s.x = ORIGIN_X + ladder.x;
        this.anim('climb');
        this.squash(0.9, 1.1, 180);
        return true;
      }
      const vx = Math.abs(input.x) > 0.15 ? input.x : 0;
      s.x = Phaser.Math.Clamp(s.x + vx * speed * dt, ORIGIN_X + 18, ORIGIN_X + WIDTH - 18);
      s.y = FLOORS[st.floor].y;
      if (vx !== 0) {
        this.turn(vx < 0);
        this.anim('walk');
        s.anims.timeScale = 0.5 + 0.5 * Math.min(1, Math.abs(vx));
      } else {
        this.anim('idle');
        s.anims.timeScale = 1;
      }
      return vx !== 0;
    }
    // climbing
    const l = st.ladder;
    const top = FLOORS[l.upper].y;
    const bottom = FLOORS[l.lower].y;
    const vy = Math.abs(input.y) > 0.2 ? input.y : 0;
    s.y = Phaser.Math.Clamp(s.y + vy * CLIMB_SPEED * dt, top, bottom);
    if (vy !== 0) s.anims.resume();
    else s.anims.pause();
    const atTop = s.y <= top + 0.5;
    const atBottom = s.y >= bottom - 0.5;
    if ((atTop && (vy < 0 || Math.abs(input.x) > 0.5)) || (atBottom && (vy > 0 || Math.abs(input.x) > 0.5))) {
      st.mode = 'walk';
      st.floor = atTop ? l.upper : l.lower;
      st.ladder = null;
      s.y = FLOORS[st.floor].y;
      s.anims.resume();
      this.anim('idle');
      this.squash(1.18, 0.84, 260); // landing
    }
    return vy !== 0;
  }

  /** Scripted walk (used to reach a duel table). Returns true when there. */
  walkTo(targetX, dt, speed = 240) {
    const dx = targetX - this.x;
    if (Math.abs(dx) <= 2) {
      this.sprite.x = targetX;
      this.anim('idle');
      return true;
    }
    this.sprite.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
    this.turn(dx < 0);
    this.anim('walk');
    return false;
  }

  updateLabels(statusText = '', badgeText = '') {
    if (!this.tag) return;
    this.tag.setPosition(this.x, this.y - 94);
    // empty texts are hidden: each visible one is a draw call on phones
    if (this.badge.text !== badgeText) this.badge.setText(badgeText);
    this.badge.setVisible(!!badgeText && this.sprite.visible).setPosition(this.x, this.y - 108);
    if (this.status.text !== statusText) this.status.setText(statusText);
    this.status.setVisible(!!statusText && this.sprite.visible).setPosition(this.x, this.y - (badgeText ? 122 : 110));
  }

  /** Change the name tag (a skull when shot, a no-entry sign when voted out). */
  setTag(text, color) {
    if (this.tag) this.tag = relabel(this.tag, text, { size: 12, color });
  }

  setVisible(v) {
    this.sprite.setVisible(v);
    this.tag?.setVisible(v);
    this.status?.setVisible(v && !!this.status.text);
    this.badge?.setVisible(v && !!this.badge.text);
  }
}
