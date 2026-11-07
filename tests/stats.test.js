import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATS_KEY, addGame, clearStats, emptyStats, loadStats, saveStats, summarize, validStats,
} from '../js/stats.js';

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

const throwing = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceededError'); },
  removeItem() { throw new Error('SecurityError'); },
};

describe('addGame', () => {
  test('counts games, wins, shots and the best (fewest-shot) win', () => {
    let s = emptyStats();
    s = addGame(s, { won: true, shots: 60 });
    s = addGame(s, { won: false, shots: 80 });
    s = addGame(s, { won: true, shots: 45 });
    s = addGame(s, { won: true, shots: 50 });
    assert.deepEqual(s, { played: 4, wins: 3, totalShots: 235, bestGame: 45 });
  });

  test('a loss never sets the best game, even with fewer shots', () => {
    const s = addGame(addGame(emptyStats(), { won: true, shots: 60 }), { won: false, shots: 20 });
    assert.equal(s.bestGame, 60);
    assert.equal(addGame(emptyStats(), { won: false, shots: 20 }).bestGame, null);
  });

  test('does not mutate its input', () => {
    const s = emptyStats();
    addGame(s, { won: true, shots: 50 });
    assert.deepEqual(s, emptyStats());
  });
});

describe('summarize', () => {
  test('no games yet: rates are null', () => {
    assert.deepEqual(summarize(emptyStats()), { played: 0, wins: 0, winRate: null, averageShots: null, bestGame: null });
  });

  test('win rate is a whole percentage, average shots has one decimal', () => {
    const s = { played: 3, wins: 2, totalShots: 152, bestGame: 41 };
    assert.deepEqual(summarize(s), { played: 3, wins: 2, winRate: 67, averageShots: 50.7, bestGame: 41 });
  });
});

describe('storage', () => {
  test('save then load round-trips', () => {
    const storage = new MemoryStorage();
    const s = { played: 2, wins: 1, totalShots: 99, bestGame: 44 };
    assert.equal(saveStats(storage, s), true);
    assert.deepEqual(loadStats(storage), s);
  });

  test('nothing stored: empty stats', () => {
    assert.deepEqual(loadStats(new MemoryStorage()), emptyStats());
  });

  test('corrupt or tampered data: empty stats instead of an error', () => {
    for (const raw of ['{not json', 'null', '42', '"x"', '{"played":-1,"wins":0,"totalShots":0,"bestGame":null}',
      '{"played":1,"wins":2,"totalShots":0,"bestGame":null}', '{"played":1.5,"wins":0,"totalShots":0,"bestGame":null}',
      '{"played":1,"wins":1,"totalShots":9,"bestGame":0}', '{"played":"3","wins":0,"totalShots":0,"bestGame":null}']) {
      assert.deepEqual(loadStats(new MemoryStorage({ [STATS_KEY]: raw })), emptyStats(), raw);
    }
  });

  test('extra fields are dropped on load', () => {
    const raw = JSON.stringify({ played: 1, wins: 1, totalShots: 40, bestGame: 40, evil: true });
    assert.deepEqual(loadStats(new MemoryStorage({ [STATS_KEY]: raw })), { played: 1, wins: 1, totalShots: 40, bestGame: 40 });
  });

  test('storage that throws or is missing: no exceptions, reports failure', () => {
    assert.deepEqual(loadStats(throwing), emptyStats());
    assert.equal(saveStats(throwing, emptyStats()), false);
    assert.equal(clearStats(throwing), false);
    assert.deepEqual(loadStats(null), emptyStats());
    assert.equal(saveStats(null, emptyStats()), false);
    assert.equal(clearStats(undefined), false);
  });

  test('a fallback is returned when the data cannot be read, but not when nothing is stored', () => {
    const fallback = { played: 3, wins: 1, totalShots: 150, bestGame: 45 };
    assert.deepEqual(loadStats(throwing, fallback), fallback);
    assert.deepEqual(loadStats(null, fallback), fallback);
    assert.deepEqual(loadStats(new MemoryStorage({ [STATS_KEY]: '{oops' }), fallback), fallback);
    assert.deepEqual(loadStats(new MemoryStorage(), fallback), emptyStats());
  });

  test('clearStats removes the stored record', () => {
    const storage = new MemoryStorage();
    saveStats(storage, { played: 1, wins: 0, totalShots: 70, bestGame: null });
    assert.equal(clearStats(storage), true);
    assert.equal(storage.getItem(STATS_KEY), null);
    assert.deepEqual(loadStats(storage), emptyStats());
  });

  test('validStats accepts what addGame produces', () => {
    let s = emptyStats();
    for (let i = 0; i < 20; i++) s = addGame(s, { won: i % 3 !== 0, shots: 40 + i });
    assert.equal(validStats(s), true);
  });
});
