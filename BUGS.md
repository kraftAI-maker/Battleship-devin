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
