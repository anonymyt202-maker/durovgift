const { Markup } = require('telegraf');
const { getDatabase } = require('../db/database');
const { getAdmin, hasPermission, recordAuditLog, ROLES } = require('./permissions');
const { t } = require('../utils/i18n');
const keyboards = require('../bot/keyboards');
const balanceService = require('../services/balanceService');
const giftService = require('../services/giftService');
const referralService = require('../services/referralService');
const advertisingService = require('../services/advertisingService');
const supportService = require('../services/supportService');
const channelService = require('../services/channelService');
const logger = require('../utils/logger');
const { escapeHtml, parsePositiveInt } = require('../utils/validation');

// In-memory admin interaction state: Map<userId, { step: string, data: object }>
const adminStates = new Map();

function setAdminState(userId, step, data = {}) {
  adminStates.set(Number(userId), { step, data });
}

function getAdminState(userId) {
  return adminStates.get(Number(userId));
}

function clearAdminState(userId) {
  adminStates.delete(Number(userId));
}

const adminHandlers = {
  async handleAdminCommand(ctx) {
    const userId = ctx.from.id;
    const admin = getAdmin(userId);
    if (!admin) {
      return ctx.reply('⛔ Sizda admin huquqi mavjud emas / У вас нет прав администратора.');
    }

    const user = balanceService.getUser(userId);
    const lang = user ? user.language : 'uz';

    return ctx.reply(
      t(lang, 'admin.menu_title', { role: admin.role }),
      {
        parse_mode: 'HTML',
        ...keyboards.adminMainMenu(admin.role, lang)
      }
    );
  },

  async handleCallback(ctx) {
    const userId = ctx.from.id;
    const admin = getAdmin(userId);
    if (!admin) {
      await ctx.answerCbQuery('Access denied');
      return ctx.reply('⛔ Ruxsat berilmagan!');
    }

    const user = balanceService.getUser(userId);
    const lang = user ? user.language : 'uz';
    const data = ctx.callbackQuery.data;

    await ctx.answerCbQuery();

    // Route callback
    if (data === 'adm_main') {
      clearAdminState(userId);
      return ctx.editMessageText(
        t(lang, 'admin.menu_title', { role: admin.role }),
        {
          parse_mode: 'HTML',
          ...keyboards.adminMainMenu(admin.role, lang)
        }
      );
    }

    if (data === 'adm_close') {
      clearAdminState(userId);
      return ctx.deleteMessage().catch(() => {});
    }

    if (data === 'adm_dash') {
      return this.renderDashboard(ctx, admin, lang);
    }

    if (data === 'adm_users') {
      return this.renderUsersList(ctx, admin, lang);
    }

    if (data === 'adm_balance_adj') {
      if (!hasPermission(userId, 'EDIT_BALANCE')) {
        return ctx.reply(t(lang, 'admin.access_denied'));
      }
      setAdminState(userId, 'WAITING_ADJ_USER');
      return ctx.reply(
        '💰 <b>Balans o\'zgartirish:</b>\nIltimos, foydalanuvchining numeric Telegram ID sini kiriting:',
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('❌ Bekor qilish', 'adm_cancel')]])
        }
      );
    }

    if (data === 'adm_payments') {
      return this.renderPaymentsHistory(ctx, admin, lang);
    }

    if (data === 'adm_catalog') {
      return this.renderCatalogManagement(ctx, admin, lang);
    }

    if (data === 'adm_orders') {
      return this.renderOrdersList(ctx, admin, lang);
    }

    if (data === 'adm_pending_deliveries') {
      return this.renderPendingDeliveries(ctx, admin, lang);
    }

    if (data === 'adm_referrals') {
      return this.renderReferralsQueue(ctx, admin, lang);
    }

    if (data === 'adm_channels') {
      return this.renderChannelsManagement(ctx, admin, lang);
    }

    if (data === 'adm_rewards') {
      return this.renderRewardsSettings(ctx, admin, lang);
    }

    if (data === 'adm_games') {
      return this.renderGamesSettings(ctx, admin, lang);
    }

    if (data === 'adm_ads') {
      return this.renderAdsManagement(ctx, admin, lang);
    }

    if (data === 'adm_tickets') {
      return this.renderTickets(ctx, admin, lang);
    }

    if (data === 'adm_broadcast') {
      if (!hasPermission(userId, 'BROADCAST')) {
        return ctx.reply(t(lang, 'admin.access_denied'));
      }
      setAdminState(userId, 'WAITING_BROADCAST_MSG');
      return ctx.reply(
        '✉️ <b>Barcha foydalanuvchilarga xabar yuborish:</b>\nIltimos, yubormoqchi bo\'lgan xabaringizni kiriting:',
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('❌ Bekor qilish', 'adm_cancel')]])
        }
      );
    }

    if (data === 'adm_admins') {
      return this.renderAdminsList(ctx, admin, lang);
    }

    if (data === 'adm_settings') {
      return this.renderSettings(ctx, admin, lang);
    }

    if (data === 'adm_audit') {
      return this.renderAuditLogs(ctx, admin, lang);
    }

    if (data === 'adm_cancel') {
      clearAdminState(userId);
      return ctx.editMessageText('❌ Bekor qilindi.', keyboards.adminBack('adm_main', lang));
    }

    // Dynamic pattern callbacks
    if (data.startsWith('adm_retry_order_')) {
      const orderId = Number(data.replace('adm_retry_order_', ''));
      return this.handleRetryDelivery(ctx, orderId, admin, lang);
    }

    if (data.startsWith('adm_appr_ref_')) {
      const reqId = Number(data.replace('adm_appr_ref_', ''));
      return this.handleApproveReferral(ctx, reqId, admin, lang);
    }

    if (data.startsWith('adm_rej_ref_')) {
      const reqId = Number(data.replace('adm_rej_ref_', ''));
      return this.handleRejectReferral(ctx, reqId, admin, lang);
    }

    if (data.startsWith('adm_appr_ad_')) {
      const orderId = Number(data.replace('adm_appr_ad_', ''));
      return this.handleUpdateAd(ctx, orderId, 'approved', admin, lang);
    }

    if (data.startsWith('adm_pub_ad_')) {
      const orderId = Number(data.replace('adm_pub_ad_', ''));
      return this.handleUpdateAd(ctx, orderId, 'published', admin, lang);
    }

    if (data.startsWith('adm_rej_ad_')) {
      const orderId = Number(data.replace('adm_rej_ad_', ''));
      return this.handleUpdateAd(ctx, orderId, 'rejected', admin, lang);
    }

    if (data.startsWith('adm_reply_ticket_')) {
      const ticketId = Number(data.replace('adm_reply_ticket_', ''));
      setAdminState(userId, 'WAITING_TICKET_REPLY', { ticketId });
      return ctx.reply(
        `✍️ #${ticketId} raqamli murojaat uchun javob xabarini yozing:`,
        Markup.inlineKeyboard([[Markup.button.callback('❌ Bekor qilish', 'adm_cancel')]])
      );
    }

    if (data.startsWith('adm_toggle_gift_')) {
      const giftId = Number(data.replace('adm_toggle_gift_', ''));
      return this.handleToggleGift(ctx, giftId, admin, lang);
    }

    if (data.startsWith('adm_toggle_setting_')) {
      const key = data.replace('adm_toggle_setting_', '');
      return this.handleToggleSetting(ctx, key, admin, lang);
    }
  },

  async renderDashboard(ctx, admin, lang) {
    const db = getDatabase();
    const usersCount = db.get(`SELECT COUNT(*) as c FROM users`)?.c || 0;
    const totalPayments = db.get(`SELECT SUM(amount_stars) as s FROM payments WHERE status = 'completed'`)?.s || 0;
    const totalGiftsSold = db.get(`SELECT COUNT(*) as c FROM gift_orders`)?.c || 0;
    const pendingDeliveries = db.get(`SELECT COUNT(*) as c FROM gift_orders WHERE status IN ('failed', 'inventory')`)?.c || 0;
    const pendingReferrals = db.get(`SELECT COUNT(*) as c FROM referral_reward_requests WHERE status = 'pending'`)?.c || 0;
    const pendingAds = db.get(`SELECT COUNT(*) as c FROM advertising_orders WHERE status = 'pending'`)?.c || 0;
    const openTickets = db.get(`SELECT COUNT(*) as c FROM support_tickets WHERE status = 'open'`)?.c || 0;

    const text = t(lang, 'admin.dashboard_stats', {
      usersCount,
      totalPayments,
      totalGiftsSold,
      pendingDeliveries,
      pendingReferrals,
      pendingAds,
      openTickets
    });

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...keyboards.adminBack('adm_main', lang)
    });
  },

  async renderUsersList(ctx, admin, lang) {
    const db = getDatabase();
    const users = db.query(`SELECT id, username, first_name, balance, created_at FROM users ORDER BY id DESC LIMIT 10`);
    let text = `👥 <b>Oxirgi foydalanuvchilar (jami 10 ta):</b>\n\n`;
    for (const u of users) {
      text += `• 🆔 <code>${u.id}</code> | @${u.username || 'yo\'q'} | ⭐ ${u.balance} Stars | ${u.first_name || ''}\n`;
    }
    text += `\n<i>Foydalanuvchi qidirish uchun ID yoki username ni yuborishingiz mumkin.</i>`;

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...keyboards.adminBack('adm_main', lang)
    });
  },

  async renderPaymentsHistory(ctx, admin, lang) {
    const db = getDatabase();
    const payments = db.query(
      `SELECT p.*, u.username 
       FROM payments p 
       LEFT JOIN users u ON p.user_id = u.id 
       ORDER BY p.id DESC LIMIT 10`
    );
    let text = `💳 <b>Oxirgi to'lovlar:</b>\n\n`;
    if (payments.length === 0) {
      text += `Hozircha to'lovlar mavjud emas.`;
    } else {
      for (const p of payments) {
        text += `• #${p.id} | User: <code>${p.user_id}</code> (@${p.username || 'yo\'q'}) | +${p.amount_stars} ⭐ | ${p.status}\n`;
      }
    }

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...keyboards.adminBack('adm_main', lang)
    });
  },

  async renderCatalogManagement(ctx, admin, lang) {
    const gifts = giftService.getCatalog(false);
    let text = `🎁 <b>Sovg'alar katalogi boshqaruvi:</b>\n\n`;
    const rows = [];

    for (const g of gifts) {
      const status = g.is_available ? '✅ Faol' : '❌ Nofaol';
      text += `${g.emoji} <b>${g.name_uz}</b> (${g.gift_id})\nNarxi: ${g.stars_price} ⭐ | Holati: ${status}\n\n`;
      rows.push([
        Markup.button.callback(
          `${g.emoji} ${g.is_available ? 'O\'chirish' : 'Yoqish'} (${g.gift_id})`,
          `adm_toggle_gift_${g.id}`
        )
      ]);
    }

    rows.push([Markup.button.callback(t(lang, 'buttons.back'), 'adm_main')]);

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(rows)
    });
  },

  async handleToggleGift(ctx, giftId, admin, lang) {
    if (!hasPermission(admin.id, 'MANAGE_CATALOG')) {
      return ctx.reply(t(lang, 'admin.access_denied'));
    }
    const db = getDatabase();
    const item = db.get(`SELECT * FROM gift_catalog WHERE id = ?`, [giftId]);
    if (!item) return;

    const newStatus = item.is_available ? 0 : 1;
    db.run(`UPDATE gift_catalog SET is_available = ? WHERE id = ?`, [newStatus, giftId]);

    recordAuditLog({
      adminId: admin.id,
      action: 'toggle_gift_availability',
      targetType: 'gift_catalog',
      targetId: String(giftId),
      details: { newStatus }
    });

    return this.renderCatalogManagement(ctx, admin, lang);
  },

  async renderOrdersList(ctx, admin, lang) {
    const db = getDatabase();
    const orders = db.query(
      `SELECT o.*, c.name_uz, c.emoji, u.username as sender_username 
       FROM gift_orders o 
       JOIN gift_catalog c ON o.catalog_id = c.id 
       JOIN users u ON o.sender_id = u.id 
       ORDER BY o.id DESC LIMIT 10`
    );

    let text = `📦 <b>Oxirgi sovg'a buyurtmalari:</b>\n\n`;
    if (orders.length === 0) {
      text += `Buyurtmalar mavjud emas.`;
    } else {
      for (const o of orders) {
        text += `• #${o.id} | ${o.emoji} ${o.name_uz} | Yuboruvchi: <code>${o.sender_id}</code> | Qabul: ${o.recipient_id || o.recipient_username || 'havola'} | Holat: <b>${o.status}</b>\n`;
      }
    }

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...keyboards.adminBack('adm_main', lang)
    });
  },

  async renderPendingDeliveries(ctx, admin, lang) {
    const list = giftService.getPendingDeliveries();
    let text = `⏳ <b>Yetkazilmagan yoki xatolik yuz bergan sovg'alar:</b>\n\n`;
    const rows = [];

    if (list.length === 0) {
      text += `Hammasi joyida! Yetkazilmagan sovg'alar yo'q.`;
    } else {
      for (const item of list.slice(0, 5)) {
        text += `• Buyurtma #${item.id} | ${item.emoji} ${item.name_uz} | Holat: ${item.status}\nXatolik: <code>${escapeHtml(item.delivery_error || 'Kutilmoqda')}</code>\n\n`;
        rows.push([
          Markup.button.callback(`🔄 #${item.id} ni qayta yuborish`, `adm_retry_order_${item.id}`)
        ]);
      }
    }

    rows.push([Markup.button.callback(t(lang, 'buttons.back'), 'adm_main')]);

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(rows)
    });
  },

  async handleRetryDelivery(ctx, orderId, admin, lang) {
    if (!hasPermission(admin.id, 'RETRY_DELIVERIES')) {
      return ctx.reply(t(lang, 'admin.access_denied'));
    }
    const res = await giftService.retryDelivery(orderId, ctx, admin.id);
    if (res.ok) {
      await ctx.reply(`✅ #${orderId} raqamli sovg'a muvaffaqiyatli yetkazildi!`);
    } else {
      await ctx.reply(`❌ Qayta urinishda xatolik: ${res.error}`);
    }
    return this.renderPendingDeliveries(ctx, admin, lang);
  },

  async renderReferralsQueue(ctx, admin, lang) {
    const list = referralService.getPendingRequests();
    let text = `👥 <b>Referal mukofot so'rovlari navbati:</b>\n\n`;
    const rows = [];

    if (list.length === 0) {
      text += `Kutilayotgan mukofot so'rovlari yo'q.`;
    } else {
      for (const r of list.slice(0, 5)) {
        text += `• So'rov #${r.id} | Foydalanuvchi: <code>${r.user_id}</code> (@${r.username || 'yo\'q'})\nReferallar: ${r.referral_count} | Mukofot: ${r.reward_amount} Stars\n\n`;
        rows.push([
          Markup.button.callback(`✅ #${r.id} Tasdiqlash`, `adm_appr_ref_${r.id}`),
          Markup.button.callback(`❌ Rad etish`, `adm_rej_ref_${r.id}`)
        ]);
      }
    }

    rows.push([Markup.button.callback(t(lang, 'buttons.back'), 'adm_main')]);

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(rows)
    });
  },

  async handleApproveReferral(ctx, reqId, admin, lang) {
    if (!hasPermission(admin.id, 'MANAGE_REFERRALS')) {
      return ctx.reply(t(lang, 'admin.access_denied'));
    }
    try {
      const res = referralService.approveRewardRequest(reqId, admin.id);
      await ctx.reply(`✅ #${reqId} so'rovi tasdiqlandi. Foydalanuvchiga +${res.amount} Stars berildi.`);
      try {
        await ctx.telegram.sendMessage(res.userId, `🎉 Sizning referal mukofot so'rovingiz tasdiqlandi! Hisobingizga +${res.amount} Stars qo'shildi.`);
      } catch (e) {}
    } catch (err) {
      await ctx.reply(`❌ Xatolik: ${err.message}`);
    }
    return this.renderReferralsQueue(ctx, admin, lang);
  },

  async handleRejectReferral(ctx, reqId, admin, lang) {
    if (!hasPermission(admin.id, 'MANAGE_REFERRALS')) {
      return ctx.reply(t(lang, 'admin.access_denied'));
    }
    try {
      const res = referralService.rejectRewardRequest(reqId, admin.id, 'Admin tomonidan rad etildi');
      await ctx.reply(`❌ #${reqId} so'rovi rad etildi.`);
      try {
        await ctx.telegram.sendMessage(res.userId, `⚠️ Sizning referal mukofot so'rovingiz rad etildi.`);
      } catch (e) {}
    } catch (err) {
      await ctx.reply(`❌ Xatolik: ${err.message}`);
    }
    return this.renderReferralsQueue(ctx, admin, lang);
  },

  async renderChannelsManagement(ctx, admin, lang) {
    const channels = channelService.getChannels(false);
    let text = `📢 <b>Homiy kanallar boshqaruvi:</b>\n\n`;
    for (const ch of channels) {
      const st = ch.is_active ? '✅ Faol' : '❌ Nofaol';
      text += `• ID: <code>${ch.channel_id}</code> | ${ch.title} | ${ch.invite_url} | ${st}\n`;
    }
    text += `\nYangi kanal qo'shish uchun /admin buyrug'i ostida kanal ID va ma'lumotlarini kiritishingiz mumkin.`;

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...keyboards.adminBack('adm_main', lang)
    });
  },

  async renderRewardsSettings(ctx, admin, lang) {
    const db = getDatabase();
    const threshold = db.get(`SELECT value FROM bot_settings WHERE key = 'daily_reward_threshold'`)?.value || '2';
    const amount = db.get(`SELECT value FROM bot_settings WHERE key = 'daily_reward_amount'`)?.value || '5';
    const cooldown = db.get(`SELECT value FROM bot_settings WHERE key = 'daily_reward_cooldown_hours'`)?.value || '24';
    const enabled = db.get(`SELECT value FROM bot_settings WHERE key = 'daily_reward_enabled'`)?.value || '1';

    const text = `⭐ <b>Har kunlik mukofot sozlamalari:</b>\n\n• Holati: ${enabled === '1' ? '✅ Faol' : '❌ Nofaol'}\n• Kerakli yangi referallar: <b>${threshold} ta</b>\n• Mukofot miqdori: <b>${amount} Stars</b>\n• Kutish vaqti (Cooldown): <b>${cooldown} soat</b>`;

    const rows = [
      [Markup.button.callback(`Holatni o'zgartirish (${enabled === '1' ? 'O\'chirish' : 'Yoqish'})`, 'adm_toggle_setting_daily_reward_enabled')],
      [Markup.button.callback(t(lang, 'buttons.back'), 'adm_main')]
    ];

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(rows)
    });
  },

  async renderGamesSettings(ctx, admin, lang) {
    const db = getDatabase();
    const limit = db.get(`SELECT value FROM bot_settings WHERE key = 'game_daily_limit'`)?.value || '10';
    const bball = db.get(`SELECT value FROM bot_settings WHERE key = 'game_basketball_enabled'`)?.value || '1';
    const fball = db.get(`SELECT value FROM bot_settings WHERE key = 'game_football_enabled'`)?.value || '1';
    const darts = db.get(`SELECT value FROM bot_settings WHERE key = 'game_darts_enabled'`)?.value || '1';

    const text = `🎮 <b>Mini-o'yinlar sozlamalari:</b>\n\n• Kunlik urinishlar limiti: <b>${limit} ta</b>\n• Basketbol: ${bball === '1' ? '✅' : '❌'}\n• Futbol: ${fball === '1' ? '✅' : '❌'}\n• Darts: ${darts === '1' ? '✅' : '❌'}`;

    const rows = [
      [Markup.button.callback('🏀 Basketbol yoqish/o\'chirish', 'adm_toggle_setting_game_basketball_enabled')],
      [Markup.button.callback('⚽ Futbol yoqish/o\'chirish', 'adm_toggle_setting_game_football_enabled')],
      [Markup.button.callback('🎯 Darts yoqish/o\'chirish', 'adm_toggle_setting_game_darts_enabled')],
      [Markup.button.callback(t(lang, 'buttons.back'), 'adm_main')]
    ];

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(rows)
    });
  },

  async renderAdsManagement(ctx, admin, lang) {
    const orders = advertisingService.getPendingOrders();
    let text = `📢 <b>Kutilayotgan reklama arizalari:</b>\n\n`;
    const rows = [];

    if (orders.length === 0) {
      text += `Kutilayotgan arizalar yo'q.`;
    } else {
      for (const ad of orders.slice(0, 3)) {
        text += `• Buyurtma #${ad.id} | Foydalanuvchi: <code>${ad.user_id}</code>\nPaket: ${ad.title_uz} (${ad.price_stars} ⭐)\nMatn: <i>${escapeHtml(ad.content_text.slice(0, 100))}...</i>\n\n`;
        rows.push([
          Markup.button.callback(`✅ #${ad.id} Tasdiqlash`, `adm_appr_ad_${ad.id}`),
          Markup.button.callback(`🚀 E'lon qilish`, `adm_pub_ad_${ad.id}`),
          Markup.button.callback(`❌ Rad etish`, `adm_rej_ad_${ad.id}`)
        ]);
      }
    }

    rows.push([Markup.button.callback(t(lang, 'buttons.back'), 'adm_main')]);

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(rows)
    });
  },

  async handleUpdateAd(ctx, orderId, status, admin, lang) {
    if (!hasPermission(admin.id, 'MANAGE_ADS')) {
      return ctx.reply(t(lang, 'admin.access_denied'));
    }
    advertisingService.updateOrderStatus(orderId, status, admin.id, `Status updated to ${status}`);
    await ctx.reply(`✅ #${orderId} reklama buyurtmasi statusi: ${status}`);
    return this.renderAdsManagement(ctx, admin, lang);
  },

  async renderTickets(ctx, admin, lang) {
    const tickets = supportService.getOpenTickets();
    let text = `💬 <b>Ochiq qo'llab-quvvatlash murojaatlari:</b>\n\n`;
    const rows = [];

    if (tickets.length === 0) {
      text += `Ochiq murojaatlar yo'q!`;
    } else {
      for (const tk of tickets.slice(0, 5)) {
        text += `• Murojaat #${tk.id} | 👤 <code>${tk.user_id}</code> (@${tk.username || 'yo\'q'})\nMatn: <i>${escapeHtml(tk.message.slice(0, 100))}</i>\n\n`;
        rows.push([Markup.button.callback(`✉️ #${tk.id} ga javob yozish`, `adm_reply_ticket_${tk.id}`)]);
      }
    }

    rows.push([Markup.button.callback(t(lang, 'buttons.back'), 'adm_main')]);

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(rows)
    });
  },

  async renderAdminsList(ctx, admin, lang) {
    const db = getDatabase();
    const list = db.query(`SELECT * FROM admins ORDER BY id ASC`);
    let text = `🛡️ <b>Adminlar ro'yxati:</b>\n\n`;
    for (const a of list) {
      text += `• 🆔 <code>${a.id}</code> | Rol: <b>${a.role}</b> | Username: @${a.username || 'yo\'q'}\n`;
    }

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...keyboards.adminBack('adm_main', lang)
    });
  },

  async renderSettings(ctx, admin, lang) {
    const db = getDatabase();
    const rows = db.query(`SELECT * FROM bot_settings ORDER BY key ASC`);
    let text = `⚙️ <b>Bot tizim sozlamalari:</b>\n\n`;
    for (const s of rows) {
      text += `• <code>${s.key}</code>: <b>${s.value}</b>\n`;
    }

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...keyboards.adminBack('adm_main', lang)
    });
  },

  async handleToggleSetting(ctx, key, admin, lang) {
    if (!hasPermission(admin.id, 'MANAGE_SETTINGS')) {
      return ctx.reply(t(lang, 'admin.access_denied'));
    }
    const db = getDatabase();
    const current = db.get(`SELECT value FROM bot_settings WHERE key = ?`, [key]);
    const newVal = current && current.value === '1' ? '0' : '1';
    db.run(`UPDATE bot_settings SET value = ? WHERE key = ?`, [newVal, key]);

    recordAuditLog({
      adminId: admin.id,
      action: 'toggle_setting',
      details: { key, newVal }
    });

    await ctx.reply(`⚙️ ${key} sozlamasi o'zgartirildi: ${newVal}`);
    return this.renderSettings(ctx, admin, lang);
  },

  async renderAuditLogs(ctx, admin, lang) {
    const db = getDatabase();
    const logs = db.query(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 10`);
    let text = `📜 <b>Audit jurnali (oxirgi 10 ta amal):</b>\n\n`;
    for (const l of logs) {
      text += `• Admin: <code>${l.admin_id}</code> | Amal: <b>${l.action}</b> | Vaqt: ${l.created_at.slice(0, 16)}\n`;
    }

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...keyboards.adminBack('adm_main', lang)
    });
  },

  async handleTextMessage(ctx) {
    const userId = ctx.from.id;
    const state = getAdminState(userId);
    if (!state) return false;

    const user = balanceService.getUser(userId);
    const lang = user ? user.language : 'uz';
    const text = ctx.message.text ? ctx.message.text.trim() : '';

    if (state.step === 'WAITING_ADJ_USER') {
      const targetId = Number(text);
      if (Number.isNaN(targetId) || targetId <= 0) {
        return ctx.reply('Noto\'g\'ri ID. Qaytadan kiriting yoki bekor qiling:');
      }
      const targetUser = balanceService.getUser(targetId);
      if (!targetUser) {
        return ctx.reply('Foydalanuvchi topilmadi. Qaytadan kiriting:');
      }
      setAdminState(userId, 'WAITING_ADJ_AMOUNT', { targetId, currentBalance: targetUser.balance });
      return ctx.reply(
        `Foydalanuvchi: <code>${targetId}</code> (Hozirgi balans: ${targetUser.balance} Stars)\nO'zgartirmoqchi bo'lgan miqdorni kiriting (musbat qo'shadi, manfiy ayiradi, masalan: 50 yoki -20):`,
        { parse_mode: 'HTML' }
      );
    }

    if (state.step === 'WAITING_ADJ_AMOUNT') {
      const amount = Number(text);
      if (!Number.isInteger(amount) || amount === 0) {
        return ctx.reply('Iltimos, noldan farqli butun son kiriting (masalan: 25 yoki -10):');
      }
      setAdminState(userId, 'WAITING_ADJ_REASON', { ...state.data, amount });
      return ctx.reply('Iltimos, ushbu o\'zgartirish sababini yozing (majburiy audit uchun):');
    }

    if (state.step === 'WAITING_ADJ_REASON') {
      if (!text || text.length < 3) {
        return ctx.reply('Sabab juda qisqa. Iltimos, batafsil sabab yozing:');
      }
      const { targetId, amount } = state.data;
      try {
        const res = balanceService.adjustBalance(
          targetId,
          amount,
          'admin_adjustment',
          null,
          `Admin adjustment: ${text}`,
          userId
        );
        clearAdminState(userId);
        return ctx.reply(
          `✅ Balans o'zgartirildi!\nFoydalanuvchi: <code>${targetId}</code>\nO'zgarish: ${amount > 0 ? '+' : ''}${amount} Stars\nYangi balans: ${res.newBalance} Stars\nSabab: ${escapeHtml(text)}`,
          { parse_mode: 'HTML', ...keyboards.adminBack('adm_main', lang) }
        );
      } catch (err) {
        clearAdminState(userId);
        return ctx.reply(`❌ Xatolik: ${err.message}`, keyboards.adminBack('adm_main', lang));
      }
    }

    if (state.step === 'WAITING_TICKET_REPLY') {
      const { ticketId } = state.data;
      const updatedTicket = supportService.replyToTicket(ticketId, userId, text);
      clearAdminState(userId);
      await ctx.reply(`✅ #${ticketId} murojaatga javob saqlandi va foydalanuvchiga yuboriladi.`);
      try {
        await ctx.telegram.sendMessage(
          updatedTicket.user_id,
          `💬 <b>Qo'llab-quvvatlash xizmati javobi (#{ticketId}):</b>\n\n${escapeHtml(text)}`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {
        logger.warn(`Could not send ticket reply to user ${updatedTicket.user_id}:`, e.message);
      }
      return true;
    }

    if (state.step === 'WAITING_BROADCAST_MSG') {
      clearAdminState(userId);
      const db = getDatabase();
      const users = db.query(`SELECT id FROM users WHERE is_blocked = 0`);
      let sent = 0;
      let failed = 0;
      await ctx.reply(`🚀 Xabar tarqatilmoqda... (${users.length} ta foydalanuvchiga)`);
      for (const u of users) {
        try {
          await ctx.telegram.sendMessage(u.id, text, { parse_mode: 'HTML' });
          sent++;
        } catch (e) {
          failed++;
        }
      }
      recordAuditLog({
        adminId: userId,
        action: 'broadcast_message',
        details: { sent, failed, textLength: text.length }
      });
      return ctx.reply(`✅ Xabar yuborildi!\nYetkazildi: ${sent} ta\nXatolik: ${failed} ta`, keyboards.adminBack('adm_main', lang));
    }

    return false;
  }
};

module.exports = adminHandlers;
