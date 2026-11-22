import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20261122061946_admin_restock_review.sql');
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('Restock Review RPC exposes only authorized read-only planning data', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(read('./fixtures/admin.sql'));
  await db.exec(`
    ALTER TABLE orders ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE order_items ADD COLUMN is_preorder boolean NOT NULL DEFAULT false;
    ALTER TABLE store_admins ADD COLUMN role text DEFAULT 'owner';
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email_confirmed_at timestamptz);
    INSERT INTO auth.users VALUES ('${id(1)}', now()), ('${id(2)}', now()), ('${id(3)}', now()), ('${id(4)}', now()), ('${id(5)}', null);
    INSERT INTO store_admins VALUES ('${id(2)}', true, 'staff'), ('${id(3)}', true, 'admin'),
      ('${id(4)}', false, 'admin'), ('${id(5)}', true, 'admin');
    UPDATE product_versions SET is_preorder=false;
  `);
  const roles = read('../supabase/migrations/20261028060247_multi_user_admin_onboarding.sql');
  await db.exec(roles.slice(roles.indexOf('CREATE OR REPLACE FUNCTION public.get_store_admin_role'), roles.indexOf('CREATE OR REPLACE FUNCTION public.staff_inventory')));
  await db.exec(read('./fixtures/restock-review-rls.sql'));
  await db.exec(migration);
  const authenticate = async (role, user, aal) => {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({sub: user, aal})]);
    if (role) await db.exec(`SET ROLE ${role}`);
  };
  const review = async () => (await db.query('SELECT public.admin_restock_review() AS report')).rows[0].report;

  await t.test('checks membership, confirmed email, MFA and execute privileges', async () => {
    await authenticate('anon');
    await assert.rejects(review(), { code: '42501' });
    await authenticate('service_role', id(1), 'aal2');
    await assert.rejects(review(), { code: '42501' });
    for (const [user, aal] of [[1, 'aal1'], [2, 'aal2'], [4, 'aal2'], [5, 'aal2'], [6, 'aal2']]) {
      await authenticate('authenticated', id(user), aal);
      await assert.rejects(review(), { code: '42501' });
    }
    for (const user of [1, 3]) {
      await authenticate('authenticated', id(user), 'aal2');
      assert.deepEqual((await review()).candidates, []);
    }
  });

  await t.test('uses stock thresholds, order states, exact Colombo cutoff, edition-size identity and stable ranking', async () => {
    await authenticate(null);
    const addSize = (num, edition, label, stock) => db.query(
      'INSERT INTO product_version_sizes VALUES ($1,$2,$3,$4,100,$5)', [id(num), id(edition), label, `TEST-${num}`, stock]);
    await db.exec(`
      INSERT INTO product_versions(id, product_id, version_name, is_active, is_preorder) VALUES
        ('${id(22)}','test-product','Preorder',true,true),
        ('${id(23)}','test-product','Inactive',false,false);
      INSERT INTO products(id,name,slug) VALUES ('second','Test product','second');
      INSERT INTO product_versions(id,product_id,version_name,is_active,is_preorder)
        VALUES ('${id(24)}','second','Cotton',true,false);
      UPDATE product_version_sizes SET stock=1, sku='RENAMED-SKU' WHERE id='${id(30)}';
    `);
    for (const size of [[31,20,'L',0],[32,20,'S',3],[33,21,'M',0],[34,22,'M',0],
      [35,23,'M',0],[36,20,'XL',4],[37,21,'S',0],[38,24,'S',3]]) await addSize(...size);
    const { now } = (await db.query('SELECT statement_timestamp() AS now')).rows[0];
    const colomboDate = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Colombo'}).format(new Date(now));
    const midnight = new Date(`${colomboDate}T00:00:00+05:30`);
    const cutoff = new Date(midnight.getTime() - 89 * 86_400_000).toISOString();
    const addOrder = async (num, status, payment, date, ...items) => {
      await db.query('INSERT INTO orders(id,status,payment_status,created_at) VALUES ($1,$2,$3,$4)', [id(num), status, payment, date]);
      for (const [size, units = 1, preorder = false] of items) {
        await db.query('INSERT INTO order_items(order_id,version_size_id,quantity,is_preorder) VALUES ($1,$2,$3,$4)', [id(num), size === null ? null : id(size), units, preorder]);
      }
    };
    await addOrder(50, 'pending', 'pending', cutoff, [30, 3, true], [30, 2, true], [31], [36], [null], [34], [35]);
    await addOrder(51, 'pending', 'awaiting_verification', now, [30], [31], [33]);
    await addOrder(52, 'cancelled', 'paid', cutoff, [32]);
    await addOrder(53, 'delivered', 'failed', cutoff, [32]);
    await addOrder(54, 'delivered', 'refunded', cutoff, [33]);
    await addOrder(55, 'delivered', 'paid', new Date(new Date(cutoff).getTime() - 1).toISOString(), [32]);
    await addOrder(56, 'delivered', 'paid', '2099-01-01T00:00:00Z', [32]);

    const snapshot = async () => (await db.query(`SELECT jsonb_build_array(
      (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM product_version_sizes s),
      (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM orders o),
      (SELECT jsonb_agg(to_jsonb(i) ORDER BY order_id, version_size_id, quantity) FROM order_items i),
      (SELECT count(*) FROM inventory_movements)
    ) AS state`)).rows[0].state;
    const before = await snapshot();
    await authenticate('authenticated', id(1), 'aal2');
    const report = await review();
    assert.deepEqual(Object.keys(report).sort(), ['as_of','candidates','starts_at']);
    const asOf = new Date(report.as_of);
    assert.ok(Number.isFinite(asOf.getTime()) && asOf > new Date(cutoff));
    assert.equal(new Date(report.starts_at).toISOString(), cutoff);
    const candidates = [[31,0,2],[30,1,2],[33,0,1],[37,0,0],[32,3,0],[38,3,0]];
    assert.deepEqual(report.candidates.map(({edition_size_id,stock,order_count}) => [edition_size_id,stock,order_count]),
      candidates.map(([size,stock,count]) => [id(size),stock,count]));
    assert.deepEqual(report.candidates[1], {edition_size_id:id(30),product:'Test product',edition:'Cotton',size:'M',sku:'RENAMED-SKU',stock:1,order_count:2});
    assert.deepEqual((await review()).candidates, report.candidates);
    await authenticate(null);
    assert.deepEqual(await snapshot(), before);
    await db.exec("UPDATE product_versions SET version_name='Updated edition' WHERE version_name='Cotton' AND product_id='test-product'");
    await authenticate('authenticated', id(1), 'aal2');
    assert.deepEqual((await review()).candidates.find((size) => size.edition_size_id === id(30)), {
      ...report.candidates[1], edition:'Updated edition',
    });
  });
});
