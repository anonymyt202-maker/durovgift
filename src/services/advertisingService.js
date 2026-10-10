const { getDatabase } = require('../db/database');
const balanceService = require('./balanceService');
const logger = require('../utils/logger');

const advertisingService = {
  getPackages(onlyActive = true, db = getDatabase()) {
    if (onlyActive) {
      return db.query(`SELECT * FROM advertising_packages WHERE is_active = 1 ORDER BY price_stars ASC`);
    }
    return db.query(`SELECT * FROM advertising_packages ORDER BY price_stars ASC`);
  },

  getPackage(id, db = getDatabase()) {
    return db.get(`SELECT * FROM advertising_packages WHERE id = ?`, [id]);
  },

  createPackage(data, db = getDatabase()) {
    const now = new Date().toISOString();
    return db.run(
      `INSERT INTO advertising_packages (title_uz, title_ru, description_uz, description_ru, price_stars, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.title_uz,
        data.title_ru,
        data.description_uz || '',
        data.description_ru || '',
        Number(data.price_stars),
        data.is_active !== undefined ? Number(data.is_active) : 1,
        now
      ]
    );
  },

  updatePackage(id, data, db = getDatabase()) {
    return db.run(
      `UPDATE advertising_packages 
       SET title_uz = ?, title_ru = ?, description_uz = ?, description_ru = ?, price_stars = ?, is_active = ? 
       WHERE id = ?`,
      [
        data.title_uz,
        data.title_ru,
        data.description_uz || '',
        data.description_ru || '',
        Number(data.price_stars),
        Number(data.is_active),
        id
      ]
    );
  },

  createOrder({ userId, packageId, contentText, mediaFileId = null, mediaType = null }, db = getDatabase()) {
    const pkg = this.getPackage(packageId, db);
    if (!pkg) {
      throw new Error('Advertising package not found');
    }

    return db.transaction((txDb) => {
      const user = txDb.get(`SELECT balance FROM users WHERE id = ?`, [userId]);
      if (!user || user.balance < pkg.price_stars) {
        throw new Error('Insufficient balance to order this package');
      }

      balanceService.adjustBalance(
        userId,
        -pkg.price_stars,
        'ad_payment',
        `ad_pkg_${packageId}`,
        `Advertising package order: ${pkg.title_uz} (-${pkg.price_stars} Stars)`,
        null,
        txDb
      );

      const now = new Date().toISOString();
      const res = txDb.run(
        `INSERT INTO advertising_orders (user_id, package_id, content_text, media_file_id, media_type, price_stars, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [userId, packageId, contentText, mediaFileId, mediaType, pkg.price_stars, now, now]
      );

      return {
        orderId: res.lastInsertRowid,
        price: pkg.price_stars,
        pkg
      };
    });
  },

  getUserOrders(userId, db = getDatabase()) {
    return db.query(
      `SELECT o.*, p.title_uz, p.title_ru 
       FROM advertising_orders o 
       JOIN advertising_packages p ON o.package_id = p.id 
       WHERE o.user_id = ? 
       ORDER BY o.id DESC`,
      [userId]
    );
  },

  getPendingOrders(db = getDatabase()) {
    return db.query(
      `SELECT o.*, p.title_uz, p.title_ru, u.username, u.first_name 
       FROM advertising_orders o 
       JOIN advertising_packages p ON o.package_id = p.id 
       JOIN users u ON o.user_id = u.id 
       WHERE o.status = 'pending' 
       ORDER BY o.id ASC`
    );
  },

  updateOrderStatus(orderId, status, adminId = null, notes = '', db = getDatabase()) {
    const now = new Date().toISOString();
    db.run(
      `UPDATE advertising_orders 
       SET status = ?, admin_notes = ?, updated_at = ? 
       WHERE id = ?`,
      [status, notes, now, orderId]
    );

    if (adminId) {
      db.run(
        `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details, created_at)
         VALUES (?, 'update_ad_status', 'advertising_order', ?, ?, ?)`,
        [adminId, String(orderId), JSON.stringify({ status, notes }), now]
      );
    }
  }
};

module.exports = advertisingService;
