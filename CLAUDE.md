# Outbreak Deck: notes for Claude Code

The full design lives in README.md (rules, cards, duels, rooms, events, phases). Read it before
adding a feature. This file only gives a short summary and the current state of the code.

## The game in short
- Side-view social deduction + card duel game, 6–15 players (or bots), 5–8 minute matches.
- Humans vs. hidden Infected. Walk up to a player, challenge them to a card duel.
  An Infected player who wins a duel infects the loser (unless they have a Vaccine).
- 4 original suits: Blade > Shield > Toxin > Mind > Blade (+3 when your suit is strong).
- Map: Helix Research Facility, Medical Wing: 11 areas around an open Central Hall (README "Map & Rooms").
- Humans win if anyone is human at 0:00, via the Cure Lab, or by quarantining all Infected.
- Keep all names, art and characters original. Do not copy other games' look.

## Tech
- Phaser 3.90 + Vite, plain JavaScript (ES modules). Later: Node + Colyseus server, Capacitor.
- `client/` is the Vite root. `shared/` holds constants used by client, scripts and (later) server.
- Static assets are in `client/public/assets/` (served as `assets/...`).

## Commands
- `npm run dev`: dev server on port 5173, reachable from a phone on the same Wi-Fi.
- `npm run build`: production build into `dist/`.
- `npm run generate:assets`: regenerates the tileset, player sprite and the Tiled map.
  Art is drawn in code in `scripts/art/` (tiles, props, character). The map is defined in
  `scripts/art/layouts.mjs`: AREAS (floor rectangles + diagonal corner cuts), DOORS, and furnish()
  for furniture, lights, duel tables, vents, supply box and spawn, plus furnishDetails() for small clutter
  (it refuses props that block a doorway). Wall decorations per room: FACE_WEIGHTS in `scripts/art/tiles.mjs`.
  It overwrites `helix.json`, so stop using it once the map is hand-edited in Tiled.
- `npm run check:map`: checks every room is reachable from spawn and the walls have no gaps.
- Add `?debug` to the URL to show physics hitboxes. `?fx=low` / `?fx=high` forces bloom off/on
  (bloom is off by default on phones).

## View and style (current)
- **Side-view cutaway** in an **ink & neon** style is the main game (`SideScene`): the facility seen from the
  side, 4 floors (basement to floor 3), 15 rooms, 9 ladders, 10 duel tables, 3 card refills. Bone-white hand-drawn linework + crosshatching on black; neon only
  on things that glow. Everything is drawn in code at startup (no image files).
- Only your room is lit; rooms next to it (doorways/ladders) are dim; the rest are dark and hide whoever is inside.
- The older top-down version still works at `?view=top` (`GameScene`, Tiled map, files below).

## Side view code
- `side/facility.js`: the building: FLOORS (0 = basement, GROUND = 1), ROOMS (floor + x range), LADDERS, SPAWN,
  FURNITURE per room, and derived DUEL_TABLES / SUPPLY_BOXES lists for gameplay.
- `shared/constants.js`: MIN/MAX_PLAYERS (6/15), infectedCount(), 15 PLAYER_COLORS, DUEL_CHALLENGES (name + colour).
- `?crowd=15` spawns 15 survivors in the Central Hall to preview a full meeting.
- `side/inkArt.js`: `Ink` pen helpers and every furniture drawer; `drawFacility()` paints the building
  into the `facility` texture and returns lamps, glows, door signs, holograms, LEDs and vents.
- `side/SideCharacter.js`: survivor sprite sheet (walk 8, idle 2, climb 4 frames), neon accent colour per player.
- `scenes/SideScene.js`: walking/climbing controller (no physics), room lighting, lamp cones, rain, lightning.
- `scenes/SideUIScene.js`: HUD, joystick, ladder prompt, film grain. `side/SideMap.js`: building map (M / tap).

## Code layout (top-down, Phase 1)
- `scenes/BootScene.js`: loads assets, builds the vision texture and player animations.
- `scenes/MenuScene.js`: title screen. Tap/Enter starts (fullscreen on phones).
- `scenes/GameScene.js`: tilemap, collisions, player, camera, room detection (`room-changed` event).
- `scenes/UIScene.js`: screen-space overlay running on top of GameScene (HUD + joystick).
- `objects/Player.js`: 4-direction movement and animation; `move(vx, vy)` takes -1..1 input.
- `systems/VisionSystem.js`: darkness with a soft clear circle; `setRadius()` for Lights Out later.
- `systems/LightingSystem.js`: coloured additive light pools from the `Lights` layer (steady/flicker/pulse/strobe/broken).
- `systems/FXSystem.js`: sparks, steam, server LEDs, flickering screens, DNA holograms (`FX` layer), plus dust.
- `systems/SignSystem.js`: glowing room-name plates over doorways (`Signs` layer, generated from DOORS).
- `ui/Minimap.js`: small map top-right (a MAP button on short screens). Tapping it opens MapView.
- `ui/MapView.js`: full map screen (M key): GameScene's overview camera + title, room labels, icons, legend.
- `ui/HUD.js`: room banner, location label, FPS, controls hint.
- `ui/Joystick.js`: floating joystick on the left half of the screen; read `joystick.vector`.

## Map conventions (helix.json)
- Tile layers (bottom to top): `Outside` (machinery between rooms), `Floor`, `Decor` (walk-over), `Shade` (wall shadows),
  `Walls` (solid; 3/4 view: a wall with floor below shows its front face), `Props` (solid furniture).
- Object layers: `Rooms` (rectangles, `name` = display name, properties `roomId`, `color`),
  `Spawns` (point named `player`), `Lights` (points: color, radius, intensity, mode),
  `FX` (points named sparks/steam, rectangles named leds), `DuelTables` (rects, property `challenge`),
  `SupplyBoxes` (points), `Vents` (points).
- Floor tiles carry a `room` property (room id, or `corridor`); GameScene reads it to know the current room.
  Angled wall tiles have `diagonal: true` and don't collide.
- Room names and accent colours are in `shared/constants.js` (ROOMS).
- Tiles are 32x32. The tileset is extruded (margin 1, spacing 2) to avoid seams when zooming.

## Status
- Phase 0 (setup) and Phase 1 (map and movement) are done, now in side view. Next: Phase 2 (cards and duels).
