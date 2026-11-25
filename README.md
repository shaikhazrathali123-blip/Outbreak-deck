# 🧟 Outbreak Deck

> A 2D side-view multiplayer survival card game for mobile and web.
> Trapped in an abandoned research facility, players duel with cards to survive while a hidden infection spreads from player to player.
> Trust no one. Every duel could be your last as a human.

**Platform:** Android (first), iOS (later), web browser
**Genre:** Social deduction + card strategy + survival
**Players:** 6–15 per match (single-player vs bots also available)
**Match length:** 5–8 minutes
**Built with:** JavaScript only (Phaser 3, Node.js, Colyseus, Capacitor)

---

## 📖 Table of Contents

1. [Game Overview](#-game-overview)
2. [Story & Setting](#-story--setting)
3. [Roles](#-roles)
4. [Game Rules](#-game-rules)
5. [Cards](#-cards)
6. [Duel Tables](#-duel-tables)
7. [Map & Rooms](#-map--rooms)
8. [Facility Events](#-facility-events)
9. [Win Conditions](#-win-conditions)
10. [Controls](#-controls)
11. [Tech Stack](#-tech-stack)
12. [Project Structure](#-project-structure)
13. [Development Phases](#-development-phases)
14. [Monetization Plan](#-monetization-plan)
15. [Launch Checklist](#-launch-checklist)
16. [Risks & Solutions](#-risks--solutions)
17. [Working with Claude Code](#-working-with-claude-code)

---

## 🎮 Game Overview

Outbreak Deck combines three things players love:

| Element | Inspired by | In Outbreak Deck |
|---|---|---|
| Social deduction | Among Us, Werewolf | Hidden infected players bluff and lie |
| Card strategy | Poker, War | 1v1 card duels decide who gets infected |
| Survival horror | Zombie games | Infection spreads, the facility gets darker and smaller |

**Core loop:**

```
Explore map → Find a player → Challenge to a duel → Win or lose cards / get infected
     ↑                                                                    ↓
     └──────── Refill cards, use special cards, survive events ←──────────┘
```

Every match starts with mostly humans and ends with either a few survivors or a full outbreak.

---

## 🏚 Story & Setting

In 2031, the **Helix Research Facility** went silent overnight. You wake up inside with no memory of how you got there. The doors are sealed. A voice on the speakers announces:

> *"Welcome, subjects. One among you carries the strain. Play the cards. Survive the timer. The doors open at zero."*

Every player has a deck of strange cards marked with the facility's symbol. The only way to survive is to win duels, find the cure and expose the infected before it is too late.

**Mood:** dark, neon-lit sci-fi lab with flickering lights, warning sirens and glowing green infection effects.

---

## 👥 Roles

At the start of each match, roles are secretly assigned.

### 🧍 Human
- The majority role.
- Goal: get rid of every zombie (shoot, cure or vote them out), or still outnumber the zombies when the timer ends.
- Can see only their own role.

### 🧟 Infected
- Starts as 1 player (6–8 players), 2 players (9–12 players) or 3 players (13–15 players).
- Goal: bite every human, or outnumber the humans when the timer ends.
- Can see other infected players (green outline only they can see).
- Looks exactly like a human to everyone else at first.

### 🩺 Medic (optional role, Phase 5, idea)
- One human may be secretly assigned as Medic.
- Idea: always starts with a Cure (still only one Gun **or** Cure, like everyone).

### 🕵️ Scout (optional role, Phase 5, idea)
- One human may be a Scout.
- Idea: always starts with a Gun (still only one Gun **or** Cure, like everyone).

> These roles are not built yet and must follow the rulebook ([`GAME_GUIDE.txt`](GAME_GUIDE.txt)) when they are.

---

## 📜 Game Rules

> **The rulebook is [`GAME_GUIDE.txt`](GAME_GUIDE.txt) (v3.0).** If anything here disagrees with it, the guide wins. This section is a short summary.

### 1. Match setup
1. 6–15 players: today you play against 5–14 bots; online rooms with 6-letter codes come in Phase 4. Each player gets one of 15 neon colours.
2. Names and skins come with online play (bots are P2, P3…; you are P1).
3. Roles are assigned in secret.
4. Each player receives **7 cards** from a shuffled deck. **Some humans start with a Gun** (v3: 50% / 20% / 40% / 45% of the humans at 6 / 7–8 / 9–12 / 13–15 players, rounded); the others start without one. 4 generator parts are hidden around the facility. Zombies never get a Gun or a Cure; a human gets one of them at most.
5. Players spawn spread across the **Central Hall**, and a role card tells each player their secret role (infected players also see who their allies are).
6. The match timer starts (default: **6 minutes**).

### 2. Moving around
- Players move freely around the facility.
- Each player can see only a limited area around them (vision radius).
- Doors, vents and hallways connect rooms.

### 3. Challenging a player
- Walk close to another player. A **⚔ Challenge** button appears.
- Tap it to send a challenge.
- The other player has **5 seconds** to **ACCEPT** or **RUN**. No answer = run.
- **Running starts a chase:** after a ~1 second head start, the challenger has **8 seconds** to catch the runner. The chaser is slightly faster. **Touching the runner forces the duel.** If the runner gets away (ladders help), neither can be challenged for a few seconds.
- If accepted, both players walk to the nearest **Duel Table** automatically and the duel begins.

### 4. Duel outcomes

Both players pick one card in 5 seconds; both flip at once (see **Cards** below).

| Cards played | Result |
|---|---|
| Number vs Number | Higher number wins and **takes the loser's card**. Same number = draw. |
| Zombie vs Number | Zombie wins: the human is **bitten and turns at once** (a Cure in their hand does **not** help) |
| Gun vs anything else | Gun wins: that player is **shot** and out of the match, **human or zombie**. Uses 1 of the Gun's 2 bullets; the shot is announced (no stun since v3) |
| Cure vs Zombie | No bite; the zombie is **cured**; the Cure user spends **30 seconds in quarantine** |
| Cure vs Number | Against a zombie: the zombie is cured but wins the duel (Cure user to quarantine). Against a human: the Cure is **wasted** and you lose |
| Same special vs same special | Draw, cards go back (Gun vs Gun: each Gun still uses a bullet) |
| Infected vs Infected | A **fake duel**: it looks like any duel from outside, but both keep their cards |

**Bluff call (v3, once per match):** before picking, name the card your opponent will play (Zombie, Gun or Cure). Right: that card is cancelled, you win the duel and get +15. Wrong: −10 and the duel plays out as normal.

**Clue:** when a human beats an infected player **with a number card**, they get a private hint like *"Your opponent's hands felt cold..."*, and the infected is **stunned for 12 seconds** (can't move or duel). A human who beats another human gets the same kind of hint 1 time in 8, so a clue is never proof.

**Shot players** fall to the floor where everyone can see them. Everyone is told who fired, but **never the target's role**.

### 5. Bitten: you turn at once
- A Zombie card **bites** you and you are a zombie **right away**: you grow a Zombie card and see the other zombies. Nobody else is told.
- Holding a **Cure does not protect you**: you can't cure yourself. The only way to stop a bite is to **play** your Cure in that duel.
- Any **Gun or Cure** you hold is taken away and given **secretly** to a random other human who holds neither (or back to the refill supply if nobody can take it). No announcement, no hint.

### 5b. Hunger
- Hunger only runs while a zombie **holds a Zombie card**: once it grows they must use it within **20 seconds**.
- After that they are **STARVING** (one state, v3): every 20 seconds a hungry growl from their room is announced and they flare bright green for a moment (only people who can see them notice). A bite feeds them: no hunger until the next card grows.
- The Zombie card regrows after one fixed time per lobby size (v3): 75s / 45s / 65s / 95s at 6 / 7–8 / 9–12 / 13–15 players.

### 5c. Cures and the 30-second quarantine
- **A cured zombie** becomes human, loses all Zombie cards, stops being hungry and forgets the other zombies. They are **gagged for 30 seconds** (no quick-chat, no votes) and **recovering for 20 seconds** (pale tint, can't be bitten). They are not told who cured them.
- **The Cure user** goes to the quarantine cell for **30 seconds**: can't move, duel, call a meeting, chat or vote, can't be bitten or voted out, and still counts as a human. Everyone sees "a player was quarantined", with no reason. A wasted Cure (on a human) means no quarantine.
- Zombies can never hold Guns or Cures (not from the deal, a refill, or a hand-off). A human holds **one** of them at most: a Gun **or** a Cure, never both.

### 6. Running out of cards
- If you have no cards at all, you are **Exhausted** (a Cure counts as a duel card now).
- Exhausted players can't challenge or be challenged.
- Go to a **card refill** (Supply Room, Storage or Cafeteria) to refill to 4 cards (takes 5 seconds of standing still).

### 7. Cooldowns
- After a duel, both players have a **10-second cooldown** before they can duel again.
- This stops players from spam-challenging.

### 8. Emergency meetings and voting
- Any player can press the **🚨 Emergency Button** in the Central Hall: **once per player per match**, not in the first 30 seconds, and not within 30 seconds of the last meeting.
- Everyone still in the match is pulled into the hall (Cure users stay in the cell). **The match clock pauses** (and so do hunger, quarantine and gag timers, cooldowns and stuns).
- **30 seconds of discussion** with quick chat: *Accuse X*, *Vouch for X*, *I'm clean*, *Skip*. Anyone can lie; "I'm clean" is only a claim. Gagged players can't chat or vote.
- **15 seconds of voting**: vote for a player or skip.
- The player with the most votes is **Quarantined** (locked in the Quarantine Cell, out of the match, can still watch). Their role is **not revealed**.
- A tie, or as many skips as top votes = nobody is quarantined. A player inside the 30-second cure quarantine can't be voted out.
- **Body reports (v3):** standing next to a shot body you can REPORT it: that calls a meeting without using your Emergency Button (once per body, meeting cooldowns still apply).

### 9. v3: Restore Power, Blackout, cameras, Last Stand
- **Restore Power:** pick up the 4 generator parts (stand still 4s), fit them at the generator in the Reactor (4s, +10 each). Everyone sees who carries a part; zombies can hide one. All 4 = the **evac truck** reaches the Entrance 90s later: more humans than zombies inside = humans win.
- **Blackout:** once per match a zombie at the breaker (Server Room) darkens every room for humans for 15s.
- **Security cameras** (Lobby): the last 5 room entries.
- **Last Stand:** the last human gets a 1-bullet Gun and sees the zombies glow red for 5s.
- **Lightning** every 90s lights every room for a moment. **Emotes** (HELLO, FOLLOW ME, SUS!, HELP!). Out players walk on as **ghosts**. The results screen has a **match recap**, XP, ranks and badges. The menu has **modifiers** (Daily, Double Guns, Pitch Black, Fast Claws, Extra Cures) and unlockable colours.
- Bots talk too: humans share their evidence (clues, Cure saves, signs, suspicious shots); infected lie, counter-accuse and frame humans.

---

## 🃏 Cards

Only **four kinds** of card, so anyone can learn them in a minute. The tension comes from the chase, the dark rooms and guessing who to trust.

| Card | Who has it | What it does |
|---|---|---|
| **1 – 9** | Everyone | Duel power. Higher number wins. |
| 🧟 **Zombie** | Infected only | Beats **any** number card and **bites** the loser: they turn **at once**. A zombie holds **one** at most. Used up when played; the next one grows **75 seconds** later, **+20s for every other living zombie** (so bites don't snowball). A new zombie grows their first one the same way. |
| 🔫 **Gun** | Humans only, rare (3 per deck); a Gun **or** a Cure, never both | **2 bullets.** Kills whoever you play it on, **human or zombie**. Every shot is announced (shooter's name, never the target's role); the shooter is stunned 8 seconds. |
| 💉 **Cure** | Humans only, rare (3 per deck); a Gun **or** a Cure, never both | **Play it** on a zombie to cure them (on a human it is wasted). It never protects its holder: you can't cure yourself. Curing a zombie costs you 60 seconds in quarantine. |

- Each player starts with **7 cards** from a shuffled deck (four of each number 1–9, plus Guns and Cures; big lobbies use extra decks).
- Zombie cards are never in the deck: only infected players grow them.

---

## ⚔ Duel Tables

There is one kind of duel: talk for 10 seconds (voice or message, only the two duelists; online play only, not built yet), then pick a card in 5 seconds, flip, see the table above. The 10 duel tables (glowing blue, marked **DUEL**) are spread over all 4 floors so a challenge never needs a long walk. *(The earlier idea of five table types, such as Bluff Bet and Memory Match, was dropped to keep the game simple.)*

---

## 🗺 Map & Rooms

> **Size:** built for up to **15 players**: 15 rooms on 4 floors (one room per player), 9 ladders, **10 duel tables** (up to 7 duels at once with 15 players) and 3 card-refill points.
>
> **View:** the game is a **side-view cutaway** in an **ink & neon** style: you see the Helix facility from the side, like a building with its front wall removed. Walk left/right, climb **ladders** between floors. Only the room you're in is lit, so you can't see who is in a dark room until you walk in.
>
> ```
> Floor 3  |  Lab 1  |  Research Lab  |  Lab 2  |  Storage  |
> Floor 2  |  Medbay |      Central Hall         | Cure Lab  |
> Ground   | Entr. | Lobby | Locker Room |  Supply Room     |
> Basement | Server Room |  Cafeteria  | Reactor | Quarantine |
> ```
> Ladders: Server Room-Lobby, Cafeteria-Locker Room, Reactor-Supply Room, Lobby-Medbay, Locker-Hall, Supply-Cure Lab, Medbay-Lab 1, Hall-Research Lab, Cure Lab-Storage.
>
> **Basement rooms:** Server Room (security cameras, planned), Cafeteria (2 duel tables + a card refill), Reactor (the 2 pressure pads for Reactor Meltdown, planned), Quarantine Cell (where voted-out players go for good, and Cure users spend their 60 seconds).
>
> **Emergency Button:** Central Hall. The Medbay and Cure Lab are normal rooms (no stations).
>
> **Duel tables (10):** Central Hall ×2, Cafeteria ×2, Lobby, Locker Room, Lab 2, Storage, Server Room, Reactor.
>
> **Card refills:** Supply Room, Storage and Cafeteria.
> Layout lives in `client/src/side/facility.js`.

In game, press **M** (or tap the small map) to open the full building map with a legend.

---

## 🌩 Facility Events

*Planned for Phase 5, not in the game yet.* Random events happen during each match to keep things tense. One event triggers every 60–90 seconds. They will be adjusted to the rulebook when they are built.

### 🌑 Lights Out
- *Built in v3 as the zombies' **Blackout** (once per match, 15s, at the breaker). The random event below stays an idea.*
- The whole facility goes dark for 30 seconds.
- Humans' vision shrinks to a tiny circle.
- Infected players keep normal vision.
- (The old Flare card idea was dropped with the four-card set.)

### 🔒 Lockdown
- 2–3 random rooms seal shut for 45 seconds.
- Anyone inside is trapped together.
- Forces players into close contact.

### ☢ Reactor Meltdown
- An alarm sounds. 2 players must stand on the reactor buttons within 40 seconds.
- If they fail, everyone loses 2 cards.

### 💊 Cure Lab Opens
- Happens once per match, at the 3-minute mark.
- 3 players must stand inside the Cure Lab together for 10 seconds.
- If all 3 are human → **Humans win instantly**.
- If any of the 3 is infected → the cure fails and **everyone in the room gets infected**.
- High risk, high reward. Who do you trust?

### 📻 Broadcast
- The speakers reveal a random true fact, for example *"There are 3 infected among you"* or *"Someone in the Cafeteria is infected."*

---

## 🏆 Win Conditions

| Team | Wins if… |
|---|---|
| 🧍 **Humans** | Every zombie has been shot, voted out or cured |
| 🧍 **Humans** | v3: the power is restored and, when the evac truck arrives, more humans than zombies stand in the Entrance |
| 🧍 **Humans** | The timer hits 0 and humans are the bigger team, or it is a tie (a Cure user in the cell counts) |
| 🧟 **Infected** | Every human has turned, been shot or been voted out |
| 🧟 **Infected** | The timer hits 0 and there are **more zombies than humans** left |

**Top player (secret points):** each player also has a secret score: card points in hand (number = its value, Gun 10 per bullet left, Cure 30, Zombie 0) + banked points (every Gun shot on a zombie +40 net, on a human −20 net, bite +15, wasted Cure −10 more; v3: number duel won +5, part fitted +10, vote that helped your team +20 / hurt it −10, bluff call right +15 / wrong −10, a zombie never accused +25 at the end, the Last Stand human making it +50) + a time bonus (+10 per full minute in your current role, back to 0 when you are bitten or cured). Curing a zombie costs the Cure (−30), wasting it costs −40. You see only your own score; all are revealed on the results screen, where the highest score gets the ★. Shot or voted-out players keep the score they had.

**Rewards after each match (v3):**
- XP = your score (at least 0) + 50 for a win, saved on this device. Ranks: Rookie, Orderly (300), Researcher (800), Specialist (1600), Director (3000); each unlocks 3 more neon colours.
- Badges: Detective, Silent Killer, Sharpshooter, Engineer, Mind Reader, Survivor.
- A match recap timeline. (Coins and cosmetics: later.)

---

## 🕹 Controls

| Action | Mobile | PC |
|---|---|---|
| Move | Left on-screen joystick (left/right) | A/D or arrow keys |
| Climb ladder | Push joystick up/down at a ladder | W/S or arrow keys |
| Map | Tap the map | M |
| Challenge | ⚔ button | E |
| Accept / run from a challenge | ACCEPT / RUN buttons | Y / N |
| Look at a card | Tap card in hand | 1–9 keys |
| Use a station (meeting, report, part, generator, breaker, cameras) | Round button next to ⚔ | Space |
| Bluff call in a duel | CALL buttons | Z / G / C |
| Emotes | Buttons on the right edge | 1–4 |
| Meeting chat and vote | Tap a player, then a quick-chat or VOTE button | Mouse |

---

## 🛠 Tech Stack

Everything is JavaScript.

| Part | Tool | Why |
|---|---|---|
| Game engine | **Phaser 3** | Best free 2D JavaScript game engine |
| Build tool | **Vite** | Fast development server |
| Maps & art | **Drawn in code** (`client/src/side/`, `client/src/ui/cardArt.js`) | No image files; edit the layout in `facility.js` |
| Multiplayer server | **Node.js + Colyseus** | Built for real-time multiplayer games, room system included |
| Database | **Firebase** or **Supabase** | Player accounts, coins, skins |
| Mobile app | **Capacitor** | Turns the web game into Android/iOS apps |
| Ads | **Google AdMob** (via Capacitor plugin) | Rewarded ads |
| Hosting | **Railway**, **Render** or **Fly.io** | Cheap Node.js server hosting |
| Version control | **Git + GitHub** | Save progress and undo mistakes |
| Art | **Drawn in code** ("ink & neon") | All art is made at startup: no asset packs (the hazmat survivor too) |

---

## 📁 Project Structure

```
outbreak-deck/
├── CLAUDE.md                  # Notes for Claude Code (summary + code map)
├── GAME_GUIDE.txt             # The rulebook (v2.1): the code follows it
├── README.md                  # This file
├── package.json
├── vite.config.js
├── client/                    # The game (Phaser 3 + Vite)
│   ├── index.html
│   └── src/
│       ├── main.js            # Game config and startup
│       ├── scenes/
│       │   ├── BootScene.js   # Builds the textures
│       │   ├── MenuScene.js   # Title, bots, difficulty, match length
│       │   ├── SideScene.js   # The world: building, lights, weather, camera
│       │   ├── SideUIScene.js # HUD, hand, buttons, prompts
│       │   ├── DuelScene.js   # Card duel close-up
│       │   ├── MeetingScene.js# Emergency meeting and voting
│       │   └── ResultScene.js # Winners, roles and stats
│       ├── game/
│       │   ├── Session.js     # One match: players, duels, chases, cures, meetings
│       │   └── BotBrain.js    # Bot AI + DIFFICULTY table
│       ├── side/              # Facility layout, ink art, characters, map
│       └── ui/                # Hand, buttons, toasts, joystick, card art
├── shared/                    # Rules code with no Phaser (the server will reuse it)
│   ├── constants.js           # Rooms, colours, card info, RULES numbers
│   ├── cards.js               # Deck, card kinds
│   ├── duel.js                # Which card wins
│   └── match.js               # Match state and every rule
├── tests/
│   └── rules.test.js          # npm test
└── (later) server/ and android/  # Phase 4 (Colyseus) and Phase 6 (Capacitor)
```

---

## 🚀 Development Phases

Each phase ends with something you can **play and test**. Don't start the next phase until the current one works.

---

### Phase 0: Setup
**Time:** 1 day
**Goal:** a working empty project.

**Tasks:**
- [x] Install Node.js (LTS version)
- [ ] Install Git and create a GitHub account
- [ ] Install Claude Code
- [ ] Install Tiled map editor
- [x] Create the project folder with Phaser 3 + Vite
- [x] Create `CLAUDE.md` with the game rules from this README
- [ ] First git commit

**Claude Code prompt:**
> Set up a Phaser 3 + Vite JavaScript project called outbreak-deck using the folder structure in README.md. Initialize git. Create a CLAUDE.md summarizing the game rules from README.md. Show a black screen with the text "Outbreak Deck" to confirm it works.

**✅ Done when:** you run `npm run dev`, open the browser and see "Outbreak Deck".

---

### Phase 1: Map and Movement
**Time:** 1–2 weeks
**Goal:** walk around the facility.

**Tasks:**
- [x] Design the Helix Facility map in Tiled (9 rooms, walls, doors)
- [x] Load the map in `GameScene`
- [x] Add a player character with walk animations (4 directions)
- [x] Wall collisions
- [x] Camera follows the player
- [x] Vision radius (dark outside a circle around the player)
- [x] Keyboard controls for PC
- [x] On-screen joystick for mobile
- [x] Room name shown at the top when entering a room
- [x] Simple placeholder art (colored shapes are fine)

**Claude Code prompts:**
> Create a top-down tilemap for a 9-room research facility using placeholder tiles, matching the room layout in README.md. Load it in GameScene with wall collisions.

> Add a Player class with 4-direction movement, keyboard controls and a mobile virtual joystick. Make the camera follow the player and add a vision radius effect.

**Testing checklist:**
- [x] Player can't walk through walls
- [ ] Joystick works on a phone (open the dev server URL on your phone over Wi-Fi)
- [ ] Game runs at 60 FPS

**✅ Done when:** you can walk through all 9 rooms on PC and phone.

---

### Phase 2: Cards and Duels
**Time:** 1–2 weeks
**Goal:** a working card duel against a dummy player.

**Tasks:**
- [x] `DeckSystem`: create a deck with 4 suits × 10 numbers + special cards, shuffle and deal
- [x] `HandUI`: show 7 cards at the bottom of the screen
- [x] Place Duel Tables in the map (with colors for challenge types)
- [x] A dummy character that stands still
- [x] Challenge button appears when near another character
- [x] `DuelScene` overlay opens when a duel starts
- [x] **High Card** challenge with suit advantage (+3)
- [x] Card win/loss: winner takes 1 card
- [x] `InfectionSystem`: infected winner infects the loser
- [x] Vaccine card blocks infection
- [x] Duel cooldown (10 seconds)
- [x] Exhausted state at 0 cards + Supply Room refill

**Claude Code prompts:**
> Create a DeckSystem with 4 suits (Blade, Shield, Toxin, Mind), values 1–10, plus special cards from README.md. Deal 7 cards to the player and show them with a HandUI at the bottom of the screen.

> Add a Challenge button when the player is near another character. When pressed, open a DuelScene overlay running the High Card challenge with suit advantage rules from README.md. Apply card loss and infection results.

**Testing checklist:**
- [x] Suit advantage math is correct (write unit tests for `duel.js`)
- [x] Infection and Vaccine work
- [x] Hand updates correctly after each duel

**✅ Done when:** you can duel a dummy and see infection happen.

---

### Phase 3: Bots and Full Single-Player Match
**Time:** 2 weeks
**Goal:** a complete match against bots.

**Tasks:**
- [x] `Bot` class: wanders between rooms using pathfinding
- [x] Bots challenge nearby players and accept/decline challenges
- [x] Bot difficulty levels (easy, normal, hard)
- [x] Infected bots act normal and target humans (they lie low for a while after each infection)
- [x] Role assignment at match start
- [x] Match timer (6 minutes) in the HUD (4 / 6 / 8 minutes in the menu)
- [x] Special cards working: Scanner, Swap, Freeze, Decoy, Wild (Flare waits for the Lights Out event in Phase 5)
- [x] Infected-only cards (Spore, Mask, Rumor)
- [x] Infection visual signs (green tint, twitch, glowing footprints)
- [x] Clue messages for humans
- [x] Win/lose `ResultScene` with stats
- [x] Main menu with "Play vs Bots" button

**Claude Code prompts:**
> Create a Bot class with pathfinding between rooms. Bots should challenge players nearby, accept or decline challenges, and infected bots should prefer targeting humans. Add easy, normal and hard difficulty.

> Add role assignment, a 6-minute match timer, all special cards from README.md, infection visual signs, and a ResultScene that shows the winning team and stats.

**Testing checklist:**
- [x] Bots don't get stuck in walls (side view: bots walk floors and climb ladders)
- [x] Full match runs from start to result screen
- [x] Both teams can actually win (test matches with 7 normal bots: humans held out to 6:00; infected won at 5:26). Tune in `client/src/game/BotBrain.js` → DIFFICULTY
- [ ] Play 10 matches and note anything boring or unfair

**✅ Done when:** you have a fun, complete single-player game. **Show it to friends here and get feedback.**

---

### Phase 3.5: Simple Cards and Chases
**Goal:** easy to learn, tense to play.

**Tasks:**
- [x] Cut the cards down to four kinds: numbers 1–9, Zombie, Gun, Cure (suits and the other special cards removed)
- [x] Zombie cards: infected-only, grow back every 40 seconds (max 2)
- [x] Gun kills a zombie, misfires against a number; humans also win by shooting every zombie (changed in v2: see below)
- [x] Declining becomes a chase: 8 seconds to catch the runner, touching forces the duel
- [x] Red heartbeat when you're being chased; shot players drop to the floor
- [x] Bots run, chase, play Zombie cards and use Guns on players they strongly suspect

**✅ Done when:** a new player understands the cards from one look at their hand.

---

### Phase 3.6: The Mind Game
**Goal:** turn the duel game into a mind game. Humans get information and time; zombies get places to hide but lose their safety.

**Tasks:**
- [x] Emergency meetings: Emergency Button, 30s quick-chat discussion, 15s vote, Quarantine Cell (`MeetingScene`)
- [x] Bots talk in meetings (evidence, denials, lies, framing) and vote on their suspicion
- [x] Blood Test booth in the Medbay; public Clean badge for 60 seconds; positives are announced
- [x] Incubation: bitten humans turn after 45 seconds; Cure Lab machine (recharges 60s) or a Cure card saves them
- [x] Gun misfires are public and stun the shooter for 12 seconds
- [x] Hunger: infected must bite every 90 seconds or start STARVING (a growl every 40s + a short green flare)
- [x] Fake duels between infected players (they keep their cards)

**Starting numbers for playtesting** (all in `RULES`): incubation 45s, Clean badge 60s, hunger 90s, Zombie regrow 40s. Target ~50% human wins. If zombies win too much, make incubation longer or hunger shorter; if humans win too much, do the opposite.

**Later (after the core 5 work):** Safe Handshake, extra roles (Medic, Detective, Traitor), an end-of-match recap (the easy, fun first extra).

---

### Rules v2 – v2.5 (GAME_GUIDE.txt)
**Goal:** one clear rulebook. `GAME_GUIDE.txt` is now the source of truth; the code follows it.
v2.1 added: one Gun **or** Cure per human, no self-cure, and the bigger team wins at time-up.
v2.2 added: a zombie holds **one** Zombie card and bites at most once per 40s (new zombies wait 40s for their first card); starving after 60s without a bite.
v2.3 added: secret points and a ★ top player (see Win Conditions); the team result still decides the match.
v2.4: the Zombie card regrows in **75s + 10s per other living zombie** instead of 40s. The balance simulator (`npm run sim`) showed zombies winning 92–100% with 40s; now humans win about 40% (6 players) to 63% (8 players), ~55–59% in 12–15.
v2.5: duels start with a **10-second talk** (voice or message, just the two duelists); the 5-second card pick starts when it ends. Planned for online play; the bot game skips it for now.
v2.6: hunger only runs while a zombie holds a Zombie card (it used to be 60s since the last bite, shorter than the 75s+ regrow, so every zombie starved every cycle). Hunger 20s, growl every 20s, regrow +20s per other zombie. Sim (200 matches): humans win 36% / 49% / 57% / 64% at 6 / 8 / 12 / 15 players (was 40 / 63 / 59 / 54).

**Changed from Phase 3.6:**
- [x] Bites turn you **at once** (no 45-second incubation); the Cure Lab machine is gone
- [x] Blood Test and Clean badge removed; "I'm clean" is only a claim
- [x] Guns: humans only, **2 bullets**, kill **anyone**; every shot announced without the target's role; shooter stunned 8s (no more misfires)
- [x] Cures: humans only; **played** on a zombie they cure it, on a human they are wasted; holding one never protects you (you can't cure yourself)
- [x] A human holds one special card at most: a Gun **or** a Cure
- [x] Cured zombies: human again, no Zombie cards or hunger, forget their allies, gagged 60s, recovering 20s (can't be bitten)
- [x] Cure users: 60s in the quarantine cell (can't move, duel, chat, vote or be voted out; still a human)
- [x] A bitten human's Gun or Cure goes to a random human holding neither, in secret
- [x] Zombies never get Guns or Cures from the deal or refills; false clues 1 in 8
- [x] Humans win if every zombie is shot, voted out or cured; at 0:00 the bigger team wins (a tie goes to the humans)

**Balance numbers** (all in `RULES`): hunger 20s (only while holding a Zombie card), growl every 20s, 1 Zombie card max, Zombie regrow 75s + 20s per other living zombie, cure quarantine / gag 60s, recovering 20s, shot stun 8s, 2 bullets. Target ~50% human wins.

---

### Rules v3.0 (GAME_GUIDE.txt)
**Goal:** fewer timers, balance per lobby size, and more to do than duel and vote.
- [x] Cure quarantine and gag 30s (were 60s); no shot stun; one STARVING state; Zombie regrow is one number per lobby (`lobbyRules()` in `shared/constants.js`, no more +20s per zombie)
- [x] Balance by lobby size: Gun share and Zombie regrow (`lobbyRules`)
- [x] Restore Power: 4 generator parts, generator in the Reactor, evac truck at the Entrance (`Match.setupParts/pickPart/fitPart/dropPart`, `Session.updateWork/updateEvac`)
- [x] Blackout (breaker, Server Room), security cameras (Lobby), body reports, Last Stand
- [x] Bluff call in duels (`Match.resolveCalls`, DuelScene CALL buttons, `BotBrain.pickCall`)
- [x] New points: number win, part, votes, calls, stealth, Last Stand (`POINTS`)
- [x] Lightning reveal, emotes, ghosts, match recap, modifiers, ranks, badges, colours (`game/profile.js`)
- [x] Bots fit parts, report bodies, go to the evac, cut the power, emote and bluff

**Balance (sim, 200 matches, normal bots):** see CLAUDE.md for the latest table. Tune `lobbyRules`, `RULES.powerParts`, `partPickTime`, `evacTime`.

### Look pass, stage 1: the hazmat survivor
**Goal:** a character people remember, with no rule changes.
- [x] Chunky hazmat survivor (`side/SideCharacter.js`): big round helmet with a wide glowing visor, short body and limbs, small backpack, the player's neon colour on the visor and suit trim
- [x] Built from named layers (suit, trim, visor, helmetTop = hat slot, backpack), each drawn by a style id (only `'default'` so far) for later skins
- [x] Frames: walk 8, idle 2, climb 4 (from behind), duel 2 (card held up at the table), down 1 (bodies on their back)
- [x] The visor is the face: neutral, scared (running away, at a duel), angry (chasing), happy (HELLO / FOLLOW ME), suspicious (SUS!, waiting on a challenge), knocked out (bodies). Only states every player can be in, so a face never gives a role away
- [x] Squash & stretch on landing from a ladder, grabbing one and turning; ghosts float with a see-through wobble
- [x] Meeting tiles and result rows show a small helmet portrait instead of a dot

### Phase 4: Online Multiplayer
**Time:** 3–4 weeks
**Goal:** play with friends on different phones.

**Tasks:**
- [ ] Set up the Node.js + Colyseus server in `/server`
- [ ] `MatchRoom` with room codes (create/join)
- [ ] `LobbyScene`: room code, player list, ready button, host starts match
- [ ] Sync player positions in real time (with smoothing)
- [ ] Move duel, deck and infection logic to the server (**server decides everything** so players can't cheat)
- [ ] Hide secret info: clients only receive their own role and cards
- [ ] Fill empty slots with bots
- [ ] Handle disconnects and reconnects
- [ ] Deploy server to Railway/Render
- [ ] Test with 6+ real players

**Claude Code prompts:**
> Set up a Colyseus server in /server with a MatchRoom that supports 6–15 players and 6-letter room codes. Add a LobbyScene on the client to create or join rooms.

> Move all duel, deck, role and infection logic to the server. The client should only receive its own cards and role. Sync player movement with interpolation.

**Testing checklist:**
- [ ] 2 phones + 1 PC can play in the same room
- [ ] No player can see another player's role or cards (check network messages)
- [ ] Game handles a player leaving mid-match
- [ ] Works on mobile data, not just Wi-Fi

**✅ Done when:** you and your friends play a full match online.

---

### Phase 5: Creative Features and Events
**Time:** 2–3 weeks
**Goal:** make every match tense and different.

**Tasks:**
- [ ] `EventSystem` that triggers random events every 60–90 seconds
- [ ] Lights Out event
- [ ] Lockdown event
- [ ] Reactor Meltdown event
- [ ] Cure Lab event
- [ ] Broadcast event
- [x] Emergency meetings with quick chat and voting (`MeetingScene`, done in Phase 3.6; real text chat comes with multiplayer)
- [x] Quarantine Cell
- [x] ~~Remaining duel challenges~~ (dropped: one simple duel keeps the game easy to learn)
- [ ] Vents for infected
- [ ] Server Room cameras
- [x] ~~Medbay self-scan~~ (the Blood Test was tried in Phase 3.6 and removed in v2)
- [ ] Optional roles: Medic and Scout
- [ ] Host settings: timer length, number of infected, events on/off

**Claude Code prompts:**
> Create a server-side EventSystem that triggers one random event every 60–90 seconds: Lights Out, Lockdown, Reactor Meltdown, Cure Lab and Broadcast, following the rules in README.md.



**Testing checklist:**
- [ ] Each event works in multiplayer
- [x] Voting can't be abused (one vote per player)
- [ ] Balance: humans and infected each win about 45–55% of matches

**✅ Done when:** testers say "one more match!" 🎉

---

### Phase 6: Polish and Launch
**Time:** 2–3 weeks
**Goal:** release on the Google Play Store.

**Tasks:**
- [ ] Final art style (pick one: neon cyberpunk, pixel horror or paper cutout)
- [ ] Character skins (at least 8 colors)
- [ ] Final card art for numbers, Zombie, Gun and Cure
- [ ] Sound effects (footsteps, card flips, infection, alarms)
- [ ] Background music (menu + match)
- [ ] Interactive tutorial (play a short match with explained steps)
- [ ] Settings: sound, music, graphics quality, language
- [ ] Player accounts (Firebase/Supabase): name, XP, coins
- [ ] Report player button + basic chat filter
- [ ] Privacy policy page (required by Play Store)
- [ ] Wrap with Capacitor → Android build
- [ ] App icon, splash screen, store screenshots, trailer video
- [ ] Closed testing on Play Store with friends (required before public release)
- [ ] Public launch 🚀

**Claude Code prompts:**
> Add an interactive tutorial that walks a new player through movement, a duel, special cards and a meeting.

> Set up Capacitor for Android. Make the game fullscreen in landscape mode, handle the back button, and create an Android release build.

**✅ Done when:** your game is live on the Play Store.

---

### Phase 7: Monetization and Growth
**Time:** ongoing after launch
**Goal:** earn money and grow the player base.

**Tasks:**
- [ ] Cosmetic shop: skins, hats, card backs, infection effects
- [ ] Coins earned by playing + coin packs to buy
- [ ] Rewarded ads (AdMob): watch an ad for bonus coins
- [ ] "Remove Ads" one-time purchase
- [ ] Season Pass with monthly rewards
- [ ] Daily login rewards
- [ ] Friends list and "Invite with code" share button
- [ ] Analytics: retention, match length, win rates
- [ ] New maps every few months
- [ ] iOS release

**✅ Done when:** you have daily players and regular updates.

---

### ⏱ Timeline Summary

| Phase | What | Time |
|---|---|---|
| 0 | Setup | 1 day |
| 1 | Map and movement | 1–2 weeks |
| 2 | Cards and duels | 1–2 weeks |
| 3 | Bots and full match | 2 weeks |
| 4 | Online multiplayer | 3–4 weeks |
| 5 | Events and creative features | 2–3 weeks |
| 6 | Polish and launch | 2–3 weeks |
| 7 | Monetization and growth | Ongoing |
| **Total to launch** | | **~3–4 months part-time** |

---

## 💰 Monetization Plan

**Rule #1: never sell power.** Everything paid is cosmetic so the game stays fair.

| Method | How it works | Expected share |
|---|---|---|
| Cosmetic skins and effects | Buy with coins or real money | Biggest |
| Season Pass | Monthly rewards track | High |
| Rewarded ads | Optional ads for coins | Medium |
| Remove Ads | One-time purchase | Small |
| Private custom rooms | Premium for streamers | Small |

**Growth ideas:**
- Free to play, easy invite codes
- Short clips of funny betrayals on YouTube Shorts and Instagram Reels
- Send the game to small and medium Indian gaming YouTubers and streamers
- Discord server for players, feedback and match-making

---

## ✅ Launch Checklist

- [ ] Google Play Developer account (~$25 one-time)
- [ ] Privacy policy URL
- [ ] Content rating questionnaire completed
- [ ] Data safety form completed
- [ ] Closed testing completed (Play Store requires testers for new accounts)
- [ ] App icon (512×512), feature graphic (1024×500), 4–8 screenshots
- [ ] Short and full store description
- [ ] Server deployed and stable
- [ ] Crash reporting set up
- [ ] Original name, art and characters (no copyrighted content from other games or shows)

---

## ⚠ Risks & Solutions

| Risk | Solution |
|---|---|
| Not enough players online | Always fill empty slots with bots |
| Cheating | Server decides all game logic, clients only get their own data |
| Lag on mobile networks | Interpolation, small network messages, servers near India (e.g. Mumbai region) |
| One team wins too often | Track win rates, adjust timers, infected count and card balance |
| Toxic chat | Quick-chat presets, chat filter, report button |
| Project feels too big | Finish one phase at a time, test before moving on |
| Copyright problems | Use original story, names, cards and art |

---

## 🤖 Working with Claude Code

**Workflow for every feature:**
1. Paste the phase prompt into Claude Code.
2. Run the game and test it.
3. Tell Claude exactly what's wrong ("the bot gets stuck in the Cafeteria corner").
4. When it works, ask Claude to commit to git.
5. Tick off the task in this README.

**Tips:**
- Keep `CLAUDE.md` updated with the latest rules so Claude always remembers the design.
- Ask for **one feature at a time**.
- Ask Claude to explain code you don't understand. You'll learn JavaScript along the way.
- Ask for unit tests for important logic (duels, infection, voting).
- If something breaks badly, ask Claude to revert to the last working commit.

---

*Outbreak Deck: trust no one, play your cards, survive the outbreak.* 🧟🃏
