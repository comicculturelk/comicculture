import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const admin = '00000000-0000-0000-0000-000000000001';
const formerAdmin = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b';
const versionId = '00000000-0000-0000-0000-000000000020';
const sizeId = '00000000-0000-0000-0000-000000000030';

test('admin safeguards in isolated PostgreSQL', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(read('./fixtures/admin.sql'));
  // Reproduce the actual legacy rules so the migration must remove the bypass.
  const legacy = read('../supabase/migrations/20261011050000_tune_review_and_promo_policies.sql');
  await db.exec(legacy.slice(legacy.indexOf('drop policy if exists "ComicCulture admin manages'), legacy.lastIndexOf('commit;')));
  await db.exec(read('../supabase/migrations/20261025124030_admin_audit_safety_fixes.sql'));
  const workflow = read('../supabase/migrations/20261011163006_admin_workflow_audit.sql');
  const transitionStart = workflow.indexOf('CREATE OR REPLACE FUNCTION public.admin_transition_order(');
  await db.exec(workflow.slice(transitionStart, workflow.indexOf('CREATE OR REPLACE FUNCTION public.admin_verify_order_payment', transitionStart)));
  const versionsMigration = read('../supabase/migrations/20260910044914_introduce_product_versions_and_sizes.sql');
  const restoreStart = versionsMigration.indexOf('CREATE OR REPLACE FUNCTION public.restore_stock_on_cancel()');
  const restoreEnd = versionsMigration.indexOf('-- get_order_tracking()', restoreStart);
  await db.exec(versionsMigration.slice(restoreStart, restoreEnd));
  const login = async (uid = admin, role = 'authenticated') => {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role, email: 'test@example.invalid' })]);
    await db.exec(`SET ROLE ${role}`);
  };
  const root = () => db.exec('RESET ROLE');
  const save = (versions = [], sizes = [], additions = []) => db.query(
    'SELECT public.save_admin_product(false,$1,$2,$3,$4,$5)',
    [{ id: 'test-product', name: 'Edited product', slug: 'test-product', collectionId: '00000000-0000-0000-0000-000000000010', images: [] }, versions, sizes, additions, []].map(JSON.stringify),
  );

  await t.test('public reads published reviews only; cannot write', async () => {
    await login(null, 'anon');
    assert.equal((await db.query('SELECT * FROM customer_reviews')).rows.length, 1);
    await assert.rejects(db.query("INSERT INTO customer_reviews(review_text,is_published) VALUES ('Denied',true)"), /permission denied/);
  });
  await t.test('active admin can manage private reviews; deactivation removes access', async () => {
    await login();
    assert.equal((await db.query('SELECT * FROM customer_reviews')).rows.length, 2);
    const result = await db.query("INSERT INTO customer_reviews(review_text,is_published) VALUES ('Draft',false) RETURNING id");
    await db.query('UPDATE customer_reviews SET review_text=$1 WHERE id=$2', ['Updated', result.rows[0].id]);
    await db.query('DELETE FROM customer_reviews WHERE id=$1', [result.rows[0].id]);
    await root();
    await db.query('UPDATE store_admins SET is_active=false WHERE user_id=$1', [admin]);
    await login();
    assert.equal((await db.query('SELECT * FROM customer_reviews')).rows.length, 1);
    await assert.rejects(db.query("INSERT INTO customer_reviews(review_text,is_published) VALUES ('Denied',true)"), /row-level security/);
    await root();
    await db.query('UPDATE store_admins SET is_active=true WHERE user_id=$1', [admin]);
  });
  await t.test('original fixed-account identity no longer bypasses membership', async () => {
    await login(formerAdmin);
    assert.equal((await db.query('SELECT * FROM customer_reviews')).rows.length, 1);
    assert.equal((await db.query("UPDATE customer_reviews SET review_text='Denied' RETURNING id")).rows.length, 0);
    assert.equal((await db.query('DELETE FROM customer_reviews RETURNING id')).rows.length, 0);
  });
  await t.test('stock remains 4 when a stale catalog save sends 5; activation saves', async () => {
    await login();
    await save([{ id: versionId, versionName: 'Cotton', productType: 'tshirt', isActive: false }], [{ id: sizeId, sku: 'TEST-M', price: 110, stock: 5 }]);
    await root();
    const row = (await db.query('SELECT stock,price FROM product_version_sizes WHERE id=$1', [sizeId])).rows[0];
    assert.equal(row.stock, 4);
    assert.equal(Number(row.price), 110);
    assert.equal((await db.query('SELECT is_active FROM product_versions WHERE id=$1', [versionId])).rows[0].is_active, false);
  });
  await t.test('opening stock on new sizes remains supported', async () => {
    await login();
    await save([], [], [{ versionId, size: 'L', sku: 'TEST-L', price: 100, stock: 7 }]);
    await root();
    assert.equal((await db.query("SELECT stock FROM product_version_sizes WHERE sku='TEST-L'")).rows[0].stock, 7);
  });
  await t.test('version name swaps work; invalid size rolls back the whole save', async () => {
    await login();
    await save([{ id: versionId, versionName: 'Jersey', productType: 'tshirt', isActive: true }, { id: '00000000-0000-0000-0000-000000000021', versionName: 'Cotton', productType: 'jersey', isActive: true }]);
    await assert.rejects(save([{ id: versionId, versionName: 'Broken', productType: 'tshirt' }], [{ id: sizeId, sku: 'TEST-M', price: -1 }]), /check constraint/);
    await root();
    assert.equal((await db.query('SELECT version_name FROM product_versions WHERE id=$1', [versionId])).rows[0].version_name, 'Jersey');
  });
  await t.test('non-admin cannot save catalog or consume codes; admin/service defaults work', async () => {
    await login(formerAdmin);
    await assert.rejects(save(), /Not authorized/);
    await assert.rejects(db.query('SELECT next_product_code()'), /Admin access required/);
    await login();
    assert.match((await db.query('SELECT next_product_code() AS code')).rows[0].code, /^CC-P\d{6}$/);
    await login(null, 'service_role');
    assert.match((await db.query('SELECT next_product_code() AS code')).rows[0].code, /^CC-P\d{6}$/);
  });
  await t.test('used promo terms are immutable; redemption counts and activation still work', async () => {
    await root();
    await db.exec("INSERT INTO promo_codes(code,discount_type,discount_value,minimum_subtotal) VALUES ('TEST','percent',10,0)");
    await db.exec("UPDATE promo_codes SET discount_value=15 WHERE code='TEST'");
    await db.exec("UPDATE promo_codes SET usage_count=1 WHERE code='TEST'");
    for (const field of ["code='OTHER'", "discount_type='fixed'", 'discount_value=20', 'minimum_subtotal=100', 'max_redemptions=10', 'starts_at=now()', 'expires_at=now()']) {
      await assert.rejects(db.exec(`UPDATE promo_codes SET ${field} WHERE code='TEST'`), /Used promo terms are locked/);
    }
    await db.exec("UPDATE promo_codes SET usage_count=2,is_active=false WHERE code='TEST'");
    assert.equal((await db.query("SELECT usage_count FROM promo_codes WHERE code='TEST'")).rows[0].usage_count, 2);
  });
  await t.test('reopening payment requires admin, a reason, pending rejection, and existing proof', async () => {
    await root();
    const id = (await db.query("INSERT INTO orders(payment_method,payment_status,status,receipt_url) VALUES ('BANK_TRANSFER','failed','pending','synthetic-receipt') RETURNING id")).rows[0].id;
    await login(formerAdmin);
    await assert.rejects(db.query('SELECT admin_reopen_payment_review($1,$2)', [id, 'Reassess proof']), /Admin access/);
    await login();
    await assert.rejects(db.query('SELECT admin_reopen_payment_review($1,$2)', [id, '']), /Explain why/);
    await db.query('SELECT admin_reopen_payment_review($1,$2)', [id, 'Customer clarified existing proof']);
    await assert.rejects(db.query('SELECT admin_reopen_payment_review($1,$2)', [id, 'Repeat']), /Only a pending rejected/);
    await root();
    assert.equal((await db.query('SELECT payment_status FROM orders WHERE id=$1', [id])).rows[0].payment_status, 'awaiting_verification');
    assert.equal((await db.query("SELECT count(*)::int AS total FROM admin_activity_log WHERE event_type='order_payment_review_reopened'")).rows[0].total, 1);
    await db.query("UPDATE orders SET status='cancelled', payment_status='failed' WHERE id=$1", [id]);
    await login();
    await assert.rejects(db.query('SELECT admin_reopen_payment_review($1,$2)', [id, 'Closed order']), /Only a pending rejected/);
  });
  await t.test('reopened proof follows normal verification and cannot be verified twice', async () => {
    await root();
    const id = (await db.query("INSERT INTO orders(payment_method,payment_status,status,receipt_url) VALUES ('BANK_TRANSFER','failed','pending','synthetic-proof') RETURNING id")).rows[0].id;
    await login();
    await db.query('SELECT admin_reopen_payment_review($1,$2)', [id, 'Corrected information']);
    await assert.rejects(db.query('SELECT admin_verify_order_payment($1,$2,$3)', [id, 'failed', '']), /rejection reason/);
    await assert.rejects(db.query('SELECT admin_verify_order_payment($1,$2,$3)', [id, null, null]), /Invalid payment/);
    await db.query('SELECT admin_verify_order_payment($1,$2,$3)', [id, 'paid', null]);
    await assert.rejects(db.query('SELECT admin_verify_order_payment($1,$2,$3)', [id, 'paid', null]), /not awaiting/);
    await root();
    const order = (await db.query('SELECT payment_status,status FROM orders WHERE id=$1', [id])).rows[0];
    assert.deepEqual(order, { payment_status: 'paid', status: 'confirmed' });
  });
  await t.test('cancellation restores inventory exactly once and requires completed refund for paid orders', async () => {
    await root();
    const id = (await db.query("INSERT INTO orders(payment_method,payment_status,status,order_reference) VALUES ('COD','pending','packed','TEST-CANCEL') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO order_items VALUES ($1,'test-product',$2,'Test product','M',2)", [id, sizeId]);
    const before = (await db.query('SELECT stock FROM product_version_sizes WHERE id=$1', [sizeId])).rows[0].stock;
    await login();
    await assert.rejects(db.query('SELECT admin_transition_order($1,$2)', [id, 'cancelled']), /cancellation reason/);
    await db.query('SELECT admin_transition_order($1,$2,$3)', [id, 'cancelled', 'Synthetic test cancellation']);
    await db.query('SELECT admin_transition_order($1,$2,$3)', [id, 'cancelled', 'Repeated request']);
    await root();
    assert.equal((await db.query('SELECT stock FROM product_version_sizes WHERE id=$1', [sizeId])).rows[0].stock, before + 2);
    assert.equal((await db.query("SELECT count(*)::int AS total FROM inventory_movements WHERE reason='TEST-CANCEL'")).rows[0].total, 1);
    const paid = (await db.query("INSERT INTO orders(payment_method,payment_status,status) VALUES ('BANK_TRANSFER','paid','confirmed') RETURNING id")).rows[0].id;
    await login();
    await assert.rejects(db.query('SELECT admin_transition_order($1,$2,$3)', [paid, 'cancelled', 'Cancel paid order']), /completed refund/);
    await db.query('SELECT admin_transition_order($1,$2,$3,$4,$5)', [paid, 'cancelled', 'Completed refund', true, 'SYNTHETIC-REFUND']);
  });
  await t.test('notification API denies non-admins and returns no tokens', async () => {
    await login(formerAdmin);
    await assert.rejects(db.query("SELECT * FROM admin_order_notification_status('{}')"), /Admin access/);
    await root();
    const id = (await db.query('SELECT id FROM orders LIMIT 1')).rows[0].id;
    await db.query('INSERT INTO order_notification_state(order_id,sent_at,notification_token) VALUES ($1,now(),gen_random_uuid())', [id]);
    await login();
    const result = await db.query('SELECT * FROM admin_order_notification_status($1)', [[id]]);
    assert.deepEqual(Object.keys(result.rows[0]).sort(), ['order_id', 'sent_at']);
  });
});
