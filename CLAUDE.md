# Outbreak Deck: notes for Claude Code

The full design lives in README.md (rules, cards, duels, rooms, events, phases). Read it before
adding a feature. This file only gives a short summary and the current state of the code.

## The game in short
- Side-view social deduction + card duel game, 6–15 players (or bots), 5–8 minute matches.
- Humans vs. hidden Infected. Walk up to a player, challenge them to a card duel.
  An Infected player who wins a duel infects the loser (unless they have a Vaccine).
- 4 original suits: Blade > Shield > Toxin > Mind > Blade (+3 when your suit is strong).
- Map: Helix Research Facility as a side-view cutaway: 4 floors, 15 rooms, 9 ladders, 10 duel tables
  (README "Map & Rooms").
- Humans win if anyone is human at 0:00, via the Cure Lab, or by quarantining all Infected.
- Keep all names, art and characters original. Do not copy other games' look.

## Tech
- Phaser 3.90 + Vite, plain JavaScript (ES modules). Later: Node + Colyseus server, Capacitor.
- `client/` is the Vite root. `shared/` holds constants used by client and (later) server.
- No image files: all art is drawn in code at startup. Font: Rajdhani, bundled via `@fontsource/rajdhani`.

## Commands
- `npm run dev`: dev server on port 5173, reachable from a phone on the same Wi-Fi.
- `npm run build`: production build into `dist/`.
- URL options: `?crowd=15` puts 15 survivors in the Central Hall (meeting preview);
  `?fx=low` / `?fx=high` forces bloom off/on (off by default on phones).

## Look ("ink & neon", premium pass)
- Clean bone-white linework (tiny wobble, faint hatching) on deep blue-black, soft gradients.
- Neon only on things that glow; each room has an accent colour (skirting strip, label, banner).
- LED ceiling strips cast a soft wash + floor pool; neon objects reflect on the polished floor.
- Sky and city skyline are parallax layers behind the building; rain and lightning outside.
- Only your room is lit; rooms next to it (doorways/ladders) are dim; the rest are dark and hide whoever is inside.

## Code
- `side/facility.js`: the building: FLOORS (0 = basement, GROUND = 1), ROOMS (floor + x range), LADDERS, SPAWN,
  FURNITURE per room, and derived DUEL_TABLES / SUPPLY_BOXES lists for gameplay.
- `side/inkArt.js`: `Ink` pen helpers, every furniture drawer, `drawFacility()` (building texture + the
  lamps, glows, signs, holograms, LEDs it needs), `drawSky()` and `drawSkyline()` (parallax layers).
- `side/SideCharacter.js`: survivor sprite sheet (walk 8, idle 2, climb 4 frames), neon accent colour per player.
- `side/textures.js`: glow, light wash, hologram, rain and film-grain textures.
- `side/SideMap.js`: building map, small in the corner; M / tap for the big one with legend.
- `scenes/BootScene.js` builds textures → `MenuScene` (title) → `SideScene` + `SideUIScene`.
- `scenes/SideScene.js`: walking/climbing controller (no physics), lights, signs, weather, room lighting,
  emits `room-changed`.
- `scenes/SideUIScene.js`: HUD, joystick, ladder prompt, film grain.
- `ui/HUD.js`: location chip, room banner, FPS, controls hint; exports `FONT` and `UI` colours.
- `ui/Joystick.js`: floating joystick on the left half of the screen; read `joystick.vector`.
- `shared/constants.js`: ROOMS (names + colours), MIN/MAX_PLAYERS (6/15), infectedCount(),
  15 PLAYER_COLORS, DUEL_CHALLENGES (name + colour).

## Status
- Phase 0 (setup) and Phase 1 (map and movement) are done. Next: Phase 2 (cards and duels).
