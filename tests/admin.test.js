const test = require('node:test');
const assert = require('node:assert');
const { createConnection } = require('../src/db/database');
const { runMigrations } = require('../src/db/migrations');
const { hasPermission, ROLES } = require('../src/admin/permissions');
const balanceService = require('../src/services/balanceService');

test('Admin Service: RBAC, permission enforcement, and audit logs', async (t) => {
  const db = createConnection(':memory:');
  runMigrations(db);

  // Setup admins with different roles
  // 5001: Finance admin
  // 5002: Moderator
  // 5003: Support
  // 5004: Regular user (not admin)
  const now = new Date().toISOString();
  db.run(`INSERT INTO admins (id, username, role, added_by, created_at) VALUES (5001, 'finance_adm', 'finance', 0, ?)`, [now]);
  db.run(`INSERT INTO admins (id, username, role, added_by, created_at) VALUES (5002, 'mod_adm', 'moderator', 0, ?)`, [now]);
  db.run(`INSERT INTO admins (id, username, role, added_by, created_at) VALUES (5003, 'sup_adm', 'support', 0, ?)`, [now]);
  balanceService.getOrCreateUser({ id: 5004, username: 'regular_user' }, null, db);

  await t.test('regular non-admin user is denied all admin actions', () => {
    assert.strictEqual(hasPermission(5004, 'VIEW_DASHBOARD', db), false);
    assert.strictEqual(hasPermission(5004, 'EDIT_BALANCE', db), false);
    assert.strictEqual(hasPermission(5004, 'MANAGE_CATALOG', db), false);
  });

  await t.test('finance admin can adjust balance and view payments, but cannot manage catalog', () => {
    assert.strictEqual(hasPermission(5001, 'EDIT_BALANCE', db), true);
    assert.strictEqual(hasPermission(5001, 'VIEW_PAYMENTS', db), true);
    assert.strictEqual(hasPermission(5001, 'MANAGE_CATALOG', db), false);
  });

  await t.test('moderator can manage catalog, referrals, and channels, but cannot edit balance', () => {
    assert.strictEqual(hasPermission(5002, 'MANAGE_CATALOG', db), true);
    assert.strictEqual(hasPermission(5002, 'MANAGE_REFERRALS', db), true);
    assert.strictEqual(hasPermission(5002, 'EDIT_BALANCE', db), false);
  });

  await t.test('support admin can manage tickets, but cannot edit balance or catalog', () => {
    assert.strictEqual(hasPermission(5003, 'MANAGE_TICKETS', db), true);
    assert.strictEqual(hasPermission(5003, 'EDIT_BALANCE', db), false);
    assert.strictEqual(hasPermission(5003, 'MANAGE_CATALOG', db), false);
  });

  await t.test('balance adjustment generates audit log with reason and admin ID', () => {
    const res = balanceService.adjustBalance(
      5004,
      50,
      'admin_adjustment',
      null,
      'Compensating user for manual gift delivery',
      5001,
      db
    );
    assert.strictEqual(res.newBalance, 50);

    const audit = db.get(
      `SELECT * FROM audit_logs WHERE admin_id = 5001 AND action = 'balance_adjustment'`
    );
    assert.ok(audit);
    assert.strictEqual(audit.target_id, '5004');
    assert.ok(audit.details.includes('Compensating user'));
  });

  db.close();
});
