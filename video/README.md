# Outbreak Deck: explainer video

A ~3 minute 1080p explainer, drawn entirely in code in the game's ink & neon style
(no image files, no AI video service). Output: `out/outbreak-deck-explainer.mp4`.

## Rebuild it
```powershell
cd video
npm install                                      # @napi-rs/canvas + ffmpeg-static
powershell -ExecutionPolicy Bypass -File voice.ps1   # narration -> audio/*.wav (Windows voice)
node render.js                                   # frames + music + narration -> out/*.mp4
node render.js --stills                          # one PNG per scene in out/stills (quick check)
node render.js --stills --at=gun@4.6,meeting@11   # stills at chosen scene times
```

## The full game guide (rules v3.0)
A ~6 minute video of the whole game as it is now: roles, challenges, chases, the four cards, bluff
calls, hunger, meetings, body reports, Restore Power + evac, Blackout, cameras, Last Stand, extras,
how to win, points and progress. Output: `out/outbreak-deck-full-guide.mp4`.
```powershell
powershell -ExecutionPolicy Bypass -File voice.ps1 -Scenes scenes-full.json
node render.js --full               # or: node render.js --full --stills  (out/stills-full)
```
`scenes-full.json` lists each scene's narration and which drawing it uses (`"scene"`); with `--full`
the older drawings show the v3 numbers (30s quarantine, no shot stun, regrow by lobby, evac win).

## What's new in v3 (second video)
A ~3.5 minute video of the rules v3.0 changes (fewer timers, lobby balance, Restore Power + evac,
Blackout, cameras, bluff call, body reports, Last Stand, extras, new points, recap / ranks / modifiers).
Output: `out/outbreak-deck-v3-whats-new.mp4`.
```powershell
powershell -ExecutionPolicy Bypass -File voice.ps1 -Scenes scenes-v3.json
node render.js --v3                 # or: node render.js --v3 --stills  (out/stills-v3)
```
The scenes are the `v3...` entries in `render.js`; the narration is `scenes-v3.json`.
Note: the first explainer still shows the v2 numbers (60s quarantine, 8s shot stun, 75s + 20s regrow).

## Files
- `scenes.json`: the 13 scenes and their narration. Change a line, re-run `voice.ps1` and `render.js`:
  scene lengths follow the narration automatically.
- `voice.ps1`: speaks each line with the built-in Windows voice (Microsoft David). Swap in a
  recorded or AI voice by replacing `audio/<scene>.wav` with your own WAV files.
- `render.js`: all drawing (hall, building, survivors, cards, HUD), scene animations, subtitles,
  the generated music bed + sound effects, and the ffmpeg encode.
