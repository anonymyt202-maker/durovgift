const { Telegraf } = require('telegraf');
const config = require('../config');
const logger = require('../utils/logger');
const { registerHandlers } = require('./registerHandlers');

function createBot(token = config.botToken) {
  if (!token) {
    logger.warn('BOT_TOKEN is not set in environment or configuration. Bot cannot launch Telegram polling without a token.');
    return null;
  }

  const bot = new Telegraf(token);

  // Global bot error handler
  bot.catch((err, ctx) => {
    logger.error(`Error in bot update [${ctx.updateType}]:`, err.message);
  });

  registerHandlers(bot);

  return bot;
}

module.exports = {
  createBot
};
