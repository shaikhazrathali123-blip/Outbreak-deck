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
- `npm test`: unit tests for the shared rules (`tests/*.test.js`, Node's built-in test runner).
- URL options: `?crowd=15` puts 15 survivors in the Central Hall (meeting preview);
  `?role=infected` starts you infected; `?hand=0` starts you with N cards (test running out);
  `?seed=7` makes the deck repeatable;
  `?fx=low` / `?fx=high` forces bloom off/on (off by default on phones).

## Look ("ink & neon", premium pass)
- Clean bone-white linework (tiny wobble, faint hatching) on deep blue-black, soft gradients.
- Neon only on things that glow; each room has an accent colour (skirting strip, label, banner).
- LED ceiling strips cast a soft wash + floor pool; neon objects reflect on the polished floor.
- Sky and city skyline are parallax layers behind the building; rain and lightning outside.
- Only your room is lit; rooms next to it (doorways/ladders) are dim; the rest are dark and hide whoever is inside.

## Rules code (shared/, no Phaser: the Phase 4 server will reuse it)
- `shared/cards.js`: seeded RNG, decks (4 suits × 1–10 + one of each special, × copies for big lobbies),
  `isPlayable` (numbers + Wild), card names.
- `shared/duel.js`: suit advantage and `resolveHighCard` (Wild = 8 with the best suit).
- `shared/match.js`: `Match` holds every player's hand/role/cooldown/stun: `canChallenge`, `decline`,
  `settleDuel` (card transfer, infection or Vaccine, clue + stun), `refill`. Times are passed in.
- Rule numbers live in `RULES` in `shared/constants.js` (hand size, cooldown, stun, ranges...).
- Exhausted = no card you can play in a duel. Winner takes the loser's played card in every decided duel.

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
  the match + dummy players (P2 human in the Lobby, P3 secretly infected in the Central Hall),
  challenge → walk to the nearest duel table → DuelScene, refills. Emits `room-changed`, `hand-changed`,
  `toast`, `role-changed`, `duel-open`.
- `scenes/DuelScene.js`: card-table close-up for High Card (5s to pick, flip, result lines).
- `scenes/SideUIScene.js`: HUD, role badge, hand, challenge button, toasts, prompts, joystick, film grain.
- `ui/cardArt.js`: card faces/back drawn in code (suit icons, special icons). `ui/HandUI.js`, `ui/ChallengeButton.js`, `ui/Toasts.js`.
- `ui/HUD.js`: location chip, room banner, FPS, controls hint; exports `FONT` and `UI` colours.
- `ui/Joystick.js`: floating joystick on the left half of the screen; read `joystick.vector`.
- `shared/constants.js`: ROOMS (names + colours), MIN/MAX_PLAYERS (6/15), infectedCount(),
  15 PLAYER_COLORS, DUEL_CHALLENGES (name + colour).

## Status
- Phases 0–2 are done (setup, map/movement, cards and duels vs dummies). Next: Phase 3 (bots and a full single-player match).
- Every table plays High Card for now; the other 4 challenge types come in Phase 5. Special cards other than
  Vaccine and Wild are shown but not usable yet (Phase 3).
