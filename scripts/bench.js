// Average shots the AI needs to sink a randomly placed standard fleet.
// Usage: npm run bench [-- <games>]   (default 1000 seeded games, reproducible)
import { HuntTargetAI } from '../js/ai.js';
import { Board, FLEET, SHOT_SUNK } from '../js/board.js';
import { createRng } from '../js/rng.js';

const games = Number(process.argv[2]) || 1000;
const results = [];
for (let seed = 1; seed <= games; seed++) {
  const board = new Board();
  board.placeFleetRandomly(FLEET, createRng(seed));
  const ai = new HuntTargetAI({ rng: createRng(seed + 1000) });
  let shots = 0;
  while (!board.allSunk()) {
    const { row, col } = ai.nextShot();
    const res = board.receiveAttack(row, col);
    if (!res.valid) throw new Error(`AI fired an invalid shot at ${row},${col} (seed ${seed})`);
    ai.recordResult(row, col, res.result, res.result === SHOT_SUNK ? res.ship.cells : []);
    shots++;
  }
  results.push(shots);
}
results.sort((a, b) => a - b);
const avg = results.reduce((n, s) => n + s, 0) / games;
console.log(`games:   ${games}`);
console.log(`average: ${avg.toFixed(1)} shots`);
const median = (results[Math.floor((games - 1) / 2)] + results[Math.floor(games / 2)]) / 2;
console.log(`median:  ${median}`);
console.log(`best:    ${results[0]}`);
console.log(`worst:   ${results[games - 1]}`);
