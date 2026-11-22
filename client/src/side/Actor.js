import Phaser from 'phaser';
import { PLAYER_SPEED } from '../../../shared/constants.js';
import { WIDTH, ORIGIN_X, FLOORS, LADDERS } from './facility.js';
import { createSurvivor } from './SideCharacter.js';
import { FONT } from '../ui/HUD.js';

export const CLIMB_SPEED = 140;
export const LADDER_REACH = 26; // how close to a ladder you must be to grab it

/**
 * A survivor in the world (you or a bot): sprite, name tag and the
 * walk/climb controller. Input is { x, y } in -1..1, like the joystick.
 */
export default class Actor {
  constructor(scene, { id, name, color, floor, x, isYou = false }) {
    this.scene = scene;
    this.id = id;
    this.name = name;
    this.color = color;
    this.isYou = isYou;
    this.key = isYou ? 'survivor' : `survivor-${id}`;
    createSurvivor(scene, this.key, color);
    this.sprite = scene.add.sprite(x, FLOORS[floor].y, this.key, 'idle0').setOrigin(0.5, 1).setDepth(isYou ? 10 : 9);
    this.sprite.play({ key: `${this.key}-idle`, startFrame: Phaser.Math.Between(0, 1) });
    this.state = { mode: 'walk', floor, ladder: null };
    this.offsetX = 0; // twitch animation offset
    if (!isYou) {
      const style = { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color, resolution: 3 };
      this.tag = scene.add.text(x, 0, name, style).setOrigin(0.5).setDepth(9);
      this.status = scene.add.text(x, 0, '', { ...style, fontSize: '11px', color: '#ffb04a' }).setOrigin(0.5).setDepth(9);
      // Clean badge from the Blood Test, visible to everyone
      this.badge = scene.add.text(x, 0, '', { ...style, fontSize: '10px', color: '#3ee6d0' }).setOrigin(0.5).setDepth(9);
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
    this.sprite.play(`${this.key}-${name}`, true);
  }

  face(x) {
    if (Math.abs(x - this.x) > 1) this.sprite.setFlipX(x < this.x);
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
        return true;
      }
      const vx = Math.abs(input.x) > 0.15 ? input.x : 0;
      s.x = Phaser.Math.Clamp(s.x + vx * speed * dt, ORIGIN_X + 18, ORIGIN_X + WIDTH - 18);
      s.y = FLOORS[st.floor].y;
      if (vx !== 0) {
        s.setFlipX(vx < 0);
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
    this.sprite.setFlipX(dx < 0);
    this.anim('walk');
    return false;
  }

  updateLabels(statusText = '', badgeText = '') {
    if (!this.tag) return;
    this.tag.setPosition(this.x, this.y - 94);
    this.badge.setText(badgeText).setPosition(this.x, this.y - 108);
    this.status.setText(statusText).setPosition(this.x, this.y - (badgeText ? 122 : 110));
  }

  setVisible(v) {
    this.sprite.setVisible(v);
    this.tag?.setVisible(v);
    this.status?.setVisible(v);
    this.badge?.setVisible(v);
  }
}
