import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  Game, PHASE_PLACEMENT, PHASE_PLAYER_TURN, PHASE_AI_TURN, PHASE_GAME_OVER, PLAYER, AI,
} from '../js/game.js';
import { FLEET, HORIZONTAL, VERTICAL, SHOT_MISS } from '../js/board.js';
import { createRng } from '../js/rng.js';

function readyGame(seed = 1) {
  const game = new Game({ rng: createRng(seed) });
  game.randomizePlayerShips();
  assert.equal(game.startBattle().ok, true);
  return game;
}

function enemyShipCells(game) {
  return game.enemyBoard.ships.flatMap((s) => s.cells);
}

function emptyEnemyCells(game) {
  const cells = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
    if (!game.enemyBoard.shipAt(r, c)) cells.push({ row: r, col: c });
  }
  return cells;
}

describe('placement phase', () => {
  test('new game starts in placement with an AI fleet placed and no player ships', () => {
    const game = new Game({ rng: createRng(1) });
    assert.equal(game.phase, PHASE_PLACEMENT);
    assert.equal(game.enemyBoard.ships.length, 5);
    assert.equal(game.playerBoard.ships.length, 0);
    assert.equal(game.selectedShipId, 'carrier');
  });

  test('placing ships auto-selects the next unplaced ship', () => {
    const game = new Game({ rng: createRng(1) });
    assert.equal(game.placePlayerShip(0, 0).ok, true);
    assert.equal(game.selectedShipId, 'battleship');
  });

  test('rotate toggles orientation used for placement', () => {
    const game = new Game({ rng: createRng(1) });
    assert.equal(game.rotate(), VERTICAL);
    game.placePlayerShip(0, 9);
    assert.equal(game.playerBoard.getShip('carrier').orientation, VERTICAL);
    assert.equal(game.rotate(), HORIZONTAL);
  });

  test('invalid placement is rejected and keeps the ship selected', () => {
    const game = new Game({ rng: createRng(1) });
    const res = game.placePlayerShip(0, 8); // carrier horizontally off the edge
    assert.equal(res.ok, false);
    assert.equal(game.selectedShipId, 'carrier');
    assert.equal(game.playerBoard.ships.length, 0);
  });

  test('re-placing an already-placed ship moves it (no duplicates)', () => {
    const game = new Game({ rng: createRng(1) });
    game.placePlayerShip(0, 0, 'destroyer', HORIZONTAL);
    // Moving the destroyer onto its own old cells is allowed.
    assert.equal(game.placePlayerShip(0, 1, 'destroyer', HORIZONTAL).ok, true);
    assert.equal(game.playerBoard.ships.length, 1);
    assert.equal(game.playerBoard.shipAt(0, 0), null);
  });

  test('pickUpShip removes the ship and selects it with its orientation', () => {
    const game = new Game({ rng: createRng(1) });
    game.placePlayerShip(2, 2, 'cruiser', VERTICAL);
    assert.equal(game.pickUpShip(3, 2), 'cruiser');
    assert.equal(game.selectedShipId, 'cruiser');
    assert.equal(game.orientation, VERTICAL);
    assert.equal(game.playerBoard.getShip('cruiser'), null);
  });

  test('cannot start the battle until every ship is placed', () => {
    const game = new Game({ rng: createRng(1) });
    game.placePlayerShip(0, 0);
    assert.deepEqual(game.startBattle(), { ok: false, reason: 'fleet-incomplete' });
    assert.equal(game.phase, PHASE_PLACEMENT);
    game.randomizePlayerShips();
    assert.equal(game.startBattle().ok, true);
    assert.equal(game.phase, PHASE_PLAYER_TURN);
  });

  test('placement actions are ignored once the battle has started', () => {
    const game = readyGame();
    assert.equal(game.placePlayerShip(0, 0).ok, false);
    assert.equal(game.randomizePlayerShips(), false);
    assert.equal(game.clearPlayerShips(), false);
    assert.equal(game.pickUpShip(0, 0), null);
    assert.equal(game.playerBoard.ships.length, 5);
  });
});

