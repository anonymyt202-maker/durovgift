const http = require('http');
const config = require('./src/config');
const logger = require('./src/utils/logger');
const { getDatabase } = require('./src/db/database');
const { runMigrations } = require('./src/db/migrations');
const { createBot } = require('./src/bot/bot');

logger.info('=============================================');
logger.info('       Telegram Gifts Bot Starting...        ');
logger.info('=============================================');

// 1. Initialize SQLite database and run migrations
let db;
try {
  db = getDatabase();
  runMigrations(db);
  logger.info('Database initialized and verified successfully.');
} catch (err) {
  logger.error('Failed to initialize database:', err);
  process.exit(1);
}

// 2. Initialize and launch Telegraf bot
let botInstance = null;
let botUsername = 'not_configured';

if (config.botToken && config.botToken !== 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
  try {
    botInstance = createBot(config.botToken);
    if (botInstance) {
      botInstance
        .launch({ dropPendingUpdates: false })
        .then(() => {
          botUsername = botInstance.botInfo?.username || 'online';
          logger.info(`Bot launched successfully! Polling as @${botUsername}`);
        })
        .catch((err) => {
          logger.error('Failed to start Telegram polling:', err.message);
          logger.warn('Check your BOT_TOKEN and internet connection.');
        });
    }
  } catch (err) {
    logger.error('Error instantiating bot:', err.message);
  }
} else {
  logger.warn('----------------------------------------------------');
  logger.warn('BOT_TOKEN is empty in .env! Telegram bot polling paused.');
  logger.warn('To connect your bot:');
  logger.warn('1. Create a bot using @BotFather in Telegram');
  logger.warn('2. Put your token in .env: BOT_TOKEN=123456:ABC-DEF...');
  logger.warn('3. Restart the application');
  logger.warn('----------------------------------------------------');
}

// 3. Lightweight HTTP server for container / PM2 health checks
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    const status = {
      status: 'ok',
      service: 'Telegram Gifts Bot',
      botActive: !!botInstance,
      botUsername,
      database: 'connected',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.warn(`Port ${config.port} is already in use. HTTP monitoring server not bound (Telegram bot operates independently).`);
  } else {
    logger.error('HTTP server error:', err.message);
  }
});

server.listen(config.port, '0.0.0.0', () => {
  logger.info(`Health check & monitoring server listening on port ${config.port}`);
});

// 4. Graceful shutdown
function shutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    logger.info('HTTP server closed.');
  });
  if (botInstance) {
    try {
      botInstance.stop(signal);
      logger.info('Telegram bot polling stopped.');
    } catch (e) {}
  }
  if (db) {
    try {
      db.close();
      logger.info('Database connection closed.');
    } catch (e) {}
  }
  setTimeout(() => process.exit(0), 1000);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
