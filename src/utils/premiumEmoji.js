// Telegram Premium Custom Emoji Document IDs & Telegram Bot API 9.4 button styling

const PREMIUM_EMOJI_IDS = {
  GIFT: '5368324170671202286',
  STAR: '5438623053702308307',
  ROCKET: '5404674261681232568',
  FIRE: '5404674261681232568',
  GAME: '5373141891321703379',
  BASKETBALL: '5373141891321703379',
  FOOTBALL: '5373141891321703379',
  DARTS: '5373141891321703379',
  TROPHY: '5373141891321703379',
  PROFILE: '5382218084478107936',
  COIN: '5382218084478107936',
  MONEY: '5382218084478107936',
  USERS: '5382218084478107936',
  ADS: '5404674261681232568',
  SUPPORT: '5368324170671202286',
  CHECK: '5368324170671202286',
  CROSS: '5465376512348576432',
  HEART: '5463024844330278701',
  DIAMOND: '5449764516315891782',
  CROWN: '5449764516315891782',
  CAKE: '5368324170671202286',
  BEAR: '5368324170671202286',
  SHIELD: '5449764516315891782',
  SETTINGS: '5382218084478107936',
  DOC: '5368324170671202286',
  BACK: '5465376512348576432',
  BELL: '5404674261681232568'
};

/**
 * Returns an HTML tg-emoji tag with the official Telegram custom emoji ID.
 * If client doesn't support custom emoji, it gracefully shows the fallback character.
 */
function pEmoji(key, fallback = '✨') {
  const emojiId = PREMIUM_EMOJI_IDS[key] || PREMIUM_EMOJI_IDS.STAR;
  return `<tg-emoji emoji-id="${emojiId}">${fallback}</tg-emoji>`;
}

/**
 * Creates an InlineKeyboardButton with Telegram Bot API 9.4 styling.
 * @param {string} text Button title
 * @param {string|null} callback_data Callback query data
 * @param {object} options
 * @param {'primary'|'success'|'danger'} [options.style] Telegram 9.4 button color
 * @param {string} [options.emojiKey] Key from PREMIUM_EMOJI_IDS to display as icon_custom_emoji_id
 * @param {string} [options.url] URL if link button
 */
function createStyledButton(text, callback_data = null, options = {}) {
  const btn = { text };

  if (options.url) {
    btn.url = options.url;
  } else if (callback_data) {
    btn.callback_data = callback_data;
  }

  // Telegram Bot API 9.4 button background color:
  // 'primary' (blue), 'success' (green), 'danger' (red)
  if (options.style && ['primary', 'success', 'danger'].includes(options.style)) {
    btn.style = options.style;
  }

  // Telegram Bot API 9.4 custom emoji icon
  if (options.emojiKey && PREMIUM_EMOJI_IDS[options.emojiKey]) {
    btn.icon_custom_emoji_id = PREMIUM_EMOJI_IDS[options.emojiKey];
  } else if (options.customEmojiId) {
    btn.icon_custom_emoji_id = options.customEmojiId;
  }

  return btn;
}

module.exports = {
  PREMIUM_EMOJI_IDS,
  pEmoji,
  createStyledButton
};
