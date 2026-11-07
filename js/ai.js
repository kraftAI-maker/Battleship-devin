import { BOARD_SIZE, SHOT_HIT, SHOT_MISS, SHOT_SUNK } from './board.js';
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

  get mode() {
    return this.openHits.length > 0 ? MODE_TARGET : MODE_HUNT;
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

  nextShot() {
    if (this.tried.size >= this.size * this.size) {
      throw new Error('No cells left to shoot');
    }
    const targets = this.targetCandidates();
    const pool = targets.length > 0 ? targets : this.huntCandidates();
    return pool[randomInt(this.rng, pool.length)];
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
