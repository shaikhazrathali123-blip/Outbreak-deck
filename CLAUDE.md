# Outbreak Deck: notes for Claude Code

The rulebook is GAME_GUIDE.txt (v3.0): the code follows it, and it wins over README.md if they disagree.
The rest of the design lives in README.md (rooms, events, phases). Read both before adding a feature.
This file only gives a short summary and the current state of the code.

## The game in short
- Side-view social deduction + card duel game, 6–15 players (or bots), 5–8 minute matches.
- Humans vs. hidden Infected. Walk up to a player and challenge them: they ACCEPT (card duel) or RUN
  (a chase: the challenger has 8s to touch them, which forces the duel).
- Only four card kinds (keep it that simple): numbers 1–9 (higher wins), ZOMBIE (infected only: beats any
  number and BITES: the loser turns AT ONCE; ONE Zombie card max, the next grows one fixed time per lobby size after it is used
  (`startZombieRegrow` / `zombieRegen()` = `match.rules.zombieRegen` from `lobbyRules()`; new zombies wait the same for their first)), GUN (humans only, 2 bullets:
  kills whoever it is played on, human or zombie; `lobbyRules().startGunShare` of the humans start with one (`match.armed`); every shot announced without the target's role;
  no shot stun since v3: `RULES.shotStun` 0), CURE (humans only: only works PLAYED on a zombie,
  wasted on a human; it never protects its holder: you can't cure yourself). A human holds ONE of them at most:
  a Gun OR a Cure (`RULES.maxSpecials`). Curing a zombie sends the Cure user to the quarantine cell for 30s (gagged, frozen,
  can't be voted out); the cured player is gagged 30s and recovering 20s (can't be bitten).
- A bitten human's Gun or Cure goes secretly to a random human holding neither (or back to the supply).
- Hunger only runs while a zombie holds its Zombie card (`hungerAt` is null without one; set when the card grows): use it within 20s or start STARVING (growl + a 2.5s green flare every 20s; infection signs are
  kept subtle on purpose); two infected get a fake duel (both keep cards); Emergency Button in the Central
  Hall calls a meeting (30s quick chat, 15s vote, most votes = Quarantine Cell, role kept secret; the match
  clock pauses). No Blood Test, badge, incubation or Cure Lab machine any more (removed in v2).
- Map: Helix Research Facility as a side-view cutaway: 4 floors, 15 rooms, 9 ladders, 10 duel tables
  (README "Map & Rooms").
- v3 (GAME_GUIDE sections 15–16): Restore Power (4 generator parts → generator in the Reactor → evac truck at the Entrance 90s later;
  more humans than zombies inside = humans win, reason 'evac'), Blackout (zombies, once, breaker in the Server Room, 15s dark for
  humans), security cameras (Lobby, last 5 room entries), body reports (call a meeting, no Emergency Button used), bluff calls in duels
  (once per match: name the opponent's Zombie/Gun/Cure; right = cancelled + win +15, wrong = −10), Last Stand (last human: 1-bullet Gun +
  5s red reveal), lightning every 90s lights every room, emotes, ghosts for out players, match recap, modifiers (menu: off / daily /
  Double Guns / Pitch Black / Fast Claws / Extra Cures), XP ranks + badges + unlockable colours (`client/src/game/profile.js`, localStorage).
- Humans win if every zombie is shot, voted out or cured (or by the evac); infected win when no human is left. At 0:00 the
  bigger team wins (more zombies than humans = infected; a tie goes to the humans; a Cure user in the cell
  counts as a human; shot and voted-out players don't count): `Match.timeUpWinner()`.
- Secret points (GAME_GUIDE section 2): score = card points in hand (number = value, Gun 10 per bullet left, Cure 30, Zombie 0)
  + banked (`POINTS`: every Gun shot: zombie +40 net (the bullet's 10 banked back + 40) / human −20 net, bite +15, wasted Cure −10 extra;
  v3: number win +5, part +10, vote helped your team +20 / hurt it −10, call right +15 / wrong −10, `finish()`: stealth +25, Last Stand +50) + time bonus (`POINTS.perMinute` 10 per full minute in your current role, from
  `roleSince`; reset when bitten or cured; paused by meetings). Only you see yours
  (gold chip under the role chip); results reveal all, highest = ★ top player. The team result still wins the match.
- Keep all names, art and characters original. Do not copy other games' look.

## Tech
- Phaser 3.90 + Vite, plain JavaScript (ES modules). Later: Node + Colyseus server, Capacitor.
- `client/` is the Vite root. `shared/` holds constants used by client and (later) server.
- No image files: all art is drawn in code at startup. Font: Rajdhani, bundled via `@fontsource/rajdhani`.

## Commands
- `npm run dev`: dev server on port 5173, reachable from a phone on the same Wi-Fi.
- `npm run build`: production build into `dist/`.
- `npm test`: unit tests for the shared rules (`tests/*.test.js`, Node's built-in test runner).
- `npm run sim`: balance simulator (`tools/simulate.js`): plays bot-only matches with the real Session/BotBrain code
  headless (Phaser stubbed via esbuild, `tools/sim/`), prints win rates, length, shots, bites, votes. Options:
  `--matches 200 --bots 5,7,11,14 --difficulty normal --minutes 6 --set RULES.zombieRegen=75000 --set POINTS.shotZombie=25`.
  Session `settings.sim`: a bot plays your seat and nothing waits for input.
- URL options:   `?role=infected` / `?role=human` forces your role; `?hand=0` starts you with N cards (test running out);
  `?seed=7` makes roles and the deck repeatable;
  `?fx=low` / `?fx=high` forces the effects level (`game/fx.js`; phones default to low); `?fps=1` shows the FPS counter
  outside dev builds.

## Look ("ink & neon", premium pass)
- Clean bone-white linework (tiny wobble, faint hatching) on deep blue-black, soft gradients.
- Neon only on things that glow; each room has an accent colour (skirting strip, label, banner).
- LED ceiling strips cast a soft wash + floor pool; neon objects reflect on the polished floor.
- Sky and city skyline are parallax layers behind the building; rain and lightning outside.
- Only your room is lit; rooms next to it (doorways/ladders) are dim; the rest are dark and hide whoever is inside.
- Survivors: chunky hazmat suits with a big glowing visor that shows the face (see `side/SideCharacter.js`).
- Your room gets a soft ADD lift behind the players (`SideScene.lifts`) and every survivor a faint back-light (`Actor.halo`,
  the same for all), so they read as clean silhouettes. Neighbours stay dim (0.55), far rooms dark (0.84).
- Less text (Stage 2): icons instead of hint lines (`ui/icons.js`), control hints only in your first match and only until you
  have done the action (`game/hints.js`), HUD text 14 px minimum (`MIN_TEXT`), room name big for 1.5s then it shrinks into the chip.

## Frame cost (phones)
- Phones run Phaser's single-texture mobile pipeline: every texture switch is a draw call. So: one sheet for all survivors
  (`createSurvivorRow`, 'survivors'), world labels and name tags from one label sheet (`side/labels.js`), same-texture lights
  at one depth (all 'glow' at 14, washes at 15), empty status texts hidden. A match frame went from ~165 to ~56 draw calls.
- fx=low: no camera post pass (the vignette pass re-renders the whole view; a static 'vignette' image instead), no film grain,
  no bloom. fx=high (desktop): bloom + vignette + grain. Always: the sky, skyline and roof sign are skipped while the opaque
  building fills the view (`SideScene.cullBackdrop`).

## Rules code (shared/, no Phaser: the Phase 4 server will reuse it)
- `shared/cards.js`: seeded RNG, decks (four of each number 1–9 + Guns (2 bullets) + Cures, × copies for big
  lobbies; Zombie cards are never in the deck), `isPlayable` (every card), `isHumanOnly` (Gun, Cure), card names.
- `shared/duel.js`: `resolveDuel` compares two cards: number / infect / kill / cure / cure-number / draw.
- `shared/match.js`: `assignRoles()`, `tallyVotes()` + `Match`, which holds every player's hand/role/alive/
  cooldowns/stats plus `hungerAt`, `cellUntil` (cure quarantine), `gagUntil`, `recoverUntil`, `shot`,
  `quarantined` (voted out), `meetingsLeft`, `callsLeft`, `reported`; match-wide `rules` (RULES + `lobbyRules()` + modifier overrides),
  `parts` / `powerAt` / `evacAt`, `blackoutUntil`, `accused`, `lastStandFor`: `deal` / `allowed` (zombies never hold Guns or Cures; a human holds a Gun OR a Cure),
  `canChallenge`, `settleDuel(a, b, cardA, cardB, now, calls)` (bluff calls via `resolveCalls`; effects: called, call-wrong, card-taken, clue, stunned, killed, bitten, handed (secret Gun/Cure hand-off),
  cured, cell, cure-wasted, immune, fake, draw), `bite`, `cureZombie`, `sendToCell`, `trash` (Zombie cards
  never reach the deck), `tick` (events: zombie-grew / starving / growl / released), `canCallMeeting`,
  `canVote` / `canBeVoted`, `shiftTimers` (meetings pause the match), `quarantine`, `refill`, `winner()`,
  v3: `canReport`/`report`, `noteAccused`, `rewardVoters`, `checkLastStand`, `setupParts`/`pickPart`/`fitPart`/`dropPart`/`partCarried`,
  `canBlackout`/`blackout`/`isBlackout`, `finish(reason)` (end bonuses, once), `canCall`,
  score: `handPoints`, `scoreParts` (frozen in `finalParts`), `timeBonus` (uses `match.time`, set by `tick`/`settleDuel`), `score(id)` (frozen in `finalScore` when shot or voted out), `award` (bank + a `points` effect), `ranking()`.
- Point values: `POINTS` in `shared/constants.js`. Tests: `tests/score.test.js`.
- Rule numbers live in `RULES` in `shared/constants.js` (hand size, Zombie regrow, chase timings, cooldown...).
  Card names/colours/descriptions: `CARD_INFO`.
- Exhausted = no cards at all (every card is playable, a Cure too).

## Code
- `side/facility.js`: the building: FLOORS (0 = basement, GROUND = 1), ROOMS (floor + x range), LADDERS, SPAWN,
  FURNITURE per room, and derived DUEL_TABLES / SUPPLY_BOXES / EMERGENCY_BUTTON; v3 stations GENERATOR, BREAKER, SECURITY_DESK,
  EVAC_ROOM / EVAC_SPOT and PART_SPOTS (where the 4 parts can hide).
- `side/inkArt.js`: `Ink` pen helpers, every furniture drawer, `drawFacility()` (building texture + the
  lamps, glows, signs, holograms, LEDs it needs), `drawSky()` and `drawSkyline()` (parallax layers).
- `side/SideCharacter.js`: the hazmat survivor sprite sheet (walk 8, idle 2, climb 4 from behind, duel 2, down 1), neon accent colour
  per player on visor + trim. Named LAYERS (suit, trim, visor, helmetTop = hat slot, backpack), each a style id in `STYLES`
  (only 'default' today). In a match every survivor is a row of the shared 'survivors' sheet (`createSurvivorRow(scene, accent, look)`,
  keyed by colour + look); `createSurvivor(scene, key, accent, look, { res, only })` makes a standalone (e.g. 3x, idle-only for the
  menu). The visor face is a shared white texture `visor-faces` (`facesKey(res)`)
  (EXPRESSIONS: neutral, scared, angry, happy, suspicious, ko) tinted per player (`faceTint`) and laid over the visor using
  `FACE_ANCHORS` (visor centre per frame). `createPortrait(scene, accent)`: front-view helmet for meeting tiles and result rows.
  The sim stubs this file (`tools/simulate.js`): keep the stub's exports in step.
- `side/textures.js`: glow, light wash, hologram, rain, film-grain and vignette textures.
- `side/labels.js`: `label(scene, x, y, text, style)` / `relabel(img, text)`: text drawn once into the shared 'labels' sheet (3x).
- `side/SideMap.js`: building map, small in the corner; M / tap for the big one with legend.
- `scenes/BootScene.js` builds textures → `MenuScene` (title) → `SideScene` + `SideUIScene`.
- `scenes/SideScene.js`: draws the world (lights, signs, weather, room darkness, camera) and owns a Session.
  Emits `room-changed`; the Session emits `hand-changed`, `toast`, `role-changed` (human/infected),
  `duel-open`, `challenge-request`, `challenge-cancel`, `meeting` (true/false: SideScene launches/stops
  MeetingScene), `you-quarantined`, `match-over`.
- `game/Session.js`: one match: you + bots, roles, challenges (you answer Y = accept / N = run), chases,
  walking to the nearest free duel table, bot-vs-bot duels, shots (`onKilled`: bodies stay on the floor, role
  secret), bites (`onBitten`), cures (`onCured`, `toCell`: the 60s cell in the Quarantine Cell room), Zombie
  regrowth, hunger/starving flare, infection signs (pale tint while recovering), refills, the Emergency Button
  (`yourAction`/`doAction`/`stationFor`/`useStation`: report, fit, pick, meeting, blackout, camera), v3 `startWork`/`updateWork` (stand still
  at a part / the generator), `updateEvac`, `doBlackout`, `reportBody`, `cameraEntries`, `checkLastStand`, `makeGhost`, `emote` (EMOTES),
  `timeline` (`log()`, the recap), `sightOf(brain)` (Pitch Black / Blackout), meetings (`callMeeting` → `startMeeting(caller, body)` → `updateMeeting` → `endMeeting`,
  `youSay`, `vote`, `voters()`, `candidates()`, `quarantine`), timer (`clock()` is frozen during meetings), win check.
  You are "P1" in speech (`name()`). Emits `chase` and `you-died` too, and v3 `camera`, `last-stand`, `power`, `part-fitted`,
  `blackout` (true/false), `lightning`, `ghost`.
- `game/BotBrain.js`: bot AI (wander, hunt, refill, run/chase, suspicion + remembered evidence from
  clues/signs/Cures/shots; humans with a Gun or Cure hunt suspects and never waste them on someone they trust;
  humans call meetings; starving infected hunt recklessly; infected stage fake duels; cured bots forget; the
  cell holds them still) and meeting talk (`hear`, `speak`, `castVote`: humans share evidence, infected lie
  and frame). v3: parts / generator / evac / body reports / breaker errands (ERRANDS modes, `arrive` uses the station),
  `pickCall`, `noteCalled`, `seeEmote`, `speakUp` (emotes). DIFFICULTY: think speed, aggression, accept, card smarts, sight, hunt/lurk, sign noticing,
  zombieUse, gunNerve, cureNerve, voteNerve, callNerve, fakeDuel, task, sabotage, bluff.
- `side/Actor.js`: a survivor (sprite, tag, walk/climb controller, `visor` face image synced every `postupdate` in `sync()`:
  follows frame, flip, scale, rotation, alpha; `pose` 'duel' replaces idle, `down()` for bodies, `setExpression`, `squash` on
  landing/grabbing a ladder/turning, `ghostly` wobble). Session `updateFaces` picks poses and faces only from states every
  player can be in (chase, duel, challenge, emote; never hunger or role). Never call Math.random in Actor: the sim seeds it. `side/Navigator.js`: floor-to-floor routes via ladders.
- `scenes/ResultScene.js`: winning team, your result, ★ top player, every player's role, stats and score; an ⓘ per row opens
  `showInfo`: score breakdown (`Match.scoreParts`: cards, time bonus, banked points by reason), duels, actions, how they ended;
  v3 RECAP button (`showRecap`, the Session timeline) and your XP / rank / badges (`recordMatch`, once per match).
- `scenes/MenuScene.js`: your survivor big in the centre (3x sheet, idling, glances around, hops when you change colour or tap it:
  `openLocker()` is where Stage 4's Locker opens), options left/right of it (a grid under it on tall screens): bots (5–14),
  difficulty, match length, v3 modifier and colour (unlocked by rank) (saved in localStorage); rank top-left, sound top-right.
- `scenes/DuelScene.js`: card-table close-up (5s to pick, v3 CALL ZOMBIE / GUN / CURE buttons (Z/G/C) when you have a call left, flip, result lines; cancels cleanly if the duel became invalid).
- `scenes/MeetingScene.js`: meeting overlay: player tiles (in quarantine, gagged, voted, out), chat log, quick-chat buttons, vote buttons, result.
- `scenes/SideUIScene.js`: HUD, role chip (ZOMBIE · HUNGER / CLAW / STARVING, HUMAN · CELL / GAGGED), big timer, score chip (lock icon),
  hand, challenge button + Accept/Run prompt, station button (`ui/ActionButton.js`, Space), chase banner and red heartbeat,
  death / quarantine screen (then the ghost), toasts, prompts (icon + a few words), joystick, film grain (fx=high) / vignette (fx=low);
  v3 power/evac/blackout under the timer as icon + number, emote buttons as 4 round icons (keys 1–4), camera panel, big banners.
- `scenes/SideScene.js` v3: stations drawn (`createStations`, part slots over the generator), `applyShades` (ghost / Blackout /
  Pitch Black), `bigStrike` (lightning reveal); floor names "The Vats / Street Level / The Core / The Labs".
- `audio/Sfx.js`: every sound effect synthesised with Web Audio (no audio files), one shared `sfx` (`sfx.play(name, vol)`,
  `toggle()`, `startAmbient()` a quiet music pad (4 slow minor chords, bass, distant sonar pings; no noise), `ambientDark()` muffles it in the Blackout); unlocks on the first tap/key; saved on/off in localStorage
  (menu: ♪ SOUND or S). Session plays them through `sound(name, at)` (quieter the further away; silent in the sim); DuelScene
  `playResult`, MeetingScene (vote gong, result), SideUIScene (runner heartbeat, last-10s ticks). Dev console: `__sfx.play('gunshot')`.
- `ui/cardArt.js`: card faces/back drawn in code (big numbers with pips; clawed hand, pistol with its bullets, syringe).
  `ui/HandUI.js` (tap a card to read it), `ui/ChallengeButton.js`, `ui/Toasts.js`.
- `ui/HUD.js`: location chip (room name), room banner (big 1.5s, then shrinks into the chip; toasts move down meanwhile),
  FPS (dev or ?fps=1), control hint pills (`done(action)`); exports `FONT`, `UI` colours and `MIN_TEXT` (14).
  `ui/HandUI.js`: bigger cards on touch screens; the fan stays clear of the bottom-right buttons (`centerX`).
- `ui/icons.js`: HUD icons drawn in code (`icon(scene, x, y, name, size, tint)`): walk, climb, map, bolt, exit, dark, lock,
  hello, follow, sus, help, part.
- `game/fx.js`: `fxLevel(game)` ('high' / 'low') and `showFps()`. `game/hints.js`: `needsHint(action)` / `hintDone(action)`.
- `ui/Joystick.js`: floating joystick on the left half of the screen; read `joystick.vector`.
- `shared/constants.js`: ROOMS (names + colours), MIN/MAX_PLAYERS (6/15), infectedCount(),
  15 PLAYER_COLORS, CARD_INFO, RULES.
- `CARDS_POINTS_TIME.txt`: player guide to who gets Guns / Zombie cards / Cures, points, time bonus and every timer
  (keep it in sync with GAME_GUIDE.txt and RULES / POINTS).
- `GAME_GUIDE.txt`: the rulebook (v3.0), written by the designer. Rule changes start there; keep code and README in sync.

## Status
- Phases 0–3.6, the v2 rules and the v3.0 rules are done: a full single-player match vs bots following GAME_GUIDE.txt
  (instant bites, 2-bullet Guns, playable Cures + 30s cell, secret Gun hand-offs, hunger, fake duels, meetings, and the v3
  additions: power + evac, Blackout, cameras, body reports, bluff calls, Last Stand, lightning, emotes, ghosts, recap, modifiers, ranks).
  Balance (sim, 200 matches, normal bots, `lobbyRules` + RULES.powerParts 4 / partPickTime 4s / evacTime 90s):
players  zombies  humans win  zombies win  avg length  time-up  evac win  zombie shot  human shot  bites  voted Z/H  meetings  top player
  -------  -------  ----------  -----------  ----------  -------  --------  -----------  ----------  -----  ---------  --------  ----------
  6        1        45%         55%          3:24        4%       22%       0.8          0.0         2.9    0.1/0.8    1.1       57% human 
  8        1        60%         41%          2:55        5%       28%       0.4          0.0         3.7    0.2/0.7    0.9       61% human 
  10       2        40%         60%          3:36        7%       31%       1.1          0.1         5.4    0.2/1.4    1.6       48% human 
  12       2        50%         50%          3:36        7%       43%       1.1          0.1         6.1    0.3/1.4    1.7       45% human 
  15       3        52%         48%          4:13        15%      42%       1.5          0.3         7.0    0.7/2.0    2.7       42% human
  Next: play-test toward ~50% human wins per lobby (tune `lobbyRules`, parts, evac), then Phase 4 (online multiplayer).
  Look passes (ENHANCE_PROMPT.md): Stage 1 hazmat survivor and Stage 2 readability / frame cost are done. Meeting, duel and
  result screens still have some 11–13 px text and the 8-row results table crowds short (360 px) screens.
  Not in code yet: the v2.5 duel TALK (10s voice/message between the two duelists before the 5s card pick;
  GAME_GUIDE section 4): it comes with online play (Phase 4); DuelScene still goes straight to the pick.
  Skipped for now: Safe Handshake, extra roles (Medic, Detective, Traitor), bots using the cameras.
- All 10 duel tables play the same duel (the README's five table types were dropped to keep it simple).
