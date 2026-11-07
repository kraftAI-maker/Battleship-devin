import {
  Board, BOARD_SIZE, FLEET, HORIZONTAL, SHOT_HIT, SHOT_MISS, SHOT_SUNK, coordLabel, toggleOrientation,
} from './board.js';
import { HuntTargetAI } from './ai.js';

export const PHASE_PLACEMENT = 'placement';
export const PHASE_PLAYER_TURN = 'player-turn';
export const PHASE_AI_TURN = 'ai-turn';
export const PHASE_GAME_OVER = 'game-over';

export const PLAYER = 'player';
export const AI = 'ai';

/**
 * Pure game state machine (no DOM). The UI calls these methods and then
 * re-renders from the public state.
 *
 *   placement --startBattle--> player-turn <--> ai-turn --> game-over
 */
export class Game {
  constructor({ size = BOARD_SIZE, fleet = FLEET, rng = Math.random } = {}) {
    this.size = size;
    this.fleet = fleet;
    this.rng = rng;
    this.gameId = 0;
    this.playerBoard = new Board(size);
    this.enemyBoard = new Board(size);
    this.ai = new HuntTargetAI({ size, rng });
    this.newGame();
  }

  newGame() {
    this.gameId += 1;
    this.playerBoard.reset();
    this.enemyBoard.reset();
    this.enemyBoard.placeFleetRandomly(this.fleet, this.rng);
    this.ai.reset();
    this.phase = PHASE_PLACEMENT;
    this.winner = null;
    this.orientation = HORIZONTAL;
    this.selectedShipId = this.fleet[0].id;
    this.log = [];
    this.lastShots = { [PLAYER]: null, [AI]: null };
    this.stats = {
      [PLAYER]: { shots: 0, hits: 0 },
      [AI]: { shots: 0, hits: 0 },
    };
    this.addLog('system', 'Place your fleet. Pick a ship, then choose a cell on your board.');
  }

  addLog(actor, text, kind = 'info') {
    this.log.push({ actor, text, kind });
  }

  // ---- placement -------------------------------------------------------

  unplacedShips() {
    return this.fleet.filter((s) => !this.playerBoard.getShip(s.id));
  }

  allShipsPlaced() {
    return this.unplacedShips().length === 0;
  }

  selectShip(id) {
    if (this.phase !== PHASE_PLACEMENT) return false;
    if (!this.fleet.some((s) => s.id === id)) return false;
    this.selectedShipId = id;
    return true;
  }

  rotate() {
    if (this.phase !== PHASE_PLACEMENT) return this.orientation;
    this.orientation = toggleOrientation(this.orientation);
    return this.orientation;
  }

  /** Can the currently selected ship be placed (or moved) at row/col? */
  previewPlacement(row, col, shipId = this.selectedShipId, orientation = this.orientation) {
    const spec = this.fleet.find((s) => s.id === shipId);
    if (!spec || this.phase !== PHASE_PLACEMENT) return { ok: false, reason: 'not-placing', cells: [] };
    const check = this.playerBoard.canPlace(spec.length, row, col, orientation, shipId);
    const cells = [];
    for (let i = 0; i < spec.length; i++) {
      const r = orientation === HORIZONTAL ? row : row + i;
      const c = orientation === HORIZONTAL ? col + i : col;
      if (this.playerBoard.inBounds(r, c)) cells.push({ row: r, col: c });
    }
    return { ...check, cells };
  }

  placePlayerShip(row, col, shipId = this.selectedShipId, orientation = this.orientation) {
    if (this.phase !== PHASE_PLACEMENT) return { ok: false, reason: 'not-placing' };
    const spec = this.fleet.find((s) => s.id === shipId);
    if (!spec) return { ok: false, reason: 'no-ship-selected' };
    const check = this.playerBoard.canPlace(spec.length, row, col, orientation, shipId);
    if (!check.ok) return check;
    this.playerBoard.removeShip(shipId);
    const res = this.playerBoard.placeShip(spec, row, col, orientation);
    const next = this.unplacedShips()[0];
    this.selectedShipId = next ? next.id : null;
    return res;
  }

