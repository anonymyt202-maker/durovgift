const { getDatabase } = require('../db/database');
const logger = require('../utils/logger');

const channelService = {
  getChannels(onlyActive = true, db = getDatabase()) {
    if (onlyActive) {
      return db.query(`SELECT * FROM sponsor_channels WHERE is_active = 1 ORDER BY id ASC`);
    }
    return db.query(`SELECT * FROM sponsor_channels ORDER BY id ASC`);
  },

  getChannel(id, db = getDatabase()) {
    return db.get(`SELECT * FROM sponsor_channels WHERE id = ?`, [id]);
  },

  addChannel({ channelId, title, inviteUrl, isRequired = 1 }, db = getDatabase()) {
    const now = new Date().toISOString();
    return db.run(
      `INSERT INTO sponsor_channels (channel_id, title, invite_url, is_required, is_active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [channelId, title, inviteUrl, Number(isRequired), now]
    );
  },

  updateChannel(id, { title, inviteUrl, isRequired, isActive }, db = getDatabase()) {
    return db.run(
      `UPDATE sponsor_channels 
       SET title = ?, invite_url = ?, is_required = ?, is_active = ? 
       WHERE id = ?`,
      [title, inviteUrl, Number(isRequired), Number(isActive), id]
    );
  },

  deleteChannel(id, db = getDatabase()) {
    return db.run(`DELETE FROM sponsor_channels WHERE id = ?`, [id]);
  },

  async verifyUserSubscriptions(userId, bot, db = getDatabase()) {
    const channels = db.query(
      `SELECT * FROM sponsor_channels WHERE is_active = 1 AND is_required = 1`
    );

    if (channels.length === 0) {
      return { allSubscribed: true, missingChannels: [] };
    }

    if (!bot || !bot.telegram) {
      logger.warn('Bot instance not provided to verifyUserSubscriptions');
      return { allSubscribed: false, error: 'Telegram bot client not available', missingChannels: channels };
    }

    const missing = [];

    for (const ch of channels) {
      try {
        const member = await bot.telegram.getChatMember(ch.channel_id, Number(userId));
        const status = member && member.status;
        const validStatuses = ['creator', 'administrator', 'member', 'restricted'];
        if (!validStatuses.includes(status)) {
          missing.push(ch);
        }
      } catch (err) {
        logger.error(`Error verifying channel ${ch.channel_id} for user ${userId}:`, err.message);
        missing.push(ch);
      }
    }

    return {
      allSubscribed: missing.length === 0,
      missingChannels: missing
    };
  }
};

module.exports = channelService;
