import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HuntTargetAI, MODE_HUNT, MODE_TARGET } from '../js/ai.js';
import { Board, FLEET, HORIZONTAL, VERTICAL, SHOT_MISS, SHOT_HIT, SHOT_SUNK } from '../js/board.js';
import { createRng } from '../js/rng.js';

const spec = (id) => FLEET.find((s) => s.id === id);

/** Let the AI fire one shot at `board` and feed back the result. */
function step(ai, board) {
  const { row, col } = ai.nextShot();
  const res = board.receiveAttack(row, col);
  assert.equal(res.valid, true, `AI fired an invalid shot at ${row},${col}: ${res.reason}`);
  ai.recordResult(row, col, res.result, res.result === SHOT_SUNK ? res.ship.cells : []);
  return res;
}

function playOut(ai, board, maxShots = 100) {
  let shots = 0;
  while (!board.allSunk()) {
    step(ai, board);
    shots++;
    assert.ok(shots <= maxShots, 'AI needed more shots than there are cells');
  }
  return shots;
}

describe('AI never shoots the same cell twice', () => {
  test('across 100 full random games', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const board = new Board();
      board.placeFleetRandomly(FLEET, createRng(seed));
      const ai = new HuntTargetAI({ rng: createRng(seed * 7919) });
      const seen = new Set();
      while (!board.allSunk()) {
        const { row, col } = ai.nextShot();
        const k = `${row},${col}`;
        assert.ok(!seen.has(k), `seed ${seed}: repeated shot at ${k}`);
        seen.add(k);
        const res = board.receiveAttack(row, col);
        ai.recordResult(row, col, res.result, res.result === SHOT_SUNK ? res.ship.cells : []);
      }
    }
  });

  test('can fire at all 100 cells on an empty board without repeating, then refuses', () => {
    const ai = new HuntTargetAI({ rng: createRng(3) });
    const seen = new Set();
    for (let i = 0; i < 100; i++) {
      const { row, col } = ai.nextShot();
      assert.ok(row >= 0 && row < 10 && col >= 0 && col < 10);
      assert.ok(!seen.has(`${row},${col}`));
      seen.add(`${row},${col}`);
      ai.recordResult(row, col, SHOT_MISS);
    }
    assert.throws(() => ai.nextShot(), /No cells left/);
  });

  test('targeting never proposes a tried cell even when hits are boxed in', () => {
    const ai = new HuntTargetAI({ rng: createRng(1) });
    // Hit in the corner whose only neighbours were already missed.
    ai.recordResult(0, 1, SHOT_MISS);
    ai.recordResult(1, 0, SHOT_MISS);
    ai.recordResult(0, 0, SHOT_HIT);
    const shot = ai.nextShot();
    assert.ok(!ai.hasTried(shot.row, shot.col));
  });
});

