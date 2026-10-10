const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const currentLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const threshold = levels[currentLevel] !== undefined ? levels[currentLevel] : 2;

function sanitize(msg) {
  if (typeof msg === 'string') {
    return msg.replace(/bot\d+:[A-Za-z0-9_-]+/gi, 'bot[REDACTED]');
  }
  return msg;
}

const logger = {
  error(...args) {
    if (threshold >= levels.error) {
      console.error(new Date().toISOString(), '[ERROR]', ...args.map(sanitize));
    }
  },
  warn(...args) {
    if (threshold >= levels.warn) {
      console.warn(new Date().toISOString(), '[WARN]', ...args.map(sanitize));
    }
  },
  info(...args) {
    if (threshold >= levels.info) {
      console.log(new Date().toISOString(), '[INFO]', ...args.map(sanitize));
    }
  },
  debug(...args) {
    if (threshold >= levels.debug) {
      console.log(new Date().toISOString(), '[DEBUG]', ...args.map(sanitize));
    }
  }
};

module.exports = logger;
