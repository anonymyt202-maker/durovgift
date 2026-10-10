const test = require('node:test');
const assert = require('node:assert');
const { createConnection } = require('../src/db/database');
const { runMigrations } = require('../src/db/migrations');
const balanceService = require('../src/services/balanceService');

test('Balance Service: User creation and atomic adjustments', async (t) => {
  const db = createConnection(':memory:');
  runMigrations(db);

  await t.test('creates user with initial zero balance', () => {
    const { user, isNew } = balanceService.getOrCreateUser(
      { id: 1001, username: 'testuser', first_name: 'Test' },
      null,
      db
    );
    assert.strictEqual(isNew, true);
    assert.strictEqual(user.id, 1001);
    assert.strictEqual(user.balance, 0);
  });

  await t.test('credits balance atomically and creates ledger transaction', () => {
    const res = balanceService.adjustBalance(1001, 100, 'deposit', 'test_dep_1', 'Test Deposit', null, db);
    assert.strictEqual(res.previousBalance, 0);
    assert.strictEqual(res.newBalance, 100);

    const user = balanceService.getUser(1001, db);
    assert.strictEqual(user.balance, 100);

    const txs = balanceService.getRecentTransactions(1001, 5, db);
    assert.strictEqual(txs.length, 1);
    assert.strictEqual(txs[0].amount, 100);
    assert.strictEqual(txs[0].balance_after, 100);
    assert.strictEqual(txs[0].type, 'deposit');
  });

  await t.test('debits balance accurately and updates ledger', () => {
    const res = balanceService.adjustBalance(1001, -35, 'gift_purchase', 'cat_1', 'Gift Purchase', null, db);
    assert.strictEqual(res.previousBalance, 100);
    assert.strictEqual(res.newBalance, 65);

    const user = balanceService.getUser(1001, db);
    assert.strictEqual(user.balance, 65);
  });

  await t.test('rejects overdraft (negative balance) and rolls back cleanly', () => {
    assert.throws(
      () => {
        balanceService.adjustBalance(1001, -100, 'overdraft_attempt', null, 'Should fail', null, db);
      },
      /Insufficient funds/
    );

    // Balance remains 65
    const user = balanceService.getUser(1001, db);
    assert.strictEqual(user.balance, 65);
  });

  await t.test('rejects non-integer / floating-point amounts', () => {
    assert.throws(
      () => {
        balanceService.adjustBalance(1001, 12.5, 'invalid_float', null, 'Float test', null, db);
      },
      /must be an integer/
    );
  });

  db.close();
});
