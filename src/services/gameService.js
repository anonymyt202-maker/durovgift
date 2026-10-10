const { getDatabase } = require('../db/database');
const logger = require('../utils/logger');

const gameService = {
  getGameConfig(gameType, db = getDatabase()) {
    const enabledSetting = db.get(`SELECT value FROM bot_settings WHERE key = ?`, [`game_${gameType}_enabled`]);
    const limitSetting = db.get(`SELECT value FROM bot_settings WHERE key = 'game_daily_limit'`);

    return {
      isEnabled: enabledSetting ? enabledSetting.value === '1' : true,
      dailyLimit: limitSetting ? Number(limitSetting.value) : 10
    };
  },

  getTodayPlayCount(userId, db = getDatabase()) {
    const today = new Date().toISOString().slice(0, 10);
    const row = db.get(
      `SELECT COUNT(*) as count FROM game_scores WHERE user_id = ? AND date(played_at) = ?`,
      [userId, today]
    );
    return row ? row.count : 0;
  },

  evaluateDiceResult(gameType, diceValue) {
    // Dice values according to Telegram Bot API:
    // 🏀 basketball: 1..5. Values 4 and 5 indicate a goal/basket.
    // ⚽ football: 1..5. Values 3, 4, 5 indicate a goal.
    // 🎯 darts: 1..6. 6 is direct bullseye center, 5 is red inner ring, etc.
    let isGoal = false;
    let points = 0;

    if (gameType === 'basketball') {
      if (diceValue >= 4) {
        isGoal = true;
        points = 2;
      }
    } else if (gameType === 'football') {
      if (diceValue >= 3) {
        isGoal = true;
        points = 1;
      }
    } else if (gameType === 'darts') {
      if (diceValue === 6) {
        isGoal = true;
        points = 5; // Bullseye
      } else if (diceValue >= 4) {
        isGoal = true;
        points = 2;
      }
    }

    return { isGoal, points };
  },

  recordGamePlay(userId, gameType, diceValue, db = getDatabase()) {
    const { isGoal, points } = this.evaluateDiceResult(gameType, diceValue);
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO game_scores (user_id, game_type, score, dice_value, played_at)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, gameType, points, diceValue, now]
    );

    const userTotal = db.get(
      `SELECT SUM(score) as totalScore FROM game_scores WHERE user_id = ?`,
      [userId]
    );

    return {
      isGoal,
      points,
      diceValue,
      totalScore: (userTotal && userTotal.totalScore) || 0
    };
  },

  getLeaderboard(limit = 10, db = getDatabase()) {
    return db.query(
      `SELECT g.user_id, u.username, u.first_name, SUM(g.score) as total_score, COUNT(g.id) as games_played
       FROM game_scores g
       JOIN users u ON g.user_id = u.id
       GROUP BY g.user_id
       ORDER BY total_score DESC
       LIMIT ?`,
      [limit]
    );
  }
};

module.exports = gameService;
