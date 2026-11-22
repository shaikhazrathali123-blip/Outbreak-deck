# Outbreak Deck: notes for Claude Code

The full design lives in README.md (rules, cards, duels, rooms, events, phases). Read it before
adding a feature. This file only gives a short summary and the current state of the code.

## The game in short
- Side-view social deduction + card duel game, 6–15 players (or bots), 5–8 minute matches.
- Humans vs. hidden Infected. Walk up to a player and challenge them: they ACCEPT (card duel) or RUN
  (a chase: the challenger has 8s to touch them, which forces the duel).
- Only four card kinds (keep it that simple): numbers 1–9 (higher wins), ZOMBIE (infected only: beats any
  number and BITES; regrows every 40s, max 2), GUN (kills a Zombie card; misfire vs a number is public and
  stuns the shooter 12s), CURE (automatic: blocks one bite; cures a bitten holder).
- The mind-game rules (README "Game Rules" 5–8): bitten humans turn after 45s (incubation; Cure Lab machine
  or a Cure card saves them); Blood Test in the Medbay gives a public Clean badge for 60s (positive = public);
  infected must bite every 90s or start STARVING (growl + a 2.5s green flare every 20s; infection signs are kept subtle on purpose); two infected get a fake duel (both keep
  cards); Emergency Button in the Central Hall calls a meeting (30s quick chat, 15s vote, most votes =
  Quarantine Cell, role kept secret; the match clock pauses).
- Map: Helix Research Facility as a side-view cutaway: 4 floors, 15 rooms, 9 ladders, 10 duel tables
  (README "Map & Rooms").
- Humans win if anyone unbitten is human at 0:00, or every infected is shot/quarantined and nobody is bitten.
  Infected win when no human is left (bitten humans count until they turn), or at 0:00 if every human is bitten.
- Keep all names, art and characters original. Do not copy other games' look.

## Tech
- Phaser 3.90 + Vite, plain JavaScript (ES modules). Later: Node + Colyseus server, Capacitor.
- `client/` is the Vite root. `shared/` holds constants used by client and (later) server.
- No image files: all art is drawn in code at startup. Font: Rajdhani, bundled via `@fontsource/rajdhani`.