describe('turns', () => {
  test('cannot fire during placement', () => {
    const game = new Game({ rng: createRng(1) });
    assert.equal(game.playerFire(0, 0).reason, 'not-your-turn');
  });

  test('player shot hands the turn to the AI, AI shot hands it back', () => {
    const game = readyGame();
    assert.equal(game.playerFire(0, 0).ok, true);
    assert.equal(game.phase, PHASE_AI_TURN);
    assert.equal(game.aiFire().ok, true);
    assert.equal(game.phase, PHASE_PLAYER_TURN);
  });

  test('player cannot fire during the AI turn (e.g. fast double click)', () => {
    const game = readyGame();
    game.playerFire(0, 0);
    const second = game.playerFire(0, 1);
    assert.deepEqual(second, { ok: false, reason: 'not-your-turn' });
    assert.equal(game.enemyBoard.hasShot(0, 1), false);
    assert.equal(game.stats[PLAYER].shots, 1);
  });

  test('AI cannot fire on the player turn', () => {
    const game = readyGame();
    assert.equal(game.aiFire().ok, false);
    assert.equal(game.stats[AI].shots, 0);
  });

  test('clicking an already-shot cell is rejected and keeps the player turn', () => {
    const game = readyGame();
    game.playerFire(4, 4);
    game.aiFire();
    const res = game.playerFire(4, 4);
    assert.deepEqual(res, { ok: false, reason: 'already-shot' });
    assert.equal(game.phase, PHASE_PLAYER_TURN);
    assert.equal(game.stats[PLAYER].shots, 1);
  });
});

describe('lastShots (shown in the "Enemy fired at ..." status line)', () => {
  test('records each side\'s latest shot with its result', () => {
    const game = readyGame(2);
    assert.deepEqual(game.lastShots, { player: null, ai: null });
    const res = game.playerFire(3, 4);
    assert.deepEqual(game.lastShots.player, { row: 3, col: 4, result: res.result, shipName: null });
    assert.equal(game.lastShots.ai, null);
    const ai = game.aiFire();
    assert.equal(game.lastShots.ai.row, ai.row);
    assert.equal(game.lastShots.ai.col, ai.col);
    assert.equal(game.lastShots.ai.result, ai.result);
  });

  test('a rejected shot does not change it', () => {
    const game = readyGame(2);
    game.playerFire(3, 4);
    game.aiFire();
    const before = structuredClone(game.lastShots);
    game.playerFire(3, 4);
    assert.deepEqual(game.lastShots, before);
  });

  test('names the ship when a shot sinks it', () => {
    const game = new Game({ rng: createRng(3) });
    game.placePlayerShip(0, 0, 'carrier', HORIZONTAL);
    game.placePlayerShip(1, 0, 'battleship', HORIZONTAL);
    game.placePlayerShip(2, 0, 'cruiser', HORIZONTAL);
    game.placePlayerShip(3, 0, 'submarine', HORIZONTAL);
    game.placePlayerShip(9, 8, 'destroyer', HORIZONTAL);
    game.startBattle();
    const targets = emptyEnemyCells(game);
    let sunk = null;
    for (let i = 0; !sunk && game.phase !== PHASE_GAME_OVER; i++) {
      game.playerFire(targets[i].row, targets[i].col);
      if (game.aiFire().result === 'sunk') sunk = game.lastShots.ai;
    }
    assert.ok(sunk, 'AI never sank a ship');
    const ship = game.playerBoard.shipAt(sunk.row, sunk.col);
    assert.equal(sunk.shipName, ship.name);
  });
});

describe('aiThinking', () => {
  test('null during placement and after game over, the AI pool during battle', () => {
    const game = new Game({ rng: createRng(4) });
    assert.equal(game.aiThinking(), null);
    game.randomizePlayerShips();
    game.startBattle();
    assert.deepEqual(game.aiThinking(), game.ai.candidatePool());
    assert.equal(game.aiThinking().mode, 'hunt');
    let i = 0;
    const targets = emptyEnemyCells(game);
    while (game.phase !== PHASE_GAME_OVER) {
      if (game.phase === PHASE_PLAYER_TURN) {
        const t = targets[i++];
        game.playerFire(t.row, t.col);
      } else {
        assert.deepEqual(game.aiThinking(), game.ai.candidatePool());
        game.aiFire();
        if (game.phase !== PHASE_GAME_OVER) assert.deepEqual(game.aiThinking(), game.ai.candidatePool());
      }
    }
    assert.equal(game.aiThinking(), null);
  });
});

