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
// Only four kinds of card (see README "Cards"):
//   number 1–9  duel power, highest wins
//   zombie      infected only: beats any number card and infects the loser
//   gun         kills a zombie card; against a number card it misfires (you lose)
//   cure        automatic: blocks one infection
export const CARD_INFO = {
  number: { name: 'Number', color: '#2fd2e0', text: 'Duel card. The higher number wins.' },
  zombie: { name: 'Zombie', color: '#3ee67a', text: 'Beats any number card and bites the loser: they turn 45s later. Loses to a Gun.' },
  gun: { name: 'Gun', color: '#ff7a3a', text: 'Kills a Zombie card. Against a number it misfires: everyone hears it and you are stunned.' },
  cure: { name: 'Cure', color: '#3e8bff', text: 'Automatic: if you would be infected, the Cure is used instead.' },
};

export const RULES = {
  handSize: 7,
  refillTo: 4,
  deckGuns: 3, // per 36 number cards
  deckCures: 3,
  zombieStart: 2, // Zombie cards an infected player starts with
  zombieMax: 2,
  zombieRegen: 40000, // ms for an infected player to grow a new Zombie card
  challengeRange: 90, // px between players to challenge
  answerTime: 5000, // ms to accept or run
  pickTime: 5000, // ms to pick a card in a duel
  duelCooldown: 10000,
  stunTime: 12000,
  refillTime: 5000,
  refillRange: 60,
  falseClueChance: 0.2,
  signsTime: 60000, // infection signs grow over this long
  chaseTime: 8000, // ms the challenger has to catch someone who ran
  chaseHeadStart: 900, // ms before the chaser may move
  catchRange: 46, // px: touching distance that forces the duel
  chaserSpeed: 1.2, // speed multipliers during a chase
  runnerSpeed: 1.1,
  matchMinutes: 6,

  // --- the "mind game" rules (README "Meetings", "Blood Test", "Incubation", "Hunger")
  incubation: 45000, // ms a bitten human has before they turn (Cure Lab or a Cure card saves them)
  cleanBadge: 60000, // ms a Clean badge from the Blood Test lasts
  bloodTestTime: 4000, // ms standing still at the Blood Test
  cureStationTime: 6000, // ms standing still at the Cure Lab machine
  cureStationRecharge: 60000, // ms the Cure Lab machine needs after it cures someone
  hunger: 90000, // ms an infected player can go without biting before they start STARVING (visible to all)
  growlEvery: 20000, // ms between the public growls of a starving zombie
  stationRange: 60, // px from a station to use it
  meetingRange: 70, // px from the Emergency Button to call a meeting
  meetingsPerPlayer: 1,
  meetingFirstDelay: 30000, // no meeting in the first 30s
  meetingCooldown: 30000, // ms after a meeting before the next can be called
  meetingTalk: 30000, // ms of discussion
  meetingVote: 15000, // ms of voting
  meetingResult: 4500, // ms showing the result
};
