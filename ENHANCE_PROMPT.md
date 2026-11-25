# Outbreak Deck: enhancement prompts

Paste ONE stage at a time into Claude Code (a fresh session is fine). Each stage is
self-contained, ends in a working game, and can be committed on its own.
Do them in order: Stage 1 decides how everything after it looks.

---

## Shared rules for every stage (paste these with each stage)

```
Read CLAUDE.md, GAME_GUIDE.txt and README.md first.

Hard rules:
- Do NOT change any game rule, number, card or win condition (shared/ RULES, POINTS,
  match.js logic). This is a look-and-feel pass only. `npm test` must still pass and
  `npm run sim` results must stay the same.
- No image or audio files: all art stays drawn in code at startup (like inkArt.js,
  SideCharacter.js, cardArt.js). Font stays Rajdhani.
- Keep everything original: no names, characters, art or look copied from other games.
- Hidden-role safety: nothing visible during a match may hint at someone's role.
  Infected-only visuals appear only after a reveal (a bite, the results screen, the recap).
- It must run well on a mid-range phone: target 60 FPS, keep the `?fx=low` path cheap.
- When done: verify in the browser preview (start a match, walk, climb, duel, meeting,
  results), take screenshots, and update CLAUDE.md and README.md to match.
```

---

## Stage 1: new character, the hazmat survivor

```
Replace the stick-figure survivor in client/src/side/SideCharacter.js with a chunky,
cute-but-creepy survivor in a hazmat suit with a big glowing visor.

Design:
- Big rounded helmet with a wide visor (about 40% of the body height), short rounded
  body, short arms and legs, small backpack. Readable as a silhouette at phone size.
- The visor is the face: draw simple expressions on it as glowing shapes:
  neutral, scared, angry, happy, suspicious. Pick the expression from game state
  (scared when chased or in a duel, angry when starving is NOT allowed since it would
  reveal the role: only use states every player can have). Emotes (1-4) set it briefly too.
- Keep the player's neon accent colour (PLAYER_COLORS) on the visor glow and suit trim.
- Keep all animations: walk 8, idle 2, climb 4 frames, plus a new 'duel' pose and a
  'down' pose for bodies. Add slight squash and stretch on landing and turning.
- Build it from named LAYERS so later stages can swap parts: suit, trim, visor,
  helmet-top (hat slot), backpack. Each layer is drawn by its own function that takes
  a style id. Today every slot has only the 'default' style.
- Ghosts (out players) use the same shape, see-through, with a floating wobble.
- Infection signs (pale tint while recovering, the green starving flare) must still
  work and stay as subtle as now.
- Update the meeting tiles (MeetingScene) and result rows (ResultScene) to show a small
  portrait of each player's helmet + visor instead of a plain dot.
```

---

## Stage 2: brighter, cleaner, less text

```
Make the game easier to read on a phone without losing the "ink & neon" style.

- Your own room: raise the brightness and contrast so characters pop against the walls.
  Neighbour rooms stay dim, far rooms stay dark (keep the hiding rule).
- Cut on-screen text by about half. Replace hint lines with icons where possible
  (walk/climb hints, "7 DUEL CARDS - 1 CURE", power line). Show control hints only for
  the first match or until the player has done the action once (store in localStorage).
- HUD: bigger timer, bigger role chip, bigger hand cards on phones. Minimum text size
  14 px at a 375 px wide screen.
- Room banner: show it big for 1.5s on entering, then fade to the small chip.
- Menu (MenuScene): put the player's survivor big in the centre, idling, with the
  options around it. This is where the Locker (Stage 4) will open from.
- Check the FPS counter: find out what costs the most frame time (bloom, rain, light
  washes, grain) and make it hold 60 FPS on `?fx=low`.
```

---

## Stage 3: juice (make the big moments feel big)

```
Add impact to the key moments. These are the clips players will share.

- Duel (DuelScene): cards slide in, a 0.4s pause, then a slow 3D-style flip (scale X
  to 0 and back) with a sound hit. Winner card pulses, loser card cracks or fades.
  Short hit-stop (game pauses 80 ms) and a small screen shake on the result.
- Zombie bite: 1s transformation moment for the bitten player only (their screen
  flashes green, visor glitches, heartbeat stops). Other players only see the normal
  duel result, so roles stay hidden.
- Gun shot: muzzle flash, screen shake, the body drops with the 'down' pose, a brief
  slow-motion (0.3s) for players in the same room.
- Cure: a blue ring burst and a shimmer on the cured player.
- Chase: speed lines, the runner's visor shows 'scared', heartbeat already exists.
- Meeting called: siren light sweep across the screen before MeetingScene opens.
- Lightning (bigStrike): stronger white flash with hard shadows for one frame.
- Results: winning team's survivors line up and do a victory pose; the top player
  stands in front under the star.
- Every effect respects `?fx=low` (keep shakes and flips, drop particles and blur).
```

---

## Stage 4: cosmetics system and the Locker

```
Build the cosmetic system (no real payments yet: everything unlocks with XP rank or
an earned coin currency). It must be ready for a store later.

Data:
- New file client/src/game/cosmetics.js: a catalogue of items. Each item has id, slot,
  name, rarity ('common' teal / 'rare' purple / 'epic' gold), price in coins, unlock
  rule (rank, coins, 'season', 'premium'), and the style id the drawer uses.
- Slots: suit, visor, hat, backpack, cardBack, biteFx, shotFx, cureFx, ghost, emote,
  nameplate, resultPose.
- Start with 3-5 original items per slot. Card backs are drawn in client/src/ui/cardArt.js.
- Extend client/src/game/profile.js: owned items, equipped item per slot, coins.
  Earn coins after each match (in recordMatch: e.g. 20 per match + 5 per win + bonus for
  top player). Existing colour unlocks move into this system.

Where cosmetics show:
- Suit, visor, hat, backpack, nameplate: on your survivor all match long.
- Card back: in every duel, seen by both players.
- Bite/shot/cure effects: only when used (bite effect only after the bite).
- Ghost: after you are out. Result pose: on the results screen.
- Bots wear random owned-style items so matches look varied.
- Hidden-role check: no item may look different for humans and infected during a match.

Locker screen:
- New LockerScene opened from the menu. Your survivor stands big in the middle and
  turns slowly. Tabs per slot on the side, items as tiles with rarity colour, price or
  lock reason. Tap to preview on the character, tap again to equip or buy with coins.
- Coin balance in the top corner. Show "NEW" on items unlocked since the last visit.

Do not add real money, ads or loot boxes. Prices are always shown, nothing is random.
```

---

## Stage 5: store layout (ready for later payments)

```
Turn the Locker into a store layout, still using only earned coins for now.

- Tabs: FEATURED (4 items that rotate daily, seeded from the date) - SEASON - BUNDLES -
  CARD BACKS - EFFECTS - LOCKER (what you own).
- SEASON tab: a 30-level track using existing XP. Free row + premium row. The premium row
  shows as locked with "Coming soon" (no payment code).
- Keep a clean boundary: one module (client/src/game/store.js) decides prices and
  ownership, so a real payment provider can plug in later without touching the scenes.
- Add a second currency field (gems) to profile.js, always 0 for now, not shown until
  payments exist.
- No ads, no timers that limit play, no random rewards.
```

---

### Tips
- Run each stage, play a match yourself, then commit before starting the next one.
- If a stage feels too big, ask Claude to do it in two halves.
- After Stage 1, take a screenshot: if the character isn't loveable yet, iterate on it
  before moving on. Everything else depends on it.
