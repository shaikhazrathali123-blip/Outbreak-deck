// Values shared by the client, the asset scripts and (later) the server.

export const TILE_SIZE = 32;

// Player
export const PLAYER_SPEED = 170; // pixels per second
export const VISION_RADIUS = 240; // pixels of clear sight around the player

// Helix Research Facility, Medical Wing. Order = the numbered list on the map legend.
// color = the room's accent colour (neon trim, lights, minimap, banner).
export const ROOMS = [
  { id: 'hall', name: 'Central Hall', color: '#2fd2c0' },
  { id: 'medbay', name: 'Medbay', color: '#ff4a5a' },
  { id: 'lab1', name: 'Lab 1', color: '#4dd2ff' },
  { id: 'lab2', name: 'Lab 2', color: '#4dd2ff' },
  { id: 'research', name: 'Research Lab', color: '#2fd2e0' },
  { id: 'curelab', name: 'Cure Lab', color: '#3ee6d0' },
  { id: 'storage', name: 'Storage', color: '#d9a441' },
  { id: 'locker', name: 'Locker Room', color: '#6a9cff' },
  { id: 'supply', name: 'Supply Room', color: '#f2b84a' },
  { id: 'lobby', name: 'Lobby', color: '#9ab8d8' },
  { id: 'entrance', name: 'Entrance', color: '#e8f4ff' },
];

// Basement rooms (side view only)
ROOMS.push(
  { id: 'server', name: 'Server Room', color: '#3e8bff' },
  { id: 'cafeteria', name: 'Cafeteria', color: '#b06cff' },
  { id: 'reactor', name: 'Reactor', color: '#ff8c2a' },
  { id: 'quarantine', name: 'Quarantine Cell', color: '#ff3b4a' },
);

// ------------------------------------------------------------ match size
export const MIN_PLAYERS = 6;
export const MAX_PLAYERS = 15;

/** How many players start infected. */
export function infectedCount(players) {
  if (players <= 8) return 1;
  if (players <= 12) return 2;
  return 3;
}

// One neon accent per player (visor + chest band), easy to tell apart in the dark.
export const PLAYER_COLORS = [
  '#ff8a2a', '#2fd2e0', '#ff3bd4', '#c6f03a', '#3e8bff',
  '#ffe14a', '#ff4a5a', '#3ee67a', '#b06cff', '#ffffff',
  '#ff9ab8', '#6affd8', '#a8743a', '#9ab8ff', '#ff5a1a',
];


// ------------------------------------------------------------ cards & duels
// Only four kinds of card (see GAME_GUIDE.txt section 3):
//   number 1–9  duel power, highest wins
//   zombie      infected only: beats any number card and bites (the loser turns at once)
//   gun         humans only, 2 bullets: kills whoever it is played on, human or zombie
//   cure        humans only: played on a zombie it cures them. It never protects its holder.
export const CARD_INFO = {
  number: { name: 'Number', color: '#2fd2e0', text: 'Duel card. The higher number wins.' },
  zombie: { name: 'Zombie', color: '#3ee67a', text: 'Beats any number card and bites the loser: they turn into a zombie at once. Loses to a Gun.' },
  gun: { name: 'Gun', color: '#ff7a3a', text: '2 bullets. Kills whoever you play it on, human or zombie. Every shot is announced to everyone.' },
  cure: { name: 'Cure', color: '#3e8bff', text: 'Play it on a zombie to cure them (you spend 30s in quarantine). Wasted on a human. It cannot protect you: you cannot cure yourself.' },
};

