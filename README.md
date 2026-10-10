# Telegram Gifts Bot (Production Backend)

A production-ready Telegram Bot built with **Node.js LTS (CommonJS)**, **Telegraf**, and **SQLite**. The bot features official Telegram Stars (`XTR`) digital payments, official Telegram Gifts catalog and delivery, P2P gift transfers via verified usernames and secure deep-link tokens, daily rewards, dice-based mini-games (basketball, football, darts), referral campaign tracking, sponsor-channel membership verification, advertising package orders, support ticketing, and a complete in-Telegram administrative control panel with Role-Based Access Control (RBAC).

---

## 1. System Requirements

- **Node.js**: LTS version 20.x or 22.x+
- **NPM**: v9.x or later
- **Operating System**: Linux, macOS, or Windows
- **Process Manager**: PM2 (recommended for production)

---

## 2. Quick Installation

```bash
# 1. Clone repository or navigate to directory
cd telegram-gifts-bot

# 2. Install dependencies
npm install

# 3. Create your .env file from template
cp .env.example .env
```

---

## 3. Configuration (`.env`)

Edit `.env` with your values:

```ini
# Bot Token from @BotFather
BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ

# Comma-separated numeric Telegram User IDs of initial Owners
ADMIN_IDS=123456789,987654321

# SQLite database file path
DATABASE_PATH=./data/bot.sqlite

# Support administrator username (without @)
SUPPORT_USERNAME=your_support_username

# Logging level: debug, info, warn, error
LOG_LEVEL=info

# Health-check / Monitoring port (default 3000)
PORT=3000
```

> **Security Note:** Never commit your `.env` file or bot tokens to version control. Initial admin authorization is strictly verified against numeric Telegram user IDs, not easily spoofable usernames.

---

## 4. Telegram Bot & BotFather Setup

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot`, choose a display name and username ending in `bot`.
3. Copy the HTTP API token into `BOT_TOKEN` in `.env`.
4. Enable payments for Telegram Stars:
   - In @BotFather, send `/mybots` -> select your bot -> **Bot Settings** -> **Payments**.
   - Telegram Stars payments use currency `XTR` with an empty provider token.
5. Set bot commands in @BotFather:
   ```text
   start - Asosiy menyuni ochish / Главное меню
   admin - Admin boshqaruv paneli / Панель администратора
   terms - Foydalanish shartlari / Условия использования
   paysupport - To'lovlar bo'yicha yordam / Помощь по платежам
   ```

---

## 5. Running the Bot

### Development / Local Execution

```bash
# Run directly
node index.js

# Or via npm script
npm start
```

### Production Execution with PM2

```bash
# Start with PM2
pm2 start ecosystem.config.cjs

# Check status
pm2 status

# View live logs
pm2 logs telegram-gifts-bot

# Restart bot after updates
pm2 restart telegram-gifts-bot

# Stop bot
pm2 stop telegram-gifts-bot
```

---

## 6. Architecture & Core Features

### 1. Two-Language Localization (Uzbek & Russian) with Telegram Premium Emojis
- Language selection prompt on first `/start`.
- Full localization for all menus, buttons, invoices, notifications, and admin panels stored in `locales/uz.json` and `locales/ru.json`.
- Uses official Telegram Premium custom animated emojis via `<tg-emoji emoji-id="...">` HTML tags with graceful Unicode fallbacks.
- Users can switch their language at any time in the Profile menu.

### 2. Telegram Bot API 9.4 Button Styling & Custom Emoji Icons
- Built according to the official **Telegram Bot API 9.4** specification:
  - Button colors via `style`:
    - `"primary"`: Telegram Blue (main menu actions, store items, profile)
    - `"success"`: Telegram Green (confirmations, deposit, reward claims, channel verification)
    - `"danger"`: Telegram Red (cancellations, back navigation, rejections, close)
  - Custom Emoji icons on buttons via `icon_custom_emoji_id`: Displays animated/custom emojis right on the buttons before text.
- Fallback-safe: Older clients automatically render standard button styling with Unicode emojis.

### 2. Telegram Stars Payments (`XTR`)
- Uses `sendInvoice`, `pre_checkout_query`, and `successful_payment`.
- **Atomic Balance Updates:** Uses SQLite transactions to ensure balances are never updated concurrently or improperly.
- **Idempotency Protection:** Detects duplicate `telegram_payment_charge_id` values and duplicate callbacks to prevent double-crediting.
- Ledger tracking in `payments` and `balance_transactions`.

### 3. Gift Catalog & Delivery
- Fixed-price catalog items (15, 25, 50, 100, 250 Stars) with emoji and descriptions.
- Official Bot API integration with `getAvailableGifts` and `sendGift`.
- Purchase destinations:
  - **Self:** Direct delivery to the buyer.
  - **Known Username:** Direct delivery to the registered recipient's Telegram user ID.
  - **Unknown Recipient / Claim Link:** Creates a cryptographically random token (`crypto.randomBytes(24)`). Generates `https://t.me/<bot_username>?start=claim_<token>`. The recipient starts the bot and claims the gift. Single-use, time-limited, and tamper-resistant.
  - **Failure Handling:** If Telegram returns an error (e.g. user blocked bot or disabled gifts), the order is preserved in the bot's inventory with status `inventory`/`failed` and an admin retry option.

