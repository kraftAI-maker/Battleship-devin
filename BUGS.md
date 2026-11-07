# Bugs found during testing

Bugs found while playtesting in the browser (desktop Chrome and a
320px-wide mobile viewport) and while writing the unit tests. Each entry
says what happened, the root cause, and the fix.

## 1. Board's right column cut off on narrow windows

- **What happened:** In a 320px-wide desktop browser window (classic 15px
  scrollbar, so ~305px usable), column J of both boards, the battle log and
  the hint text ran past the right edge of the screen and were cut off.
- **Root cause:** The board grid used `repeat(11, 1fr)`. `1fr` means
  `minmax(auto, 1fr)`, so a column can't shrink below its content's minimum
  width. The `<button>` cells have a built-in minimum size, so the grid would
  not shrink below about 320px. The flex item around it (`.board-wrap`) also
  had the default `min-width: auto`, so it couldn't shrink either.
- **Fix:** Use `repeat(11, minmax(0, 1fr))` for the board grid and add
  `min-width: 0` to `.board-wrap` and `main`. At 320px the board now ends at
  x=297 inside a 305px viewport.

## 2. Keyboard focus lost after every shot

- **What happened:** If you played with the keyboard (Tab to an enemy cell,
  press Enter), focus jumped to `<body>` once the AI started its turn. You
  had to Tab through the whole page again to take the next shot.
- **Root cause:** To block clicks during the AI's turn, the UI set
  `disabled` on every enemy cell button. Browsers drop focus from an element
  when it becomes disabled.
- **Fix:** Enemy cells now get `aria-disabled="true"` instead of `disabled`.
  They stay focusable, assistive tech still announces them as unavailable,
  and the turn rule is enforced where it belongs, in
  `Game.playerFire()` (returns `not-your-turn`). The UI shows "Wait for your
  turn." Checked in the browser: after a shot, focus stays on the cell
  through the AI turn, and pressing Enter on another cell during the AI turn
  is rejected.

## 3. Console error on every page load (favicon 404)

- **What happened:** Every load logged `Failed to load resource: 404`
  in the console. I spotted it while checking for errors during automated
  playthroughs.
- **Root cause:** No favicon was declared, so the browser asked for
  `/favicon.ico`, which doesn't exist (and on GitHub Pages the request would
  hit the site root, not the repo path).
- **Fix:** Added an inline SVG data-URI favicon in `index.html`, so there's
  no extra request and nothing to 404. Later playthroughs had zero console
  errors.

## 4. Win/lose dialog didn't take keyboard focus

- **What happened:** When a game ended, the win/lose dialog appeared, but
  keyboard focus stayed on the hidden board behind it (it actually ended up
  on `<body>`). Keyboard and screen-reader users weren't taken to the result
  or the "New game" button, and Escape did nothing.
- **Root cause:** `renderOverlay()` only toggled the `hidden` attribute and
  never moved focus.
- **Fix:** When the overlay goes from hidden to visible, focus moves to its
  "New game" button. Escape or "View boards" closes it and moves focus to the
  header's "New game" button. Checked in the browser: focus is on
  `overlay-new-game` when the dialog opens; after Escape the dialog is gone,
  focus is on `new-game`, and Enter starts a new game.

## 5. Choosing a ship from the fleet list lost keyboard focus

- **What happened:** If you selected a ship in the fleet list with the
  keyboard (Tab to "Cruiser", press Enter), focus fell back to `<body>`, so
  you couldn't keep moving through the list or on to the board. (Reported by
  automated code review.)
- **Root cause:** `renderShipList()` rebuilds the list with
  `innerHTML = ''` on every render, which destroys the focused button.
- **Fix:** Before rebuilding, remember which ship's button had focus, and
  focus the new button for that ship afterwards.

## 6. Couldn't move an already-placed ship by clicking it on the board

- **What happened:** After placing the Carrier, the Battleship was selected
  automatically. Clicking the Carrier on the board to move it showed "That
  overlaps another ship." instead of picking it up. Moving it only worked
  from the fleet list or once every ship was placed, which contradicts the
  README. (Reported by automated code review.)
