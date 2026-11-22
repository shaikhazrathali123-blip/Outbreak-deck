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

// Duel table types, by table colour (see README "Duel Challenges").
export const DUEL_CHALLENGES = {
  highcard: { name: 'High Card', color: '#e9e4d6' },
  bluff: { name: 'Bluff Bet', color: '#ff3b4a' },
  memory: { name: 'Memory Match', color: '#3e8bff' },
  reflex: { name: 'Reflex Draw', color: '#f2e14a' },
  double: { name: 'Double or Nothing', color: '#b06cff' },
};

// ------------------------------------------------------------ cards & duels
export const SUITS = {
  blade: { name: 'Blade', color: '#ff4a5a', beats: 'shield' },
  shield: { name: 'Shield', color: '#3e8bff', beats: 'toxin' },
  toxin: { name: 'Toxin', color: '#3ee67a', beats: 'mind' },
  mind: { name: 'Mind', color: '#b06cff', beats: 'blade' },
};

// Special cards shuffled into every deck (one each per deck), see README "Special cards".
export const SPECIAL_CARDS = {
  vaccine: { name: 'Vaccine', text: 'Blocks one infection. Used automatically.' },
  scanner: { name: 'Scanner', text: 'Secretly reveals if a nearby player is infected.' },
  swap: { name: 'Swap', text: 'Trade one random card with a nearby player.' },
  freeze: { name: 'Freeze', text: 'Target player can\'t move for 5 seconds.' },
  decoy: { name: 'Decoy', text: 'A fake copy of you for 10 seconds.' },
  wild: { name: 'Wild', text: 'Any suit, value 8. Play it in a duel.' },
  flare: { name: 'Flare', text: 'Lights up the area during Lights Out.' },
};
export const INFECTED_CARDS = {
  spore: { name: 'Spore', text: 'Your next duel win infects even through a Vaccine.' },
  mask: { name: 'Mask', text: 'Hides your infection signs for 60 seconds.' },
  rumor: { name: 'Rumor', text: 'Sends a fake clue about a random human.' },
};

export const RULES = {
  handSize: 7,
  refillTo: 4,
  suitBonus: 3,
  wildValue: 8,
  challengeRange: 90, // px between players to challenge
  answerTime: 5000, // ms to accept or decline a challenge
  pickTime: 5000, // ms to pick a card in High Card
  duelCooldown: 10000,
  stunTime: 15000,
  refillTime: 5000,
  refillRange: 60,
  falseClueChance: 0.2,
};
