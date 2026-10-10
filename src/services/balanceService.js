const { getDatabase } = require('../db/database');
const logger = require('../utils/logger');

const balanceService = {
  getUser(userId, db = getDatabase()) {
    return db.get(`SELECT * FROM users WHERE id = ?`, [userId]);
  },

  getUserByUsername(username, db = getDatabase()) {
    if (!username) return null;
    const clean = username.replace(/^@/, '').toLowerCase();
    return db.get(`SELECT * FROM users WHERE LOWER(username) = ?`, [clean]);
  },

  getOrCreateUser(from, referrerId = null, db = getDatabase()) {
    const userId = Number(from.id);
    const existing = db.get(`SELECT * FROM users WHERE id = ?`, [userId]);
    const now = new Date().toISOString();

    if (existing) {
      if (existing.username !== from.username || existing.first_name !== from.first_name) {
        db.run(
          `UPDATE users SET username = ?, first_name = ?, updated_at = ? WHERE id = ?`,
          [from.username || null, from.first_name || '', now, userId]
        );
      }
      return { user: db.get(`SELECT * FROM users WHERE id = ?`, [userId]), isNew: false };
    }

    let validReferrer = null;
    if (referrerId && Number(referrerId) !== userId) {
      const refUser = db.get(`SELECT id FROM users WHERE id = ?`, [Number(referrerId)]);
      if (refUser) {
        validReferrer = refUser.id;
      }
    }

    db.run(
      `INSERT INTO users (id, username, first_name, language, balance, referrer_id, is_blocked, created_at, updated_at)
       VALUES (?, ?, ?, 'uz', 0, ?, 0, ?, ?)`,
      [userId, from.username || null, from.first_name || '', validReferrer, now, now]
    );

    if (validReferrer) {
      db.run(
        `INSERT OR IGNORE INTO referrals (referrer_id, referred_id, channel_verified, status, created_at)
         VALUES (?, ?, 0, 'pending', ?)`,
        [validReferrer, userId, now]
      );
    }

    return { user: db.get(`SELECT * FROM users WHERE id = ?`, [userId]), isNew: true };
  },

  setLanguage(userId, lang, db = getDatabase()) {
    const selected = lang === 'ru' ? 'ru' : 'uz';
    const now = new Date().toISOString();
    db.run(`UPDATE users SET language = ?, updated_at = ? WHERE id = ?`, [selected, now, userId]);
  },

  adjustBalance(userId, amount, type, referenceId = null, description = '', adminId = null, db = getDatabase()) {
    const intAmount = Number(amount);
    if (!Number.isInteger(intAmount)) {
      throw new Error('Balance adjustment amount must be an integer');
    }

    return db.transaction((txDb) => {
      const user = txDb.get(`SELECT id, balance FROM users WHERE id = ?`, [userId]);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      const prevBalance = user.balance;
      const newBalance = prevBalance + intAmount;

      if (newBalance < 0) {
        throw new Error('Insufficient funds: balance cannot become negative');
      }

      const now = new Date().toISOString();

      txDb.run(
        `UPDATE users SET balance = ?, updated_at = ? WHERE id = ?`,
        [newBalance, now, userId]
      );

      const res = txDb.run(
        `INSERT INTO balance_transactions (user_id, amount, balance_after, type, reference_id, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, intAmount, newBalance, type, referenceId ? String(referenceId) : null, description, now]
      );

      if (adminId) {
        txDb.run(
          `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details, created_at)
           VALUES (?, 'balance_adjustment', 'user', ?, ?, ?)`,
          [adminId, String(userId), JSON.stringify({ amount: intAmount, prevBalance, newBalance, description }), now]
        );
      }

      return {
        previousBalance: prevBalance,
        newBalance,
        transactionId: res.lastInsertRowid
      };
    });
  },

  getRecentTransactions(userId, limit = 5, db = getDatabase()) {
    return db.query(
      `SELECT * FROM balance_transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
      [userId, limit]
    );
  }
};

module.exports = balanceService;
