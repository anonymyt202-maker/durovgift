const { getDatabase } = require('../db/database');
const balanceService = require('./balanceService');
const channelService = require('./channelService');
const logger = require('../utils/logger');

const rewardService = {
  async getDailyRewardStatus(userId, bot = null, db = getDatabase()) {
    const isEnabledSetting = db.get(`SELECT value FROM bot_settings WHERE key = 'daily_reward_enabled'`);
    const isEnabled = isEnabledSetting ? isEnabledSetting.value === '1' : true;

    const cooldownSetting = db.get(`SELECT value FROM bot_settings WHERE key = 'daily_reward_cooldown_hours'`);
    const cooldownHours = cooldownSetting ? Number(cooldownSetting.value) : 24;

    const thresholdSetting = db.get(`SELECT value FROM bot_settings WHERE key = 'daily_reward_threshold'`);
    const threshold = thresholdSetting ? Number(thresholdSetting.value) : 2;

    const amountSetting = db.get(`SELECT value FROM bot_settings WHERE key = 'daily_reward_amount'`);
    const amount = amountSetting ? Number(amountSetting.value) : 5;

    // Check last claim
    const lastClaim = db.get(
      `SELECT * FROM daily_rewards WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      [userId]
    );

    let canClaimByTime = true;
    let hoursRemaining = 0;

    if (lastClaim) {
      const lastTime = new Date(lastClaim.claimed_at).getTime();
      const diffHours = (Date.now() - lastTime) / (1000 * 60 * 60);
      if (diffHours < cooldownHours) {
        canClaimByTime = false;
        hoursRemaining = Math.ceil(cooldownHours - diffHours);
      }
    }

    // Check referrals count (verified referrals)
    const refCountRow = db.get(
      `SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ? AND channel_verified = 1`,
      [userId]
    );
    const verifiedReferrals = refCountRow ? refCountRow.count : 0;
    const canClaimByReferrals = verifiedReferrals >= threshold;

    return {
      isEnabled,
      threshold,
      currentReferrals: verifiedReferrals,
      rewardAmount: amount,
      cooldownHours,
      canClaimByTime,
      hoursRemaining,
      canClaimByReferrals,
      eligible: isEnabled && canClaimByTime && canClaimByReferrals
    };
  },

  async claimDailyReward(userId, bot = null, db = getDatabase()) {
    const status = await this.getDailyRewardStatus(userId, bot, db);

    if (!status.isEnabled) {
      throw new Error('Daily rewards are currently disabled');
    }

    if (!status.canClaimByTime) {
      return {
        ok: false,
        reason: 'cooldown',
        hoursRemaining: status.hoursRemaining
      };
    }

    if (!status.canClaimByReferrals) {
      return {
        ok: false,
        reason: 'not_enough_referrals',
        threshold: status.threshold,
        current: status.currentReferrals
      };
    }

    // Check sponsor channels
    if (bot) {
      const subCheck = await channelService.verifyUserSubscriptions(userId, bot, db);
      if (!subCheck.allSubscribed) {
        return {
          ok: false,
          reason: 'channels_missing',
          missing: subCheck.missingChannels
        };
      }
    }

    return db.transaction((txDb) => {
      const now = new Date().toISOString();
      txDb.run(
        `INSERT INTO daily_rewards (user_id, reward_type, reward_amount, claimed_at)
         VALUES (?, 'stars', ?, ?)`,
        [userId, status.rewardAmount, now]
      );

      balanceService.adjustBalance(
        userId,
        status.rewardAmount,
        'daily_reward',
        null,
        `Daily Reward (+${status.rewardAmount} Stars)`,
        null,
        txDb
      );

      return {
        ok: true,
        amount: status.rewardAmount
      };
    });
  }
};

module.exports = rewardService;
