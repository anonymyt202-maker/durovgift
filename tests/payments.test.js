const test = require('node:test');
const assert = require('node:assert');
const { createConnection } = require('../src/db/database');
const { runMigrations } = require('../src/db/migrations');
const balanceService = require('../src/services/balanceService');
const paymentService = require('../src/services/paymentService');

test('Payment Service: Telegram Stars invoices, pre-checkout validation, and idempotency', async (t) => {
  const db = createConnection(':memory:');
  runMigrations(db);

  balanceService.getOrCreateUser({ id: 2001, username: 'payer', first_name: 'Payer' }, null, db);

  let invoice;

  await t.test('creates deposit invoice with unique payload', () => {
    invoice = paymentService.createDepositInvoice(2001, 50, db);
    assert.strictEqual(invoice.amountStars, 50);
    assert.ok(invoice.payload.startsWith('dep_2001_50_'));

    const pending = db.get(`SELECT * FROM payments WHERE invoice_payload = ?`, [invoice.payload]);
    assert.ok(pending);
    assert.strictEqual(pending.status, 'pending');
    assert.strictEqual(pending.amount_stars, 50);
  });

  await t.test('pre-checkout query validates valid invoice', () => {
    const validQuery = {
      from: { id: 2001 },
      currency: 'XTR',
      total_amount: 50,
      invoice_payload: invoice.payload
    };
    const res = paymentService.validatePreCheckout(validQuery, db);
    assert.strictEqual(res.ok, true);
  });

  await t.test('pre-checkout query rejects amount mismatch or wrong user', () => {
    const wrongAmount = {
      from: { id: 2001 },
      currency: 'XTR',
      total_amount: 100,
      invoice_payload: invoice.payload
    };
    const resAmount = paymentService.validatePreCheckout(wrongAmount, db);
    assert.strictEqual(resAmount.ok, false);

    const wrongUser = {
      from: { id: 9999 },
      currency: 'XTR',
      total_amount: 50,
      invoice_payload: invoice.payload
    };
    const resUser = paymentService.validatePreCheckout(wrongUser, db);
    assert.strictEqual(resUser.ok, false);
  });

  await t.test('processes successful payment and credits balance', () => {
    const paymentData = {
      from: { id: 2001 },
      currency: 'XTR',
      total_amount: 50,
      invoice_payload: invoice.payload,
      telegram_payment_charge_id: 'ch_tg_test_123',
      provider_payment_charge_id: 'pr_test_123'
    };

    const res = paymentService.processSuccessfulPayment(paymentData, db);
    assert.strictEqual(res.duplicate, false);
    assert.strictEqual(res.amount, 50);
    assert.strictEqual(res.newBalance, 50);

    const user = balanceService.getUser(2001, db);
    assert.strictEqual(user.balance, 50);

    const paymentRecord = db.get(`SELECT * FROM payments WHERE telegram_payment_charge_id = ?`, ['ch_tg_test_123']);
    assert.strictEqual(paymentRecord.status, 'completed');
  });

  await t.test('idempotency: duplicate payment callback is ignored and does NOT double-credit balance', () => {
    const duplicateData = {
      from: { id: 2001 },
      currency: 'XTR',
      total_amount: 50,
      invoice_payload: invoice.payload,
      telegram_payment_charge_id: 'ch_tg_test_123', // SAME CHARGE ID
      provider_payment_charge_id: 'pr_test_123'
    };

    const res = paymentService.processSuccessfulPayment(duplicateData, db);
    assert.strictEqual(res.duplicate, true);

    // Balance must STILL be 50, NOT 100!
    const user = balanceService.getUser(2001, db);
    assert.strictEqual(user.balance, 50);
  });

  db.close();
});
