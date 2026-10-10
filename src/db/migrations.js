const config = require('../config');
const logger = require('../utils/logger');

function runMigrations(db) {
  logger.info('Running database migrations and table verification...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      language TEXT NOT NULL DEFAULT 'uz',
      balance INTEGER NOT NULL DEFAULT 0,
      referrer_id INTEGER,
      is_blocked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_referrer ON users(referrer_id);

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY,
      username TEXT,
      role TEXT NOT NULL DEFAULT 'moderator',
      added_by INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS balance_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      type TEXT NOT NULL,
      reference_id TEXT,
      description TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_bt_user ON balance_transactions(user_id);

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount_stars INTEGER NOT NULL,
      invoice_payload TEXT UNIQUE NOT NULL,
      telegram_payment_charge_id TEXT UNIQUE,
      provider_payment_charge_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
    CREATE INDEX IF NOT EXISTS idx_payments_payload ON payments(invoice_payload);

    CREATE TABLE IF NOT EXISTS gift_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gift_id TEXT UNIQUE NOT NULL,
      name_uz TEXT NOT NULL,
      name_ru TEXT NOT NULL,
      description_uz TEXT,
      description_ru TEXT,
      stars_price INTEGER NOT NULL,
      emoji TEXT NOT NULL DEFAULT '🎁',
      is_available INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gift_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      recipient_id INTEGER,
      recipient_username TEXT,
      catalog_id INTEGER NOT NULL,
      stars_cost INTEGER NOT NULL,
      delivery_type TEXT NOT NULL DEFAULT 'self',
      status TEXT NOT NULL DEFAULT 'inventory',
      telegram_gift_id TEXT,
      delivery_error TEXT,
      created_at TEXT NOT NULL,
      delivered_at TEXT,
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (catalog_id) REFERENCES gift_catalog(id)
    );

    CREATE INDEX IF NOT EXISTS idx_orders_sender ON gift_orders(sender_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON gift_orders(status);

    CREATE TABLE IF NOT EXISTS gift_claim_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      token_raw TEXT,
      target_username TEXT,
      is_claimed INTEGER NOT NULL DEFAULT 0,
      claimed_by INTEGER,
      claimed_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES gift_orders(id)
    );

    CREATE INDEX IF NOT EXISTS idx_claim_token_hash ON gift_claim_tokens(token_hash);

    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER NOT NULL,
      referred_id INTEGER UNIQUE NOT NULL,
      channel_verified INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      verified_at TEXT,
      FOREIGN KEY (referrer_id) REFERENCES users(id),
      FOREIGN KEY (referred_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);

    CREATE TABLE IF NOT EXISTS sponsor_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT NOT NULL,
      title TEXT NOT NULL,
      invite_url TEXT NOT NULL,
      is_required INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS referral_reward_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      referral_count INTEGER NOT NULL,
      reward_type TEXT NOT NULL DEFAULT 'stars',
      reward_amount INTEGER NOT NULL DEFAULT 0,
      gift_catalog_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by INTEGER,
      review_comment TEXT,
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_ref_req_user ON referral_reward_requests(user_id);
    CREATE INDEX IF NOT EXISTS idx_ref_req_status ON referral_reward_requests(status);

    CREATE TABLE IF NOT EXISTS daily_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      reward_type TEXT NOT NULL DEFAULT 'stars',
      reward_amount INTEGER NOT NULL,
      claimed_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_daily_user ON daily_rewards(user_id);

    CREATE TABLE IF NOT EXISTS game_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      game_type TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      dice_value INTEGER NOT NULL,
      played_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_games_user ON game_scores(user_id);
    CREATE INDEX IF NOT EXISTS idx_games_type ON game_scores(game_type);

    CREATE TABLE IF NOT EXISTS advertising_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_uz TEXT NOT NULL,
      title_ru TEXT NOT NULL,
      description_uz TEXT,
      description_ru TEXT,
      price_stars INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS advertising_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      package_id INTEGER NOT NULL,
      content_text TEXT NOT NULL,
      media_file_id TEXT,
      media_type TEXT,
      price_stars INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (package_id) REFERENCES advertising_packages(id)
    );

    CREATE INDEX IF NOT EXISTS idx_ads_user ON advertising_orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_ads_status ON advertising_orders(status);

    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT,
      message TEXT NOT NULL,
      reply TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      assigned_to INTEGER,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_user ON support_tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);

    CREATE TABLE IF NOT EXISTS bot_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details TEXT,
      ip_or_source TEXT NOT NULL DEFAULT 'telegram',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_admin ON audit_logs(admin_id);
  `);

  // Seed default settings
  const defaultSettings = [
    ['daily_reward_threshold', '2'],
    ['daily_reward_amount', '5'],
    ['daily_reward_cooldown_hours', '24'],
    ['daily_reward_enabled', '1'],
    ['referral_target', '5'],
    ['referral_reward_amount', '25'],
    ['game_basketball_enabled', '1'],
    ['game_football_enabled', '1'],
    ['game_darts_enabled', '1'],
    ['game_daily_limit', '10'],
    ['notify_new_user', '1'],
    ['notify_payments', '1'],
    ['notify_orders', '1'],
    ['notify_support', '1']
  ];

  for (const [key, val] of defaultSettings) {
    db.run(
      `INSERT OR IGNORE INTO bot_settings (key, value) VALUES (?, ?)`,
      [key, val]
    );
  }

  // Seed default catalog if empty
  const catalogCount = db.get(`SELECT COUNT(*) as count FROM gift_catalog`);
  if (catalogCount && catalogCount.count === 0) {
    const now = new Date().toISOString();
    const defaultGifts = [
      ['cake_01', 'Mazali Tort', 'Вкусный Торт', 'Shirin bayram torti', 'Праздничный сладкий торт', 15, '🎂', 1, now, now],
      ['star_01', 'Yashil Yulduzcha', 'Зеленая Звезда', 'Yorqin yashil sovg\'a yulduzi', 'Яркая зеленая подарочная звезда', 25, '⭐', 1, now, now],
      ['rose_01', 'Qizil Atirgul', 'Красная Роза', 'Chiroyli gullar guldastasi', 'Красивый букет цветов', 50, '🌹', 1, now, now],
      ['bear_01', 'Ayiqcha', 'Милый Мишка', 'Yumshoq bayram ayiqchasi', 'Мягкий праздничный мишка', 100, '🧸', 1, now, now],
      ['crown_01', 'Oltin Toj', 'Золотая Корона', 'Haqiqiy qirollik toji', 'Настоящая королевская корона', 250, '👑', 1, now, now]
    ];
    for (const g of defaultGifts) {
      db.run(
        `INSERT INTO gift_catalog (gift_id, name_uz, name_ru, description_uz, description_ru, stars_price, emoji, is_available, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        g
      );
    }
    logger.info('Seeded default gift catalog entries.');
  }

  // Seed default advertising packages if empty
  const adCount = db.get(`SELECT COUNT(*) as count FROM advertising_packages`);
  if (adCount && adCount.count === 0) {
    const now = new Date().toISOString();
    const defaultAds = [
      ['Standart Post (1x)', 'Стандартный Пост (1x)', 'Bot auditoriyasiga 1 marta reklama xabari', '1 рекламная рассылка аудитории бота', 50, 1, now],
      ['Premium Post (3x)', 'Премиум Пост (3x)', '3 kun ketma-ket 1 martadan xabar yuborish', '3 рассылки в течение 3 дней', 120, 1, now],
      ['To\'liq Paket (Haftalik)', 'Полный Пакет (Недельный)', 'Hafta davomida doimiy e\'lon va postlar', 'Закрепленный пост и недельное продвижение', 250, 1, now]
    ];
    for (const ad of defaultAds) {
      db.run(
        `INSERT INTO advertising_packages (title_uz, title_ru, description_uz, description_ru, price_stars, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ad
      );
    }
    logger.info('Seeded default advertising packages.');
  }

  // Seed owner admins from config
  const now = new Date().toISOString();
  for (const adminId of config.adminIds) {
    db.run(
      `INSERT OR IGNORE INTO admins (id, username, role, added_by, created_at)
       VALUES (?, ?, 'owner', ?, ?)`,
      [adminId, 'owner', 0, now]
    );
  }

  logger.info('Database migrations completed successfully.');
}

module.exports = {
  runMigrations
};
