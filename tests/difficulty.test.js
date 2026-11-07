import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DensityAI, HuntTargetAI, RandomAI, createAI, HIT_WEIGHT,
  DIFFICULTIES, DIFFICULTY_EASY, DIFFICULTY_NORMAL, DIFFICULTY_HARD, MODE_HUNT, MODE_RANDOM, MODE_TARGET,
} from '../js/ai.js';
import { Board, FLEET, SHOT_SUNK } from '../js/board.js';
import {
  Game, PHASE_AI_TURN, PHASE_GAME_OVER, PHASE_PLAYER_TURN,
} from '../js/game.js';
import { createRng } from '../js/rng.js';

const key = (p) => `${p.row},${p.col}`;

function playOut(ai, board) {
  const seen = new Set();
  let shots = 0;
  while (!board.allSunk()) {
    const pool = ai.candidatePool();
    const { row, col } = ai.nextShot();
    assert.ok(pool.cells.some((p) => p.row === row && p.col === col), 'shot not from the candidate pool');
    assert.ok(!seen.has(key({ row, col })), `repeated shot at ${row},${col}`);
    seen.add(key({ row, col }));
    const res = board.receiveAttack(row, col);
    assert.equal(res.valid, true);
    ai.recordResult(row, col, res.result, res.result === SHOT_SUNK ? res.ship.cells : []);
    shots++;
  }
  return shots;
}

function averageShots(difficulty, games) {
  let total = 0;
  for (let seed = 1; seed <= games; seed++) {
    const board = new Board();
    board.placeFleetRandomly(FLEET, createRng(seed));
    total += playOut(createAI(difficulty, { rng: createRng(seed + 1000) }), board);
  }
  return total / games;
}

describe('createAI', () => {
  test('one AI class per difficulty', () => {
    assert.ok(createAI(DIFFICULTY_EASY) instanceof RandomAI);
    assert.ok(createAI(DIFFICULTY_NORMAL) instanceof HuntTargetAI);
    assert.ok(!(createAI(DIFFICULTY_NORMAL) instanceof RandomAI));
    assert.ok(createAI(DIFFICULTY_HARD) instanceof DensityAI);
    assert.throws(() => createAI('impossible'), /Unknown difficulty/);
  });

  test('every difficulty finishes 50 games without repeating a shot, always from its pool', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 50; seed++) {
        const board = new Board();
        board.placeFleetRandomly(FLEET, createRng(seed));
        assert.ok(playOut(createAI(difficulty, { rng: createRng(seed + 7) }), board) <= 100);
      }
    }
  });

  test('reading the pool consumes no randomness (same shots with or without it)', () => {
    for (const difficulty of DIFFICULTIES) {
      const shots = (peek) => {
        const board = new Board();
        board.placeFleetRandomly(FLEET, createRng(3));
        const ai = createAI(difficulty, { rng: createRng(4) });
        const out = [];
        while (!board.allSunk()) {
          if (peek) ai.candidatePool();
          const { row, col } = ai.nextShot();
          const res = board.receiveAttack(row, col);
          ai.recordResult(row, col, res.result, res.result === SHOT_SUNK ? res.ship.cells : []);
          out.push(key({ row, col }));
        }
        return out;
      };
      assert.deepEqual(shots(true), shots(false), difficulty);
    }
  });

  test('Hard beats Normal, and Normal beats Easy, on average over 200 seeded games', () => {
    const easy = averageShots(DIFFICULTY_EASY, 200);
    const normal = averageShots(DIFFICULTY_NORMAL, 200);
    const hard = averageShots(DIFFICULTY_HARD, 200);
    assert.ok(hard < normal, `hard ${hard} vs normal ${normal}`);
    assert.ok(normal < easy, `normal ${normal} vs easy ${easy}`);
  });
});

describe('Easy (RandomAI)', () => {
  test('picks from every untried cell, even next to a hit', () => {
    const ai = new RandomAI({ rng: createRng(1) });
    ai.recordResult(5, 5, 'hit');
    ai.recordResult(0, 0, 'miss');
    const pool = ai.candidatePool();
    assert.equal(pool.mode, MODE_RANDOM);
    assert.equal(pool.cells.length, 98);
    assert.ok(!pool.cells.some((p) => (p.row === 5 && p.col === 5) || (p.row === 0 && p.col === 0)));
  });
});

