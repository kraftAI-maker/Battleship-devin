[![CI](https://github.com/kraftAI-maker/Battleship-devin/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kraftAI-maker/Battleship-devin/actions/workflows/ci.yml)
# Battleship

Classic Battleship in the browser against a computer opponent that uses a
hunt/target strategy. Plain HTML, CSS and JavaScript (ES modules). No build
step, no backend, no dependencies.

## Play

- **Online:** enable GitHub Pages (Settings → Pages → *Deploy from a branch* →
  `main` / `(root)`), then open `https://<user>.github.io/Battleship-devin/`.
- **Locally:** ES modules don't load from `file://`, so serve the folder:

  ```sh
  python3 -m http.server 8000   # or: npm start
  # open http://localhost:8000
  ```

## How to play

1. **Place your fleet** on *Your fleet*: Carrier (5), Battleship (4),
   Cruiser (3), Submarine (3), Destroyer (2).
   - The selected ship is highlighted. Click a cell to place it, with the
     clicked cell as its top/left end. Then the next ship is selected.
   - **Rotate** (or press `R`) switches between horizontal and vertical. With
     a mouse you see a preview: green fits, red doesn't.
   - **Random placement** places the whole fleet for you. **Clear** removes
     all your ships.
   - Click a placed ship (on the board or in the list) to pick it up and move
     it.
   - Ships may touch, but they can't overlap or go off the board.
2. Press **Start battle**. The computer has already placed its fleet at
   random.
3. **Fire** by clicking a cell in *Enemy waters*. Turns alternate: you, then
   the computer.
   - Markers: white dot = miss, orange ✕ = hit, red ✕ = sunk ship. Your
     ships are grey. The yellow outline marks the last shot on each board.
   - The pill at the top shows whose turn it is. The battle log lists every
     shot (newest first).
4. The first to sink the whole enemy fleet wins. The result dialog shows
   shots and accuracy. Any ships the computer still has afloat are outlined.
   Click **New game**, available at any time in the header.

Works with mouse, touch and keyboard (Tab to a cell, then Enter/Space). On
narrow screens the boards stack, and during the battle the enemy board
moves to the top.

## Computer opponent (hunt/target)

- **Hunt:** fire at a random untried cell on the checkerboard pattern
  (`(row + col) % 2 === 0`). The smallest ship is 2 long, so every ship
  covers at least one of these cells. Once they are all used, any untried
  cell.
- **Target:** after a hit, fire at the cells directly next to it. Once two
  hits line up, keep going along that line in both directions until both
  ends hit a miss or the board edge.
- **Sunk:** clear that ship's cells from the AI's list of open hits. If no
  open hits are left, go back to hunting. If a hit on a *different*,
  adjacent ship is still open, keep targeting it.
- It never fires at the same cell twice.

## AI thinking

Tick **Show AI thinking** above *Your fleet* (off by default) to see what
the computer is considering for its next shot. It picks that shot at random
from the highlighted cells:

- **Strong pink with an outline:** target candidates, the cells next to an
  open hit or at the ends of a line of hits. The label says
  "AI mode: Target".
- **Faint pink:** hunt candidates, the untried checkerboard cells (or any
  untried cell once those are used up). The label says "AI mode: Hunt".

The overlay is shown during the battle and updates after every AI shot. It
comes straight from the AI: `HuntTargetAI.candidatePool()` in `js/ai.js`
returns the mode and cells that `nextShot()` picks from, and the UI reads it
via `Game.aiThinking()`. Reading it has no side effects, so turning the
overlay on doesn't change how the AI plays.

## Code structure

```
index.html        Page markup
css/style.css     Styles, responsive layout
js/rng.js         Seedable PRNG (mulberry32), used to make tests deterministic
js/board.js       Board: ship placement/validation, attacks, sunk & win detection
js/ai.js          HuntTargetAI: shot selection + memory of its own shots
js/game.js        Game: state machine (placement → player-turn ⇄ ai-turn → game-over)
js/ui.js          DOM only: renders Game state, wires events, schedules the AI turn
tests/*.test.js   Unit tests (node:test) for board, AI and game
scripts/bench.js  AI benchmark: average shots over seeded games (npm run bench)
BUGS.md           Bugs found during testing: symptom, root cause, fix
```

Game logic (`board.js`, `ai.js`, `game.js`) never touches the DOM, so Node
can test it directly. `ui.js` is a thin layer: every user action calls a
`Game` method, then re-renders from `Game`'s state. All the rules (whose turn
it is, repeated shots, actions not allowed in the current phase) are checked
in `Game`, so the UI can't break them: double clicks and clicks during the
AI's turn are simply rejected. The AI turn runs on a timer tagged with
`game.gameId`, so a timer left over from a game you restarted does nothing.

## Tests

Requires Node.js 18 or newer. No `npm install` needed.

```sh
npm test
# or: node --test tests/*.test.js
```

The tests cover:

- placement validation: overlap, out of bounds, rotation at the right and
  bottom edges, corners, moving or picking up a ship, random fleets always
  valid
- hit/miss/sunk detection, including ships lying next to each other
  (parallel and end-to-end), and repeated or out-of-bounds shots
- the win condition, for both the player and the AI
- the AI never firing at the same cell twice (100 full games, plus all 100
  cells of an empty board), and its hunt/target behaviour, including only
  hunting on checkerboard cells
- turn handling: no firing during placement or the AI's turn, and no double
  shots
- a new game fully resetting all state: during placement, mid-battle,
  during the AI's turn, and after game over

### AI benchmark

```sh
npm run bench          # 1,000 seeded games
npm run bench -- 5000  # or any number of games
```

This reports the average, median, best and worst number of shots the AI
needs to sink a randomly placed fleet. Currently the average is 51.5 and the
worst is 68, over 1,000 games.