### 4. Daily Rewards
- Deterministic reward (configured Stars quantity).
- Requires satisfying the configured verified referral count and sponsor-channel subscriptions.
- 24-hour cooldown enforcement.

### 5. Mini-Games
- Basketball (🏀), Football (⚽), and Darts (🎯) using Telegram's native `sendDice`.
- Outcome calculated strictly from the authentic `dice.value` returned by Telegram:
  - Basketball: values 4 & 5 count as baskets.
  - Football: values 3, 4, 5 count as goals.
  - Darts: value 6 counts as bullseye.
- Daily play limit enforcement and leaderboard. Games are 100% free with non-transferable entertainment points.

### 6. Referral System & Sponsor Channels
- Unique invite link: `https://t.me/<bot_username>?start=ref_<userId>`.
- Self-referrals and duplicate accounts are rejected.
- Membership verification checks using `getChatMember`.
- Referral milestone reward request queue for administrative approval.

### 7. Advertising Orders & Support
- Multi-tier advertising packages.
- Users can submit ad text or photos.
- Admin approval, publishing, and rejection workflows.
- In-bot support ticketing system with direct admin reply capabilities.

### 8. Full In-Telegram Admin Panel (`/admin`)
- Accessible via `/admin` for authorized IDs.
- Role-Based Access Control (RBAC):
  - `owner`: Full system access, admin management, settings, audit log.
  - `finance`: Balance adjustments, payment ledgers, order history.
  - `moderator`: Gift catalog, sponsor channels, referrals, mini-games, ads.
  - `support`: Support tickets, user lookup.
- Every callback verifies permissions dynamically.
- Sensitive adjustments generate auditable entries in `audit_logs`.

---

## 7. Running the Automated Tests

The test suite validates balance atomicity, payment idempotency, referral uniqueness, gift claim token security, and admin authorization:

```bash
npm test
```

### Tested Test Suites:
1. `tests/balance.test.js`: User creation, credit/debit adjustments, overdraft prevention, integer enforcement.
2. `tests/payments.test.js`: Invoice generation, pre-checkout query validation, payment completion, idempotency protection against duplicate charge IDs.
3. `tests/gifts.test.js`: Catalog queries, purchases, claim link cryptographic tokens, recipient username verification, single-claim enforcement, and failed delivery inventory retention.
4. `tests/referrals.test.js`: Unique referral tracking, self-referral prevention, sponsor-channel verification status, reward request creation, and admin approval ledgering.
5. `tests/admin.test.js`: RBAC enforcement across Owner, Finance, Moderator, and Support roles, plus auditable balance adjustment logs.

---

## 8. Database Backup & Restore

All data is stored in the local SQLite database at `data/bot.sqlite`.

### Backup:
```bash
# Create an atomic backup copy
sqlite3 ./data/bot.sqlite ".backup './data/bot-backup-$(date +%F).sqlite'"
```

### Restore:
```bash
# Stop the bot first
pm2 stop telegram-gifts-bot

# Replace database file
cp ./data/bot-backup-2026-10-10.sqlite ./data/bot.sqlite

# Restart bot
pm2 start telegram-gifts-bot
```

---

## 9. Troubleshooting & FAQ

| Issue | Cause | Solution |
|---|---|---|
| `BOT_TOKEN is empty in .env` | Missing token in configuration | Add valid token from @BotFather to `.env` |
| `cannot verify user subscription` | Bot is not admin in the channel | Add the bot as an administrator in the sponsor channel with invite link permissions |
| `EADDRINUSE: 3000` | Port 3000 is occupied | Set `PORT=3001` or another free port in `.env`. The bot handles port collisions gracefully |
| `Payment amount mismatch` | Changed invoice payload amount | Pre-checkout automatically validates the exact amount matches the database invoice |
| `Gift delivery failed` | Recipient disabled gifts or privacy restriction | The gift is safely retained in the sender's inventory and queued in the admin panel for retry |

---

## 10. License

MIT
