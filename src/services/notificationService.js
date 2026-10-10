const { getDatabase } = require('../db/database');
const logger = require('../utils/logger');
const { escapeHtml } = require('../utils/validation');

const notificationService = {
  getAdminUserIds(db = getDatabase()) {
    const rows = db.query(`SELECT id FROM admins`);
    return rows.map((r) => r.id);
  },

  isCategoryEnabled(categoryKey, db = getDatabase()) {
    const row = db.get(`SELECT value FROM bot_settings WHERE key = ?`, [categoryKey]);
    return !row || row.value === '1';
  },

  async broadcastToAdmins(bot, messageText, categoryKey = null, db = getDatabase()) {
    if (!bot || !bot.telegram) return;
    if (categoryKey && !this.isCategoryEnabled(categoryKey, db)) return;

    const adminIds = this.getAdminUserIds(db);
    for (const adminId of adminIds) {
      try {
        await bot.telegram.sendMessage(adminId, messageText, { parse_mode: 'HTML' });
      } catch (err) {
        logger.warn(`Could not send admin notification to ${adminId}:`, err.message);
      }
    }
  },

  async notifyNewUser(bot, user, db = getDatabase()) {
    const text = `👤 <b>Yangi foydalanuvchi / Новый пользователь:</b>\n🆔 ID: <code>${user.id}</code>\n👤 @${user.username || 'yo\'q'}\n📝 Ismi: ${escapeHtml(user.first_name || '')}`;
    await this.broadcastToAdmins(bot, text, 'notify_new_user', db);
  },

  async notifyPaymentSuccess(bot, payment, newBalance, db = getDatabase()) {
    const text = `💳 <b>Muvaffaqiyatli to'lov / Успешная оплата:</b>\n👤 Foydalanuvchi: <code>${payment.user_id}</code>\n⭐ Summa: <b>+${payment.amount_stars} Stars</b>\n🧾 Charge ID: <code>${escapeHtml(payment.telegram_payment_charge_id || '')}</code>\n💰 Yangi balans: <b>${newBalance} Stars</b>`;
    await this.broadcastToAdmins(bot, text, 'notify_payments', db);
  },

  async notifyGiftDeliveryFailed(bot, orderId, errorMsg, db = getDatabase()) {
    const text = `⚠️ <b>Sovg'a yetkazishda xatolik / Ошибка доставки подарка:</b>\n📦 Buyurtma ID: #${orderId}\n❌ Xatolik: ${escapeHtml(errorMsg)}`;
    await this.broadcastToAdmins(bot, text, 'notify_orders', db);
  },

  async notifyReferralRewardRequest(bot, req, db = getDatabase()) {
    const text = `👥 <b>Yangi referal mukofot so'rovi / Новый запрос награды:</b>\n👤 ID: <code>${req.user_id}</code>\n📊 Referallar: ${req.referral_count} ta\n🎁 Mukofot: ${req.reward_amount} Stars`;
    await this.broadcastToAdmins(bot, text, 'notify_orders', db);
  },

  async notifyNewAdOrder(bot, order, db = getDatabase()) {
    const text = `📢 <b>Yangi reklama buyurtmasi / Новый заказ рекламы:</b>\n📦 Buyurtma ID: #${order.orderId}\n👤 Foydalanuvchi: <code>${order.userId}</code>\n⭐ Qiymati: ${order.price} Stars`;
    await this.broadcastToAdmins(bot, text, 'notify_orders', db);
  },

  async notifyNewSupportTicket(bot, ticket, db = getDatabase()) {
    const text = `💬 <b>Yangi murojaat / Новый тикет поддержки:</b>\n🎫 ID: #${ticket.ticketId}\n👤 Foydalanuvchi: <code>${ticket.userId}</code> (@${ticket.username || 'yo\'q'})\n📝 Xabar: ${escapeHtml(ticket.message)}`;
    await this.broadcastToAdmins(bot, text, 'notify_support', db);
  }
};

module.exports = notificationService;
