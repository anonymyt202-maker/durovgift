const { getDatabase } = require('../db/database');
const balanceService = require('./balanceService');
const logger = require('../utils/logger');

const referralService = {
  getReferralStats(userId, db = getDatabase()) {
    const totalRow = db.get(
      `SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ?`,
      [userId]
    );
    const verifiedRow = db.get(
      `SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ? AND channel_verified = 1`,
      [userId]
    );
    const pendingRow = db.get(
      `SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ? AND channel_verified = 0`,
      [userId]
    );

    const setting = db.get(`SELECT value FROM bot_settings WHERE key = 'referral_target'`);
    const target = setting ? Number(setting.value) : 5;

    const activeRequest = db.get(
      `SELECT * FROM referral_reward_requests WHERE user_id = ? AND status = 'pending'`,
      [userId]
    );

    return {
      total: totalRow ? totalRow.count : 0,
      verified: verifiedRow ? verifiedRow.count : 0,
      pending: pendingRow ? pendingRow.count : 0,
      target,
      hasPendingRequest: !!activeRequest
    };
  },

  markReferredVerified(userId, db = getDatabase()) {
    const now = new Date().toISOString();
    return db.run(
      `UPDATE referrals 
       SET channel_verified = 1, status = 'verified', verified_at = ? 
       WHERE referred_id = ? AND channel_verified = 0`,
      [now, userId]
    );
  },

  createRewardRequest(userId, db = getDatabase()) {
    const stats = this.getReferralStats(userId, db);
    if (stats.verified < stats.target) {
      throw new Error(`Insufficient verified referrals: ${stats.verified}/${stats.target}`);
    }

    if (stats.hasPendingRequest) {
      throw new Error('You already have a pending referral reward request.');
    }

    const rewardSetting = db.get(`SELECT value FROM bot_settings WHERE key = 'referral_reward_amount'`);
    const rewardAmount = rewardSetting ? Number(rewardSetting.value) : 25;
    const now = new Date().toISOString();

    const res = db.run(
      `INSERT INTO referral_reward_requests (user_id, referral_count, reward_type, reward_amount, status, created_at)
       VALUES (?, ?, 'stars', ?, 'pending', ?)`,
      [userId, stats.verified, rewardAmount, now]
    );

    return {
      requestId: res.lastInsertRowid,
      amount: rewardAmount
    };
  },

  getPendingRequests(db = getDatabase()) {
    return db.query(
      `SELECT r.*, u.username, u.first_name 
       FROM referral_reward_requests r 
       JOIN users u ON r.user_id = u.id 
       WHERE r.status = 'pending' 
       ORDER BY r.id ASC`
    );
  },

  approveRewardRequest(requestId, adminId, db = getDatabase()) {
    return db.transaction((txDb) => {
      const req = txDb.get(
        `SELECT * FROM referral_reward_requests WHERE id = ?`,
        [requestId]
      );
      if (!req) {
        throw new Error('Reward request not found');
      }
      if (req.status !== 'pending') {
        throw new Error(`Request is already ${req.status}`);
      }

      const now = new Date().toISOString();
      txDb.run(
        `UPDATE referral_reward_requests 
         SET status = 'approved', reviewed_by = ?, reviewed_at = ? 
         WHERE id = ?`,
        [adminId, now, requestId]
      );

      // Credit stars
      balanceService.adjustBalance(
        req.user_id,
        req.reward_amount,
        'referral_reward',
        `ref_req_${requestId}`,
        `Referral milestone reward (+${req.reward_amount} Stars)`,
        adminId,
        txDb
      );

      txDb.run(
        `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details, created_at)
         VALUES (?, 'approve_referral_reward', 'referral_request', ?, ?, ?)`,
        [adminId, String(requestId), JSON.stringify({ userId: req.user_id, amount: req.reward_amount }), now]
      );

      return { ok: true, userId: req.user_id, amount: req.reward_amount };
    });
  },

  rejectRewardRequest(requestId, adminId, reason = '', db = getDatabase()) {
    const req = db.get(`SELECT * FROM referral_reward_requests WHERE id = ?`, [requestId]);
    if (!req) {
      throw new Error('Reward request not found');
    }
    if (req.status !== 'pending') {
      throw new Error(`Request is already ${req.status}`);
    }

    const now = new Date().toISOString();
    db.run(
      `UPDATE referral_reward_requests 
       SET status = 'rejected', reviewed_by = ?, review_comment = ?, reviewed_at = ? 
       WHERE id = ?`,
      [adminId, reason, now, requestId]
    );

    db.run(
      `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details, created_at)
       VALUES (?, 'reject_referral_reward', 'referral_request', ?, ?, ?)`,
      [adminId, String(requestId), JSON.stringify({ userId: req.user_id, reason }), now]
    );

    return { ok: true, userId: req.user_id };
  }
};

module.exports = referralService;
