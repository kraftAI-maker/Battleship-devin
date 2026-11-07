import {
  Game, PHASE_PLACEMENT, PHASE_PLAYER_TURN, PHASE_AI_TURN, PHASE_GAME_OVER, PLAYER,
} from './game.js';
import { HORIZONTAL, SHOT_HIT, SHOT_MISS, coordLabel } from './board.js';

const AI_DELAY_MS = 700;

const $ = (id) => document.getElementById(id);
const el = {
  body: document.body,
  turn: $('turn-indicator'),
  hint: $('hint'),
  shipList: $('ship-list'),
  rotate: $('rotate'),
  orientationLabel: $('orientation-label'),
  random: $('random-placement'),
  clear: $('clear-placement'),
  start: $('start-battle'),
  playerBoard: $('player-board'),
  enemyBoard: $('enemy-board'),
  playerLeft: $('player-left'),
  enemyLeft: $('enemy-left'),
  log: $('log'),
  newGame: $('new-game'),
  overlay: $('overlay'),
  resultTitle: $('result-title'),
  resultText: $('result-text'),
  overlayNewGame: $('overlay-new-game'),
  overlayClose: $('overlay-close'),
};

const game = new Game();
let aiTimer = null;
let preview = null; // { row, col } hovered cell on the player board during placement
let lastShot = { player: null, ai: null };
let overlayDismissed = false;

// ---- board construction ------------------------------------------------

function buildBoard(container, owner) {
  container.innerHTML = '';
  container.appendChild(document.createElement('span'));
  for (let c = 0; c < game.size; c++) {
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = String.fromCharCode(65 + c);
    container.appendChild(label);
  }
  const cells = [];
  for (let r = 0; r < game.size; r++) {
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = String(r + 1);
    container.appendChild(label);
    cells.push([]);
    for (let c = 0; c < game.size; c++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      cell.dataset.owner = owner;
      container.appendChild(cell);
      cells[r].push(cell);
    }
  }
  return cells;
}

const playerCells = buildBoard(el.playerBoard, 'player');
const enemyCells = buildBoard(el.enemyBoard, 'enemy');

function cellFromEvent(event) {
  const cell = event.target.closest('.cell');
  if (!cell) return null;
  return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
}

// ---- rendering -----------------------------------------------------------

function setHint(text, isError = false) {
  el.hint.textContent = text;
  el.hint.classList.toggle('error', isError);
}

function turnText() {
  switch (game.phase) {
    case PHASE_PLACEMENT: return 'Place your fleet';
    case PHASE_PLAYER_TURN: return 'Your turn: fire at the enemy';
    case PHASE_AI_TURN: return 'Enemy is aiming...';
    case PHASE_GAME_OVER: return game.winner === PLAYER ? 'Victory!' : 'Defeat';
    default: return '';
  }
}

function cellStateName(board, r, c) {
  const shot = board.shots[r][c];
  if (shot === SHOT_MISS) return 'miss';
  if (shot === SHOT_HIT) {
    const ship = board.shipAt(r, c);
    return ship && ship.hits >= ship.length ? 'sunk' : 'hit';
  }
  return null;
}

function renderBoard(cells, board, { showShips, revealAll }) {
  const previewInfo = cells === playerCells && preview && game.phase === PHASE_PLACEMENT && game.selectedShipId
    ? game.previewPlacement(preview.row, preview.col)
    : null;
  const previewKeys = new Set(previewInfo ? previewInfo.cells.map((p) => `${p.row},${p.col}`) : []);
  const isEnemy = cells === enemyCells;
  const canFire = isEnemy && game.phase === PHASE_PLAYER_TURN;
  const last = isEnemy ? lastShot.player : lastShot.ai;

  for (let r = 0; r < game.size; r++) {
    for (let c = 0; c < game.size; c++) {
      const cell = cells[r][c];
      const ship = board.shipAt(r, c);
      const state = cellStateName(board, r, c);
      const sunkShip = ship && ship.hits >= ship.length;
      const classes = ['cell'];
      if (ship && (showShips || sunkShip)) classes.push('ship');
      if (ship && revealAll && !showShips && !sunkShip && !state) classes.push('revealed');
      if (state) classes.push(state);
      if (canFire && !state) classes.push('can-fire');
      if (last && last.row === r && last.col === c) classes.push('last-shot');
      if (previewKeys.has(`${r},${c}`)) classes.push(previewInfo.ok ? 'preview-valid' : 'preview-invalid');
      cell.className = classes.join(' ');

      if (isEnemy) {
        // aria-disabled instead of disabled: a disabled button drops keyboard
        // focus. Clicks out of turn are rejected by Game.playerFire anyway.
        cell.setAttribute('aria-disabled', String(game.phase !== PHASE_PLAYER_TURN));
      } else {
        cell.disabled = game.phase !== PHASE_PLACEMENT;
      }

      let label = coordLabel(r, c);
      if (state) label += `, ${state}`;
      else if (ship && showShips) label += `, your ${ship.name}`;
      else label += ', unknown';
      cell.setAttribute('aria-label', label);
    }
  }
}

