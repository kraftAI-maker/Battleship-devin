import { BOARD_SIZE, FLEET, SHOT_HIT, SHOT_MISS, SHOT_SUNK } from './board.js';
import { randomInt } from './rng.js';

const DIRECTIONS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const AXES = [
  [0, 1],
  [1, 0],
];

export const MODE_HUNT = 'hunt';
export const MODE_TARGET = 'target';
export const MODE_RANDOM = 'random';

export const DIFFICULTY_EASY = 'easy';
export const DIFFICULTY_NORMAL = 'normal';
export const DIFFICULTY_HARD = 'hard';
export const DIFFICULTIES = Object.freeze([DIFFICULTY_EASY, DIFFICULTY_NORMAL, DIFFICULTY_HARD]);
export const DIFFICULTY_NAMES = Object.freeze({
  [DIFFICULTY_EASY]: 'Easy',
  [DIFFICULTY_NORMAL]: 'Normal',
  [DIFFICULTY_HARD]: 'Hard',
});

/** Hard: a placement through k unresolved hits counts HIT_WEIGHT^k times. */
export const HIT_WEIGHT = 100;
/** Hard: how many top-scoring cells candidatePool() reports in `top`. */
const TOP_CELLS = 10;

/**
 * Hunt/target AI.
 * - Hunt: fire at a random untried checkerboard cell ((row + col) even);
 *   the smallest ship is 2 long, so every ship covers one. Any untried
 *   cell once those run out.
 * - Target: after a hit, try the cells adjacent to it. Once two or more
 *   hits line up, keep extending that line in both directions.
 * - When a ship sinks its cells are cleared from the open-hit list; if no
 *   unresolved hits remain the AI goes back to hunting. Hits that belong to
 *   a different (adjacent) ship stay open so the AI keeps targeting them.
 */
export class HuntTargetAI {
  constructor({ size = BOARD_SIZE, rng = Math.random } = {}) {
    this.size = size;
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.tried = new Set();
    this.openHits = [];
  }

  /** The mode the next shot is chosen in (see candidatePool()). */
  get mode() {
    return this.candidatePool().mode;
  }

  key(row, col) {
    return row * this.size + col;
  }

  inBounds(row, col) {
    return row >= 0 && col >= 0 && row < this.size && col < this.size;
  }

  hasTried(row, col) {
    return this.tried.has(this.key(row, col));
  }

  isOpenHit(row, col) {
    return this.openHits.some((h) => h.row === row && h.col === col);
  }

  isCandidate(row, col) {
    return this.inBounds(row, col) && !this.hasTried(row, col);
  }

  /**
   * The cells the next shot is picked from (uniformly at random) and the
   * mode they come from. Read-only: calling it doesn't change the AI's state
   * or consume randomness, so the UI can show it without affecting play.
   * @returns {{mode: 'hunt'|'target', cells: {row:number,col:number}[]}}
   */
  candidatePool() {
    const targets = this.targetCandidates();
    if (targets.length > 0) return { mode: MODE_TARGET, cells: targets };
    return { mode: MODE_HUNT, cells: this.huntCandidates() };
  }

  nextShot() {
    if (this.tried.size >= this.size * this.size) {
      throw new Error('No cells left to shoot');
    }
    const { cells } = this.candidatePool();
    return cells[randomInt(this.rng, cells.length)];
  }

  /**
   * Untried checkerboard cells ((row + col) even). Every ship is at least 2
   * long, so it always covers one of them. Falls back to any untried cell.
   */
  huntCandidates() {
    const untried = [];
    for (let row = 0; row < this.size; row++) {
      for (let col = 0; col < this.size; col++) {
        if (!this.hasTried(row, col)) untried.push({ row, col });
      }
    }
    const parity = untried.filter((c) => (c.row + c.col) % 2 === 0);
    return parity.length > 0 ? parity : untried;
  }

  /** Cells worth shooting given the unresolved hits, best guesses first. */
  targetCandidates() {
    // 1) A line of 2+ open hits: extend it at either open end.
    for (const anchor of this.openHits) {
      for (const [dr, dc] of AXES) {
        const line = this.lineThrough(anchor, dr, dc);
        if (line.length < 2) continue;
        const first = line[0];
        const last = line[line.length - 1];
        const ends = [
          { row: first.row - dr, col: first.col - dc },
          { row: last.row + dr, col: last.col + dc },
        ].filter((c) => this.isCandidate(c.row, c.col));
        if (ends.length > 0) return ends;
      }
    }
    // 2) Otherwise probe the neighbours of an open hit (oldest first).
    for (const hit of this.openHits) {
      const neighbours = DIRECTIONS
        .map(([dr, dc]) => ({ row: hit.row + dr, col: hit.col + dc }))
        .filter((c) => this.isCandidate(c.row, c.col));
      if (neighbours.length > 0) return neighbours;
    }
    return [];
  }

  /** Contiguous open hits through `anchor` along axis (dr, dc), ordered. */
  lineThrough(anchor, dr, dc) {
    let start = anchor;
    while (this.isOpenHit(start.row - dr, start.col - dc)) {
      start = { row: start.row - dr, col: start.col - dc };
    }
    const line = [];
    let cur = start;
    while (this.isOpenHit(cur.row, cur.col)) {
      line.push(cur);
      cur = { row: cur.row + dr, col: cur.col + dc };
    }
    return line;
  }

