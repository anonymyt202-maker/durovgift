const { getDatabase } = require('../db/database');
const { generateSecureToken } = require('../utils/validation');
const balanceService = require('./balanceService');
const logger = require('../utils/logger');

const paymentService = {
  createDepositInvoice(userId, amountStars, db = getDatabase()) {
    const intAmount = Number(amountStars);
    if (!Number.isInteger(intAmount) || intAmount <= 0) {
      throw new Error('Invalid deposit amount');
    }

    const payload = `dep_${userId}_${intAmount}_${Date.now()}_${generateSecureToken(6)}`;
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO payments (user_id, amount_stars, invoice_payload, status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
      [userId, intAmount, payload, now, now]
    );

    return {
      payload,
      amountStars: intAmount
    };
  },

  validatePreCheckout(query, db = getDatabase()) {
    const payload = query.invoice_payload;
    const fromId = query.from.id;
    const totalAmount = query.total_amount; // in Stars, 1 XTR = 1 unit
    const currency = query.currency;

    if (currency !== 'XTR') {
      return { ok: false, error: 'Currency must be XTR' };
    }

    const payment = db.get(
      `SELECT * FROM payments WHERE invoice_payload = ?`,
      [payload]
    );

    if (!payment) {
      return { ok: false, error: 'Payment invoice not found' };
    }

    if (payment.user_id !== fromId) {
      return { ok: false, error: 'Invoice user mismatch' };
    }

    if (payment.amount_stars !== totalAmount) {
      return { ok: false, error: 'Payment amount mismatch' };
    }

    if (payment.status === 'completed') {
      return { ok: false, error: 'Payment already processed' };
    }

    return { ok: true, payment };
  },

  processSuccessfulPayment(paymentData, db = getDatabase()) {
    const {
      from,
      currency,
      total_amount,
      invoice_payload,
      telegram_payment_charge_id,
      provider_payment_charge_id
    } = paymentData;

    if (currency !== 'XTR') {
      throw new Error(`Unsupported currency: ${currency}`);
    }

    const userId = Number(from.id);
    const amount = Number(total_amount);

    return db.transaction((txDb) => {
      // Check duplicate charge ID (idempotency)
      const existingCharge = txDb.get(
        `SELECT * FROM payments WHERE telegram_payment_charge_id = ?`,
        [telegram_payment_charge_id]
      );
      if (existingCharge && existingCharge.status === 'completed') {
        logger.warn(`Duplicate payment update ignored for charge: ${telegram_payment_charge_id}`);
        return {
          duplicate: true,
          payment: existingCharge,
          balance: txDb.get(`SELECT balance FROM users WHERE id = ?`, [userId])?.balance || 0
        };
      }

      // Find pending invoice
      let paymentRecord = txDb.get(
        `SELECT * FROM payments WHERE invoice_payload = ?`,
        [invoice_payload]
      );

      const now = new Date().toISOString();

      if (paymentRecord) {
        if (paymentRecord.status === 'completed') {
          return {
            duplicate: true,
            payment: paymentRecord,
            balance: txDb.get(`SELECT balance FROM users WHERE id = ?`, [userId])?.balance || 0
          };
        }

        txDb.run(
          `UPDATE payments 
           SET status = 'completed', 
               telegram_payment_charge_id = ?, 
               provider_payment_charge_id = ?, 
               updated_at = ? 
           WHERE id = ?`,
          [telegram_payment_charge_id, provider_payment_charge_id || '', now, paymentRecord.id]
        );
      } else {
        // Direct invoice fallback
        const ins = txDb.run(
          `INSERT INTO payments (user_id, amount_stars, invoice_payload, telegram_payment_charge_id, provider_payment_charge_id, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'completed', ?, ?)`,
          [userId, amount, invoice_payload, telegram_payment_charge_id, provider_payment_charge_id || '', now, now]
        );
        paymentRecord = { id: ins.lastInsertRowid, user_id: userId, amount_stars: amount };
      }

      // Credit internal balance
      const balanceResult = balanceService.adjustBalance(
        userId,
        amount,
        'deposit',
        telegram_payment_charge_id,
        `Telegram Stars payment (+${amount} XTR)`,
        null,
        txDb
      );

      return {
        duplicate: false,
        paymentId: paymentRecord.id,
        amount,
        newBalance: balanceResult.newBalance,
        chargeId: telegram_payment_charge_id
      };
    });
  },

  getPaymentHistory(userId = null, limit = 20, db = getDatabase()) {
    if (userId) {
      return db.query(
        `SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
        [userId, limit]
      );
    }
    return db.query(
      `SELECT p.*, u.username, u.first_name 
       FROM payments p 
       LEFT JOIN users u ON p.user_id = u.id 
       ORDER BY p.id DESC LIMIT ?`,
      [limit]
    );
  }
};

module.exports = paymentService;
