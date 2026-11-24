// Plays whole bot-only matches with the real game code and reports the balance.
// Bundled by tools/simulate.js (Phaser swapped for a stub), then run in Node.
import Session from '../../client/src/game/Session.js';
import { RULES, POINTS } from '../../shared/constants.js';
import { createRng } from '../../shared/cards.js';
import { HeadlessScene } from './headless.js';

const STEP = 33; // ms per simulated frame (about 30 fps)

/** Play one match. Returns what happened. */
export function playMatch({ bots, difficulty, minutes, seed }) {
  Math.random = createRng(seed * 7919 + 17); // the bots' dice: repeatable per seed
  const scene = new HeadlessScene();
  scene.now = 1000;
  let result = null;
  scene.events.on('match-over', (r) => (result = r));
  let meetings = 0;
  scene.events.on('meeting', (on) => on && meetings++);
  const session = new Session(scene, { sim: true, bots, difficulty, minutes, seed });
  const limit = scene.now + (minutes + 20) * 60000; // safety net: meetings add time, nothing should take 20 extra minutes
  while (!result && scene.now < limit) {
    scene.advance(STEP);
    session.update(STEP / 1000, { x: 0, y: 0 });
  }
  const match = session.match;
  const players = match.list();
  const played = minutes * 60000 - session.timeLeft(); // match clock (meetings excluded)
  const count = (f) => players.filter(f).length;
  return {
    winner: result?.winner ?? 'stuck',
    reason: result?.reason ?? 'stuck',
    length: played,
    meetings,
    players: players.length,
    zombiesAtStart: count((p) => p.startedInfected),
    shotZombies: count((p) => p.shot && p.role === 'infected'),
    shotHumans: count((p) => p.shot && p.role === 'human'),
    votedZombies: count((p) => p.quarantined && p.role === 'infected'),
    votedHumans: count((p) => p.quarantined && p.role === 'human'),
    bites: players.reduce((n, p) => n + p.stats.infections, 0),
    cures: players.reduce((n, p) => n + p.stats.cures, 0),
    top: match.ranking()[0] ? match.get(match.ranking()[0].id).role : null,
    topScore: match.ranking()[0]?.score ?? 0,
  };
}

/** Change a rule for this run, e.g. "RULES.startGunShare=0.25" or "POINTS.shotZombie=25". */
export function override(text) {
  const [path, value] = text.split('=');
  const [group, key] = path.split('.');
  const table = { RULES, POINTS }[group];
  if (!table || !(key in table)) throw new Error(`Unknown setting ${path} (use RULES.x or POINTS.x)`);
  table[key] = Number(value);
}
