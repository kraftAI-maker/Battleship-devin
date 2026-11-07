import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  Board, FLEET, HORIZONTAL, VERTICAL, SHOT_HIT, SHOT_MISS, SHOT_SUNK, shipCells, coordLabel,
} from '../js/board.js';
import { createRng } from '../js/rng.js';

const spec = (id) => FLEET.find((s) => s.id === id);

describe('placement validation', () => {
  test('accepts a ship fully inside the board', () => {
    const b = new Board();
    assert.equal(b.placeShip(spec('carrier'), 0, 0, HORIZONTAL).ok, true);
    assert.deepEqual(b.getShip('carrier').cells, shipCells(0, 0, 5, HORIZONTAL));
  });

  test('rejects overlapping ships', () => {
    const b = new Board();
    b.placeShip(spec('carrier'), 2, 2, HORIZONTAL); // C3..G3
    const res = b.placeShip(spec('battleship'), 0, 4, VERTICAL); // crosses E3
    assert.deepEqual([res.ok, res.reason], [false, 'overlap']);
    assert.equal(b.getShip('battleship'), null);
    assert.equal(b.shipAt(0, 4), null, 'failed placement must not leave partial cells');
  });

  test('allows ships to touch (adjacent, non-overlapping)', () => {
    const b = new Board();
    assert.equal(b.placeShip(spec('carrier'), 0, 0, HORIZONTAL).ok, true);
    assert.equal(b.placeShip(spec('battleship'), 1, 0, HORIZONTAL).ok, true);
  });

  test('rejects out-of-bounds placement (negative and past the edge)', () => {
    const b = new Board();
    assert.equal(b.canPlace(5, -1, 0, HORIZONTAL).reason, 'out-of-bounds');
    assert.equal(b.canPlace(5, 0, -1, VERTICAL).reason, 'out-of-bounds');
    assert.equal(b.canPlace(5, 10, 0, HORIZONTAL).reason, 'out-of-bounds');
    assert.equal(b.canPlace(2, 0, 10, VERTICAL).reason, 'out-of-bounds');
  });

  test('rotation at the right edge: horizontal fails, vertical fits', () => {
    const b = new Board();
    // Carrier starting at column H (7): H..L would overflow horizontally.
    assert.equal(b.canPlace(5, 0, 7, HORIZONTAL).ok, false);
    assert.equal(b.canPlace(5, 0, 7, VERTICAL).ok, true);
    // Exactly touching the edge is fine.
    assert.equal(b.canPlace(5, 0, 5, HORIZONTAL).ok, true);
  });

  test('rotation at the bottom edge: vertical fails, horizontal fits', () => {
    const b = new Board();
    assert.equal(b.canPlace(4, 7, 0, VERTICAL).ok, false);
    assert.equal(b.canPlace(4, 7, 0, HORIZONTAL).ok, true);
    assert.equal(b.canPlace(4, 6, 0, VERTICAL).ok, true);
  });

  test('bottom-right corner only fits a length-1 ship', () => {
    const b = new Board();
    assert.equal(b.canPlace(2, 9, 9, HORIZONTAL).ok, false);
    assert.equal(b.canPlace(2, 9, 9, VERTICAL).ok, false);
    assert.equal(b.canPlace(1, 9, 9, VERTICAL).ok, true);
  });

  test('rejects invalid orientation and duplicate ship ids', () => {
    const b = new Board();
    assert.equal(b.canPlace(3, 0, 0, 'diagonal').reason, 'invalid-orientation');
    b.placeShip(spec('cruiser'), 0, 0, HORIZONTAL);
    assert.equal(b.placeShip(spec('cruiser'), 5, 5, HORIZONTAL).reason, 'already-placed');
  });

  test('removeShip frees the cells for re-placement', () => {
    const b = new Board();
    b.placeShip(spec('cruiser'), 0, 0, HORIZONTAL);
    assert.equal(b.removeShip('cruiser'), true);
    assert.equal(b.shipAt(0, 0), null);
    assert.equal(b.placeShip(spec('cruiser'), 0, 0, VERTICAL).ok, true);
  });

  test('random fleet placement is always valid', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const b = new Board();
      b.placeFleetRandomly(FLEET, createRng(seed));
      assert.equal(b.ships.length, 5);
      let occupied = 0;
      for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) if (b.shipAt(r, c)) occupied++;
      assert.equal(occupied, 5 + 4 + 3 + 3 + 2, `seed ${seed}: ships overlap or are missing`);
      for (const ship of b.ships) {
        for (const cell of ship.cells) assert.ok(b.inBounds(cell.row, cell.col));
      }
    }
  });
});

test('random placement always succeeds for a dense fleet that exactly fills the board', () => {
  // 25 cells on a 5x5 board: greedy random placement dead-ends on most seeds.
  const dense = [...FLEET, { id: 'x', name: 'X', length: 4 }, { id: 'y', name: 'Y', length: 4 }];
  for (let seed = 1; seed <= 30; seed++) {
    const b = new Board(5);
    b.placeFleetRandomly(dense, createRng(seed));
    assert.equal(b.ships.length, dense.length);
    assert.ok(b.grid.every((row) => row.every((cell) => cell !== null)));
  }
});

