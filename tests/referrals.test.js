const test = require('node:test');
const assert = require('node:assert');
const { createConnection } = require('../src/db/database');
const { runMigrations } = require('../src/db/migrations');
const balanceService = require('../src/services/balanceService');
const referralService = require('../src/services/referralService');

test('Referral Service: Uniqueness, sponsor channel verification, and reward requests', async (t) => {
  const db = createConnection(':memory:');
  runMigrations(db);

  // Configure referral target to 2 for testing
  db.run(`UPDATE bot_settings SET value = '2' WHERE key = 'referral_target'`);
  db.run(`UPDATE bot_settings SET value = '20' WHERE key = 'referral_reward_amount'`);

  // Referrer
  balanceService.getOrCreateUser({ id: 4001, username: 'referrer', first_name: 'Ref' }, null, db);

  await t.test('tracks unique referrals and ignores self-referral', () => {
    // Self-referral attempt
    balanceService.getOrCreateUser({ id: 4001, username: 'referrer' }, 4001, db);
    const selfRef = db.get(`SELECT * FROM referrals WHERE referrer_id = 4001 AND referred_id = 4001`);
    assert.strictEqual(selfRef, null);

    // Genuine referral 1
    balanceService.getOrCreateUser({ id: 4002, username: 'user1' }, 4001, db);
    // Genuine referral 2
    balanceService.getOrCreateUser({ id: 4003, username: 'user2' }, 4001, db);

    // Re-registering user1 with same or different referrer should NOT duplicate referral
    balanceService.getOrCreateUser({ id: 4002, username: 'user1' }, 4001, db);

    const count = db.get(`SELECT COUNT(*) as c FROM referrals WHERE referrer_id = 4001`);
    assert.strictEqual(count.c, 2);
  });

  await t.test('updates verification state when user confirms sponsor channel membership', () => {
    let stats = referralService.getReferralStats(4001, db);
    assert.strictEqual(stats.total, 2);
    assert.strictEqual(stats.verified, 0);

    referralService.markReferredVerified(4002, db);
    referralService.markReferredVerified(4003, db);

    stats = referralService.getReferralStats(4001, db);
    assert.strictEqual(stats.verified, 2);
    assert.strictEqual(stats.pending, 0);
  });

  let requestId;

  await t.test('creates reward request when threshold reached and prevents duplicate request', () => {
    const reqRes = referralService.createRewardRequest(4001, db);
    assert.ok(reqRes.requestId);
    assert.strictEqual(reqRes.amount, 20);
    requestId = reqRes.requestId;

    assert.throws(
      () => {
        referralService.createRewardRequest(4001, db);
      },
      /already have a pending/
    );
  });

  await t.test('admin approves reward request and credits Stars balance', () => {
    const appRes = referralService.approveRewardRequest(requestId, 99999, db);
    assert.strictEqual(appRes.ok, true);
    assert.strictEqual(appRes.amount, 20);

    const referrer = balanceService.getUser(4001, db);
    assert.strictEqual(referrer.balance, 20);

    const audit = db.get(`SELECT * FROM audit_logs WHERE action = 'approve_referral_reward'`);
    assert.ok(audit);
    assert.strictEqual(audit.admin_id, 99999);
  });

  db.close();
});
