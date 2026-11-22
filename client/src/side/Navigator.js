import { ORIGIN_X, LADDERS } from './facility.js';

/**
 * Turns "go to (floor, x)" into joystick-style input, using ladders to change
 * floors. Floors are stacked, so the route is always: walk to a ladder that
 * goes one floor towards the goal, climb, repeat.
 *
 * @returns {{x:number, y:number, arrived:boolean}}
 */
export function navigate(actor, goal, tolerance = 8) {
  const st = actor.state;
  if (st.mode === 'climb') {
    // keep climbing towards the goal floor
    const goingUp = goal.floor > st.ladder.lower || (goal.floor === st.ladder.upper);
    return { x: 0, y: goingUp ? -1 : 1, arrived: false };
  }
  if (st.floor === goal.floor) {
    const dx = goal.x - actor.x;
    if (Math.abs(dx) <= tolerance) return { x: 0, y: 0, arrived: true };
    return { x: Math.sign(dx) * (Math.abs(dx) < 30 ? 0.5 : 1), y: 0, arrived: false };
  }
  const up = goal.floor > st.floor;
  const options = LADDERS.filter((l) => (up ? l.lower === st.floor : l.upper === st.floor));
  // prefer a ladder that is close now and keeps us near the goal afterwards
  const ladder = options.sort(
    (a, b) => cost(a, actor.x, goal.x) - cost(b, actor.x, goal.x),
  )[0];
  const lx = ORIGIN_X + ladder.x;
  const dx = lx - actor.x;
  if (Math.abs(dx) > 10) return { x: Math.sign(dx) * (Math.abs(dx) < 30 ? 0.5 : 1), y: 0, arrived: false };
  return { x: 0, y: up ? -1 : 1, arrived: false };
}

const cost = (ladder, x, goalX) => Math.abs(ORIGIN_X + ladder.x - x) + 0.5 * Math.abs(ORIGIN_X + ladder.x - goalX);
