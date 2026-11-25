// Balance simulator: plays many bot-only matches with the real game code (no graphics)
// and reports how often each team wins, how long matches last and how they end.
//
//   npm run sim                                   200 matches, 8 players, normal bots, 6 minutes
//   npm run sim -- --matches 500 --bots 5,7,11,14  several lobby sizes (bots + your seat)
//   npm run sim -- --difficulty hard --minutes 8
//   npm run sim -- --set RULES.startGunShare=0.25 --set POINTS.shotZombie=25   try a change
//
// Your seat is played by a bot too. Seeds 1..N, so the same command gives the same numbers.
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- options
const args = process.argv.slice(2);
const opt = { matches: 200, bots: '7', difficulty: 'normal', minutes: 6, set: [] };
for (let i = 0; i < args.length; i++) {
  const key = args[i].replace(/^--/, '');
  const value = args[++i];
  if (value === undefined) throw new Error(`--${key} needs a value`);
  if (key === 'set') opt.set.push(value);
  else if (key in opt) opt[key] = value;
  else throw new Error(`Unknown option --${key} (matches, bots, difficulty, minutes, set)`);
}

// ---------------------------------------------------------------- bundle the game code for Node
const outfile = path.join(root, 'node_modules', '.cache', `outbreak-sim-${process.pid}.mjs`); // one per run: runs can go in parallel
fs.mkdirSync(path.dirname(outfile), { recursive: true });
await build({
  entryPoints: [path.join(root, 'tools', 'sim', 'run.js')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  logLevel: 'error',
  plugins: [
    {
      name: 'headless',
      setup(b) {
        b.onResolve({ filter: /^phaser$/ }, () => ({ path: path.join(root, 'tools', 'sim', 'phaser-stub.js') }));
        b.onResolve({ filter: /SideCharacter\.js$/ }, () => ({ path: 'side-character', namespace: 'stub' }));
        b.onResolve({ filter: /side[\/]labels\.js$|\/labels\.js$/ }, () => ({ path: 'labels', namespace: 'stub-labels' }));
        b.onLoad({ filter: /.*/, namespace: 'stub-labels' }, () => ({ contents: 'export const label = (scene, x, y) => scene.add.image(x, y); export const relabel = (img) => img; export const flushLabels = () => {};', loader: 'js' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export function createSurvivor() {}; export const createSurvivorRow = () => "surv"; export const survivorTexture = () => ["survivors", "idle0"]; export const FACE_ANCHORS = {}; export const SURVIVOR_SIZE = { width: 80, height: 92 }; export const faceTint = () => 0xffffff;', loader: 'js' }));
      },
    },
  ],
});
const sim = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
fs.rmSync(outfile, { force: true });
for (const s of opt.set) sim.override(s);

// ---------------------------------------------------------------- run
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '-');
const avg = (list, f) => (list.length ? list.reduce((n, r) => n + f(r), 0) / list.length : 0);
const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`;

console.log(`\nOUTBREAK DECK balance run: ${opt.matches} matches per lobby, ${opt.difficulty} bots, ${opt.minutes} min${opt.set.length ? `, ${opt.set.join(', ')}` : ''}\n`);
const header = ['players', 'zombies', 'humans win', 'zombies win', 'avg length', 'time-up', 'evac win', 'zombie shot', 'human shot', 'bites', 'voted Z/H', 'meetings', 'top player'];
const rows = [];
for (const bots of String(opt.bots).split(',').map(Number)) {
  const results = [];
  const started = Date.now();
  for (let seed = 1; seed <= Number(opt.matches); seed++) {
    results.push(sim.playMatch({ bots, difficulty: opt.difficulty, minutes: Number(opt.minutes), seed }));
    if (seed % 25 === 0) process.stdout.write(`  ${bots + 1} players: ${seed}/${opt.matches}\r`);
  }
  const n = results.length;
  const humans = results.filter((r) => r.winner === 'humans').length;
  const zombies = results.filter((r) => r.winner === 'infected').length;
  const stuck = results.filter((r) => r.winner === 'stuck').length;
  rows.push([
    String(bots + 1),
    String(results[0].zombiesAtStart),
    pct(humans, n),
    pct(zombies, n) + (stuck ? ` (${stuck} stuck)` : ''),
    mmss(avg(results, (r) => r.length)),
    pct(results.filter((r) => r.reason === 'time').length, n),
    pct(results.filter((r) => r.reason === 'evac').length, n),
    avg(results, (r) => r.shotZombies).toFixed(1),
    avg(results, (r) => r.shotHumans).toFixed(1),
    avg(results, (r) => r.bites).toFixed(1),
    `${avg(results, (r) => r.votedZombies).toFixed(1)}/${avg(results, (r) => r.votedHumans).toFixed(1)}`,
    avg(results, (r) => r.meetings).toFixed(1),
    `${pct(results.filter((r) => r.top === 'human').length, n)} human`,
  ]);
  process.stdout.write(`  ${bots + 1} players: done in ${((Date.now() - started) / 1000).toFixed(1)}s        \n`);
}

const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
console.log(`\n${line(header)}\n${widths.map((w) => '-'.repeat(w)).join('  ')}`);
for (const r of rows) console.log(line(r));
console.log(`
humans win / zombies win: the team result (goal: about 50% / 50%)
avg length: match clock when it ended (meetings excluded)   time-up: matches that reached 0:00   evac win: humans escaped in the evac truck
zombie shot / human shot / bites / voted Z/H: per match      top player: how often a human had the best score
`);
