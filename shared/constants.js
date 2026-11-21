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
