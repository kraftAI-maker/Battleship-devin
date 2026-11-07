import { randomInt } from './rng.js';

export const BOARD_SIZE = 10;

export const HORIZONTAL = 'horizontal';
export const VERTICAL = 'vertical';

export const FLEET = Object.freeze([
  Object.freeze({ id: 'carrier', name: 'Carrier', length: 5 }),
  Object.freeze({ id: 'battleship', name: 'Battleship', length: 4 }),
  Object.freeze({ id: 'cruiser', name: 'Cruiser', length: 3 }),
  Object.freeze({ id: 'submarine', name: 'Submarine', length: 3 }),
  Object.freeze({ id: 'destroyer', name: 'Destroyer', length: 2 }),
]);

export const SHOT_MISS = 'miss';
export const SHOT_HIT = 'hit';
export const SHOT_SUNK = 'sunk';

export function toggleOrientation(orientation) {
  return orientation === HORIZONTAL ? VERTICAL : HORIZONTAL;
}

export function shipCells(row, col, length, orientation) {
  const cells = [];
  for (let i = 0; i < length; i++) {
    cells.push(orientation === HORIZONTAL ? { row, col: col + i } : { row: row + i, col });
  }
  return cells;
}

export function coordLabel(row, col) {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

export class Board {
  constructor(size = BOARD_SIZE) {
    this.size = size;
    this.reset();
  }

  reset() {
    this.ships = [];
    this.grid = Array.from({ length: this.size }, () => Array(this.size).fill(null));
    this.shots = Array.from({ length: this.size }, () => Array(this.size).fill(null));
  }

  inBounds(row, col) {
    return (
      Number.isInteger(row) && Number.isInteger(col) &&
      row >= 0 && col >= 0 && row < this.size && col < this.size
    );
  }

  getShip(id) {
    return this.ships.find((s) => s.id === id) || null;
  }

  shipAt(row, col) {
    if (!this.inBounds(row, col)) return null;
    return this.grid[row][col];
  }

  canPlace(length, row, col, orientation, ignoreShipId = null) {
    if (orientation !== HORIZONTAL && orientation !== VERTICAL) {
      return { ok: false, reason: 'invalid-orientation' };
    }
    if (!Number.isInteger(length) || length < 1) {
      return { ok: false, reason: 'invalid-length' };
    }
    const cells = shipCells(row, col, length, orientation);
    for (const cell of cells) {
      if (!this.inBounds(cell.row, cell.col)) return { ok: false, reason: 'out-of-bounds' };
    }
    for (const cell of cells) {
      const occupant = this.grid[cell.row][cell.col];
      if (occupant && occupant.id !== ignoreShipId) return { ok: false, reason: 'overlap' };
    }
    return { ok: true, reason: null };
  }

  placeShip(spec, row, col, orientation) {
    if (this.getShip(spec.id)) {
      return { ok: false, reason: 'already-placed' };
    }
    const check = this.canPlace(spec.length, row, col, orientation);
    if (!check.ok) return check;
    const ship = {
      id: spec.id,
      name: spec.name,
      length: spec.length,
      row,
      col,
      orientation,
      cells: shipCells(row, col, spec.length, orientation),
      hits: 0,
    };
    for (const cell of ship.cells) this.grid[cell.row][cell.col] = ship;
    this.ships.push(ship);
    return { ok: true, reason: null, ship };
  }

  removeShip(id) {
    const ship = this.getShip(id);
    if (!ship) return false;
    for (const cell of ship.cells) this.grid[cell.row][cell.col] = null;
    this.ships = this.ships.filter((s) => s !== ship);
    return true;
  }

  placeFleetRandomly(fleet, rng = Math.random, maxAttempts = 100) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (this.tryPlaceFleetRandomly(fleet, rng)) return;
    }
    for (const spec of fleet) this.removeShip(spec.id);
    throw new Error('Fleet does not fit on this board');
  }

  tryPlaceFleetRandomly(fleet, rng) {
    for (const spec of fleet) this.removeShip(spec.id);
    for (const spec of fleet) {
      const options = [];
      for (const orientation of [HORIZONTAL, VERTICAL]) {
        for (let r = 0; r < this.size; r++) {
          for (let c = 0; c < this.size; c++) {
            if (this.canPlace(spec.length, r, c, orientation).ok) options.push([r, c, orientation]);
          }
        }
      }
      if (options.length === 0) return false;
      const [r, c, o] = options[randomInt(rng, options.length)];
      this.placeShip(spec, r, c, o);
    }
    return true;
  }

  hasShot(row, col) {
    return this.inBounds(row, col) && this.shots[row][col] !== null;
  }

  receiveAttack(row, col) {
    if (!this.inBounds(row, col)) return { valid: false, reason: 'out-of-bounds' };
    if (this.shots[row][col] !== null) return { valid: false, reason: 'already-shot' };
    const ship = this.grid[row][col];
    if (!ship) {
      this.shots[row][col] = SHOT_MISS;
      return { valid: true, result: SHOT_MISS, row, col, ship: null };
    }
    this.shots[row][col] = SHOT_HIT;
    ship.hits += 1;
    const sunk = isSunk(ship);
    return { valid: true, result: sunk ? SHOT_SUNK : SHOT_HIT, row, col, ship };
  }

  allSunk() {
    return this.ships.length > 0 && this.ships.every(isSunk);
  }

  remainingShips() {
    return this.ships.filter((s) => !isSunk(s));
  }
}

export function isSunk(ship) {
  return ship.hits >= ship.length;
}
