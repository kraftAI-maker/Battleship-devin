import {
  Game, PHASE_PLACEMENT, PHASE_PLAYER_TURN, PHASE_AI_TURN, PHASE_GAME_OVER, PLAYER,
} from './game.js';
import { HORIZONTAL, SHOT_HIT, SHOT_MISS, SHOT_SUNK, coordLabel } from './board.js';
import { DIFFICULTY_NAMES, MODE_TARGET } from './ai.js';

const AI_DELAY_MS = 700;
const AI_SHOT_FLASH_MS = 1800;

const $ = (id) => document.getElementById(id);
const el = {
  body: document.body,
  turn: $('turn-indicator'),
  aiShot: $('ai-shot'),
  legendRevealed: $('legend-revealed'),
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
  aiThinkingToggle: $('ai-thinking-toggle'),
  aiMode: $('ai-mode'),
  legendAiStrong: $('legend-ai-strong'),
  legendAiFaint: $('legend-ai-faint'),
  difficulty: $('difficulty'),
};

const game = new Game();
let aiTimer = null;
let preview = null; // { row, col } hovered cell on the player board during placement
let aiShotFlash = false; // briefly highlight the AI's newest shot
let aiFlashTimer = null;
// Only mention the R shortcut where there is (likely) a keyboard: a mouse or
// trackpad is present, or a key has been pressed.
const finePointer = window.matchMedia('(any-pointer: fine)');
let keyboardSeen = false;
const hasKeyboard = () => keyboardSeen || finePointer.matches;
let overlayDismissed = false;
let showAiThinking = false;

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

/**
 * Overlay classes for the AI's candidates, keyed "row,col". Normal: strong
 * for target candidates, faint for hunt cells. Easy: faint for every cell it
 * picks from. Hard: strong for its top-scoring cells (the pick is one of
 * them), faint for the rest of its top cells.
 */
function thinkingClasses(thinking) {
  const classes = new Map();
  if (!thinking) return classes;
  const key = (p) => `${p.row},${p.col}`;
  if (thinking.top) {
    for (const p of thinking.top) classes.set(key(p), 'ai-hunt');
    for (const p of thinking.cells) classes.set(key(p), 'ai-target');
  } else {
    const cls = thinking.mode === MODE_TARGET ? 'ai-target' : 'ai-hunt';
    for (const p of thinking.cells) classes.set(key(p), cls);
  }
  return classes;
}

const AI_MODE_NAMES = { hunt: 'Hunt', target: 'Target', random: 'Random' };
const LEGEND_AI = {
  easy: [null, 'AI random pick'],
  normal: ['AI target', 'AI hunt'],
  hard: ['AI top score', 'AI next best'],
};

function renderBoard(cells, board, { showShips, revealAll }) {
  const previewInfo = cells === playerCells && preview && game.phase === PHASE_PLACEMENT && game.selectedShipId
    ? game.previewPlacement(preview.row, preview.col)
    : null;
  const previewKeys = new Set(previewInfo ? previewInfo.cells.map((p) => `${p.row},${p.col}`) : []);
  const isEnemy = cells === enemyCells;
  const canFire = isEnemy && game.phase === PHASE_PLAYER_TURN;
  const last = isEnemy ? game.lastShots.player : game.lastShots.ai;
  const aiClasses = !isEnemy && showAiThinking ? thinkingClasses(game.aiThinking()) : new Map();

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
      if (last && last.row === r && last.col === c) {
        classes.push('last-shot');
        if (!isEnemy && aiShotFlash) classes.push('fresh-shot');
      }
      if (previewKeys.has(`${r},${c}`)) classes.push(previewInfo.ok ? 'preview-valid' : 'preview-invalid');
      const aiClass = aiClasses.get(`${r},${c}`);
      if (aiClass) classes.push(aiClass);
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
      if (aiClass) label += aiClass === 'ai-target' ? ', AI strong candidate' : ', AI candidate';
      cell.setAttribute('aria-label', label);
    }
  }
}