function renderShipList() {
  el.shipList.innerHTML = '';
  for (const spec of game.fleet) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ship-btn';
    btn.dataset.shipId = spec.id;
    const placed = Boolean(game.playerBoard.getShip(spec.id));
    if (placed) btn.classList.add('placed');
    if (game.selectedShipId === spec.id) btn.classList.add('selected');
    btn.setAttribute('aria-pressed', String(game.selectedShipId === spec.id));
    const name = document.createElement('span');
    name.className = 'ship-name';
    name.textContent = `${spec.name} (${spec.length})`;
    const pips = document.createElement('span');
    pips.className = 'ship-pips';
    for (let i = 0; i < spec.length; i++) pips.appendChild(document.createElement('i'));
    btn.append(name, pips);
    li.appendChild(btn);
    el.shipList.appendChild(li);
  }
}

function renderLog() {
  el.log.innerHTML = '';
  for (let i = game.log.length - 1; i >= 0; i--) {
    const entry = game.log[i];
    const li = document.createElement('li');
    li.className = `${entry.actor} ${entry.kind}`;
    li.textContent = entry.text;
    el.log.appendChild(li);
  }
}

function renderOverlay() {
  const show = game.phase === PHASE_GAME_OVER && !overlayDismissed;
  el.overlay.hidden = !show;
  if (game.phase !== PHASE_GAME_OVER) return;
  const won = game.winner === PLAYER;
  const s = game.stats[PLAYER];
  const accuracy = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
  el.resultTitle.textContent = won ? 'You win!' : 'You lose';
  el.resultText.textContent = won
    ? `You sank the enemy fleet in ${s.shots} shots (${accuracy}% accuracy).`
    : `The enemy sank your fleet in ${game.stats.ai.shots} shots. You hit ${s.hits} of ${s.shots} shots.`;
}

function render() {
  el.body.className = `phase-${game.phase}`;
  el.turn.textContent = turnText();
  el.orientationLabel.textContent = game.orientation === HORIZONTAL ? 'Horizontal' : 'Vertical';
  el.start.disabled = !game.allShipsPlaced() || game.phase !== PHASE_PLACEMENT;
  const inBattle = game.phase !== PHASE_PLACEMENT;
  el.playerLeft.textContent = inBattle ? `(${game.playerBoard.remainingShips().length} afloat)` : '';
  el.enemyLeft.textContent = inBattle ? `(${game.enemyBoard.remainingShips().length} afloat)` : '';
  renderShipList();
  renderBoard(playerCells, game.playerBoard, { showShips: true, revealAll: false });
  renderBoard(enemyCells, game.enemyBoard, {
    showShips: false,
    revealAll: game.phase === PHASE_GAME_OVER,
  });
  renderLog();
  renderOverlay();
}

// ---- actions -----------------------------------------------------------

const PLACEMENT_ERRORS = {
  'out-of-bounds': "That ship doesn't fit there. Try another cell or rotate it.",
  overlap: 'That overlaps another ship.',
  'no-ship-selected': 'All ships are placed. Click a ship to move it, or start the battle.',
};

function selectedShipName() {
  const spec = game.fleet.find((s) => s.id === game.selectedShipId);
  return spec ? spec.name : null;
}

function placementHint() {
  if (game.allShipsPlaced()) {
    setHint('Fleet ready. Press "Start battle" (click a ship to move it).');
  } else {
    setHint(`Placing ${selectedShipName()}: click your board. Press R or "Rotate" to turn it.`);
  }
}