## Commands
- `npm run dev`: dev server on port 5173, reachable from a phone on the same Wi-Fi.
- `npm run build`: production build into `dist/`.
- `npm test`: unit tests for the shared rules (`tests/*.test.js`, Node's built-in test runner).
- URL options:   `?role=infected` / `?role=human` forces your role; `?hand=0` starts you with N cards (test running out);
  `?seed=7` makes roles and the deck repeatable;
  `?fx=low` / `?fx=high` forces bloom off/on (off by default on phones).

## Look ("ink & neon", premium pass)
- Clean bone-white linework (tiny wobble, faint hatching) on deep blue-black, soft gradients.
- Neon only on things that glow; each room has an accent colour (skirting strip, label, banner).
- LED ceiling strips cast a soft wash + floor pool; neon objects reflect on the polished floor.
- Sky and city skyline are parallax layers behind the building; rain and lightning outside.
- Only your room is lit; rooms next to it (doorways/ladders) are dim; the rest are dark and hide whoever is inside.

## Rules code (shared/, no Phaser: the Phase 4 server will reuse it)
- `shared/cards.js`: seeded RNG, decks (four of each number 1–9 + Guns + Cures, × copies for big lobbies;
  Zombie cards are never in the deck), `isPlayable` (everything but Cure), card names.
- `shared/duel.js`: `resolveDuel` returns winner + kind: number / infect / kill / misfire / draw.
- `shared/match.js`: `assignRoles()`, `tallyVotes()` + `Match`, which holds every player's hand/role/alive/
  cooldowns/stats plus `turnsAt` (bitten), `hungerAt`, `cleanUntil`, `quarantined`, `meetingsLeft`:
  `canChallenge`, `settleDuel` (number win takes the loser's card; Zombie bites unless Cure; Gun kills;
  misfire stuns the shooter; infected vs infected = 'fake'; human number-win vs infected = clue + stun),
  `tick` (returns events: zombie-grew / turned / cured / starving / growl), `bloodTest`, `useCureStation`,
  `canCallMeeting` / `callMeeting`, `shiftTimers` (meetings pause the match), `quarantine`, `refill`,
  `winner()`, `timeUpWinner()`.
- Rule numbers live in `RULES` in `shared/constants.js` (hand size, Zombie regrow, chase timings, cooldown...).
  Card names/colours/descriptions: `CARD_INFO`.
- Exhausted = no card you can play in a duel (only a Cure, or nothing).

## Code
- `side/facility.js`: the building: FLOORS (0 = basement, GROUND = 1), ROOMS (floor + x range), LADDERS, SPAWN,
  FURNITURE per room, and derived DUEL_TABLES / SUPPLY_BOXES / BLOOD_TEST / CURE_STATION / EMERGENCY_BUTTON.
- `side/inkArt.js`: `Ink` pen helpers, every furniture drawer, `drawFacility()` (building texture + the
  lamps, glows, signs, holograms, LEDs it needs), `drawSky()` and `drawSkyline()` (parallax layers).
- `side/SideCharacter.js`: survivor sprite sheet (walk 8, idle 2, climb 4 frames), neon accent colour per player.
- `side/textures.js`: glow, light wash, hologram, rain and film-grain textures.
- `side/SideMap.js`: building map, small in the corner; M / tap for the big one with legend.
- `scenes/BootScene.js` builds textures → `MenuScene` (title) → `SideScene` + `SideUIScene`.
- `scenes/SideScene.js`: draws the world (lights, signs, weather, room darkness, camera) and owns a Session.
  Emits `room-changed`; the Session emits `hand-changed`, `toast`, `role-changed` (human/bitten/infected),
  `duel-open`, `challenge-request`, `challenge-cancel`, `meeting` (true/false: SideScene launches/stops
  MeetingScene), `you-quarantined`, `match-over`.
- `game/Session.js`: one match: you + bots, roles, challenges (you answer Y = accept / N = run), chases,
  walking to the nearest free duel table, bot-vs-bot duels, kills (bodies stay on the floor), bites, Zombie
  regrowth, hunger/starving glow, infection signs, refills, stations (`yourAction`/`doAction`, `useStation`:
  Blood Test + Cure machine, stand still), meetings (`callMeeting` → `startMeeting` → `updateMeeting` →
  `endMeeting`, `youSay`, `vote`, `quarantine`), timer (`clock()` is frozen during meetings), win check.
  You are "P1" in speech (`name()`). Emits `chase` and `you-died` too.
- `game/BotBrain.js`: bot AI (wander, hunt, refill, run/chase, suspicion + remembered evidence from
  clues/signs/Cures/misfires/positive tests; armed humans hunt suspects; humans take Blood Tests and call
  meetings; bitten bots pick cure / warn / hide; starving infected hunt recklessly; infected stage fake duels)
  and meeting talk (`hear`, `speak`, `castVote`: humans share evidence, infected lie and frame). DIFFICULTY:
  think speed, aggression, accept, card smarts, sight, hunt/lurk, sign noticing, zombieUse, gunNerve,
  voteNerve, callNerve, testChance, fakeDuel.
- `side/Actor.js`: a survivor (sprite, tag, walk/climb controller). `side/Navigator.js`: floor-to-floor routes via ladders.
- `scenes/ResultScene.js`: winning team, your result, every player's role and stats; Play again / Menu.
- `scenes/MenuScene.js`: Play vs Bots with bots (5–14), difficulty, match length (saved in localStorage).
- `scenes/DuelScene.js`: card-table close-up (5s to pick, flip, result lines; cancels cleanly if the duel became invalid).
- `scenes/MeetingScene.js`: meeting overlay: player tiles (badge, voted, out), chat log, quick-chat buttons, vote buttons, result.
- `scenes/SideUIScene.js`: HUD, role chip (badge time / BITTEN countdown / hunger), timer, hand, challenge
  button + Accept/Run prompt, station button (`ui/ActionButton.js`, Space), chase banner and red heartbeat,
  death / quarantine screen, toasts, prompts, joystick, film grain.
- `ui/cardArt.js`: card faces/back drawn in code (big numbers with pips; clawed hand, pistol, syringe).
  `ui/HandUI.js` (tap a card to read it), `ui/ChallengeButton.js`, `ui/Toasts.js`.
- `ui/HUD.js`: location chip, room banner, FPS, controls hint; exports `FONT` and `UI` colours.
- `ui/Joystick.js`: floating joystick on the left half of the screen; read `joystick.vector`.
- `shared/constants.js`: ROOMS (names + colours), MIN/MAX_PLAYERS (6/15), infectedCount(),
  15 PLAYER_COLORS, CARD_INFO, RULES.
- `GAME_GUIDE.txt`: plain-English rules for players. Keep it in sync with rule changes.

## Status
- Phases 0–3.6 are done: a full single-player match vs bots with the simple cards, chases and the mind-game
  rules (meetings + votes, Blood Test, incubation, public misfires, hunger, fake duels).
  Next: play-test toward ~50% human wins (incubation 45s, badge 60s, hunger 90s, regrow 40s in RULES: zombies
  winning too much → longer incubation or shorter hunger), then Phase 4 (online multiplayer).
  Skipped for now: Safe Handshake, extra roles (Medic, Detective, Traitor), end-of-match recap.
- All 10 duel tables play the same duel (the README's five table types were dropped to keep it simple).