function renderShipList() {
  const focusedId = el.shipList.contains(document.activeElement) ? document.activeElement.dataset.shipId : null;
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
    if (spec.id === focusedId) btn.focus();
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

function aiShotText(shot) {
  const at = coordLabel(shot.row, shot.col);
  if (shot.result === SHOT_MISS) return `Enemy fired at ${at} – miss.`;
  if (shot.result === SHOT_SUNK) return `Enemy fired at ${at} – sunk your ${shot.shipName}!`;
  return `Enemy fired at ${at} – hit!`;
}

// Compact line near the top: on phones the boards stack and your own board
// is below the fold, so this is where you see the enemy's last shot.
function renderAiShot() {
  const shot = game.lastShots.ai;
  el.aiShot.hidden = !shot;
  if (!shot) return;
  el.aiShot.textContent = aiShotText(shot);
  el.aiShot.className = `ai-shot ${shot.result}${aiShotFlash ? ' fresh' : ''}`;
}

function renderAiThinking() {
  const thinking = showAiThinking ? game.aiThinking() : null;
  el.aiMode.hidden = !showAiThinking;
  if (thinking) {
    // Player cells are disabled during the battle, so keyboard and screen
    // reader users get the candidate cells in the (live) label instead.
    const detail = document.createElement('span');
    detail.className = 'sr-only';
    const listed = thinking.cells.length <= 8;
    detail.textContent = listed
      ? `, next shot from ${thinking.cells.map((p) => coordLabel(p.row, p.col)).join(', ')}`
      : `, next shot from ${thinking.cells.length} untried cells`;
    const label = `AI mode: ${AI_MODE_NAMES[thinking.mode]}${thinking.top ? ' (probability)' : ''}`;
    el.aiMode.replaceChildren(label, detail);
  } else if (showAiThinking) {
    el.aiMode.textContent = game.phase === PHASE_PLACEMENT ? 'Shown once the battle starts' : '';
  }
  el.aiMode.classList.toggle('target', Boolean(thinking && (thinking.mode === MODE_TARGET || thinking.top)));
  const [strong, faint] = LEGEND_AI[game.difficulty];
  el.legendAiStrong.hidden = !thinking || !strong;
  el.legendAiFaint.hidden = !thinking;
  el.legendAiStrong.lastChild.textContent = strong || '';
  el.legendAiFaint.lastChild.textContent = faint;
}

function renderOverlay() {
  const show = game.phase === PHASE_GAME_OVER && !overlayDismissed;
  const wasHidden = el.overlay.hidden;
  el.overlay.hidden = !show;
  if (show && wasHidden) el.overlayNewGame.focus();
  if (game.phase !== PHASE_GAME_OVER) return;
  const won = game.winner === PLAYER;
  const s = game.stats[PLAYER];
  const accuracy = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
  const level = DIFFICULTY_NAMES[game.difficulty];
  el.resultTitle.textContent = won ? 'You win!' : 'You lose';
  el.resultText.textContent = won
    ? `Legacy fleet modernized in ${s.shots} shots (${level}, ${accuracy}% accuracy).`
    : `The legacy fleet sank yours in ${game.stats.ai.shots} shots (${level}). You hit ${s.hits} of ${s.shots} shots.`;
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
  el.legendRevealed.hidden = !(game.phase === PHASE_GAME_OVER && game.enemyBoard.remainingShips().length > 0);
  for (const input of el.difficulty.elements) input.checked = input.value === game.difficulty;
  renderAiShot();
  renderAiThinking();
  renderLog();
  renderOverlay();
}

// ---- actions -----------------------------------------------------------

const PLACEMENT_ERRORS = {
  'out-of-bounds': "That ship doesn't fit there. Try another cell or rotate it.",
  overlap: 'That overlaps another ship.',
  'no-ship-selected': 'All ships are placed. Choose a ship to move it, or start the battle.',
};

function selectedShipName() {
  const spec = game.fleet.find((s) => s.id === game.selectedShipId);
  return spec ? spec.name : null;
}

function placementHint() {
  if (game.allShipsPlaced()) {
    setHint('Fleet ready: start the battle, or choose a placed ship to move it.');
  } else {
    const rotate = hasKeyboard() ? 'Use "Rotate" (or press R)' : 'Use "Rotate"';
    setHint(`Placing ${selectedShipName()}: choose a cell on your board. ${rotate} to turn it.`);
  }
}

function onPlayerBoardClick(event) {
  const pos = cellFromEvent(event);
  if (!pos || game.phase !== PHASE_PLACEMENT) return;
  // Clicking a placed ship picks it up so it can be moved. (Placing the
  // selected ship on an occupied cell could never succeed anyway.)
  const shipHere = game.playerBoard.shipAt(pos.row, pos.col);
  if (shipHere) {
    game.pickUpShip(pos.row, pos.col);
    setHint(`Picked up ${shipHere.name}. Choose a cell to place it again.`);
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
    if (res.ok) flashAiShot();
    render();
  }, AI_DELAY_MS);
}

function flashAiShot() {
  // Restart the status line's flash animation if it is still running.
  el.aiShot.classList.remove('fresh');
  void el.aiShot.offsetWidth;
  aiShotFlash = true;
  clearTimeout(aiFlashTimer);
  aiFlashTimer = setTimeout(() => {
    aiShotFlash = false;
    render();
  }, AI_SHOT_FLASH_MS);
}

function newGame() {
  clearTimeout(aiTimer);
  aiTimer = null;
  clearTimeout(aiFlashTimer);
  aiShotFlash = false;
  preview = null;
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
    setHint(`Picked up ${placed.name}. Choose a cell on your board to place it again.`);
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

function onKeyboardDetected() {
  if (hasKeyboard()) el.hint.textContent = el.hint.textContent.replace('Use "Rotate" to', 'Use "Rotate" (or press R) to');
}
finePointer.addEventListener('change', onKeyboardDetected);

document.addEventListener('keydown', (event) => {
  if (!keyboardSeen) {
    keyboardSeen = true;
    onKeyboardDetected();
  }
  if (!el.overlay.hidden) {
    if (event.key === 'Escape') {
      dismissOverlay();
    } else if (event.key === 'Tab') {
      // Keep focus inside the modal dialog.
      const buttons = [...el.overlay.querySelectorAll('button')];
      const i = buttons.indexOf(document.activeElement);
      const next = event.shiftKey ? (i <= 0 ? buttons.length - 1 : i - 1) : (i + 1) % buttons.length;
      event.preventDefault();
      buttons[next].focus();
    }
    return;
  }
  if ((event.key === 'r' || event.key === 'R') && game.phase === PHASE_PLACEMENT && !event.ctrlKey && !event.metaKey) {
    game.rotate();
    render();
  }
});

el.aiThinkingToggle.addEventListener('change', () => {
  showAiThinking = el.aiThinkingToggle.checked;
  render();
});

el.difficulty.addEventListener('change', (event) => {
  game.setDifficulty(event.target.value);
  render();
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
  setHint('Choose a cell in "Enemy waters" to fire.');
  render();
});

el.newGame.addEventListener('click', newGame);
el.overlayNewGame.addEventListener('click', newGame);
function dismissOverlay() {
  overlayDismissed = true;
  render();
  el.newGame.focus();
}

el.overlayClose.addEventListener('click', dismissOverlay);

newGame();

// Exposed for debugging in the browser console.
window.battleship = { game };
