import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const owner = '00000000-0000-0000-0000-000000000001';
const staff = '00000000-0000-0000-0000-000000000002';
const admin = '00000000-0000-0000-0000-000000000003';
const inactive = '00000000-0000-0000-0000-000000000004';
const unconfirmed = '00000000-0000-0000-0000-000000000005';

test('dashboard analytics in isolated PostgreSQL', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(read('./fixtures/admin.sql'));
  await db.exec(`
    ALTER TABLE products ADD COLUMN created_at timestamptz DEFAULT now() - interval '100 days';
    ALTER TABLE product_versions ADD COLUMN created_at timestamptz DEFAULT now() - interval '100 days';
    ALTER TABLE product_version_sizes ADD COLUMN created_at timestamptz DEFAULT now() - interval '100 days';
    ALTER TABLE orders ADD COLUMN created_at timestamptz DEFAULT now(),
      ADD COLUMN total numeric, ADD COLUMN delivery_fee numeric, ADD COLUMN discount_amount numeric;
    ALTER TABLE order_items ADD COLUMN image text, ADD COLUMN price numeric;
    ALTER TABLE store_admins ADD COLUMN role text DEFAULT 'owner';
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email_confirmed_at timestamptz);
    INSERT INTO auth.users VALUES ('${owner}', now()), ('${staff}', now()), ('${admin}', now()), ('${inactive}', now()), ('${unconfirmed}', null);
    INSERT INTO store_admins VALUES ('${staff}', true, 'staff'), ('${admin}', true, 'admin'), ('${inactive}', false, 'admin'), ('${unconfirmed}', true, 'admin');
  `);
  const roles = read('../supabase/migrations/20261028060247_multi_user_admin_onboarding.sql');
  await db.exec(roles.slice(roles.indexOf('CREATE OR REPLACE FUNCTION public.get_store_admin_role'), roles.indexOf('CREATE OR REPLACE FUNCTION public.staff_inventory')));
  await db.exec(read('../supabase/migrations/20261115075632_admin_performance_dashboard.sql'));

  const login = async (role, sub, aal) => {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({sub, aal})]);
    await db.exec(`SET ROLE ${role}`);
  };
  const analytics = (period = '30d', threshold = 3) => db.query('SELECT admin_dashboard_analytics($1,$2) AS result', [period, threshold])
    .then((result) => result.rows[0].result);

  await t.test('requires operations membership, confirmed email and MFA, validates parameters', async () => {
    await login('anon');
    await assert.rejects(analytics(), { code: '42501' });
    for (const [id, aal] of [[owner, 'aal1'], [staff, 'aal2'], [inactive, 'aal2'], [unconfirmed, 'aal2'], [crypto.randomUUID(), 'aal2']]) {
      await login('authenticated', id, aal);
      await assert.rejects(analytics(), { code: '42501' });
    }
    await login('authenticated', admin, 'aal2');
    await assert.doesNotReject(analytics());
    await login('authenticated', owner, 'aal2');
    for (const [period, threshold] of [['year', 3], [null, 3], ['all', null], ['all', 0], ['30d', 101]]) {
      await assert.rejects(analytics(period, threshold), { code: '22023' });
    }
  });

  await t.test('empty store returns zeros, a null AOV, no rows and explicit zero buckets', async () => {
    const result = await analytics();
    assert.deepEqual(result.current, { placed: 0, units: 0, revenue: 0, aov: null, shipping: 0, discounts: 0, collected_orders: 0, awaiting_action: 0, overdue: 0 });
    assert.equal(result.trend.length, 30);
    assert.ok(result.trend.every(point => point.revenue === 0 && point.placed === 0));
    assert.deepEqual([result.bestsellers, result.editions, result.sizes, result.recent], [[], [], [], []]);
    const all = await analytics('all');
    assert.equal(all.previous, null);
    assert.equal(all.range.start, all.range.end);
    assert.equal(all.stock.low + all.stock.out, 0);
  });

  await db.exec('RESET ROLE');
  await db.exec(read('./fixtures/admin-dashboard.sql'));
  await login('authenticated', owner, 'aal2');

  await t.test('correctly separates revenue, all orders, qualifying units, discounts and shipping', async () => {
    const result = await analytics();
    assert.deepEqual(result.current, { placed: 9, units: 9, revenue: 13250, aov: 4416.67, shipping: 1050, discounts: 600, collected_orders: 3, awaiting_action: 4, overdue: 3 });
    assert.deepEqual(result.previous, { placed: 1, units: 2, revenue: 4350, aov: 4350, shipping: 350, discounts: 0, collected_orders: 1, awaiting_action: 0, overdue: 0 });
    assert.deepEqual(result.orders, { pending: 3, confirmed: 1, shipped: 1, delivered: 3, cancelled: 1 });
    assert.deepEqual(result.payments, { paid: 2, pending: 2, awaiting_verification: 1, awaiting_payment: 1, failed: 1, refunded: 2 });
    assert.equal(result.bank_review, 1);
    assert.equal(result.trend.reduce((sum, row) => sum + row.revenue, 0), result.current.revenue);
    assert.equal(result.trend.reduce((sum, row) => sum + row.placed, 0), result.current.placed);
    assert.equal(result.recent.length, 5);
    assert.ok(result.recent.every(row => !('email' in row)));
  });

  await t.test('uses stable identities and saved values with renames, shared names and independent editions', async () => {
    const result = await analytics();
    assert.deepEqual(result.bestsellers.map(({product_id, name, units, value}) => [product_id,name,units,value]),
      [['test-product', 'Shibuya Incident', 6, 13900], ['noir', 'Shibuya Incident', 2, 5000], ['moon', 'Moon Knight', 1, 2900]]);
    assert.deepEqual(result.bestsellers[0].editions.map(x => [x.edition, x.units]), [['Cotton', 4], ['Jersey', 2]]);
    assert.deepEqual(result.sizes, [{ size: 'M', units: 6 }, { size: 'L', units: 2 }, { size: 'XL', units: 1 }]);
    assert.deepEqual(result.editions.map(x => x.units), [4, 2, 2, 1]);
  });

  await t.test('size rankings combine legacy display aliases without changing variant identities', async () => {
    await db.exec('RESET ROLE');
    await db.exec('BEGIN');
    try {
      await db.exec(`
        UPDATE order_items SET size = CASE WHEN sku.version_id = '00000000-0000-0000-0000-000000000020'
            THEN 'XXL' ELSE '2XL' END
        FROM product_version_sizes sku WHERE sku.id = order_items.version_size_id AND order_items.product_id = 'test-product';
      `);
      await login('authenticated', owner, 'aal2');
      const result = await analytics();
      assert.equal(result.sizes.find(row => row.size === '2XL').units, 6);
      assert.equal(result.bestsellers[0].editions.length, 2);
    } finally {
      await db.exec('ROLLBACK');
      await login('authenticated', owner, 'aal2');
    }
  });

  await t.test('combines stock and demand at the correct grain, excluding inactive editions and marking newer listings', async () => {
    const result = await analytics();
    assert.deepEqual([result.stock.out, result.stock.low, result.stock.products], [2, 2, 3]);
    assert.ok(result.stock.alerts.every(x => x.edition !== 'Discontinued'));
    const groups = (grain, category) => result.quiet.filter(x => x.grain === grain && x.classification === category);
    assert.deepEqual(groups('design', 'zero').map(x => [x.id,x.stock]), [['spider', 20], ['void', 0]]);
    assert.deepEqual(groups('design', 'low').map(x => x.id), ['moon']);
    assert.deepEqual(groups('design', 'new').map(x => x.id), ['new-drop']);
    assert.ok(groups('variant', 'zero').some(x => x.product === 'Shibuya Collection Tee' && x.edition === 'Cotton' && x.size === 'L'));
    assert.ok(!result.quiet.some(x => x.edition === 'Discontinued'));
    assert.equal((await analytics('90d')).quiet.some(x => x.grain === 'design' && x.id === 'noir' && x.classification === 'low'), true);
    assert.equal((await analytics('today')).quiet.some(x => x.grain === 'design' && x.id === 'noir' && x.classification === 'zero'), true);
  });

  await t.test('Colombo calendar starts and matching partial comparisons work across all ranges', async () => {
    const values = Object.fromEntries(await Promise.all(['today','7d','30d','90d','all'].map(async period => [period, await analytics(period)])));
    const day = (value) => Date.parse(value) / 86400000;
    for (const [period, days, bin] of [['today',1,'hour'],['7d',7,'day'],['30d',30,'day'],['90d',90,'week']]) {
      const {range} = values[period];
      assert.equal(day(range.end) - day(range.start), days - 1);
      assert.equal(day(range.start) - day(range.previous_start), days);
      assert.equal(day(range.end) - day(range.previous_end), days);
      assert.equal(range.bin, bin);
      assert.deepEqual(values[period].stock, values['30d'].stock);
    }
    assert.equal(values.today.current.placed, 2);
    assert.equal(values.today.previous.placed, 1);
    assert.equal(values['7d'].current.placed, 7);
    assert.equal(values['90d'].current.placed, 10);
    assert.equal(values.all.current.placed, 11);
    assert.equal(values.all.previous, null);
  });

  if (process.env.COMICCULTURE_DASHBOARD_FIXTURE) {
    await db.exec('RESET ROLE');
    await db.exec(read('./fixtures/admin-dashboard-preview.sql'));
    await login('authenticated', owner, 'aal2');
    const preview = Object.fromEntries(await Promise.all(['today','7d','30d','90d','all'].map(async period => [period, await analytics(period)])));
    writeFileSync(process.env.COMICCULTURE_DASHBOARD_FIXTURE, JSON.stringify(preview));
  }

  await t.test('larger datasets stay aggregated and output arrays stay bounded', async () => {
    const baseline = (await analytics()).current;
    await db.exec('RESET ROLE');
    await db.exec(`
      WITH inserted AS (
        INSERT INTO orders (created_at, order_reference, status, payment_status, payment_method, total)
        SELECT now() - interval '2 days' - (n % 20) * interval '1 day', 'bulk-' || n, 'delivered', 'paid', 'COD', 125
        FROM generate_series(1, 20000) n RETURNING id
      )
      INSERT INTO order_items (order_id, product_id, version_size_id, name, size, quantity, price)
      SELECT id, 'test-product', '00000000-0000-0000-0000-000000000030', 'Bulk test', 'M', 2, 62.5 FROM inserted;
    `);
    await login('authenticated', owner, 'aal2');
    const result = await analytics();
    assert.equal(result.current.placed, baseline.placed + 20000);
    assert.equal(result.current.units, baseline.units + 40000);
    assert.equal(result.trend.length, 30);
    assert.equal(result.recent.length, 5);
    assert.ok(result.quiet.length <= 60);
  });
});
