const { getDatabase } = require('../db/database');
const logger = require('../utils/logger');

const supportService = {
  createTicket(userId, username, message, db = getDatabase()) {
    const now = new Date().toISOString();
    const res = db.run(
      `INSERT INTO support_tickets (user_id, username, message, status, created_at)
       VALUES (?, ?, ?, 'open', ?)`,
      [userId, username || null, message, now]
    );

    return {
      ticketId: res.lastInsertRowid,
      userId,
      message
    };
  },

  getOpenTickets(db = getDatabase()) {
    return db.query(
      `SELECT t.*, u.first_name 
       FROM support_tickets t 
       JOIN users u ON t.user_id = u.id 
       WHERE t.status IN ('open', 'in_progress') 
       ORDER BY t.id ASC`
    );
  },

  getTicket(id, db = getDatabase()) {
    return db.get(`SELECT * FROM support_tickets WHERE id = ?`, [id]);
  },

  replyToTicket(ticketId, adminId, replyText, db = getDatabase()) {
    const now = new Date().toISOString();
    db.run(
      `UPDATE support_tickets 
       SET reply = ?, status = 'resolved', assigned_to = ?, resolved_at = ? 
       WHERE id = ?`,
      [replyText, adminId, now, ticketId]
    );

    db.run(
      `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details, created_at)
       VALUES (?, 'reply_support_ticket', 'support_ticket', ?, ?, ?)`,
      [adminId, String(ticketId), JSON.stringify({ replyLength: replyText.length }), now]
    );

    return this.getTicket(ticketId, db);
  }
};

module.exports = supportService;