test('random placement of a fleet that cannot fit throws instead of recursing forever', () => {
  const b = new Board(3);
  assert.throws(() => b.placeFleetRandomly([spec('carrier')], createRng(1)), /does not fit/);
  assert.equal(b.ships.length, 0);
  // Each ship fits alone, but three 2-long ships (6 cells) can't share a 2x2 board.
  const crowded = new Board(2);
  const pairs = ['a', 'b', 'c'].map((id) => ({ id, name: id, length: 2 }));
  assert.throws(() => crowded.placeFleetRandomly(pairs, createRng(1)), /does not fit/);
  assert.equal(crowded.ships.length, 0);
});

describe('hit / miss / sunk detection', () => {
  test('miss on empty water, hit on a ship', () => {
    const b = new Board();
    b.placeShip(spec('destroyer'), 4, 4, HORIZONTAL);
    assert.equal(b.receiveAttack(0, 0).result, SHOT_MISS);
    assert.equal(b.receiveAttack(4, 4).result, SHOT_HIT);
  });

  test('last hit on a ship reports sunk with the ship', () => {
    const b = new Board();
    b.placeShip(spec('destroyer'), 4, 4, HORIZONTAL);
    b.receiveAttack(4, 4);
    const res = b.receiveAttack(4, 5);
    assert.equal(res.result, SHOT_SUNK);
    assert.equal(res.ship.id, 'destroyer');
  });

  test('repeat shot on the same cell is rejected and does not double count', () => {
    const b = new Board();
    b.placeShip(spec('destroyer'), 0, 0, HORIZONTAL);
    b.receiveAttack(0, 0);
    const res = b.receiveAttack(0, 0);
    assert.deepEqual([res.valid, res.reason], [false, 'already-shot']);
    assert.equal(b.getShip('destroyer').hits, 1);
    assert.equal(b.receiveAttack(5, 5).result, SHOT_MISS);
    assert.equal(b.receiveAttack(5, 5).reason, 'already-shot');
  });

  test('out-of-bounds attack is rejected', () => {
    const b = new Board();
    assert.equal(b.receiveAttack(10, 0).reason, 'out-of-bounds');
    assert.equal(b.receiveAttack(0, -1).reason, 'out-of-bounds');
  });

  test('adjacent parallel ships: hits are attributed to the correct ship', () => {
    const b = new Board();
    b.placeShip(spec('destroyer'), 0, 0, HORIZONTAL); // A1,B1
    b.placeShip(spec('cruiser'), 1, 0, HORIZONTAL); // A2,B2,C2
    assert.equal(b.receiveAttack(0, 0).result, SHOT_HIT);
    assert.equal(b.receiveAttack(1, 0).result, SHOT_HIT);
    assert.equal(b.receiveAttack(1, 1).result, SHOT_HIT);
    const sunkDestroyer = b.receiveAttack(0, 1);
    assert.equal(sunkDestroyer.result, SHOT_SUNK);
    assert.equal(sunkDestroyer.ship.id, 'destroyer');
    assert.equal(b.getShip('cruiser').hits, 2);
    const sunkCruiser = b.receiveAttack(1, 2);
    assert.equal(sunkCruiser.result, SHOT_SUNK);
    assert.equal(sunkCruiser.ship.id, 'cruiser');
  });

  test('adjacent end-to-end ships do not sink each other', () => {
    const b = new Board();
    b.placeShip(spec('destroyer'), 0, 0, HORIZONTAL); // A1,B1
    b.placeShip(spec('submarine'), 0, 2, HORIZONTAL); // C1,D1,E1
    b.receiveAttack(0, 0);
    b.receiveAttack(0, 1);
    assert.equal(b.getShip('submarine').hits, 0);
    assert.equal(b.receiveAttack(0, 2).result, SHOT_HIT);
  });
});

describe('win condition', () => {
  test('allSunk is false with an empty board', () => {
    assert.equal(new Board().allSunk(), false);
  });

  test('allSunk only becomes true after the final ship cell is hit', () => {
    const b = new Board();
    b.placeFleetRandomly(FLEET, createRng(42));
    const cells = b.ships.flatMap((s) => s.cells);
    cells.forEach((cell, i) => {
      assert.equal(b.allSunk(), false, `fleet reported sunk after only ${i} hits`);
      b.receiveAttack(cell.row, cell.col);
    });
    assert.equal(b.allSunk(), true);
    assert.equal(b.remainingShips().length, 0);
  });

  test('misses never win the game', () => {
    const b = new Board();
    b.placeShip(spec('destroyer'), 0, 0, HORIZONTAL);
    for (let r = 2; r < 10; r++) for (let c = 0; c < 10; c++) b.receiveAttack(r, c);
    assert.equal(b.allSunk(), false);
  });
});

test('coordLabel uses column letter + row number', () => {
  assert.equal(coordLabel(0, 0), 'A1');
  assert.equal(coordLabel(9, 9), 'J10');
});
