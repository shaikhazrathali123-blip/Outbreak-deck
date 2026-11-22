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
//   cure        humans only: played on a zombie it cures them; held, it blocks one bite
export const CARD_INFO = {
  number: { name: 'Number', color: '#2fd2e0', text: 'Duel card. The higher number wins.' },
  zombie: { name: 'Zombie', color: '#3ee67a', text: 'Beats any number card and bites the loser: they turn into a zombie at once. Loses to a Gun.' },
  gun: { name: 'Gun', color: '#ff7a3a', text: '2 bullets. Kills whoever you play it on, human or zombie. Every shot is announced and you are stunned 8s.' },
  cure: { name: 'Cure', color: '#3e8bff', text: 'Play it on a zombie to cure them (you spend 60s in quarantine). Wasted on a human. Held, it blocks one bite.' },
};

export const RULES = {
  handSize: 7,
  refillTo: 4,
  deckGuns: 3, // per 36 number cards
  deckCures: 3,
  maxGuns: 1, // Guns one player may hold
  gunBullets: 2,
  shotStun: 8000, // ms the shooter is stunned after any shot
  zombieStart: 2, // Zombie cards an infected player starts with
  zombieMax: 2,
  zombieRegen: 40000, // ms for an infected player to grow a new Zombie card
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
  cureQuarantine: 60000, // ms the Cure user spends in the quarantine cell (gagged too)
  gagTime: 60000, // ms a freshly cured zombie can't quick-chat or vote
  recoverTime: 20000, // ms a freshly cured zombie can't be bitten

  // --- hunger and meetings (sections 7 and 9)
  hunger: 90000, // ms an infected player can go without biting before they start STARVING
  growlEvery: 20000, // ms between the public growls of a starving zombie
  meetingRange: 70, // px from the Emergency Button to call a meeting
  meetingsPerPlayer: 1,
  meetingFirstDelay: 30000, // no meeting in the first 30s
  meetingCooldown: 30000, // ms after a meeting before the next can be called
  meetingTalk: 30000, // ms of discussion
  meetingVote: 15000, // ms of voting
  meetingResult: 4500, // ms showing the result
};
