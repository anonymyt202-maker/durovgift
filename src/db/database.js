const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

let dbInstance = null;

function createConnection(dbPath = config.databasePath) {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  let db;
  try {
    const BetterSqlite3 = require('better-sqlite3');
    db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    logger.info('Connected to SQLite via better-sqlite3 at:', dbPath);
  } catch (err) {
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    logger.info('Connected to SQLite via node:sqlite at:', dbPath);
  }

  let txDepth = 0;

  const wrapper = {
    raw: db,
    exec(sql) {
      return db.exec(sql);
    },
    query(sql, params = []) {
      const stmt = db.prepare(sql);
      return stmt.all(...params);
    },
    get(sql, params = []) {
      const stmt = db.prepare(sql);
      const res = stmt.get(...params);
      return res || null;
    },
    run(sql, params = []) {
      const stmt = db.prepare(sql);
      return stmt.run(...params);
    },
    transaction(fn) {
      if (txDepth > 0) {
        // Already inside a transaction, run within existing transaction
        return fn(wrapper);
      }

      txDepth++;
      db.exec('BEGIN TRANSACTION');
      try {
        const result = fn(wrapper);
        db.exec('COMMIT');
        txDepth--;
        return result;
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch (_) {}
        txDepth--;
        throw err;
      }
    },
    close() {
      if (typeof db.close === 'function') {
        db.close();
      }
    }
  };

  return wrapper;
}

function getDatabase() {
  if (!dbInstance) {
    dbInstance = createConnection();
  }
  return dbInstance;
}

module.exports = {
  createConnection,
  getDatabase
};
