// Local game statistics, persisted in localStorage. DOM-free: the storage is
// passed in, and every access is wrapped in try/catch because storage can be
// missing, full, or throw (e.g. blocked cookies, some private modes).

export const STATS_KEY = 'battleship-legacy-fleet-stats-v1';

export const emptyStats = () => ({ played: 0, wins: 0, totalShots: 0, bestGame: null });

const isCount = (n) => Number.isInteger(n) && n >= 0;

/** Reject anything that isn't a well-formed stats record. */
export function validStats(data) {
  return Boolean(data)
    && isCount(data.played)
    && isCount(data.wins)
    && isCount(data.totalShots)
    && data.wins <= data.played
    && (data.bestGame === null || (isCount(data.bestGame) && data.bestGame > 0));
}

/** Stats from storage; empty stats if there are none, they're corrupt, or storage throws. */
export function loadStats(storage) {
  try {
    const raw = storage && storage.getItem(STATS_KEY);
    if (!raw) return emptyStats();
    const data = JSON.parse(raw);
    if (!validStats(data)) return emptyStats();
    return { played: data.played, wins: data.wins, totalShots: data.totalShots, bestGame: data.bestGame };
  } catch {
    return emptyStats();
  }
}

/** @returns {boolean} whether the stats were saved. */
export function saveStats(storage, stats) {
  try {
    if (!storage) return false;
    storage.setItem(STATS_KEY, JSON.stringify(stats));
    return true;
  } catch {
    return false;
  }
}

/** @returns {boolean} whether the stored stats were removed. */
export function clearStats(storage) {
  try {
    if (!storage) return false;
    storage.removeItem(STATS_KEY);
    return true;
  } catch {
    return false;
  }
}

/** New stats with one finished game added. `shots` = the player's shots. */
export function addGame(stats, { won, shots }) {
  return {
    played: stats.played + 1,
    wins: stats.wins + (won ? 1 : 0),
    totalShots: stats.totalShots + shots,
    bestGame: won && (stats.bestGame === null || shots < stats.bestGame) ? shots : stats.bestGame,
  };
}

/**
 * Display values. winRate is a whole percentage, averageShots has one
 * decimal; both are null before the first game. bestGame is the fewest
 * shots in a win (null without a win).
 */
export function summarize(stats) {
  const { played, wins, totalShots, bestGame } = stats;
  return {
    played,
    wins,
    winRate: played ? Math.round((wins / played) * 100) : null,
    averageShots: played ? Math.round((totalShots / played) * 10) / 10 : null,
    bestGame,
  };
}