  /** Remove the player's ship at row/col so it can be re-placed. */
  pickUpShip(row, col) {
    if (this.phase !== PHASE_PLACEMENT) return null;
    const ship = this.playerBoard.shipAt(row, col);
    if (!ship) return null;
    this.playerBoard.removeShip(ship.id);
    this.selectedShipId = ship.id;
    this.orientation = ship.orientation;
    return ship.id;
  }

  randomizePlayerShips() {
    if (this.phase !== PHASE_PLACEMENT) return false;
    this.playerBoard.placeFleetRandomly(this.fleet, this.rng);
    this.selectedShipId = null;
    return true;
  }

  clearPlayerShips() {
    if (this.phase !== PHASE_PLACEMENT) return false;
    this.playerBoard.reset();
    this.selectedShipId = this.fleet[0].id;
    return true;
  }

  startBattle() {
    if (this.phase !== PHASE_PLACEMENT) return { ok: false, reason: 'not-placing' };
    if (!this.allShipsPlaced()) return { ok: false, reason: 'fleet-incomplete' };
    this.phase = PHASE_PLAYER_TURN;
    this.selectedShipId = null;
    this.addLog('system', 'Battle started. Fire at the enemy waters!');
    return { ok: true };
  }

  // ---- battle ----------------------------------------------------------

  playerFire(row, col) {
    if (this.phase !== PHASE_PLAYER_TURN) return { ok: false, reason: 'not-your-turn' };
    const res = this.enemyBoard.receiveAttack(row, col);
    if (!res.valid) return { ok: false, reason: res.reason };
    this.recordShot(PLAYER, res);
    if (this.enemyBoard.allSunk()) {
      this.finish(PLAYER);
    } else {
      this.phase = PHASE_AI_TURN;
    }
    return { ok: true, ...res };
  }

  aiFire() {
    if (this.phase !== PHASE_AI_TURN) return { ok: false, reason: 'not-ai-turn' };
    const { row, col } = this.ai.nextShot();
    const res = this.playerBoard.receiveAttack(row, col);
    if (!res.valid) {
      // Should be impossible: the AI tracks its own shots.
      throw new Error(`AI fired an invalid shot at ${coordLabel(row, col)}: ${res.reason}`);
    }
    this.ai.recordResult(row, col, res.result, res.result === SHOT_SUNK ? res.ship.cells : []);
    this.recordShot(AI, res);
    if (this.playerBoard.allSunk()) {
      this.finish(AI);
    } else {
      this.phase = PHASE_PLAYER_TURN;
    }
    return { ok: true, ...res };
  }

  /**
   * What the AI is considering for its next shot, straight from
   * HuntTargetAI.candidatePool(). Null outside the battle.
   * @returns {{mode: 'hunt'|'target', cells: {row:number,col:number}[]}|null}
   */
  aiThinking() {
    if (this.phase !== PHASE_PLAYER_TURN && this.phase !== PHASE_AI_TURN) return null;
    return this.ai.candidatePool();
  }

  recordShot(actor, res) {
    this.lastShots[actor] = {
      row: res.row,
      col: res.col,
      result: res.result,
      shipName: res.result === SHOT_SUNK ? res.ship.name : null,
    };
    const stats = this.stats[actor];
    stats.shots += 1;
    if (res.result !== SHOT_MISS) stats.hits += 1;
    const who = actor === PLAYER ? 'You' : 'Enemy';
    const at = coordLabel(res.row, res.col);
    if (res.result === SHOT_MISS) {
      this.addLog(actor, `${who} fired at ${at}: miss.`, SHOT_MISS);
    } else if (res.result === SHOT_HIT) {
      this.addLog(actor, `${who} fired at ${at}: hit!`, SHOT_HIT);
    } else {
      const whose = actor === PLAYER ? 'enemy' : 'your';
      this.addLog(actor, `${who} fired at ${at}: sunk ${whose} ${res.ship.name}!`, SHOT_SUNK);
    }
  }

  finish(winner) {
    this.phase = PHASE_GAME_OVER;
    this.winner = winner;
    this.addLog('system', winner === PLAYER ? 'You win! The enemy fleet is destroyed.' : 'You lose. Your fleet has been sunk.');
  }
}
