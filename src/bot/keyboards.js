const { Markup } = require('telegraf');
const { t } = require('../utils/i18n');
const { createStyledButton, PREMIUM_EMOJI_IDS } = require('../utils/premiumEmoji');

const keyboards = {
  languageSelection() {
    return Markup.inlineKeyboard([
      [
        createStyledButton('🇺🇿 O\'zbekcha', 'set_lang_uz', { style: 'primary', emojiKey: 'STAR' }),
        createStyledButton('🇷🇺 Русский', 'set_lang_ru', { style: 'primary', emojiKey: 'STAR' })
      ]
    ]);
  },

  mainMenu(lang = 'uz') {
    return Markup.inlineKeyboard([
      [
        createStyledButton(t(lang, 'buttons.gift_shop'), 'menu_shop', { style: 'primary', emojiKey: 'GIFT' }),
        createStyledButton(t(lang, 'buttons.send_gift'), 'menu_send_gift', { style: 'success', emojiKey: 'ROCKET' })
      ],
      [
        createStyledButton(t(lang, 'buttons.daily_reward'), 'menu_daily_reward', { style: 'success', emojiKey: 'STAR' }),
        createStyledButton(t(lang, 'buttons.mini_games'), 'menu_games', { style: 'primary', emojiKey: 'GAME' })
      ],
      [
        createStyledButton(t(lang, 'buttons.my_profile'), 'menu_profile', { style: 'primary', emojiKey: 'PROFILE' }),
        createStyledButton(t(lang, 'buttons.referrals'), 'menu_referrals', { style: 'primary', emojiKey: 'USERS' })
      ],
      [
        createStyledButton(t(lang, 'buttons.advertising'), 'menu_ads', { style: 'primary', emojiKey: 'ADS' }),
        createStyledButton(t(lang, 'buttons.support'), 'menu_support', { style: 'primary', emojiKey: 'SUPPORT' })
      ]
    ]);
  },

  backToMain(lang = 'uz') {
    return Markup.inlineKeyboard([
      [createStyledButton(t(lang, 'buttons.main_menu'), 'menu_main', { style: 'danger', emojiKey: 'BACK' })]
    ]);
  },

  profileMenu(lang = 'uz') {
    return Markup.inlineKeyboard([
      [createStyledButton(t(lang, 'buttons.deposit'), 'deposit_start', { style: 'success', emojiKey: 'STAR' })],
      [
        createStyledButton(t(lang, 'buttons.my_inventory'), 'user_inventory', { style: 'primary', emojiKey: 'GIFT' }),
        createStyledButton(t(lang, 'buttons.order_history'), 'user_orders', { style: 'primary', emojiKey: 'DOC' })
      ],
      [createStyledButton(t(lang, 'buttons.change_lang'), 'change_language', { style: 'primary', emojiKey: 'SETTINGS' })],
      [createStyledButton(t(lang, 'buttons.main_menu'), 'menu_main', { style: 'danger', emojiKey: 'BACK' })]
    ]);
  },

  depositAmounts(lang = 'uz') {
    return Markup.inlineKeyboard([
      [
        createStyledButton('15 ⭐', 'deposit_amt_15', { style: 'success', emojiKey: 'STAR' }),
        createStyledButton('25 ⭐', 'deposit_amt_25', { style: 'success', emojiKey: 'STAR' }),
        createStyledButton('50 ⭐', 'deposit_amt_50', { style: 'success', emojiKey: 'STAR' })
      ],
      [
        createStyledButton('100 ⭐', 'deposit_amt_100', { style: 'success', emojiKey: 'STAR' }),
        createStyledButton('250 ⭐', 'deposit_amt_250', { style: 'success', emojiKey: 'STAR' }),
        createStyledButton('500 ⭐', 'deposit_amt_500', { style: 'success', emojiKey: 'STAR' })
      ],
      [createStyledButton('✍️ Boshqa summa / Другая сумма', 'deposit_amt_custom', { style: 'primary', emojiKey: 'COIN' })],
      [createStyledButton(t(lang, 'buttons.back'), 'menu_profile', { style: 'danger', emojiKey: 'BACK' })]
    ]);
  },

  catalogList(gifts, page = 1, totalPages = 1, lang = 'uz') {
    const rows = [];
    for (const g of gifts) {
      const name = lang === 'ru' ? g.name_ru : g.name_uz;
      rows.push([
        createStyledButton(
          `${g.emoji} ${name} — ${g.stars_price} ⭐`,
          `shop_item_${g.id}`,
          { style: 'primary', emojiKey: 'GIFT' }
        )
      ]);
    }

    const navRow = [];
    if (page > 1) {
      navRow.push(createStyledButton(t(lang, 'buttons.prev_page'), `shop_page_${page - 1}`, { style: 'primary' }));
    }
    if (page < totalPages) {
      navRow.push(createStyledButton(t(lang, 'buttons.next_page'), `shop_page_${page + 1}`, { style: 'primary' }));
    }
    if (navRow.length > 0) {
      rows.push(navRow);
    }

    rows.push([
      createStyledButton(t(lang, 'buttons.my_inventory'), 'user_inventory', { style: 'success', emojiKey: 'GIFT' }),
      createStyledButton(t(lang, 'buttons.main_menu'), 'menu_main', { style: 'danger', emojiKey: 'BACK' })
    ]);

    return Markup.inlineKeyboard(rows);
  },

  giftDeliveryOptions(catalogId, lang = 'uz') {
    return Markup.inlineKeyboard([
      [createStyledButton(t(lang, 'buttons.send_self'), `buy_self_${catalogId}`, { style: 'success', emojiKey: 'GIFT' })],
      [createStyledButton(t(lang, 'buttons.send_username'), `buy_user_${catalogId}`, { style: 'primary', emojiKey: 'PROFILE' })],
      [createStyledButton(t(lang, 'buttons.send_claim_link'), `buy_link_${catalogId}`, { style: 'primary', emojiKey: 'ROCKET' })],
      [createStyledButton(t(lang, 'buttons.back'), 'menu_shop', { style: 'danger', emojiKey: 'BACK' })]
    ]);
  },

  confirmAction(confirmCallback, cancelCallback, lang = 'uz') {
    return Markup.inlineKeyboard([
      [
        createStyledButton(t(lang, 'buttons.confirm'), confirmCallback, { style: 'success', emojiKey: 'CHECK' }),
        createStyledButton(t(lang, 'buttons.cancel'), cancelCallback, { style: 'danger', emojiKey: 'CROSS' })
      ]
    ]);
  },

  dailyRewardMenu(canClaim, lang = 'uz') {
    const rows = [];
    if (canClaim) {
      rows.push([createStyledButton(t(lang, 'buttons.claim_reward'), 'claim_daily_reward', { style: 'success', emojiKey: 'STAR' })]);
    }
    rows.push([createStyledButton(t(lang, 'buttons.check_subs'), 'check_channels', { style: 'primary', emojiKey: 'CHECK' })]);
    rows.push([createStyledButton(t(lang, 'buttons.main_menu'), 'menu_main', { style: 'danger', emojiKey: 'BACK' })]);
    return Markup.inlineKeyboard(rows);
  },

  gamesMenu(lang = 'uz') {
    return Markup.inlineKeyboard([
      [
        createStyledButton(t(lang, 'games.basketball'), 'play_game_basketball', { style: 'primary', emojiKey: 'BASKETBALL' }),
        createStyledButton(t(lang, 'games.football'), 'play_game_football', { style: 'primary', emojiKey: 'FOOTBALL' })
      ],
      [
        createStyledButton(t(lang, 'games.darts'), 'play_game_darts', { style: 'primary', emojiKey: 'DARTS' }),
        createStyledButton('🏆 Leaderboard', 'game_leaderboard', { style: 'primary', emojiKey: 'TROPHY' })
      ],
      [createStyledButton(t(lang, 'buttons.main_menu'), 'menu_main', { style: 'danger', emojiKey: 'BACK' })]
    ]);
  },

  gameActionMenu(gameType, lang = 'uz') {
    return Markup.inlineKeyboard([
      [createStyledButton(t(lang, 'buttons.play_again'), `play_game_${gameType}`, { style: 'success', emojiKey: 'GAME' })],
      [createStyledButton(t(lang, 'buttons.back'), 'menu_games', { style: 'danger', emojiKey: 'BACK' })]
    ]);
  },

  referralMenu(canRequest, target, lang = 'uz') {
    const rows = [];
    if (canRequest) {
      rows.push([createStyledButton(t(lang, 'referrals.request_reward_btn', { target }), 'ref_request_reward', { style: 'success', emojiKey: 'GIFT' })]);
    }
    rows.push([
      createStyledButton(t(lang, 'buttons.check_subs'), 'check_channels', { style: 'primary', emojiKey: 'CHECK' }),
      createStyledButton(t(lang, 'buttons.main_menu'), 'menu_main', { style: 'danger', emojiKey: 'BACK' })
    ]);
    return Markup.inlineKeyboard(rows);
  },

  sponsorChannelsList(channels, lang = 'uz') {
    const rows = [];
    for (const ch of channels) {
      rows.push([
        createStyledButton(`📢 ${ch.title}`, null, { url: ch.invite_url, style: 'primary', emojiKey: 'BELL' })
      ]);
    }
    rows.push([createStyledButton(t(lang, 'buttons.check_subs'), 'check_channels', { style: 'success', emojiKey: 'CHECK' })]);
    rows.push([createStyledButton(t(lang, 'buttons.main_menu'), 'menu_main', { style: 'danger', emojiKey: 'BACK' })]);
    return Markup.inlineKeyboard(rows);
  },

  advertisingPackages(packages, lang = 'uz') {
    const rows = [];
    for (const p of packages) {
      const title = lang === 'ru' ? p.title_ru : p.title_uz;
      rows.push([
        createStyledButton(`📦 ${title} (${p.price_stars} ⭐)`, `ad_order_pkg_${p.id}`, { style: 'primary', emojiKey: 'ADS' })
      ]);
    }
    rows.push([createStyledButton('📜 Mening buyurtmalarim / Мои заказы', 'my_ad_orders', { style: 'primary', emojiKey: 'DOC' })]);
    rows.push([createStyledButton(t(lang, 'buttons.main_menu'), 'menu_main', { style: 'danger', emojiKey: 'BACK' })]);
    return Markup.inlineKeyboard(rows);
  },

  supportMenu(lang = 'uz') {
    return Markup.inlineKeyboard([
      [createStyledButton('✍️ Xabar yuborish / Написать', 'support_send_msg', { style: 'success', emojiKey: 'SUPPORT' })],
      [
        createStyledButton('📜 Shartlar (/terms)', 'support_terms', { style: 'primary', emojiKey: 'DOC' }),
        createStyledButton('💳 To\'lov (/paysupport)', 'support_paysupport', { style: 'primary', emojiKey: 'COIN' })
      ],
      [createStyledButton(t(lang, 'buttons.main_menu'), 'menu_main', { style: 'danger', emojiKey: 'BACK' })]
    ]);
  },

  adminMainMenu(role = 'owner', lang = 'uz') {
    return Markup.inlineKeyboard([
      [
        createStyledButton(t(lang, 'admin.btn_dashboard'), 'adm_dash', { style: 'primary', emojiKey: 'TROPHY' }),
        createStyledButton(t(lang, 'admin.btn_users'), 'adm_users', { style: 'primary', emojiKey: 'USERS' })
      ],
      [
        createStyledButton(t(lang, 'admin.btn_balance_adj'), 'adm_balance_adj', { style: 'success', emojiKey: 'MONEY' }),
        createStyledButton(t(lang, 'admin.btn_payments'), 'adm_payments', { style: 'primary', emojiKey: 'COIN' })
      ],
      [
        createStyledButton(t(lang, 'admin.btn_catalog'), 'adm_catalog', { style: 'primary', emojiKey: 'GIFT' }),
        createStyledButton(t(lang, 'admin.btn_orders'), 'adm_orders', { style: 'primary', emojiKey: 'DOC' })
      ],
      [
        createStyledButton(t(lang, 'admin.btn_pending_deliveries'), 'adm_pending_deliveries', { style: 'danger', emojiKey: 'FIRE' }),
        createStyledButton(t(lang, 'admin.btn_referrals'), 'adm_referrals', { style: 'primary', emojiKey: 'USERS' })
      ],
      [
        createStyledButton(t(lang, 'admin.btn_channels'), 'adm_channels', { style: 'primary', emojiKey: 'BELL' }),
        createStyledButton(t(lang, 'admin.btn_daily_rewards'), 'adm_rewards', { style: 'primary', emojiKey: 'STAR' })
      ],
      [
        createStyledButton(t(lang, 'admin.btn_games'), 'adm_games', { style: 'primary', emojiKey: 'GAME' }),
        createStyledButton(t(lang, 'admin.btn_ads'), 'adm_ads', { style: 'primary', emojiKey: 'ADS' })
      ],
      [
        createStyledButton(t(lang, 'admin.btn_tickets'), 'adm_tickets', { style: 'primary', emojiKey: 'SUPPORT' }),
        createStyledButton(t(lang, 'admin.btn_broadcast'), 'adm_broadcast', { style: 'primary', emojiKey: 'ROCKET' })
      ],
      [
        createStyledButton(t(lang, 'admin.btn_admins'), 'adm_admins', { style: 'primary', emojiKey: 'SHIELD' }),
        createStyledButton(t(lang, 'admin.btn_settings'), 'adm_settings', { style: 'primary', emojiKey: 'SETTINGS' })
      ],
      [
        createStyledButton(t(lang, 'admin.btn_audit'), 'adm_audit', { style: 'primary', emojiKey: 'DOC' }),
        createStyledButton('❌ Yopish / Закрыть', 'adm_close', { style: 'danger', emojiKey: 'CROSS' })
      ]
    ]);
  },

  adminBack(target = 'adm_main', lang = 'uz') {
    return Markup.inlineKeyboard([
      [createStyledButton(t(lang, 'buttons.back'), target, { style: 'danger', emojiKey: 'BACK' })]
    ]);
  }
};

module.exports = keyboards;
