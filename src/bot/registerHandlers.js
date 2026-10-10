const { Markup } = require('telegraf');
const keyboards = require('./keyboards');
const { t } = require('../utils/i18n');
const balanceService = require('../services/balanceService');
const paymentService = require('../services/paymentService');
const giftService = require('../services/giftService');
const referralService = require('../services/referralService');
const rewardService = require('../services/rewardService');
const gameService = require('../services/gameService');
const advertisingService = require('../services/advertisingService');
const supportService = require('../services/supportService');
const channelService = require('../services/channelService');
const notificationService = require('../services/notificationService');
const adminHandlers = require('../admin/adminHandlers');
const config = require('../config');
const logger = require('../utils/logger');
const { normalizeUsername, parsePositiveInt, escapeHtml } = require('../utils/validation');

// User conversational states: Map<userId, { action: string, data: object }>
const userStates = new Map();

function setUserState(userId, action, data = {}) {
  userStates.set(Number(userId), { action, data });
}

function getUserState(userId) {
  return userStates.get(Number(userId));
}

function clearUserState(userId) {
  userStates.delete(Number(userId));
}

function registerHandlers(bot) {
  // 1. /start command
  bot.command('start', async (ctx) => {
    try {
      const from = ctx.from;
      const text = ctx.message.text || '';
      const payload = text.split(' ')[1] || '';

      let referrerId = null;
      let claimToken = null;

      if (payload.startsWith('ref_')) {
        referrerId = Number(payload.replace('ref_', ''));
      } else if (payload.startsWith('claim_')) {
        claimToken = payload.replace('claim_', '');
      }

      const { user, isNew } = balanceService.getOrCreateUser(from, referrerId);
      const lang = user.language || 'uz';

      if (isNew) {
        notificationService.notifyNewUser(bot, user).catch(() => {});
      }

      // If user came via gift claim link
      if (claimToken) {
        const claimResult = await giftService.claimGiftToken(claimToken, from, bot);
        if (claimResult.ok) {
          return ctx.reply(
            t(lang, 'send_flow.claim_success', { orderId: claimResult.orderId }),
            keyboards.mainMenu(lang)
          );
        } else {
          if (claimResult.error === 'username_mismatch') {
            return ctx.reply(
              t(lang, 'send_flow.claim_username_mismatch', { expected: claimResult.expected }),
              keyboards.mainMenu(lang)
            );
          } else if (claimResult.error === 'already_claimed' || claimResult.error === 'expired') {
            return ctx.reply(t(lang, 'send_flow.claim_already_used'), keyboards.mainMenu(lang));
          } else {
            return ctx.reply(t(lang, 'send_flow.invalid_token'), keyboards.mainMenu(lang));
          }
        }
      }

      // If user is brand new and has not picked language explicitly
      if (isNew) {
        return ctx.reply(t('uz', 'welcome_choose_lang'), {
          parse_mode: 'HTML',
          ...keyboards.languageSelection()
        });
      }

      return ctx.reply(
        t(lang, 'main_menu_title'),
        {
          parse_mode: 'HTML',
          ...keyboards.mainMenu(lang)
        }
      );
    } catch (err) {
      logger.error('Error handling /start:', err.message);
      return ctx.reply(t('uz', 'errors.generic'), { parse_mode: 'HTML' });
    }
  });

  // 2. /admin command
  bot.command('admin', async (ctx) => {
    return adminHandlers.handleAdminCommand(ctx);
  });

  // 3. /terms and /paysupport
  bot.command('terms', async (ctx) => {
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    return ctx.reply(t(lang, 'support.terms_text'), { parse_mode: 'HTML', ...keyboards.backToMain(lang) });
  });

  bot.command('paysupport', async (ctx) => {
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    return ctx.reply(
      t(lang, 'support.paysupport_text', { supportUser: config.supportUsername }),
      { parse_mode: 'HTML', ...keyboards.backToMain(lang) }
    );
  });

  // 4. Language Selection callbacks
  bot.action(/^set_lang_(uz|ru)$/, async (ctx) => {
    const lang = ctx.match[1];
    balanceService.setLanguage(ctx.from.id, lang);
    await ctx.answerCbQuery(t(lang, 'lang_selected'));
    return ctx.editMessageText(
      `✅ ${t(lang, 'lang_selected')}\n\n${t(lang, 'main_menu_title')}`,
      {
        parse_mode: 'HTML',
        ...keyboards.mainMenu(lang)
      }
    );
  });

  bot.action('change_language', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.editMessageText(
      t('uz', 'welcome_choose_lang'),
      {
        parse_mode: 'HTML',
        ...keyboards.languageSelection()
      }
    );
  });

  // 5. Main menu return
  bot.action('menu_main', async (ctx) => {
    clearUserState(ctx.from.id);
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    return ctx.editMessageText(
      t(lang, 'main_menu_title'),
      {
        parse_mode: 'HTML',
        ...keyboards.mainMenu(lang)
      }
    );
  });

  // 6. User Profile
  bot.action('menu_profile', async (ctx) => {
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';

    const inv = giftService.getUserInventory(ctx.from.id);
    const orders = giftService.getUserOrders(ctx.from.id, 5);
    const refStats = referralService.getReferralStats(ctx.from.id);
    const recentTx = balanceService.getRecentTransactions(ctx.from.id, 3);

    let text = `${t(lang, 'profile.title')}\n\n`;
    text += `${t(lang, 'profile.user_id', { userId: user.id })}\n`;
    text += `${t(lang, 'profile.username', { username: user.username || 'yo\'q / нет' })}\n`;
    text += `${t(lang, 'profile.reg_date', { date: user.created_at.slice(0, 10) })}\n\n`;
    text += `${t(lang, 'profile.balance', { balance: user.balance })}\n`;
    text += `${t(lang, 'profile.inventory_count', { inventoryCount: inv.length })}\n`;
    text += `${t(lang, 'profile.delivered_count', { deliveredCount: orders.filter((o) => o.status === 'delivered').length })}\n`;
    text += `${t(lang, 'profile.referrals_count', { referralCount: refStats.total })}\n`;
    text += `${t(lang, 'profile.verified_referrals', { verifiedCount: refStats.verified })}\n\n`;

    text += `${t(lang, 'profile.recent_tx')}\n`;
    if (recentTx.length === 0) {
      text += `<i>${t(lang, 'profile.no_tx')}</i>\n`;
    } else {
      for (const tx of recentTx) {
        const sign = tx.amount > 0 ? '+' : '';
        text += `• ${sign}${tx.amount} ⭐ | ${escapeHtml(tx.description || tx.type)} | ${tx.created_at.slice(0, 10)}\n`;
      }
    }

    text += `\n${t(lang, 'profile.balance_info_note')}`;

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...keyboards.profileMenu(lang)
    });
  });

  // 7. Deposit Flow (Telegram Stars)
  bot.action('deposit_start', async (ctx) => {
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    return ctx.editMessageText(t(lang, 'deposit.title'), {
      parse_mode: 'HTML',
      ...keyboards.depositAmounts(lang)
    });
  });

  bot.action(/^deposit_amt_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const amount = Number(ctx.match[1]);
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';

    try {
      const invoiceData = paymentService.createDepositInvoice(ctx.from.id, amount);
      return ctx.replyWithInvoice({
        title: t(lang, 'deposit.invoice_title'),
        description: t(lang, 'deposit.invoice_desc', { amount }),
        payload: invoiceData.payload,
        provider_token: '', // empty for Telegram Stars (XTR)
        currency: 'XTR',
        prices: [{ label: `${amount} Stars`, amount }]
      });
    } catch (err) {
      logger.error('Failed to create deposit invoice:', err.message);
      return ctx.reply(t(lang, 'errors.generic'));
    }
  });

  bot.action('deposit_amt_custom', async (ctx) => {
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    setUserState(ctx.from.id, 'WAITING_DEPOSIT_CUSTOM');
    return ctx.reply(t(lang, 'deposit.custom_prompt'), keyboards.backToMain(lang));
  });

  // 8. Gift Shop / Catalog
  bot.action(['menu_shop', 'menu_send_gift'], async (ctx) => {
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    const gifts = giftService.getCatalog(true);

    if (gifts.length === 0) {
      return ctx.editMessageText(t(lang, 'shop.empty'), keyboards.backToMain(lang));
    }

    return ctx.editMessageText(t(lang, 'shop.title'), {
      parse_mode: 'HTML',
      ...keyboards.catalogList(gifts, 1, 1, lang)
    });
  });

  bot.action(/^shop_item_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const catalogId = Number(ctx.match[1]);
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    const item = giftService.getCatalogItem(catalogId);

    if (!item) {
      return ctx.editMessageText(t(lang, 'shop.empty'), keyboards.backToMain(lang));
    }

    const name = lang === 'ru' ? item.name_ru : item.name_uz;
    const desc = lang === 'ru' ? item.description_ru : item.description_uz;

    const text = t(lang, 'shop.item_card', {
      emoji: item.emoji,
      name,
      price: item.stars_price,
      desc
    });

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...keyboards.giftDeliveryOptions(catalogId, lang)
    });
  });

  // Purchase: for self
  bot.action(/^buy_self_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const catalogId = Number(ctx.match[1]);
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    const item = giftService.getCatalogItem(catalogId);

    if (!item) return;

    if (user.balance < item.stars_price) {
      return ctx.reply(
        t(lang, 'shop.not_enough_balance', { price: item.stars_price, balance: user.balance }),
        keyboards.depositAmounts(lang)
      );
    }

    try {
      const result = await giftService.purchaseGift({
        senderId: user.id,
        catalogId,
        deliveryType: 'self',
        bot
      });

      if (result.status === 'delivered') {
        return ctx.reply(
          `${t(lang, 'shop.purchased_success', { orderId: result.orderId })}\n${t(lang, 'shop.delivered_success')}`,
          keyboards.mainMenu(lang)
        );
      } else {
        return ctx.reply(
          `${t(lang, 'shop.purchased_success', { orderId: result.orderId })}\n${t(lang, 'shop.delivery_failed')}`,
          keyboards.mainMenu(lang)
        );
      }
    } catch (err) {
      logger.error('Error purchasing gift for self:', err.message);
      return ctx.reply(`❌ ${err.message}`, keyboards.mainMenu(lang));
    }
  });

  // Purchase: for @username
  bot.action(/^buy_user_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const catalogId = Number(ctx.match[1]);
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';

    setUserState(ctx.from.id, 'WAITING_RECIPIENT_USERNAME', { catalogId });
    return ctx.reply(t(lang, 'send_flow.enter_username'), keyboards.backToMain(lang));
  });

  // Purchase: claim deep link
  bot.action(/^buy_link_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const catalogId = Number(ctx.match[1]);
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    const item = giftService.getCatalogItem(catalogId);

    if (user.balance < item.stars_price) {
      return ctx.reply(
        t(lang, 'shop.not_enough_balance', { price: item.stars_price, balance: user.balance }),
        keyboards.depositAmounts(lang)
      );
    }

    try {
      const result = await giftService.purchaseGift({
        senderId: user.id,
        catalogId,
        deliveryType: 'claim_link'
      });

      const me = await bot.telegram.getMe();
      const claimUrl = `https://t.me/${me.username}?start=claim_${result.rawToken}`;

      return ctx.reply(
        t(lang, 'send_flow.claim_link_created', {
          username: 'do\'stingiz / ваш друг',
          link: claimUrl
        }),
        { parse_mode: 'HTML', ...keyboards.mainMenu(lang) }
      );
    } catch (err) {
      logger.error('Error creating claim link:', err.message);
      return ctx.reply(`❌ ${err.message}`, keyboards.mainMenu(lang));
    }
  });

  // User inventory & orders history
  bot.action('user_inventory', async (ctx) => {
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    const inv = giftService.getUserInventory(ctx.from.id);

    if (inv.length === 0) {
      return ctx.editMessageText(t(lang, 'shop.inventory_empty'), keyboards.profileMenu(lang));
    }

    let text = `${t(lang, 'shop.inventory_title')}\n\n`;
    for (const item of inv) {
      const name = lang === 'ru' ? item.name_ru : item.name_uz;
      text += `• #${item.id} | ${item.emoji} <b>${name}</b> | ${item.created_at.slice(0, 10)}\n`;
    }

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...keyboards.profileMenu(lang)
    });
  });

  bot.action('user_orders', async (ctx) => {
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    const orders = giftService.getUserOrders(ctx.from.id, 10);

    if (orders.length === 0) {
      return ctx.editMessageText(t(lang, 'shop.order_history_empty'), keyboards.profileMenu(lang));
    }

    let text = `${t(lang, 'shop.order_history_title')}\n\n`;
    for (const o of orders) {
      const name = lang === 'ru' ? o.name_ru : o.name_uz;
      text += `• #${o.id} | ${o.emoji} ${name} | ${o.status} | ${o.created_at.slice(0, 10)}\n`;
    }

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...keyboards.profileMenu(lang)
    });
  });

  // 9. Daily Reward
  bot.action('menu_daily_reward', async (ctx) => {
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';

    const status = await rewardService.getDailyRewardStatus(ctx.from.id, bot);

    let text = `${t(lang, 'daily_reward.title')}\n\n`;
    text += t(lang, 'daily_reward.desc', {
      threshold: status.threshold,
      currentReferrals: status.currentReferrals
    });

    if (!status.canClaimByTime) {
      text += `\n\n${t(lang, 'daily_reward.already_claimed', { hours: status.hoursRemaining })}`;
    }

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...keyboards.dailyRewardMenu(status.eligible, lang)
    });
  });

  bot.action('claim_daily_reward', async (ctx) => {
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';

    try {
      const res = await rewardService.claimDailyReward(ctx.from.id, bot);
      if (res.ok) {
        return ctx.reply(
          t(lang, 'daily_reward.claimed_success', { amount: res.amount }),
          { parse_mode: 'HTML', ...keyboards.mainMenu(lang) }
        );
      } else {
        if (res.reason === 'cooldown') {
          return ctx.reply(t(lang, 'daily_reward.already_claimed', { hours: res.hoursRemaining }));
        } else if (res.reason === 'not_enough_referrals') {
          return ctx.reply(t(lang, 'daily_reward.not_eligible_referrals', { threshold: res.threshold, current: res.current }));
        } else if (res.reason === 'channels_missing') {
          return ctx.reply(t(lang, 'daily_reward.not_eligible_channels'), keyboards.sponsorChannelsList(res.missing, lang));
        }
      }
    } catch (err) {
      logger.error('Error claiming daily reward:', err.message);
      return ctx.reply(`❌ ${err.message}`, keyboards.mainMenu(lang));
    }
  });

  // 10. Mini-Games (Dice: Basketball, Football, Darts)
  bot.action('menu_games', async (ctx) => {
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    return ctx.editMessageText(t(lang, 'games.title'), {
      parse_mode: 'HTML',
      ...keyboards.gamesMenu(lang)
    });
  });

  bot.action(/^play_game_(basketball|football|darts)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const gameType = ctx.match[1];
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';

    const cfg = gameService.getGameConfig(gameType);
    if (!cfg.isEnabled) {
      return ctx.reply('⚠️ Ushbu o\'yin vaqtincha nofaol / Эта игра временно отключена.');
    }

    const todayCount = gameService.getTodayPlayCount(ctx.from.id);
    if (todayCount >= cfg.dailyLimit) {
      return ctx.reply(t(lang, 'games.daily_limit_reached', { limit: cfg.dailyLimit }));
    }

    // Emoji mapping
    const emojis = {
      basketball: '🏀',
      football: '⚽',
      darts: '🎯'
    };

    const diceMsg = await ctx.sendDice({ emoji: emojis[gameType] });
    const diceValue = diceMsg.dice.value;

    // Small delay to allow the Telegram dice animation to complete visually
    setTimeout(async () => {
      try {
        const result = gameService.recordGamePlay(ctx.from.id, gameType, diceValue);
        let msg = result.isGoal
          ? t(lang, 'games.result_goal', { points: result.points })
          : t(lang, 'games.result_miss');
        msg += `\n\n${t(lang, 'games.your_score', { score: result.totalScore })}`;

        await ctx.reply(msg, {
          parse_mode: 'HTML',
          ...keyboards.gameActionMenu(gameType, lang)
        });
      } catch (err) {
        logger.error('Error recording game result:', err.message);
      }
    }, 2000);
  });

  bot.action('game_leaderboard', async (ctx) => {
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    const leaders = gameService.getLeaderboard(10);

    let text = `${t(lang, 'games.leaderboard_title')}\n\n`;
    if (leaders.length === 0) {
      text += t(lang, 'games.empty_leaderboard');
    } else {
      let rank = 1;
      for (const l of leaders) {
        text += `${rank}. 👤 ${l.first_name || 'Foydalanuvchi'} (@${l.username || 'yo\'q'}) — <b>${l.total_score} ball</b> (${l.games_played} ta o'yin)\n`;
        rank++;
      }
    }

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...keyboards.gamesMenu(lang)
    });
  });

  // 11. Referral System
  bot.action('menu_referrals', async (ctx) => {
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    const stats = referralService.getReferralStats(ctx.from.id);

    const me = await bot.telegram.getMe();
    const refLink = `https://t.me/${me.username}?start=ref_${user.id}`;

    const text = t(lang, 'referrals.title', {
      link: refLink,
      total: stats.total,
      verified: stats.verified,
      pending: stats.pending,
      target: stats.target
    });

    const canRequest = stats.verified >= stats.target && !stats.hasPendingRequest;

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...keyboards.referralMenu(canRequest, stats.target, lang)
    });
  });

  bot.action('ref_request_reward', async (ctx) => {
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';

    try {
      const res = referralService.createRewardRequest(ctx.from.id);
      notificationService.notifyReferralRewardRequest(bot, {
        user_id: ctx.from.id,
        referral_count: res.target,
        reward_amount: res.amount
      }).catch(() => {});

      return ctx.reply(t(lang, 'referrals.request_sent'), keyboards.mainMenu(lang));
    } catch (err) {
      return ctx.reply(`⚠️ ${err.message}`, keyboards.mainMenu(lang));
    }
  });

  // 12. Sponsor Channel Subscription check
  bot.action('check_channels', async (ctx) => {
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';

    const check = await channelService.verifyUserSubscriptions(ctx.from.id, bot);

    if (check.allSubscribed) {
      referralService.markReferredVerified(ctx.from.id);
      return ctx.reply(t(lang, 'channels.all_subbed'), keyboards.mainMenu(lang));
    } else {
      let text = t(lang, 'channels.not_all_subbed');
      return ctx.reply(text, keyboards.sponsorChannelsList(check.missingChannels, lang));
    }
  });

  // 13. Advertising Orders
  bot.action('menu_ads', async (ctx) => {
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    const packages = advertisingService.getPackages(true);

    if (packages.length === 0) {
      return ctx.editMessageText(t(lang, 'ads.no_packages'), {
        parse_mode: 'HTML',
        ...keyboards.backToMain(lang)
      });
    }

    return ctx.editMessageText(t(lang, 'ads.title'), {
      parse_mode: 'HTML',
      ...keyboards.advertisingPackages(packages, lang)
    });
  });

  bot.action(/^ad_order_pkg_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const pkgId = Number(ctx.match[1]);
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    const pkg = advertisingService.getPackage(pkgId);

    if (!pkg) return;

    if (user.balance < pkg.price_stars) {
      return ctx.reply(
        t(lang, 'shop.not_enough_balance', { price: pkg.price_stars, balance: user.balance }),
        keyboards.depositAmounts(lang)
      );
    }

    setUserState(ctx.from.id, 'WAITING_AD_CONTENT', { pkgId });
    return ctx.reply(t(lang, 'ads.order_prompt'), keyboards.backToMain(lang));
  });

  bot.action('my_ad_orders', async (ctx) => {
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    const orders = advertisingService.getUserOrders(ctx.from.id);

    if (orders.length === 0) {
      return ctx.editMessageText('Hozircha reklama buyurtmalaringiz yo\'q.', keyboards.mainMenu(lang));
    }

    let text = `${t(lang, 'ads.order_status_title')}\n\n`;
    for (const o of orders) {
      const title = lang === 'ru' ? o.title_ru : o.title_uz;
      text += `• #${o.id} | 📦 ${title} | Holati: <b>${o.status}</b> | ${o.created_at.slice(0, 10)}\n`;
    }

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...keyboards.mainMenu(lang)
    });
  });

  // 14. Support Section
  bot.action('menu_support', async (ctx) => {
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';

    return ctx.editMessageText(
      t(lang, 'support.title', { supportUser: config.supportUsername }),
      {
        parse_mode: 'HTML',
        ...keyboards.supportMenu(lang)
      }
    );
  });

  bot.action('support_terms', async (ctx) => {
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    return ctx.editMessageText(t(lang, 'support.terms_text'), {
      parse_mode: 'HTML',
      ...keyboards.supportMenu(lang)
    });
  });

  bot.action('support_paysupport', async (ctx) => {
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    return ctx.editMessageText(
      t(lang, 'support.paysupport_text', { supportUser: config.supportUsername }),
      {
        parse_mode: 'HTML',
        ...keyboards.supportMenu(lang)
      }
    );
  });

  bot.action('support_send_msg', async (ctx) => {
    await ctx.answerCbQuery();
    const user = balanceService.getUser(ctx.from.id);
    const lang = user ? user.language : 'uz';
    setUserState(ctx.from.id, 'WAITING_SUPPORT_MSG');
    return ctx.reply(t(lang, 'support.prompt'), keyboards.backToMain(lang));
  });

  // 15. Telegram Payments: Pre-Checkout & Successful Payment
  bot.on('pre_checkout_query', async (ctx) => {
    try {
      const validation = paymentService.validatePreCheckout(ctx.preCheckoutQuery);
      if (validation.ok) {
        await ctx.answerPreCheckoutQuery(true);
      } else {
        logger.warn('Pre-checkout query rejected:', validation.error);
        await ctx.answerPreCheckoutQuery(false, validation.error);
      }
    } catch (err) {
      logger.error('Error during pre_checkout_query:', err.message);
      await ctx.answerPreCheckoutQuery(false, 'Payment verification failed');
    }
  });

  bot.on('successful_payment', async (ctx) => {
    try {
      const sp = ctx.message.successful_payment;
      const res = paymentService.processSuccessfulPayment({
        from: ctx.from,
        currency: sp.currency,
        total_amount: sp.total_amount,
        invoice_payload: sp.invoice_payload,
        telegram_payment_charge_id: sp.telegram_payment_charge_id,
        provider_payment_charge_id: sp.provider_payment_charge_id
      });

      const user = balanceService.getUser(ctx.from.id);
      const lang = user ? user.language : 'uz';

      if (!res.duplicate) {
        await ctx.reply(
          t(lang, 'deposit.success', {
            amount: res.amount,
            balance: res.newBalance
          }),
          { parse_mode: 'HTML', ...keyboards.mainMenu(lang) }
        );

        notificationService.notifyPaymentSuccess(bot, {
          user_id: ctx.from.id,
          amount_stars: res.amount,
          telegram_payment_charge_id: res.chargeId
        }, res.newBalance).catch(() => {});
      }
    } catch (err) {
      logger.error('Error processing successful_payment:', err.message);
      await ctx.reply(t('uz', 'errors.generic'));
    }
  });

  // 16. Admin callback delegation
  bot.action(/^adm_/, async (ctx) => {
    return adminHandlers.handleCallback(ctx);
  });

  // 17. In-flight text messages & photos
  bot.on('text', async (ctx) => {
    // Check if admin is currently in a step
    const handledByAdmin = await adminHandlers.handleTextMessage(ctx);
    if (handledByAdmin) return;

    const userId = ctx.from.id;
    const state = getUserState(userId);
    if (!state) return;

    const user = balanceService.getUser(userId);
    const lang = user ? user.language : 'uz';
    const text = ctx.message.text.trim();

    if (state.action === 'WAITING_DEPOSIT_CUSTOM') {
      const amount = parsePositiveInt(text, 1, 10000);
      if (!amount) {
        return ctx.reply(t(lang, 'deposit.invalid_amount'));
      }
      clearUserState(userId);
      try {
        const inv = paymentService.createDepositInvoice(userId, amount);
        return ctx.replyWithInvoice({
          title: t(lang, 'deposit.invoice_title'),
          description: t(lang, 'deposit.invoice_desc', { amount }),
          payload: inv.payload,
          provider_token: '',
          currency: 'XTR',
          prices: [{ label: `${amount} Stars`, amount }]
        });
      } catch (err) {
        return ctx.reply(`❌ ${err.message}`);
      }
    }

    if (state.action === 'WAITING_RECIPIENT_USERNAME') {
      const { catalogId } = state.data;
      const cleanUsername = normalizeUsername(text);
      if (!cleanUsername) {
        return ctx.reply('Noto\'g\'ri username formati. Masalan: @durov yoki durov:');
      }

      const item = giftService.getCatalogItem(catalogId);
      if (user.balance < item.stars_price) {
        clearUserState(userId);
        return ctx.reply(
          t(lang, 'shop.not_enough_balance', { price: item.stars_price, balance: user.balance }),
          keyboards.depositAmounts(lang)
        );
      }

      const recipient = balanceService.getUserByUsername(cleanUsername);

      if (recipient) {
        // Recipient is registered in bot!
        clearUserState(userId);
        try {
          const result = await giftService.purchaseGift({
            senderId: userId,
            catalogId,
            deliveryType: 'username',
            recipientId: recipient.id,
            recipientUsername: cleanUsername,
            bot
          });

          if (result.status === 'delivered') {
            return ctx.reply(
              `${t(lang, 'shop.purchased_success', { orderId: result.orderId })}\n${t(lang, 'shop.delivered_success')}`,
              keyboards.mainMenu(lang)
            );
          } else {
            return ctx.reply(
              `${t(lang, 'shop.purchased_success', { orderId: result.orderId })}\n${t(lang, 'shop.delivery_failed')}`,
              keyboards.mainMenu(lang)
            );
          }
        } catch (err) {
          return ctx.reply(`❌ ${err.message}`, keyboards.mainMenu(lang));
        }
      } else {
        // Recipient not in bot yet: create claim link
        clearUserState(userId);
        try {
          const result = await giftService.purchaseGift({
            senderId: userId,
            catalogId,
            deliveryType: 'claim_link',
            recipientUsername: cleanUsername
          });

          const me = await bot.telegram.getMe();
          const claimUrl = `https://t.me/${me.username}?start=claim_${result.rawToken}`;

          return ctx.reply(
            t(lang, 'send_flow.claim_link_created', {
              username: cleanUsername,
              link: claimUrl
            }),
            { parse_mode: 'HTML', ...keyboards.mainMenu(lang) }
          );
        } catch (err) {
          return ctx.reply(`❌ ${err.message}`, keyboards.mainMenu(lang));
        }
      }
    }

    if (state.action === 'WAITING_SUPPORT_MSG') {
      clearUserState(userId);
      const ticket = supportService.createTicket(userId, user.username, text);
      notificationService.notifyNewSupportTicket(bot, ticket).catch(() => {});
      return ctx.reply(
        t(lang, 'support.sent_success', { ticketId: ticket.ticketId }),
        keyboards.mainMenu(lang)
      );
    }

    if (state.action === 'WAITING_AD_CONTENT') {
      const { pkgId } = state.data;
      clearUserState(userId);
      try {
        const order = advertisingService.createOrder({
          userId,
          packageId: pkgId,
          contentText: text
        });

        notificationService.notifyNewAdOrder(bot, order).catch(() => {});
        return ctx.reply(
          t(lang, 'ads.order_created', { orderId: order.orderId }),
          keyboards.mainMenu(lang)
        );
      } catch (err) {
        return ctx.reply(`❌ ${err.message}`, keyboards.mainMenu(lang));
      }
    }
  });

  bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const state = getUserState(userId);
    if (!state || state.action !== 'WAITING_AD_CONTENT') return;

    const user = balanceService.getUser(userId);
    const lang = user ? user.language : 'uz';
    const { pkgId } = state.data;

    clearUserState(userId);
    const photoArray = ctx.message.photo;
    const bestPhoto = photoArray[photoArray.length - 1];
    const caption = ctx.message.caption || 'Reklama posti';

    try {
      const order = advertisingService.createOrder({
        userId,
        packageId: pkgId,
        contentText: caption,
        mediaFileId: bestPhoto.file_id,
        mediaType: 'photo'
      });

      notificationService.notifyNewAdOrder(bot, order).catch(() => {});
      return ctx.reply(
        t(lang, 'ads.order_created', { orderId: order.orderId }),
        keyboards.mainMenu(lang)
      );
    } catch (err) {
      return ctx.reply(`❌ ${err.message}`, keyboards.mainMenu(lang));
    }
  });
}

module.exports = {
  registerHandlers
};