- **Root cause:** `onPlayerBoardClick()` only picked up a ship when nothing
  was selected or when the clicked ship *was* the selected one. Otherwise it
  tried to place the selected ship on the occupied cell.
- **Fix:** Clicking any placed ship now picks it up. Placing a different ship
  on an occupied cell can never succeed, so the old behaviour was never what
  the player wanted.

## 7. Random placement could recurse until the stack overflowed

- **What happened:** If `placeFleetRandomly()` got a fleet that can't fit,
  such as a 5-long ship on a 3x3 board, it never returned and crashed with
  "Maximum call stack size exceeded". This can't happen with the standard
  10x10 board and fleet, but `Board` and `Game` accept a custom `size` and
  `fleet`. (Reported by automated code review.)
- **Root cause:** When no legal position was left for a ship, the function
  called itself again with no limit on retries.
- **Fix:** Retry in a loop, at most `maxAttempts` (100) times, then clear the
  partial placement and throw `Fleet does not fit on this board`. Covered by
  a new unit test.
- **Follow-up:** A second review found that the capped retries could reject
  a dense fleet that does fit. For example, 25 cells of ships on a 5x5 board
  failed on 23 of 50 seeds. Now, after 20 quick random attempts, it falls back
  to an exhaustive search with shuffled options and backtracking. It throws
  only when no placement exists. Covered by a unit test that fills a 5x5 board
  for 30 seeds.
- **Follow-up 2:** A third review found that the exhaustive search could freeze
  the page on fleets that fill the board's area but can't tile it, such as
  nine 4-long ships on a 6x6 board. The search now has a budget of 200,000
  placements. That case now fails in about 1s with `Fleet does not fit on this
  board (search limit reached)`, and dense fleets that do fit still always
  place. Covered by a unit test.
- **Follow-up 3:** A fourth review found that the limit could now reject fleets
  that do fit, such as twelve 3-long ships on a 6x6 board. The real problem was
  that the search was slow, so I changed how it searches rather than adjusting
  the limit:
  - It fills cells in row-major order. The first undecided cell is either left
    empty, while spare cells remain, or becomes the top/left end of a ship.
  - It tries each ship length only once per cell, since same-length ships are
    interchangeable.

  Results: 12x3 on 6x6 always places, and 9x4 on 6x6 is proven impossible in a
  few milliseconds. Dense 5x5, 7x7 and 8x8 fleets place in about 1ms each. The
  limit stays only as a safety net. Covered by unit tests.

## 8. Tab/Shift+Tab could leave the win/lose dialog

- **What happened:** With the result dialog open (focus on "New game"),
  pressing Shift+Tab moved focus to the battle log behind the dialog, and
  further Tabs reached the header and board controls while the dialog was
  still open. Found in the recorded browser playtest, and also reported by
  automated code review.
- **Root cause:** `aria-modal="true"` only tells assistive tech the dialog is
  modal. It doesn't stop focus from leaving. The fix for bug 4 set the
  initial focus but didn't contain it.
- **Fix:** While the overlay is visible, the document `keydown` handler cycles
  Tab and Shift+Tab between the dialog's buttons. Escape still closes it. The
  same handler also returns early, so the `R` rotate shortcut can't fire
  behind the dialog.

## 9. AI hunted less efficiently than it could (improvement from human review)

- **What happened:** A simulation of 2,000 games showed the AI needed about
  60 shots on average to sink the fleet, and up to 99 in the worst case.
  `npm run bench` (1,000 seeded games) confirmed it: an average of 59.9, a
  median of 59 and a worst case of 100. Found in human review.
- **Root cause:** In hunt mode the AI fired at any untried cell. Every ship
  is at least 2 long, so every ship covers a cell where `(row + col)` is
  even. About half of all hunt shots went to cells that could never find a
  ship the even cells wouldn't also find.
- **Fix:** `HuntTargetAI.huntCandidates()` now picks only untried cells where
  `(row + col) % 2 === 0`. If none are left, it falls back to any untried
  cell. Target mode is unchanged. Benchmark after the fix: average 51.5,
  median 53, worst 68. Covered by unit tests: hunt shots stay on the
  checkerboard until all 50 even cells are tried, then fall back to the odd
  ones, and target mode is not limited to the checkerboard. The average-shots
  test threshold was tightened from 80 to 56.

