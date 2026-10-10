const path = require('path');
require('dotenv').config();

const parseAdminIds = (raw) => {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((id) => !Number.isNaN(id) && id > 0);
};

const config = {
  botToken: process.env.BOT_TOKEN || '',
  adminIds: parseAdminIds(process.env.ADMIN_IDS),
  databasePath: process.env.DATABASE_PATH
    ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
    : path.resolve(process.cwd(), 'data/bot.sqlite'),
  supportUsername: (process.env.SUPPORT_USERNAME || 'admin').replace(/^@/, ''),
  logLevel: process.env.LOG_LEVEL || 'info',
  port: Number(process.env.PORT) || 3000,
  defaultLanguage: 'uz',
  supportedLanguages: ['uz', 'ru']
};

module.exports = config;