describe('hunt/target behaviour', () => {
  test('starts in hunt mode and switches to target mode after a hit', () => {
    const ai = new HuntTargetAI({ rng: createRng(1) });
    assert.equal(ai.mode, MODE_HUNT);
    ai.recordResult(5, 5, SHOT_HIT);
    assert.equal(ai.mode, MODE_TARGET);
  });

  test('after a single hit it fires at an orthogonally adjacent cell', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const ai = new HuntTargetAI({ rng: createRng(seed) });
      ai.recordResult(4, 4, SHOT_HIT);
      const { row, col } = ai.nextShot();
      assert.equal(Math.abs(row - 4) + Math.abs(col - 4), 1);
    }
  });

  test('with two hits in a row it follows that direction', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const ai = new HuntTargetAI({ rng: createRng(seed) });
      ai.recordResult(4, 4, SHOT_HIT);
      ai.recordResult(4, 5, SHOT_HIT);
      const { row, col } = ai.nextShot();
      assert.equal(row, 4);
      assert.ok(col === 3 || col === 6, `expected C/G on row 5, got col ${col}`);
    }
  });

  test('reverses direction when the line is blocked by a miss', () => {
    const ai = new HuntTargetAI({ rng: createRng(1) });
    ai.recordResult(4, 4, SHOT_HIT);
    ai.recordResult(4, 5, SHOT_HIT);
    ai.recordResult(4, 6, SHOT_MISS);
    assert.deepEqual(ai.nextShot(), { row: 4, col: 3 });
  });

  test('vertical line is followed at the board edge', () => {
    const ai = new HuntTargetAI({ rng: createRng(1) });
    ai.recordResult(0, 7, SHOT_HIT);
    ai.recordResult(1, 7, SHOT_HIT);
    assert.deepEqual(ai.nextShot(), { row: 2, col: 7 });
  });

  test('returns to hunt mode after sinking the ship', () => {
    const board = new Board();
    board.placeShip(spec('destroyer'), 3, 3, HORIZONTAL);
    const ai = new HuntTargetAI({ rng: createRng(1) });
    ai.recordResult(3, 3, board.receiveAttack(3, 3).result);
    assert.equal(ai.mode, MODE_TARGET);
    let res;
    do {
      res = step(ai, board);
    } while (res.result !== SHOT_SUNK);
    assert.equal(ai.mode, MODE_HUNT);
  });

  test('keeps targeting a second, adjacent ship hit while sinking the first', () => {
    const board = new Board();
    board.placeShip(spec('destroyer'), 0, 0, HORIZONTAL); // A1,B1
    board.placeShip(spec('cruiser'), 1, 0, HORIZONTAL); // A2,B2,C2
    const ai = new HuntTargetAI({ rng: createRng(5) });
    // Hit both ships first so there are open hits on two ships.
    for (const [r, c] of [[0, 0], [1, 0]]) {
      ai.recordResult(r, c, board.receiveAttack(r, c).result);
    }
    let shots = 0;
    while (board.getShip('destroyer').hits < 2 || board.getShip('cruiser').hits < 3) {
      step(ai, board);
      assert.ok(++shots < 15, 'AI lost track of the adjacent ship');
    }
    assert.equal(ai.mode, MODE_HUNT);
  });

  test('sinks a ship efficiently once found (no hunting in between)', () => {
    const board = new Board();
    board.placeShip(spec('carrier'), 5, 2, VERTICAL); // C6..C10
    const ai = new HuntTargetAI({ rng: createRng(9) });
    ai.recordResult(7, 2, board.receiveAttack(7, 2).result); // middle of the carrier
    let shots = 0;
    while (!board.allSunk()) {
      const { row, col } = ai.nextShot();
      // Every targeted shot should stay adjacent to the carrier's column/row.
      assert.ok(Math.abs(col - 2) <= 1 && row >= 4, `strayed to ${row},${col}`);
      const res = board.receiveAttack(row, col);
      ai.recordResult(row, col, res.result, res.result === SHOT_SUNK ? res.ship.cells : []);
      shots++;
    }
    assert.ok(shots <= 8, `took ${shots} shots to finish the carrier`);
  });

  test('beats a random fleet faster on average than pure random fire', () => {
    let total = 0;
    const games = 100;
    for (let seed = 1; seed <= games; seed++) {
      const board = new Board();
      board.placeFleetRandomly(FLEET, createRng(seed));
      total += playOut(new HuntTargetAI({ rng: createRng(seed + 1000) }), board);
    }
    // Pure random averages ~96 shots; hunt/target is typically ~65.
    assert.ok(total / games < 80, `average ${total / games} shots`);
  });

  test('reset clears all memory', () => {
    const ai = new HuntTargetAI({ rng: createRng(1) });
    ai.recordResult(0, 0, SHOT_HIT);
    ai.recordResult(0, 1, SHOT_MISS);
    ai.reset();
    assert.equal(ai.mode, MODE_HUNT);
    assert.equal(ai.tried.size, 0);
    assert.equal(ai.hasTried(0, 1), false);
  });
});