## Found by human testing on real devices

Found by a human tester on a real iPhone 16 Pro and iPad Air 13" (Safari).
Fixes checked in headless Chrome at 390px with touch emulation (iPhone
viewport, 390x844) and at 1280px with a mouse.

### 10. On a phone you couldn't see where the AI hit you without scrolling

- **What happened:** Below 720px the boards stack, with *Enemy waters* on top
  during the battle. *Your fleet* is below the fold, so after each AI shot
  you had to scroll down to see where it landed, then scroll back up to fire.
- **Root cause:** The AI's shot was only shown on your own board (yellow
  outline) and in the battle log, and both are further down the page on a
  phone.
- **Fix:** A compact status line under the turn indicator shows the AI's last
  shot, e.g. "Enemy fired at C10 – hit!" or "… – sunk your Cruiser!". It is
  colour-coded by result and flashes when it changes. The cell on *Your
  fleet* pulses for about 2 seconds (no animation with
  `prefers-reduced-motion`). The data comes from the new `Game.lastShots`,
  which is reset on a new game and covered by unit tests. At 390px the line
  ends 148px from the top, above *Enemy waters*, with no scrolling.

### 11. Instructions said "click" and "Press R" on touch devices

- **What happened:** On iPhone and iPad the hints said "click your board",
  "Press R or Rotate" and "Click a cell in Enemy waters". There is no R key
  on a touch screen.
- **Root cause:** The hint texts and the first log entry were written for
  desktop.
- **Fix:** The wording is device-neutral now ("choose a cell"). The R shortcut
  is only mentioned when `matchMedia('(any-pointer: fine)')` matches (a mouse
  or trackpad, e.g. a desktop or an iPad with a trackpad keyboard), or after
  the first key press. At 390px with touch emulation the hint reads
  `Use "Rotate" to turn it.`. After a key press, or on desktop, it reads
  `Use "Rotate" (or press R) to turn it.`.

### 12. Remaining enemy ships were hard to see after the game

- **What happened:** After a loss, the enemy ships you hadn't hit were drawn
  only as a thin grey inset outline on dark water. That was easy to miss,
  especially on a phone.
- **Root cause:** `.cell.revealed` was a 2px `box-shadow` in the ship colour,
  which has little contrast against the water colour.
- **Fix:** Revealed cells now use a hatched ship-colour fill with a light
  border. A legend entry, "Enemy ship (not hit)", appears at game over while
  such ships remain.

### 13. Board order changed between phases on a phone

- **What happened:** Below 720px, *Your fleet* was on top during placement.
  During the battle *Enemy waters* moved to the top. After game over *Your
  fleet* was back on top. The tester lost track of which board was which.
  The headings didn't say whose shots each board showed.
- **Root cause:** The narrow-screen CSS moved *Enemy waters* up (`order: -1`)
  only in the `phase-player-turn` and `phase-ai-turn` body classes.
- **Fix:** On narrow screens *Enemy waters* is always above *Your fleet*.
  During placement it is hidden there, because it is empty and would push
  your board below the fold. It appears when the battle starts and never
  swaps. The headings now read "Enemy waters · your shots" and "Your fleet ·
  enemy's shots", with a coloured accent bar (orange vs grey). Checked at
  390px: enemy board above in battle and at game over, before and after
  closing the result dialog. On desktop the side-by-side layout is unchanged.

## Found while building the Legacy Fleet theme

### 14. Long title wrapped to four lines on a phone

- **What happened:** With the new title "Battleship: Legacy Fleet" and its
  subtitle, the header at 390px wrapped into two lines of title and two of
  subtitle. That made the header 98px tall and pushed the board and the
  enemy-shot status line down by about 30px.
- **Root cause:** The header kept its desktop sizes (1.4rem/1.2rem title,
  full-size "New game" button), which left only about 250px for the title.
- **Fix:** Below 720px the title is 1.05rem with no letter spacing, the
  subtitle is 0.75rem, the "New game" button is a little smaller, and both
  lines use `text-wrap: balance`. At 390px the header is now one title line
  and one subtitle line (64px). At 320px each wraps into two even lines
  instead of leaving one word on its own line.
