const { getDatabase } = require('../db/database');
const { generateSecureToken, hashToken, normalizeUsername } = require('../utils/validation');
const balanceService = require('./balanceService');
const logger = require('../utils/logger');

const giftService = {
  getCatalog(onlyAvailable = true, db = getDatabase()) {
    if (onlyAvailable) {
      return db.query(`SELECT * FROM gift_catalog WHERE is_available = 1 ORDER BY stars_price ASC`);
    }
    return db.query(`SELECT * FROM gift_catalog ORDER BY stars_price ASC`);
  },

  getCatalogItem(id, db = getDatabase()) {
    return db.get(`SELECT * FROM gift_catalog WHERE id = ?`, [id]);
  },

  getCatalogItemByGiftId(giftId, db = getDatabase()) {
    return db.get(`SELECT * FROM gift_catalog WHERE gift_id = ?`, [giftId]);
  },

  createCatalogItem(data, db = getDatabase()) {
    const now = new Date().toISOString();
    return db.run(
      `INSERT INTO gift_catalog (gift_id, name_uz, name_ru, description_uz, description_ru, stars_price, emoji, is_available, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.gift_id,
        data.name_uz,
        data.name_ru,
        data.description_uz || '',
        data.description_ru || '',
        Number(data.stars_price),
        data.emoji || '🎁',
        data.is_available !== undefined ? Number(data.is_available) : 1,
        now,
        now
      ]
    );
  },

  updateCatalogItem(id, data, db = getDatabase()) {
    const now = new Date().toISOString();
    return db.run(
      `UPDATE gift_catalog 
       SET name_uz = ?, name_ru = ?, description_uz = ?, description_ru = ?, stars_price = ?, emoji = ?, is_available = ?, updated_at = ?
       WHERE id = ?`,
      [
        data.name_uz,
        data.name_ru,
        data.description_uz || '',
        data.description_ru || '',
        Number(data.stars_price),
        data.emoji || '🎁',
        Number(data.is_available),
        now,
        id
      ]
    );
  },

  async fetchTelegramAvailableGifts(bot) {
    try {
      if (!bot || !bot.telegram) return [];
      const res = await bot.telegram.callApi('getAvailableGifts', {});
      return (res && res.gifts) || [];
    } catch (err) {
      logger.warn('Telegram Bot API getAvailableGifts not available or returned error:', err.message);
      return [];
    }
  },

  async sendTelegramGift(bot, userId, giftId, text = '') {
    if (!bot || !bot.telegram) {
      throw new Error('Telegram bot client not initialized');
    }
    try {
      const res = await bot.telegram.callApi('sendGift', {
        user_id: Number(userId),
        gift_id: String(giftId),
        text: text ? String(text).slice(0, 128) : undefined
      });
      return { ok: true, result: res };
    } catch (err) {
      logger.error(`Failed to send gift ${giftId} to user ${userId}:`, err.message);
      return { ok: false, error: err.message };
    }
  },

  async purchaseGift({
    senderId,
    catalogId,
    deliveryType, // 'self', 'username', 'claim_link'
    recipientId = null,
    recipientUsername = null,
    bot = null,
    db = getDatabase()
  }) {
    const item = this.getCatalogItem(catalogId, db);
    if (!item) {
      throw new Error('Gift not found');
    }
    if (!item.is_available) {
      throw new Error('Gift is currently not available');
    }

    const price = item.stars_price;

    // 1. Atomically deduct balance and create order in database
    const created = db.transaction((txDb) => {
      const user = txDb.get(`SELECT balance FROM users WHERE id = ?`, [senderId]);
      if (!user || user.balance < price) {
        throw new Error('Insufficient balance');
      }

      balanceService.adjustBalance(
        senderId,
        -price,
        'gift_purchase',
        `cat_${catalogId}`,
        `Purchase gift: ${item.name_uz} (-${price} Stars)`,
        null,
        txDb
      );

      const now = new Date().toISOString();
      const initialStatus = 'inventory';

      const orderRes = txDb.run(
        `INSERT INTO gift_orders (sender_id, recipient_id, recipient_username, catalog_id, stars_cost, delivery_type, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          senderId,
          recipientId,
          recipientUsername ? normalizeUsername(recipientUsername) : null,
          catalogId,
          price,
          deliveryType,
          initialStatus,
          now
        ]
      );

      const orderId = orderRes.lastInsertRowid;
      let rawToken = null;

      if (deliveryType === 'claim_link' || (deliveryType === 'username' && !recipientId)) {
        rawToken = generateSecureToken(16);
        const hashed = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        txDb.run(
          `INSERT INTO gift_claim_tokens (order_id, token_hash, token_raw, target_username, is_claimed, expires_at, created_at)
           VALUES (?, ?, ?, ?, 0, ?, ?)`,
          [orderId, hashed, rawToken, recipientUsername ? normalizeUsername(recipientUsername) : null, expiresAt, now]
        );

        txDb.run(
          `UPDATE gift_orders SET delivery_type = 'claim_link' WHERE id = ?`,
          [orderId]
        );
      }

      return { orderId, rawToken, item };
    });

    const { orderId, rawToken } = created;

    // 2. Perform external delivery if applicable
    if (deliveryType === 'self') {
      if (bot) {
        const sent = await this.sendTelegramGift(bot, senderId, item.gift_id, 'Bought from Telegram Gifts Bot');
        if (sent && sent.ok) {
          db.run(
            `UPDATE gift_orders SET status = 'delivered', recipient_id = ?, delivered_at = ? WHERE id = ?`,
            [senderId, new Date().toISOString(), orderId]
          );
          return { orderId, status: 'delivered', item };
        } else {
          db.run(
            `UPDATE gift_orders SET status = 'inventory', delivery_error = ? WHERE id = ?`,
            [sent ? sent.error : 'Delivery failed', orderId]
          );
          return { orderId, status: 'inventory', item, error: sent ? sent.error : null };
        }
      }
      return { orderId, status: 'inventory', item };
    } else if (deliveryType === 'username' && recipientId) {
      if (bot) {
        const sent = await this.sendTelegramGift(bot, recipientId, item.gift_id, 'Gift from friend via Telegram Gifts Bot');
        if (sent && sent.ok) {
          db.run(
            `UPDATE gift_orders SET status = 'delivered', delivered_at = ? WHERE id = ?`,
            [new Date().toISOString(), orderId]
          );
          return { orderId, status: 'delivered', item };
        } else {
          db.run(
            `UPDATE gift_orders SET status = 'failed', delivery_error = ? WHERE id = ?`,
            [sent ? sent.error : 'Delivery failed', orderId]
          );
          return { orderId, status: 'failed', item, error: sent ? sent.error : null };
        }
      }
      return { orderId, status: 'inventory', item };
    } else {
      // Claim link
      return {
        orderId,
        status: 'claim_link_created',
        rawToken,
        item,
        targetUsername: recipientUsername ? normalizeUsername(recipientUsername) : null
      };
    }
  },

  async claimGiftToken(rawToken, claimingUser, bot = null, db = getDatabase()) {
    const hashed = hashToken(rawToken);

    const tokenRecord = db.get(
      `SELECT t.*, o.catalog_id, o.sender_id, o.stars_cost, c.gift_id, c.name_uz, c.name_ru 
       FROM gift_claim_tokens t 
       JOIN gift_orders o ON t.order_id = o.id 
       JOIN gift_catalog c ON o.catalog_id = c.id 
       WHERE t.token_hash = ?`,
      [hashed]
    );

    if (!tokenRecord) {
      return { ok: false, error: 'invalid_token' };
    }

    if (tokenRecord.is_claimed) {
      return { ok: false, error: 'already_claimed' };
    }

    if (tokenRecord.expires_at && new Date(tokenRecord.expires_at).getTime() < Date.now()) {
      return { ok: false, error: 'expired' };
    }

    if (tokenRecord.target_username) {
      const userClean = normalizeUsername(claimingUser.username);
      if (!userClean || userClean !== tokenRecord.target_username.toLowerCase()) {
        return {
          ok: false,
          error: 'username_mismatch',
          expected: tokenRecord.target_username
        };
      }
    }

    // Atomically mark token as claimed
    const claimed = db.transaction((txDb) => {
      // Double check inside transaction
      const current = txDb.get(`SELECT is_claimed FROM gift_claim_tokens WHERE id = ?`, [tokenRecord.id]);
      if (current.is_claimed) {
        return false;
      }
      const now = new Date().toISOString();
      txDb.run(
        `UPDATE gift_claim_tokens SET is_claimed = 1, claimed_by = ?, claimed_at = ? WHERE id = ?`,
        [claimingUser.id, now, tokenRecord.id]
      );
      return true;
    });

    if (!claimed) {
      return { ok: false, error: 'already_claimed' };
    }

    // Attempt delivery via bot
    let deliveryResult = { ok: true };
    if (bot) {
      deliveryResult = await this.sendTelegramGift(bot, claimingUser.id, tokenRecord.gift_id, 'Claimed gift');
    }

    const now = new Date().toISOString();
    if (deliveryResult.ok) {
      db.run(
        `UPDATE gift_orders SET recipient_id = ?, status = 'delivered', delivered_at = ? WHERE id = ?`,
        [claimingUser.id, now, tokenRecord.order_id]
      );
    } else {
      db.run(
        `UPDATE gift_orders SET recipient_id = ?, status = 'failed', delivery_error = ? WHERE id = ?`,
        [claimingUser.id, deliveryResult.error, tokenRecord.order_id]
      );
    }

    return {
      ok: true,
      orderId: tokenRecord.order_id,
      giftName: tokenRecord.name_uz,
      delivered: deliveryResult.ok,
      error: deliveryResult.ok ? null : deliveryResult.error
    };
  },

  async retryDelivery(orderId, bot, adminId = null, db = getDatabase()) {
    const order = db.get(
      `SELECT o.*, c.gift_id, c.name_uz 
       FROM gift_orders o 
       JOIN gift_catalog c ON o.catalog_id = c.id 
       WHERE o.id = ?`,
      [orderId]
    );

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status === 'delivered') {
      return { ok: true, alreadyDelivered: true };
    }

    const recipient = order.recipient_id || order.sender_id;
    if (!recipient) {
      throw new Error('No recipient numeric ID known for this order');
    }

    const sent = await this.sendTelegramGift(bot, recipient, order.gift_id, 'Telegram Gifts Delivery Retry');
    const now = new Date().toISOString();

    if (sent.ok) {
      db.run(
        `UPDATE gift_orders SET status = 'delivered', delivered_at = ?, delivery_error = NULL WHERE id = ?`,
        [now, orderId]
      );
      if (adminId) {
        db.run(
          `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details, created_at)
           VALUES (?, 'retry_gift_delivery', 'gift_order', ?, ?, ?)`,
          [adminId, String(orderId), JSON.stringify({ recipient, result: 'success' }), now]
        );
      }
      return { ok: true };
    } else {
      db.run(
        `UPDATE gift_orders SET delivery_error = ? WHERE id = ?`,
        [sent.error, orderId]
      );
      return { ok: false, error: sent.error };
    }
  },

  getUserInventory(userId, db = getDatabase()) {
    return db.query(
      `SELECT o.*, c.name_uz, c.name_ru, c.emoji 
       FROM gift_orders o 
       JOIN gift_catalog c ON o.catalog_id = c.id 
       WHERE o.sender_id = ? AND o.status = 'inventory' 
       ORDER BY o.id DESC`,
      [userId]
    );
  },

  getUserOrders(userId, limit = 10, db = getDatabase()) {
    return db.query(
      `SELECT o.*, c.name_uz, c.name_ru, c.emoji 
       FROM gift_orders o 
       JOIN gift_catalog c ON o.catalog_id = c.id 
       WHERE o.sender_id = ? OR o.recipient_id = ? 
       ORDER BY o.id DESC LIMIT ?`,
      [userId, userId, limit]
    );
  },

  getPendingDeliveries(db = getDatabase()) {
    return db.query(
      `SELECT o.*, c.name_uz, c.emoji, u.username as sender_username 
       FROM gift_orders o 
       JOIN gift_catalog c ON o.catalog_id = c.id 
       JOIN users u ON o.sender_id = u.id 
       WHERE o.status IN ('failed', 'inventory') 
       ORDER BY o.id DESC LIMIT 50`
    );
  }
};

module.exports = giftService;