function onPlayerBoardClick(event) {
  const pos = cellFromEvent(event);
  if (!pos || game.phase !== PHASE_PLACEMENT) return;
  // Clicking an existing ship when nothing is selected (or when it is the
  // selected ship) picks it up so it can be moved.
  const shipHere = game.playerBoard.shipAt(pos.row, pos.col);
  if (shipHere && (!game.selectedShipId || shipHere.id === game.selectedShipId)) {
    game.pickUpShip(pos.row, pos.col);
    setHint(`Picked up ${shipHere.name}. Click to place it again.`);
    render();
    return;
  }
  const name = selectedShipName();
  const res = game.placePlayerShip(pos.row, pos.col);
  if (res.ok) {
    placementHint();
    if (!game.allShipsPlaced()) setHint(`${name} placed. ${el.hint.textContent}`);
  } else {
    setHint(PLACEMENT_ERRORS[res.reason] || 'Cannot place a ship there.', true);
  }
  render();
}

function onEnemyBoardClick(event) {
  const pos = cellFromEvent(event);
  if (!pos) return;
  const res = game.playerFire(pos.row, pos.col);
  if (!res.ok) {
    if (res.reason === 'already-shot') setHint(`You already fired at ${coordLabel(pos.row, pos.col)}. Pick another cell.`, true);
    else if (res.reason === 'not-your-turn') setHint('Wait for your turn.', true);
    return;
  }
  lastShot.player = pos;
  setHint('');
  render();
  if (game.phase === PHASE_AI_TURN) scheduleAiTurn();
}

function scheduleAiTurn() {
  clearTimeout(aiTimer);
  const gameId = game.gameId;
  aiTimer = setTimeout(() => {
    aiTimer = null;
    if (game.gameId !== gameId || game.phase !== PHASE_AI_TURN) return;
    const res = game.aiFire();
    if (res.ok) lastShot.ai = { row: res.row, col: res.col };
    render();
  }, AI_DELAY_MS);
}

function newGame() {
  clearTimeout(aiTimer);
  aiTimer = null;
  preview = null;
  lastShot = { player: null, ai: null };
  overlayDismissed = false;
  game.newGame();
  placementHint();
  render();
}

// ---- wiring --------------------------------------------------------------

el.playerBoard.addEventListener('click', onPlayerBoardClick);
el.enemyBoard.addEventListener('click', onEnemyBoardClick);

el.playerBoard.addEventListener('pointerover', (event) => {
  if (event.pointerType === 'touch') return;
  const pos = cellFromEvent(event);
  if (!pos || game.phase !== PHASE_PLACEMENT) return;
  preview = pos;
  renderBoard(playerCells, game.playerBoard, { showShips: true, revealAll: false });
});
el.playerBoard.addEventListener('pointerleave', () => {
  preview = null;
  renderBoard(playerCells, game.playerBoard, { showShips: true, revealAll: false });
});

el.shipList.addEventListener('click', (event) => {
  const btn = event.target.closest('.ship-btn');
  if (!btn) return;
  const id = btn.dataset.shipId;
  const placed = game.playerBoard.getShip(id);
  if (placed) {
    game.pickUpShip(placed.row, placed.col);
    setHint(`Picked up ${placed.name}. Click your board to place it again.`);
  } else {
    game.selectShip(id);
    placementHint();
  }
  render();
});

el.rotate.addEventListener('click', () => {
  game.rotate();
  render();
});

document.addEventListener('keydown', (event) => {
  if ((event.key === 'r' || event.key === 'R') && game.phase === PHASE_PLACEMENT && !event.ctrlKey && !event.metaKey) {
    game.rotate();
    render();
  }
});

el.random.addEventListener('click', () => {
  game.randomizePlayerShips();
  placementHint();
  render();
});

el.clear.addEventListener('click', () => {
  game.clearPlayerShips();
  placementHint();
  render();
});

el.start.addEventListener('click', () => {
  const res = game.startBattle();
  if (!res.ok) {
    setHint('Place all five ships first.', true);
    return;
  }
  preview = null;
  setHint('Click a cell in "Enemy waters" to fire.');
  render();
});

el.newGame.addEventListener('click', newGame);
el.overlayNewGame.addEventListener('click', newGame);
el.overlayClose.addEventListener('click', () => {
  overlayDismissed = true;
  render();
});

newGame();

// Exposed for debugging in the browser console.
window.battleship = { game };