  /**
   * Tell the AI the outcome of its shot.
   * @param {number} row
   * @param {number} col
   * @param {'miss'|'hit'|'sunk'} result
   * @param {{row:number,col:number}[]} [sunkCells] cells of the ship that sank
   */
  recordResult(row, col, result, sunkCells = []) {
    this.tried.add(this.key(row, col));
    if (result === SHOT_MISS) return;
    if (result === SHOT_HIT || result === SHOT_SUNK) {
      this.openHits.push({ row, col });
    }
    if (result === SHOT_SUNK) {
      const sunk = new Set(sunkCells.map((c) => this.key(c.row, c.col)));
      this.openHits = this.openHits.filter((h) => !sunk.has(this.key(h.row, h.col)));
    }
  }
}

/** Easy: a uniformly random untried cell, no memory of hits. */
export class RandomAI extends HuntTargetAI {
  candidatePool() {
    return { mode: MODE_RANDOM, cells: this.untriedCells() };
  }

  untriedCells() {
    const cells = [];
    for (let row = 0; row < this.size; row++) {
      for (let col = 0; col < this.size; col++) {
        if (!this.hasTried(row, col)) cells.push({ row, col });
      }
    }
    return cells;
  }
}

/**
 * Hard: probability-density targeting. For every way a remaining (unsunk)
 * ship could lie on the board without covering a miss or a sunk ship, add
 * that placement's weight to each untried cell it covers. A placement
 * through k unresolved hits weighs HIT_WEIGHT^k, so cells next to open hits
 * (and in line with them) dominate. The next shot is a random pick among
 * the cells with the highest score.
 */
export class DensityAI extends RandomAI {
  constructor({ size = BOARD_SIZE, rng = Math.random, shipLengths = FLEET.map((s) => s.length) } = {}) {
    super({ size, rng });
    this.shipLengths = shipLengths;
  }

  reset() {
    super.reset();
    this.sunkLengths = [];
  }

  recordResult(row, col, result, sunkCells = []) {
    super.recordResult(row, col, result, sunkCells);
    if (result === SHOT_SUNK && sunkCells.length > 0) this.sunkLengths.push(sunkCells.length);
  }

  /** Lengths of the ships that haven't been sunk yet. */
  remainingLengths() {
    const remaining = [...this.shipLengths];
    for (const len of this.sunkLengths) {
      const i = remaining.indexOf(len);
      if (i >= 0) remaining.splice(i, 1);
    }
    return remaining;
  }

  /** size x size grid of placement weights; 0 for tried cells. */
  scores() {
    const grid = Array.from({ length: this.size }, () => Array(this.size).fill(0));
    // Misses and sunk ships: tried cells that aren't an open hit.
    const blocked = (r, c) => this.hasTried(r, c) && !this.isOpenHit(r, c);
    for (const len of this.remainingLengths()) {
      for (const [dr, dc] of AXES) {
        for (let row = 0; row + dr * (len - 1) < this.size; row++) {
          for (let col = 0; col + dc * (len - 1) < this.size; col++) {
            let hits = 0;
            let fits = true;
            for (let i = 0; i < len && fits; i++) {
              const r = row + dr * i;
              const c = col + dc * i;
              if (blocked(r, c)) fits = false;
              else if (this.isOpenHit(r, c)) hits++;
            }
            if (!fits) continue;
            const weight = HIT_WEIGHT ** hits;
            for (let i = 0; i < len; i++) {
              const r = row + dr * i;
              const c = col + dc * i;
              if (!this.hasTried(r, c)) grid[r][c] += weight;
            }
          }
        }
      }
    }
    return grid;
  }

  /**
   * `cells`: the top-scoring cells (the next shot is one of them).
   * `top`: the TOP_CELLS highest-scoring untried cells with their scores.
   * @returns {{mode: 'hunt'|'target', cells: {row:number,col:number}[],
   *   top: {row:number,col:number,score:number}[]}}
   */
  candidatePool() {
    const grid = this.scores();
    const scored = this.untriedCells().map(({ row, col }) => ({ row, col, score: grid[row][col] }));
    const best = Math.max(0, ...scored.map((s) => s.score));
    // If no remaining ship fits anywhere (shouldn't happen), any untried cell.
    const cells = best > 0
      ? scored.filter((s) => s.score === best).map(({ row, col }) => ({ row, col }))
      : scored.map(({ row, col }) => ({ row, col }));
    const top = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, TOP_CELLS);
    return { mode: this.openHits.length > 0 ? MODE_TARGET : MODE_HUNT, cells, top };
  }
}

/** The AI for a difficulty level (see DIFFICULTIES). */
export function createAI(difficulty, { size = BOARD_SIZE, rng = Math.random, shipLengths } = {}) {
  switch (difficulty) {
    case DIFFICULTY_EASY: return new RandomAI({ size, rng });
    case DIFFICULTY_NORMAL: return new HuntTargetAI({ size, rng });
    case DIFFICULTY_HARD: return new DensityAI({ size, rng, shipLengths });
    default: throw new Error(`Unknown difficulty: ${difficulty}`);
  }
}