describe('win condition', () => {
  test('player wins when every enemy ship cell is hit', () => {
    const game = readyGame(3);
    const misses = emptyEnemyCells(game);
    const cells = enemyShipCells(game);
    cells.forEach((cell, i) => {
      assert.equal(game.playerFire(cell.row, cell.col).ok, true);
      if (i < cells.length - 1) {
        assert.equal(game.phase, PHASE_AI_TURN);
        game.aiFire();
      }
    });
    assert.equal(game.phase, PHASE_GAME_OVER);
    assert.equal(game.winner, PLAYER);
    assert.equal(game.playerFire(misses[0].row, misses[0].col).ok, false, 'no shots after game over');
    assert.equal(game.aiFire().ok, false);
  });

  test('AI wins when it sinks the whole player fleet', () => {
    const game = readyGame(4);
    const misses = emptyEnemyCells(game);
    let i = 0;
    while (game.phase !== PHASE_GAME_OVER) {
      const cell = misses[i++];
      assert.equal(game.playerFire(cell.row, cell.col).result, SHOT_MISS);
      game.aiFire();
    }
    assert.equal(game.winner, AI);
    assert.equal(game.playerBoard.allSunk(), true);
    assert.equal(game.enemyBoard.allSunk(), false);
  });

  test('full simulated games always end with exactly one winner', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const game = readyGame(seed);
      const order = [];
      for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) order.push({ row: r, col: c });
      let i = 0;
      while (game.phase !== PHASE_GAME_OVER) {
        if (game.phase === PHASE_PLAYER_TURN) {
          const { row, col } = order[i++];
          assert.equal(game.playerFire(row, col).ok, true);
        } else {
          assert.equal(game.aiFire().ok, true);
        }
      }
      assert.ok(game.winner === PLAYER || game.winner === AI);
      const loserBoard = game.winner === PLAYER ? game.enemyBoard : game.playerBoard;
      const winnerBoard = game.winner === PLAYER ? game.playerBoard : game.enemyBoard;
      assert.equal(loserBoard.allSunk(), true);
      assert.equal(winnerBoard.allSunk(), false);
    }
  });
});

describe('new game resets all state', () => {
  function assertFreshState(game) {
    assert.equal(game.phase, PHASE_PLACEMENT);
    assert.equal(game.winner, null);
    assert.equal(game.orientation, HORIZONTAL);
    assert.equal(game.selectedShipId, FLEET[0].id);
    assert.equal(game.playerBoard.ships.length, 0);
    assert.equal(game.enemyBoard.ships.length, 5);
    assert.ok(game.enemyBoard.ships.every((s) => s.hits === 0));
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
      assert.equal(game.playerBoard.shots[r][c], null);
      assert.equal(game.enemyBoard.shots[r][c], null);
      assert.equal(game.playerBoard.shipAt(r, c), null);
    }
    assert.equal(game.ai.tried.size, 0);
    assert.equal(game.ai.openHits.length, 0);
    assert.deepEqual(game.stats, { player: { shots: 0, hits: 0 }, ai: { shots: 0, hits: 0 } });
    assert.equal(game.log.length, 1);
    assert.deepEqual(game.lastShots, { player: null, ai: null });
  }

  test('restarting mid-game', () => {
    const game = readyGame(5);
    game.rotate();
    for (let i = 0; i < 10; i++) {
      game.playerFire(i, i);
      game.aiFire();
    }
    const oldId = game.gameId;
    game.newGame();
    assert.equal(game.gameId, oldId + 1);
    assertFreshState(game);
  });

  test('restarting during the AI turn leaves no pending AI turn', () => {
    const game = readyGame(6);
    game.playerFire(0, 0);
    assert.equal(game.phase, PHASE_AI_TURN);
    game.newGame();
    assert.equal(game.aiFire().ok, false);
    assertFreshState(game);
  });

  test('restarting after game over', () => {
    const game = readyGame(7);
    for (const cell of enemyShipCells(game)) {
      game.playerFire(cell.row, cell.col);
      if (game.phase === PHASE_AI_TURN) game.aiFire();
    }
    assert.equal(game.phase, PHASE_GAME_OVER);
    game.newGame();
    assertFreshState(game);
  });

  test('restarting during placement', () => {
    const game = new Game({ rng: createRng(8) });
    game.placePlayerShip(0, 0);
    game.rotate();
    game.newGame();
    assertFreshState(game);
  });

  test('enemy fleet is re-randomised on each new game', () => {
    const game = new Game({ rng: createRng(9) });
    const layout = () => JSON.stringify(game.enemyBoard.ships.map((s) => s.cells));
    const first = layout();
    game.newGame();
    assert.notEqual(layout(), first);
  });
});