describe('Hard (DensityAI)', () => {
  test('empty board: the four centre cells score highest', () => {
    const pool = new DensityAI().candidatePool();
    assert.equal(pool.mode, MODE_HUNT);
    assert.deepEqual(pool.cells.map(key).sort(), ['4,4', '4,5', '5,4', '5,5']);
    assert.equal(pool.top.length, 10);
    assert.ok(pool.top.every((t, i) => i === 0 || pool.top[i - 1].score >= t.score));
  });

  test('scores count ship placements: corner of an empty board', () => {
    // Carrier..Destroyer: each fits through (0,0) once horizontally and once vertically.
    assert.equal(new DensityAI().scores()[0][0], 2 * FLEET.length);
  });

  test('a cell boxed in by misses scores 0 and is never picked', () => {
    const ai = new DensityAI();
    ai.recordResult(0, 1, 'miss');
    ai.recordResult(1, 0, 'miss');
    assert.equal(ai.scores()[0][0], 0);
    assert.ok(!ai.candidatePool().top.some((p) => p.row === 0 && p.col === 0));
  });

  test('sunk ships no longer count: gaps too short for the remaining ships score 0', () => {
    const ai = new DensityAI({ shipLengths: [2, 3] });
    // Sink the 2-ship at (9,8)-(9,9); only the 3-ship is left.
    ai.recordResult(9, 8, 'hit');
    ai.recordResult(9, 9, 'sunk', [{ row: 9, col: 8 }, { row: 9, col: 9 }]);
    assert.deepEqual(ai.remainingLengths(), [3]);
    // (0,0)-(0,1) is a 2-long gap between the edge and a miss, closed below.
    ai.recordResult(0, 2, 'miss');
    ai.recordResult(1, 0, 'miss');
    ai.recordResult(1, 1, 'miss');
    assert.equal(ai.scores()[0][0], 0);
    assert.equal(ai.scores()[0][1], 0);
  });

  test('after one hit: targets the neighbours of that hit', () => {
    const ai = new DensityAI();
    ai.recordResult(5, 5, 'hit');
    const pool = ai.candidatePool();
    assert.equal(pool.mode, MODE_TARGET);
    const neighbours = ['4,5', '6,5', '5,4', '5,6'];
    assert.ok(pool.cells.every((p) => neighbours.includes(key(p))), JSON.stringify(pool.cells));
    // A neighbour outweighs any cell away from the hit by far.
    const s = ai.scores();
    assert.ok(s[4][5] > HIT_WEIGHT * s[0][0]);
  });

  test('two hits in a row: only the ends of that line are top-scoring', () => {
    const ai = new DensityAI();
    ai.recordResult(4, 4, 'hit');
    ai.recordResult(4, 5, 'hit');
    assert.deepEqual(ai.candidatePool().cells.map(key).sort(), ['4,3', '4,6']);
  });

  test('a miss at one end sends it to the other end', () => {
    const ai = new DensityAI();
    ai.recordResult(4, 4, 'hit');
    ai.recordResult(4, 5, 'hit');
    ai.recordResult(4, 6, 'miss');
    assert.deepEqual(ai.candidatePool().cells.map(key), ['4,3']);
  });

  test('ties are broken with the seeded rng: same seed, same shot', () => {
    const pick = (seed) => new DensityAI({ rng: createRng(seed) }).nextShot();
    assert.deepEqual(pick(9), pick(9));
    const picks = new Set(Array.from({ length: 40 }, (_, i) => key(pick(i + 1))));
    assert.deepEqual([...picks].sort(), ['4,4', '4,5', '5,4', '5,5']);
  });

  test('reset clears hits, misses and sunk ships', () => {
    const ai = new DensityAI();
    ai.recordResult(9, 8, 'hit');
    ai.recordResult(9, 9, 'sunk', [{ row: 9, col: 8 }, { row: 9, col: 9 }]);
    ai.reset();
    assert.equal(ai.tried.size, 0);
    assert.deepEqual(ai.remainingLengths(), FLEET.map((s) => s.length));
  });
});

describe('Game difficulty', () => {
  test('defaults to Normal (hunt/target)', () => {
    const game = new Game({ rng: createRng(1) });
    assert.equal(game.difficulty, DIFFICULTY_NORMAL);
    assert.ok(game.ai instanceof HuntTargetAI && !(game.ai instanceof RandomAI));
  });

  test('can be chosen during placement only, and survives a new game', () => {
    const game = new Game({ rng: createRng(1) });
    assert.equal(game.setDifficulty('impossible'), false);
    assert.equal(game.setDifficulty(DIFFICULTY_HARD), true);
    assert.ok(game.ai instanceof DensityAI);
    game.randomizePlayerShips();
    game.startBattle();
    assert.match(game.log.at(-1).text, /Battle started on Hard/);
    assert.equal(game.setDifficulty(DIFFICULTY_EASY), false);
    assert.equal(game.difficulty, DIFFICULTY_HARD);
    game.newGame();
    assert.equal(game.difficulty, DIFFICULTY_HARD);
    assert.ok(game.ai instanceof DensityAI);
    assert.equal(game.ai.tried.size, 0);
  });

  test('Hard: aiThinking reports its top cells and every AI shot comes from them', () => {
    const game = new Game({ rng: createRng(2), difficulty: DIFFICULTY_HARD });
    game.randomizePlayerShips();
    game.startBattle();
    let r = 0;
    let c = 0;
    while (game.phase !== PHASE_GAME_OVER) {
      if (game.phase === PHASE_PLAYER_TURN) {
        game.playerFire(r, c);
        c = (c + 1) % 10;
        if (c === 0) r++;
        continue;
      }
      assert.equal(game.phase, PHASE_AI_TURN);
      const thinking = game.aiThinking();
      assert.ok(Array.isArray(thinking.top) && thinking.top.length > 0);
      const shot = game.aiFire();
      assert.ok(thinking.cells.some((p) => p.row === shot.row && p.col === shot.col));
    }
  });
});