export const RULES = {
  handSize: 7,
  refillTo: 4,
  deckGuns: 3, // per 36 number cards
  deckCures: 3,
  maxSpecials: 1, // a human holds ONE Gun or ONE Cure at most (never both)
  gunBullets: 2,
  startGunShare: 0.4, // 40% of the humans (rounded) start with a Gun; the other humans start without one
  shotStun: 0, // v3: no stun after a shot (the -20 points for hitting a human is the cost)
  zombieStart: 1, // Zombie cards an infected player starts with
  zombieMax: 1, // a zombie holds ONE Zombie card at most
  zombieRegen: 75000, // ms after playing it (or turning) before a new Zombie card grows. v3: set per lobby size by lobbyRules()
  challengeRange: 90, // px between players to challenge
  answerTime: 5000, // ms to accept or run
  pickTime: 5000, // ms to pick a card in a duel
  duelCooldown: 10000,
  stunTime: 12000, // a zombie beaten by a human's number card
  refillTime: 5000,
  refillRange: 60,
  falseClueChance: 0.125, // 1 in 8
  signsTime: 60000, // infection signs grow over this long
  chaseTime: 8000, // ms the challenger has to catch someone who ran
  chaseHeadStart: 900, // ms before the chaser may move
  catchRange: 46, // px: touching distance that forces the duel
  chaserSpeed: 1.2, // speed multipliers during a chase
  runnerSpeed: 1.1,
  matchMinutes: 6,

  // --- cures (GAME_GUIDE.txt section 3)
  cureQuarantine: 30000, // ms the Cure user spends in the quarantine cell (gagged too)
  gagTime: 30000, // ms a freshly cured zombie can't quick-chat or vote
  recoverTime: 20000, // ms a freshly cured zombie can't be bitten

  // --- hunger and meetings (sections 7 and 9)
  // v3: ONE "Starving" state. 20s after the Zombie card grows a zombie that hasn't bitten is STARVING:
  // every 20s it growls and flares green for a moment (one sign, one timer)
  hunger: 20000, // ms a zombie can HOLD its Zombie card without biting before it starts STARVING
  growlEvery: 20000, // ms between the pulses (growl + green flare) of a starving zombie
  meetingRange: 70, // px from the Emergency Button to call a meeting
  meetingsPerPlayer: 1,
  meetingFirstDelay: 30000, // no meeting in the first 30s
  meetingCooldown: 30000, // ms after a meeting before the next can be called
  meetingTalk: 30000, // ms of discussion
  meetingVote: 15000, // ms of voting
  meetingResult: 4500, // ms showing the result
  reportRange: 70, // px from a body to report it (calls a meeting, doesn't use your Emergency Button)

  // --- v3: bluff call (once per match: name the card your opponent plays)
  callsPerPlayer: 1,

  // --- v3: Restore Power (humans' second way to win)
  powerParts: 4, // generator parts hidden around the facility
  partPickTime: 4000, // ms standing still at a part to pick it up
  partDeliverTime: 4000, // ms standing still at the generator (Reactor) to fit it
  stationRange: 60, // px to use a station (part, generator, breaker, security desk, body)
  evacTime: 90000, // ms from POWER RESTORED until the evac truck reaches the Entrance

  // --- v3: Blackout (zombies' sabotage, once per match, at the breaker in the Server Room)
  blackouts: 1,
  blackoutTime: 15000,
  blackoutFirstDelay: 45000, // not in the first 45s

  // --- v3: Security desk (Lobby): the last room entries
  cameraEntries: 5,
  cameraCooldown: 10000,

  // --- v3: Last Stand (the last human gets a 1-bullet Gun and sees the zombies for 5s)
  lastStandReveal: 5000,

  // --- v3: lightning shows every silhouette for a moment
  lightningEvery: 90000,
  lightningFlash: 350,
};

/**
 * v3: balance by lobby size (tuned with npm run sim). Small lobbies arm more humans;
 * big lobbies grow Zombie cards faster (the old "+20s per zombie" is gone: one number per lobby).
 */
export function lobbyRules(players) {
  if (players <= 6) return { zombieRegen: 75000, startGunShare: 0.5 };
  if (players <= 8) return { zombieRegen: 45000, startGunShare: 0.2 };
  if (players <= 12) return { zombieRegen: 65000, startGunShare: 0.4 };
  return { zombieRegen: 95000, startGunShare: 0.45 };
}

// v3: one optional match modifier (menu: OFF / DAILY / a fixed one). DAILY picks one from the date.
export const MODIFIERS = {
  'double-guns': { name: 'Double Guns', text: 'Twice as many humans start with a Gun.' },
  'pitch-black': { name: 'Pitch Black', text: 'Every room is darker and everyone sees less.' },
  'fast-claws': { name: 'Fast Claws', text: 'Zombie cards grow back 25% faster.' },
  'extra-cures': { name: 'Extra Cures', text: 'Twice as many Cures in the supply.' },
};

/** The modifier of the day (the same for everyone on that date). */
export function dailyModifier(date = new Date()) {
  const keys = Object.keys(MODIFIERS);
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  return keys[day % keys.length];
}

// Secret score (GAME_GUIDE "Points"). Your score = card points in your hand + banked points.
// Only you see your own score; everyone's is revealed at the end. The team still wins the
// match; the highest score is the top player.
export const POINTS = {
  perBullet: 10, // a Gun is worth 10 per bullet left (a full Gun = 20). A number card is worth its number, a Zombie card 0
  cure: 30,
  shotZombie: 40, // your Gun shot a zombie: you keep that bullet's 10 and get this on top (+40 every time)
  shotHuman: -10, // your Gun shot a human: that bullet's 10 is lost and this on top (-20 every time)
  bite: 15, // banked: your Zombie card turned a human
  cureWasted: -10, // banked: on top of losing the Cure's 30 (total -40). Curing a zombie just costs the card (-30)
  perMinute: 10, // time bonus: every full minute in your current role. Lost when your role changes (bitten or cured)
  // --- v3: smart play
  voteZombie: 20, // you voted for the player who was voted out, and they were a zombie
  voteHuman: -10, // ... and they were a human
  numberWin: 5, // you won a duel with a number card against a number card
  stealth: 25, // end of match: a zombie still in the match who was never accused in a meeting
  part: 10, // you fitted a generator part
  callRight: 15, // your bluff call named the card your opponent played
  callWrong: -10, // ... and it didn't
  lastStand: 50, // end of match: the last human standing made it to 0:00 (or the evac)
};

// v3: ranks from your total XP (saved on this device). XP per match = your score (at least 0) + 50 for a win.
export const RANKS = [
  { name: 'Rookie', xp: 0 },
  { name: 'Orderly', xp: 300 },
  { name: 'Researcher', xp: 800 },
  { name: 'Specialist', xp: 1600 },
  { name: 'Director', xp: 3000 },
];

/** Your rank (and the next one) for a total XP. Each rank unlocks 3 more neon colours in the menu. */
export function rankFor(xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  return { index: i, ...RANKS[i], next: RANKS[i + 1] ?? null, colors: 3 + i * 3 };
}
