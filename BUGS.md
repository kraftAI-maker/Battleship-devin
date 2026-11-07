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
