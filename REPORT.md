# Battleship: Legacy Fleet – Build Report

**Play:** https://kraftai-maker.github.io/Battleship-devin/
**Code:** https://github.com/kraftAI-maker/Battleship-devin
**Bug log (symptom, root cause, fix for every bug):** [BUGS.md](BUGS.md)

## Goal

Build a Battleship game that can be played online against an AI, make sure it is debugged, and document the bugs that were found and how they were fixed.

## How it was built

I wrote the requirements and acceptance criteria. Devin wrote all of the code, tests and documentation. My job was to steer, review and decide:

1. **Specify.** One prompt with rules, AI strategy (hunt/target), required tests, a bug log and a PR-based workflow.
2. **Build and self-test.** Devin wrote the game with game logic separated from the UI, added unit tests and played complete games in a real browser (desktop and mobile viewport) before opening the first PR.
3. **Automated review.** Every PR went through Devin Review and, from PR #2 on, a CI pipeline that runs all tests and the AI benchmark.
4. **Human review.** I reviewed every PR against the acceptance criteria and used a second AI as an independent reviewer (four-eyes principle). A simulation of 2,000 games showed the AI was weaker than necessary, which led to the checkerboard hunting improvement.
5. **Scope decision.** Automated review kept finding edge cases for custom board sizes that never occur in the real game. I limited fixes to the standard 10×10 game.
6. **Real devices.** I tested on an iPhone 16 Pro and an iPad Air 13". This found six issues that no automated test caught, all fixed and then re-verified on the iPhone.
7. **Merge.** Nothing reached `main` without a human merge.

## Results

| | |
|---|---|
| Pull requests merged | 7 |
| Unit tests | 105, all passing, run by CI on every push |
| Bugs found and fixed | 16, plus 1 AI improvement |
| AI strength (avg. shots to sink the fleet, 1,000 seeded games) | Easy 95.4 · Normal 51.5 · Hard 44.8 |
| Normal AI before and after human review | 59.9 → 51.5 avg. shots, worst game 100 → 68 |

## Who found the bugs

| Found by | Bugs (see BUGS.md) |
|---|---|
| Devin's own tests and browser playtests | #1–4 |
| Devin Review (automated code review) | #5–8 |
| Devin while building later features | #14, #17 |
| Human testing on real devices | #10–13, #15, #16 |
| Human review with simulation (improvement) | #9 |

**Takeaway:** the agent caught most logic and accessibility issues itself. The issues it could not catch were about real devices and how a person reads the screen. That is where the human adds the most value.

## What's in the game

- Classic rules: 10×10 grid, five ships, manual or random placement
- **Legacy Fleet theme:** the enemy ships are legacy systems (COBOL Carrier, Mainframe Battleship, Java 8 Cruiser, Monolith Submarine, Tech-Debt Destroyer). Sinking one "modernizes" it.
- **Three difficulty levels:** Easy (random), Normal (hunt/target with checkerboard hunting), Hard (probability density)
- **"Show AI thinking":** overlays the cells the AI is actually choosing its next shot from. It reads the AI's real candidate pool, so it can't drift from the actual logic.
- Works on phone, tablet and desktop. Keyboard and screen-reader friendly. Hit and sink animations respect "reduce motion". Local stats panel.

## Timeline (7 Nov 2026, CET)

| Time | Step |
|---|---|
| 11:55 | Repository created, first Devin session started |
| 12:05 | PR #1 opened: playable game, 54 tests, 4 bugs fixed |
| 12:17–12:41 | Six review rounds. Human review adds checkerboard hunting and limits the scope |
| 12:50 | PR #1 merged, site live on GitHub Pages |
| 13:00–13:11 | Real-device testing (iPhone, iPad): 4 findings |
| 16:26 | PR #2 merged: CI |
| 16:44–17:21 | PRs #3–#7 merged: AI thinking, device fixes, Legacy Fleet, difficulty levels, polish |

## Cost

Everything ran on Devin's **Pro plan ($20/month)**. The complete build (7 PRs, 105 tests, 17 logged fixes) used **95% of one day's included quota and 47% of the weekly quota**. That is roughly **$2 of plan value** (rough estimate: 47% of one week of a $20/month plan). A developer would plausibly need several days for the same scope.
