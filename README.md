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
6. [Duel Challenges](#-duel-challenges)
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
- Goal: stay uninfected until the timer ends, or unlock the cure.
- Can see only their own role.

### 🧟 Infected
- Starts as 1 player (6–8 players), 2 players (9–12 players) or 3 players (13–15 players).
- Goal: infect every human before the timer ends.
- Can see other infected players (green outline only they can see).
- Looks exactly like a human to everyone else at first.

### 🩺 Medic (optional role, Phase 5)
- One human may be secretly assigned as Medic.
- Starts with 2 Vaccine cards instead of 1.
- Can cure one infected player per match by winning a duel against them.

### 🕵️ Scout (optional role, Phase 5)
- One human may be a Scout.
- Can use the Scanner card twice instead of once.

---

## 📜 Game Rules

### 1. Match setup
1. 6–15 players join a room using a 6-letter room code. Each player gets one of 15 neon colours.
2. Each player picks a character skin and name.
3. The server secretly assigns roles.
4. Each player receives **7 cards** from a shuffled deck.
5. Players spawn in the **Central Hall**.
6. The match timer starts (default: **6 minutes**).

### 2. Moving around
- Players move freely around the facility.
- Each player can see only a limited area around them (vision radius).
- Doors, vents and hallways connect rooms.

### 3. Challenging a player
- Walk close to another player. A **⚔ Challenge** button appears.
- Tap it to send a challenge.
- The other player has **5 seconds** to accept or decline.
- **Declining costs 1 random card.** You can't run forever.
- If accepted, both players walk to the nearest **Duel Table** automatically and the duel begins.

### 4. Duel outcomes

| Who duels | Winner | Loser |
|---|---|---|
| Human vs Human | Takes 1 card from loser | Loses 1 card |
| Infected vs Human (Infected wins) | Spreads infection | **Becomes Infected** (unless Vaccine) |
| Infected vs Human (Human wins) | Gets a **Clue** (see below) | Infected is **stunned for 15 seconds** |
| Infected vs Infected | Not allowed (they know each other) | — |

**Clue:** When a human beats an infected player, they get a private hint like *"Your opponent's hands felt cold..."* This tells them the player is suspicious, but not 100% confirmed (it has a 20% chance of being a false clue).

### 5. Becoming infected
- When infected, you get a private message: **"You have been infected. Spread the strain."**
- You now play for the Infected team.
- Your character slowly shows **subtle signs** over 60 seconds: slight green tint, small twitch animation, footprints glowing faintly.
- Sharp-eyed players can spot these signs.

### 6. Running out of cards
- If you have **0 cards**, you are **Exhausted**.
- Exhausted players can't challenge or be challenged.
- Go to a **Supply Room** to refill to 4 cards (takes 5 seconds of standing still).

### 7. Cooldowns
- After a duel, both players have a **10-second cooldown** before they can duel again.
- This stops players from spam-challenging.

### 8. Emergency meetings
- Any player can press the **🚨 Emergency Button** in the Central Hall (once per player per match).
- All players are teleported to the hall.
- 45 seconds of chat discussion, then a vote.
- The player with the most votes is **Quarantined** (sent to the Quarantine Cell, out of the match but can still watch).
- Ties = nobody is quarantined.

---

## 🃏 Cards

### Number cards
The deck uses four original suits instead of standard playing card suits:

| Suit | Symbol | Strong against | Theme |
|---|---|---|---|
| **Blade** | 🗡 | Shield | Attack |
| **Shield** | 🛡 | Toxin | Defense |
| **Toxin** | ☣ | Mind | Poison |
| **Mind** | 🧠 | Blade | Intelligence |

- Each suit has cards numbered **1 to 10**.
- **Suit advantage:** if your suit is strong against your opponent's suit, you get **+3** to your card value.
- Example: Blade 5 vs Shield 7 → Blade gets +3 = 8, so Blade wins.

### Special cards
Special cards are shuffled into the deck (about 1 in 8 cards).

| Card | Effect | When to use |
|---|---|---|
| 💉 **Vaccine** | Blocks one infection. Automatically used if you lose to an infected player. | Passive |
| 🔍 **Scanner** | Secretly reveals if a nearby player is infected (90% accurate). | Any time |
| 🔄 **Swap** | Trade one random card with a nearby player. | Any time |
| 🛑 **Freeze** | Target player can't move for 5 seconds. | Any time |
| 👻 **Decoy** | Creates a fake copy of you for 10 seconds to confuse others. | Any time |
| 🃏 **Wild** | Counts as any suit with value 8 in a duel. | During a duel |
| 🔦 **Flare** | Lights up the area around you during Lights Out. | During events |

### Infected-only cards
Infected players get 1 of these at random when infected:

| Card | Effect |
|---|---|
| 🦠 **Spore** | Your next duel win infects the loser even if they have a Vaccine. |
| 🎭 **Mask** | Hides your infection signs for 60 seconds. |
| 📢 **Rumor** | Sends a fake clue about a random human to all players. |

---

## ⚔ Duel Challenges

Every Duel Table in the facility has a **challenge type**. The table's color shows which one it is. This keeps duels fresh instead of always "highest card wins".

### 1. 🔢 High Card (white tables)
- Both players pick 1 card face down.
- Cards flip at the same time.
- Highest value (after suit advantage) wins.
- **Time limit:** 5 seconds to choose.

### 2. 🎲 Bluff Bet (red tables)
- Both players pick 1 card face down.
- Each player then **claims** a value out loud (any number 1–10).
- Each player chooses: **Believe** or **Call Bluff**.
  - Call bluff correctly → you win.
  - Call bluff wrongly → you lose.
  - Both believe → compare real cards.
- Best for liars and infected players.

### 3. 🧠 Memory Match (blue tables)
- 8 face-down cards appear in a grid.
- Players take turns flipping 2 cards to find pairs.
- First to find **2 pairs** wins.
- **Time limit:** 30 seconds.

### 4. ⚡ Reflex Draw (yellow tables)
- Both players place a card.
- A countdown runs: 3… 2… 1… **DRAW!**
- The first to tap gets **+2** to their card value.
- Tapping before DRAW = automatic loss.

### 5. 🤝 Double or Nothing (purple tables, rare)
- Both players put **2 cards** in.
- Total value wins.
- The winner takes **both** of the loser's cards.

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
> **Basement rooms:** Server Room (security cameras), Cafeteria (2 duel tables + a card refill), Reactor (the 2 pressure pads for Reactor Meltdown), Quarantine Cell (where voted-out players go).
>
> **Duel tables (10):**
>
> | Challenge | Colour | Where |
> |---|---|---|
> | High Card | White | Central Hall ×2, Cafeteria |
> | Bluff Bet | Red | Locker Room, Cafeteria |
> | Memory Match | Blue | Lab 2, Server Room |
> | Reflex Draw | Yellow | Lobby, Storage |
> | Double or Nothing | Purple (rare) | Reactor |
>
> **Card refills:** Supply Room, Storage and Cafeteria.
> Layout lives in `client/src/side/facility.js`.

In game, press **M** (or tap the small map) to open the full building map with a legend.

---

## 🌩 Facility Events

Random events happen during each match to keep things tense. One event triggers every 60–90 seconds.

### 🌑 Lights Out
- The whole facility goes dark for 30 seconds.
- Humans' vision shrinks to a tiny circle.
- Infected players keep normal vision.
- A **Flare** card lights up the area.

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
| 🧍 **Humans** | At least 1 human is uninfected when the timer hits 0 |
| 🧍 **Humans** | 3 humans successfully use the Cure Lab |
| 🧍 **Humans** | All infected players are quarantined by voting |
| 🧟 **Infected** | Every human is infected or quarantined |

**Rewards after each match:**
- XP for playing, winning, infecting, surviving and correct votes.
- Coins (used for cosmetics).
- Match stats: duels won, players infected, times bluffed.

---

## 🕹 Controls

| Action | Mobile | PC |
|---|---|---|
| Move | Left on-screen joystick (left/right) | A/D or arrow keys |
| Climb ladder | Push joystick up/down at a ladder | W/S or arrow keys |
| Map | Tap the map | M |
| Challenge | ⚔ button | E |
| Use special card | Tap card in hand | 1–7 keys |
| Use room object | 👆 Use button | F |
| Emergency meeting | 🚨 button (Central Hall only) | Space |
| Chat (meetings only) | Chat box | Enter |

---

## 🛠 Tech Stack

Everything is JavaScript.

| Part | Tool | Why |
|---|---|---|
| Game engine | **Phaser 3** | Best free 2D JavaScript game engine |
| Build tool | **Vite** | Fast development server |
| Maps & art | **Drawn in code** (`client/src/side/`) | No image files; edit the layout in `facility.js` |
| Multiplayer server | **Node.js + Colyseus** | Built for real-time multiplayer games, room system included |
| Database | **Firebase** or **Supabase** | Player accounts, coins, skins |
| Mobile app | **Capacitor** | Turns the web game into Android/iOS apps |
| Ads | **Google AdMob** (via Capacitor plugin) | Rewarded ads |
| Hosting | **Railway**, **Render** or **Fly.io** | Cheap Node.js server hosting |
| Version control | **Git + GitHub** | Save progress and undo mistakes |
| Art | **Kenney.nl**, **itch.io** asset packs, or custom | Free 2D assets to start |

---

## 📁 Project Structure

```
outbreak-deck/
├── CLAUDE.md                  # Game design notes for Claude Code
├── README.md                  # This file
├── package.json
├── client/                    # The game (Phaser)
│   ├── index.html
│   ├── src/
│   │   ├── main.js            # Game config and startup
│   │   ├── scenes/
│   │   │   ├── BootScene.js   # Load assets
│   │   │   ├── MenuScene.js   # Main menu
│   │   │   ├── LobbyScene.js  # Room code, waiting room
│   │   │   ├── GameScene.js   # Main map gameplay
│   │   │   ├── DuelScene.js   # Card duel overlay
│   │   │   ├── MeetingScene.js# Emergency meeting and voting
│   │   │   └── ResultScene.js # Win/lose screen
│   │   ├── objects/
│   │   │   ├── Player.js
│   │   │   ├── Bot.js
│   │   │   ├── Card.js
│   │   │   └── DuelTable.js
│   │   ├── systems/
│   │   │   ├── DeckSystem.js
│   │   │   ├── DuelSystem.js
│   │   │   ├── InfectionSystem.js
│   │   │   └── EventSystem.js
│   │   ├── ui/
│   │   │   ├── Joystick.js
│   │   │   ├── HandUI.js
│   │   │   └── HUD.js
│   │   └── network/
│   │       └── Client.js      # Connects to server
│   └── assets/
│       ├── maps/              # Tiled JSON maps
│       ├── sprites/
│       ├── cards/
│       └── audio/
├── server/                    # Multiplayer server (Node.js)
│   ├── index.js
│   ├── rooms/
│   │   └── MatchRoom.js       # Game logic that runs on the server
│   └── logic/
│       ├── duel.js
│       ├── deck.js
│       └── events.js
├── shared/                    # Code used by both client and server
│   ├── constants.js           # Card values, timers, rules
│   └── rules.js
└── android/                   # Created by Capacitor
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
- [ ] `DeckSystem`: create a deck with 4 suits × 10 numbers + special cards, shuffle and deal
- [ ] `HandUI`: show 7 cards at the bottom of the screen
- [ ] Place Duel Tables in the map (with colors for challenge types)
- [ ] A dummy character that stands still
- [ ] Challenge button appears when near another character
- [ ] `DuelScene` overlay opens when a duel starts
- [ ] **High Card** challenge with suit advantage (+3)
- [ ] Card win/loss: winner takes 1 card
- [ ] `InfectionSystem`: infected winner infects the loser
- [ ] Vaccine card blocks infection
- [ ] Duel cooldown (10 seconds)
- [ ] Exhausted state at 0 cards + Supply Room refill

**Claude Code prompts:**
> Create a DeckSystem with 4 suits (Blade, Shield, Toxin, Mind), values 1–10, plus special cards from README.md. Deal 7 cards to the player and show them with a HandUI at the bottom of the screen.

> Add a Challenge button when the player is near another character. When pressed, open a DuelScene overlay running the High Card challenge with suit advantage rules from README.md. Apply card loss and infection results.

**Testing checklist:**
- [ ] Suit advantage math is correct (write unit tests for `duel.js`)
- [ ] Infection and Vaccine work
- [ ] Hand updates correctly after each duel

**✅ Done when:** you can duel a dummy and see infection happen.

---

### Phase 3: Bots and Full Single-Player Match
**Time:** 2 weeks
**Goal:** a complete match against bots.

**Tasks:**
- [ ] `Bot` class: wanders between rooms using pathfinding
- [ ] Bots challenge nearby players and accept/decline challenges
- [ ] Bot difficulty levels (easy, normal, hard)
- [ ] Infected bots act normal and target humans
- [ ] Role assignment at match start
- [ ] Match timer (6 minutes) in the HUD
- [ ] All special cards working (Scanner, Swap, Freeze, Decoy, Wild, Flare)
- [ ] Infected-only cards (Spore, Mask, Rumor)
- [ ] Infection visual signs (green tint, twitch, glowing footprints)
- [ ] Clue messages for humans
- [ ] Win/lose `ResultScene` with stats
- [ ] Main menu with "Play vs Bots" button

**Claude Code prompts:**
> Create a Bot class with pathfinding between rooms. Bots should challenge players nearby, accept or decline challenges, and infected bots should prefer targeting humans. Add easy, normal and hard difficulty.

> Add role assignment, a 6-minute match timer, all special cards from README.md, infection visual signs, and a ResultScene that shows the winning team and stats.

**Testing checklist:**
- [ ] Bots don't get stuck in walls
- [ ] Full match runs from start to result screen
- [ ] Both teams can actually win
- [ ] Play 10 matches and note anything boring or unfair

**✅ Done when:** you have a fun, complete single-player game. **Show it to friends here and get feedback.**

---

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
- [ ] Emergency meetings with text chat and voting (`MeetingScene`)
- [ ] Quarantine Cell
- [ ] Remaining duel challenges: Bluff Bet, Memory Match, Reflex Draw, Double or Nothing
- [ ] Vents for infected
- [ ] Server Room cameras
- [ ] Medbay self-scan
- [ ] Optional roles: Medic and Scout
- [ ] Host settings: timer length, number of infected, events on/off

**Claude Code prompts:**
> Create a server-side EventSystem that triggers one random event every 60–90 seconds: Lights Out, Lockdown, Reactor Meltdown, Cure Lab and Broadcast, following the rules in README.md.

> Add emergency meetings with a 45-second chat and voting phase, and a Quarantine Cell for voted-out players.

> Add Bluff Bet, Memory Match, Reflex Draw and Double or Nothing duel challenges, selected by the color of each Duel Table.

**Testing checklist:**
- [ ] Each event works in multiplayer
- [ ] Voting can't be abused (one vote per player)
- [ ] Balance: humans and infected each win about 45–55% of matches

**✅ Done when:** testers say "one more match!" 🎉

---

### Phase 6: Polish and Launch
**Time:** 2–3 weeks
**Goal:** release on the Google Play Store.

**Tasks:**
- [ ] Final art style (pick one: neon cyberpunk, pixel horror or paper cutout)
- [ ] Character skins (at least 8 colors)
- [ ] Card art for all suits and special cards
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
| Copyright problems | Use original story, names, suits and art |

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
