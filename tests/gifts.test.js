const test = require('node:test');
const assert = require('node:assert');
const { createConnection } = require('../src/db/database');
const { runMigrations } = require('../src/db/migrations');
const balanceService = require('../src/services/balanceService');
const giftService = require('../src/services/giftService');

test('Gift Service: Catalog, purchases, claim tokens, and failure handling', async (t) => {
  const db = createConnection(':memory:');
  runMigrations(db);

  balanceService.getOrCreateUser({ id: 3001, username: 'buyer', first_name: 'Buyer' }, null, db);
  balanceService.getOrCreateUser({ id: 3002, username: 'friend', first_name: 'Friend' }, null, db);
  balanceService.getOrCreateUser({ id: 3003, username: 'wronguser', first_name: 'Stranger' }, null, db);

  // Credit buyer with 200 Stars
  balanceService.adjustBalance(3001, 200, 'deposit', null, 'Seed funds', null, db);

  const catalog = giftService.getCatalog(true, db);
  assert.ok(catalog.length >= 1);
  const gift = catalog[0]; // Cake (15 Stars)

  let claimTokenRaw;
  let orderIdClaim;

  await t.test('purchases gift via claim deep link for an unverified recipient', async () => {
    const res = await giftService.purchaseGift({
      senderId: 3001,
      catalogId: gift.id,
      deliveryType: 'claim_link',
      recipientUsername: 'friend',
      db
    });

    assert.strictEqual(res.status, 'claim_link_created');
    assert.ok(res.rawToken);
    claimTokenRaw = res.rawToken;
    orderIdClaim = res.orderId;

    // Buyer balance deducted
    const buyer = balanceService.getUser(3001, db);
    assert.strictEqual(buyer.balance, 200 - gift.stars_price);
  });

  await t.test('rejects claiming token if recipient username does not match intended recipient', async () => {
    const claimRes = await giftService.claimGiftToken(
      claimTokenRaw,
      { id: 3003, username: 'wronguser' },
      null,
      db
    );
    assert.strictEqual(claimRes.ok, false);
    assert.strictEqual(claimRes.error, 'username_mismatch');
  });

  await t.test('allows intended recipient to claim token once', async () => {
    const claimRes = await giftService.claimGiftToken(
      claimTokenRaw,
      { id: 3002, username: 'friend' },
      null,
      db
    );
    assert.strictEqual(claimRes.ok, true);
    assert.strictEqual(claimRes.orderId, orderIdClaim);

    const tokenRow = db.get(`SELECT is_claimed FROM gift_claim_tokens WHERE order_id = ?`, [orderIdClaim]);
    assert.strictEqual(tokenRow.is_claimed, 1);
  });

  await t.test('rejects duplicate claim on already-claimed token', async () => {
    const claimRes = await giftService.claimGiftToken(
      claimTokenRaw,
      { id: 3002, username: 'friend' },
      null,
      db
    );
    assert.strictEqual(claimRes.ok, false);
    assert.strictEqual(claimRes.error, 'already_claimed');
  });

  await t.test('handles failed gift delivery by retaining order in inventory with error log', async () => {
    // Mock bot that throws error on delivery
    const mockFailingBot = {
      telegram: {
        async callApi() {
          throw new Error('Telegram API error: USER_BLOCKED_GIFTS');
        }
      }
    };

    const res = await giftService.purchaseGift({
      senderId: 3001,
      catalogId: gift.id,
      deliveryType: 'self',
      bot: mockFailingBot,
      db
    });

    assert.strictEqual(res.status, 'inventory');
    assert.ok(res.error.includes('USER_BLOCKED_GIFTS'));

    // Check inventory holds the item
    const inv = giftService.getUserInventory(3001, db);
    assert.ok(inv.some((i) => i.id === res.orderId));
  });

  db.close();
});
